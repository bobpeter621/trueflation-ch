/**
 * trueflation.ch — Fehlerresilienz-Wrapper (US 1.4, US 1.16)
 *
 * Kapselt einen Quellen-Abruf mit:
 *   - Exponentiellem Backoff, max. 3 Versuche (US 1.4, US 1.16)
 *   - Retry-Zählung GETRENNT vom Tagesbudget (Betreiber-Korrektur 25.08.2026,
 *     siehe config/sources.json → checkBudget._comment)
 *   - Telegram-Eskalation nach 3 aufeinanderfolgenden Fehlversuchen (US 1.4-AC)
 *   - Fallback auf zuletzt bekannte valide Daten bei endgültigem Scheitern,
 *     mit "veraltet"-Kennzeichnung statt Absturz
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execSync, execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STATUS_DIR = path.join(REPO_ROOT, 'data', '_pipeline-status');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusFilePath(sourceKey) {
  return path.join(STATUS_DIR, `${sourceKey}.status.json`);
}

function loadStatus(sourceKey) {
  const filePath = getStatusFilePath(sourceKey);
  if (!existsSync(filePath)) {
    return { sourceKey, consecutiveFailures: 0, lastSuccessAt: null, lastFailureAt: null, isStale: false };
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function saveStatus(sourceKey, status) {
  if (!existsSync(STATUS_DIR)) {
    execSync(`mkdir -p "${STATUS_DIR}"`);
  }
  writeFileSync(getStatusFilePath(sourceKey), JSON.stringify(status, null, 2) + '\n');
}

/**
 * Sendet eine Telegram-Eskalation über das bestehende Skript (US 5.3 — nutzt
 * bestehende Notification-Infrastruktur, keine neue). Optional deaktivierbar
 * für Tests via notifyFn-Override.
 */
/**
 * SECURITY-FIX (Security-Review Durchgang 1/3, 28.08.2026, Finding F1,
 * gleiches Muster wie lib/plausibility-check.mjs behoben): execFileSync
 * statt execSync mit String-Interpolation — verhindert Command Substitution
 * (`$(...)`/Backticks) innerhalb der Message, falls diese je Werte aus
 * externen Quellen transportiert.
 */
function defaultNotify(message) {
  try {
    execFileSync('bash', [path.join(REPO_ROOT, 'scripts', 'notify-telegram.sh'), message], {
      stdio: 'pipe',
    });
    return true;
  } catch (err) {
    console.error(`[notify] Telegram-Versand fehlgeschlagen: ${err.message}`);
    return false;
  }
}

/**
 * Führt einen Fetch mit Resilienz-Logik aus.
 *
 * @param {string} sourceKey - Eindeutiger Schlüssel der Quelle (z.B. "lik")
 * @param {() => Promise<any>} fetchFn - Die eigentliche Abruf-Funktion
 * @param {object} options
 * @param {number} [options.maxRetries=3] - Max. Versuche (US 1.4)
 * @param {number} [options.escalationThreshold=3] - Nach wie vielen AUFEINANDERFOLGENDEN
 *   Fehlversuchen (über mehrere Läufe hinweg) eskaliert wird (US 1.4-AC)
 * @param {(msg: string) => boolean} [options.notifyFn] - Override für Tests
 * @returns {Promise<{success: boolean, data: any|null, status: object}>}
 */
export async function fetchWithResilience(sourceKey, fetchFn, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const escalationThreshold = options.escalationThreshold ?? 3;
  const notifyFn = options.notifyFn ?? defaultNotify;

  const status = loadStatus(sourceKey);
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await fetchFn();
      // Erfolg: Fehler-Zähler zurücksetzen, kein "veraltet"-Zustand mehr
      status.consecutiveFailures = 0;
      status.lastSuccessAt = new Date().toISOString();
      status.isStale = false;
      saveStatus(sourceKey, status);
      console.log(`[resilience/${sourceKey}] Erfolgreich bei Versuch ${attempt}/${maxRetries}.`);
      return { success: true, data, status };
    } catch (err) {
      lastError = err;
      console.warn(`[resilience/${sourceKey}] Versuch ${attempt}/${maxRetries} fehlgeschlagen: ${err.message}`);
      if (attempt < maxRetries) {
        const backoffMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s ...
        console.log(`[resilience/${sourceKey}] Exponentielles Backoff: warte ${backoffMs}ms vor nächstem Versuch.`);
        await sleep(backoffMs);
      }
    }
  }

  // Alle Versuche fehlgeschlagen — Fallback auf zuletzt bekannte Daten (US 1.4)
  status.consecutiveFailures += 1;
  status.lastFailureAt = new Date().toISOString();
  status.isStale = true;
  status.lastError = lastError?.message ?? 'unbekannter Fehler';

  console.error(
    `[resilience/${sourceKey}] ALLE ${maxRetries} Versuche fehlgeschlagen. ` +
    `Konsekutive Fehlläufe (über Läufe hinweg): ${status.consecutiveFailures}. ` +
    `Letzte bekannte Daten bleiben erhalten, 'veraltet'-Kennzeichnung gesetzt.`
  );

  if (status.consecutiveFailures >= escalationThreshold) {
    const message =
      `⚠️ Pipeline-Ausfall: Quelle '${sourceKey}' seit ${status.consecutiveFailures} aufeinanderfolgenden ` +
      `Läufen nicht erreichbar. Letzter Fehler: ${status.lastError}. Letzter Erfolg: ${status.lastSuccessAt ?? 'nie'}.`;
    const sent = notifyFn(message);
    status.escalationSentAt = sent ? new Date().toISOString() : status.escalationSentAt;
    console.log(`[resilience/${sourceKey}] Eskalationsschwelle (${escalationThreshold}) erreicht — Telegram-Benachrichtigung ${sent ? 'gesendet' : 'FEHLGESCHLAGEN'}.`);
  }

  saveStatus(sourceKey, status);
  return { success: false, data: null, status };
}

export function getSourceStatus(sourceKey) {
  return loadStatus(sourceKey);
}
