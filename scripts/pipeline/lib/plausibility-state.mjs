/**
 * trueflation.ch — Plausi-Eskalations-Zustandspersistenz (US 1.7, Fix 2 + Fix 3)
 *
 * FUND (Betreiber, 28.08.2026): Ohne Zustandspersistenz erzeugt jeder
 * Pipeline-Lauf, der auf einen bereits gemeldeten, noch unentschiedenen
 * Wert trifft, ERNEUT eine Eskalation — bei täglichem Scheduler wäre das
 * täglich dieselbe Meldung, bis jemand entscheidet. US 1.7 nennt den
 * Gewöhnungseffekt ausdrücklich als Grund, warum das den Schutzmechanismus
 * entwertet.
 *
 * FIX 2: Pro Quelle+Datenpunkt (sourceKey) einen Zustand persistieren,
 * analog zu data/_pipeline-status/ (bereits für den Fehlerzähler in
 * fetch-with-resilience.mjs genutztes Muster) — eigenes Unterverzeichnis
 * `plausi-pending/`, damit die beiden Mechanismen sich nicht überschreiben.
 *
 * FIX 3 (Betreiber-Direktive 28.08.2026, VARIANTE 2 — Zustand nach
 * Freigabe/Verwerfung wirkt aktiv, nicht nur "still löschen"): DREI
 * Ausgänge, nicht einer:
 *   approved -> Wert wird publiziert UND als neue Vergleichsbasis gesetzt
 *               (sonst würde derselbe Sprung beim nächsten Lauf erneut
 *               erkannt — Variante 1 wäre eine Endlosschleife gewesen).
 *   rejected -> Wert bleibt dauerhaft verworfen, solange der Quellwert
 *               UNVERÄNDERT bleibt. Ändert sich der Quellwert, wird wieder
 *               normal geprüft (neue Situation, keine automatische
 *               "für immer verworfen"-Sperre über den Wert hinaus).
 *   (keine Antwort) -> nach 7 Tagen GENAU EINE Erinnerung, danach Ruhe.
 *               Kein eigener Timer — läuft im regulären, ohnehin täglichen
 *               Pipeline-Lauf mit (isReminderDue() wird bei jedem Lauf neu
 *               ausgewertet).
 *
 * ASYNCHRONITÄT (Betreiber-Vorgabe): Die Pipeline läuft in GitHub Actions,
 * die Antwort kommt beim Betreiber in Telegram an, verarbeitet wird sie in
 * einer Agent-Session — zwischen Antwort und Verarbeitung können Stunden
 * liegen. Deshalb ist die Entscheidung NICHT flüchtig: `resolvePending()`
 * schreibt sie in diese Zustandsdatei, OHNE sie sofort anzuwenden. Der
 * NÄCHSTE Pipeline-Lauf liest den Zustand und wendet ihn an (siehe
 * incremental-validation.mjs). Kein Rennen zwischen Actions-Lauf und
 * Agent-Session — die Datei ist der einzige Übergabepunkt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Eigenes Unterverzeichnis, getrennt von den Resilienz-Statusdateien
 * (fetch-with-resilience.mjs schreibt direkt unter data/_pipeline-status/). */
export const DEFAULT_PLAUSI_STATE_DIR = path.join(REPO_ROOT, 'data', '_pipeline-status', 'plausi-pending');

/** 7-Tage-Erinnerungsschwelle (Betreiber-Vorgabe 28.08.2026, Fix 3/Ausgang 3). */
export const REMINDER_THRESHOLD_DAYS = 7;

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

/** Wertevergleich mit Toleranz für Fliesskomma-Rundung — identischer Wert,
 * der z.B. durch erneute JSON-Serialisierung minimal abweicht, gilt nicht
 * als "geändert". */
function sameValueApprox(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) < 1e-9 : a === b;
}

/**
 * @typedef {object} PendingState
 * @property {string} sourceKey
 * @property {number} newValue
 * @property {number} oldValue
 * @property {string} status
 * @property {string} firstEscalatedAt
 * @property {string} lastSeenAt
 * @property {number} escalationCount
 * @property {'approved'|'rejected'|null} resolution
 * @property {string|null} resolvedAt
 * @property {string|null} reminderSentAt
 */

