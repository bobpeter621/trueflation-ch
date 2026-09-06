"use client";

/**
 * trueflation.ch — Jahresraten-Tabelle "LIK vs. Trueflation" (Betreiber-
 * Requirement REQ-T1 bis REQ-T11, 05.09.2026).
 *
 * Tabellarische, zitierbare Entsprechung des Charts "LIK vs. Trueflation":
 * eine Zeile pro Kalenderjahr 2010 bis zum letzten abgeschlossenen
 * Trueflation-Jahr (aktuell 2024), Spalten Jahr / LIK (%) / Trueflation (%)
 * / Differenz (pp), Fusszeile mit geometrisch kumulierter Veränderung.
 *
 * Die gesamte Zahlenlogik liegt in app/lib/annual-rates.ts (REQ-T6.3/T7:
 * EINE Datenquelle, EINE zentrale Rundung, EINE Berechnung — geteilt mit
 * den Kernzahlen-Kacheln und dem CSV-Export). Diese Komponente rendert
 * nur. Sie kennt den Kaufkraft-Rechner NICHT — Rechner-Inputs (Betrag,
 * Startjahr) können per Konstruktion keine Zelle ändern (AC-T1.4/T2.4/
 * T9.4, Negativtest in verification/jahresraten-tabelle-check.mjs).
 */

import { useEffect, useMemo, useState } from "react";
import {
  computeAnnualRows,
  computeCumulative,
  formatRate,
  formatSignedRate,
  buildCsv,
  buildTsv,
  csvFileName,
  likDataStand,
  type AnnualRateRow,
  type CumulativeResult,
  type LikMonthlyFile,
  type TrueflationYearlyFile,
} from "../lib/annual-rates";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AnnualRateRow[]; cumulative: CumulativeResult; likStand: string };

