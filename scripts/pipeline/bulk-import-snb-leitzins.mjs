#!/usr/bin/env node
/**
 * trueflation.ch — SNB Leitzins Bulk-Import (US 1.12, Requirements 2.4)
 *
 * ZWEI QUELLEN, NICHT VERKETTET (Betreiber-Entscheidung 25.08.2026):
 *   - snb-leitzins-current: Cube `snbgwdzid`, Dimension LZ, ab 13.06.2019
 *   - snb-leitzins-historical: Cube `snboffzisa`, Dimension UG0, Jan 2000 - Mai 2019
 * Beide werden als GETRENNTE Reihen gespeichert und im Chart als Stufenlinie
 * mit sichtbarer Bruchstellen-Kennzeichnung dargestellt — nicht glätten,
 * nicht zu einer nahtlosen Reihe verketten (unterschiedliche Instrumente).
 *
 * Die dritte Instrumentenphase (Diskont-/Lombardsatz, vor 2000) ist noch
 * nicht gefunden (siehe requirements.md Abschnitt 2.4, "Offener Rest von
 * V6") — dieses Skript importiert nur die zwei verifizierten Reihen.
 *
 * Folgt derselben Pipeline-Struktur wie bulk-import-lik.mjs / -snb-m2.mjs
 * (P2-DoD: keine Sonderpfade).
 *
 * Usage:
 *   node bulk-import-snb-leitzins.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchWhitelisted } from './lib/fetch-whitelisted.mjs';
import { assertExactColumns, parseSnbCsvLine } from './lib/csv-header-validation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCES_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'sources.json');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'snb-leitzins');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

function loadSourcesConfig() {
  return JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf-8'));
}

/** Parst das SNB-CSV-Format (mit Kopfzeilen vor den eigentlichen Daten). */
function parseSnbCsv(csvText) {
  const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);
  let publishingDate = null;
  let headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('"PublishingDate"')) {
      publishingDate = lines[i].split(';')[1]?.replace(/"/g, '') ?? null;
    }
    if (lines[i].startsWith('"Date"')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new DataContractError(["Keine Header-Zeile im CSV gefunden."]);

  // Header-Validierung (US 2.7, Fund 28.08.2026): siehe bulk-import-snb-m2.mjs
  // für den vollen Fund-Kontext — gleiche Klasse Problem, andere Quelle (nur
  // 3 statt 4 Spalten: kein D1 bei diesem Cube).
  const headerColumns = parseSnbCsvLine(lines[headerIdx]);
  assertExactColumns(headerColumns, ['Date', 'D0', 'Value'], 'snb-leitzins');

  const dataLines = lines.slice(headerIdx + 1);
  const values = dataLines
    .map((line) => {
      const parts = parseSnbCsvLine(line);
      const [date, d0, valueStr] = parts;
      return { date, d0, value: valueStr === '' || valueStr === undefined ? null : parseFloat(valueStr) };
    })
    .filter((v) => v.value !== null); // leere Werte (Instrument existierte noch nicht) verwerfen

  return { publishingDate, values };
}

async function fetchAndParse(sourceCfg, label, dateRange) {
  const url = dateRange ? `${sourceCfg.url}&fromDate=${dateRange.from}&toDate=${dateRange.to}` : sourceCfg.url;
  console.log(`[live] GET gegen: ${url}`);
  const res = await fetchWhitelisted(url, {
    headers: {
      'User-Agent': 'trueflation.ch-bulk-import/1.0 (+https://github.com/bobpeter621/trueflation-ch)',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });
  if (!res.ok) throw new Error(`Live-Abruf fehlgeschlagen (${label}): HTTP ${res.status} ${res.statusText}`);
  const csvText = await res.text();
  const parsed = parseSnbCsv(csvText);

  if (parsed.values.length === 0) {
    throw new DataContractError([`${label}: keine nicht-leeren Werte in der Antwort gefunden.`]);
  }
  console.log(`[datenvertrag/${label}] OK — ${parsed.values.length} nicht-leere Datenpunkte.`);
  return parsed;
}

function validateMonotonicNoDuplicates(values, label) {
  const issues = [];
  const dates = values.map((v) => v.date);
  const seen = new Set();
  for (let i = 0; i < dates.length; i++) {
    if (seen.has(dates[i])) issues.push(`Duplikat: ${dates[i]}`);
    seen.add(dates[i]);
    if (i > 0 && dates[i] <= dates[i - 1]) {
      issues.push(`Nicht-monotone Datumsfolge bei Index ${i}: ${dates[i]} <= ${dates[i - 1]}`);
    }
  }
  if (issues.length > 0) {
    throw new Error(`Bulk-Validierung fehlgeschlagen (${label}):\n  - ${issues.join('\n  - ')}`);
  }
  console.log(`[bulk-validierung/${label}] OK — ${values.length} Punkte, monoton, keine Duplikate.`);
}

function writeOutput(filename, values, publishingDate, sourceUrl, extraMeta = {}) {
  if (isDryRun) {
    console.log(`[dry-run] ${filename}: ${values.length} Punkte, ${values[0].date} – ${values[values.length - 1].date}, letzter Wert: ${values[values.length - 1].value}`);
    return;
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const meta = {
    _comment: 'Automatisch generiert durch scripts/pipeline/bulk-import-snb-leitzins.mjs — nicht manuell editieren.',
    sourceUrl,
    sourcePublishingDate: publishingDate,
    importedAt: new Date().toISOString(),
    importType: 'bulk',
    unit: 'Prozent',
    ...extraMeta,
  };
  writeFileSync(path.join(DATA_DIR, filename), JSON.stringify({ ...meta, values }, null, 2) + '\n');
  console.log(`[geschrieben] ${DATA_DIR}/${filename} (${values.length} Punkte)`);
}

async function main() {
  console.log('=== trueflation.ch — SNB Leitzins Bulk-Import (US 1.12) ===\n');
  const cfg = loadSourcesConfig();

  const currentCfg = cfg.sources['snb-leitzins-current'];
  const historicalCfg = cfg.sources['snb-leitzins-historical'];
  if (!currentCfg || !historicalCfg) {
    throw new Error("Quellen 'snb-leitzins-current'/'snb-leitzins-historical' fehlen in config/sources.json.");
  }

  console.log('--- snb-leitzins-current (snbgwdzid, ab 13.06.2019) ---');
  const current = await fetchAndParse(currentCfg, 'snb-leitzins-current', { from: '2019-06-01', to: new Date().toISOString().slice(0, 10) });
  validateMonotonicNoDuplicates(current.values, 'snb-leitzins-current');
  writeOutput('leitzins-current.json', current.values, current.publishingDate, currentCfg.url, {
    instrument: 'SNB-Leitzins',
    validFrom: '2019-06-13',
  });

  // US 1.16: sequenziell, mindestens 1s Pause zwischen Anfragen
  await new Promise((r) => setTimeout(r, 1000));

  console.log('\n--- snb-leitzins-historical (snboffzisa, Libor-Zielband 2000-2019) ---');
  const historical = await fetchAndParse(historicalCfg, 'snb-leitzins-historical', { from: '2000-01-01', to: '2019-06-01' });
  validateMonotonicNoDuplicates(historical.values, 'snb-leitzins-historical');
  writeOutput('leitzins-historical.json', historical.values, historical.publishingDate, historicalCfg.url, {
    instrument: 'Libor-Zielband (untere Grenze, UG0)',
    validFrom: '2000-01',
    validTo: '2019-05',
    note: 'Diskont-/Lombardsatz-Periode vor Januar 2000 noch nicht gefunden (siehe requirements.md 2.4) — nicht Teil dieses Imports.',
  });

  console.log('\n=== Bulk-Import abgeschlossen (2 von 3 Instrumentenphasen) ===');
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
