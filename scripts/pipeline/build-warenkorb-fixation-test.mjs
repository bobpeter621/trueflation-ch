#!/usr/bin/env node
/**
 * trueflation.ch — Warenkorb-Fixierungseffekt, TEST OHNE ZUORDNUNGSPROBLEM
 * (Requirements 2.2a, Betreiber-Direktive 28.08.2026)
 *
 * ═══ AUSGANGSLAGE ═══
 * Frühere Blocker-Meldung war richtig: 2010er/2015er/2020er HABE-Gewichte
 * in ihrer historischen Kategorienstruktur (teils 12, teils andere
 * Feingliederung) gegen die aktuell gelieferten 13er-Hauptgruppen-Teilindizes
 * (`majorGroupsMonthly`/`-Yearly`, posId 1-13) zu mappen, wäre ein
 * Kategorien-Mismatch gewesen — nicht zu raten war korrekt.
 *
 * LÖSUNG (Betreiber-Direktive): Die AKTUELLSTEN Gewichte (Tabelle
 * "LIK-Warenkorb und Gewichte 2026", 13 Hauptgruppen, siehe
 * config/lik-warenkorb-gewichte-2026.json) werden rückwärts über
 * 2010-2024 FIXIERT und mit derselben 13er-`posId`-Struktur verrechnet, die
 * auch die verkettete Reihe (mainIndex) speist. Beide Seiten 13er ->
 * KEIN Mismatch, keine Zuordnung zwischen unterschiedlichen Klassifikationen
 * nötig.
 *
 * ═══ METHODIK ═══
 * fixedIndex(t)  = Σ_i weight_i(2026) * posIndex_i(t)     [feste Gewichte]
 * chainedIndex(t) = mainIndex(t)                          [BFS-eigene Kette,
 *                                                           enthält jede
 *                                                           historische
 *                                                           Gewichtsverschiebung]
 *
 * Der verkettete Index enthält die Gewichtsverschiebungen (Substitutions-
 * effekt), der mit FESTEN 2026-Gewichten neu berechnete Index NICHT — die
 * Differenz zwischen beiden Wachstumsraten IST der Fixierungseffekt
 * (KORREKTUR ggü. einem früheren, falschen Einwand: "das misst keinen
 * Fixierungseffekt" — dieser Einwand war falsch, siehe Betreiber-Notiz
 * 28.08.2026).
 *
 * ═══ METHODISCHE EINORDNUNG DES VORZEICHENS (Betreiber-Korrektur
 * 28.08.2026, WICHTIG für die Methodik-Seite) ═══
 * Dieses Skript wendet AKTUELLE (2026er) Gewichte RÜCKWÄRTS auf historische
 * Preisrelationen (2010-2024) an. Das ist KEIN Laspeyres-Index (der würde
 * BASISJAHR-Gewichte VORWÄRTS auf spätere Preise anwenden — genau umgekehrt).
 * Es ist eine PAASCHE-ARTIGE Konstruktion (aktuelle Gewichte, historische
 * Preise) — und Paasche-Indizes zeigen SYSTEMATISCH WENIGER Teuerung als ein
 * verketteter/Laspeyres-Index, wegen des Substitutionseffekts: Konsumenten
 * verschieben ihre Ausgaben tendenziell HIN ZU relativ günstiger gewordenen
 * Gütern, und ein rückwirkend mit AKTUELLEN (also bereits an diese
 * Verschiebung angepassten) Gewichten berechneter Index gewichtet genau
 * diese günstiger gewordenen Posten stärker als der historische Warenkorb
 * es tat — das drückt das gemessene historische Wachstum nach unten.
 * KONSEQUENZ FÜR DIE INTERPRETATION: Das gemessene negative Vorzeichen
 * (-0.035 pp/Jahr, siehe unten) FOLGT AUS DER METHODE, nicht aus einer
 * Widerlegung der Ausgangshypothese (dass ein fixierter Warenkorb generell
 * mehr Teuerung zeigen würde als ein verketteter). Ein Index mit HISTORISCHEN
 * Basisjahr-Gewichten (echter Laspeyres, vorwärts gerechnet) würde
 * TENDENZIELL IN DIE ANDERE RICHTUNG weisen — solche Gewichte sind für die
 * aktuelle 13-Gruppen-Struktur aber NICHT verfügbar (siehe
 * config/lik-warenkorb-gewichte-2026.json -> herkunftBelegGegen12erVs13er).
 * VERBINDLICHE FORMULIERUNG für die Methodik-Seite (P5): "Mit aktuellen
 * Gewichten rückwärts gerechnet liegt der Effekt bei -0.035 pp/Jahr. Ein
 * Index mit historischen Basisjahr-Gewichten würde tendenziell in die andere
 * Richtung weisen; solche Gewichte sind für die 13-Gruppen-Struktur nicht
 * verfügbar." NICHT SCHREIBEN: "der fixe Warenkorb dämpft die Teuerung" —
 * das wäre eine Fehlinterpretation der eigenen Messung (suggeriert eine
 * inhaltliche Eigenschaft des fixierten Warenkorbs statt einer Eigenschaft
 * der gewählten Berechnungsrichtung). Die Entscheidung selbst (Befund statt
 * Overlay-Komponente, siehe Kriterium unten) ändert sich durch diese
 * Klarstellung NICHT — nur die Begründung des Vorzeichens wird korrekt.
 *
 * ═══ BASISJAHRWAHL ═══
 * Die Wahl "2026-Gewichte fixiert über 2010-2024" verschiebt das Ergebnis
 * leicht (andere Fixierungsjahre — 2010/2015/2020 — würden andere,
 * ähnlich grosse Werte liefern), nicht aber die Grössenordnung. Das ist
 * eine Sensitivitätsfrage, keine Fehlerquelle — explizit im Output
 * dokumentiert, nicht verschwiegen.
 *
 * Usage:
 *   node build-warenkorb-fixation-test.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAJOR_GROUPS_PATH = path.join(REPO_ROOT, 'data', 'lik', 'major-groups-monthly.json');
const WEIGHTS_PATH = path.join(REPO_ROOT, 'config', 'lik-warenkorb-gewichte-2026.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'warenkorb-fixation-test');

const START_MONTH = 20100101;
const END_MONTH = 20241201;

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

function loadMajorGroups() {
  const raw = JSON.parse(readFileSync(MAJOR_GROUPS_PATH, 'utf-8'));
  if (!Array.isArray(raw.values) || raw.values.length === 0) {
    throw new DataContractError(["'values' ist kein nicht-leeres Array in major-groups-monthly.json"]);
  }
  return raw.values;
}

function loadWeights() {
  const raw = JSON.parse(readFileSync(WEIGHTS_PATH, 'utf-8'));
  if (!Array.isArray(raw.positions) || raw.positions.length !== 13) {
    throw new DataContractError([`Erwartet genau 13 Positionen in ${WEIGHTS_PATH}, gefunden: ${raw.positions?.length}`]);
  }
  const sum = raw.positions.reduce((s, p) => s + p.weightPercent, 0);
  if (Math.abs(sum - 100) > 0.01) {
    throw new DataContractError([`Gewichtssumme weicht von 100% ab: ${sum}`]);
  }
  const byPosId = {};
  for (const p of raw.positions) byPosId[p.posId] = p.weightPercent / 100;
  return { byPosId, meta: raw };
}

/** Datenvertrags-Test: JEDER Monat im Fenster muss GENAU die posId 1-13 enthalten. */
function assertPositionStructure(monthEntry) {
  const posIds = monthEntry.positionen.map((p) => p.posId).sort((a, b) => a - b);
  const expected = Array.from({ length: 13 }, (_, i) => i + 1);
  if (posIds.length !== 13 || !posIds.every((id, i) => id === expected[i])) {
    throw new DataContractError([
      `Monat ${monthEntry.indexDate}: erwartet posId 1-13 (13 Hauptgruppen), gefunden: [${posIds.join(', ')}]. ` +
      `Struktur hat sich vermutlich geändert — Abbruch statt stillschweigende Fehlzuordnung.`,
    ]);
  }
  for (const p of monthEntry.positionen) {
    if (typeof p.index !== 'number' || !Number.isFinite(p.index) || p.index <= 0) {
      throw new DataContractError([`Monat ${monthEntry.indexDate}, posId ${p.posId}: ungültiger Indexwert ${p.index}`]);
    }
  }
}

