/**
 * trueflation.ch — Gemeinsames Modul für Jahresraten-Berechnung (REQ-T6.3,
 * REQ-T7: EINE Datenquelle, EINE Rundung, EINE Berechnungslogik für
 * Jahresraten-Tabelle, CSV-Export und Kernzahlen-Kacheln).
 *
 * DATENQUELLE: data/trueflation/trueflation-index-yearly.json
 * (calendarYearAverages — Jahresdurchschnitte der Indexstände, abgeleitet
 * aus der Monatsreihe; KEINE eigene Neuberechnung, siehe _comment in der
 * Datei). Die Jahresrate eines Kalenderjahres Y ist die Wachstumsrate des
 * Jahresdurchschnitts gegenüber dem Jahresdurchschnitt von Y-1:
 *
 *   rate(Y) = (avg(Y) / avg(Y-1) - 1) * 100
 *
 * Das ist dieselbe Grösse, die das BFS als amtliche Jahresteuerung
 * publiziert (Jahresdurchschnitt ggü. Jahresdurchschnitt) — NICHT die
 * rollierende 12-Monats-Rate toYoyRate() aus LikChart.tsx (die arbeitet auf
 * der Monatsreihe mit 45-Tage-Toleranz und beantwortet eine andere Frage:
 * "Rate an diesem Stichtag", nicht "Kalenderjahresrate").
 *
 * SONDERFALL 2010 (erste Tabellenzeile, dokumentierte Entscheidung,
 * REQ-T2 verlangt eine Zeile pro Kalenderjahr AB 2010):
 *  - LIK-Rate 2010: berechenbar, weil die LIK-Monatsreihe
 *    (data/lik/total-index-monthly.json) das Vorjahr 2009 vollständig
 *    enthält — der LIK-2009-Jahresdurchschnitt wird nach EXAKT derselben
 *    Methode gebildet wie computeCalendarYearAverages() in
 *    scripts/pipeline/build-trueflation-index.mjs (Mittel der 12
 *    Monatswerte, Rundung auf 4 Nachkommastellen, siehe round4 dort).
 *    Konsistenzbeleg: 1046.5333/1039.3583-1 = 0.69% ≈ amtliche BFS-
 *    Jahresteuerung 2010 (0.7%).
 *  - Trueflation-Rate 2010: NICHT berechenbar — Trueflation existiert
 *    strukturell erst ab 2010 (kein 2009-Vorjahreswert, keine
 *    Interpolation). Zelle zeigt "—" mit Erklärung, die Differenz-Zelle
 *    2010 bleibt ebenfalls "—" (keine erfundene Zahl).
 *  - Die kumulierte Fusszeile (2010–YYYY) ist davon NICHT betroffen: sie
 *    verkettet die Jahresdurchschnitts-Faktoren ab dem Ankerjahr 2010,
 *    nicht die Raten.
 *
 * RUNDUNG (AC-T6.2, AC-T6.3): EINMAL zentral hier — RATE_DECIMALS = 2
 * Nachkommastellen. Begründung für 2 statt 1 (AC-T6.2 erlaubt bewusste
 * Methodik-Festlegung, dann ÜBERALL gleich): Die dokumentierten Kernzahlen
 * (docs/requirements-v1.0.md: LIK +5.51%, Trueflation +9.93%, 2010–2024)
 * und das Build-Skript (toFixed(2)) arbeiten mit 2 Stellen; die Fusszeile
 * muss damit nach derselben Rundungsregel identisch ausfallen (AC-T4.2).
 * Locale de-CH (Dezimalkomma) via Intl.NumberFormat.
 */

export type CalendarYearAverage = {
  year: number;
  trueflationIndexAvg: number;
  likIndexAvg: number;
  monthsIncluded: number;
};

export type TrueflationYearlyFile = {
  startYear: number;
  calendarYearAverages: CalendarYearAverage[];
};

export type LikMonthlyFile = {
  sourcePublishDate: number;
  values: Array<{ indexDate: number; indexValue: number }>;
};

/** Erstes Jahr mit Miet-Korrektur in der Trueflation-Reihe (Methodik,
 * rentCorrection.startYear in trueflation-index-yearly.json). EINMALIGER
 * Bruch → Zeilen-Marker in der Tabelle (AC-T5.1). */
export const RENT_CORRECTION_START_YEAR = 2020;

/** Zentrale Nachkommastellen-Festlegung (siehe Dateikopf, AC-T6.2/6.3). */
export const RATE_DECIMALS = 2;

/** Zentrale Rundung — die EINZige Stelle, an der Raten gerundet werden
 * (Tabelle, CSV, Kernzahlen-Kacheln nutzen alle ausschliesslich
 * formatRate/formatSignedRate). */
export function roundRate(value: number): number {
  const factor = Math.pow(10, RATE_DECIMALS);
  return Math.round(value * factor) / factor;
}

