/**
 * trueflation.ch — Pipeline-Zustandsverwaltung (US 1.1, US 1.16)
 *
 * Persistiert pro Quelle: zuletzt bekannten Last-Modified/ETag-Wert (für
 * bedingte Anfragen), Tagesbudget-Zähler (nur erfolgreiche Prüfzyklen),
 * letzten Prüfzeitpunkt. Getrennt von fetch-with-resilience.mjs (das
 * verwaltet Fehler-Eskalation), dieses Modul verwaltet den "gesunden" Pfad.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STATUS_DIR = path.join(REPO_ROOT, 'data', '_pipeline-status');

function statePath(sourceKey) {
  return path.join(STATUS_DIR, `${sourceKey}.state.json`);
}

export function loadState(sourceKey) {
  const p = statePath(sourceKey);
  if (!existsSync(p)) {
    return {
      sourceKey,
      lastModified: null,
      etag: null,
      checksToday: 0,
      checksTodayDate: null, // YYYY-MM-DD, für Tagesreset
      lastCheckAt: null,
    };
  }
  return JSON.parse(readFileSync(p, 'utf-8'));
}

export function saveState(sourceKey, state) {
  if (!existsSync(STATUS_DIR)) mkdirSync(STATUS_DIR, { recursive: true });
  writeFileSync(statePath(sourceKey), JSON.stringify(state, null, 2) + '\n');
}

/**
 * Tagesbudget-Check (US 1.16). Zählt NUR erfolgreiche Prüfzyklen (200 oder
 * 304) — Retries/Fehlschläge zählen NICHT (Betreiber-Korrektur 25.08.2026,
 * siehe config/sources.json checkBudget._comment).
 *
 * @returns {{allowed: boolean, state: object}}
 */
export function checkDailyBudget(sourceKey, maxPerDay) {
  const state = loadState(sourceKey);
  const today = new Date().toISOString().slice(0, 10);
  if (state.checksTodayDate !== today) {
    state.checksToday = 0;
    state.checksTodayDate = today;
  }
  const allowed = state.checksToday < maxPerDay;
  return { allowed, state };
}

/** Nach einem erfolgreichen Prüfzyklus (200 oder 304) aufrufen. */
export function recordSuccessfulCheck(sourceKey, state, { lastModified, etag } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.checksTodayDate !== today) {
    state.checksToday = 0;
    state.checksTodayDate = today;
  }
  state.checksToday += 1;
  state.lastCheckAt = new Date().toISOString();
  if (lastModified !== undefined) state.lastModified = lastModified;
  if (etag !== undefined) state.etag = etag;
  saveState(sourceKey, state);
  return state;
}