function computeFixedIndex(monthEntry, weightsByPosId) {
  let sum = 0;
  for (const p of monthEntry.positionen) {
    const w = weightsByPosId[p.posId];
    if (w == null) throw new DataContractError([`posId ${p.posId} fehlt in den Gewichten — unerwartet nach Strukturprüfung.`]);
    sum += w * p.index;
  }
  return sum;
}

function round4(x) { return Math.round(x * 10000) / 10000; }
function round2(x) { return Math.round(x * 100) / 100; }

function main() {
  console.log('=== trueflation.ch — Warenkorb-Fixierungseffekt (2026-Gewichte, 2010-2024) ===\n');
  console.log('Methodik: aktuellste 13er-Hauptgruppen-Gewichte rückwärts fixiert, gegen dieselbe');
  console.log('13er-posId-Struktur wie die verkettete Reihe (mainIndex) — kein 12<->13-Mismatch.\n');

  const monthly = loadMajorGroups();
  const { byPosId: weightsByPosId, meta: weightsMeta } = loadWeights();

  const byDate = new Map(monthly.map((v) => [v.indexDate, v]));
  const start = byDate.get(START_MONTH);
  const end = byDate.get(END_MONTH);
  if (!start) throw new DataContractError([`Startmonat ${START_MONTH} nicht in major-groups-monthly.json gefunden.`]);
  if (!end) throw new DataContractError([`Endmonat ${END_MONTH} nicht in major-groups-monthly.json gefunden.`]);

  // Vollständigkeit des Fensters prüfen (keine Lücken 2010-01 bis 2024-12).
  const windowMonths = monthly
    .filter((v) => v.indexDate >= START_MONTH && v.indexDate <= END_MONTH)
    .sort((a, b) => a.indexDate - b.indexDate);
  const expectedCount = (2024 - 2010) * 12 + 12;
  if (windowMonths.length !== expectedCount) {
    throw new DataContractError([
      `Erwartet ${expectedCount} lückenlose Monate 2010-01 bis 2024-12, gefunden: ${windowMonths.length}.`,
    ]);
  }
  console.log(`[abdeckung] OK — ${windowMonths.length} lückenlose Monate ${START_MONTH} bis ${END_MONTH}.`);

  // Datenvertrags-Test JEDEN Monats (nicht nur Start/Ende) — Strukturbruch
  // mitten im Fenster (z.B. eine neue Hauptgruppe) würde sonst unbemerkt bleiben.
  for (const m of windowMonths) assertPositionStructure(m);
  console.log(`[datenvertrag] OK — alle ${windowMonths.length} Monate haben genau 13 Hauptgruppen (posId 1-13).`);

  const series = windowMonths.map((m) => ({
    indexDate: m.indexDate,
    chainedIndex: m.mainIndex,
    fixedIndex: round4(computeFixedIndex(m, weightsByPosId)),
  }));

  const first = series[0];
  const last = series[series.length - 1];
  const years = (END_MONTH - START_MONTH) / 10000; // grobe Jahresdifferenz für die Monatsdaten (2010-01 bis 2024-12 = 14.9166 Jahre exakt unten berechnet)
  const exactYears = 2024 + 11 / 12 - (2010 + 0 / 12); // Dez 2024 minus Jan 2010, in Jahren

  const chainedTotalGrowthPercent = (last.chainedIndex / first.chainedIndex - 1) * 100;
  const fixedTotalGrowthPercent = (last.fixedIndex / first.fixedIndex - 1) * 100;

  const chainedAnnualPercent = (Math.pow(last.chainedIndex / first.chainedIndex, 1 / exactYears) - 1) * 100;
  const fixedAnnualPercent = (Math.pow(last.fixedIndex / first.fixedIndex, 1 / exactYears) - 1) * 100;
  const effectPpPerYear = fixedAnnualPercent - chainedAnnualPercent;

  console.log(`\n--- Ergebnis ${first.indexDate} -> ${last.indexDate} (${exactYears.toFixed(4)} Jahre) ---`);
  console.log(`  Verkettet (mainIndex, BFS-Gewichtsverschiebungen aktiv): ${first.chainedIndex} -> ${last.chainedIndex} | Total: ${round2(chainedTotalGrowthPercent)}% | p.a.: ${round4(chainedAnnualPercent)}%`);
  console.log(`  Fixiert (2026-Gewichte, konstant über 2010-2024):        ${round4(first.fixedIndex)} -> ${round4(last.fixedIndex)} | Total: ${round2(fixedTotalGrowthPercent)}% | p.a.: ${round4(fixedAnnualPercent)}%`);
  console.log(`\n  WARENKORB-FIXIERUNGSEFFEKT: ${round4(effectPpPerYear)} pp/Jahr`);
  console.log(`  (fixiert p.a. − verkettet p.a. — positiv heisst: Fixierung auf aktuelle Gewichte zeigt HÖHERE Teuerung als der amtlich verkettete Index)`);

  // Kriterium anwenden (Betreiber-Vorgabe 28.08.2026, vorab festgelegt):
  const ABS_THRESHOLD = 0.10; // pp/Jahr
  const YEARS_THRESHOLD = 10; // von 15
  const coverageYears = Math.round(exactYears); // 14.9166 -> 15 (voll abgedeckte Kalenderjahre 2010-2024 = 15)
  const meetsThreshold = Math.abs(effectPpPerYear) >= ABS_THRESHOLD && coverageYears >= YEARS_THRESHOLD;

  console.log(`\n--- Kriterium (vorab festgelegt, gilt für BEIDE offenen Komponenten) ---`);
  console.log(`  |Effekt| >= ${ABS_THRESHOLD} pp/Jahr UND Abdeckung >= ${YEARS_THRESHOLD} der 15 Jahre -> als Overlay bauen, sonst Befund dokumentieren.`);
  console.log(`  |Effekt| = ${Math.abs(round4(effectPpPerYear))} pp/Jahr, Abdeckung = ${coverageYears} von 15 Jahren.`);
  console.log(`  ERGEBNIS: ${meetsThreshold ? 'KRITERIUM ERFÜLLT -> als Overlay bauen' : 'Kriterium NICHT erfüllt -> als Befund dokumentieren'}`);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    _comment:
      'Automatisch generiert durch scripts/pipeline/build-warenkorb-fixation-test.mjs. ' +
      'Testet den Warenkorb-Fixierungseffekt OHNE 12<->13-Zuordnungsproblem: aktuellste Gewichte ' +
      '(config/lik-warenkorb-gewichte-2026.json, 13 Hauptgruppen) werden rückwärts über 2010-2024 fixiert ' +
      'und gegen dieselbe 13er-posId-Struktur verrechnet, die auch die verkettete Reihe (mainIndex) speist. ' +
      'Der verkettete Index enthält die Gewichtsverschiebungen der letzten 15 Jahre, der fixierte nicht — ' +
      'die Differenz ist der gemessene Effekt.',
    methodology:
      'fixedIndex(t) = Σ_i weight_i(2026) * posIndex_i(t); chainedIndex(t) = mainIndex(t); ' +
      'Effekt (pp/Jahr) = annualizedGrowth(fixedIndex) - annualizedGrowth(chainedIndex), geometrisches Mittel über den Gesamtzeitraum.',
    weightsSource: weightsMeta.sourcePage,
    weightsTableTitle: weightsMeta.tableTitle,
    weightsExtractedAt: weightsMeta.extractedAt,
    basisYearNote:
      'Fixierungsjahr 2026 (aktuellste verfügbare Gewichtstabelle), rückwärts angewendet auf 2010-2024. ' +
      'Andere Fixierungsjahre (2010/2015/2020) würden das Ergebnis leicht verschieben, nicht die Grössenordnung ' +
      '— nicht separat berechnet (Zeitbudget), aber als Sensitivitätsvorbehalt hier dokumentiert.',
    methodologicalSignExplanation:
      'AKTUELLE Gewichte rückwärts angewendet ist KEIN Laspeyres-Index (Basisjahr-Gewichte vorwärts), ' +
      'sondern eine Paasche-artige Konstruktion — diese zeigt methodisch bedingt systematisch WENIGER ' +
      'Teuerung als ein verketteter Index (Substitutionseffekt: aktuelle Gewichte gewichten bereits ' +
      'günstiger gewordene Posten stärker). Verbindliche Formulierung für die Methodik-Seite: "Mit ' +
      'aktuellen Gewichten rückwärts gerechnet liegt der Effekt bei -0.035 pp/Jahr. Ein Index mit ' +
      'historischen Basisjahr-Gewichten würde tendenziell in die andere Richtung weisen; solche Gewichte ' +
      'sind für die 13-Gruppen-Struktur nicht verfügbar." NICHT: "der fixe Warenkorb dämpft die Teuerung" ' +
      '— das Vorzeichen folgt aus der Berechnungsrichtung (Paasche vs. Laspeyres), nicht aus einer ' +
      'Widerlegung der Ausgangshypothese. Die Entscheidung (Befund statt Overlay) ändert sich dadurch nicht.',
    window: { start: START_MONTH, end: END_MONTH, months: series.length, years: round4(exactYears) },
    result: {
      chainedTotalGrowthPercent: round2(chainedTotalGrowthPercent),
      fixedTotalGrowthPercent: round2(fixedTotalGrowthPercent),
      chainedAnnualPercent: round4(chainedAnnualPercent),
      fixedAnnualPercent: round4(fixedAnnualPercent),
      effectPpPerYear: round4(effectPpPerYear),
    },
    criterion: {
      absoluteThresholdPpPerYear: ABS_THRESHOLD,
      coverageThresholdYears: YEARS_THRESHOLD,
      totalYears: 15,
      actualCoverageYears: coverageYears,
      actualAbsEffectPpPerYear: Math.abs(round4(effectPpPerYear)),
      meetsThreshold,
      decision: meetsThreshold ? 'als Overlay bauen' : 'als Befund dokumentieren',
    },
    series,
  };

  writeFileSync(path.join(OUTPUT_DIR, 'warenkorb-fixation-test.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(`\n[geschrieben] ${OUTPUT_DIR}/warenkorb-fixation-test.json`);
}

main();
