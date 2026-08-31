#!/usr/bin/env node
/**
 * trueflation.ch — SNB M2 Bulk-Import (US 1.12, Requirements 2.3)
 *
 * Folgt DERSELBEN Pipeline-Struktur wie bulk-import-lik.mjs (P2-DoD:
 * "SNB-Quellen laufen über dieselbe Pipeline-Struktur wie LIK, keine
 * Sonderpfade" — das ist der Architekturbeweis dieses Blocks).
 *
 * Quelle: SNB Cube "snbmonagg", Dimension D1=GM2 (Geldmenge M2, verifiziert
 * 25.08.2026 über /dimensions/de-Endpoint — NICHT GM1, das ist M1).
 *
 * US 1.16 (API-Etikette, SNB-spezifisch verbindlich): SNB sperrt IPs bei
 * exzessiver Nutzung. lastUpdate/eTag-Prüfung vor jedem Abruf, Bulk-Import
 * sequenziell mit >=1s Pause zwischen Fenstern, niemals parallel.
 *
 * Usage:
 *   node bulk-import-snb-m2.mjs --fixture <pfad> [--dry-run]
 *   node bulk-import-snb-m2.mjs                     # echter Live-Import
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchWhitelisted } from './lib/fetch-whitelisted.mjs';
import { assertExactColumns, parseSnbCsvLine } from './lib/csv-header-validation.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCES_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'sources.json');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'snb-m2');

const args = process.argv.slice(2);
const fixtureIdx = args.indexOf('--fixture');
const fixturePath = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null;
const isDryRun = args.includes('--dry-run');

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

class BulkValidationError extends Error {
  constructor(issues) {
    super(`Bulk-Validierung fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'BulkValidationError';
  }
}

function loadSourcesConfig() {
  return JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf-8'));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

  if (headerIdx === -1) {
    throw new DataContractError(["Keine Header-Zeile ('\"Date\"...') im CSV gefunden — Format unerwartet."]);
  }

  // Header-Validierung (US 2.7, Fund 28.08.2026): Spaltennamen UND -reihenfolge
  // prüfen, BEVOR positional geparst wird — sonst würde eine geänderte
  // Spaltenreihenfolge/-benennung der Quelle lautlos falsche Werte in die
  // falschen Felder schreiben.
  const headerColumns = parseSnbCsvLine(lines[headerIdx]);
  assertExactColumns(headerColumns, ['Date', 'D0', 'D1', 'Value'], 'snb-m2');

  const dataLines = lines.slice(headerIdx + 1);
  const values = dataLines.map((line) => {
    const parts = parseSnbCsvLine(line);
    const [dateStr, d0, d1, valueStr] = parts;
    return {
      date: dateStr, // "YYYY-MM"
      d0,
      d1,
      value: parseFloat(valueStr),
    };
  });

  return { publishingDate, values };
}

async function fetchSnbM2(sourceCfg) {
  if (fixturePath) {
    console.log(`[fixture] Lade lokale Fixture: ${fixturePath} (kein Live-Abruf, US 1.16)`);
    return readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8');
  }
  // BUGFIX (25.08.2026): ohne fromDate/toDate liefert die SNB-API nur ein
  // kurzes Default-Fenster (13 Monate) statt der vollen Historie. Live
  // verifiziert: früheste verfügbare Daten ~1980. fetchWhitelisted erlaubt
  // seit diesem Fix zusätzliche fromDate/toDate-Parameter mit validem
  // Datumsformat (siehe lib/fetch-whitelisted.mjs).
  const url = `${sourceCfg.url}&fromDate=1980-01-01&toDate=${new Date().toISOString().slice(0, 10)}`;
  console.log(`[live] GET gegen: ${url}`);
  const res = await fetchWhitelisted(url, {
    headers: {
      'User-Agent': 'trueflation.ch-bulk-import/1.0 (+https://github.com/bobpeter621/trueflation-ch)',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });
  if (!res.ok) throw new Error(`Live-Abruf fehlgeschlagen: HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

function assertDataContract(parsed) {
  const issues = [];
  if (!Array.isArray(parsed.values) || parsed.values.length === 0) {
    issues.push("'values' ist kein nicht-leeres Array");
  } else {
    const sample = parsed.values[0];
    for (const key of ['date', 'd0', 'd1', 'value']) {
      if (!(key in sample)) issues.push(`values[0] fehlt Feld '${key}'`);
    }
    if (parsed.values.some((v) => v.d1 !== 'GM2')) {
      issues.push("Nicht alle Datenpunkte haben D1='GM2' — falsche Dimension in der Antwort?");
    }
    if (parsed.values.some((v) => Number.isNaN(v.value))) {
      issues.push('Mindestens ein Wert konnte nicht als Zahl geparst werden.');
    }
  }
  if (issues.length > 0) throw new DataContractError(issues);
  console.log('[datenvertrag] OK — erwartete Struktur vorhanden, D1=GM2 durchgängig.');
}

/** Bulk-Validierung, analog zum LIK-Muster (US 1.7 Prüfart 2 gilt NICHT hier). */
function validateBulk(values) {
  const issues = [];

  // Vollständigkeit + Monotonie der Monatsfolge
  const dates = values.map((v) => v.date);
  for (let i = 1; i < dates.length; i++) {
    const [py, pm] = dates[i - 1].split('-').map(Number);
    const [cy, cm] = dates[i].split('-').map(Number);
    const expectedMonth = pm === 12 ? 1 : pm + 1;
    const expectedYear = pm === 12 ? py + 1 : py;
    if (cy !== expectedYear || cm !== expectedMonth) {
      issues.push(`Lücke/Sprung zwischen ${dates[i - 1]} und ${dates[i]}`);
    }
  }

  // Duplikate
  const seen = new Set();
  for (const d of dates) {
    if (seen.has(d)) issues.push(`Duplikat: ${d}`);
    seen.add(d);
  }

  // Grobe Plausibilität: M2 sollte im Milliarden-CHF-Bereich liegen (Werte in Mio. CHF)
  const values_only = values.map((v) => v.value);
  const min = Math.min(...values_only);
  const max = Math.max(...values_only);
  if (min < 100000 || max > 5000000) {
    issues.push(`Werte ausserhalb plausibler Grössenordnung (min=${min}, max=${max}) — erwartet grob 500'000–2'000'000 (Mio. CHF).`);
  }

  if (issues.length > 0) throw new BulkValidationError(issues);
  console.log(`[bulk-validierung] OK — ${values.length} Monatswerte, keine Lücken, Bereich [${min}, ${max}] plausibel.`);
}