/** Zentrale de-CH-Formatierung mit DEZIMALKOMMA (AC-T6.1, Betreiber-
 * Vorgabe). WICHTIG: Intl.NumberFormat("de-CH") wird hier bewusst NICHT
 * verwendet — die CLDR-Definition von de-CH liefert einen PUNKT als
 * Dezimaltrennzeichen ("1.14"), das Requirement verlangt aber explizit das
 * Komma ("1,14", Tausendertrennzeichen ' nur wenn nötig — bei Raten unter
 * 100% nicht nötig). Formatierung daher manuell: zentrale Rundung, dann
 * toFixed + Punkt→Komma. Negative Werte behalten das Minus (AC-T6.4). */
function formatDeCh(rounded: number): string {
  return rounded.toFixed(RATE_DECIMALS).replace(".", ",");
}

/** Unsignierte Rate, de-CH mit Komma ("0,69"), null → "—" (keine erfundene Zahl). */
export function formatRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatDeCh(roundRate(value));
}

/** Signierte Rate (Differenz-Spalte): "+0,69" / "-1,16" / exakt Null →
 * "0,00" (AC-T3.4: Null ist "0.0", nicht leer; negatives Vorzeichen bleibt
 * erhalten, kein Klammerformat, AC-T6.4). */
export function formatSignedRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = roundRate(value);
  // Rundung kann -0.004 → -0 ergeben; -0 soll als "0,00" erscheinen.
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return (normalized > 0 ? "+" : "") + formatDeCh(normalized);
}

/** LIK-Jahresdurchschnitt eines beliebigen Kalenderjahres aus der
 * Monatsreihe — dieselbe Methode wie computeCalendarYearAverages() im
 * Build-Skript (nur vollständige Jahre mit 12 Monaten, Rundung auf 4
 * Nachkommastellen). Wird für das Vorjahr 2009 der ersten Tabellenzeile
 * gebraucht (siehe Dateikopf, Sonderfall 2010). */
export function likAnnualAverage(likMonthly: LikMonthlyFile, year: number): number | null {
  const months = likMonthly.values.filter((v) => Math.floor(v.indexDate / 10000) === year);
  if (months.length !== 12) return null; // nur vollständige Kalenderjahre (wie Build-Skript)
  const sum = months.reduce((acc, v) => acc + v.indexValue, 0);
  return Math.round((sum / 12) * 10000) / 10000;
}

export type AnnualRateRow = {
  year: number;
  likRatePercent: number | null;
  trueflationRatePercent: number | null;
  /** Trueflation − LIK in Prozentpunkten (AC-T3: Header "Differenz (pp)"). */
  differenzPp: number | null;
  /** Erste Zeile der Reihe (2010): Trueflation-Vorjahr existiert nicht. */
  isFirstYear: boolean;
  /** Zeile 2020: einmaliger Methoden-Bruch, Miet-Korrektur ab diesem Jahr (AC-T5.1). */
  isRentCorrectionStart: boolean;
  /** Jeweils letztes Datenjahr: Prämienwert noch provisorisch (BAG-Schätzung,
   * wird im Folgejahr ersetzt — AC-T5.2, Methodik "Bekannte Einschränkungen
   * der Prämiendaten"). */
  isProvisional: boolean;
};

/** Jahresraten 2010–letztes abgeschlossenes Trueflation-Jahr, aus
 * calendarYearAverages (REQ-T2: lückenlos, endet beim letzten TRUEFLATION-
 * Jahr, nicht beim weiterlaufenden LIK). */
export function computeAnnualRows(
  yearly: TrueflationYearlyFile,
  likMonthly: LikMonthlyFile
): AnnualRateRow[] {
  const avgs = [...yearly.calendarYearAverages]
    .filter((a) => a.monthsIncluded === 12)
    .sort((a, b) => a.year - b.year);
  return avgs.map((cur, i) => {
    let likRatePercent: number | null = null;
    let trueflationRatePercent: number | null = null;
    if (i > 0) {
      const prev = avgs[i - 1];
      likRatePercent = (cur.likIndexAvg / prev.likIndexAvg - 1) * 100;
      trueflationRatePercent = (cur.trueflationIndexAvg / prev.trueflationIndexAvg - 1) * 100;
    } else {
      // Sonderfall erste Zeile (2010) — siehe Dateikopf.
      const prevLikAvg = likAnnualAverage(likMonthly, cur.year - 1);
      if (prevLikAvg != null && prevLikAvg !== 0) {
        likRatePercent = (cur.likIndexAvg / prevLikAvg - 1) * 100;
      }
      // trueflationRatePercent bleibt null: Reihe existiert erst ab 2010.
    }
    return {
      year: cur.year,
      likRatePercent,
      trueflationRatePercent,
      differenzPp:
        likRatePercent != null && trueflationRatePercent != null
          ? trueflationRatePercent - likRatePercent
          : null,
      isFirstYear: i === 0,
      isRentCorrectionStart: cur.year === RENT_CORRECTION_START_YEAR,
      isProvisional: i === avgs.length - 1,
    };
  });
}

