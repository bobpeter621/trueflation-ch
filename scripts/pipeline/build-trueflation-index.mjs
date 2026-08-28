#!/usr/bin/env node
/**
 * trueflation.ch — Trueflation-Index-Berechnung, MONATLICH (Epic 2, US 2.1–2.3)
 *
 * V2 (Betreiber-Entscheid 26.08.2026, Architektur-Konsultation via Opus 4.8):
 * Ersetzt die vorherige rein jährliche Berechnung. Grund: Requirements 2.2a
 * verlangt explizit monatliche Datenpunkte mit jährlich aktualisierten
 * Korrekturfaktoren — eine 15-Punkte-Jahresreihe neben einer ~1340-Punkte-
 * LIK-Monatsreihe im selben Chart wäre keine Designentscheidung, sondern
 * sähe wie ein Fehler aus.
 *
 * SCOPE v1 (final, Betreiber-Entscheid 28.08.2026 nach Messung beider offener
 * Komponenten): Trueflation = LIK + Prämienkorrektur. Fixer Warenkorb (Effekt
 * -0.035 pp/Jahr, Kriterium nicht erfüllt) und Mietkorrektur (Effekt je nach
 * Vergleichsgruppe -0.156/+0.253 pp/Jahr, aber Abdeckung nur 5/15 Jahre,
 * Kriterium nicht erfüllt) sind GEPRÜFT UND ALS BEFUND DOKUMENTIERT, bewusst
 * NICHT in diese Kernberechnung integriert (siehe knownGaps unten und
 * Requirements 2.2d). Das ist kein Zwischenstand mehr, sondern der
 * abschliessende v1-Scope.
 *
 * ═══ KERNFORMEL (geometrisch, NICHT arithmetisch — kritischer Unterschied
 * zur vorherigen Jahresversion) ═══
 *
 * Warum geometrisch: Wachstumsraten, die über Teilperioden (Monate) zu einer
 * Gesamtperiode (Jahr) verkettet werden müssen, sind multiplikative Grössen.
 * Eine ARITHMETISCHE Gewichtung von WachstumsFAKTOREN
 * ((1-w)*L + w*P, wie in der Vorversion) ist mit monatlicher Compoundierung
 * nicht konsistent: 12 monatliche geometrisch-gewichtete Schritte ergeben
 * exakt das geometrisch gewichtete Jahresergebnis, aber NICHT das arithmetisch
 * gewichtete. Die geometrische Formel ist daher nicht nur "auch möglich",
 * sondern die einzige, die beim Wechsel auf Monatsdaten in sich konsistent
 * bleibt.
 *
 *   pm_y = (1 + p_y)^(1/12) − 1
 *     p_y = Prämien-Jahreswachstum (BAG-Wert Jahr y ggü. Jahr y-1)
 *     pm_y = "monatlich-äquivalente" Prämienrate, sodass (1+pm_y)^12 = 1+p_y
 *     exakt gilt (keine Näherung, keine Glättung).
 *
 *   combinedGrowthFactor(Monat m in Jahr y) =
 *     LIK_growth_factor(m)^(1 − w(y)) × (1 + pm_y)^w(y)
 *
 *   Trueflation(m) = Trueflation(m−1) × combinedGrowthFactor(m)
 *
 * w(y) = Prämiengewicht des zum Jahr y gültigen Fixierungsjahres (2010/2015/
 * 2020, stufenweise — NICHT zwischen Fixierungsjahren interpoliert, NICHT
 * innerhalb eines Kalenderjahres verändert).
 *
 * ═══ KEIN GLÄTTEN, BEWUSSTE ENTSCHEIDUNG ═══
 * Requirements 2.2a erlaubt Glätten ODER Deklarieren der jährlichen
 * Korrekturfaktor-Sprünge. Entscheidung: DEKLARIEREN, nicht glätten.
 * Begründung (Betreiber, Architektur-Review 26.08.2026): Glätten hätte ein
 * Rückwirkungs-/Vorausschau-Problem — um einen Sprung zu glätten, müsste
 * entweder rückwirkend in bereits publizierte Monate eingegriffen werden
 * (widerspricht der Versionierungs-/Nachvollziehbarkeits-Philosophie, US 5.5)
 * oder vorausschauend interpoliert werden (verletzt Requirements-Regel 3:
 * keine erfundenen Werte). Jeder Januar-Übergang trägt daher ein sichtbares
 * `transitionNote`-Feld statt geglättet zu werden — konsistent mit dem
 * Transparenz-USP des Projekts.
 *
 * WICHTIG: pm_y ändert sich JEDES Jahr (neue BAG-Jahresrate), nicht nur an
 * den drei Fixierungsjahren. w(y) ändert sich nur an Fixierungsjahren. Jeder
 * 1. Januar trägt daher eine Diskontinuität in der Prämienkomponente — das
 * ist normal und erwartet, nicht nur an 2015/2020.
 *
 * ═══ REVISIONS-POLITIK (US 1.8 — kein Einfrieren) ═══
 * Frühere Überlegung, publizierte Monate bei einer BAG-Revision (provisorisch
 * → definitiv) dauerhaft "einzufrieren", widerspricht US 1.8: Revisionen
 * sollen erkannt und eingearbeitet werden, nicht ignoriert. Dieses Skript
 * berechnet bei jedem Lauf die GESAMTE Reihe neu aus der aktuellen
 * Prämiendatendatei — eine BAG-Revision fliesst damit automatisch ein.
 * Was noch fehlt (Pipeline-Aufgabe, nicht Teil dieses Build-Skripts): ein
 * Diff zwischen altem und neuem Output, der eine materielle Revision in die
 * Änderungshistorie (US 4.10) protokolliert. Bis dahin: Revisionen werden
 * eingearbeitet, aber noch nicht automatisch protokolliert — als offener
 * Punkt dokumentiert, nicht als "gelöst" behauptet.
 *
 * ═══ SERIENSTART ═══
 * Anker: Januar 2010 (erster Monat des Startjahres), OHNE berechneten
 * Wachstumsschritt — es ist der Serienstart, kein "Übergang". Der erste
 * berechnete Schritt ist Januar→Februar 2010. Keine Sonderregel für den
 * ersten Monat nötig (frühere Fassung hatte fälschlich eine solche
 * eingeführt — Betreiber-Korrektur 26.08.2026).
 *
 * Reihe endet Dezember 2024 (letztes Jahr mit vollständig verfügbaren
 * BAG-Prämiendaten für sowohl Jahr y als auch y-1 — siehe Requirements-Regel
 * 3, keine Extrapolation).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LIK_MONTHLY_PATH = path.join(REPO_ROOT, 'data', 'lik', 'total-index-monthly.json');
const PREMIUM_PATH = path.join(REPO_ROOT, 'data', 'kvpi-premium-index', 'premium-index-ch.json');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'trueflation');
const OUTPUT_MONTHLY_PATH = path.join(OUTPUT_DIR, 'trueflation-index-monthly.json');
const OUTPUT_YEARLY_PATH = path.join(OUTPUT_DIR, 'trueflation-index-yearly.json');

const UNITS = {
  premiumBudgetShare: 'share_of_gross_income',
  cBrutto: 'share_of_gross_income',
  likIndex: 'index',
  premiumIndex: 'index',
};

// Prämien-Budgetanteil je Fixierungsjahr, % des Bruttoeinkommens (HABE),
// Position "Krankenkassen: Prämien für die Grundversicherung". Unverändert
// gegenüber V1 — bestimmt NUR w(y), nicht pm_y (das kommt separat aus der
// jährlichen BAG-Wachstumsrate, siehe unten).
const PREMIUM_BUDGET_SHARE_BY_FIXATION_YEAR = {
  2010: { value: 5.4089, source: 'BFS HABE-Publikation (Fixierungsjahr 2010), Position "Krankenkassen: Prämien für die Grundversicherung", % des Bruttoeinkommens' },
  2015: { value: 6.1841, source: 'BFS HABE-Publikation (Fixierungsjahr 2015), Position "Krankenkassen: Prämien für die Grundversicherung", % des Bruttoeinkommens' },
  2020: { value: 6.4457, source: 'BFS HABE-Publikation (Fixierungsjahr 2020), Position "Krankenkassen: Prämien für die Grundversicherung", % des Bruttoeinkommens' },
};

const C_BRUTTO_PERCENT = 48.8;
const C_BRUTTO_IS_APPROXIMATION = true;
const C_BRUTTO_SOURCE = 'BFS HABE-Publikation, Summenzeile "Konsumausgaben" (aktuellster verfügbarer Einzeljahreswert, nicht je Fixierungsjahr recherchiert)';

const FIXATION_YEARS = Object.keys(PREMIUM_BUDGET_SHARE_BY_FIXATION_YEAR)
  .map(Number)
  .sort((a, b) => a - b);

const TRUEFLATION_START_YEAR = 2010;
const TRUEFLATION_START_MONTH = TRUEFLATION_START_YEAR * 10000 + 101; // 20100101

// ─── Gewichtsberechnung (w(y), unverändert gegenüber V1) ───

function computePremiumWeight(premiumBudgetSharePercent, cBruttoPercent) {
  const pKonsum = premiumBudgetSharePercent / cBruttoPercent;
  const weight = pKonsum / (1 + pKonsum);
  return { pKonsum, weight };
}

function buildWeightTable() {
  const table = {};
  for (const fy of FIXATION_YEARS) {
    const { value: pBrutto, source } = PREMIUM_BUDGET_SHARE_BY_FIXATION_YEAR[fy];
    const { pKonsum, weight } = computePremiumWeight(pBrutto, C_BRUTTO_PERCENT);
    if (!(weight > 0 && weight < 1)) {
      throw new Error(
        `Prämiengewicht für Fixierungsjahr ${fy} ausserhalb (0,1): ${weight}. ` +
        `Abbruch — Einheitenfehler wahrscheinlich (P_brutto=${pBrutto}, C_brutto=${C_BRUTTO_PERCENT}).`
      );
    }
    table[fy] = { premiumBudgetSharePercent: pBrutto, premiumBudgetShareSource: source, pKonsum, weight };
  }
  return table;
}

function assertWeightsSumToOne(weight) {
  const sum = (1 - weight) + weight;
  const EPS = 1e-9;
  if (Math.abs(sum - 1) > EPS) {
    throw new Error(
      `Harte 100%-Prüfung fehlgeschlagen: (1-w)+w = ${sum}, erwartet 1. Gewicht w=${weight}.`
    );
  }
}

function weightForYear(year, weightTable) {
  const applicable = FIXATION_YEARS.filter((fy) => fy <= year);
  const fy = applicable.length > 0 ? Math.max(...applicable) : FIXATION_YEARS[0];
  const entry = weightTable[fy];
  assertWeightsSumToOne(entry.weight);
  return { fixationYear: fy, ...entry };
}

// ─── Datenladen ───

function loadLikMonthly() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(LIK_MONTHLY_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(`LIK-Monatsreihe nicht lesbar/parsebar (${LIK_MONTHLY_PATH}): ${err.message}`);
  }
  if (!Array.isArray(raw.values) || raw.values.length === 0) {
    throw new Error(`LIK-Monatsreihe (${LIK_MONTHLY_PATH}) hat kein nicht-leeres 'values'-Array — Abbruch.`);
  }
  if (raw.basis !== 'Ewige Reihe') {
    throw new Error(
      `Erwartete Basis "Ewige Reihe" in ${LIK_MONTHLY_PATH}, gefunden: "${raw.basis}". ` +
      `Abbruch — Basiswechsel ohne Anpassung dieses Skripts ist ein Einheitenfehler-Risiko.`
    );
  }
  const byMonth = {};
  for (const v of raw.values) {
    if (typeof v.indexDate !== 'number' || typeof v.indexValue !== 'number' || !Number.isFinite(v.indexValue) || v.indexValue <= 0) {
      throw new Error(`LIK-Monatsreihe enthält ungültigen Eintrag: ${JSON.stringify(v)} — Abbruch.`);
    }
    byMonth[v.indexDate] = v.indexValue;
  }
  return byMonth;
}

function loadPremiumYearly() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(PREMIUM_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(`Prämiendaten nicht lesbar/parsebar (${PREMIUM_PATH}): ${err.message}`);
  }
  if (!Array.isArray(raw.values) || raw.values.length === 0) {
    throw new Error(`Prämiendaten (${PREMIUM_PATH}) haben kein nicht-leeres 'values'-Array — Abbruch.`);
  }
  const byYear = {};
  for (const v of raw.values) {
    if (typeof v.year !== 'number' || typeof v.premiumCHF !== 'number' || !Number.isFinite(v.premiumCHF) || v.premiumCHF <= 0) {
      throw new Error(`Prämiendaten enthalten ungültigen Eintrag: ${JSON.stringify(v)} — Abbruch (keine erfundenen/genullten Werte).`);
    }
    byYear[v.year] = v.premiumCHF;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < years.length; i++) {
    if (years[i] !== years[i - 1] + 1) {
      throw new Error(
        `Lücke in der Prämienreihe zwischen ${years[i - 1]} und ${years[i]} — Abbruch. ` +
        `Keine mehrjährige Interpolation vorgesehen (Requirements-Regel 3).`
      );
    }
  }
  return { byYear, lastAvailableYear: Math.max(...years) };
}

/** pm_y je Kalenderjahr: monatlich-äquivalente Prämienrate, exakt so dass
 * (1+pm_y)^12 = 1+p_y gilt (keine Näherung). Nur für Jahre berechenbar, für
 * die sowohl premium[y] als auch premium[y-1] vorliegen. */
