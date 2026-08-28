#!/usr/bin/env node
/**
 * trueflation.ch — Miet-Korrektur: Vergleichsgruppe LÄNGSTE Bezugsdauer-Klasse
 * (Requirements 2.2b, Betreiber-Direktive 28.08.2026, EINE Prüfung)
 *
 * ═══ AUFTRAG ═══
 * Bisherige Berechnung (build-rent-correction.mjs) vergleicht den
 * Neubezug-Proxy gegen die Zeile "Total" (Gesamtdurchschnitt aller
 * Bezugsdauerklassen). Der Betreiber-Einwand: "Total" enthält die
 * Neubezüge SELBST bereits (Neubezug ist eine Teilmenge von Total) — das
 * dämpft die gemessene Differenz. Die LÄNGSTE Bezugsdauer-Klasse
 * ("21 Jahre und mehr") enthält dagegen garantiert KEINE aktuellen
 * Neubezüge und ist damit die sauberere Vergleichsbasis für "was zahlen
 * Bestandsmieter, die schon lange nicht umgezogen sind".
 *
 * ═══ ERGEBNIS (vorab-festgelegtes Kriterium anwenden) ═══
 * Diese Prüfung berechnet BEIDE Vergleichsgrössen (gegen Total UND gegen
 * 21J+) nebeneinander und meldet explizit, ob sich das Vorzeichen dreht.
 *
 * Usage:
 *   node build-rent-correction-longtenure-check.mjs --price-input <xlsx>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readSheet } from 'read-excel-file/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'rent-correction');

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const priceInputPath = argVal('--price-input');

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

const PROXY_ROW_LABEL = 'Neubezug einer mehr als zwei Jahre alten Wohnung';
const TOTAL_ROW_LABEL = 'Total';
const LONGEST_TENURE_ROW_LABEL = '21 Jahre und mehr';
const EXPECTED_YEARS = ['2020', '2021', '2022', '2023', '2024'];
const PRICE_VALUE_COLUMN = 1; // "Total"-Zimmerzahl-Spalte, siehe build-rent-correction.mjs

function findExactlyOneRow(rows, label, context) {
  const matches = rows.filter((r) => r[0] === label);
  if (matches.length === 0) throw new DataContractError([`${context}: Zeile '${label}' nicht gefunden.`]);
  if (matches.length > 1) throw new DataContractError([`${context}: Zeile '${label}' ist MEHRDEUTIG (${matches.length} Treffer).`]);
  return matches[0];
}

async function extractRow(xlsxPath, year) {
  const rows = await readSheet(xlsxPath, year);
  const totalRow = findExactlyOneRow(rows, TOTAL_ROW_LABEL, `Sheet ${year}`);
  const proxyRow = findExactlyOneRow(rows, PROXY_ROW_LABEL, `Sheet ${year}`);
  const longestRow = findExactlyOneRow(rows, LONGEST_TENURE_ROW_LABEL, `Sheet ${year}`);
  const totalPrice = totalRow[PRICE_VALUE_COLUMN];
  const proxyPrice = proxyRow[PRICE_VALUE_COLUMN];
  const longestTenurePrice = longestRow[PRICE_VALUE_COLUMN];
  for (const [label, val] of [['Total', totalPrice], ['Proxy', proxyPrice], ['21J+', longestTenurePrice]]) {
    if (typeof val !== 'number') {
      throw new DataContractError([`Sheet ${year}: ${label}-Wert nicht numerisch (${val}).`]);
    }
  }
  return { year: Number(year), totalPrice, proxyPrice, longestTenurePrice };
}

function round2(x) { return Math.round(x * 100) / 100; }
function round4(x) { return Math.round(x * 10000) / 10000; }

function computeVariant(series, valueKey, label) {
  const first = series[0];
  const last = series[series.length - 1];
  const years = last.year - first.year;
  const referenceGrowthPercent = (last[valueKey] / first[valueKey] - 1) * 100;
  const proxyGrowthPercent = (last.proxyPrice / first.proxyPrice - 1) * 100;
  const referenceAnnualPercent = (Math.pow(last[valueKey] / first[valueKey], 1 / years) - 1) * 100;
  const proxyAnnualPercent = (Math.pow(last.proxyPrice / first.proxyPrice, 1 / years) - 1) * 100;
  return {
    comparisonGroup: label,
    fromYear: first.year,
    toYear: last.year,
    referenceTotalGrowthPercent: round2(referenceGrowthPercent),
    proxyTotalGrowthPercent: round2(proxyGrowthPercent),
    referenceAnnualPercent: round4(referenceAnnualPercent),
    proxyAnnualPercent: round4(proxyAnnualPercent),
    correctionDeltaTotalPp: round2(proxyGrowthPercent - referenceGrowthPercent),
    correctionDeltaPpPerYear: round4(proxyAnnualPercent - referenceAnnualPercent),
  };
}

async function main() {
  if (!priceInputPath) {
    console.error('Usage: node build-rent-correction-longtenure-check.mjs --price-input <xlsx>');
    process.exit(1);
  }
  console.log('=== trueflation.ch — Miet-Korrektur: Vergleichsgruppe LÄNGSTE Bezugsdauer-Klasse ===\n');
  console.log('Auftrag: Vergleich gegen "21 Jahre und mehr" statt gegen "Total" (enthält Neubezüge bereits).\n');

  const resolvedPath = path.resolve(REPO_ROOT, priceInputPath);
  const series = [];
  for (const year of EXPECTED_YEARS) {
    series.push(await extractRow(resolvedPath, year));
  }
  console.log(`[datenvertrag] OK — ${series.length} Jahre, Spalten Total/Proxy/21J+ vorhanden und numerisch.\n`);

  console.log('--- Roh-Wachstumsraten (2020->2024, Rohreihen) ---');
  for (const r of series) {
    console.log(`  ${r.year}: Total=${r.totalPrice} | Neubezug-Proxy=${r.proxyPrice} | 21J+=${r.longestTenurePrice}`);
  }

  const variantVsTotal = computeVariant(series, 'totalPrice', 'Gesamtdurchschnitt (Total, bisherige Methode)');
  const variantVsLongest = computeVariant(series, 'longestTenurePrice', '21 Jahre und mehr (längste Bezugsdauer-Klasse)');

  console.log('\n--- Variante A: Vergleich gegen TOTAL (bisherige Methode, build-rent-correction.mjs) ---');
  console.log(`  Referenz (Total) ${variantVsTotal.fromYear}->${variantVsTotal.toYear}: ${variantVsTotal.referenceTotalGrowthPercent}% (${variantVsTotal.referenceAnnualPercent} pp/Jahr)`);
  console.log(`  Neubezug-Proxy: ${variantVsTotal.proxyTotalGrowthPercent}% (${variantVsTotal.proxyAnnualPercent} pp/Jahr)`);
  console.log(`  Korrektur-Delta: ${variantVsTotal.correctionDeltaTotalPp} pp total | ${variantVsTotal.correctionDeltaPpPerYear} pp/Jahr`);

  console.log('\n--- Variante B: Vergleich gegen 21J+ (längste Bezugsdauer-Klasse, KEINE Neubezüge enthalten) ---');
  console.log(`  Referenz (21J+) ${variantVsLongest.fromYear}->${variantVsLongest.toYear}: ${variantVsLongest.referenceTotalGrowthPercent}% (${variantVsLongest.referenceAnnualPercent} pp/Jahr)`);
  console.log(`  Neubezug-Proxy: ${variantVsLongest.proxyTotalGrowthPercent}% (${variantVsLongest.proxyAnnualPercent} pp/Jahr)`);
  console.log(`  Korrektur-Delta: ${variantVsLongest.correctionDeltaTotalPp} pp total | ${variantVsLongest.correctionDeltaPpPerYear} pp/Jahr`);

  const signA = Math.sign(variantVsTotal.correctionDeltaPpPerYear);
  const signB = Math.sign(variantVsLongest.correctionDeltaPpPerYear);
  const signFlips = signA !== 0 && signB !== 0 && signA !== signB;

  console.log(`\n--- VORZEICHEN-BEFUND ---`);
  console.log(`  Gegen Total: ${variantVsTotal.correctionDeltaPpPerYear > 0 ? 'POSITIV' : 'NEGATIV'} (${variantVsTotal.correctionDeltaPpPerYear} pp/Jahr)`);
  console.log(`  Gegen 21J+:  ${variantVsLongest.correctionDeltaPpPerYear > 0 ? 'POSITIV' : 'NEGATIV'} (${variantVsLongest.correctionDeltaPpPerYear} pp/Jahr)`);
  console.log(`  ${signFlips ? '>>> DAS VORZEICHEN DREHT SICH je nach Vergleichsgruppe. <<<' : 'Vorzeichen bleibt gleich, nur Betrag ändert sich.'}`);

  const ABS_THRESHOLD = 0.10;
  const meetsThresholdVsLongest = Math.abs(variantVsLongest.correctionDeltaPpPerYear) >= ABS_THRESHOLD;
  console.log(`\n  Kriterium (|Effekt| >= ${ABS_THRESHOLD} pp/Jahr) gegen 21J+: |${Math.abs(variantVsLongest.correctionDeltaPpPerYear)}| ${meetsThresholdVsLongest ? '>= ' : '< '}${ABS_THRESHOLD} -> ${meetsThresholdVsLongest ? 'ERFÜLLT (Betrag)' : 'NICHT erfüllt (Betrag)'}`);
  console.log(`  Hinweis: Abdeckung (4 von 15 Jahren) bleibt der zweite, unabhängige Prüfpunkt — siehe Abdeckungsprüfung.`);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    _comment:
      'Automatisch generiert durch build-rent-correction-longtenure-check.mjs. Ergänzt build-rent-correction.mjs ' +
      'um eine ZWEITE Vergleichsgruppe (21 Jahre und mehr statt Gesamtdurchschnitt) auf Betreiber-Anweisung ' +
      '(28.08.2026) — "Total" enthält die Neubezüge bereits, was die gemessene Differenz künstlich dämpft.',
    series,
    variantVsTotal,
    variantVsLongest,
    signFlips,
  };
  writeFileSync(path.join(OUTPUT_DIR, 'rent-correction-longtenure-check.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`\n[geschrieben] ${OUTPUT_DIR}/rent-correction-longtenure-check.json`);
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
