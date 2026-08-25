#!/usr/bin/env node
/**
 * trueflation.ch — KVPI-Ersatz: BAG-Prämienindex (V2 final gelöst, US 2.2b)
 *
 * KERNBEFUND (Betreiber, 25.08.2026): Der KVPI-Teilindex Grundversicherung
 * ist KEINE eigenständige Messung — BFS übernimmt für die Grundversicherung
 * die BAG-Schätzung der Durchschnittsprämien-Entwicklung ("Eine spezifische
 * KVPI-Erhebung wird für den Grundversicherungsbereich nicht durchgeführt").
 * Der Weg über BAG-Durchschnittsprämien ist damit NICHT der Fallback,
 * sondern die PRIMÄRQUELLE, eine Verarbeitungsstufe weiter oben. Die Suche
 * nach einem isolierten KVPI-Teilindex wurde eingestellt (siehe
 * config/sources.json → kvpi, status weiterhin 'unverified' als Warnung,
 * NICHT als Prämienindex verwenden).
 *
 * QUELLE: BAG-Statistik der obligatorischen Krankenversicherung (KVSTAT),
 * Tabelle 3.01 "Mittlere Prämien je versicherte Person nach Kanton ab 1996",
 * Zeile "CH" (nationaler Durchschnitt). Bezogen über opendata.swiss →
 * bag.admin.ch ZIP-Archiv (KVSTAT<jahr>_XLSX_v<datum>.zip).
 *
 * METHODISCHE ENTSCHEIDUNG (Betreiber, 25.08.2026): "mittlere Prämie pro
 * versicherte Person" (alle Versicherten inkl. Kinder), NICHT die
 * Erwachsenen-Variante — Begründung: das HABE-Gewicht ist ein
 * Haushaltsbudget-Anteil, Haushalte schliessen Kinder ein, die
 * Erwachsenen-Variante würde die Belastung überzeichnen.
 *
 * Basisjahr 2010 = 100, konsistent mit Trueflation-Start und erstem
 * Basisjahr der Warenkorb-Fixierung (2.2a).
 *
 * BEKANNTE EINSCHRÄNKUNG (auf Methodik-Seite auszuweisen): Bruttoprämien,
 * Prämienverbilligungen NICHT abgezogen. BFS schätzt den Effekt auf ~0.5
 * Prozentpunkte pro Jahr Prämienwachstum-Reduktion.
 *
 * Usage:
 *   node build-kvpi-premium-index.mjs --input <xlsx-datei-aus-kvstat-zip>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'kvpi-premium-index');

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : null;

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

/** Abdeckungsprüfung (Betreiber-Vorgabe: "der M2-Fall hat gezeigt, dass ein
 * 'erfolgreicher' Import wenig aussagt" — expectedStart/minExpectedPoints). */
const COVERAGE_EXPECTATIONS = {
  expectedStart: 1996,
  minExpectedPoints: 25, // 1996-2024 = 29 Jahre, grosszügiger Puffer nach unten
};

function extractChRow(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath);
  // Deutsches Sheet "301d" (siehe requirements.md 2.2b) — Tabelle 3.01
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().includes('301d'));
  if (!sheetName) {
    throw new DataContractError([`Erwartetes Sheet '301d' nicht gefunden. Vorhanden: ${wb.SheetNames.join(', ')}`]);
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Header-Zeile mit Jahren finden (enthält 'Kanton' in Spalte 0)
  const headerRow = rows.find((r) => r[0] === 'Kanton');
  if (!headerRow) throw new DataContractError(["Header-Zeile mit 'Kanton' nicht gefunden."]);
  const years = headerRow.slice(1).filter((y) => typeof y === 'number');

  const chRow = rows.find((r) => r[0] === 'CH');
  if (!chRow) throw new DataContractError(["Zeile 'CH' (Schweiz national) nicht gefunden."]);
  const values = chRow.slice(1, 1 + years.length);

  if (values.some((v) => typeof v !== 'number')) {
    throw new DataContractError(['CH-Zeile enthält nicht-numerische Werte — Struktur hat sich vermutlich geändert.']);
  }

  return years.map((year, i) => ({ year, premiumCHF: Math.round(values[i] * 100) / 100 }));
}

