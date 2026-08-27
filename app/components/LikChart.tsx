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

type M2DataPoint = {
  date: string; // "YYYY-MM"
  d0: string;
  d1: string;
  value: number; // absoluter CHF-Wert (Mio.), NICHT direkt darstellbar (Requirements 2.3: nie Absolutwert)
};

type M2MonthlyFile = {
  unit: string;
  aggregate: string;
  values: M2DataPoint[];
};

// Zeitraum-Presets gemäss US 3.4 AC — Default "Seit 2010" (Monatsbereich, US 3.15).
// "Seit 2010" deckt LIK+Trueflation+M2 vollständig ab (M2-Realdaten beginnen
// 12/1984, also lange vor 2010) — explizit geprüft (Betreiber-Anforderung
// 26.08.2026): keine der drei Kernlinien fehlt im Default-Preset.
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

// F7-Fix (Code-Review 26.08.2026): generische Filterfunktion statt drei
// fast identischer useMemo-Blöcke mit dreifach dupliziertem
// PRESETS.find(...)-Lookup. getYear extrahiert das Jahr aus dem jeweiligen
// Datumsformat der Quelle (LIK: indexDate YYYYMMDD, Trueflation: month
// YYYYMM01, beide per Division/Floor — nur die Quelle unterscheidet sich).
function filterByPreset<T>(values: T[], presetKey: PresetKey, getYear: (v: T) => number): T[] {
  const activePreset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0];
  return values.filter((v) => getYear(v) >= activePreset.startYear);
}

