#!/usr/bin/env node
/**
 * trueflation.ch — LIK Bulk-Import (US 1.12)
 *
 * Einmaliger, explizit auslösbarer Vorgang: lädt die komplette LIK-Historie und
 * schreibt sie versioniert nach data/lik/*.json.
 *
 * ZWEI REIHEN FÜR ZWEI ZWECKE (Betreiber-Entscheidung 25.08.2026, siehe
 * config/sources.json → importedSeries; Korrektur einer früheren Annahme, dass
 * alle 13 Basisreihen denselben Zeitraum abdecken — das stimmt nicht, jede
 * Basisreihe startet bei ihrem eigenen Basisjahr):
 *
 *   A) totalIndex ("Ewige Reihe") → Linie 1 (Requirements 2.1), volle Historie
 *      ab Juni 1914, überlebt jede künftige Rebasierung, da vom BFS selbst
 *      verkettet gepflegt.
 *   B) majorGroups (Top-Level majorGroupsMonthly/-Yearly) → Teilindizes für
 *      die Trueflation-Berechnung (2.2a), nur ab 2010 nötig. Kein basis-Feld
 *      nötig — die Werte folgen bereits der aktuellsten Basis dynamisch.
 *
 * Validierungsprofil "bulk" (NICHT das laufende Sprung-Schwellwert-Profil,
 * siehe config/sources.json → validation.bulk):
 *   - completeness: keine Lücken in der Monatsfolge
 *   - monotonicDates: aufsteigend, keine Duplikate
 *   - referencePointMatch: bekannter Ankerwert muss stimmen (reihenabhängig!)
 *   - roughMonotonicTrend: über den Gesamtzeitraum überwiegend steigend
 *
 * US 1.16 (API-Etikette): Bulk-Import ist idempotent, läuft NICHT parallel,
 * und gegen Fixtures entwickelt/getestet (--fixture Flag), nicht gegen den
 * Live-Endpunkt. Ein echter Live-Lauf ist ein einzelner GET (keine Pagination
 * nötig — der Endpunkt liefert die komplette Historie in einer Antwort).
 *
 * Usage:
 *   node bulk-import-lik.mjs --fixture scripts/pipeline/fixtures/lik-app-state.sample.json --dry-run
 *   node bulk-import-lik.mjs --fixture scripts/pipeline/fixtures/lik-app-state.sample.json
 *   node bulk-import-lik.mjs                     # echter Live-Import
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchWhitelisted } from './lib/fetch-whitelisted.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCES_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'sources.json');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'lik');

const args = process.argv.slice(2);
const fixtureIdx = args.indexOf('--fixture');
const fixturePath = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null;
const isDryRun = args.includes('--dry-run');

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
    this.issues = issues;
  }
}

class BulkValidationError extends Error {
  constructor(seriesName, issues) {
    super(`Bulk-Validierung fehlgeschlagen für '${seriesName}':\n  - ${issues.join('\n  - ')}`);
    this.name = 'BulkValidationError';
    this.issues = issues;
  }
}

function loadSourcesConfig() {
  return JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf-8'));
}

async function fetchLikAppState(sourceCfg) {
  if (fixturePath) {
    console.log(`[fixture] Lade lokale Fixture: ${fixturePath} (kein Live-Abruf, US 1.16)`);
    const raw = readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8');
    return JSON.parse(raw);
  }
  console.log(`[live] Einzelner GET gegen: ${sourceCfg.url}`);
  // SECURITY-FIX (finaler Security-Review 30.08.2026, Finding N1 -- NIEDRIG):
  // rief bisher rohes fetch() statt des SSRF-Wrappers fetchWhitelisted() auf --
  // Inkonsistenz zum eigenen Architekturversprechen ("JEDE Pipeline-Komponente
  // MUSS diesen Wrapper nutzen", siehe lib/fetch-whitelisted.mjs Header). Die
  // URL kommt zwar aus derselben Vertrauenswurzel (sources.json), die der
  // Wrapper selbst nutzt (keine praktische Ausnutzbarkeit), aber jetzt
  // konsistent -- der Wrapper bringt zusaetzlich die 100-MB-DoS-Grenzpruefung
  // mit, die diesem Pfad bisher fehlte.
  const res = await fetchWhitelisted(sourceCfg.url, {
    headers: {
      'User-Agent': 'trueflation.ch-bulk-import/1.0 (+https://github.com/bobpeter621/trueflation-ch)',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });
  if (!res.ok) {
    throw new Error(`Live-Abruf fehlgeschlagen: HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Datenvertrags-Test (US 2.7) — VOR jeder Weiterverarbeitung.
 * Bei Abweichung: ABBRECHEN, nicht durchreichen.
 */
