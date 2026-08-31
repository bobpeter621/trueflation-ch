#!/usr/bin/env node
/**
 * trueflation.ch — Miet-Korrektur (Requirements 2.2b, V3)
 *
 * ═══ EINSCHRÄNKUNG, VORAB ZU LESEN ═══
 * Requirements 2.2b nimmt "jährlich, ab 2010" für die Mietdauer-Dimension
 * der Strukturerhebung an. Das stimmt für die ERHEBUNG (die BFS-Struktur-
 * erhebung läuft seit 2010 jährlich), aber NICHT für den hier gefundenen
 * ZUGRIFFSWEG: Die über DAM/opendata.swiss abrufbare Tabelle "Durchschnitt-
 * licher Mietpreis nach Bezugsdauer der Wohnung und Zimmerzahl" (T 09.03.03.62)
 * enthält bei Prüfung (27.08.2026) NUR die Jahre 2020-2024 (5 Sheets, ein
 * Sheet pro Jahr). Kein Archiv-/Historienzugang für 2010-2019 gefunden
 * (siehe config/sources.json -> bfs-miete-bezugsdauer-zimmerzahl.coverage).
 * FOLGE: Die Miet-Korrektur kann derzeit NUR für 2020-2024 real berechnet
 * werden, nicht für die volle Trueflation-Reihe ab 2010. Das ist an den
 * Betreiber gemeldet (siehe Chat 27.08.2026), NICHT stillschweigend als
 * "Reihe beginnt eben 2020" umdeklariert.
 *
 * ═══ ZWEI QUELLTABELLEN ═══
 *   1. bfs-miete-bezugsdauer-zimmerzahl: Durchschnittsmietpreis je
 *      Bezugsdauerklasse (Total, Neubau, Neubezug>2J, 2-5J, 6-10J, 11-20J,
 *      21J+), pro Jahr ein Sheet.
 *   2. bfs-miete-anteile-zimmerzahl: Bevölkerungsanteil (%) je Bezugsdauer-
 *      klasse, aus DERSELBEN Erhebung (Strukturerhebung) — Grundlage für die
 *      gewichtete Variante.
 *
 * ═══ METHODISCHE ENTSCHEIDUNG (dokumentiert, Betreiber entscheidet final) ═══
 * Neumieter-Proxy = Zeile "Neubezug einer mehr als zwei Jahre alten Wohnung"
 * (kürzeste NICHT-Neubau-Klasse), NICHT "Neubau" — Neubauwohnungen sind eine
 * Sondersituation (Erstvermietung, oft Premium-Segment), keine repräsentativen
 * "neuen" Mieter im Bestand.
 *
 * ZWEI VARIANTEN werden berechnet, KONZEPTFRAGE an den Betreiber:
 *   - "full": Wachstum der Neubezug-Proxy-Zeile ungewichtet gegen Total.
 *   - "weighted": Neubezug-Wachstum gewichtet mit dem tatsächlichen
 *     Bevölkerungsanteil der Neubezug-Klasse (aus Tabelle 2, NICHT mit der
 *     separaten Umzugsquote 9.3%/Jahr aus einer früheren Session — dieser
 *     Anteilswert stammt aus DERSELBEN Erhebung wie die Mietpreise selbst,
 *     interne Konsistenz statt einer fachfremden zweiten Kennzahl).
 *
 * ═══ EINHEITEN-PRÜFUNG (Pflicht, siehe Betreiber-Anweisung) ═══
 * Beide Tabellen liefern CHF (Mietpreis) bzw. % (Anteil) — keine impliziten
 * Einheitenwechsel zwischen den Jahren geprüft (jede Jahreszahl im Sheet-
 * Namen entspricht exakt einem Kalenderjahr, keine Index-Werte, die mit
 * einer anderen Basis verwechselt werden könnten).
 *
 * ═══ WIDERSPRÜCHLICHER KREUZBEFUND (27.08.2026, MELDEPFLICHTIG) ═══
 * Die absolute Mietpreis-Tabelle (T 09.03.03.62) zeigt für den Neubezug-
 * Proxy 2020->2024 ein LANGSAMERES Wachstum als das Total (7.50% vs. 8.16%,
 * Delta -0.66pp). Die PARALLELE Tabelle "Durchschnittlicher Mietpreis PRO M2
 * nach Bezugsdauer" (T 09.03.03.63, DAM-Asset 36398530) zeigt für DIESELBEN
 * Jahre und DIESELBE Proxy-Zeile das GEGENTEIL: 9.71% vs. 7.88%, Delta
 * +1.84pp — also SCHNELLERES Wachstum bei Neubezug, wenn man pro Quadrat-
 * meter statt absolut misst. Naheliegende Erklärung (nicht verifiziert):
 * Neumieter beziehen im Schnitt kleinere Wohnungen als der Bestand, was den
 * absoluten Mietpreis dämpft, obwohl der Preis pro Fläche stärker steigt.
 * FOLGE: Die Richtung des "versteckten" Mietinflationseffekts hängt von der
 * gewählten Masszahl ab (absolut vs. pro m2) — nicht nur von der gewählten
 * Variante (full/weighted). Dieses Skript rechnet mit dem ABSOLUTEN Mietpreis
 * (konsistent mit dem LIK-Mietpreisindex, der ebenfalls Netto-Mietzins in
 * CHF misst, nicht CHF/m2) — der Gegenbefund aus der pro-m2-Tabelle wird
 * NICHT stillschweigend verworfen, sondern in der Output-Datei als
 * `crossCheckPerSqm` mitgeführt und muss vor jeder produktiven Nutzung
 * dieser Korrekturkomponente an den Betreiber gemeldet werden.
 *
 * Usage:
 *   node build-rent-correction.mjs --price-input <xlsx> --share-input <xlsx>
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
const shareInputPath = argVal('--share-input');
const sqmInputPath = argVal('--sqm-input'); // optional: Kreuzprüfung pro m2 (siehe Kommentarblock oben)

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

const PROXY_ROW_LABEL = 'Neubezug einer mehr als zwei Jahre alten Wohnung';
const TOTAL_ROW_LABEL = 'Total';
// Sheets sind Jahreszahlen als String — bewusst hart geprüft, nicht geraten,
// damit ein künftiger Jahrgangswechsel (z.B. 2021-2025 statt 2020-2024)
// nicht still falsche Jahre zuordnet.
const EXPECTED_YEARS = ['2020', '2021', '2022', '2023', '2024'];

/**
 * Extrahiert Total- und Proxy-Zeile (Spalte "Total" über alle Zimmerzahlen)
 * für ein gegebenes Jahr aus der Mietpreis-Tabelle.
 */