/**
 * @param {string} sourceKey
 * @param {string} [stateDir]
 * @returns {PendingState|null}
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

/** Löscht den Pending-Zustand vollständig — nur nach angewendeter Freigabe
 * ('approved') aufzurufen (siehe incremental-validation.mjs). Verwerfung
 * ('rejected') löscht NICHT: der Zustand muss liegen bleiben, damit
 * "Quellwert unverändert -> nicht erneut melden" (Ausgang 2) funktioniert.
 * Randfall (Betreiber-Vorgabe, bewusst NICHT automatisiert): eine Ablehnung
 * lässt sich nicht per Nachricht zurücknehmen (derselbe Wert eskaliert nach
 * 'rejected' nicht mehr) — Korrektur nur durch manuelles Löschen dieser
 * Datei. */
export function clearPendingState(sourceKey, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const p = statePath(sourceKey, stateDir);
  if (existsSync(p)) unlinkSync(p);
}

/**
 * Nach einer tatsächlich gesendeten (Erst-)Eskalation aufzurufen — setzt
 * einen NEUEN Pending-Zustand oder erneuert ihn. Kommt der WERT geändert
 * herein (verglichen mit einem evtl. noch vorhandenen alten Zustand), wird
 * das als neue Situation behandelt: `firstEscalatedAt` und alle
 * Entscheidungsfelder (resolution/resolvedAt/reminderSentAt) werden
 * zurückgesetzt — eine alte Verwerfung/Freigabe/Erinnerung bezog sich auf
 * einen ANDEREN Wert und darf die neue Eskalation nicht beeinflussen.
 */
export function recordEscalation(sourceKey, { newValue, oldValue, status }, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const existing = loadPendingState(sourceKey, stateDir);
  const now = new Date().toISOString();
  const isNewValue = !existing || !sameValueApprox(existing.newValue, newValue);
  savePendingState(
    sourceKey,
    {
      newValue,
      oldValue,
      status,
      firstEscalatedAt: isNewValue ? now : existing.firstEscalatedAt ?? now,
      lastSeenAt: now,
      escalationCount: (existing?.escalationCount ?? 0) + 1,
      resolution: isNewValue ? null : existing.resolution ?? null,
      resolvedAt: isNewValue ? null : existing.resolvedAt ?? null,
      reminderSentAt: isNewValue ? null : existing.reminderSentAt ?? null,
    },
    stateDir
  );
}

/**
 * Setzt eine Entscheidung (Freigabe/Verwerfung) für den AKTUELL
 * persistierten Pending-Zustand. Wird von resolve-plausibility.mjs
 * aufgerufen, wenn eine Telegram-Antwort ("JA <sourceKey>"/"NEIN
 * <sourceKey>") verarbeitet wird. Löscht den Zustand NICHT selbst — das
 * Anwenden der Entscheidung (Wert publizieren + Basis aktualisieren bei
 * Freigabe; dauerhaftes Stillhalten bei Verwerfung) übernimmt der NÄCHSTE
 * Pipeline-Lauf (siehe incremental-validation.mjs, Fix 3).
 *
 * @param {string} sourceKey
 * @param {'approved'|'rejected'} decision
 * @param {string} [stateDir]
 * @returns {{ok: boolean, reason?: string, pending?: PendingState}}
 */
export function resolvePending(sourceKey, decision, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  if (decision !== 'approved' && decision !== 'rejected') {
    return { ok: false, reason: `ungueltige-entscheidung:${decision}` };
  }
  const pending = loadPendingState(sourceKey, stateDir);
  if (!pending) {
    return { ok: false, reason: 'kein-pending-zustand' };
  }
  // CODE-REVIEW-FUND (28.08.2026, Finding 4, WICHTIG): Der dokumentierte
  // Randfall ("eine Ablehnung lässt sich nicht per Nachricht zurücknehmen,
  // nur durch manuelles Löschen der Zustandsdatei") war im Code NICHT
  // erzwungen — eine zweite resolvePending()-Aufruf für denselben sourceKey
  // überschrieb die erste Entscheidung klaglos. Reproduziert: reject dann
  // approve für denselben Wert änderte die resolution anstandslos auf
  // 'approved'. Jetzt hart durchgesetzt: eine bereits vorhandene resolution
  // ist final, solange sich der Wert nicht ändert (ein geänderter Wert setzt
  // resolution ohnehin über recordEscalation() auf null zurück, siehe dort).
  if (pending.resolution) {
    return {
      ok: false,
      reason: `bereits-entschieden:${pending.resolution}`,
      pending,
    };
  }
  savePendingState(sourceKey, { ...pending, resolution: decision, resolvedAt: new Date().toISOString() }, stateDir);
  return { ok: true, pending: loadPendingState(sourceKey, stateDir) };
}

