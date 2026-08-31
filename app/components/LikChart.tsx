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



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getMessages, DEFAULT_LOCALE, type Messages } from "../i18n";

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

// ═══ K1-FIX (Frontend-Review 30.08.2026, KRITISCH): Chart.js-Datasets geben
// ihre Farben an die Canvas-2D-API — das sind reine JavaScript-Strings, KEINE
// CSS-Eigenschaften. Ein String wie "var(--color-line-lik, #4b5f7a)" wird von
// Canvas NICHT aufgelöst: die Zuweisung an strokeStyle/fillStyle mit einem
// ungültigen Farbstring wird stillschweigend ignoriert, es bleibt der
// vorherige/Default-Wert (faktisch Schwarz) — im Dark Mode zusätzlich falsch,
// weil die Fallback-Hexwerte die LIGHT-Mode-Varianten waren. JavaScript MUSS
// die aktuell berechneten Token-Werte via getComputedStyle auslesen und als
// echte Hex/RGB-Strings an Chart.js übergeben.
//
// Live-Wechsel: matchMedia-Listener (System-Präferenz) + MutationObserver auf
// documentElement-Attribute (manuelle Theme-Umschaltung via data-theme,
// US 3.18) — bei jedem Wechsel werden die Farben neu gelesen und der Chart
// rendert über die useMemo-Dependencies (K2-Fix) neu.
type ThemeColors = {
  lineLik: string;
  lineTrueflation: string;
  lineMoney: string;
  lineRate: string;
  overlayGold: string;
  overlayBtc: string;
  border: string;
  textSecondary: string;
};

function readThemeColors(): ThemeColors {
  // SSR/First-Paint-Fallback: Light-Mode-Tokenwerte aus tokens.css.
  const fallbacks: ThemeColors = {
    lineLik: "#4b5f7a",
    lineTrueflation: "#d1495b",
    lineMoney: "#2f9e6f",
    lineRate: "#b08900",
    overlayGold: "#b8860b",
    overlayBtc: "#c26a00",
    border: "#e2e5e9",
    textSecondary: "#4b5563",
  };
  if (typeof window === "undefined" || typeof document === "undefined") return fallbacks;
  const cs = getComputedStyle(document.documentElement);
  const get = (token: string, fallback: string): string => {
    const v = cs.getPropertyValue(token).trim();
    return v.length > 0 ? v : fallback;
  };
  // W1-Fix: Token-Namen exakt wie in tokens.css definiert (--color-line-money,
  // NICHT --color-line-m2; --color-overlay-gold/-btc, NICHT
  // --color-line-overlay-*) — ein falscher Name würde hier still auf den
  // Fallback zurückfallen und Chart/Rechner-Farbinkonsistenz erzeugen.
  return {
    lineLik: get("--color-line-lik", fallbacks.lineLik),
    lineTrueflation: get("--color-line-trueflation", fallbacks.lineTrueflation),
    lineMoney: get("--color-line-money", fallbacks.lineMoney),
    lineRate: get("--color-line-rate", fallbacks.lineRate),
    overlayGold: get("--color-overlay-gold", fallbacks.overlayGold),
    overlayBtc: get("--color-overlay-btc", fallbacks.overlayBtc),
    border: get("--color-border", fallbacks.border),
    // W4-Fix (Barrierefreiheit-Nachprüfung 30.08.2026): Chart.js-Achsenticks/
    // Legende/Titel nutzten den Library-Default #666666 — im Dark Mode nur
    // 3.3:1 Kontrast auf --color-bg #0d1117 (unter WCAG-AA 4.5:1 für
    // Normaltext). Jetzt Theme-Token: #4b5563 (7.6:1 hell) / #a8b0bb
    // (8.2:1 dunkel).
    textSecondary: get("--color-text-secondary", fallbacks.textSecondary),
  };
}