function buildMonthlyEquivalentPremiumRates(premiumByYear, premiumLastAvailableYear) {
  const years = Object.keys(premiumByYear).map(Number).sort((a, b) => a - b);
  const pmByYear = {};
  for (const y of years) {
    if (premiumByYear[y - 1] == null) continue; // erstes Jahr der Quelle, kein Vorjahr
    const p_y = premiumByYear[y] / premiumByYear[y - 1] - 1;
    const pm_y = Math.pow(1 + p_y, 1 / 12) - 1;
    if (!Number.isFinite(pm_y)) {
      throw new Error(`pm_${y} ist nicht endlich (p_y=${p_y}) — Abbruch statt stiller NaN-Fortpflanzung.`);
    }
    pmByYear[y] = { p_y, pm_y };
  }
  return pmByYear;
}

// ─── Monatsschlüssel-Helfer ───

function nextMonth(yyyymm01) {
  const year = Math.floor(yyyymm01 / 10000);
  const month = Math.floor((yyyymm01 % 10000) / 100);
  if (month === 12) return (year + 1) * 10000 + 101;
  return year * 10000 + (month + 1) * 100 + 1;
}

function yearOf(yyyymm01) { return Math.floor(yyyymm01 / 10000); }
function monthOf(yyyymm01) { return Math.floor((yyyymm01 % 10000) / 100); }