function assertCoverage(series) {
  const issues = [];
  const firstYear = series[0]?.year;
  if (firstYear !== COVERAGE_EXPECTATIONS.expectedStart) {
    issues.push(`Erwarteter Start ${COVERAGE_EXPECTATIONS.expectedStart}, tatsächlich ${firstYear}.`);
  }
  if (series.length < COVERAGE_EXPECTATIONS.minExpectedPoints) {
    issues.push(`Erwartet mind. ${COVERAGE_EXPECTATIONS.minExpectedPoints} Punkte, erhalten ${series.length}.`);
  }
  // Monotonie/Duplikate
  for (let i = 1; i < series.length; i++) {
    if (series[i].year <= series[i - 1].year) {
      issues.push(`Nicht-monotone Jahresfolge bei Index ${i}: ${series[i].year} <= ${series[i - 1].year}`);
    }
  }
  if (issues.length > 0) {
    throw new DataContractError(issues);
  }
  console.log(`[abdeckung] OK — ${series.length} Jahre, ${series[0].year}-${series[series.length - 1].year}.`);
}

function buildIndexSeries(series, baseYear) {
  const baseEntry = series.find((s) => s.year === baseYear);
  if (!baseEntry) throw new Error(`Basisjahr ${baseYear} nicht in der Reihe gefunden.`);
  const baseValue = baseEntry.premiumCHF;
  return series.map((s) => ({
    year: s.year,
    premiumCHF: s.premiumCHF,
    indexValue: Math.round((s.premiumCHF / baseValue) * 10000) / 10000,
  }));
}

async function main() {
  if (!inputPath) {
    console.error('Usage: node build-kvpi-premium-index.mjs --input <xlsx-datei>');
    process.exit(1);
  }
  console.log('=== trueflation.ch — BAG-Prämienindex (V2, US 2.2b) ===\n');

  const rawSeries = extractChRow(path.resolve(REPO_ROOT, inputPath));
  console.log(`[datenvertrag] OK — CH-Zeile gefunden, ${rawSeries.length} Jahre.`);
  assertCoverage(rawSeries);

  const BASE_YEAR = 2010;
  const indexSeries = buildIndexSeries(rawSeries, BASE_YEAR);

  mkdirSync(DATA_DIR, { recursive: true });
  const output = {
    _comment:
      'Automatisch generiert durch scripts/pipeline/build-kvpi-premium-index.mjs. ' +
      'Basiert auf BAG-Statistik der obligatorischen Krankenversicherung (KVSTAT), Tabelle 3.01, Zeile CH. ' +
      "Metrik: mittlere Prämie je versicherte Person (ALLE Versicherten inkl. Kinder), NICHT nur Erwachsene " +
      '— Betreiber-Entscheidung 25.08.2026, Begründung: HABE-Gewicht ist Haushaltsbudget-Anteil, Haushalte schliessen Kinder ein. ' +
      'Bruttoprämien, Prämienverbilligungen NICHT abgezogen (BFS-Schätzung: ~0.5 Prozentpunkte/Jahr Effekt) — als bekannte Einschränkung auf Methodik-Seite auszuweisen.',
    sourceDescription: 'BAG Statistik der obligatorischen Krankenversicherung (KVSTAT), Tabelle 3.01',
    metric: 'Mittlere Prämie je versicherte Person, alle Versicherten (inkl. Kinder), national aggregiert (CH)',
    baseYear: BASE_YEAR,
    unit: 'CHF (Prämie), Index (indexValue, Basisjahr = 100)',
    importedAt: new Date().toISOString(),
    importType: 'bulk',
    knownLimitations: [
      'Bruttoprämien — Prämienverbilligungen nicht abgezogen (BFS-Schätzung: ca. 0.5 Prozentpunkte/Jahr Effekt).',
      'KVPI-Teilindex Grundversicherung existiert nicht eigenständig — diese Reihe IST die Primärquelle (BAG-Durchschnittsprämien), nicht ein Fallback.',
    ],
    values: indexSeries,
  };

  writeFileSync(path.join(DATA_DIR, 'premium-index-ch.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`\n[geschrieben] ${DATA_DIR}/premium-index-ch.json (${indexSeries.length} Punkte, Basis ${BASE_YEAR}=100)`);
  console.log(`Letzter Wert: ${indexSeries[indexSeries.length - 1].year} = ${indexSeries[indexSeries.length - 1].indexValue} (${indexSeries[indexSeries.length - 1].premiumCHF} CHF)`);
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
