"use client";

/**
 * trueflation.ch — Chart: Linie 1 (LIK) + Linie 2 (Trueflation)
 *
 * Linie 1 aus der "Ewigen Reihe" (data/lik/total-index-monthly.json),
 * Linie 2 aus der monatlichen Trueflation-Berechnung
 * (data/trueflation/trueflation-index-monthly.json, US 2.1-2.4). Beide
 * Reihen sind jetzt monatlich aufgelöst (Betreiber-Entscheid 26.08.2026,
 * Frequenz-Angleichung) — ein direkter visueller Vergleich ist damit
 * sinnvoll, anders als bei einer 15-Punkte-Jahresreihe neben einer
 * ~1340-Punkte-Monatsreihe.
 *
 * Trueflation existiert strukturell erst ab 2010 (US 2.5, US 3.16 Zustand 4:
 * "strukturell nicht existent", kein Fehler) — vor 2010 wird nur Linie 1
 * gezeigt, keine Interpolation, kein stiller Fallback.
 *
 * Zoom via chartjs-plugin-zoom, Zeitraum-Presets gemäss US 3.4, Default-
 * Darstellung: indexierte Niveaus (Requirements 2.0).
 */



import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import "chartjs-adapter-date-fns";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  zoomPlugin
);

type LikDataPoint = {
  indexDate: number; // YYYYMMDD
  indexValue: number;
  changeRateVorjahresmonat: number | null;
  changeRateVormonat: number | null;
};

type LikMonthlyFile = {
  basis: string;
  sourceUrl: string;
  sourcePublishDate: number;
  values: LikDataPoint[];
};

type TrueflationDataPoint = {
  month: number; // YYYYMM01
  trueflationIndex: number;
  likIndex: number;
  dataStatus: "anchor" | "aktuell";
  transitionNote: string | null;
};

type TrueflationMonthlyFile = {
  scope: string;
  granularity: string;
  startMonth: number;
  values: TrueflationDataPoint[];
};

// Zeitraum-Presets gemäss US 3.4 AC — Default "Seit 2010" (Monatsbereich, US 3.15)
const PRESETS = [
  { key: "since-2010", label: "Seit 2010", startYear: 2010 },
  { key: "since-1975", label: "Seit 1975", startYear: 1975 },
  { key: "max", label: "Maximum ab 1914", startYear: 1914 },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];

function parseIndexDate(indexDate: number): Date {
  const s = String(indexDate);
  const year = parseInt(s.slice(0, 4), 10);
  const month = parseInt(s.slice(4, 6), 10) - 1;
  const day = parseInt(s.slice(6, 8), 10);
  return new Date(year, month, day);
}

