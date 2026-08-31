/**
 * trueflation.ch — Bedingte Anfrage + Tagesbudget (US 1.1, US 1.16)
 *
 * Kombiniert fetchWhitelisted (SSRF-Schutz) mit echter conditional-GET-Logik:
 * sendet If-Modified-Since / If-None-Match basierend auf dem zuletzt bekannten
 * Last-Modified/ETag. Bei 304 wird KEINE Volldaten-Verarbeitung ausgelöst —
 * das ist der eigentliche Zweck (Bandbreite sparen, API-Etikette wahren).
 *
 * Tagesbudget wird VOR dem Request geprüft (kein Request, wenn Budget
 * erschöpft) und NUR nach einem tatsächlich durchgeführten Request
 * (200 oder 304) hochgezählt — Fehlschläge zählen nicht (siehe
 * pipeline-state.mjs).
 */

import { fetchWhitelisted } from './fetch-whitelisted.mjs';
import { loadState, checkDailyBudget, recordSuccessfulCheck } from './pipeline-state.mjs';

/**
 * @param {string} sourceKey
 * @param {string} url
 * @param {object} options
 * @param {number} options.maxChecksPerDay
 * @param {Record<string,string>} [options.headers]
 * @returns {Promise<{status: 'budget-exhausted'|'not-modified'|'modified'|'error', response?: Response, state: object}>}
 */
export async function conditionalFetch(sourceKey, url, options) {
  const { allowed, state } = checkDailyBudget(sourceKey, options.maxChecksPerDay);
  if (!allowed) {
    console.log(`[conditional-fetch/${sourceKey}] Tagesbudget erschöpft (${state.checksToday}/${options.maxChecksPerDay}) — kein Request.`);
    return { status: 'budget-exhausted', state };
  }

  const headers = { ...(options.headers ?? {}) };
  if (state.lastModified) headers['If-Modified-Since'] = state.lastModified;
  if (state.etag) headers['If-None-Match'] = state.etag;

  console.log(`[conditional-fetch/${sourceKey}] Anfrage mit If-Modified-Since=${state.lastModified ?? '(keiner)'}, If-None-Match=${state.etag ?? '(keiner)'}`);

  const response = await fetchWhitelisted(url, { headers });

  if (response.status === 304) {
    const newState = recordSuccessfulCheck(sourceKey, state);
    console.log(`[conditional-fetch/${sourceKey}] 304 Not Modified — keine neuen Daten, kein Volldownload verarbeitet. Tagesbudget: ${newState.checksToday}/${options.maxChecksPerDay}.`);
    return { status: 'not-modified', response, state: newState };
  }

  if (response.ok) {
    const lastModified = response.headers.get('last-modified') ?? undefined;
    const etag = response.headers.get('etag') ?? undefined;
    const newState = recordSuccessfulCheck(sourceKey, state, { lastModified, etag });
    console.log(`[conditional-fetch/${sourceKey}] HTTP ${response.status} — neue/geänderte Daten. Last-Modified=${lastModified ?? '(keiner)'}, ETag=${etag ?? '(keiner)'}. Tagesbudget: ${newState.checksToday}/${options.maxChecksPerDay}.`);
    return { status: 'modified', response, state: newState };
  }

  console.error(`[conditional-fetch/${sourceKey}] Unerwarteter Status: HTTP ${response.status}`);
  return { status: 'error', response, state };
}

export { loadState };