// ─── Kernberechnung, monatlich ───

function buildTrueflationMonthlySeries({ likByMonth, pmByYear, premiumLastAvailableYear, weightTable }) {
  const endYear = premiumLastAvailableYear; // keine Extrapolation über letztes BAG-Jahr hinaus
  const endMonth = endYear * 10000 + 1201;

  if (likByMonth[TRUEFLATION_START_MONTH] == null) {
    throw new Error(`LIK-Wert für Startmonat ${TRUEFLATION_START_MONTH} fehlt — Abbruch.`);
  }

  // Lückenlose Monatsfolge im LIK ab Start bis Endmonat sicherstellen.
  let cursor = TRUEFLATION_START_MONTH;
  const months = [cursor];
  while (cursor !== endMonth) {
    const next = nextMonth(cursor);
    if (likByMonth[next] == null) {
      throw new Error(`Lücke in der LIK-Monatsreihe bei ${next} — Abbruch (erwartet lückenlos ${TRUEFLATION_START_MONTH}–${endMonth}).`);
    }
    months.push(next);
    cursor = next;
  }

  const series = [];
  let trueflationLevel = likByMonth[TRUEFLATION_START_MONTH]; // Anker, kein Wachstumsschritt
  const anchorWeightInfo = weightForYear(TRUEFLATION_START_YEAR, weightTable);
  series.push({
    month: TRUEFLATION_START_MONTH,
    trueflationIndex: round4(trueflationLevel),
    likIndex: likByMonth[TRUEFLATION_START_MONTH],
    // Diese drei Felder existieren bei Folgemonaten (siehe unten) und werden
    // hier bewusst mit neutralen Werten mitgeführt, damit ALLE Einträge
    // dieselbe Feldmenge tragen — sonst bricht ein struktureller
    // Existenz-Check (Fail-fast-Prinzip, Betreiber-Vorgabe 26.08.2026) beim
    // ersten Element der Serie, obwohl das kein Fehler ist, sondern der Anker
    // schlicht keine Wachstumsrate hat.
    likGrowthRatePercent: null,
    premiumMonthlyEquivalentRatePercent: null,
    premiumAnnualRatePercent: null,
    premiumWeight: round6(anchorWeightInfo.weight),
    fixationYear: anchorWeightInfo.fixationYear,
    calendarYear: TRUEFLATION_START_YEAR,
    isJanuaryTransition: false,
    dataStatus: 'anchor',
    transitionNote: null,
  });

  for (let i = 1; i < months.length; i++) {
    const m = months[i];
    const prevM = months[i - 1];
    const y = yearOf(m);
    const isJanuary = monthOf(m) === 1;

    const likGrowthFactor = likByMonth[m] / likByMonth[prevM];

    const { weight, fixationYear } = weightForYear(y, weightTable);

    if (pmByYear[y] == null) {
      throw new Error(
        `Keine monatlich-äquivalente Prämienrate für Kalenderjahr ${y} verfügbar ` +
        `(fehlender BAG-Jahreswert oder Vorjahreswert) — Abbruch statt Interpolation.`
      );
    }
    const { pm_y, p_y } = pmByYear[y];

    // ═══ GEOMETRISCHE Gewichtung — kritischer Unterschied zur Vorversion ═══
    // combinedGrowthFactor = LIK_growth^(1-w) * (1+pm_y)^w
    // NICHT: (1-w)*LIK_growth + w*(1+pm_y)  [arithmetisch, falsch für Monatsdaten]
    const combinedGrowthFactor =
      Math.pow(likGrowthFactor, 1 - weight) * Math.pow(1 + pm_y, weight);

    if (!Number.isFinite(combinedGrowthFactor) || combinedGrowthFactor <= 0) {
      throw new Error(
        `Nicht-endlicher oder nicht-positiver Wachstumsfaktor bei Monat ${m}: ${combinedGrowthFactor} ` +
        `(likGrowthFactor=${likGrowthFactor}, pm_y=${pm_y}, weight=${weight}) — Abbruch.`
      );
    }

    trueflationLevel = trueflationLevel * combinedGrowthFactor;

    series.push({
      month: m,
      trueflationIndex: round4(trueflationLevel),
      likIndex: likByMonth[m],
      likGrowthRatePercent: round4((likGrowthFactor - 1) * 100),
      premiumMonthlyEquivalentRatePercent: round4(pm_y * 100),
      premiumAnnualRatePercent: round4(p_y * 100),
      premiumWeight: round6(weight),
      fixationYear,
      calendarYear: y,
      isJanuaryTransition: isJanuary,
      dataStatus: 'aktuell',
      transitionNote: isJanuary
        ? `Prämienkomponente zum 1.1.${y} aktualisiert, Basis: BAG-Jahreswert ${y} ggü. ${y - 1} (${round4(p_y * 100)}%). ` +
          `Kein künstlicher Sprung durch Verkettung, aber die Prämienrate wechselt an jedem Jahresanfang — bewusst deklariert, nicht geglättet (siehe Methodik).`
        : null,
    });
  }

  return series;
}