export default function LikChart() {
  const [data, setData] = useState<LikMonthlyFile | null>(null);
  const [trueflationData, setTrueflationData] = useState<TrueflationMonthlyFile | null>(null);
  const [trueflationError, setTrueflationError] = useState<string | null>(null);
  const [m2Data, setM2Data] = useState<M2MonthlyFile | null>(null);
  const [m2Error, setM2Error] = useState<string | null>(null);
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

    // M2-Ausfall blockiert ebenfalls weder LIK noch Trueflation (US 3.16
    // Zustand 3, Overlay-Ausfall bleibt unauffällig gegenüber Kernlinien-Ausfall).
    fetch("/data/snb-m2/m2-monthly.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setM2Data)
      .catch((err) => setM2Error(err.message));
  }, []);

  const filteredValues = useMemo(() => {
    if (!data) return [];
    return filterByPreset(data.values, preset, (v) => Math.floor(v.indexDate / 10000));
  }, [data, preset]);

  const filteredTrueflationValues = useMemo(() => {
    if (!trueflationData) return [];
    // Trueflation existiert strukturell erst ab startMonth (2010) — kein
    // Interpolieren vor diesem Punkt, die Reihe selbst enthält schlicht keine
    // früheren Werte (US 3.16 Zustand 4, US 2.5).
    return filterByPreset(trueflationData.values, preset, (v) => Math.floor(v.month / 10000));
  }, [trueflationData, preset]);

  const trueflationExistsInRange = filteredTrueflationValues.length > 0;

  // US 3.16 Zustand 5 (26.08.2026 ergänzt): Trueflation endet dort, wo die
  // amtlichen BAG-Prämiendaten enden — das ist ein FRÜHERES Ende, nicht ein
  // späterer Start (Zustand 4). Ermittelt durch Vergleich des letzten
  // Trueflation-Monats mit dem letzten LIK-Monat IM SELBEN gefilterten
  // Zeitraum — nicht global, damit z.B. "Seit 1975" oder "Maximum" (die
  // beide vor 2010 enden können, falls kein Overlap) nicht fälschlich einen
  // Hinweis zeigen, wo Trueflation ohnehin nicht sichtbar ist.
  const trueflationEndsEarlierThanLik = useMemo(() => {
    if (!trueflationExistsInRange || filteredValues.length === 0) return false;
    const lastTrueflationMonth = filteredTrueflationValues[filteredTrueflationValues.length - 1].month;
    const lastLikDate = filteredValues[filteredValues.length - 1].indexDate;
    // Beide auf YYYYMM vergleichen (Trueflation nutzt YYYYMM01, LIK YYYYMMDD).
    const lastTrueflationYm = Math.floor(lastTrueflationMonth / 100);
    const lastLikYm = Math.floor(lastLikDate / 100);
    return lastTrueflationYm < lastLikYm;
  }, [trueflationExistsInRange, filteredValues, filteredTrueflationValues]);

  const trueflationLastMonthLabel = useMemo(() => {
    if (filteredTrueflationValues.length === 0) return null;
    const lastMonth = filteredTrueflationValues[filteredTrueflationValues.length - 1].month;
    const year = Math.floor(lastMonth / 10000);
    const month = Math.floor((lastMonth % 10000) / 100);
    return `${String(month).padStart(2, "0")}/${year}`;
  }, [filteredTrueflationValues]);

  // M2 liegt als Absolutwert (CHF, Mio.) vor. Requirements 2.3: "Nie Absolutwert
  // in CHF" — muss auf indexierte Niveaus umgerechnet werden, Basis = 100 am
  // Start des jeweils gefilterten Zeitraums (konsistent mit 2.0: später
  // startende Linien docken an, hier ist M2 selbst die Basis ihres eigenen
  // Fensters, da sie kein Andock-Ziel wie Trueflation/LIK hat).
  const filteredM2Values = useMemo(() => {
    if (!m2Data) return [];
    // F3-Fix (Code-Review 26.08.2026): v.date auf gültiges "YYYY-MM"-Format
    // prüfen, BEVOR darauf zugegriffen wird — ein API-Schema-Drift bei SNB
    // (fehlendes/verschobenes Feld) würde sonst eine ungefangene TypeError
    // werfen und den gesamten Chart abstürzen lassen, statt wie bei den
    // Fetch-Fehlern (trueflationError/m2Error) graceful zu degradieren.
    const validPoints = m2Data.values.filter(
      (v) => typeof v.date === "string" && /^\d{4}-\d{2}$/.test(v.date) && typeof v.value === "number" && Number.isFinite(v.value)
    );
    const filtered = filterByPreset(validPoints, preset, (v) => parseInt(v.date.slice(0, 4), 10));
    if (filtered.length === 0) return [];
    const base = filtered[0].value;
    // F2-Fix (Code-Review 26.08.2026): base=0 (korruptes SNB-Feld) würde
    // sonst NaN/Infinity in die gesamte Reihe fortpflanzen, ohne Fehlermeldung.
    if (base === 0) return [];
    return filtered.map((v) => ({ date: v.date, indexValue: (v.value / base) * 100 }));
  }, [m2Data, preset]);

  const m2ExistsInRange = filteredM2Values.length > 0;

  function parseYearMonth(ym: string): Date {
    // F3-Fix: filteredM2Values enthält nach obigem Filter nur noch valide
    // "YYYY-MM"-Strings, split() ist hier sicher. Defensive Absicherung
    // trotzdem, falls diese Funktion je unabhängig wiederverwendet wird.
    const parts = ym.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1] ?? "1", 10);
    return new Date(year, month - 1, 1);
  }

  // F4-Klarstellung (Code-Review 26.08.2026): Mit den aktuellen PRESETS
  // (startYear jeweils <= 2010) ist "Trueflation existiert im gewählten
  // Zeitraum nicht" (Zustand 4) ueber die UI praktisch nicht erreichbar, da
  // jedes Preset Trueflation-Daten (ab 2010) mit einschliesst. Der Zustand
  // bleibt im Code korrekt fuer den Fall eines KOMPLETTEN Datenausfalls
  // (leeres Backend-JSON) oder eine kuenftige Preset-Erweiterung mit
  // startYear > aktuellstem Trueflation-Jahr — aktuell zeigt sich Zustand 4
  // NICHT ueber normale Preset-Interaktion, das ist erwartetes Verhalten,
  // kein Bug. Dokumentiert statt stillschweigend belassen.

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
                // US 3.16 Zustand 5: letzter Punkt sichtbar markiert (statt
                // unsichtbar pointRadius:0), damit ein früheres Linienende
                // NICHT wie ein abgeschnittener Fehler aussieht, sondern als
                // bewusst markierter Endpunkt erkennbar ist.
                pointRadius: (ctx: { dataIndex: number }) =>
                  trueflationEndsEarlierThanLik && ctx.dataIndex === filteredTrueflationValues.length - 1 ? 5 : 0,
                pointBackgroundColor: "var(--color-line-trueflation, #c1440e)",
                pointHoverRadius: 5,
                tension: 0,
              },
            ]
          : []),
        ...(m2ExistsInRange
          ? [
              {
                label: "Geldmengenausweitung (M2)",
                data: filteredM2Values.map((v) => ({
                  x: parseYearMonth(v.date).getTime(),
                  y: v.indexValue,
                })),
                borderColor: "var(--color-line-m2, #4a7c59)",
                backgroundColor: "transparent",
                borderWidth: 2,
                borderDash: [2, 3], // drittes, von LIK (durchgezogen) und Trueflation (6,3) unterscheidbares Muster (US 3.11)
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0,
              },
            ]
          : []),
      ],
    }),
    [filteredValues, filteredTrueflationValues, trueflationExistsInRange, filteredM2Values, m2ExistsInRange, trueflationEndsEarlierThanLik]
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
          // F1-Fix (Code-Review 26.08.2026): der ursprüngliche Ternary war ein
          // No-Op (beide Zweige lieferten "year") — totes Code-Fragment eines
          // unvollständigen Fixes. "Seit 2010" (15 Jahre, ~180 Monatspunkte)
          // profitiert von einer feineren Monats-Achse (US 3.15: Monatsbereich
          // bei kurzem Zeitraum), "Seit 1975"/"Maximum" bleiben bei Jahren.
          time: { unit: preset === "since-2010" ? "month" : "year" },
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
              if (ctx.dataset.label?.startsWith("Geldmenge")) {
                // US 3.7: zentraler Denkfehler direkt am Chart abfangen, nicht
                // nur auf der Methodik-Seite, die kaum jemand liest.
                return [
                  `Geldmenge M2: ${v.toFixed(1)} (indexiert, Quelle: SNB)`,
                  "Misst Verwässerung der Geldmenge, NICHT Preisentwicklung — keine direkte Vergleichsgrösse zu LIK/Trueflation.",
                ];
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
      {/* US 3.16 Zustand 5: früheres Ende ist Datenrealität (amtliche
          Prämiendaten enden dort), kein Fehler — sprachlich klar von einem
          Ausfall (Zustand 3) unterschieden, KEINE Fortschreibung/Extrapolation. */}
      {trueflationEndsEarlierThanLik && trueflationLastMonthLabel && (
        <div className="tf-chart-status" role="status">
          <span>Trueflation-Linie endet {trueflationLastMonthLabel} (markierter Punkt) — amtliche
            Prämiendaten (BAG) sind bis dahin verfügbar, der LIK läuft monatlich weiter. Kein Fehler,
            keine Fortschreibung nach diesem Punkt.</span>
        </div>
      )}
      {m2Error && (
        <div className="tf-chart-status" role="status">
          <span>Geldmengen-Daten (M2) derzeit nicht verfügbar — LIK- und Trueflation-Linien bleiben unberührt.</span>
        </div>
      )}
      {m2ExistsInRange && (
        <div className="tf-chart-status tf-chart-status--info" role="note">
          <span>⚠️ Geldmenge (M2) misst die <strong>Verwässerung der Geldmenge</strong>, nicht die
            Preisentwicklung — keine direkte Vergleichsgrösse zu den beiden Inflationslinien
            (Details siehe <a href="/methodik" className="underline">Methodik</a>).</span>
        </div>
      )}
    </div>
  );
}