function assertDataContract(state) {
  const errors = [];
  const requiredTopLevelKeys = [
    'yearlySeries', 'monthlySeries', 'bases', 'publishDate',
    'majorGroupsYearly', 'majorGroupsMonthly',
  ];
  for (const key of requiredTopLevelKeys) {
    if (!(key in state)) errors.push(`Fehlender Top-Level-Key: '${key}'`);
  }
  if (errors.length > 0) throw new DataContractError(errors);

  if (!Array.isArray(state.monthlySeries) || state.monthlySeries.length === 0) {
    throw new DataContractError(["'monthlySeries' ist kein nicht-leeres Array"]);
  }
  if (!Array.isArray(state.bases) || state.bases.length === 0) {
    throw new DataContractError(["'bases' ist kein nicht-leeres Array"]);
  }
  if (!Array.isArray(state.majorGroupsMonthly) || state.majorGroupsMonthly.length === 0) {
    throw new DataContractError(["'majorGroupsMonthly' ist kein nicht-leeres Array"]);
  }

  const sampleSeries = state.monthlySeries[0];
  for (const key of ['basis', 'values']) {
    if (!(key in sampleSeries)) errors.push(`monthlySeries[0] fehlt Key '${key}'`);
  }
  if (errors.length > 0) throw new DataContractError(errors);

  const sampleValue = sampleSeries.values?.[0];
  if (!sampleValue || !('indexDate' in sampleValue) || !('indexValue' in sampleValue)) {
    throw new DataContractError(["monthlySeries[].values[] fehlen 'indexDate'/'indexValue'"]);
  }

  const sampleMg = state.majorGroupsMonthly[0];
  for (const key of ['indexDate', 'mainIndex']) {
    if (!(key in sampleMg)) errors.push(`majorGroupsMonthly[0] fehlt Key '${key}'`);
  }
  if (errors.length > 0) throw new DataContractError(errors);

  console.log('[datenvertrag] OK — erwartete Struktur vorhanden.');
}

function selectSeriesByBasis(seriesArray, basisName, arrayLabel) {
  const found = seriesArray.find((s) => s.basis === basisName);
  if (!found) {
    throw new Error(
      `Basis '${basisName}' nicht in ${arrayLabel} gefunden. ` +
      `Verfügbare Basen: ${seriesArray.map((s) => s.basis).join(', ')}`
    );
  }
  return found;
}

/**
 * Rebasing-Beobachtung (US 1.8-Ergänzung). Für totalIndex (Ewige Reihe) ist
 * dies informativ, nicht handlungsrelevant — die Ewige Reihe überlebt jede
 * Rebasierung. Für majorGroups bleibt es relevant, falls die Quelle künftig
 * auf ein eingefrorenes statt dynamisches Schema wechseln sollte.
 */
function checkForNewerBasis(state, currentlyKnownNewest) {
  const known = state.bases.find((b) => b.name === currentlyKnownNewest);
  if (!known) return;
  const newer = state.bases.filter((b) => b.basisDate > known.basisDate && b.name !== 'Ewige Reihe');
  if (newer.length > 0) {
    console.log(
      `[rebasing-beobachtung] Neuere Basis/Basen in der Quelle vorhanden: ${newer.map((b) => b.name).join(', ')}. ` +
      `Informativ — totalIndex nutzt die Ewige Reihe und ist davon nicht betroffen (siehe config/sources.json → rebasingEvent).`
    );
  }
}

