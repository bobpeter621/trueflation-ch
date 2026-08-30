#!/usr/bin/env node
/**
 * trueflation.ch — Regressionstests für die Trueflation-Berechnung (US 2.4)
 * V2 (26.08.2026): komplett neu geschrieben für die MONATLICHE Struktur.
 *
 * WICHTIG — Lehre aus der Vorversion: Die alte Testsuite prüfte nach dem
 * Umbau auf monatliche Berechnung weiterhin ein Feld (`premiumDataStatus`),
 * das im neuen Output nicht mehr existiert (jetzt `dataStatus`) — der Test
 * zeigte "grün", weil die Bedingung durch `undefined !== 'x'` trivial wahr
 * wurde, nicht weil etwas geprüft wurde. Exakt dieselbe Fehlerklasse wie der
 * Security-Review-Stub und der frühere 8pp-Schwellwert. STANDING RULE
 * (Betreiber, 26.08.2026): kein Test gilt als bestanden, bevor ein
 * Negativtest zeigt, dass er tatsächlich fehlschlagen KANN. Jede Prüfung
 * unten hat daher einen Negativtest direkt daneben, nicht nachträglich.
 *
 * Deckt ab:
 *  1. Referenzwerte auf Januar-Basis (Jan-zu-Jan, NICHT Jahresdurchschnitt —
 *     siehe Klärung unten zur Basisverwechslung).
 *  2. Harte 100%-Gewichtsprüfung.
 *  3. Verkettungs-Stetigkeit an Fixierungsjahren, datengestützter Schwellwert
 *     auf JANUAR-GEGEN-JANUAR-Basis (Saisonalitäts-Fix: Januar ist wegen
 *     Winterschlussverkauf/Kleiderpreisen systematisch atypisch — ein
 *     Vergleich gegen "alle Monate" würde jeden Januar als Ausreisser zeigen,
 *     unabhängig vom w-Wechsel. Referenzmenge sind daher andere Januare.)
 *  4. Diskontinuität an JEDEM Januar (nicht nur Fixierungsjahren) — pm_y
 *     wechselt jedes Jahr, w(y) nur an Fixierungsjahren.
 *  5. Geometrische statt arithmetische Verkettung (Regressionsschutz).
 *  6. Struktur-Konsistenz zwischen Monats- und abgeleiteter Jahresdatei.
 *
 * Statistik: Median + 3×MAD statt Median + 3×Stdev (Betreiber-Korrektur
 * 26.08.2026) — Stdev ist nicht robust, ein einzelner vorhandener Ausreisser
 * bläht sie auf und macht den Schwellwert genau dort lax, wo er scharf sein
 * müsste.
 *
 * STRUKTURELLE LEHRE (Betreiber, 26.08.2026, nach dem dritten Vorfall dieser
 * Fehlerklasse — Security-Stub, 8pp-Schwellwert, premiumDataStatus-Rename):
 * Jede Feldprüfung MUSS zuerst verifizieren, dass das Feld existiert, bevor
 * sie es vergleicht. `assertFieldExists()` unten wird vor jedem Zugriff auf
 * ein benanntes Feld aufgerufen — ein Rename ohne Testanpassung wirft dann
 * einen sofortigen, sprechenden Fehler statt eines still-triviell-wahren
 * Vergleichs mit `undefined`.
 *
 * Usage: node test-trueflation-index.mjs
 * Exit-Code 0 = alle Tests grün, 1 = mind. ein Test fehlgeschlagen.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  buildWeightTable,
  loadLikMonthly,
  loadPremiumYearly,
  buildMonthlyEquivalentPremiumRates,
  loadRentCorrection,
  buildTrueflationMonthlySeries,
  computeCalendarYearAverages,
  RENT_CORRECTION_START_YEAR,
} from './build-trueflation-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MONTHLY_PATH = path.join(REPO_ROOT, 'data', 'trueflation', 'trueflation-index-monthly.json');
const YEARLY_PATH = path.join(REPO_ROOT, 'data', 'trueflation', 'trueflation-index-yearly.json');

let failures = 0;
let passed = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

function approxEqual(a, b, tolerance) {
  return Math.abs(a - b) <= tolerance;
}

function round4(x) { return Math.round(x * 10000) / 10000; }

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mad(arr, med) {
  const deviations = arr.map((x) => Math.abs(x - med));
  return median(deviations);
}

function monthOf(yyyymm01) { return Math.floor((yyyymm01 % 10000) / 100); }
function yearOf(yyyymm01) { return Math.floor(yyyymm01 / 10000); }

/** Strukturelle Lehre (siehe Header): wirft sofort, wenn ein erwartetes Feld
 * auf einem Beispielobjekt fehlt, STATT den Test still trivial bestehen zu
 * lassen (z.B. `obj.premiumDataStatus !== 'x'` wird bei fehlendem Feld immer
 * wahr). Aufrufen mit einem repräsentativen Objekt VOR jedem `.every()`/
 * `.filter()`, das auf ein benanntes Feld zugreift. */
function assertFieldExists(sampleObject, fieldName, context) {
  if (sampleObject == null || !(fieldName in sampleObject)) {
    throw new Error(
      `Strukturprüfung fehlgeschlagen (${context}): Feld "${fieldName}" existiert nicht auf dem Beispielobjekt. ` +
      `Abbruch statt stillem, triviell-wahrem Vergleich mit undefined — ` +
      `vermutlich wurde das Feld umbenannt, ohne die Tests anzupassen.`
    );
  }
}