/** Aggregiert die Monatsreihe zu Jahresendpunkten (Januar-Werte je Jahr) für
 * die abgeleitete Jahresdatei — EINZIGE Quelle der Wahrheit ist die
 * Monatsreihe, dies ist reine Extraktion, keine separate Neuberechnung. */
function deriveYearlySnapshotFromMonthly(monthlySeries) {
  const byJanuary = monthlySeries.filter((v) => monthOf(v.month) === 1);
  return byJanuary.map((v) => ({
    year: yearOf(v.month),
    trueflationIndex: v.trueflationIndex,
    likIndex: v.likIndex,
    premiumWeight: v.premiumWeight,
    fixationYear: v.fixationYear,
    dataStatus: v.dataStatus,
  }));
}

/** JAHRESDURCHSCHNITTE aus der Monatsreihe (Betreiber-Anforderung 26.08.2026):
 * Das BFS publiziert die amtliche Jahresteuerung als Jahresdurchschnitt gegen
 * Jahresdurchschnitt, NICHT als Januar-zu-Januar. Eine Kopfzahl auf Basis von
 * Januar-Werten (zusätzlich ironisch, da Januar selbst saisonal atypisch ist,
 * siehe Test 3) wäre für Vergleiche mit amtlicher Berichterstattung/Presse
 * irreführend. NUR VOLLSTÄNDIGE Kalenderjahre (12 Monatswerte vorhanden)
 * werden aufgenommen — ein Teiljahr würde einen verzerrten Durchschnitt
 * liefern und stillschweigend wie ein Vollwert aussehen.
 *
 * VERIFIZIERT (Betreiber-Review 26.08.2026): Trueflation-Jahresdurchschnitt
 * 2010→2024 = 9.66% (arithmetisches Mittel der 12 Indexstände je Jahr,
 * identisch zur BFS-Methodik) — weicht PLAUSIBEL von der alten rein
 * jahresbasierten V1-Rechnung (9.81%) ab, weil dort die Gewichtung jährlich
 * statt monatlich griff. Ist NICHT identisch mit 9.81% (das wäre ein Zeichen,
 * dass hier fälschlich die alte Jahresreihe statt echter Monatsmittelung
 * verwendet würde) und NICHT identisch mit dem internen Jan-zu-Jan-Wert
 * (9.23%, geometrisch) — drei unterschiedliche, je nach Verwendungszweck
 * richtige Zahlen. Siehe Test 1e/1g für die automatisierte Absicherung
 * dieser Unterscheidung. */