/** Bulk-Validierungsprofil für die totalIndex-Reihe (Ewige Reihe). */
function validateTotalIndexBulk(monthlySeries) {
  const seriesName = 'totalIndex (Ewige Reihe)';
  const issues = [];
  const values = monthlySeries.values;
  const dates = values.map((v) => v.indexDate);

  // (a) Vollständigkeit
  const parsed = dates.map((d) => {
    const s = String(d);
    return { year: parseInt(s.slice(0, 4), 10), month: parseInt(s.slice(4, 6), 10) };
  });
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    const expectedMonth = prev.month === 12 ? 1 : prev.month + 1;
    const expectedYear = prev.month === 12 ? prev.year + 1 : prev.year;
    if (cur.year !== expectedYear || cur.month !== expectedMonth) {
      issues.push(`Lücke/Sprung zwischen Index ${i - 1} (${dates[i - 1]}) und ${i} (${dates[i]})`);
    }
  }

  // (b) monotone, duplikatfreie Datumsfolge
  const dateSet = new Set();
  for (let i = 0; i < dates.length; i++) {
    if (dateSet.has(dates[i])) issues.push(`Duplikat: indexDate ${dates[i]}`);
    dateSet.add(dates[i]);
    if (i > 0 && dates[i] <= dates[i - 1]) {
      issues.push(`Nicht-monotone Datumsfolge bei Index ${i}: ${dates[i]} <= ${dates[i - 1]}`);
    }
  }

  // (c) Referenzpunkt: Ewige Reihe, Dezember 2025 = 1101.3 (verifiziert 25.08.2026)
  const dec2025 = values.find((v) => v.indexDate === 20251201);
  if (!dec2025) {
    issues.push('Referenzpunkt Dezember 2025 nicht in der Reihe gefunden.');
  } else if (Math.abs(dec2025.indexValue - 1101.3) > 2) {
    issues.push(`Referenzpunkt-Abweichung: Dezember 2025 = ${dec2025.indexValue}, erwartet ≈1101.3 (Ewige Reihe)`);
  } else {
    console.log(`[referenzpunkt/${seriesName}] OK — Dezember 2025 = ${dec2025.indexValue} (erwartet ≈1101.3)`);
  }

  // (d) grobe Monotonie über den Gesamtzeitraum
  const first = values[0].indexValue;
  const last = values[values.length - 1].indexValue;
  if (last <= first) {
    issues.push(`Grobe Monotonie verletzt: erster Wert ${first} >= letzter Wert ${last}`);
  } else {
    console.log(`[monotonie/${seriesName}] OK — Index steigt von ${first} (${dates[0]}) auf ${last} (${dates[dates.length - 1]})`);
  }

  if (issues.length > 0) throw new BulkValidationError(seriesName, issues);
  console.log(`[bulk-validierung/${seriesName}] OK — ${values.length} Monatswerte, keine Lücken, Referenzpunkt stimmt.`);
}

/** Bulk-Validierungsprofil für die majorGroups-Reihe (Teilindizes). */
function validateMajorGroupsBulk(majorGroupsMonthly) {
  const seriesName = 'majorGroups';
  const issues = [];
  const dates = majorGroupsMonthly.map((x) => x.indexDate);

  // (a) Vollständigkeit
  const parsed = dates.map((d) => {
    const s = String(d);
    return { year: parseInt(s.slice(0, 4), 10), month: parseInt(s.slice(4, 6), 10) };
  });
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    const expectedMonth = prev.month === 12 ? 1 : prev.month + 1;
    const expectedYear = prev.month === 12 ? prev.year + 1 : prev.year;
    if (cur.year !== expectedYear || cur.month !== expectedMonth) {
      issues.push(`Lücke/Sprung zwischen Index ${i - 1} (${dates[i - 1]}) und ${i} (${dates[i]})`);
    }
  }

  // (b) monotone, duplikatfreie Datumsfolge
  const dateSet = new Set();
  for (let i = 0; i < dates.length; i++) {
    if (dateSet.has(dates[i])) issues.push(`Duplikat: indexDate ${dates[i]}`);
    dateSet.add(dates[i]);
    if (i > 0 && dates[i] <= dates[i - 1]) {
      issues.push(`Nicht-monotone Datumsfolge bei Index ${i}: ${dates[i]} <= ${dates[i - 1]}`);
    }
  }

  // (c) Referenzpunkt: majorGroups @ Basisdatum der aktuellsten Basis sollte ≈100 sein
  // (dynamisch mitgeführt — verifiziert 25.08.2026: 12.2025=100 → mainIndex=100.0 @20251201)
  const dec2025 = majorGroupsMonthly.find((x) => x.indexDate === 20251201);
  if (!dec2025) {
    issues.push('Referenzpunkt Dezember 2025 nicht in majorGroupsMonthly gefunden.');
  } else if (Math.abs(dec2025.mainIndex - 100.0) > 1) {
    issues.push(`Referenzpunkt-Abweichung: Dezember 2025 mainIndex = ${dec2025.mainIndex}, erwartet ≈100.0 (aktuelle Basis)`);
  } else {
    console.log(`[referenzpunkt/${seriesName}] OK — Dezember 2025 mainIndex = ${dec2025.mainIndex} (erwartet ≈100.0)`);
  }

  // (d) KEINE grobe Monotonie-Erwartung für majorGroups — die Reihe ist bei jeder
  // Rebasierung nahe 100 verankert, daher kein langfristig steigender Trend zu erwarten
  // (anders als bei totalIndex/Ewige Reihe).

  if (issues.length > 0) throw new BulkValidationError(seriesName, issues);
  console.log(`[bulk-validierung/${seriesName}] OK — ${dates.length} Monatswerte, keine Lücken, Referenzpunkt stimmt.`);
}