function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(readThemeColors);
  useEffect(() => {
    const update = () => setColors(readThemeColors());
    update(); // SSR-Hydration: Fallbacks durch echte Werte ersetzen
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    // Manuelle Umschaltung (US 3.18, data-theme-Attribut) — tokens.css
    // definiert [data-theme]-Overrides, die NICHT über prefers-color-scheme
    // feuern, deshalb zusätzlich Attribute beobachten.
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
  rentCorrectionApplied?: boolean;
  rentCorrectionNote?: string | null;
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

// Leitzins (US 3.5) — eigene Sekundaerachse, IMMER Prozentwert, unabhaengig
// vom Niveau/Rate-Umschalter (US 3.4 AC: "Umschalter Darstellungsart" gilt
// fuer die indexierten Linien, der Leitzins ist bereits eine Rate und hat
// keine sinnvolle "Niveau"-Variante). Zwei Quelldateien zusammengefuehrt,
// LUECKENLOS ANEINANDER ANSCHLIESSEND, verifiziert gegen die Rohdaten
// (Code-Review-Fix 29.08.2026 — der urspruengliche Kommentar sprach
// ungenau von "aktuell ab Juni 2019" und suggerierte damit einen Overlap
// mit der historischen Reihe bis Mai 2019; real gibt es KEINEN Overlap:
// historisch endet exakt 2019-05, aktuell beginnt exakt 2019-06-13):
// historisch (UG0, monatlich, 2000-01 bis 2019-05, Libor-Zielband-
// Untergrenze als Proxy) + aktuell (LZ, taeglich, ab 2019-06-13,
// tatsaechlicher Leitzins). Defensive Dedup-Logik unten (filteredLeitzinsValues)
// schuetzt zusaetzlich vor einem kuenftigen Overlap, falls sich die
// Datengrundlage aendert — nicht nur gegen den aktuellen Datenstand verlassen.
type LeitzinsPoint = { date: string; value: number };
type LeitzinsFile = { values: LeitzinsPoint[] };

// ═══ GENERISCHES OVERLAY-MODUL (Requirements 2.5, Betreiber-Direktive
// 28.08.2026: "so bauen, dass eine weitere Trueflation-Variante später ohne
// Umbau eingehängt werden kann") ═══
//
// Statt Gold/BTC (und künftig z.B. ein Miet-korrigiertes Trueflation-
// Overlay, siehe Requirements 2.2d Miet-Entscheid) fest zu verdrahten,
// beschreibt OVERLAY_CONFIGS jede Overlay-Linie generisch: woher die Daten
// kommen, wie sie geparst/indexiert werden, Kategorisierung und Darstellung.
// Ein neues Overlay (Markt-Referenz ODER künftig eine Trueflation-Variante)
// braucht nur einen neuen Eintrag hier — KEINE Änderung an der Render-Logik.
type OverlayCategory = "wertaufbewahrung" | "trueflation-variante";

type OverlayRawPoint = { date: string; close: number };

type OverlayConfig = {
  key: string;
  /** i18n (US 4.x): KEIN Label-String mehr in der Config — der sichtbare
   * Text kommt aus dem Content-Layer (messages.chart.overlays.labels[messageKey]),
   * ebenso der Tooltip (messages.chart.overlays.tooltips[messageKey]). */
  messageKey: "btc" | "gold";
  fetchUrl: string;
  /** K1/W1-Fix: KEIN Farbstring mehr in der Config (Canvas kann keine
   * var(--...)-Strings auflösen). Stattdessen Schlüssel in die vom
   * useThemeColors-Hook live gelesenen Theme-Farben — der tatsächliche
   * Hex-Wert wird beim Dataset-Aufbau aus colors[colorKey] geholt. */
  colorKey: "overlayGold" | "overlayBtc";
  dash: number[];
  category: OverlayCategory;
  /** Extrahiert {date, close}-Paare aus der rohen JSON-Antwort — die einzige
   * Stelle, die pro Overlay unterschiedlich sein darf (unterschiedliche
   * Quellschemas: Twelve-Data-values[], abgeleitete goldChf-Reihe, künftig
   * evtl. eine Trueflation-Variante mit eigenem Schema). */
  extractPoints: (raw: unknown) => OverlayRawPoint[];
};

const OVERLAY_CONFIGS: OverlayConfig[] = [
  {
    key: "btc-chf",
    messageKey: "btc",
    fetchUrl: "/data/overlays/btc-chf-daily.json",
    colorKey: "overlayBtc",
    dash: [1, 3],
    category: "wertaufbewahrung",
    extractPoints: (raw) => {
      const file = raw as { values?: Array<{ date: string; close: number }> };
      return (file.values ?? []).map((v) => ({ date: v.date, close: v.close }));
    },
  },
  {
    key: "gold-chf",
    messageKey: "gold",
    fetchUrl: "/data/overlays/gold-chf-daily-derived.json",
    colorKey: "overlayGold",
    dash: [4, 2],
    category: "wertaufbewahrung",
    extractPoints: (raw) => {
      const file = raw as { values?: Array<{ date: string; goldChf: number }> };
      return (file.values ?? []).map((v) => ({ date: v.date, close: v.goldChf }));
    },
  },
  // SMI ABSICHTLICH NICHT HIER (Betreiber-Entscheidung 28.08.2026): auf dem
  // Twelve-Data-Free-Tier nicht verfügbar, aus v1 gestrichen, siehe
  // config/sources.json -> overlayModuleNotes.smiStricken. v2-Kandidat.
];

// Zeitraum-Presets gemäss US 3.4 AC — Default "Seit 2010" (Monatsbereich, US 3.15).
// "Seit 2010" deckt LIK+Trueflation+M2 vollständig ab (M2-Realdaten beginnen
// 12/1984, also lange vor 2010) — explizit geprüft (Betreiber-Anforderung
// 26.08.2026): keine der drei Kernlinien fehlt im Default-Preset.
// i18n (US 4.x): sichtbare Labels kommen aus dem Content-Layer
// (messages.chart.presets[key]), hier steht nur noch die Zeitlogik.
const PRESETS = [
  { key: "since-2010", startYear: 2010 },
  { key: "since-1975", startYear: 1975 },
  { key: "max", startYear: 1914 },
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
  // i18n (US 4.x Grundgerüst): alle sichtbaren Chart-Beschriftungen aus dem
  // Content-Layer. v1 statisch Deutsch (DEFAULT_LOCALE); v2 macht die Locale
  // dynamisch (z.B. aus der Route), OHNE diese Komponente anzufassen.
  const t: Messages = getMessages(DEFAULT_LOCALE);
  const [data, setData] = useState<LikMonthlyFile | null>(null);
  const [trueflationData, setTrueflationData] = useState<TrueflationMonthlyFile | null>(null);
  const [trueflationError, setTrueflationError] = useState<string | null>(null);
  const [m2Data, setM2Data] = useState<M2MonthlyFile | null>(null);
  const [m2Error, setM2Error] = useState<string | null>(null);
  const [overlayData, setOverlayData] = useState<Record<string, OverlayRawPoint[] | undefined>>({});
  const [overlayErrors, setOverlayErrors] = useState<Record<string, string | undefined>>({});
  const [overlaysEnabled, setOverlaysEnabled] = useState<Record<string, boolean>>({});
  const [preset, setPreset] = useState<PresetKey>("since-2010");
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<ChartJS<"line"> | null>(null);
  // US 3.4 AC: Umschalter Darstellungsart zwischen indexierten Niveaus
  // (Default) und Jahreswachstumsraten.
  const [displayMode, setDisplayMode] = useState<"niveau" | "rate">("niveau");
  const [leitzinsHistorical, setLeitzinsHistorical] = useState<LeitzinsFile | null>(null);
  const [leitzinsCurrent, setLeitzinsCurrent] = useState<LeitzinsFile | null>(null);
  const [leitzinsEnabled, setLeitzinsEnabled] = useState(false);
  const [leitzinsError, setLeitzinsError] = useState<string | null>(null);
  // K1-Fix: live aufgelöste Theme-Farben (echte Hex-Werte, KEINE
  // var(--...)-Strings) für ALLE Chart.js-Dataset-/Grid-Farbdefinitionen.
  const colors = useThemeColors();

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

  // Leitzins (US 3.5): lazy load erst bei Aktivierung, analog zu den
  // Overlay-Checkboxen (Security-Review-Fix 28.08.2026, siehe unten) —
  // unnoetiger Traffic bei jedem Seitenaufruf, falls niemand den Leitzins
  // je einschaltet.
  useEffect(() => {
    if (!leitzinsEnabled || leitzinsHistorical || leitzinsCurrent || leitzinsError) return;
    Promise.all([
      fetch("/data/snb-leitzins/leitzins-historical.json").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/data/snb-leitzins/leitzins-current.json").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([hist, cur]) => {
        setLeitzinsHistorical(hist);
        setLeitzinsCurrent(cur);
      })
      .catch((err) => setLeitzinsError(err.message));
  }, [leitzinsEnabled, leitzinsHistorical, leitzinsCurrent, leitzinsError]);

  // SECURITY/EFFIZIENZ-FIX (Security-Review Durchgang 2/3, 28.08.2026,
  // Finding F2-2 — LOW): Overlays wurden bisher IMMER beim Mount geladen,
  // auch wenn keine Checkbox aktiviert war (opt-in galt nur fürs Rendering,
  // nicht fürs Laden) — unnötige Bandbreite bei jedem Seitenaufruf, auch
  // wenn niemand ein Overlay je einschaltet. Fix: LAZY LOAD — ein Overlay
  // wird erst abgerufen, wenn es zum ersten Mal aktiviert wird, danach
  // bleibt es im State gecacht (kein wiederholter Abruf bei Ein-/Ausschalten
  // derselben Checkbox in derselben Sitzung).
  useEffect(() => {
    for (const overlay of OVERLAY_CONFIGS) {
      if (!overlaysEnabled[overlay.key]) continue; // nicht aktiviert -> nicht laden
      if (overlayData[overlay.key] !== undefined) continue; // bereits geladen -> nicht erneut abrufen
      if (overlayErrors[overlay.key] !== undefined) continue; // bereits fehlgeschlagen -> kein Retry-Loop
      fetch(overlay.fetchUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((raw) => {
          const points = overlay.extractPoints(raw);
          setOverlayData((prev) => ({ ...prev, [overlay.key]: points }));
        })
        .catch((err) => setOverlayErrors((prev) => ({ ...prev, [overlay.key]: err.message })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlaysEnabled]);

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

  // Leitzins (US 3.5): historische + aktuelle Reihe zusammenfuehren, nach
  // Datum sortiert. IMMER Prozentwert (keine Indexierung, siehe Typ-Kommentar
  // oben) — unabhaengig vom Niveau/Rate-Umschalter, eigene Sekundaerachse.
  const filteredLeitzinsValues = useMemo(() => {
    if (!leitzinsHistorical && !leitzinsCurrent) return [];
    const historical = (leitzinsHistorical?.values ?? []).map((v) => ({
      date: v.date.length === 7 ? `${v.date}-01` : v.date, // "YYYY-MM" -> "YYYY-MM-01"
      value: v.value,
    }));
    const current = (leitzinsCurrent?.values ?? []).map((v) => ({ date: v.date, value: v.value }));
    // Blocker-Fix (Code-Review 29.08.2026): explizite Dedup-Grenze statt
    // implizit auf einen luecken- und overlapfreien Datenstand zu vertrauen.
    // Bei einem Monatsuebergang, in dem BEIDE Quellen Werte liefern, gewinnt
    // die AKTUELLE (LZ, taeglich, praeziser) Quelle — historische Punkte fuer
    // denselben Kalendermonat werden verworfen. Aktuell (Datenstand 29.08.2026)
    // real wirkungslos, da kein Overlap vorliegt (historisch endet 2019-05,
    // aktuell beginnt 2019-06-13) — schuetzt aber vor einem stillen Zickzack-
    // Fehler im Chart, falls sich die Datengrundlage kuenftig aendert.
    const currentMonths = new Set(current.map((v) => v.date.slice(0, 7)));
    const historicalDeduped = historical.filter((v) => !currentMonths.has(v.date.slice(0, 7)));
    const combined = [...historicalDeduped, ...current].filter(
      (v) => typeof v.date === "string" && typeof v.value === "number" && Number.isFinite(v.value)
    );
    combined.sort((a, b) => a.date.localeCompare(b.date));
    return filterByPreset(combined, preset, (v) => parseInt(v.date.slice(0, 4), 10));
  }, [leitzinsHistorical, leitzinsCurrent, preset]);

  const leitzinsExistsInRange = filteredLeitzinsValues.length > 0;

  // Overlays: gefiltert nach Preset UND auf indexierte Niveaus umgerechnet
  // (Basis 100 am Start des jeweils gefilterten Zeitraums, konsistent mit
  // der M2-Behandlung oben) — Requirements 2.5: "dargestellt als indexierte
  // Wertentwicklung, nicht als 'Kaufkraft'".
  const filteredOverlays = useMemo(() => {
    const result: Record<string, { date: string; indexValue: number }[]> = {};
    for (const overlay of OVERLAY_CONFIGS) {
      const raw = overlayData[overlay.key];
      if (!raw || raw.length === 0) continue;
      const validPoints = raw.filter(
        (p) => typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && typeof p.close === "number" && Number.isFinite(p.close)
      );
      const filtered = filterByPreset(validPoints, preset, (p) => parseInt(p.date.slice(0, 4), 10));
      if (filtered.length === 0) continue;
      const base = filtered[0].close;
      if (base === 0) continue; // F2-Fix-Analogie: Basis 0 würde NaN/Infinity fortpflanzen
      result[overlay.key] = filtered.map((p) => ({ date: p.date, indexValue: (p.close / base) * 100 }));
    }
    return result;
  }, [overlayData, preset]);

  function parseIsoDate(iso: string): Date {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }

  // US 3.4 AC (Umschalter Darstellungsart): wandelt eine Niveau-Reihe in
  // Jahreswachstumsraten um — fuer jeden Punkt wird der zeitlich naechste
  // Punkt ~1 Jahr zuvor gesucht (Toleranz 45 Tage, deckt sowohl monatliche
  // als auch taegliche Quellen ab) und die Rate ggu. diesem Referenzpunkt
  // berechnet. Punkte ohne passenden Vorjahreswert (z.B. die ersten 12
  // Monate einer Reihe) liefern null statt eines erfundenen Wertes
  // (Requirements-Regel 3: keine Interpolation/Erfindung).
  function toYoyRate(points: { x: number; y: number }[]): { x: number; y: number | null }[] {
    const toleranceMs = 45 * 24 * 3600 * 1000;
    const oneYearMs = 365.25 * 24 * 3600 * 1000;
    return points.map((p, i) => {
      const targetTime = p.x - oneYearMs;
      let closestIdx = -1;
      let closestDiff = Infinity;
      for (let j = i - 1; j >= 0; j--) {
        const diff = Math.abs(points[j].x - targetTime);
        if (diff < closestDiff) {
          closestDiff = diff;
          closestIdx = j;
        }
        // Punkte sind aufsteigend sortiert -> sobald wir uns wieder vom
        // Zielzeitpunkt entfernen, kann kein besserer Treffer mehr folgen.
        if (points[j].x < targetTime && diff > closestDiff) break;
      }
      if (closestIdx === -1 || closestDiff > toleranceMs) return { x: p.x, y: null };
      const prevValue = points[closestIdx].y;
      if (prevValue === 0) return { x: p.x, y: null };
      return { x: p.x, y: (p.y / prevValue - 1) * 100 };
    });
  }

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

  // US 3.4 AC: im Rate-Modus werden ALLE indexierten Vergleichslinien (LIK,
  // Trueflation, M2, Gold, BTC) auf Jahreswachstumsraten umgestellt. Der
  // Leitzins ist davon AUSGENOMMEN (Betreiber-Vorgabe 29.08.2026) — er ist
  // bereits eine Rate und bleibt in beiden Modi ein Prozentwert auf der
  // Sekundärachse, keine zweite Transformation.
  const likPoints = useMemo(
    () => filteredValues.map((v) => ({ x: parseIndexDate(v.indexDate).getTime(), y: v.indexValue })),
    [filteredValues]
  );
  const trueflationPoints = useMemo(
    () => filteredTrueflationValues.map((v) => ({ x: parseIndexDate(v.month).getTime(), y: v.trueflationIndex })),
    [filteredTrueflationValues]
  );
  const m2Points = useMemo(
    () => filteredM2Values.map((v) => ({ x: parseYearMonth(v.date).getTime(), y: v.indexValue })),
    [filteredM2Values]
  );

  const likDisplayPoints = useMemo(
    () => (displayMode === "rate" ? toYoyRate(likPoints) : likPoints),
    [displayMode, likPoints]
  );
  const trueflationDisplayPoints = useMemo(
    () => (displayMode === "rate" ? toYoyRate(trueflationPoints) : trueflationPoints),
    [displayMode, trueflationPoints]
  );
  const m2DisplayPoints = useMemo(
    () => (displayMode === "rate" ? toYoyRate(m2Points) : m2Points),
    [displayMode, m2Points]
  );

  const chartData: ChartData<"line"> = useMemo(
    () => ({
      datasets: [
        {
          label: t.chart.datasets.lik,
          data: likDisplayPoints,
          borderColor: colors.lineLik,
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0,
          yAxisID: "y",
          spanGaps: false,
        },
        ...(trueflationExistsInRange
          ? [
              {
                label: t.chart.datasets.trueflation,
                data: trueflationDisplayPoints,
                borderColor: colors.lineTrueflation,
                backgroundColor: "transparent",
                borderWidth: 2,
                borderDash: [6, 3], // zusätzlich zur Farbe unterscheidbar (US 3.11, Farbfehlsichtigkeit)
                // US 3.16 Zustand 5: letzter Punkt sichtbar markiert (statt
                // unsichtbar pointRadius:0), damit ein früheres Linienende
                // NICHT wie ein abgeschnittener Fehler aussieht, sondern als
                // bewusst markierter Endpunkt erkennbar ist.
                pointRadius: (ctx: { dataIndex: number }) =>
                  trueflationEndsEarlierThanLik && ctx.dataIndex === trueflationDisplayPoints.length - 1 ? 5 : 0,
                pointBackgroundColor: colors.lineTrueflation,
                pointHoverRadius: 5,
                tension: 0,
                yAxisID: "y",
                spanGaps: false,
              },
            ]
          : []),
        ...(m2ExistsInRange
          ? [
              {
                label: t.chart.datasets.m2,
                data: m2DisplayPoints,
                borderColor: colors.lineMoney,
                backgroundColor: "transparent",
                borderWidth: 2,
                borderDash: [2, 3], // drittes, von LIK (durchgezogen) und Trueflation (6,3) unterscheidbares Muster (US 3.11)
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0,
                yAxisID: "y",
                spanGaps: false,
              },
            ]
          : []),
        ...OVERLAY_CONFIGS.filter((o) => overlaysEnabled[o.key] && filteredOverlays[o.key]?.length).map((overlay) => {
          const points = filteredOverlays[overlay.key].map((v) => ({ x: parseIsoDate(v.date).getTime(), y: v.indexValue }));
          return {
            label: t.chart.overlays.labels[overlay.messageKey],
            data: displayMode === "rate" ? toYoyRate(points) : points,
            borderColor: colors[overlay.colorKey],
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderDash: overlay.dash,
            pointRadius: 0,
            pointHoverRadius: 3,
            tension: 0,
            yAxisID: "y",
            spanGaps: false,
          };
        }),
        // Leitzins (US 3.5): eigene Sekundärachse ("y1"), IMMER Prozentwert,
        // unabhängig vom displayMode — keine Transformation, keine Indexierung.
        ...(leitzinsEnabled && leitzinsExistsInRange
          ? [
              {
                label: t.chart.datasets.leitzins,
                data: filteredLeitzinsValues.map((v) => ({ x: parseIsoDate(v.date).getTime(), y: v.value })),
                borderColor: colors.lineRate,
                backgroundColor: "transparent",
                borderWidth: 1.5,
                borderDash: [8, 2], // viertes, eigenständiges Muster (US 3.11)
                pointRadius: 0,
                pointHoverRadius: 3,
                tension: 0,
                yAxisID: "y1",
              },
            ]
          : []),
      ],
    }),
    [
      likDisplayPoints,
      trueflationDisplayPoints,
      trueflationExistsInRange,
      m2DisplayPoints,
      m2ExistsInRange,
      trueflationEndsEarlierThanLik,
      filteredOverlays,
      overlaysEnabled,
      displayMode,
      leitzinsEnabled,
      leitzinsExistsInRange,
      filteredLeitzinsValues,
      // K2-Fix: Farben als Dependency — bei Theme-Wechsel (Light/Dark,
      // manuell oder System) muss chartData neu aufgebaut werden, sonst
      // behalten die Datasets die Farbwerte des alten Themes.
      colors,
      t,
    ]
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
          ticks: { color: colors.textSecondary },
        },
        y: {
          title: {
            display: true,
            text: displayMode === "rate" ? t.chart.axes.yRate : t.chart.axes.yNiveau,
            color: colors.textSecondary,
          },
          grid: { color: colors.border },
          ticks: { color: colors.textSecondary },
        },
        // Leitzins-Sekundärachse (US 3.5): eigene Achse rechts, damit die
        // Prozentwerte (typischerweise -1 bis +2%) nicht in der Index-Skala
        // (100+) untergehen. Nur eingeblendet, wenn der Leitzins aktiv ist.
        y1: {
          position: "right" as const,
          title: { display: true, text: t.chart.axes.leitzins, color: colors.textSecondary },
          grid: { display: false },
          ticks: { color: colors.textSecondary },
          display: leitzinsEnabled && leitzinsExistsInRange,
        },
      },
      plugins: {
        legend: { display: true, position: "top" as const, labels: { color: colors.textSecondary } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y ?? null;
              if (v === null) return "";
              if (ctx.dataset.label === t.chart.datasets.leitzins) {
                return t.chart.tooltips.leitzins(v);
              }
              if (ctx.dataset.label === t.chart.datasets.trueflation) {
                const point = filteredTrueflationValues[ctx.dataIndex];
                const base = t.chart.tooltips.trueflation(v, displayMode, !!point?.rentCorrectionApplied);
                const notes = [point?.transitionNote, point?.rentCorrectionNote].filter(
                  (n): n is string => typeof n === "string" && n.length > 0
                );
                return notes.length > 0 ? [base, ...notes] : base;
              }
              if (ctx.dataset.label === t.chart.datasets.m2) {
                // US 3.7: zentraler Denkfehler direkt am Chart abfangen, nicht
                // nur auf der Methodik-Seite, die kaum jemand liest.
                return t.chart.tooltips.m2(v, displayMode);
              }
              const matchingOverlay = OVERLAY_CONFIGS.find(
                (o) => t.chart.overlays.labels[o.messageKey] === ctx.dataset.label
              );
              if (matchingOverlay) {
                // K3-Fix: displayMode mitgeben — im Rate-Modus kein
                // "(indexiert, ...)" mehr im Overlay-Tooltip.
                return t.chart.overlays.tooltips[matchingOverlay.messageKey](v, displayMode);
              }
              return t.chart.tooltips.lik(v, displayMode);
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
    [preset, filteredTrueflationValues, displayMode, leitzinsEnabled, leitzinsExistsInRange, colors, t]
  );

  const resetZoom = useCallback(() => {
    chartRef.current?.resetZoom();
  }, []);

  // W2-Fix (Frontend-Review 30.08.2026): beim Preset-Wechsel den Zoom
  // zurücksetzen — sonst bleibt ein gesetzter Zoom-Ausschnitt aktiv und
  // zeigt im neuen Zeitraum-Preset möglicherweise einen falschen/leeren
  // Bereich. useEffect statt onClick-Erweiterung: feuert nach dem
  // Re-Render mit den neuen gefilterten Daten, nicht davor.
  useEffect(() => {
    resetZoom();
  }, [preset, resetZoom]);

  // PNG-Export (US 3.13b): "Bild herunterladen" — Nice-to-have-Fix
  // (Code-Review 29.08.2026): Kommentar behauptete faelschlich die Nutzung
  // von Chart.js' toBase64Image(); tatsaechlich arbeitet der Code manuell
  // mit einer Canvas-Kopie (drawImage/fillText/toDataURL), damit die
  // eingebrannte Quellenangabe/CC-BY-Hinweis (US 3.13 AC) als zusaetzliche
  // Zeile VOR dem Export gezeichnet werden kann — toBase64Image() alleine
  // koennte das nicht leisten, da es nur den bestehenden Chart-Inhalt ohne
  // Erweiterungsmoeglichkeit serialisiert. Kommentar jetzt korrekt.
  function downloadChartImage() {
    const chart = chartRef.current;
    if (!chart) return;
    const canvas = chart.canvas;

    // Footer-Zeile mit Quellenangabe direkt auf eine Kopie des Canvas
    // zeichnen, damit der Original-Chart nicht dauerhaft verändert wird.
    const exportCanvas = document.createElement("canvas");
    const footerHeight = 32;
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height + footerHeight * (window.devicePixelRatio || 1);
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportCtx.drawImage(canvas, 0, 0);
    const scale = window.devicePixelRatio || 1;
    exportCtx.fillStyle = "#6b7280";
    exportCtx.font = `${12 * scale}px sans-serif`;
    exportCtx.fillText(
      t.chart.pngExport.footer,
      8 * scale,
      canvas.height + 20 * scale
    );

    const link = document.createElement("a");
    link.download = `${t.chart.pngExport.fileNamePrefix}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  }

  if (error) {
    return (
      <div className="tf-chart-error" role="alert">
        Daten konnten nicht geladen werden: {error}
      </div>
    );
  }

  if (!data) {
    return <div className="tf-chart-loading">{t.chart.loading}</div>;
  }

  const lastPoint = data.values[data.values.length - 1];
  const publishDateStr = String(data.sourcePublishDate);
  const publishDateFormatted = `${publishDateStr.slice(6, 8)}.${publishDateStr.slice(4, 6)}.${publishDateStr.slice(0, 4)}`;

  return (
    <div className="tf-chart-container">
      <div className="tf-chart-toolbar" role="group" aria-label={t.chart.toolbar.groupLabelTimeframe}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            aria-pressed={preset === p.key}
            className={`tf-preset-button${preset === p.key ? " tf-preset-button--active" : ""}`}
          >
            {t.chart.presets[p.key]}
          </button>
        ))}
        <button onClick={resetZoom} className="tf-preset-button" aria-label={t.chart.toolbar.resetZoom}>
          {t.chart.toolbar.resetZoom}
        </button>
        {/* US 3.13b: PNG-Export mit eingebrannter Quellenangabe/CC-BY-Hinweis,
            zur Verwendung in Präsentationen/Artikeln. */}
        <button onClick={downloadChartImage} className="tf-preset-button" aria-label="Chart als Bild herunterladen">
          {t.chart.toolbar.downloadImage}
        </button>
      </div>

      {/* US 3.4 AC: Umschalter Darstellungsart — gilt für LIK, Trueflation,
          M2 und alle Referenz-Overlays. Der Leitzins ist bewusst ausgenommen
          (siehe Kommentar bei der Dataset-Erzeugung oben) und bleibt in
          beiden Modi ein Prozentwert. */}
      <div role="group" aria-label={t.chart.toolbar.groupLabelDisplayMode} className="tf-chart-toolbar">
        <button
          onClick={() => setDisplayMode("niveau")}
          aria-pressed={displayMode === "niveau"}
          className={`tf-preset-button${displayMode === "niveau" ? " tf-preset-button--active" : ""}`}
        >
          {t.chart.displayModes.niveau}
        </button>
        <button
          onClick={() => setDisplayMode("rate")}
          aria-pressed={displayMode === "rate"}
          className={`tf-preset-button${displayMode === "rate" ? " tf-preset-button--active" : ""}`}
        >
          {t.chart.displayModes.rate}
        </button>
      </div>

      {/* Leitzins-Overlay (US 3.5): eigene Toolbar-Zeile, da methodisch
          anders als die Referenz-Overlays (keine Wertaufbewahrung, sondern
          geldpolitisches Instrument, eigene Sekundärachse). */}
      <div className="tf-chart-toolbar" role="group" aria-label={t.chart.datasets.leitzins}>
        <label className="tf-preset-button" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="checkbox"
            checked={leitzinsEnabled}
            onChange={(e) => setLeitzinsEnabled(e.target.checked)}
            aria-label={t.chart.toolbar.leitzinsToggle}
          />
          {t.chart.datasets.leitzins}
        </label>
      </div>
      {leitzinsEnabled && leitzinsError && (
        <div className="tf-chart-status" role="status">
          <span>Leitzins-Daten derzeit nicht verfügbar (Ausfall) — Kernlinien bleiben unberührt.</span>
        </div>
      )}

      {/* Overlay-Checkboxen (Requirements 2.5): Standardzustand alle AUS
          (opt-in), eigene Kategorisierung "Wertaufbewahrung/Rendite" statt
          "Inflationsmessung" — auch in der Bedienelement-Beschriftung
          sichtbar, nicht nur im Tooltip. */}
      {/* CODE-REVIEW-FIX (28.08.2026): pro Kategorie EIN eigener
          Toolbar-Block mit dynamischem Label aus OVERLAY_CATEGORY_LABELS —
          ein künftiges Overlay mit category:"trueflation-variante" bekommt
          automatisch die korrekte Gruppe/Beschriftung, ohne dass diese
          Render-Logik geändert werden muss (das ist der eigentliche Beweis
          der Erweiterbarkeits-Anforderung). */}
      {(Object.keys(t.chart.overlays.categories) as OverlayCategory[])
        .filter((cat) => OVERLAY_CONFIGS.some((o) => o.category === cat))
        .map((cat) => (
          <div key={cat} className="tf-chart-toolbar" role="group" aria-label={t.chart.toolbar.overlayCategoryGroup(t.chart.overlays.categories[cat])}>
            {OVERLAY_CONFIGS.filter((o) => o.category === cat).map((overlay) => (
              <label key={overlay.key} className="tf-preset-button" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="checkbox"
                  checked={!!overlaysEnabled[overlay.key]}
                  onChange={(e) => setOverlaysEnabled((prev) => ({ ...prev, [overlay.key]: e.target.checked }))}
                  aria-label={t.chart.toolbar.overlayToggle(t.chart.overlays.labels[overlay.messageKey])}
                />
                {t.chart.overlays.labels[overlay.messageKey]}
              </label>
            ))}
          </div>
        ))}

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
          <span>Trueflation = LIK (ab 2020 miet-korrigiert) + Prämienkorrektur (finaler v1-Scope,
            29.08.2026). Fixer Warenkorb wurde geprüft und als Befund dokumentiert (nicht in die
            Kernzahl integriert) — Details siehe{" "}
            <a href="/methodik" className="underline">Methodik</a>.</span>
        </div>
      )}
      {/* SICHTBARKEITSPFLICHT (Betreiber-Vorgabe 29.08.2026): Ein Bruch, der
          nur im JSON steht (rentCorrectionNote), erfüllt die
          Kennzeichnungspflicht nicht — bei dieser kleinen Effektgrösse
          (+0.0608 pp/Jahr) ist der Bruch optisch unsichtbar, deshalb MUSS er
          textlich sichtbar sein, nicht nur im Tooltip am einzelnen
          Datenpunkt. Eigener, dauerhaft sichtbarer Status-Hinweis (nicht nur
          Tooltip-Text, der ein Hover erfordert). */}
      {trueflationExistsInRange && filteredTrueflationValues.some((v) => v.rentCorrectionApplied) && (
        <div className="tf-chart-status" role="note">
          <span>ℹ️ Ab Januar 2020 enthält die Trueflation-Linie zusätzlich eine Miet-Korrektur
            (Variante Bevölkerungsanteil, +0.0608 Prozentpunkte/Jahr) — davor läuft die Linie ohne
            diese Korrektur. Bewusst als Bruch gekennzeichnet, nicht rückwirkend geglättet.
            Details siehe <a href="/methodik" className="underline">Methodik</a>.</span>
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

      {/* Overlay-Ausfälle: nur anzeigen, wenn das jeweilige Overlay auch
          aktiviert wurde (sonst würde ein "aus"-Overlay unnötig einen
          Fehler melden, den niemand angefordert hat). */}
      {OVERLAY_CONFIGS.filter((o) => overlaysEnabled[o.key] && overlayErrors[o.key]).map((overlay) => (
        <div className="tf-chart-status" role="status" key={overlay.key}>
          <span>{t.chart.overlays.labels[overlay.messageKey]}-Daten derzeit nicht verfügbar (Ausfall) — Kernlinien bleiben unberührt.</span>
        </div>
      ))}
    </div>
  );
}
// HINWEIS (i18n, US 4.x): die Kategorie-Beschriftungen, die hier früher als
// OVERLAY_CATEGORY_LABELS-Konstante standen, liegen jetzt im Content-Layer
// (app/i18n/locales/de.ts -> chart.overlays.categories) — der Kommentar zum
// ursprünglichen Code-Review-Fund (28.08.2026: Kategorisierung aus
// overlay.category ableiten statt hart verdrahtetem aria-label) gilt
// unverändert, nur die Textquelle ist umgezogen.