/**
 * Findet GENAU EINE Zeile mit dem gegebenen Label. Wirft bei 0 ODER MEHR ALS
 * 1 Treffer (Code-Review-Finding, 27.08.2026: `.find()` nimmt stillschweigend
 * den ERSTEN Treffer bei mehrdeutigen Labels — BFS-Tabellen können Teil-
 * Totale mit demselben Label wie das Gesamt-Total enthalten. Ein numerisch
 * gültiger, aber falscher Treffer wäre sonst nicht von der richtigen Zeile
 * unterscheidbar und würde lautlos falsche Werte liefern).
 */
function findExactlyOneRow(rows, label, context) {
  const matches = rows.filter((r) => r[0] === label);
  if (matches.length === 0) throw new DataContractError([`${context}: Zeile '${label}' nicht gefunden.`]);
  if (matches.length > 1) throw new DataContractError([`${context}: Zeile '${label}' ist MEHRDEUTIG (${matches.length} Treffer) — Tabellenstruktur hat sich vermutlich geändert, nicht automatisch den ersten Treffer verwenden.`]);
  return matches[0];
}

// Spalte 1 = "Total"-Zimmerzahl-Spalte (Durchschnittlicher Mietpreis über alle
// Zimmerzahlen), Spalte 2 = Vertrauensintervall — verifiziert 27.08.2026
// gegen echte BFS-Datei (T 09.03.03.62, Sheet-Struktur siehe Kommentarblock
// oben). Gleiche Spaltenposition wie bei extractSqmRow (T 09.03.03.63, exakt
// analoge Struktur, nur andere Einheit).
const PRICE_VALUE_COLUMN = 1;

async function extractPriceRow(xlsxPath, year) {
  const rows = await readSheet(xlsxPath, year);
  const totalRow = findExactlyOneRow(rows, TOTAL_ROW_LABEL, `Sheet ${year}`);
  const proxyRow = findExactlyOneRow(rows, PROXY_ROW_LABEL, `Sheet ${year}`);
  const totalPrice = totalRow[PRICE_VALUE_COLUMN];
  const proxyPrice = proxyRow[PRICE_VALUE_COLUMN];
  if (typeof totalPrice !== 'number' || typeof proxyPrice !== 'number') {
    throw new DataContractError([`Sheet ${year}: Mietpreis-Werte nicht numerisch (Total=${totalPrice}, Proxy=${proxyPrice}) — Struktur hat sich vermutlich geändert.`]);
  }
  return { year: Number(year), totalPrice, proxyPrice };
}

