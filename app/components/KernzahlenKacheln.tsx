"use client";

/**
 * trueflation.ch — Kernzahlen-Kacheln (US 3.1, ergänzt 05.09.2026 im
 * Zuge der Jahresraten-Tabelle, REQ-T4/AC-T4.1).
 *
 * Zeigt die zwei Kopfzahlen der Startseite: kumulierte Teuerung
 * 2010–letztes abgeschlossenes Trueflation-Jahr, einmal nach amtlichem
 * LIK, einmal nach Trueflation — beide aus derselben Datenquelle und mit
 * derselben zentralen Rundung (app/lib/annual-rates.ts) wie die
 * Fusszeile der Jahresraten-Tabelle. AC-T4.2 (Kachel = Fusszeile nach
 * derselben Rundungsregel) ist damit per Konstruktion erfüllt, nicht
 * nur per Konvention — beide rendern formatSignedRate(computeCumulative(...)).
 */

import { useEffect, useState } from "react";
import {
  computeCumulative,
  formatSignedRate,
  type CumulativeResult,
  type TrueflationYearlyFile,
} from "../lib/annual-rates";

export default function KernzahlenKacheln() {
  const [cumulative, setCumulative] = useState<CumulativeResult | null>(null);

  useEffect(() => {
    fetch("/data/trueflation/trueflation-index-yearly.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TrueflationYearlyFile>;
      })
      .then((yearly) => setCumulative(computeCumulative(yearly)))
      .catch(() => setCumulative(null)); // Ausfall: Kacheln sind Kerninfo, aber kein Blocker — Seite bleibt nutzbar
  }, []);

  if (cumulative == null) return null;

  return (
    <div className="tf-hero-tiles" role="group" aria-label={`Kumulierte Teuerung ${cumulative.fromYear} bis ${cumulative.toYear}`}>
      <div className="tf-hero-tile">
        <div className="tf-hero-tile-value tf-numeric" style={{ color: "var(--color-line-lik)" }}>
          {formatSignedRate(cumulative.likCumulativePercent)}&nbsp;%
        </div>
        <div className="tf-hero-tile-label">
          Offizielle Inflation (LIK), kumuliert {cumulative.fromYear}–{cumulative.toYear}
        </div>
      </div>
      <div className="tf-hero-tile">
        <div className="tf-hero-tile-value tf-numeric" style={{ color: "var(--color-line-trueflation)" }}>
          {formatSignedRate(cumulative.trueflationCumulativePercent)}&nbsp;%
        </div>
        <div className="tf-hero-tile-label">
          Trueflation, kumuliert {cumulative.fromYear}–{cumulative.toYear} (gleicher Stichtag)
        </div>
      </div>
    </div>
  );
}