function writeOutput({ totalMonthly, totalYearly, majorGroupsMonthly, majorGroupsYearly, publishDate }) {
  if (isDryRun) {
    console.log('[dry-run] Kein Schreibvorgang. Zusammenfassung:');
    console.log(`  totalIndex monatlich: ${totalMonthly.values.length} Punkte, ${totalMonthly.values[0].indexDate}–${totalMonthly.values[totalMonthly.values.length - 1].indexDate}`);
    console.log(`  totalIndex jährlich: ${totalYearly.values.length} Punkte`);
    console.log(`  majorGroups monatlich: ${majorGroupsMonthly.length} Punkte, ${majorGroupsMonthly[0].indexDate}–${majorGroupsMonthly[majorGroupsMonthly.length - 1].indexDate}`);
    console.log(`  majorGroups jährlich: ${majorGroupsYearly.length} Punkte`);
    console.log(`  publishDate (Quelle): ${publishDate}`);
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const sourceUrl = 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master';
  const importedAt = new Date().toISOString();
  const baseMeta = { sourceUrl, sourcePublishDate: publishDate, importedAt, importType: 'bulk' };

  writeFileSync(
    path.join(DATA_DIR, 'total-index-monthly.json'),
    JSON.stringify({
      _comment: 'Automatisch generiert durch scripts/pipeline/bulk-import-lik.mjs — Linie 1 (Requirements 2.1), Basis "Ewige Reihe".',
      ...baseMeta, basis: 'Ewige Reihe', values: totalMonthly.values,
    }, null, 2) + '\n'
  );
  writeFileSync(
    path.join(DATA_DIR, 'total-index-yearly.json'),
    JSON.stringify({
      _comment: 'Automatisch generiert — Linie 1 jährlich, Basis "Ewige Reihe".',
      ...baseMeta, basis: 'Ewige Reihe', values: totalYearly.values,
    }, null, 2) + '\n'
  );
  writeFileSync(
    path.join(DATA_DIR, 'major-groups-monthly.json'),
    JSON.stringify({
      _comment: 'Automatisch generiert — Teilindizes für Trueflation (2.2a), dynamisch aktuellste Basis der Quelle.',
      ...baseMeta, basis: 'dynamic-current', values: majorGroupsMonthly,
    }, null, 2) + '\n'
  );
  writeFileSync(
    path.join(DATA_DIR, 'major-groups-yearly.json'),
    JSON.stringify({
      _comment: 'Automatisch generiert — Teilindizes jährlich für Trueflation (2.2a).',
      ...baseMeta, basis: 'dynamic-current', values: majorGroupsYearly,
    }, null, 2) + '\n'
  );

  console.log(`[geschrieben] ${DATA_DIR}/total-index-monthly.json (${totalMonthly.values.length} Punkte)`);
  console.log(`[geschrieben] ${DATA_DIR}/total-index-yearly.json (${totalYearly.values.length} Punkte)`);
  console.log(`[geschrieben] ${DATA_DIR}/major-groups-monthly.json (${majorGroupsMonthly.length} Punkte)`);
  console.log(`[geschrieben] ${DATA_DIR}/major-groups-yearly.json (${majorGroupsYearly.length} Punkte)`);
}

async function main() {
  console.log('=== trueflation.ch — LIK Bulk-Import (US 1.12) ===');
  const cfg = loadSourcesConfig();
  const likCfg = cfg.sources.lik;
  const totalIndexBasis = likCfg.importedSeries.totalIndex.basisName;

  console.log(`totalIndex-Basis (Betreiber-Entscheidung 25.08.2026): ${totalIndexBasis}`);
  console.log(`majorGroups: Top-Level-Arrays, keine Basis-Auswahl nötig (dynamisch aktuellste Basis)`);

  const state = await fetchLikAppState(likCfg);
  assertDataContract(state);

  const totalMonthly = selectSeriesByBasis(state.monthlySeries, totalIndexBasis, 'monthlySeries');
  const totalYearly = selectSeriesByBasis(state.yearlySeries, totalIndexBasis, 'yearlySeries');
  checkForNewerBasis(state, totalIndexBasis);

  validateTotalIndexBulk(totalMonthly);
  validateMajorGroupsBulk(state.majorGroupsMonthly);

  writeOutput({
    totalMonthly,
    totalYearly,
    majorGroupsMonthly: state.majorGroupsMonthly,
    majorGroupsYearly: state.majorGroupsYearly,
    publishDate: state.publishDate,
  });
  console.log('=== Bulk-Import abgeschlossen ===');
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