/**
 * Extrahiert den Bevölkerungsanteil (%) der Proxy-Klasse für ein Jahr aus
 * der Anteile-Tabelle. Spalte "Anteil in %" für die Total-Zimmerzahl-Spalte.
 */
/**
 * Kreuzprüfung: gleiche Extraktion, aber für die pro-m2-Tabelle (T
 * 09.03.03.63, DAM-Asset 36398530) — gleiche Zeilenstruktur, andere Einheit.
 */
async function extractSqmRow(xlsxPath, year) {
  const rows = await readSheet(xlsxPath, year);
  const totalRow = findExactlyOneRow(rows, TOTAL_ROW_LABEL, `Sheet ${year} (pro m2)`);
  const proxyRow = findExactlyOneRow(rows, PROXY_ROW_LABEL, `Sheet ${year} (pro m2)`);
  const totalPerSqm = totalRow[PRICE_VALUE_COLUMN];
  const proxyPerSqm = proxyRow[PRICE_VALUE_COLUMN];
  if (typeof totalPerSqm !== 'number' || typeof proxyPerSqm !== 'number') {
    throw new DataContractError([`Sheet ${year} (pro m2): Werte nicht numerisch.`]);
  }
  return { year: Number(year), totalPerSqm, proxyPerSqm };
}

// Struktur der Anteile-Tabelle (T 09.03.03.61, verifiziert 27.08.2026):
// Spalte 0=Label, 1=Absolute Zahlen, 2=Vertrauensintervall(Zahlen),
// 3=Neubau%, 4=CI, 5=Neubezug>2J%, 6=CI, ... — eigene Konstante statt
// PRICE_VALUE_COLUMN, da andere Tabelle mit anderer Spaltenbedeutung.
const SHARE_NEUBEZUG_VALUE_COLUMN = 5;

async function extractShareRow(xlsxPath, year) {
  const rows = await readSheet(xlsxPath, year);
  const totalRow = findExactlyOneRow(rows, TOTAL_ROW_LABEL, `Sheet ${year} (Anteile)`);
  const neubezugShare = totalRow[SHARE_NEUBEZUG_VALUE_COLUMN];
  if (typeof neubezugShare !== 'number') {
    throw new DataContractError([`Sheet ${year} (Anteile): Neubezug-Anteil nicht numerisch (${neubezugShare}) — Struktur hat sich vermutlich geändert.`]);
  }
  return { year: Number(year), neubezugSharePercent: neubezugShare };
}

/**
 * Einheiten-Prüfung (Betreiber-Vorgabe, verstärkt nach Code-Review-Finding 1,
 * 27.08.2026): Mietpreise müssen CHF-Grössenordnung haben (nicht z.B.
 * versehentlich Index-Werte um 100), CHF/m2-Preise eine eigene, kleinere
 * Grössenordnung, Anteile müssen Prozentwerte in [0,100] sein.
 * `sqmSeries` ist optional (nur wenn --sqm-input übergeben wurde) — OHNE
 * diese Prüfung würde ein struktureller Fehler in der m2-Tabelle (z.B. eine
 * verschobene, aber weiterhin numerische Spalte) NICHT erkannt, weil der
 * m2-Wachstumsblock vorher nur `typeof === 'number'` prüft, keine Grössen-
 * ordnung — ein Einheitenfehler wäre sonst lautlos durchgelaufen (exakt das
 * Muster, das dieses Projekt schon mehrfach getroffen hat).
 */