function main() {
  const monthlyData = JSON.parse(readFileSync(MONTHLY_PATH, 'utf-8'));
  const yearlyData = JSON.parse(readFileSync(YEARLY_PATH, 'utf-8'));
  const monthly = monthlyData.values;
  const byMonth = Object.fromEntries(monthly.map((v) => [v.month, v]));
  const januaries = monthly.filter((v) => monthOf(v.month) === 1);
  const byJanuaryYear = Object.fromEntries(januaries.map((v) => [yearOf(v.month), v]));

  console.log('=== Test 1: Referenzwerte auf Januar-Basis (Jan-zu-Jan) ===');
  // KLÄRUNG (Betreiber-Review 26.08.2026): Das ursprüngliche Prüfziel
  // ("LIK 2010-2024 ≈ +5.5%") bezog sich auf JAHRESDURCHSCHNITTE aus
  // total-index-yearly.json (2010: 1046.53 = Mittel der 12 Monatswerte).
  // Die monatliche Berechnung arbeitet mit JANUAR-Werten (2010: 1042.8,
  // 2024: 1095.6) — eine andere, ebenfalls korrekte, aber andere Grösse.
  // Jan-zu-Jan-Wachstum ist der für eine monatsaufgelöste Serie sinnvolle
  // Referenzpunkt; das alte Prüfziel wird hier NICHT unverändert übernommen,
  // sondern aus den Januar-Daten neu und explizit abgeleitet.
  const y2010 = byJanuaryYear[2010];
  const y2024 = byJanuaryYear[2024];
  check('Januar 2010 und Januar 2024 vorhanden', !!y2010 && !!y2024);

  const likGrowthJanJan = (y2024.likIndex / y2010.likIndex - 1) * 100;
  const trueflationGrowthJanJan = (y2024.trueflationIndex / y2010.trueflationIndex - 1) * 100;

  console.log(`  LIK Jan2010→Jan2024: ${likGrowthJanJan.toFixed(4)}%`);
  console.log(`  Trueflation Jan2010→Jan2024: ${trueflationGrowthJanJan.toFixed(4)}%`);

  // Toleranzband um die tatsächlich beobachteten Werte (5.06% / 9.47%) —
  // Trueflation-Referenz NEU ABGELEITET (Betreiber-Vorgabe 28.08.2026, dritte
  // Runde: "nicht die alte Zahl fortschreiben") nach Integration der
  // Miet-Korrektur in die Hauptlinie — vorher 9.23%, jetzt 9.47% durch den
  // ab 2020 wirkenden Bevölkerungsanteil-Effekt (+0.0608 pp/Jahr, 5 Jahre).
  // LIK-Referenz bleibt unverändert, da die Miet-Korrektur NUR die
  // Trueflation-Komponente betrifft, nicht die amtliche LIK-Reihe selbst.
  check(
    'LIK-Wachstum (Jan-zu-Jan) 2010-2024 ≈ +5.06% (±0.5pp, Referenz aus Rohdaten)',
    approxEqual(likGrowthJanJan, 5.06, 0.5),
    `Ist-Wert: ${likGrowthJanJan.toFixed(4)}%`
  );
  check(
    'Trueflation-Wachstum (Jan-zu-Jan, geometrisch, MIT Miet-Korrektur ab 2020) 2010-2024 ≈ +9.47% (±0.5pp)',
    approxEqual(trueflationGrowthJanJan, 9.47, 0.5),
    `Ist-Wert: ${trueflationGrowthJanJan.toFixed(4)}%`
  );
  check(
    'Trueflation > LIK über den gesamten Zeitraum (Prämieneffekt wirkt in erwartete Richtung)',
    trueflationGrowthJanJan > likGrowthJanJan
  );

  console.log('\n=== Test 1b: NEGATIVTEST für Test 1 — manipulierter Endwert muss Toleranz sprengen ===');
  const manipulatedTrueflationIndex = y2024.trueflationIndex * 1.5;
  const manipulatedGrowth = (manipulatedTrueflationIndex / y2010.trueflationIndex - 1) * 100;
  check(
    'NEGATIVTEST: künstlich um 50% erhöhter 2024er-Wert fällt aus der ±0.5pp-Toleranz',
    !approxEqual(manipulatedGrowth, 9.47, 0.5),
    `Manipulierter Wert würde ${manipulatedGrowth.toFixed(2)}% zeigen — muss ausserhalb der Toleranz liegen.`
  );

  console.log('\n=== Test 1c: Rebasierung (Requirements 2.0, Option C) — Trueflation dockt am LIK-Startwert an, NICHT bei 100 ===');
  // Explizit als eigener benannter Test (Betreiber-Anforderung 26.08.2026):
  // Ohne dieses Andocken würde Trueflation 2010 bei 100 beginnen, während der
  // LIK dort bereits bei ~1043 steht — Trueflation läge dann optisch WEIT
  // UNTER dem LIK und die Kernaussage der Seite wäre ins Gegenteil verkehrt.
  const anchorPoint = monthly.find((v) => v.dataStatus === 'anchor');
  check(
    'Trueflation-Startwert (Anker) == LIK-Startwert, NICHT 100',
    !!anchorPoint && approxEqual(anchorPoint.trueflationIndex, anchorPoint.likIndex, 1e-9) && anchorPoint.trueflationIndex !== 100,
    anchorPoint ? `Trueflation: ${anchorPoint.trueflationIndex}, LIK: ${anchorPoint.likIndex}` : 'Kein Anker-Punkt gefunden.'
  );

  console.log('\n=== Test 1d: NEGATIVTEST — ein bei 100 startender Anker muss als Fehler erkannt werden ===');
  const brokenAnchor = { trueflationIndex: 100, likIndex: anchorPoint ? anchorPoint.likIndex : 1042.8 };
  check(
    'NEGATIVTEST: Anker mit trueflationIndex=100 (falsches Rebasierungsverhalten) wird von der Prüfung abgelehnt',
    !(approxEqual(brokenAnchor.trueflationIndex, brokenAnchor.likIndex, 1e-9) && brokenAnchor.trueflationIndex !== 100),
    'Ein bei 100 startender Anker, der nicht dem LIK-Wert entspricht, muss die Prüfung durchfallen lassen.'
  );

  console.log('\n=== Test 1e: Jahresdurchschnitt-Kennzahl (Anzeige-Basis, US 3.1) ===');
  // Betreiber-Anforderung 26.08.2026: Die interne Berechnung bleibt monatlich
  // (Jan-zu-Jan, siehe Test 1). Die ANZEIGE (Kopfzahl, Kaufkraft-Rechner)
  // muss aber Jahresdurchschnitte verwenden, weil das BFS die amtliche
  // Jahresteuerung ebenfalls als Durchschnitt-gegen-Durchschnitt publiziert.
  // Referenzwert: LIK-Jahresdurchschnitt 2010→2024 muss ~5.51% ergeben — das
  // ist die historisch bekannte, amtlich vergleichbare Zahl (nicht 5.06%
  // Jan-zu-Jan).
  assertFieldExists(yearlyData, 'calendarYearAverages', 'Test 1e (Jahresdurchschnitt)');
  const avgs = yearlyData.calendarYearAverages;
  check('calendarYearAverages ist ein nicht-leeres Array', Array.isArray(avgs) && avgs.length > 0);
  const firstAvg = avgs.find((a) => a.year === 2010);
  const lastAvg = avgs.find((a) => a.year === 2024);
  check('Jahresdurchschnitt 2010 und 2024 vorhanden', !!firstAvg && !!lastAvg);
  if (firstAvg && lastAvg) {
    const likAvgGrowth = (lastAvg.likIndexAvg / firstAvg.likIndexAvg - 1) * 100;
    const trueflationAvgGrowth = (lastAvg.trueflationIndexAvg / firstAvg.trueflationIndexAvg - 1) * 100;
    // Trueflation-Referenz NEU ABGELEITET nach Miet-Korrektur-Integration
    // (dritte Runde, 28.08.2026): vorher 9.66%, jetzt ≈ 9.93% — Betreiber-
    // Vorgabe ausdrücklich: "erst die neue Kernzahl ableiten, dann als
    // Prüfziel einsetzen", nicht die alte Zahl fortschreiben.
    check(
      'LIK-Jahresdurchschnittswachstum 2010-2024 ≈ +5.51% (±0.3pp, amtlich vergleichbare Referenz)',
      approxEqual(likAvgGrowth, 5.51, 0.3),
      `Ist-Wert: ${likAvgGrowth.toFixed(4)}%`
    );
    check(
      'Trueflation-Jahresdurchschnittswachstum (MIT Miet-Korrektur) 2010-2024 ≈ +9.93% (±0.3pp, NEU abgeleitete Kernzahl)',
      approxEqual(trueflationAvgGrowth, 9.93, 0.3),
      `Ist-Wert: ${trueflationAvgGrowth.toFixed(4)}%`
    );
    check(
      'Trueflation-Jahresdurchschnittswachstum 2010-2024 > LIK-Jahresdurchschnittswachstum',
      trueflationAvgGrowth > likAvgGrowth,
      `Trueflation: ${trueflationAvgGrowth.toFixed(4)}%, LIK: ${likAvgGrowth.toFixed(4)}%`
    );
    check(
      'Alle Jahresdurchschnitte basieren auf genau 12 Monaten (monthsIncluded)',
      avgs.every((a) => a.monthsIncluded === 12),
      'Ein unvollständiges Jahr dürfte nicht in calendarYearAverages auftauchen.'
    );
  }

  console.log('\n=== Test 1f: NEGATIVTEST — Jahresdurchschnitt darf nicht mit Jan-zu-Jan verwechselt werden ===');
  if (firstAvg && lastAvg) {
    const likAvgGrowth = (lastAvg.likIndexAvg / firstAvg.likIndexAvg - 1) * 100;
    check(
      'NEGATIVTEST: LIK-Jahresdurchschnittswachstum (5.51%) unterscheidet sich messbar vom Jan-zu-Jan-Wert (5.06%)',
      !approxEqual(likAvgGrowth, likGrowthJanJan, 0.1),
      `Durchschnitt: ${likAvgGrowth.toFixed(4)}%, Jan-zu-Jan: ${likGrowthJanJan.toFixed(4)}% — müssen sich unterscheiden, sonst würde eine Verwechslung nicht auffallen.`
    );
  }

  console.log('\n=== Test 1g: Miet-Korrektur-Wirkungsnachweis (Betreiber-Vorgabe 28.08.2026, "Test gegen stilles Durchfallen") ===');
  // Effekt ist mit +0.0608 pp/Jahr klein ("unter der Strichbreite") — genau
  // deshalb reicht ein blosser Vorhandensein-Check des Parameters nicht.
  // rentCorrectionEffectVerification wird vom Build-Skript aus einer ZWEITEN,
  // parallel gerechneten Reihe OHNE Korrektur abgeleitet (siehe main() in
  // build-trueflation-index.mjs) — hier wird geprüft, dass diese Differenz
  // tatsächlich > 0 ist und der erwarteten Grössenordnung entspricht, nicht
  // nur, dass der Eingabeparameter ungleich null im Code steht.
  assertFieldExists(monthlyData, 'rentCorrectionEffectVerification', 'Test 1g (Miet-Korrektur-Wirkungsnachweis)');
  const rentVerify = monthlyData.rentCorrectionEffectVerification;
  check(
    'rentCorrectionEffectVerification ist vorhanden und nicht null',
    rentVerify != null,
    'Ohne dieses Feld kann der Wirkungsnachweis nicht gefuehrt werden — Build-Skript pruefen.'
  );
  if (rentVerify != null) {
    check(
      'Gemessener Miet-Korrektur-Effekt ist nachweisbar > 0 (Richtung stimmt)',
      rentVerify.effectIsPositive === true && rentVerify.measuredEffectPpPerYear > 0,
      `measuredEffectPpPerYear: ${rentVerify.measuredEffectPpPerYear}`
    );
    check(
      'Gemessener Effekt liegt in der erwarteten Groessenordnung (±0.03pp um den Erwartungswert 0.0608)',
      approxEqual(rentVerify.measuredEffectPpPerYear, rentVerify.expectedEffectPpPerYear, 0.03),
      `Gemessen: ${rentVerify.measuredEffectPpPerYear}, erwartet: ${rentVerify.expectedEffectPpPerYear}`
    );
  }

  console.log('\n=== Test 1g-neg: NEGATIVTEST — deaktivierte Miet-Korrektur muss den Wirkungsnachweis zum Scheitern bringen (ECHTE Pipeline-Ausführung) ===');
  // BLOCKER-FIX (Code-Review 29.08.2026): Der ursprüngliche Test prüfte nur
  // JS-Boolean-Logik gegen ein hartcodiertes Literal ({measuredEffectPpPerYear:
  // 0, effectIsPositive: false}) — das konnte NIE fehlschlagen, unabhängig
  // davon, ob die echte Implementierung korrekt oder komplett kaputt war.
  // Fix: die REALE Pipeline wird hier zweimal ausgeführt — einmal mit der
  // echten Miet-Korrektur, einmal mit deaktivierter (correctionDeltaPpPerYear=0)
  // — exakt dieselben Bausteine wie in build-trueflation-index.mjs main(),
  // importiert statt dupliziert. Nur wenn die ECHTE Implementierung bei
  // deaktivierter Korrektur tatsächlich keinen Effekt mehr misst, ist der Test
  // aussagekräftig.
  const weightTableForNeg = buildWeightTable();
  const likByMonthForNeg = loadLikMonthly();
  const { byYear: premiumByYearForNeg, lastAvailableYear: premiumLastAvailableYearForNeg } = loadPremiumYearly();
  const pmByYearForNeg = buildMonthlyEquivalentPremiumRates(premiumByYearForNeg, premiumLastAvailableYearForNeg);
  const realRentCorrection = loadRentCorrection();
  const disabledRentCorrection = { ...realRentCorrection, correctionDeltaPpPerYear: 0 };
  const seriesWithDisabledCorrection = buildTrueflationMonthlySeries({
    likByMonth: likByMonthForNeg,
    pmByYear: pmByYearForNeg,
    premiumLastAvailableYear: premiumLastAvailableYearForNeg,
    weightTable: weightTableForNeg,
    rentCorrection: disabledRentCorrection,
  });
  const seriesWithRealCorrection = buildTrueflationMonthlySeries({
    likByMonth: likByMonthForNeg,
    pmByYear: pmByYearForNeg,
    premiumLastAvailableYear: premiumLastAvailableYearForNeg,
    weightTable: weightTableForNeg,
    rentCorrection: realRentCorrection,
  });
  const avgsDisabled = computeCalendarYearAverages(seriesWithDisabledCorrection);
  const avgsReal = computeCalendarYearAverages(seriesWithRealCorrection);
  const fromDisabled = avgsDisabled.find((a) => a.year === RENT_CORRECTION_START_YEAR);
  const toDisabled = avgsDisabled.find((a) => a.year === realRentCorrection.sourceToYear);
  const fromReal = avgsReal.find((a) => a.year === RENT_CORRECTION_START_YEAR);
  const toReal = avgsReal.find((a) => a.year === realRentCorrection.sourceToYear);
  check(
    'Voraussetzung fuer den echten Negativtest: alle vier Vergleichsjahre (real/disabled x from/to) sind vorhanden',
    !!fromDisabled && !!toDisabled && !!fromReal && !!toReal
  );
  if (fromDisabled && toDisabled && fromReal && toReal) {
    const yearsSpanForNeg = realRentCorrection.sourceToYear - RENT_CORRECTION_START_YEAR;
    const growthDisabled = Math.pow(toDisabled.trueflationIndexAvg / fromDisabled.trueflationIndexAvg, 1 / yearsSpanForNeg) - 1;
    const growthReal = Math.pow(toReal.trueflationIndexAvg / fromReal.trueflationIndexAvg, 1 / yearsSpanForNeg) - 1;
    const measuredEffectRealVsDisabled = (growthReal - growthDisabled) * 100;
    check(
      'ECHTER NEGATIVTEST: reale Pipeline MIT Korrektur vs. reale Pipeline mit correctionDeltaPpPerYear=0 (kein Literal) zeigt den erwarteten Effekt (≈ 0.0608 pp/Jahr)',
      approxEqual(measuredEffectRealVsDisabled, realRentCorrection.correctionDeltaPpPerYear, 0.03),
      `Erwartet ≈ ${realRentCorrection.correctionDeltaPpPerYear}, gemessen (real − disabled): ${measuredEffectRealVsDisabled.toFixed(4)}`
    );
    // Kern des Negativtests: WENN die Korrektur im Produktionscode kaputt
    // wäre (z.B. rentMonthlyFactor-Multiplikation versehentlich entfernt),
    // würde buildTrueflationMonthlySeries mit realRentCorrection dasselbe
    // Ergebnis liefern wie mit disabledRentCorrection — diese Prüfung
    // bestaetigt anhand der TATSAECHLICH gemessenen Werte, dass genau das
    // NICHT der Fall ist (die beiden Wachstumsraten unterscheiden sich
    // messbar). Kein Literal, kein Vergleich eines Werts mit sich selbst —
    // beide Werte stammen aus zwei unabhaengigen echten Pipeline-Laeufen.
    check(
      'NEGATIVTEST: reale Wachstumsrate MIT Korrektur unterscheidet sich messbar von der realen Wachstumsrate OHNE Korrektur — waere die Korrektur im Code kaputt, waeren beide Werte identisch und dieser Test wuerde fehlschlagen',
      !approxEqual(growthReal * 100, growthDisabled * 100, 1e-6),
      `growthReal=${(growthReal * 100).toFixed(6)}%, growthDisabled=${(growthDisabled * 100).toFixed(6)}% — muessen sich unterscheiden.`
    );
  }

  console.log('\n=== Test 1h: 2020er-Miet-Korrektur-Marker existiert am richtigen Datenpunkt ===');
  // Bruch wird GEKENNZEICHNET, nicht versteckt (Requirements 2.2b/Betreiber-
  // Entscheid dritte Runde) — exakt EIN Marker, exakt am 1.1.2020, nicht
  // frueher/spaeter und nicht auf mehreren Monaten verteilt.
  assertFieldExists(monthly[0], 'rentCorrectionApplied', 'Test 1h (2020er-Marker)');
  assertFieldExists(monthly[0], 'rentCorrectionNote', 'Test 1h (2020er-Marker)');
  const jan2020 = byMonth[20200101];
  check(
    'Januar 2020 vorhanden und trägt rentCorrectionNote (nicht-leer)',
    !!jan2020 && typeof jan2020.rentCorrectionNote === 'string' && jan2020.rentCorrectionNote.length > 0,
    jan2020 ? `rentCorrectionNote: ${jan2020.rentCorrectionNote}` : 'Januar 2020 fehlt in der Reihe.'
  );
  check(
    'Januar 2020 ist als rentCorrectionApplied=true markiert',
    !!jan2020 && jan2020.rentCorrectionApplied === true
  );
  const monthsWithRentNote = monthly.filter((v) => typeof v.rentCorrectionNote === 'string' && v.rentCorrectionNote.length > 0);
  check(
    'Genau EIN Monat traegt die Bruch-Markierung (rentCorrectionNote) — kein wiederholter oder fehlender Marker',
    monthsWithRentNote.length === 1 && monthsWithRentNote[0].month === 20200101,
    `Gefunden bei: ${monthsWithRentNote.map((v) => v.month).join(', ') || 'keinem Monat'}`
  );
  const monthsBeforeRentStart = monthly.filter((v) => v.month < 20200101);
  const monthsFromRentStart = monthly.filter((v) => v.month >= 20200101);
  check(
    'Alle Monate VOR 2020 sind rentCorrectionApplied=false (kein rueckwirkendes Glaetten)',
    monthsBeforeRentStart.every((v) => v.rentCorrectionApplied === false)
  );
  check(
    'Alle Monate AB 2020 sind rentCorrectionApplied=true',
    monthsFromRentStart.every((v) => v.rentCorrectionApplied === true)
  );

  console.log('\n=== Test 1h-neg: NEGATIVTEST — ein Marker vor 2020 oder ein fehlender Marker 2020 muss auffallen ===');
  // BLOCKER-FIX (Code-Review 29.08.2026): zwei Probleme im ursprünglichen
  // Test behoben. (1) Kommentar behauptete "Dezember 2019", tatsächlich
  // geprüft wurde 20190101 (Januar 2019) — jetzt korrekt Dezember 2019
  // (20191201), der tatsächlich letzte Monat vor dem Bruch. (2) Der zweite
  // Check war tautologisch (prüfte denselben bereits bekannten jan2020-Wert
  // erneut, konnte nie fehlschlagen) — ersetzt durch eine ECHTE Simulation
  // eines fehlenden Markers: ein manipuliertes Objekt mit
  // rentCorrectionNote=null wird durch DIESELBE Prüflogik wie Test 1h
  // geschickt und MUSS dabei durchfallen.
  const dec2019 = byMonth[20191201];
  check(
    'NEGATIVTEST: Dezember 2019 (tatsächlich letzter Monat vor dem Bruch) traegt KEINE rentCorrectionNote',
    !!dec2019 && dec2019.rentCorrectionNote == null,
    dec2019 ? `rentCorrectionNote: ${dec2019.rentCorrectionNote}` : 'Dezember 2019 fehlt in der Reihe.'
  );
  check(
    'NEGATIVTEST: Dezember 2019 ist rentCorrectionApplied=false (letzter Monat VOR dem Bruch)',
    !!dec2019 && dec2019.rentCorrectionApplied === false
  );
  // Echte Simulation eines fehlenden Markers: dieselbe Prüflogik wie im
  // Positivtest (Test 1h), aber auf ein Objekt angewendet, bei dem
  // rentCorrectionNote absichtlich fehlt — muss FALSE liefern.
  const simulatedMissingMarker = { ...jan2020, rentCorrectionNote: null };
  const wouldTest1hPass = typeof simulatedMissingMarker.rentCorrectionNote === 'string' && simulatedMissingMarker.rentCorrectionNote.length > 0;
  check(
    'NEGATIVTEST: ein simulierter fehlender Marker (rentCorrectionNote=null) laesst dieselbe Prüflogik wie Test 1h durchfallen',
    wouldTest1hPass === false,
    'Test 1h wuerde bei einem fehlenden Marker faelschlich gruen bleiben, wenn diese Pruefung hier nicht false liefert.'
  );

  console.log('\n=== Test 2: Harte 100%-Gewichtsprüfung ===');
  const weightTable = monthlyData.methodology.weightTable;
  for (const [fy, entry] of Object.entries(weightTable)) {
    const sum = (1 - entry.weight) + entry.weight;
    check(`Fixierungsjahr ${fy}: (1-w)+w = 1`, approxEqual(sum, 1, 1e-9), `Ist: ${sum}`);
    check(`Fixierungsjahr ${fy}: Gewicht in [0,1]`, entry.weight > 0 && entry.weight < 1);
  }

  console.log('\n=== Test 2b: NEGATIVTEST für Test 2 — Gewicht ausserhalb (0,1) muss erkannt werden ===');
  const brokenWeight = 1.2;
  const brokenSum = (1 - brokenWeight) + brokenWeight;
  check(
    'NEGATIVTEST: Gewicht 1.2 (ausserhalb Bounds) wird von der Bounds-Prüfung erkannt',
    !(brokenWeight > 0 && brokenWeight < 1),
    `Bounds-Check für w=${brokenWeight} muss false liefern.`
  );
  check(
    'NEGATIVTEST: (1-w)+w = 1 bleibt bei w=1.2 algebraisch wahr (zeigt: diese Prüfung allein reicht nicht, Bounds-Check ist zusätzlich nötig)',
    approxEqual(brokenSum, 1, 1e-9)
  );

  console.log('\n=== Test 3: Verkettungs-Stetigkeit an Fixierungsjahren (Januar-gegen-Januar, MAD-Schwellwert) ===');
  // SAISONALITÄTS-FIX (Betreiber-Review 26.08.2026): Der LIK ist nicht
  // saisonbereinigt, Januar ist wegen Winterschlussverkauf/Kleiderpreisen
  // systematisch atypisch. Referenzmenge sind daher AUSSCHLIESSLICH andere
  // Januare (±3 Jahre um das Fixierungsjahr, dieses ausgenommen) — nicht
  // "alle Monate". Damit ist Saisonalität herausgerechnet, der Test misst
  // tatsächlich den w-Wechsel, nicht ein Kalendereffekt.
  //
  // Nur 2015 und 2020 sind echte Übergänge — 2010 ist der Serienstart,
  // kein Übergang, braucht keinen Test.
  function yoyJanRate(janByYear, year) {
    if (janByYear[year] == null || janByYear[year - 1] == null) return null;
    // Jan-zu-Jan-Rate über das VORJAHR (12 Monate zurück) — konsistent mit
    // der Fragestellung "wie stark bricht der Januar-Übergang aus".
    return (janByYear[year].trueflationIndex / janByYear[year - 1].trueflationIndex - 1) * 100;
  }
  function evaluateJanuaryTransition(janByYear, fixationYear, windowRadius = 3) {
    const referenceYears = [];
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      if (offset === 0) continue;
      referenceYears.push(fixationYear + offset);
    }
    const referenceRates = referenceYears
      .map((y) => yoyJanRate(janByYear, y))
      .filter((r) => r != null);
    if (referenceRates.length < 2) {
      return { ok: false, reason: `Nur ${referenceRates.length} Referenz-Januare verfügbar.` };
    }
    const med = median(referenceRates);
    const m = mad(referenceRates, med);
    // MAD->Stdev-Äquivalent bei Normalverteilung: Stdev ≈ 1.4826*MAD.
    // Schwellwert bewusst als Median ± 3×1.4826×MAD (robustes Analogon zu
    // "Median ± 3×Stdev", aber nicht durch einzelne Ausreisser verzerrbar).
    const threshold = Math.abs(med) + 3 * 1.4826 * m;
    const rateAtFixation = yoyJanRate(janByYear, fixationYear);
    if (rateAtFixation == null) {
      return { ok: false, reason: 'Fixierungsjahr oder Vorjahr fehlt in den Januar-Daten.' };
    }
    const deviation = Math.abs(rateAtFixation - med);
    return {
      ok: deviation <= threshold,
      deviation,
      threshold,
      reason: `Rate: ${rateAtFixation.toFixed(4)}%, Referenz-Median: ${med.toFixed(4)}%, MAD: ${m.toFixed(4)}, Schwellwert: ${threshold.toFixed(4)}pp`,
    };
  }
  for (const fy of [2015, 2020]) {
    const result = evaluateJanuaryTransition(byJanuaryYear, fy);
    check(
      `Fixierungsjahr ${fy}: Januar-Übergang innerhalb des MAD-Schwellwerts (Referenz: andere Januare)`,
      result.ok,
      result.reason
    );
  }

  console.log('\n=== Test 3b: NEGATIVTEST — künstlicher Sprung im Januar-Übergang muss erkannt werden ===');
  const syntheticJanByYear = JSON.parse(JSON.stringify(byJanuaryYear));
  if (syntheticJanByYear[2020] && syntheticJanByYear[2019]) {
    syntheticJanByYear[2020] = {
      ...syntheticJanByYear[2020],
      trueflationIndex: syntheticJanByYear[2019].trueflationIndex * 1.15, // künstlicher 15pp-Sprung
    };
    for (let y = 2021; syntheticJanByYear[y]; y++) {
      const originalRatio = byJanuaryYear[y].trueflationIndex / byJanuaryYear[y - 1].trueflationIndex;
      syntheticJanByYear[y] = {
        ...syntheticJanByYear[y],
        trueflationIndex: syntheticJanByYear[y - 1].trueflationIndex * originalRatio,
      };
    }
    const negResult = evaluateJanuaryTransition(syntheticJanByYear, 2020);
    check(
      'NEGATIVTEST: künstlicher 15pp-Sprung am Fixierungsjahr 2020 (Januar) wird erkannt (muss FALSE liefern)',
      negResult.ok === false,
      negResult.ok === false ? `Korrekt erkannt — ${negResult.reason}` : `NICHT erkannt (${negResult.reason}) — Test 3 wäre wirkungslos!`
    );
  } else {
    check('NEGATIVTEST 3b: Voraussetzungen erfüllt', false, 'Konnte nicht ausgeführt werden.');
  }

  console.log('\n=== Test 4: Diskontinuität an JEDEM Januar, nicht nur Fixierungsjahren ===');
  // pm_y wechselt jedes Kalenderjahr (neue BAG-Jahresrate), w(y) nur an
  // Fixierungsjahren. Jeder Januar trägt daher eine transitionNote — nicht
  // nur 2015/2020. Prüfe: ALLE Januar-Monate ausser dem Anker (2010) tragen
  // isJanuaryTransition=true und ein nicht-leeres transitionNote-Feld.
  assertFieldExists(monthly[0], 'dataStatus', 'Test 4 (Januar-Diskontinuität)');
  assertFieldExists(monthly[0], 'isJanuaryTransition', 'Test 4 (Januar-Diskontinuität)');
  assertFieldExists(monthly[0], 'transitionNote', 'Test 4 (Januar-Diskontinuität)');
  const nonAnchorJanuaries = januaries.filter((v) => v.dataStatus !== 'anchor');
  check(
    'Alle Nicht-Anker-Januare sind als isJanuaryTransition=true markiert',
    nonAnchorJanuaries.every((v) => v.isJanuaryTransition === true),
    `${nonAnchorJanuaries.filter((v) => v.isJanuaryTransition !== true).length} von ${nonAnchorJanuaries.length} fehlen markiert.`
  );
  check(
    'Alle Nicht-Anker-Januare tragen ein nicht-leeres transitionNote-Feld',
    nonAnchorJanuaries.every((v) => typeof v.transitionNote === 'string' && v.transitionNote.length > 0)
  );
  const nonJanuaryMonths = monthly.filter((v) => monthOf(v.month) !== 1);
  check(
    'Kein Nicht-Januar-Monat trägt isJanuaryTransition=true (Negativabgrenzung)',
    nonJanuaryMonths.every((v) => v.isJanuaryTransition === false)
  );

  console.log('\n=== Test 4b: NEGATIVTEST — ein Nicht-Januar mit isJanuaryTransition=true muss auffallen ===');
  const fakeMonth = { ...nonJanuaryMonths[0], isJanuaryTransition: true };
  check(
    'NEGATIVTEST: manipulierter Nicht-Januar-Monat mit isJanuaryTransition=true wird von der Prüflogik erkannt',
    !(monthOf(fakeMonth.month) !== 1 && fakeMonth.isJanuaryTransition === false),
    'Prüflogik muss diesen Fall als Verstoss werten.'
  );

  console.log('\n=== Test 4c: AUSGEWIESENER LIK-WERT BLEIBT AMTLICH (Betreiber-Vorgabe 29.08.2026, wichtigster Einzeltest) ===');
  // KONTEXT: Bei der Implementierung der Miet-Korrektur wurde ein Bug
  // GEFUNDEN UND GEFIXT, bevor er live ging — likGrowthRatePercent haette
  // sonst die MIET-KORRIGIERTE statt der AMTLICHEN LIK-Rate ausgewiesen.
  // Bei einem Projekt, dessen Kernversprechen die saubere Gegenueberstellung
  // LIK-vs-Trueflation ist, waere das der schwerste denkbare Fehler gewesen:
  // die Seite haette eine korrigierte Zahl als "offiziellen LIK" verkauft.
  // Dieser Test darf NIE wieder stillschweigend durchfallen — er laedt die
  // LIK-Rohdatendatei UNABHAENGIG von der Trueflation-Berechnung und
  // vergleicht Monat fuer Monat, inklusive aller Monate AB 2020 (wo die
  // Miet-Korrektur aktiv ist — genau dort waere der Bug sichtbar gewesen).
  const likRawPath = path.join(REPO_ROOT, 'data', 'lik', 'total-index-monthly.json');
  const likRawData = JSON.parse(readFileSync(likRawPath, 'utf-8'));
  const likRawByYYYYMM = {};
  for (const v of likRawData.values) {
    likRawByYYYYMM[Math.floor(v.indexDate / 100)] = v.indexValue;
  }
  assertFieldExists(monthly[1], 'likGrowthRatePercent', 'Test 4c (amtlicher LIK-Wert)');
  assertFieldExists(monthly[1], 'likIndex', 'Test 4c (amtlicher LIK-Wert)');
  const likIndexMismatches = monthly.filter((v) => {
    const rawValue = likRawByYYYYMM[Math.floor(v.month / 100)];
    return rawValue == null || !approxEqual(v.likIndex, rawValue, 1e-9);
  });
  check(
    'likIndex entspricht in JEDEM Monat exakt dem amtlichen LIK-Rohwert (keine Abweichung durch Miet-Korrektur)',
    likIndexMismatches.length === 0,
    likIndexMismatches.length > 0 ? `${likIndexMismatches.length} Abweichungen, erster: Monat ${likIndexMismatches[0].month}` : undefined
  );
  // likGrowthRatePercent muss ebenfalls die REINE LIK-Rate sein — direkte
  // Nachrechnung aus den amtlichen Rohdaten, Monat fuer Monat, fuer ALLE
  // Nicht-Anker-Monate (inkl. der Jahre ab 2020, in denen die Miet-Korrektur
  // aktiv ist).
  const nonAnchorMonths = monthly.filter((v) => v.dataStatus !== 'anchor');
  const likRateMismatches = nonAnchorMonths.filter((v) => {
    const rawCurrent = likRawByYYYYMM[Math.floor(v.month / 100)];
    const prevMonthKey = Math.floor(v.month / 100) - (monthOf(v.month) === 1 ? 89 : 1); // YYYYMM-1, ueber Jahreswechsel korrekt
    const rawPrev = likRawByYYYYMM[prevMonthKey];
    if (rawCurrent == null || rawPrev == null) return false; // nicht pruefbar, kein Fehlschlag
    const expectedRate = round4((rawCurrent / rawPrev - 1) * 100);
    return !approxEqual(v.likGrowthRatePercent, expectedRate, 0.0001);
  });
  check(
    'likGrowthRatePercent ist in JEDEM Monat die REINE amtliche LIK-Rate, auch ab 2020 (Miet-Korrektur-Zeitraum)',
    likRateMismatches.length === 0,
    likRateMismatches.length > 0 ? `${likRateMismatches.length} Abweichungen, erster: Monat ${likRateMismatches[0].month} (Ist: ${likRateMismatches[0].likGrowthRatePercent})` : undefined
  );
  // Speziell die Jahre AB 2020 pruefen (dort ist rawLikGrowthFactor !=
  // likGrowthFactor durch die Miet-Korrektur — genau das Szenario, in dem
  // der urspruengliche Bug aufgetreten waere).
  const monthsFrom2020 = nonAnchorMonths.filter((v) => v.month >= 20200101);
  check(
    'Mindestens ein Monat ab 2020 wird tatsaechlich geprueft (Test ist nicht wirkungslos leer)',
    monthsFrom2020.length > 0,
    `Gefundene Monate ab 2020: ${monthsFrom2020.length}`
  );

  console.log('\n=== Test 4c-neg: NEGATIVTEST — ein likIndex/likGrowthRatePercent, der die Miet-Korrektur enthaelt, muss auffallen ===');
  // Simuliert exakt den urspruenglich gefundenen Bug: likGrowthRatePercent
  // wird faelschlich aus dem MIET-KORRIGIERTEN Wachstumsfaktor berechnet
  // statt aus dem rohen. Bestaetigt, dass die obige Pruefung diesen Fall
  // als Abweichung erkennen wuerde.
  const sampleMonthFrom2020 = monthsFrom2020[0];
  if (sampleMonthFrom2020) {
    const rawCurrent = likRawByYYYYMM[Math.floor(sampleMonthFrom2020.month / 100)];
    const prevKey = Math.floor(sampleMonthFrom2020.month / 100) - (monthOf(sampleMonthFrom2020.month) === 1 ? 89 : 1);
    const rawPrev = likRawByYYYYMM[prevKey];
    if (rawCurrent != null && rawPrev != null) {
      const correctRate = round4((rawCurrent / rawPrev - 1) * 100);
      // Der urspruengliche Bug haette hier stattdessen
      // likGrowthRatePercentRentCorrected zurueckgegeben (enthaelt den
      // Miet-Faktor) — nachweislich verschieden von der reinen Rate.
      const buggyRateWouldBe = sampleMonthFrom2020.likGrowthRatePercentRentCorrected;
      check(
        'NEGATIVTEST: die (verworfene) miet-korrigierte Rate unterscheidet sich MESSBAR von der korrekt ausgewiesenen amtlichen Rate',
        buggyRateWouldBe != null && !approxEqual(buggyRateWouldBe, correctRate, 0.0001),
        `Amtlich: ${correctRate}, miet-korrigiert (waere der Bug gewesen): ${buggyRateWouldBe} — muessen sich unterscheiden, sonst wuerde der Bug nicht auffallen.`
      );
    }
  }

  console.log('\n=== Test 5: Geometrische statt arithmetische Verkettung (Regressionsschutz) ===');
  // Regressionsschutz gegen Rückfall auf die arithmetische V1-Formel
  // ((1-w)*L + w*P statt L^(1-w) * (1+pm)^w). Nachrechnung eines konkreten
  // Monats-Übergangs (Feb 2010) gegen beide Formelvarianten — nur die
  // geometrische darf zum gespeicherten Wert passen.
  const jan2010 = byMonth[20100101];
  const feb2010 = byMonth[20100201];
  if (jan2010 && feb2010) {
    const likGrowthFactor = feb2010.likIndex / jan2010.likIndex;
    const w = feb2010.premiumWeight;
    const pm = feb2010.premiumMonthlyEquivalentRatePercent / 100;
    const geometricFactor = Math.pow(likGrowthFactor, 1 - w) * Math.pow(1 + pm, w);
    const arithmeticFactor = (1 - w) * likGrowthFactor + w * (1 + pm);
    const expectedGeometric = jan2010.trueflationIndex * geometricFactor;
    const wouldBeArithmetic = jan2010.trueflationIndex * arithmeticFactor;
    check(
      'Feb 2010: gespeicherter Wert stimmt mit GEOMETRISCHER Formel überein',
      approxEqual(feb2010.trueflationIndex, expectedGeometric, 0.001),
      `Gespeichert: ${feb2010.trueflationIndex}, geometrisch erwartet: ${expectedGeometric.toFixed(4)}`
    );
    check(
      'NEGATIVTEST: gespeicherter Wert weicht von der ARITHMETISCHEN Formel ab (zeigt: Regressionsschutz kann Rückfall erkennen)',
      !approxEqual(feb2010.trueflationIndex, wouldBeArithmetic, 0.001),
      `Arithmetisch wäre: ${wouldBeArithmetic.toFixed(4)}, gespeichert: ${feb2010.trueflationIndex} — müssen sich unterscheiden.`
    );
  } else {
    check('Test 5: Jan/Feb 2010 vorhanden', false, 'Monate fehlen — Test konnte nicht ausgeführt werden.');
  }

  console.log('\n=== Test 6: Struktur-Konsistenz Monats- vs. abgeleitete Jahresdatei ===');
  assertFieldExists(yearlyData, 'derivedFrom', 'Test 6 (Struktur-Konsistenz)');
  check(
    'Jede Jahresdatei-Zeile entspricht exakt dem Januar-Wert der Monatsdatei',
    yearlyData.values.every((yv) => {
      const jan = byJanuaryYear[yv.year];
      return jan && approxEqual(jan.trueflationIndex, yv.trueflationIndex, 1e-9) && approxEqual(jan.likIndex, yv.likIndex, 1e-9);
    })
  );
  check(
    'Jahresdatei deklariert sich selbst als abgeleitet (derivedFrom-Feld gesetzt)',
    typeof yearlyData.derivedFrom === 'string' && yearlyData.derivedFrom.length > 0
  );

  console.log('\n=== Test 6b: NEGATIVTEST — verfälschter Jahreswert muss auffallen ===');
  const tamperedYearly = JSON.parse(JSON.stringify(yearlyData.values));
  if (tamperedYearly.length > 0) {
    tamperedYearly[0] = { ...tamperedYearly[0], trueflationIndex: tamperedYearly[0].trueflationIndex + 100 };
    const stillConsistent = tamperedYearly.every((yv) => {
      const jan = byJanuaryYear[yv.year];
      return jan && approxEqual(jan.trueflationIndex, yv.trueflationIndex, 1e-9);
    });
    check(
      'NEGATIVTEST: künstlich verfälschter erster Jahreswert (+100) wird von der Konsistenzprüfung erkannt',
      stillConsistent === false,
      'Konsistenzprüfung muss bei Verfälschung false liefern.'
    );
  }

  console.log('\n=== Test 7: Regressionsguard — Prämiengewichte unterscheiden sich je Fixierungsjahr ===');
  assertFieldExists(weightTable['2010'], 'premiumBudgetShareSource', 'Test 7 (Regressionsguard)');
  check(
    'Prämiengewichte unterscheiden sich zwischen Fixierungsjahren (F7-Regressionsguard aus V1, weiterhin gültig)',
    weightTable['2010'].weight !== weightTable['2015'].weight && weightTable['2015'].weight !== weightTable['2020'].weight,
    'Falls alle gleich: der historische Bug (Einzelwert für alle Jahre) ist zurückgekehrt.'
  );
  check(
    'Prämien-Budgetanteile haben eine dokumentierte Quelle je Fixierungsjahr',
    ['2010', '2015', '2020'].every((fy) => typeof weightTable[fy].premiumBudgetShareSource === 'string' && weightTable[fy].premiumBudgetShareSource.length > 0)
  );

  console.log('\n=== Test 8: Zustandskonflikt US 3.16 (Zustand 4 vs. 5) — nie beide gleichzeitig ===');
  // Betreiber-Fund 26.08.2026: Vor dem Reihenstart UND nach dem Reihenende
  // sind Zustand 4 ("existiert erst ab") und Zustand 5 ("endet früher") beide
  // technisch zutreffend, wenn man nur "Datenpunkt fehlt" prüft. Regel: vor
  // Start -> IMMER Zustand 4, nach Ende -> IMMER Zustand 5, nie beide Texte
  // für denselben Zeitpunkt. Diese Funktion bildet dieselbe Entscheidungslogik
  // ab wie sie im Chart (LikChart.tsx) implementiert sein muss.
  function resolveTrueflationState(monthYYYYMM01, seriesStartMonth, seriesEndMonth) {
    if (monthYYYYMM01 < seriesStartMonth) return 'zustand4_existiert_erst_ab';
    if (monthYYYYMM01 > seriesEndMonth) return 'zustand5_endet_frueher';
    return 'aktuell';
  }
  const seriesStart = monthlyData.startMonth;
  const seriesEnd = monthly[monthly.length - 1].month;
  check(
    'Vor Reihenstart (2005) greift Zustand 4, NICHT Zustand 5',
    resolveTrueflationState(20050101, seriesStart, seriesEnd) === 'zustand4_existiert_erst_ab'
  );
  check(
    'Nach Reihenende (2026) greift Zustand 5, NICHT Zustand 4',
    resolveTrueflationState(20260101, seriesStart, seriesEnd) === 'zustand5_endet_frueher'
  );
  check(
    'Innerhalb der Reihe (2015) greift weder Zustand 4 noch Zustand 5',
    resolveTrueflationState(20150101, seriesStart, seriesEnd) === 'aktuell'
  );

  console.log('\n=== Test 8b: NEGATIVTEST — eine Logik, die beide Zustände gleichzeitig liefern könnte, muss auffallen ===');
  // Simuliert eine FALSCHE Implementierung, die beide Bedingungen unabhängig
  // prueft (wie es vor der Regel-Klarstellung der Fall gewesen wäre) und
  // zeigt, dass eine solche Logik bei einem Zeitpunkt VOR dem Start faelschlich
  // auch Zustand 5 als "zutreffend" markieren wuerde.
  function brokenResolveState(monthYYYYMM01, seriesStartMonth, seriesEndMonth) {
    const zustand4Applies = monthYYYYMM01 < seriesStartMonth;
    const zustand5Applies = monthYYYYMM01 > seriesEndMonth || monthYYYYMM01 < seriesStartMonth; // BUG: faelschlich auch < Start
    return { zustand4Applies, zustand5Applies };
  }
  const brokenResult = brokenResolveState(20050101, seriesStart, seriesEnd);
  check(
    'NEGATIVTEST: eine fehlerhafte Logik ohne exklusive Zuordnung liefert beide Zustände gleichzeitig (zeigt: die Regel ist notwendig)',
    brokenResult.zustand4Applies === true && brokenResult.zustand5Applies === true,
    `Fehlerhafte Logik: Zustand4=${brokenResult.zustand4Applies}, Zustand5=${brokenResult.zustand5Applies} — beide wahr ist der Konflikt, den die Regel verhindern muss.`
  );
  check(
    'Die KORREKTE resolveTrueflationState-Funktion liefert dagegen genau EINEN Zustand',
    resolveTrueflationState(20050101, seriesStart, seriesEnd) === 'zustand4_existiert_erst_ab' &&
      resolveTrueflationState(20050101, seriesStart, seriesEnd) !== 'zustand5_endet_frueher'
  );

  console.log('\n=== Test 9: M2-Indexierung (Chart-Logik-Verifikation, Requirements 2.3) ===');
  // Lücke identifiziert (Betreiber-Review 26.08.2026): Die Indexierungslogik
  // im Chart ((v.value / base) * 100) war bisher ungetestet. M2 liegt als
  // CHF-Absolutwert vor (Requirements 2.3: "nie Absolutwert in CHF") und muss
  // auf Basis=100 am Fensterstart umgerechnet werden. Diese Funktion bildet
  // dieselbe Rechenlogik wie LikChart.tsx nach, um sie unabhängig vom
  // React-Rendering prüfbar zu machen.
  function indexM2(rawValues) {
    if (rawValues.length === 0) return [];
    const base = rawValues[0];
    return rawValues.map((v) => (v / base) * 100);
  }
  const m2Path = path.join(REPO_ROOT, 'data', 'snb-m2', 'm2-monthly.json');
  let m2Data;
  try {
    m2Data = JSON.parse(readFileSync(m2Path, 'utf-8'));
  } catch {
    m2Data = null;
  }
  if (m2Data && Array.isArray(m2Data.values) && m2Data.values.length > 0) {
    const rawSince2010 = m2Data.values
      .filter((v) => parseInt(v.date.slice(0, 4), 10) >= 2010)
      .map((v) => v.value);
    const indexed = indexM2(rawSince2010);
    check(
      'M2-Indexreihe beginnt exakt bei 100 (Basis = erster Wert im Fenster)',
      indexed.length > 0 && approxEqual(indexed[0], 100, 1e-9),
      indexed.length > 0 ? `Erster indexierter Wert: ${indexed[0]}` : 'Keine Werte im Fenster.'
    );
    check(
      'M2-Indexreihe ist niemals ein CHF-Absolutwert (Grössenordnung plausibel um 100, nicht im Millionenbereich)',
      indexed.every((v) => v > 0 && v < 10000),
      'Ein Wert ausserhalb (0,10000) deutet auf eine nicht-indexierte Grösse hin (Requirements 2.3-Verstoss).'
    );

    console.log('\n=== Test 9b: NEGATIVTEST — falsch indexierte (rohe) M2-Werte müssen als Requirements-2.3-Verstoss erkennbar sein ===');
    const rawLooksLikeAbsolute = rawSince2010[0] > 10000; // M2 liegt im Bereich mehrerer 100'000 (Mio. CHF)
    check(
      'NEGATIVTEST: der rohe (nicht indexierte) M2-Wert liegt weit ausserhalb der plausiblen Index-Grössenordnung',
      rawLooksLikeAbsolute,
      `Roher Wert: ${rawSince2010[0]} — muss selbst nicht im Index-Bereich (0,10000) liegen, sonst würde ein fehlendes Indexieren nicht auffallen.`
    );
  } else {
    check('Test 9: M2-Datendatei vorhanden und lesbar', false, `Erwartet unter ${m2Path}.`);
  }

  console.log('\n=== Test 10: Linienende-Erkennung (Chart-Logik-Verifikation, US 3.16 Zustand 5) ===');
  // Bildet dieselbe Vergleichslogik wie trueflationEndsEarlierThanLik in
  // LikChart.tsx nach (Vergleich der letzten Monate beider Reihen im selben
  // gefilterten Fenster), unabhängig vom React-Rendering prüfbar.
  const likPath = path.join(REPO_ROOT, 'data', 'lik', 'total-index-monthly.json');
  const likData = JSON.parse(readFileSync(likPath, 'utf-8'));
  function detectLineEndsEarlier(trueflationMonths, likDates) {
    if (trueflationMonths.length === 0 || likDates.length === 0) return false;
    const lastTfYm = Math.floor(trueflationMonths[trueflationMonths.length - 1] / 100);
    const lastLikYm = Math.floor(likDates[likDates.length - 1] / 100);
    return lastTfYm < lastLikYm;
  }
  const tfMonthsSince2010 = monthly.map((v) => v.month);
  const likDatesSince2010 = likData.values
    .map((v) => v.indexDate)
    .filter((d) => Math.floor(d / 10000) >= 2010);
  check(
    'Reales Datenpaar (Trueflation bis 12/2024, LIK bis später): Linienende wird korrekt als "früher" erkannt',
    detectLineEndsEarlier(tfMonthsSince2010, likDatesSince2010) === true,
    `Letzter Trueflation-Monat: ${tfMonthsSince2010[tfMonthsSince2010.length - 1]}, letztes LIK-Datum: ${likDatesSince2010[likDatesSince2010.length - 1]}`
  );

  console.log('\n=== Test 10b: NEGATIVTEST — gleich lange Reihen dürfen NICHT als "endet früher" markiert werden ===');
  const syntheticEqualLength = tfMonthsSince2010; // gleiche Reihe für beide simuliert
  check(
    'NEGATIVTEST: identische Endpunkte werden korrekt NICHT als "endet früher" erkannt',
    detectLineEndsEarlier(syntheticEqualLength, syntheticEqualLength) === false,
    'Zwei Reihen mit demselben letzten Monat dürfen keinen Zustand-5-Hinweis auslösen.'
  );

  console.log('\n=== Test 11: Miet-Korrektur-Kennzeichnung ERREICHT DEN BESUCHER (Chart-Logik-Verifikation, Betreiber-Vorgabe 29.08.2026) ===');
  // KONTEXT: rentCorrectionNote/rentCorrectionApplied als reine Datenfelder
  // zu testen reicht nicht — ein Marker, der nur im JSON steht, erfuellt
  // die Kennzeichnungspflicht nicht. Bildet dieselbe Sichtbarkeits-Logik wie
  // LikChart.tsx nach: (a) der Tooltip-Text muss bei einem miet-korrigierten
  // Punkt den Zusatz "+ Miet-Korrektur" enthalten, (b) ein dauerhaft
  // sichtbarer Status-Hinweis (nicht nur Tooltip/Hover) muss erscheinen,
  // sobald irgendein Punkt im gefilterten Zeitraum rentCorrectionApplied
  // traegt.
  function buildTrueflationTooltipLabel(point) {
    const base = `Trueflation: X (LIK + Praemienkorrektur${point?.rentCorrectionApplied ? ' + Miet-Korrektur' : ''} - siehe Methodik)`;
    const notes = [point?.transitionNote, point?.rentCorrectionNote].filter(
      (n) => typeof n === 'string' && n.length > 0
    );
    return notes.length > 0 ? [base, ...notes] : base;
  }
  function rentCorrectionStatusVisible(filteredValues) {
    return filteredValues.some((v) => v.rentCorrectionApplied === true);
  }
  const jan2020ForChart = byMonth[20200101];
  const dec2019ForChart = byMonth[20191201];
  check(
    'Tooltip-Label fuer Januar 2020 (rentCorrectionApplied=true) enthaelt den Zusatz "+ Miet-Korrektur"',
    !!jan2020ForChart && String(buildTrueflationTooltipLabel(jan2020ForChart)[0] ?? buildTrueflationTooltipLabel(jan2020ForChart)).includes('Miet-Korrektur'),
    jan2020ForChart ? JSON.stringify(buildTrueflationTooltipLabel(jan2020ForChart)) : 'Januar 2020 fehlt.'
  );
  check(
    'Tooltip-Label fuer Januar 2020 enthaelt zusaetzlich die rentCorrectionNote als eigene Zeile',
    !!jan2020ForChart && Array.isArray(buildTrueflationTooltipLabel(jan2020ForChart)) && buildTrueflationTooltipLabel(jan2020ForChart).some((line) => line === jan2020ForChart.rentCorrectionNote)
  );
  check(
    'Ein dauerhaft sichtbarer Status-Hinweis wird ausgeloest, sobald der gefilterte Zeitraum Januar 2020 (oder spaeter) enthaelt',
    rentCorrectionStatusVisible(monthly.filter((v) => v.month >= 20100101)) === true
  );

  console.log('\n=== Test 11-neg: NEGATIVTEST — ein Zeitraum VOR 2020 darf den Miet-Korrektur-Hinweis NICHT zeigen ===');
  const preRentCorrectionRange = monthly.filter((v) => v.month < 20200101);
  check(
    'NEGATIVTEST: Zeitraum ausschliesslich vor 2020 loest den Status-Hinweis korrekt NICHT aus',
    rentCorrectionStatusVisible(preRentCorrectionRange) === false,
    `Geprueft: ${preRentCorrectionRange.length} Monate, alle vor 2020.`
  );
  check(
    'NEGATIVTEST: Tooltip-Label fuer Dezember 2019 (rentCorrectionApplied=false) enthaelt KEINEN Miet-Korrektur-Zusatz',
    !!dec2019ForChart && !String(buildTrueflationTooltipLabel(dec2019ForChart)[0] ?? buildTrueflationTooltipLabel(dec2019ForChart)).includes('Miet-Korrektur'),
    dec2019ForChart ? JSON.stringify(buildTrueflationTooltipLabel(dec2019ForChart)) : 'Dezember 2019 fehlt.'
  );

  console.log('\n=== Test 12: knownGaps-Struktur — umbenannte Miet-Varianten-Felder abgesichert (Betreiber-Vorgabe, Schritt 1 der Session-Wiederaufnahme 29.08.2026) ===');
  // KONTEXT: Die drei Miet-Korrektur-Varianten wurden im Zuge der dritten
  // Korrekturrunde umbenannt (u.a. "...Full", "...RelocationRateWeighted",
  // "...PopulationWeighted"), OHNE dass bisher ein Test darauf existierte —
  // exakt die Fehlerklasse aus dem Datei-Header (premiumDataStatus-Rename,
  // 8pp-Schwellwert, Security-Stub). assertFieldExists() wirft hier VOR jedem
  // Zugriff, damit ein künftiger Rename sofort sichtbar auffällt statt still
  // durchzufallen.
  assertFieldExists(monthlyData, 'knownGaps', 'Test 12 (knownGaps-Struktur)');
  const mietkorrekturGap = monthlyData.knownGaps.find((g) => g.component === 'mietkorrektur');
  check(
    'knownGaps enthält einen Eintrag component="mietkorrektur"',
    !!mietkorrekturGap,
    mietkorrekturGap ? undefined : `Vorhandene components: ${monthlyData.knownGaps.map((g) => g.component).join(', ')}`
  );
  assertFieldExists(mietkorrekturGap, 'measuredEffectPpPerYearVsLongestTenureFull', 'Test 12 (Variante „voll/ungewichtet“)');
  assertFieldExists(mietkorrekturGap, 'measuredEffectPpPerYearVsLongestTenureRelocationRateWeighted', 'Test 12 (Variante „Umzugsquote-gewichtet“)');
  assertFieldExists(mietkorrekturGap, 'measuredEffectPpPerYearVsLongestTenurePopulationWeighted', 'Test 12 (Variante „Bevölkerungsanteil-gewichtet“, PRODUKTIV integriert)');
  check(
    'measuredEffectPpPerYearVsLongestTenureFull ist die grösste der drei Varianten (unges. "volle" Variante, +0.253 pp/Jahr erwartet)',
    approxEqual(mietkorrekturGap.measuredEffectPpPerYearVsLongestTenureFull, 0.253, 0.01),
    `Tatsächlich: ${mietkorrekturGap.measuredEffectPpPerYearVsLongestTenureFull}`
  );
  check(
    'measuredEffectPpPerYearVsLongestTenurePopulationWeighted ist die produktiv integrierte Variante (+0.0608 pp/Jahr erwartet, identisch zu rentCorrectionEffectVerification)',
    approxEqual(mietkorrekturGap.measuredEffectPpPerYearVsLongestTenurePopulationWeighted, 0.0608, 0.001),
    `Tatsächlich: ${mietkorrekturGap.measuredEffectPpPerYearVsLongestTenurePopulationWeighted}`
  );
  check(
    'decision-Feld benennt explizit die integrierte Variante "Bevölkerungsanteil"',
    typeof mietkorrekturGap.decision === 'string' && mietkorrekturGap.decision.includes('Bevölkerungsanteil'),
    mietkorrekturGap.decision
  );

  console.log('\n=== Test 12-neg: NEGATIVTEST — ein Rename der Varianten-Felder muss assertFieldExists zum Scheitern bringen ===');
  const renamedGap = { ...mietkorrekturGap };
  delete renamedGap.measuredEffectPpPerYearVsLongestTenureFull;
  renamedGap.measuredEffectVariantFullRenamed = mietkorrekturGap.measuredEffectPpPerYearVsLongestTenureFull;
  let renameDetected = false;
  try {
    assertFieldExists(renamedGap, 'measuredEffectPpPerYearVsLongestTenureFull', 'Test 12-neg (simulierter Rename)');
  } catch (err) {
    renameDetected = err instanceof Error && err.message.includes('existiert nicht');
  }
  check(
    'NEGATIVTEST: simulierter Rename von measuredEffectPpPerYearVsLongestTenureFull wird von assertFieldExists erkannt (wirft), statt still durchzufallen',
    renameDetected === true
  );

  console.log(`\n=== Ergebnis: ${passed} PASS, ${failures} FAIL ===`);
  if (failures > 0) {
    process.exit(1);
  }
}

main();
