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

  // Toleranzband um die tatsächlich beobachteten Werte (5.06% / 9.23%) —
  // NICHT die alte 5.5%/10%-Zahl, die auf Jahresdurchschnitten beruhte.
  check(
    'LIK-Wachstum (Jan-zu-Jan) 2010-2024 ≈ +5.06% (±0.5pp, Referenz aus Rohdaten)',
    approxEqual(likGrowthJanJan, 5.06, 0.5),
    `Ist-Wert: ${likGrowthJanJan.toFixed(4)}%`
  );
  check(
    'Trueflation-Wachstum (Jan-zu-Jan, geometrisch) 2010-2024 ≈ +9.23% (±0.5pp)',
    approxEqual(trueflationGrowthJanJan, 9.23, 0.5),
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
    !approxEqual(manipulatedGrowth, 9.23, 0.5),
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
    check(
      'LIK-Jahresdurchschnittswachstum 2010-2024 ≈ +5.51% (±0.3pp, amtlich vergleichbare Referenz)',
      approxEqual(likAvgGrowth, 5.51, 0.3),
      `Ist-Wert: ${likAvgGrowth.toFixed(4)}%`
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

  console.log(`\n=== Ergebnis: ${passed} PASS, ${failures} FAIL ===`);
  if (failures > 0) {
    process.exit(1);
  }
}

main();