function assertUnitsConsistent(priceSeries, shareSeries, sqmSeries) {
  const issues = [];
  for (const p of priceSeries) {
    if (p.totalPrice < 200 || p.totalPrice > 10000) {
      issues.push(`Jahr ${p.year}: totalPrice=${p.totalPrice} ausserhalb plausibler CHF-Mietpreis-Grössenordnung [200, 10000] — Einheitenfehler-Verdacht.`);
    }
    if (p.proxyPrice < 200 || p.proxyPrice > 10000) {
      issues.push(`Jahr ${p.year}: proxyPrice=${p.proxyPrice} ausserhalb plausibler CHF-Mietpreis-Grössenordnung [200, 10000] — Einheitenfehler-Verdacht.`);
    }
  }
  for (const s of shareSeries) {
    if (s.neubezugSharePercent < 0 || s.neubezugSharePercent > 100) {
      issues.push(`Jahr ${s.year}: neubezugSharePercent=${s.neubezugSharePercent} ausserhalb [0,100] — kein gültiger Prozentwert, Einheitenfehler-Verdacht.`);
    }
  }
  if (sqmSeries) {
    for (const sq of sqmSeries) {
      if (sq.totalPerSqm < 5 || sq.totalPerSqm > 100) {
        issues.push(`Jahr ${sq.year}: totalPerSqm=${sq.totalPerSqm} ausserhalb plausibler CHF/m²-Grössenordnung [5, 100] — Einheitenfehler-Verdacht.`);
      }
      if (sq.proxyPerSqm < 5 || sq.proxyPerSqm > 100) {
        issues.push(`Jahr ${sq.year}: proxyPerSqm=${sq.proxyPerSqm} ausserhalb plausibler CHF/m²-Grössenordnung [5, 100] — Einheitenfehler-Verdacht.`);
      }
    }
  }
  if (issues.length > 0) throw new DataContractError(issues);
}

/** Variante "full": ungewichtetes Wachstum Neubezug-Proxy vs. Total. */
function computeFullVariant(priceSeries) {
  const first = priceSeries[0];
  const last = priceSeries[priceSeries.length - 1];
  const totalGrowthPercent = (last.totalPrice / first.totalPrice - 1) * 100;
  const proxyGrowthPercent = (last.proxyPrice / first.proxyPrice - 1) * 100;
  return {
    variant: 'full',
    fromYear: first.year,
    toYear: last.year,
    totalGrowthPercent: Math.round(totalGrowthPercent * 100) / 100,
    proxyGrowthPercent: Math.round(proxyGrowthPercent * 100) / 100,
    correctionDeltaPercentagePoints: Math.round((proxyGrowthPercent - totalGrowthPercent) * 100) / 100,
  };
}

/**
 * Variante "weighted": Proxy-Wachstum gewichtet mit dem tatsächlichen
 * Bevölkerungsanteil der Neubezug-Klasse im jeweiligen Jahr (Mittel über
 * den Zeitraum, da der Anteil sich leicht von Jahr zu Jahr ändert).
 */
function computeWeightedVariant(priceSeries, shareSeries) {
  const first = priceSeries[0];
  const last = priceSeries[priceSeries.length - 1];
  const totalGrowthPercent = (last.totalPrice / first.totalPrice - 1) * 100;
  const proxyGrowthPercent = (last.proxyPrice / first.proxyPrice - 1) * 100;

  const avgShare = shareSeries.reduce((sum, s) => sum + s.neubezugSharePercent, 0) / shareSeries.length;
  const weight = avgShare / 100;

  // METHODISCHE NÄHERUNG, nicht exakte Dekomposition (Code-Review-Finding 5,
  // 27.08.2026, explizit als solche gekennzeichnet statt implizit stehen zu
  // lassen): "Total" enthält den Neubezug-Anteil bereits, eine exakte
  // Ersetzung müsste ihn zuerst herausrechnen (totalGrowth als gewichtetes
  // Mittel ALLER Bezugsdauerklassen inkl. Neubezug interpretieren und dann
  // NUR die Neubezug-Komponente ersetzen). Diese Formel macht stattdessen
  // eine gröbere lineare Mischung aus Gesamt- und Proxy-Wachstum, gewichtet
  // mit dem mittleren Bevölkerungsanteil über den Zeitraum (nicht Start-/
  // Endjahr separat) — als Sensitivitäts-Kennzahl brauchbar, NICHT als exakte
  // Dekomposition zu interpretieren. Bei Bedarf einer präziseren Berechnung:
  // Formel neu herleiten statt diese Annäherung zu verfeinern.
  const weightedGrowthPercent = (1 - weight) * totalGrowthPercent + weight * proxyGrowthPercent;

  return {
    variant: 'weighted',
    fromYear: first.year,
    toYear: last.year,
    avgNeubezugSharePercent: Math.round(avgShare * 100) / 100,
    totalGrowthPercent: Math.round(totalGrowthPercent * 100) / 100,
    proxyGrowthPercent: Math.round(proxyGrowthPercent * 100) / 100,
    weightedGrowthPercent: Math.round(weightedGrowthPercent * 100) / 100,
    correctionDeltaPercentagePoints: Math.round((weightedGrowthPercent - totalGrowthPercent) * 100) / 100,
  };
}