export type CumulativeResult = {
  fromYear: number;
  toYear: number;
  likCumulativePercent: number;
  trueflationCumulativePercent: number;
  differenzPp: number;
};

/** Kumulierte Veränderung über die gesamte Tabellenperiode (Fusszeile,
 * AC-T4). GEOMETRISCH: (avg_end / avg_start - 1) — das ist mathematisch
 * identisch mit der Verkettung aller Einzeljahresfaktoren
 * ∏(avg_y / avg_{y-1}) = avg_end/avg_start (AC-T4.3), und identisch mit
 * der Formel im Build-Skript (likAvgGrowth/trueflationAvgGrowth), aus der
 * die dokumentierten Referenz-Kernzahlen (LIK 5.51%, Trueflation 9.93%,
 * 2010–2024) stammen (AC-T4.2). */
export function computeCumulative(yearly: TrueflationYearlyFile): CumulativeResult | null {
  const avgs = [...yearly.calendarYearAverages]
    .filter((a) => a.monthsIncluded === 12)
    .sort((a, b) => a.year - b.year);
  if (avgs.length < 2) return null;
  const first = avgs[0];
  const last = avgs[avgs.length - 1];
  const likCumulativePercent = (last.likIndexAvg / first.likIndexAvg - 1) * 100;
  const trueflationCumulativePercent = (last.trueflationIndexAvg / first.trueflationIndexAvg - 1) * 100;
  return {
    fromYear: first.year,
    toYear: last.year,
    likCumulativePercent,
    trueflationCumulativePercent,
    differenzPp: trueflationCumulativePercent - likCumulativePercent,
  };
}

/** Stand der LIK-Daten als "YYYY-MM" (für Quellenzeile unter der Tabelle,
 * AC-T7.4). */
export function likDataStand(likMonthly: LikMonthlyFile): string {
  const last = likMonthly.values[likMonthly.values.length - 1];
  const s = String(last.indexDate);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}`;
}

const CSV_HEADER = "Jahr;LIK Jahresrate (%);Trueflation Jahresrate (%);Differenz (pp)";

/** CSV-Export (REQ-T9): dieselben Pflichtspalten wie die Tabelle, Fusszeile
 * als letzte Datenzeile ("kumuliert_2010_YYYY", AC-T9.2), Header auf
 * Deutsch (AC-T9.3). Dezimalkomma (de-CH, zentrale Rundung via
 * formatRate/formatSignedRate) → Semikolon als Feldtrenner, damit der
 * Import in LibreOffice/Excel ohne verschobene Spalten funktioniert
 * (Definition-of-Done-Hinweis). Inhalt hängt NUR von den Daten ab, nie vom
 * Rechner-Input (AC-T9.4 — die Funktion kennt betrag/jahr gar nicht). */
export function buildCsv(rows: AnnualRateRow[], cumulative: CumulativeResult): string {
  const lines = rows.map((r) =>
    [
      String(r.year),
      formatRate(r.likRatePercent),
      formatRate(r.trueflationRatePercent),
      formatSignedRate(r.differenzPp),
    ].join(";")
  );
  lines.push(
    [
      `kumuliert_${cumulative.fromYear}_${cumulative.toYear}`,
      formatSignedRate(cumulative.likCumulativePercent),
      formatSignedRate(cumulative.trueflationCumulativePercent),
      formatSignedRate(cumulative.differenzPp),
    ].join(";")
  );
  return [CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}

/** TSV für "Tabelle kopieren" (AC-T9.5, optional): Tab-getrennt, sonst
 * identischer Inhalt wie die sichtbare Tabelle. */
export function buildTsv(rows: AnnualRateRow[], cumulative: CumulativeResult): string {
  const lines = rows.map((r) =>
    [
      String(r.year),
      formatRate(r.likRatePercent),
      formatRate(r.trueflationRatePercent),
      formatSignedRate(r.differenzPp),
    ].join("\t")
  );
  lines.push(
    [
      `Kumuliert ${cumulative.fromYear}–${cumulative.toYear}`,
      formatSignedRate(cumulative.likCumulativePercent),
      formatSignedRate(cumulative.trueflationCumulativePercent),
      formatSignedRate(cumulative.differenzPp),
    ].join("\t")
  );
  return ["Jahr\tLIK Jahresrate (%)\tTrueflation Jahresrate (%)\tDifferenz (pp)", ...lines].join("\n");
}

/** Dateiname gemäss AC-T9.3: trueflation-lik-jahresraten-YYYY-MM-DD.csv */
export function csvFileName(today: Date): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `trueflation-lik-jahresraten-${y}-${m}-${d}.csv`;
}