export default function JahresratenTabelle() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/data/trueflation/trueflation-index-yearly.json").then((r) => {
        if (!r.ok) throw new Error(`Trueflation-Jahresdaten HTTP ${r.status}`);
        return r.json() as Promise<TrueflationYearlyFile>;
      }),
      fetch("/data/lik/total-index-monthly.json").then((r) => {
        if (!r.ok) throw new Error(`LIK-Monatsdaten HTTP ${r.status}`);
        return r.json() as Promise<LikMonthlyFile>;
      }),
    ])
      .then(([yearly, likMonthly]) => {
        const rows = computeAnnualRows(yearly, likMonthly);
        const cumulative = computeCumulative(yearly);
        if (rows.length === 0 || cumulative == null) {
          throw new Error("keine vollständigen Kalenderjahre in den Daten");
        }
        setState({ status: "ready", rows, cumulative, likStand: likDataStand(likMonthly) });
      })
      .catch((err) => setState({ status: "error", message: String(err?.message ?? err) }));
  }, []);

  // Dateiname/CSV-Inhalt hängen nur von den Daten ab (AC-T9.4) — das
  // Datum im Dateinamen wird erst beim Klick erzeugt.
  const csv = useMemo(
    () => (state.status === "ready" ? buildCsv(state.rows, state.cumulative) : null),
    [state]
  );

  function downloadCsv() {
    if (csv == null) return;
    // UTF-8-BOM, damit Excel die Datei als UTF-8 (nicht Latin-1) erkennt —
    // zusammen mit dem Semikolon-Trenner (Dezimalkomma de-CH) öffnet die
    // Datei in Excel/LibreOffice ohne verschobene Spalten oder verstümmelte
    // Umlaute.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFileName(new Date());
    link.click();
    URL.revokeObjectURL(url);
  }

  function copyTable() {
    if (state.status !== "ready") return;
    navigator.clipboard
      .writeText(buildTsv(state.rows, state.cumulative))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard-API nicht verfügbar (unsicherer Kontext) — kein harter
        // Fehler, analog zum Muster in KaufkraftRechner.tsx.
      });
  }

  if (state.status === "error") {
    return (
      <div className="tf-chart-error" role="alert">
        Jahresraten-Tabelle: Daten konnten nicht geladen werden ({state.message}).
      </div>
    );
  }
  if (state.status === "loading") {
    return <div className="tf-chart-loading">Lade Jahresraten…</div>;
  }

  const { rows, cumulative, likStand } = state;
  const firstYear = rows[0].year;
  const lastYear = rows[rows.length - 1].year;

  return (
    <section aria-labelledby="jahresraten-tabelle-heading" className="tf-tabelle">
      <h2 id="jahresraten-tabelle-heading" className="text-base font-medium">
        Jahresraten: LIK vs. Trueflation
      </h2>

      {/* Caption-Text (AC-T10.1/T5.3): methodische Rahmung der Tabelle,
          sichtbar statt Tooltip. Kein Bezug zum Kaufkraft-Rechner
          (AC-T10.2) — die Tabelle hängt nicht am eingegebenen Betrag. */}
      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Jahresraten in Prozent (Jahresdurchschnitt gegenüber Jahresdurchschnitt, 2 Nachkommastellen).
        Differenz in Prozentpunkten. Kumuliert = verkettete Entwicklung {cumulative.fromYear}–
        {cumulative.toYear}, gleicher Stichtag wie die Kernzahlen oben. Die Prämienkomponente der
        Trueflation wird jährlich mit den neuen BAG-Werten aktualisiert — das ist Teil der Methodik
        und wird deshalb nicht pro Zeile markiert (siehe{" "}
        <a href="/methodik" className="underline">Methodik</a>).
      </p>

      {/* Scroll-Container: sticky Header beim vertikalen Scrollen (AC-T8.1),
          horizontales Scrollen auf schmalen Viewports statt abgeschnittener
          Spalten (AC-T8.2). */}
      <div className="tf-tabelle-scroll">
        <table>
          <caption>Jahresraten LIK und Trueflation seit {firstYear}</caption>
          <thead>
            <tr>
              <th scope="col">Jahr</th>
              <th scope="col" className="tf-num">LIK (%)</th>
              <th scope="col" className="tf-num">Trueflation (%)</th>
              {/* AC-T3.3: "Differenz (pp)", nicht "(%)". */}
              <th scope="col" className="tf-num">Differenz (pp)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.year}>
                <th scope="row">
                  {row.year}
                  {/* AC-T5.1: einmaliger Methoden-Bruch als Zeilen-Marker,
                      textlich (nicht nur Farbe, AC-T5.4), Klick führt zur
                      Methodik-Stelle (AC-T5.5). */}
                  {row.isRentCorrectionStart && (
                    <span className="tf-tabelle-marker">
                      <a href="/methodik#miet-korrektur">Mietkorrektur ab 2020</a>
                    </span>
                  )}
                  {/* AC-T5.2: letztes Datenjahr mit provisorischem
                      Prämienwert (BAG-Schätzung, wird im Folgejahr ersetzt). */}
                  {row.isProvisional && (
                    <span className="tf-tabelle-marker">
                      <a href="/methodik#praemiendaten-einschraenkungen">provisorisch (Prämienwert)</a>
                    </span>
                  )}
                  {/* Erste Zeile: Trueflation-Vorjahr 2009 existiert
                      strukturell nicht — Erklärung direkt an der Zeile,
                      keine erfundene Zahl (siehe annual-rates.ts). */}
                  {row.isFirstYear && row.trueflationRatePercent == null && (
                    <span className="tf-tabelle-marker">
                      erste Zeile — kein Trueflation-Vorjahreswert
                    </span>
                  )}
                </th>
                <td className="tf-num tf-numeric">{formatRate(row.likRatePercent)}</td>
                <td className="tf-num tf-numeric">{formatRate(row.trueflationRatePercent)}</td>
                {/* Differenz bewusst NICHT eingefärbt (AC-T8.5 erlaubt Farbe,
                    verlangt aber WCAG AA in beiden Modi): das Vorzeichen
                    trägt die Information eindeutig, Kontrast ist über die
                    Standard-Textfarbe in beiden Modi garantiert. */}
                <td className="tf-num tf-numeric">{formatSignedRate(row.differenzPp)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {/* AC-T4.4: Beschriftung "Kumuliert 2010–YYYY", nicht als
                  weiteres Jahr getarnt. */}
              <th scope="row">
                Kumuliert {cumulative.fromYear}–{cumulative.toYear}
              </th>
              <td className="tf-num tf-numeric">{formatSignedRate(cumulative.likCumulativePercent)}</td>
              <td className="tf-num tf-numeric">{formatSignedRate(cumulative.trueflationCumulativePercent)}</td>
              <td className="tf-num tf-numeric">{formatSignedRate(cumulative.differenzPp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* REQ-T9: Export direkt bei der Tabelle (Nachrechenbarkeits-
          Versprechen — einzige Stelle, an der die berechneten Jahresraten
          ohne Abtippen geprüft werden können). */}
      <div className="tf-tabelle-actions" role="group" aria-label="Tabelle exportieren">
        <button onClick={downloadCsv} className="tf-preset-button" aria-label="Tabelle als CSV-Datei herunterladen">
          CSV herunterladen
        </button>
        <button onClick={copyTable} className="tf-preset-button" aria-label="Tabelle in die Zwischenablage kopieren">
          {copied ? "Kopiert ✓" : "Tabelle kopieren"}
        </button>
      </div>

      <div className="tf-tabelle-notes">
        {/* AC-T2.2: warum die Tabelle 2024 endet, obwohl der LIK im Chart
            weiterläuft — inkl. Hinweis auf den nächsten erwarteten
            Datenpunkt (BAG-Publikationsrhythmus). */}
        <p>
          Die Tabelle endet mit {lastYear}, dem letzten abgeschlossenen Trueflation-Jahr: ohne
          Trueflation-Wert wäre die Differenz-Spalte leer. Der LIK läuft im Chart monatlich weiter
          (aktuell bis {likStand}). Der nächste Trueflation-Jahreswert ({lastYear + 1}) folgt, sobald
          das BAG die definitive Prämienstatistik publiziert — die Prämien erscheinen jeweils im
          September des Vorjahres.
        </p>
        {/* AC-T7.4: Quelle und Stand, mit Links. */}
        <p>
          Quelle: BFS LIK / eigene Trueflation-Berechnung, Stand {likStand} (LIK) bzw.
          Kalenderjahr {lastYear} (Trueflation) — Details:{" "}
          <a href="/datenquellen" className="underline">Datenquellen</a> und{" "}
          <a href="/methodik" className="underline">Methodik</a>.
        </p>
      </div>
    </section>
  );
}