function computeCalendarYearAverages(monthlySeries) {
  const byYear = {};
  for (const v of monthlySeries) {
    const y = yearOf(v.month);
    if (!byYear[y]) byYear[y] = { trueflationSum: 0, likSum: 0, count: 0 };
    byYear[y].trueflationSum += v.trueflationIndex;
    byYear[y].likSum += v.likIndex;
    byYear[y].count += 1;
  }
  const result = [];
  for (const [yStr, agg] of Object.entries(byYear)) {
    if (agg.count !== 12) continue; // nur vollstaendige Kalenderjahre
    result.push({
      year: Number(yStr),
      trueflationIndexAvg: round4(agg.trueflationSum / 12),
      likIndexAvg: round4(agg.likSum / 12),
      monthsIncluded: agg.count,
    });
  }
  result.sort((a, b) => a.year - b.year);
  return result;
}

function round4(x) { return Math.round(x * 10000) / 10000; }
function round6(x) { return Math.round(x * 1000000) / 1000000; }

// ─── Hauptlauf ───

function main() {
  const weightTable = buildWeightTable();
  const likByMonth = loadLikMonthly();
  const { byYear: premiumByYear, lastAvailableYear: premiumLastAvailableYear } = loadPremiumYearly();
  const pmByYear = buildMonthlyEquivalentPremiumRates(premiumByYear, premiumLastAvailableYear);

  const monthlySeries = buildTrueflationMonthlySeries({
    likByMonth,
    pmByYear,
    premiumLastAvailableYear,
    weightTable,
  });

  const methodology = {
    formula: 'pm_y = (1+p_y)^(1/12) - 1 (monatlich-aequivalente Praemienrate); ' +
      'combinedGrowthFactor(m) = LIK_growth_factor(m)^(1-w(y)) * (1+pm_y)^w(y); ' +
      'Trueflation(m) = Trueflation(m-1) * combinedGrowthFactor(m). ' +
      'GEOMETRISCHE Gewichtung, nicht arithmetisch — einzige mit monatlicher Compoundierung konsistente Form.',
    weightFormula: 'P_konsum = P_brutto / C_brutto; premiumWeight = P_konsum / (1 + P_konsum)',
    fixationRhythmYears: 5,
    smoothingPolicy: 'Kein Glätten der Januar-Sprünge — bewusst deklariert (siehe transitionNote je ' +
      'Januar-Monat). Glätten würde entweder rückwirkend publizierte Monate ändern oder vorausschauend ' +
      'interpolieren, beides mit den Transparenz-/Anti-Erfindung-Prinzipien des Projekts unvereinbar.',
    revisionPolicy: 'US 1.8: Jeder Lauf berechnet die gesamte Reihe neu aus der aktuellen Prämiendatendatei ' +
      '- eine BAG-Revision (provisorisch -> definitiv) fliesst automatisch ein, keine Sperre/Einfrierung ' +
      'publizierter Monate. OFFEN: automatisches Protokollieren materieller Revisionen in der ' +
      'Aenderungshistorie (US 4.10) ist noch nicht Teil dieses Build-Skripts.',
    cBrutto: {
      value: C_BRUTTO_PERCENT,
      unit: UNITS.cBrutto,
      isApproximation: C_BRUTTO_IS_APPROXIMATION,
      source: C_BRUTTO_SOURCE,
    },
    premiumBudgetShareByFixationYear: PREMIUM_BUDGET_SHARE_BY_FIXATION_YEAR,
    weightTable,
    note2025: '2025 und spaeter: 2020er-Gewicht wird fortgeschrieben, bis HABE-Publikation ein neues ' +
      'Fixierungsjahr-Gewicht liefert. Reihe selbst endet aber beim letzten Jahr mit vollstaendigen ' +
      'BAG-Praemiendaten (aktuell 2024) - keine Extrapolation der Praemienkomponente.',
  };

  const knownGaps = [
    {
      component: 'fixer_warenkorb',
      status: 'geprüft, Ergebnis dokumentiert (28.08.2026)',
      reason: 'Aktuellste Gewichte ("LIK-Warenkorb und Gewichte 2026", 13 Hauptgruppen, siehe ' +
        'config/lik-warenkorb-gewichte-2026.json) rückwirkend 2010-2024 fixiert und gegen dieselbe ' +
        '13er-posId-Struktur wie die verkettete Reihe verrechnet (siehe build-warenkorb-fixation-test.mjs) ' +
        '— kein 12<->13-Zuordnungsproblem. Gemessener Effekt -0.035 pp/Jahr, Kriterium (|Effekt| >= 0.10 ' +
        'pp/Jahr UND Abdeckung >= 10/15 Jahre) NICHT erfüllt (Betrag zu klein, Abdeckung war voll: 15/15). ' +
        'Als Befund dokumentiert, NICHT als Overlay umgesetzt — nicht in diese Kernberechnung integriert.',
      measuredEffectPpPerYear: -0.035,
      criterionMet: false,
      decision: 'als Befund dokumentiert, kein Overlay',
    },
    {
      component: 'mietkorrektur',
      status: 'geprüft, Ergebnis dokumentiert (28.08.2026)',
      reason: 'Zwei Vergleichsgruppen berechnet (gegen Gesamtdurchschnitt: -0.156 pp/Jahr; gegen längste ' +
        'Bezugsdauer-Klasse 21J+: +0.253 pp/Jahr — Vorzeichen dreht sich je nach Vergleichsgruppe). ' +
        'Betrag erfüllt in beiden Varianten die Schwelle (>= 0.10 pp/Jahr), aber Abdeckungsprüfung ' +
        '(BFS-DAM-API, timeboxed) fand keine älteren Rohdaten-Jahrgänge — Abdeckung bleibt 5 von 15 ' +
        'Jahren (2020-2024), Kriterium (>= 10/15) NICHT erfüllt. Zusätzlich meldepflichtiger ' +
        'Widerspruchsbefund: Pro-m²-Kreuzprüfung zeigt gegenteilige Richtung (+1.84pp).',
      measuredEffectPpPerYearVsTotal: -0.156,
      measuredEffectPpPerYearVsLongestTenure: 0.253,
      criterionMet: false,
      decision: 'als Befund dokumentiert, kein Overlay',
    },
    {
      component: 'strom',
      status: 'dauerhaft gestrichen',
      reason: 'Doppelzählung — Strom bereits vollständig im LIK enthalten.',
    },
  ];

  const monthlyOutput = {
    _comment: 'Automatisch generiert durch build-trueflation-index.mjs (V2, monatlich). ' +
      'SCOPE v1: Trueflation = LIK + Prämienkorrektur. Fixer Warenkorb und Mietkorrektur sind ' +
      'GEPRÜFT UND ALS BEFUND DOKUMENTIERT (siehe knownGaps), bewusst nicht integriert. Dieser Wert ' +
      'ist der abschliessende v1-Scope (LIK + Prämienkorrektur), nicht das vollständige ' +
      'Ergebnis. Geometrische Gewichtung (siehe methodology.formula) — Wechsel von der ' +
      'arithmetischen V1-Formel ist eine bewusste, mathematisch begründete Änderung, kein Fehler.',
    scope: 'lik_plus_premium_correction_only',
    granularity: 'monthly',
    startMonth: TRUEFLATION_START_MONTH,
    methodology,
    knownGaps,
    values: monthlySeries,
  };

  const yearlySnapshot = deriveYearlySnapshotFromMonthly(monthlySeries);
  const calendarYearAverages = computeCalendarYearAverages(monthlySeries);
  const yearlyOutput = {
    _comment: 'ABGELEITET aus der Monatsreihe (trueflation-index-monthly.json) — KEINE eigene ' +
      'Neuberechnung. "values" sind Januar-Endpunkte (Momentaufnahme, konsistent mit dem ' +
      'monatlichen Kettenindex). "calendarYearAverages" sind JAHRESDURCHSCHNITTE (Mittel der 12 ' +
      'Monatswerte je Kalenderjahr) — DIES ist die für Kopfzahlen (US 3.1) und den ' +
      'Kaufkraft-Rechner zu verwendende Grösse, weil das BFS die amtliche Jahresteuerung ebenfalls ' +
      'als Jahresdurchschnitt gegen Jahresdurchschnitt publiziert — eine Januar-zu-Januar-Zahl ' +
      'wäre gegen Presse-/BFS-Meldungen nicht vergleichbar und zusätzlich durch die Saisonalität des ' +
      'Monats Januar (Winterschlussverkauf etc., siehe Test 3) verzerrt. Einzige Quelle der ' +
      'Wahrheit für BEIDE Felder ist die Monatsreihe, keine separate Neuberechnung.',
    scope: 'lik_plus_premium_correction_only',
    derivedFrom: 'trueflation-index-monthly.json',
    startYear: TRUEFLATION_START_YEAR,
    methodology,
    knownGaps,
    values: yearlySnapshot,
    calendarYearAverages,
  };

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_MONTHLY_PATH, JSON.stringify(monthlyOutput, null, 2) + '\n', 'utf-8');
  writeFileSync(OUTPUT_YEARLY_PATH, JSON.stringify(yearlyOutput, null, 2) + '\n', 'utf-8');

  console.log(`[trueflation] Geschrieben: ${OUTPUT_MONTHLY_PATH} (${monthlySeries.length} Monate)`);
  console.log(`[trueflation] Geschrieben: ${OUTPUT_YEARLY_PATH} (${yearlySnapshot.length} Jahre, abgeleitet; ${calendarYearAverages.length} vollständige Kalenderjahre mit Durchschnitt)`);

  const first = yearlySnapshot[0];
  const last = yearlySnapshot[yearlySnapshot.length - 1];
  const trueflationGrowthTotal = (last.trueflationIndex / first.trueflationIndex - 1) * 100;
  const likGrowthTotal = (last.likIndex / first.likIndex - 1) * 100;
  console.log(`[trueflation] Jan-zu-Jan ${first.year}→${last.year}: LIK ${likGrowthTotal.toFixed(2)}% | Trueflation ${trueflationGrowthTotal.toFixed(2)}% (interne Berechnungsbasis, geometrisch, monatlich kompoundiert)`);

  if (calendarYearAverages.length >= 2) {
    const firstAvg = calendarYearAverages[0];
    const lastAvg = calendarYearAverages[calendarYearAverages.length - 1];
    const likAvgGrowth = (lastAvg.likIndexAvg / firstAvg.likIndexAvg - 1) * 100;
    const trueflationAvgGrowth = (lastAvg.trueflationIndexAvg / firstAvg.trueflationIndexAvg - 1) * 100;
    console.log(`[trueflation] Jahresdurchschnitt ${firstAvg.year}→${lastAvg.year}: LIK ${likAvgGrowth.toFixed(2)}% | Trueflation ${trueflationAvgGrowth.toFixed(2)}% (ANZEIGE-BASIS für Kopfzahl/Kaufkraft-Rechner, vergleichbar mit amtlicher BFS-Berichterstattung)`);
  }
}

main();
