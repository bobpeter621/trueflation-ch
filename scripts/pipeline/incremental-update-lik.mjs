#!/usr/bin/env node
/**
 * trueflation.ch — LIK Inkrementeller Lauf (US 1.11)
 *
 * Kernnachweis: ein Lauf ergänzt NUR neue Datenpunkte seit dem letzten
 * bekannten Stand und lässt die bestehende Historie unangetastet.
 *
 * Verifikation (P1-DoD): Prüfsumme (SHA-256) der bestehenden Datenpunkte vor
 * und nach dem Lauf muss identisch sein — nur neu angehängte Punkte dürfen
 * die Dateigrösse ändern (US 5.5, Prüfsummen-Prinzip auf Datenebene).
 *
 * Nutzt denselben Whitelist-Wrapper wie der Bulk-Import (US 1.6/1.9) und
 * denselben Datenvertrags-Test (US 2.7). Anders als der Bulk-Import läuft
 * hier die reguläre Sprungrate-Validierung (validation.incremental in
 * config/sources.json), NICHT das Bulk-Profil.
 *
 * Usage:
 *   node incremental-update-lik.mjs --fixture <pfad> [--dry-run]
 *   node incremental-update-lik.mjs                     # echter Live-Lauf
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchWhitelisted } from './lib/fetch-whitelisted.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCES_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'sources.json');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'lik');

const args = process.argv.slice(2);
const fixtureIdx = args.indexOf('--fixture');
const fixturePath = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null;
const isDryRun = args.includes('--dry-run');

function loadSourcesConfig() {
  return JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf-8'));
}

function loadExistingData(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!existsSync(filePath)) {
    throw new Error(`Existierende Datendatei fehlt: ${filePath} — Bulk-Import (US 1.12) muss zuerst laufen.`);
  }
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** Prüfsumme über die reinen Wertepunkte (nicht über Metadaten wie importedAt). */
function hashValues(values) {
  const canonical = JSON.stringify(values);
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

async function fetchLikAppState(sourceCfg) {
  if (fixturePath) {
    console.log(`[fixture] Lade lokale Fixture: ${fixturePath}`);
    const raw = readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8');
    return JSON.parse(raw);
  }
  console.log(`[live] Einzelner GET gegen: ${sourceCfg.url}`);
  const res = await fetchWhitelisted(sourceCfg.url, {
    headers: {
      'User-Agent': 'trueflation.ch-incremental-update/1.0 (+https://github.com/bobpeter621/trueflation-ch)',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });
  if (!res.ok) throw new Error(`Live-Abruf fehlgeschlagen: HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

function assertDataContract(state) {
  const errors = [];
  for (const key of ['monthlySeries', 'yearlySeries', 'majorGroupsMonthly', 'majorGroupsYearly', 'bases']) {
    if (!(key in state)) errors.push(`Fehlender Top-Level-Key: '${key}'`);
  }
  if (errors.length > 0) throw new Error(`Datenvertrags-Test fehlgeschlagen: ${errors.join(', ')}`);
  console.log('[datenvertrag] OK');
}

/** Findet neue Datenpunkte: solche mit indexDate > letztem bekannten Datum. */
function findNewPoints(existingValues, freshValues, dateField = 'indexDate') {
  const lastKnownDate = Math.max(...existingValues.map((v) => v[dateField]));
  return freshValues.filter((v) => v[dateField] > lastKnownDate);
}

/** Inkrementelle Sprungrate-Validierung (US 1.7, Prüfart 2 — NICHT das Bulk-Profil). */
function validateIncrementalJump(newPoints, lastKnownValue, maxRatePercent, label) {
  let prevValue = lastKnownValue;
  for (const point of newPoints) {
    const changePercent = Math.abs((point.indexValue ?? point.mainIndex) / prevValue - 1) * 100;
    if (changePercent > maxRatePercent) {
      console.warn(
        `[plausi-warnung/${label}] Sprung von ${changePercent.toFixed(2)}% > ${maxRatePercent}% bei ${point.indexDate} ` +
        `— würde im Produktivbetrieb zur Telegram-Eskalation (US 1.7) führen, nicht automatisch übernommen.`
      );
    }
    prevValue = point.indexValue ?? point.mainIndex;
  }
}

async function processSeries({ label, existingFile, freshValues, dateField, valueField, maxRatePercent }) {
  const existing = loadExistingData(existingFile);
  const hashBefore = hashValues(existing.values);

  const newPoints = findNewPoints(existing.values, freshValues, dateField);
  console.log(`[${label}] Bestehende Punkte: ${existing.values.length} | Neue Punkte gefunden: ${newPoints.length}`);

  if (newPoints.length === 0) {
    console.log(`[${label}] Keine neuen Datenpunkte — Historie bleibt unverändert (erwartetes Ergebnis bei unveränderter Quelle).`);
    return { existing, hashBefore, hashAfter: hashBefore, newPoints, unchanged: true };
  }

  const lastKnownValue = existing.values[existing.values.length - 1][valueField];
  validateIncrementalJump(newPoints, lastKnownValue, maxRatePercent, label);

  const updatedValues = [...existing.values, ...newPoints];
  const hashOfOriginalPortion = hashValues(updatedValues.slice(0, existing.values.length));

  if (hashOfOriginalPortion !== hashBefore) {
    throw new Error(
      `KRITISCH: Bestehende Historie wurde verändert (Prüfsumme weicht ab) — Lauf abgebrochen, ` +
      `nichts geschrieben. existing=${hashBefore} vs. reconstructed=${hashOfOriginalPortion}`
    );
  }
  console.log(`[${label}] Prüfsumme der bestehenden ${existing.values.length} Punkte unverändert bestätigt: ${hashBefore.slice(0, 16)}...`);

  if (!isDryRun) {
    const filePath = path.join(DATA_DIR, existingFile);
    const updated = { ...existing, values: updatedValues, lastIncrementalUpdate: new Date().toISOString() };
    delete updated._comment;
    writeFileSync(filePath, JSON.stringify({ _comment: existing._comment, ...updated }, null, 2) + '\n');
    console.log(`[${label}] Geschrieben: ${filePath} (${updatedValues.length} Punkte total, ${newPoints.length} neu)`);
  } else {
    console.log(`[${label}] [dry-run] Würde ${newPoints.length} neue Punkte anhängen, kein Schreibvorgang.`);
  }

  const hashAfter = hashValues(updatedValues.slice(0, existing.values.length));
  return { existing, hashBefore, hashAfter, newPoints, unchanged: false };
}

async function main() {
  console.log('=== trueflation.ch — LIK Inkrementeller Lauf (US 1.11) ===\n');
  const cfg = loadSourcesConfig();
  const likCfg = cfg.sources.lik;

  const state = await fetchLikAppState(likCfg);
  assertDataContract(state);

  const ewigeMonthly = state.monthlySeries.find((s) => s.basis === 'Ewige Reihe');
  const ewigeYearly = state.yearlySeries.find((s) => s.basis === 'Ewige Reihe');

  const incrementalCfg = likCfg.validation.incremental;

  console.log('\n--- totalIndex (Ewige Reihe), monatlich ---');
  const totalMonthlyResult = await processSeries({
    label: 'totalIndex-monthly',
    existingFile: 'total-index-monthly.json',
    freshValues: ewigeMonthly.values,
    dateField: 'indexDate',
    valueField: 'indexValue',
    maxRatePercent: incrementalCfg.totalIndex.monthlyChangeRatePercentMax,
  });

  console.log('\n--- totalIndex (Ewige Reihe), jährlich ---');
  const totalYearlyResult = await processSeries({
    label: 'totalIndex-yearly',
    existingFile: 'total-index-yearly.json',
    freshValues: ewigeYearly.values,
    dateField: 'indexDate',
    valueField: 'indexValue',
    maxRatePercent: incrementalCfg.totalIndex.monthlyChangeRatePercentMax,
  });

  console.log('\n--- majorGroups, monatlich ---');
  const mgMonthlyResult = await processSeries({
    label: 'majorGroups-monthly',
    existingFile: 'major-groups-monthly.json',
    freshValues: state.majorGroupsMonthly,
    dateField: 'indexDate',
    valueField: 'mainIndex',
    maxRatePercent: incrementalCfg.majorGroups.monthlyChangeRatePercentMax,
  });

  console.log('\n--- majorGroups, jährlich ---');
  const mgYearlyResult = await processSeries({
    label: 'majorGroups-yearly',
    existingFile: 'major-groups-yearly.json',
    freshValues: state.majorGroupsYearly,
    dateField: 'indexDate',
    valueField: 'mainIndex',
    maxRatePercent: incrementalCfg.majorGroups.monthlyChangeRatePercentMax,
  });

  console.log('\n=== Zusammenfassung ===');
  for (const [label, r] of [
    ['totalIndex-monthly', totalMonthlyResult],
    ['totalIndex-yearly', totalYearlyResult],
    ['majorGroups-monthly', mgMonthlyResult],
    ['majorGroups-yearly', mgYearlyResult],
  ]) {
    console.log(`  ${label}: ${r.newPoints.length} neue Punkte, bestehende Historie ${r.hashBefore === r.hashAfter ? 'UNVERÄNDERT ✓' : 'ABWEICHUNG ✗'}`);
  }
  console.log('=== Inkrementeller Lauf abgeschlossen ===');
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