function writeOutput(values, publishingDate, sourceUrl) {
  if (isDryRun) {
    console.log('[dry-run] Kein Schreibvorgang. Zusammenfassung:');
    console.log(`  Monatliche Datenpunkte: ${values.length}`);
    console.log(`  Zeitraum: ${values[0].date} – ${values[values.length - 1].date}`);
    console.log(`  PublishingDate (Quelle): ${publishingDate}`);
    console.log(`  Letzter Wert: ${values[values.length - 1].value}`);
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  const meta = {
    _comment: 'Automatisch generiert durch scripts/pipeline/bulk-import-snb-m2.mjs — nicht manuell editieren.',
    sourceUrl,
    sourcePublishingDate: publishingDate,
    importedAt: new Date().toISOString(),
    importType: 'bulk',
    unit: 'Mio. CHF',
    aggregate: 'M2 (D1=GM2)',
  };
  writeFileSync(
    path.join(DATA_DIR, 'm2-monthly.json'),
    JSON.stringify({ ...meta, values }, null, 2) + '\n'
  );
  console.log(`[geschrieben] ${DATA_DIR}/m2-monthly.json (${values.length} Punkte)`);
}

async function main() {
  console.log('=== trueflation.ch — SNB M2 Bulk-Import (US 1.12) ===\n');
  const cfg = loadSourcesConfig();
  const snbCfg = cfg.sources['snb-m2'];
  if (!snbCfg) {
    throw new Error("Quelle 'snb-m2' fehlt in config/sources.json — zuerst eintragen (Whitelist, US 1.6).");
  }

  const csvText = await fetchSnbM2(snbCfg);
  const parsed = parseSnbCsv(csvText);
  assertDataContract(parsed);
  validateBulk(parsed.values);
  writeOutput(parsed.values, parsed.publishingDate, snbCfg.url);

  console.log('=== Bulk-Import abgeschlossen ===');
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