async function main() {
  if (!priceInputPath || !shareInputPath) {
    console.error('Usage: node build-rent-correction.mjs --price-input <xlsx> --share-input <xlsx>');
    process.exit(1);
  }
  console.log('=== trueflation.ch — Miet-Korrektur (Requirements 2.2b, V3) ===\n');
  console.log('⚠️  EINSCHRÄNKUNG: Quelltabellen liefern nur 2020-2024, nicht ab 2010 (siehe Kommentarblock im Skript).\n');

  const resolvedPricePath = path.resolve(REPO_ROOT, priceInputPath);
  const resolvedSharePath = path.resolve(REPO_ROOT, shareInputPath);

  const priceSeries = [];
  const shareSeries = [];
  for (const year of EXPECTED_YEARS) {
    priceSeries.push(await extractPriceRow(resolvedPricePath, year));
    shareSeries.push(await extractShareRow(resolvedSharePath, year));
  }
  console.log(`[datenvertrag] OK — ${priceSeries.length} Jahre Mietpreis, ${shareSeries.length} Jahre Anteile.`);

  // Rohdaten der m2-Kreuzprüfung EINLESEN, aber noch NICHT verrechnen —
  // Validierung (assertUnitsConsistent) muss VOR jeder Wachstumsberechnung
  // laufen (Code-Review-Finding 1, 27.08.2026: sonst würde ein Einheiten-
  // fehler in der m2-Tabelle lautlos zu NaN/Infinity/null im Output führen,
  // statt kontrolliert abzubrechen).
  let sqmSeries = null;
  if (sqmInputPath) {
    const resolvedSqmPath = path.resolve(REPO_ROOT, sqmInputPath);
    sqmSeries = [];
    for (const year of EXPECTED_YEARS) {
      sqmSeries.push(await extractSqmRow(resolvedSqmPath, year));
    }
  }

  assertUnitsConsistent(priceSeries, shareSeries, sqmSeries);
  console.log('[einheiten] OK — alle Werte in plausibler Grössenordnung (CHF bzw. %).');

  let sqmCrossCheck = null;
  if (sqmSeries) {
    const firstSqm = sqmSeries[0];
    const lastSqm = sqmSeries[sqmSeries.length - 1];
    const totalGrowthPerSqm = (lastSqm.totalPerSqm / firstSqm.totalPerSqm - 1) * 100;
    const proxyGrowthPerSqm = (lastSqm.proxyPerSqm / firstSqm.proxyPerSqm - 1) * 100;
    sqmCrossCheck = {
      fromYear: firstSqm.year,
      toYear: lastSqm.year,
      totalGrowthPercent: Math.round(totalGrowthPerSqm * 100) / 100,
      proxyGrowthPercent: Math.round(proxyGrowthPerSqm * 100) / 100,
      correctionDeltaPercentagePoints: Math.round((proxyGrowthPerSqm - totalGrowthPerSqm) * 100) / 100,
    };
    console.log('\n--- Kreuzprüfung pro m² (T 09.03.03.63) ---');
    console.log(`  Bestandsmiete pro m² ${sqmCrossCheck.fromYear}->${sqmCrossCheck.toYear}: ${sqmCrossCheck.totalGrowthPercent}%`);
    console.log(`  Neubezug-Proxy pro m² ${sqmCrossCheck.fromYear}->${sqmCrossCheck.toYear}: ${sqmCrossCheck.proxyGrowthPercent}%`);
    console.log(`  Korrektur-Delta pro m²: ${sqmCrossCheck.correctionDeltaPercentagePoints} pp`);
  }

  const fullVariant = computeFullVariant(priceSeries);
  const weightedVariant = computeWeightedVariant(priceSeries, shareSeries);

  console.log('\n--- Variante "full" (ungewichtet) ---');
  console.log(`  Bestandsmiete (Total) ${fullVariant.fromYear}->${fullVariant.toYear}: ${fullVariant.totalGrowthPercent}%`);
  console.log(`  Neubezug-Proxy ${fullVariant.fromYear}->${fullVariant.toYear}: ${fullVariant.proxyGrowthPercent}%`);
  console.log(`  Korrektur-Delta: ${fullVariant.correctionDeltaPercentagePoints} pp`);

  console.log('\n--- Variante "weighted" (mit Bevölkerungsanteil Neubezug) ---');
  console.log(`  Ø Neubezug-Anteil: ${weightedVariant.avgNeubezugSharePercent}%`);
  console.log(`  Gewichtetes Wachstum: ${weightedVariant.weightedGrowthPercent}%`);
  console.log(`  Korrektur-Delta: ${weightedVariant.correctionDeltaPercentagePoints} pp`);

  console.log('\n⚠️  KONZEPTFRAGE (Betreiber-Entscheidung ausstehend): welche Variante wird in 2.2b produktiv verwendet?');
  console.log('⚠️  ABDECKUNGSLÜCKE (Betreiber-Meldung ausstehend): Reihe deckt nur 2020-2024, nicht 2010-2024 wie in Requirements 2.2b angenommen.');

  if (sqmCrossCheck) {
    const absoluteSign = Math.sign(fullVariant.correctionDeltaPercentagePoints);
    const sqmSign = Math.sign(sqmCrossCheck.correctionDeltaPercentagePoints);
    if (absoluteSign !== 0 && sqmSign !== 0 && absoluteSign !== sqmSign) {
      console.log('\n🚨 WIDERSPRUCHSBEFUND (MELDEPFLICHTIG): Absoluter Mietpreis und Preis pro m² zeigen ENTGEGENGESETZTE Korrekturrichtung!');
      console.log(`   Absolut: ${fullVariant.correctionDeltaPercentagePoints} pp | Pro m²: ${sqmCrossCheck.correctionDeltaPercentagePoints} pp`);
      console.log('   Mögliche Ursache (nicht verifiziert): Neumieter beziehen im Schnitt kleinere Wohnungen als der Bestand.');
      console.log('   Nicht selbst entschieden — an Betreiber zu melden, bevor diese Komponente produktiv verwendet wird.');
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    _comment:
      'Automatisch generiert durch scripts/pipeline/build-rent-correction.mjs. ' +
      'BEIDE Varianten (full/weighted) werden berechnet — Betreiber entscheidet, welche produktiv in 2.2b verwendet wird. ' +
      'WESENTLICHE EINSCHRÄNKUNG: Quelltabellen liefern nur 2020-2024 (5 Jahre), NICHT ab 2010 wie ursprünglich in Requirements ' +
      '2.2b angenommen — kein Archivzugang für 2010-2019 über DAM/opendata.swiss gefunden (Stand 27.08.2026). ' +
      'Formel-Reihenfolge (Betreiber-Vorgabe, verbindlich): Diese Miet-Korrektur wird ERST auf die Preisreihen angewendet, ' +
      'BEVOR der Warenkorb fixiert/reskaliert wird (siehe 2.2a) — in der Trueflation-Gesamtberechnung zu beachten, sobald ' +
      'diese Komponente eingebaut wird.',
    proxyDefinition: PROXY_ROW_LABEL,
    excludedRow: 'Neubau (Sondersituation Erstvermietung, nicht repräsentativ für Bestandsmieter-Wechsel)',
    coverageLimitation: {
      requestedStart: 2010,
      actualStart: 2020,
      actualEnd: 2024,
      reason: 'Quelltabellen (BFS DAM assets 36398529/36398519) liefern nur die letzten 5 Jahrgänge, kein Archivzugang gefunden.',
    },
    priceSeries,
    shareSeries,
    variants: {
      full: fullVariant,
      weighted: weightedVariant,
    },
    crossCheckPerSqm: sqmCrossCheck
      ? {
          ...sqmCrossCheck,
          _comment:
            'Kreuzprüfung aus T 09.03.03.63 (Mietpreis PRO M2 statt absolut). ' +
            (Math.sign(fullVariant.correctionDeltaPercentagePoints) !== Math.sign(sqmCrossCheck.correctionDeltaPercentagePoints) &&
            Math.sign(fullVariant.correctionDeltaPercentagePoints) !== 0 &&
            Math.sign(sqmCrossCheck.correctionDeltaPercentagePoints) !== 0
              ? 'WIDERSPRUCH: entgegengesetzte Korrekturrichtung ggü. absolutem Mietpreis (variants.full) — vor produktiver Nutzung an Betreiber zu melden.'
              : 'Richtung konsistent mit absolutem Mietpreis.'),
        }
      : null,
  };

  writeFileSync(path.join(OUTPUT_DIR, 'rent-correction.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`\n[geschrieben] ${OUTPUT_DIR}/rent-correction.json`);
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