export default function LikChart() {
  const [data, setData] = useState<LikMonthlyFile | null>(null);
  const [trueflationData, setTrueflationData] = useState<TrueflationMonthlyFile | null>(null);
  const [trueflationError, setTrueflationError] = useState<string | null>(null);
  const [preset, setPreset] = useState<PresetKey>("since-2010");
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<ChartJS<"line"> | null>(null);

  useEffect(() => {
    fetch("/data/lik/total-index-monthly.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message));

    // Trueflation-Ausfall darf die LIK-Linie nicht blockieren (US 3.16
    // Zustand 3: Ausfall wird separat kommuniziert, Kernlinie bleibt stehen).
    fetch("/data/trueflation/trueflation-index-monthly.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setTrueflationData)
      .catch((err) => setTrueflationError(err.message));
  }, []);

  const filteredValues = useMemo(() => {
    if (!data) return [];
    const activePreset = PRESETS.find((p) => p.key === preset)!;
    return data.values.filter((v) => {
      const year = Math.floor(v.indexDate / 10000);
      return year >= activePreset.startYear;
    });
  }, [data, preset]);

  const filteredTrueflationValues = useMemo(() => {
    if (!trueflationData) return [];
    const activePreset = PRESETS.find((p) => p.key === preset)!;
    // Trueflation existiert strukturell erst ab startMonth (2010) — kein
    // Interpolieren vor diesem Punkt, die Reihe selbst enthält schlicht keine
    // früheren Werte (US 3.16 Zustand 4, US 2.5).
    return trueflationData.values.filter((v) => {
      const year = Math.floor(v.month / 10000);
      return year >= activePreset.startYear;
    });
  }, [trueflationData, preset]);

  const trueflationExistsInRange = filteredTrueflationValues.length > 0;

  const chartData: ChartData<"line"> = useMemo(
    () => ({
      datasets: [
        {
          label: "Offizielle Inflation (LIK)",
          data: filteredValues.map((v) => ({
            x: parseIndexDate(v.indexDate).getTime(),
            y: v.indexValue,
          })),
          borderColor: "var(--color-line-lik, #4b5f7a)",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0,
        },
        ...(trueflationExistsInRange
          ? [
              {
                label: "Trueflation (LIK + Prämienkorrektur)",
                data: filteredTrueflationValues.map((v) => ({
                  x: parseIndexDate(v.month).getTime(),
                  y: v.trueflationIndex,
                })),
                borderColor: "var(--color-line-trueflation, #c1440e)",
                backgroundColor: "transparent",
                borderWidth: 2,
                borderDash: [6, 3], // zusätzlich zur Farbe unterscheidbar (US 3.11, Farbfehlsichtigkeit)
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0,
              },
            ]
          : []),
      ],
    }),
    [filteredValues, filteredTrueflationValues, trueflationExistsInRange]
  );

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        x: {
          type: "time",
          time: { unit: preset === "max" || preset === "since-1975" ? "year" : "year" },
          grid: { display: false },
          title: { display: false },
        },
        y: {
          title: { display: true, text: "Index (indexierte Niveaus)" },
          grid: { color: "var(--color-border, #e2e5e9)" },
        },
      },
      plugins: {
        legend: { display: true, position: "top" as const },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y ?? null;
              if (v === null) return "";
              if (ctx.dataset.label?.startsWith("Trueflation")) {
                const point = filteredTrueflationValues[ctx.dataIndex];
                const base = `Trueflation: ${v.toFixed(1)} (LIK + Prämienkorrektur, Untergrenze — siehe Methodik)`;
                return point?.transitionNote ? [base, point.transitionNote] : base;
              }
              return `LIK: ${v.toFixed(1)} (Quelle: BFS, Basis: Ewige Reihe)`;
            },
          },
        },
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: "x" as const,
          },
          pan: { enabled: true, mode: "x" as const },
        },
      },
    }),
    [preset, filteredTrueflationValues]
  );

  const resetZoom = () => {
    chartRef.current?.resetZoom();
  };

  if (error) {
    return (
      <div className="tf-chart-error" role="alert">
        Daten konnten nicht geladen werden: {error}
      </div>
    );
  }

  if (!data) {
    return <div className="tf-chart-loading">Lade Daten…</div>;
  }

  const lastPoint = data.values[data.values.length - 1];
  const publishDateStr = String(data.sourcePublishDate);
  const publishDateFormatted = `${publishDateStr.slice(6, 8)}.${publishDateStr.slice(4, 6)}.${publishDateStr.slice(0, 4)}`;

  return (
    <div className="tf-chart-container">
      <div className="tf-chart-toolbar" role="group" aria-label="Zeitraum wählen">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            aria-pressed={preset === p.key}
            className={`tf-preset-button${preset === p.key ? " tf-preset-button--active" : ""}`}
          >
            {p.label}
          </button>
        ))}
        <button onClick={resetZoom} className="tf-preset-button" aria-label="Zoom zurücksetzen">
          Zoom zurücksetzen
        </button>
      </div>

      <div className="tf-chart-canvas-wrapper">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>

      <div className="tf-chart-status">
        <span className="tf-numeric">
          Stand: {lastPoint.indexValue.toFixed(1)} ({String(lastPoint.indexDate).slice(0, 4)}-
          {String(lastPoint.indexDate).slice(4, 6)})
        </span>
        {" · "}
        <span>Quelle: BFS LIK, publiziert {publishDateFormatted}</span>
      </div>

      {/* US 3.16: Ausfall (Zustand 3) und strukturelle Nicht-Existenz
          (Zustand 4) sind unterschiedliche Sachverhalte und werden getrennt
          kommuniziert — nie stillschweigend dieselbe leere Fläche. */}
      {trueflationError && (
        <div className="tf-chart-status" role="status">
          <span>Trueflation-Daten derzeit nicht verfügbar (Ausfall) — LIK-Linie bleibt unberührt.</span>
        </div>
      )}
      {!trueflationError && trueflationData && !trueflationExistsInRange && (
        <div className="tf-chart-status" role="status">
          <span>Trueflation existiert im gewählten Zeitraum nicht — die Reihe beginnt{" "}
            {Math.floor(trueflationData.startMonth / 10000)} (keine früheren Daten, keine Interpolation).</span>
        </div>
      )}
      {trueflationExistsInRange && (
        <div className="tf-chart-status">
          <span>Trueflation = LIK + Prämienkorrektur, dokumentierte Untergrenze (fixer Warenkorb und
            Mietkorrektur zurückgestellt) — Details siehe{" "}
            <a href="/methodik" className="underline">Methodik</a>.</span>
        </div>
      )}
    </div>
  );
}
