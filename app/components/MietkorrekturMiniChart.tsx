"use client";

/**
 * trueflation.ch — Miet-Korrektur Mini-Chart (Methodik-Seite, Requirements 2.2d)
 *
 * ZWECK (Betreiber-Vorgabe 30.08.2026): Die volle Neubezug-Variante
 * (+0,253 pp/Jahr, siehe Methodik-Text) ist EIN eigenständiger Befund, KEINE
 * Trueflation-Komponente — sie unterstellt implizit "alle wohnen zu
 * Neuvermietungspreisen", was real nicht zutrifft (integriert ist die
 * Bevölkerungsanteil-Variante, +0,0608 pp/Jahr, siehe Hauptchart). Damit
 * diese Unterscheidung strukturell sichtbar bleibt statt in einer Fussnote
 * versteckt zu sein (Option 2 aus Requirements 2.2d, vom Betreiber gewählt):
 * ein KLEINES, EIGENSTÄNDIGES Chart, das NUR den tatsächlich abgedeckten
 * Zeitraum (2020-2024) zeigt — kein Anspruch auf eine durchgehende
 * 15-Jahres-Linie, kein Verwechslungsrisiko mit der Haupt-Trueflation-Linie.
 *
 * Datenquelle: dieselbe Messreihe, die auch die Zahlen im Methodik-Fliesstext
 * speist (data/rent-correction/rent-correction-longtenure-check.json) —
 * nicht separat gepflegt, gleiche Betreiber-Vorgabe wie beim Hauptchart
 * ("Werte aus derselben Quelle beziehen wie die Berechnung").
 *
 * Zwei Linien: "Neubezug-Proxy" (proxyPrice, Marktmieten-Annäherung) vs.
 * "Längste Bezugsdauer" (longestTenurePrice, 21+ Jahre, dient als Vergleichs-
 * gruppe im Methodik-Text) — indexiert auf 2020=100, damit die WACHSTUMS-
 * DIFFERENZ sichtbar wird, nicht die absolute CHF-Differenz (die ohnehin aus
 * unterschiedlicher Wohnungsgrösse/-lage stammt, siehe Methodik-Vorbehalt).
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useEffect, useState } from "react";
import rentCorrectionData from "../../data/rent-correction/rent-correction-longtenure-check.json";
import { getMessages, DEFAULT_LOCALE } from "../i18n";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type ThemeColors = { lineTrueflation: string; lineLik: string; textSecondary: string; border: string };

function readThemeColors(): ThemeColors {
  const fallbacks: ThemeColors = {
    lineTrueflation: "#d1495b",
    lineLik: "#4b5f7a",
    textSecondary: "#4b5563",
    border: "#e2e5e9",
  };
  if (typeof window === "undefined") return fallbacks;
  const cs = getComputedStyle(document.documentElement);
  const get = (token: string, fallback: string) => {
    const v = cs.getPropertyValue(token).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    lineTrueflation: get("--color-line-trueflation", fallbacks.lineTrueflation),
    lineLik: get("--color-line-lik", fallbacks.lineLik),
    textSecondary: get("--color-text-secondary", fallbacks.textSecondary),
    border: get("--color-border", fallbacks.border),
  };
}

/** Analog zum useThemeColors-Hook in LikChart.tsx — dieselbe Live-Reaktion
 * auf Theme-Wechsel (System oder manueller Toggle, US 3.18), damit dieses
 * Mini-Chart nicht falsch/schwarz rendert (dieselbe Fehlerklasse wie K1
 * im Hauptchart, hier von Anfang an vermieden statt nachträglich gefixt). */
function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(readThemeColors);
  useEffect(() => {
    const update = () => setColors(readThemeColors());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class", "style"],
    });
    return () => {
      mq.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return colors;
}

export default function MietkorrekturMiniChart() {
  const colors = useThemeColors();
  // i18n (US 4.x Grundgerüst): Dataset-Labels und Achsentitel aus dem
  // Content-Layer, nicht als Literale im Chart-Code.
  const t = getMessages(DEFAULT_LOCALE);
  const series = rentCorrectionData.series as Array<{
    year: number;
    proxyPrice: number;
    longestTenurePrice: number;
  }>;

  const baseProxy = series[0].proxyPrice;
  const baseLongest = series[0].longestTenurePrice;

  const labels = series.map((s) => String(s.year));
  const proxyIndexed = series.map((s) => (s.proxyPrice / baseProxy) * 100);
  const longestIndexed = series.map((s) => (s.longestTenurePrice / baseLongest) * 100);

  return (
    <div className="mt-4">
      <p className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
        Nur der abgedeckte Zeitraum (2020–2024), indexiert auf 2020 = 100 — kein Anspruch auf eine
        durchgehende 15-Jahres-Linie. Zeigt die volle Neubezug-Variante (+0,253&nbsp;pp/Jahr), nicht die
        im Hauptchart integrierte Bevölkerungsanteil-Variante.
      </p>
      <div style={{ height: 220, width: "100%" }} data-testid="mietkorrektur-mini-chart">
        <Line
          data={{
            labels,
            datasets: [
              {
                label: t.mietkorrekturMini.datasets.proxy,
                data: proxyIndexed,
                borderColor: colors.lineTrueflation,
                backgroundColor: "transparent",
                borderWidth: 2,
                pointRadius: 3,
                tension: 0,
              },
              {
                label: t.mietkorrekturMini.datasets.longestTenure,
                data: longestIndexed,
                borderColor: colors.lineLik,
                backgroundColor: "transparent",
                borderWidth: 2,
                borderDash: [6, 3],
                pointRadius: 3,
                tension: 0,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
              x: { grid: { display: false }, ticks: { color: colors.textSecondary } },
              y: {
                title: { display: true, text: t.mietkorrekturMini.yAxisTitle, color: colors.textSecondary },
                grid: { color: colors.border },
                ticks: { color: colors.textSecondary },
              },
            },
            plugins: {
              legend: { display: true, position: "top" as const, labels: { color: colors.textSecondary } },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.label}: ${(ctx.parsed.y as number).toFixed(2)}`,
                },
              },
            },
          }}
        />
      </div>
    </div>
  );
}