/** Ausgang 3 (keine Antwort): ist die 7-Tage-Erinnerungsschwelle erreicht?
 * Nur relevant, solange NOCH KEINE Entscheidung getroffen und NOCH KEINE
 * Erinnerung gesendet wurde. */
export function isReminderDue(pending, thresholdDays = REMINDER_THRESHOLD_DAYS) {
  if (!pending) return false;
  if (pending.resolution) return false;
  if (pending.reminderSentAt) return false;
  const firstEscalated = new Date(pending.firstEscalatedAt).getTime();
  if (!Number.isFinite(firstEscalated)) return false;
  const ageDays = (Date.now() - firstEscalated) / (1000 * 60 * 60 * 24);
  return ageDays >= thresholdDays;
}

export function markReminderSent(sourceKey, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const pending = loadPendingState(sourceKey, stateDir);
  if (!pending) return;
  savePendingState(sourceKey, { ...pending, reminderSentAt: new Date().toISOString() }, stateDir);
}

/**
 * Kernentscheidung für checkPlausibility(): was soll für (sourceKey,
 * newValue) JETZT passieren? Fasst Fix 2 (Wiederholungssperre bei
 * unverändertem Wert) und Fix 3 (drei Ausgänge) in einer Stelle zusammen.
 *
 * @returns {{
 *   action: 'escalate'|'suppress'|'approved-override'|'send-reminder',
 *   pending: PendingState|null,
 *   dataFreshnessImpact: 'none'|'stale'
 * }}
 */
export function evaluatePending(sourceKey, newValue, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const pending = loadPendingState(sourceKey, stateDir);
  if (!pending) {
    return { action: 'escalate', pending: null, dataFreshnessImpact: 'none' };
  }
  const sameValue = sameValueApprox(pending.newValue, newValue);
  if (!sameValue) {
    // Ausgang 2, Präzisierung "d": Quellwert hat sich geändert -> neue
    // Situation, unabhängig von einer fr\u00fcheren Entscheidung für den ALTEN Wert.
    return { action: 'escalate', pending, dataFreshnessImpact: 'none' };
  }
  if (pending.resolution === 'approved') {
    return { action: 'approved-override', pending, dataFreshnessImpact: 'none' };
  }
  if (pending.resolution === 'rejected') {
    // Ausgang 2: dauerhaft verworfen, solange der Wert unver\u00e4ndert bleibt.
    // Datenstand gilt als "vorläufig/veraltet" (US 3.16 Zustand 2), da der
    // neueste Punkt der Quelle nicht übernommen wurde.
    return { action: 'suppress', pending, dataFreshnessImpact: 'stale' };
  }
  // resolution === null (noch unentschieden) — Ausgang 3.
  if (isReminderDue(pending)) {
    return { action: 'send-reminder', pending, dataFreshnessImpact: 'stale' };
  }
  if (pending.reminderSentAt) {
    // Erinnerung wurde bereits einmal gesendet -> Ruhe, aber weiterhin als
    // veraltet markiert (die Entscheidung steht noch aus).
    return { action: 'suppress', pending, dataFreshnessImpact: 'stale' };
  }
  return { action: 'suppress', pending, dataFreshnessImpact: 'none' };
}

// Rückwärtskompatibler Alias für bestehende Aufrufer (Fix 2), die nur die
// boolesche Kurzform brauchen.
export function shouldEscalate(sourceKey, newValue, stateDir = DEFAULT_PLAUSI_STATE_DIR) {
  const evalResult = evaluatePending(sourceKey, newValue, stateDir);
  if (evalResult.action === 'escalate') {
    return { shouldEscalate: true, reason: evalResult.pending ? 'value-changed' : 'first-escalation' };
  }
  return { shouldEscalate: false, reason: 'already-pending-same-value' };
}
