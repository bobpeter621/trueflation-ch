/**
 * trueflation.ch — Plausi-Eskalations-Zustandspersistenz (US 1.7, Fix 2)
 *
 * FUND (Betreiber, 28.08.2026): Ohne Zustandspersistenz erzeugt jeder
 * Pipeline-Lauf, der auf einen bereits gemeldeten, noch unentschiedenen
 * Wert trifft, ERNEUT eine Eskalation — bei täglichem Scheduler wäre das
 * täglich dieselbe Meldung, bis jemand entscheidet. US 1.7 nennt den
 * Gewöhnungseffekt ausdrücklich als Grund, warum das den Schutzmechanismus
 * entwertet.
 *
 * LÖSUNG: Pro Quelle+Datenpunkt (sourceKey) einen Zustand persistieren,
 * analog zu data/_pipeline-status/ (bereits für den Fehlerzähler in
 * fetch-with-resilience.mjs genutztes Muster) — eigenes Unterverzeichnis
 * `plausi-pending/`, damit die beiden Mechanismen sich nicht überschreiben:
 *
 *   pending  -> bereits gemeldet, WERT UNVERÄNDERT -> NICHT erneut melden,
 *               egal wie oft die Pipeline läuft.
 *   (kein Zustand) -> WERT HAT SICH GEÄNDERT ggü. dem zuletzt gemeldeten
 *               Pending-Wert, ODER erste Meldung -> melden, Zustand setzen.
 *
 * WICHTIG (Fix 3 noch offen, siehe Betreiber-Direktive 28.08.2026): Die
 * Übergänge pending -> approved/rejected (und das Löschen des Zustands bei
 * Freigabe/Verwerfung) hängen von der Klärung des Rückkanals ab (kann die
 * bestehende Telegram-Infrastruktur eingehende Antworten lesen, oder ist
 * sie nur Sende-Kanal?). Dieses Modul liefert bereits die Funktionen
 * `resolvePendingState()`/`clearPendingState()` für den späteren Einbau,
 * ruft sie aber NIRGENDS automatisch auf — das wäre Bauen vor Klären.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Eigenes Unterverzeichnis, getrennt von den Resilienz-Statusdateien
 * (fetch-with-resilience.mjs schreibt direkt unter data/_pipeline-status/). */
export const DEFAULT_PLAUSI_STATE_DIR = path.join(REPO_ROOT, 'data', '_pipeline-status', 'plausi-pending');

/** sourceKey kann Freitext-Zeichen enthalten (Slashes, Klammern, Leerzeichen
 * aus Testbeschriftungen) — auf einen sicheren Dateinamen abbilden. Bewusst
 * NICHT hashen (statt Klartext-Sanitizing), damit der Zustand bei Bedarf
 * manuell inspizierbar bleibt (Transparenz-Prinzip des Projekts). */
function sanitizeKey(sourceKey) {
  return sourceKey.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
}

function statePath(sourceKey, stateDir) {
  return path.join(stateDir, `${sanitizeKey(sourceKey)}.json`);
}

/**
 * @param {string} sourceKey
 * @param {string} [stateDir]
 * @returns {{sourceKey: string, newValue: number, oldValue: number, status: string, firstEscalatedAt: string, lastSeenAt: string, escalationCount: number}|null}
 */
export function loadPendingState(sourceKey, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const p = statePath(sourceKey, stateDir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch (err) {
    console.error(`[plausi-state/${sourceKey}] Zustandsdatei defekt (${err.message}) — als 'kein Zustand' behandelt.`);
    return null;
  }
}

export function savePendingState(sourceKey, data, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  writeFileSync(statePath(sourceKey, stateDir), JSON.stringify({ sourceKey, ...data }, null, 2) + '\n');
}

/** Für den Rückkanal (Fix 3, NOCH NICHT verdrahtet — siehe Modul-Kommentar
 * oben). Löscht den Pending-Zustand nach Freigabe ('approved') oder
 * Verwerfung ('rejected'). Wird aktuell von KEINEM Produktivpfad aufgerufen. */
export function clearPendingState(sourceKey, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const p = statePath(sourceKey, stateDir);
  if (existsSync(p)) unlinkSync(p);
}

/**
 * Kernentscheidung: soll für (sourceKey, newValue) JETZT eskaliert werden?
 *
 * @returns {{shouldEscalate: boolean, reason: 'first-escalation'|'value-changed'|'already-pending-same-value'}}
 */
export function shouldEscalate(sourceKey, newValue, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const pending = loadPendingState(sourceKey, stateDir);
  if (!pending) {
    return { shouldEscalate: true, reason: 'first-escalation' };
  }
  // Wertevergleich mit Toleranz für Fliesskomma-Rundung (identischer Wert,
  // der z.B. durch eine erneute JSON-Serialisierung minimal abweicht, darf
  // nicht als "geändert" gelten und eine neue Meldung auslösen).
  const sameValue = Number.isFinite(pending.newValue) && Number.isFinite(newValue)
    ? Math.abs(pending.newValue - newValue) < 1e-9
    : pending.newValue === newValue;
  if (sameValue) {
    return { shouldEscalate: false, reason: 'already-pending-same-value' };
  }
  return { shouldEscalate: true, reason: 'value-changed' };
}

/** Nach einer tatsächlich gesendeten Eskalation aufzurufen — setzt/erneuert
 * den Pending-Zustand für diesen sourceKey+Wert. */
export function recordEscalation(sourceKey, { newValue, oldValue, status }, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const existing = loadPendingState(sourceKey, stateDir);
  const now = new Date().toISOString();
  savePendingState(
    sourceKey,
    {
      newValue,
      oldValue,
      status,
      firstEscalatedAt: existing?.firstEscalatedAt ?? now,
      lastSeenAt: now,
      escalationCount: (existing?.escalationCount ?? 0) + 1,
    },
    stateDir
  );
}
