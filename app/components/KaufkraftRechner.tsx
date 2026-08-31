"use client";

/**
 * trueflation.ch — Kaufkraft-Rechner (US 3.8, US 3.9)
 *
 * Eingabe: Betrag (CHF) + Startjahr. Ausgabe immer bezogen auf den
 * aktuellsten verfügbaren Datenstand ("jetzt"), NICHT auf ein wählbares
 * Zieljahr (US 3.8: hält die UI auf einen Eingabewert statt zwei begrenzt).
 *
 * Startjahre ab 1914 wählbar (volle LIK-Tiefe), Default 2010 (erstes Jahr
 * mit vollständigem Trueflation-Wert — Erstnutzer sieht ein vollständiges
 * Ergebnis, keine Grenzfall-Meldung).
 *
 * Grenzfall a (US 3.8): Für Startjahre vor 2010 existiert kein
 * Trueflation-Wert — klar ausgewiesen ("existiert erst ab 2010"), kein
 * Interpolieren. LIK-Wert wird trotzdem normal berechnet (LIK deckt 1914+).
 *
 * Grenzfall b (US 3.9): Gold/BTC nur ab tatsächlichem Datenbeginn der
 * jeweiligen Overlay-Quelle — vor diesem Punkt klarer Hinweis statt Wert.
 *
 * Teilbarkeit (US 3.8 AC): Rechnerzustand wird als URL-Query-Parameter
 * geführt (?betrag=100&jahr=2015) — ein Ergebnis ist direkt verlinkbar.
 *
 * Geldmengen-Verwässerung wird bewusst NICHT gezeigt (US 3.8 AC) —
 * beantwortet keine persönliche Kaufkraft-Frage, bleibt System-Kennzahl im
 * Hauptchart (Linie 3).
 *
 * Umschalter Niveau/Rate (Requirements 2.0, konsistent mit dem Hauptchart):
 * "Niveau" (Default) zeigt den kumulierten Kaufkraft-Effekt (aktueller
 * Rechnermodus, ein einzelner CHF-Betrag). "Rate" zeigt zusätzlich die
 * annualisierte Teuerungsrate über denselben Zeitraum (geometrisches
 * Mittel), weil ein CHF-Betrag allein die Frage "wie schnell im Schnitt pro
 * Jahr" nicht beantwortet — dieselbe Unterscheidung wie im Hauptchart
 * (Niveau vs. Jahreswachstumsrate), hier auf den persönlichen Zeitraum
 * bezogen statt auf die gesamte Reihe.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../i18n/format";
import { getMessages, DEFAULT_LOCALE, type Messages } from "../i18n";

type TrueflationYearlyFile = {
  calendarYearAverages: Array<{
    year: number;
    trueflationIndexAvg: number;
    likIndexAvg: number;
    monthsIncluded: number;
  }>;
};

type LikMonthlyFile = {
  values: Array<{ indexDate: number; indexValue: number }>;
};

type OverlayPoint = { date: string; close?: number; goldChf?: number };
type OverlayFile = { values: OverlayPoint[] };

const TRUEFLATION_START_YEAR = 2010;
const LIK_START_YEAR = 1914;
const DEFAULT_YEAR = 2010;
const DEFAULT_AMOUNT = 1000;
// Security-Review-Fund (29.08.2026, Informational I1/F1, vom Betreiber
// hochgestuft): betrag hatte keine Obergrenze -- ?betrag=1e308 erzeugt
// Infinity-Betraege (Intl.NumberFormat rendert "∞"). Kein Sicherheitsrisiko
// (rein clientseitige Berechnung), aber unschoen/verwirrend fuer echte
// Nutzer, die versehentlich eine zu lange Zahl eingeben oder eine manipulierte
// URL teilen. Obergrenze 1 Billion CHF -- weit ueber jedem plausiblen
// Rechner-Anwendungsfall, aber klar unter dem Punkt, an dem
// Gleitkomma-Rundungsfehler bei der Multiplikation mit Marktpreisen
// (Gold/BTC) sichtbar wuerden.
const MAX_BETRAG = 1e12;

// i18n (US 4.x Grundgerüst, 30.08.2026): Formatierungslogik liegt jetzt in
// app/i18n/format.ts (locale-abhängig, kein hartcodiertes "de-CH" mehr).
// formatChf bleibt als dünner Wrapper bestehen, damit die vielen Aufrufstellen
// unten unverändert bleiben — KEINE doppelte Pflege: die eigentliche
// Intl.NumberFormat-Konfiguration existiert nur noch einmal (formatCurrency).
function formatChf(value: number): string {
  return formatCurrency(value);
}

function readInitialParams(): { betrag: number; jahr: number } {
  if (typeof window === "undefined") return { betrag: DEFAULT_AMOUNT, jahr: DEFAULT_YEAR };
  const params = new URLSearchParams(window.location.search);
  const betragRaw = params.get("betrag");
  const jahrRaw = params.get("jahr");
  const betrag = betragRaw != null && Number.isFinite(Number(betragRaw)) && Number(betragRaw) > 0
    ? Math.min(Number(betragRaw), MAX_BETRAG)
    : DEFAULT_AMOUNT;
  const jahr = jahrRaw != null && Number.isFinite(Number(jahrRaw))
    ? Math.min(Math.max(Number(jahrRaw), LIK_START_YEAR), new Date().getFullYear())
    : DEFAULT_YEAR;
  return { betrag, jahr };
}

type DisplayMode = "niveau" | "rate";

function readInitialMode(): DisplayMode {
  if (typeof window === "undefined") return "niveau";
  const params = new URLSearchParams(window.location.search);
  return params.get("modus") === "rate" ? "rate" : "niveau";
}

export default function KaufkraftRechner() {
  // i18n (US 4.x Grundgerüst): sichtbare Beschriftungen aus dem Content-Layer.
  // v1 statisch Deutsch; v2 macht die Locale dynamisch, ohne diese Komponente
  // anzufassen.
  const t: Messages = getMessages(DEFAULT_LOCALE);
  const initial = useMemo(() => readInitialParams(), []);
  const [betrag, setBetrag] = useState(initial.betrag);
  const [jahr, setJahr] = useState(initial.jahr);
  const [modus, setModus] = useState<DisplayMode>(() => readInitialMode());

  const [likData, setLikData] = useState<LikMonthlyFile | null>(null);
  const [trueflationYearly, setTrueflationYearly] = useState<TrueflationYearlyFile | null>(null);
  const [goldData, setGoldData] = useState<OverlayFile | null>(null);
  const [btcData, setBtcData] = useState<OverlayFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/data/lik/total-index-monthly.json").then((r) => {
        if (!r.ok) throw new Error(`LIK HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/data/trueflation/trueflation-index-yearly.json").then((r) => {
        if (!r.ok) throw new Error(`Trueflation HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([lik, tf]) => {
        setLikData(lik);
        setTrueflationYearly(tf);
      })
      .catch((err) => setError(err.message));

    // Overlays (US 3.9): Ausfall darf den Rechner nicht blockieren — Gold/BTC
    // sind optionale Zusatzwerte, kein Kernresultat.
    fetch("/data/overlays/gold-chf-daily-derived.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setGoldData)
      .catch(() => setGoldData(null));
    fetch("/data/overlays/btc-chf-daily.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setBtcData)
      .catch(() => setBtcData(null));
  }, []);

  // URL-Sync (US 3.8 AC Teilbarkeit): jede Eingabeänderung aktualisiert die
  // Query-Parameter via history.replaceState — kein Page-Reload, aber die
  // URL ist jederzeit der aktuelle, teilbare Zustand.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("betrag", String(betrag));
    params.set("jahr", String(jahr));
    params.set("modus", modus);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, [betrag, jahr, modus]);

  const likStartValue = useMemo(() => {
    if (!likData) return null;
    // Nächstgelegener Monat zum gewählten Jahr, Januar bevorzugt.
    const candidates = likData.values.filter((v) => Math.floor(v.indexDate / 10000) === jahr);
    return candidates.length > 0 ? candidates[0].indexValue : null;
  }, [likData, jahr]);

  const likLatestValue = useMemo(() => {
    if (!likData || likData.values.length === 0) return null;
    return likData.values[likData.values.length - 1].indexValue;
  }, [likData]);

  // Blocker-Fix (Code-Review 29.08.2026): tatsaechliches Jahr des letzten
  // LIK-Datenpunkts, NICHT new Date().getFullYear() (Wall-Clock-Jahr).
  // LIK-Daten erscheinen mit Publikationsverzug (typischerweise der neueste
  // Punkt ist noch aus dem Vorjahr/-monat) — das Wall-Clock-Jahr haette den
  // Exponenten im geometrischen Mittel systematisch zu hoch angesetzt und
  // damit die angezeigte Rate verfaelscht. Analog zu trueflationYearsSpan
  // unten, das bereits korrekt lastAvg.year statt Wall-Clock nutzt — die
  // Inkonsistenz zwischen beiden war der eigentliche Bug-Indikator.
  const likLatestYear = useMemo(() => {
    if (!likData || likData.values.length === 0) return null;
    return Math.floor(likData.values[likData.values.length - 1].indexDate / 10000);
  }, [likData]);

  const trueflationStartValue = useMemo(() => {
    if (!trueflationYearly || jahr < TRUEFLATION_START_YEAR) return null;
    const entry = trueflationYearly.calendarYearAverages.find((a) => a.year === jahr);
    return entry ? entry.trueflationIndexAvg : null;
  }, [trueflationYearly, jahr]);

  const trueflationLatestValue = useMemo(() => {
    if (!trueflationYearly || trueflationYearly.calendarYearAverages.length === 0) return null;
    const avgs = trueflationYearly.calendarYearAverages;
    return avgs[avgs.length - 1].trueflationIndexAvg;
  }, [trueflationYearly]);

  // Code-Review-Fix (29.08.2026): trueflationExists prüfte bisher NUR die
  // untere Grenze (jahr >= TRUEFLATION_START_YEAR), nicht die obere. Das
  // Jahr-Dropdown (yearOptions unten) reicht aber bis zum aktuellen
  // Kalenderjahr, während calendarYearAverages durch das letzte vollständige
  // BAG-Prämienjahr begrenzt ist (aktuell 2024) — für 2025/2026 blieb die UI
  // dauerhaft im "Daten werden geladen…"-Zustand haengen, obwohl strukturell
  // gar keine Daten kommen werden (US 3.16: "lädt" != "existiert nicht").
  // trueflationLastAvailableYear macht die tatsächlich vorhandene obere
  // Grenze explizit, statt sie implizit aus dem Array abzuleiten.
  const trueflationLastAvailableYear = trueflationYearly && trueflationYearly.calendarYearAverages.length > 0
    ? trueflationYearly.calendarYearAverages[trueflationYearly.calendarYearAverages.length - 1].year
    : null;
  const trueflationExists = jahr >= TRUEFLATION_START_YEAR
    && (trueflationLastAvailableYear == null || jahr <= trueflationLastAvailableYear);

  // Kaufkraft-Logik: "Was ist mein Betrag von damals heute wert" invertiert
  // die Preissteigerung — Kaufkraft(heute) = Betrag / (Index_heute/Index_damals).
  // D.h. bei gestiegenen Preisen sinkt die reale Kaufkraft des ursprünglichen
  // Betrags.
  const likResult = useMemo(() => {
    if (likStartValue == null || likLatestValue == null || likStartValue <= 0) return null;
    return betrag / (likLatestValue / likStartValue);
  }, [betrag, likStartValue, likLatestValue]);

  const trueflationResult = useMemo(() => {
    if (!trueflationExists || trueflationStartValue == null || trueflationLatestValue == null || trueflationStartValue <= 0) {
      return null;
    }
    return betrag / (trueflationLatestValue / trueflationStartValue);
  }, [betrag, trueflationExists, trueflationStartValue, trueflationLatestValue]);

  // Gold/BTC-Vergleich (US 3.9): "hätte ich stattdessen gehalten" — invertierte
  // Logik wie oben, aber mit dem jeweiligen Marktpreis statt Inflationsindex.
  // Als useCallback deklariert (Lint-Fix): computeOverlayResult greift auf
  // die Komponenten-Props betrag/jahr zu, muss daher als Dependency in den
  // useMemo-Aufrufen unten auftauchen — vorher fehlte das (ESLint
  // react-hooks/exhaustive-deps), was bei einer künftigen Änderung dieser
  // Funktion zu veralteten Werten in goldResult/btcResult führen könnte.
  const computeOverlayResult = useCallback(
    (overlay: OverlayFile | null, field: "close" | "goldChf") => {
      if (!overlay || overlay.values.length === 0) return { result: null, availableFrom: null as number | null };
      const validPoints = overlay.values.filter((p) => typeof p.date === "string" && typeof p[field] === "number");
      if (validPoints.length === 0) return { result: null, availableFrom: null };
      const firstYear = parseInt(validPoints[0].date.slice(0, 4), 10);
      if (jahr < firstYear) return { result: null, availableFrom: firstYear };
      const startCandidates = validPoints.filter((p) => p.date.slice(0, 4) === String(jahr));
      const startPoint = startCandidates.length > 0 ? startCandidates[0] : null;
      const latestPoint = validPoints[validPoints.length - 1];
      if (!startPoint || !latestPoint) return { result: null, availableFrom: firstYear };
      const startPrice = startPoint[field] as number;
      const latestPrice = latestPoint[field] as number;
      if (startPrice <= 0) return { result: null, availableFrom: firstYear };
      // Hier NICHT invertiert: eine Anlage in Gold/BTC wächst mit dem Preis
      // (kein Kaufkraftverlust-Modell, sondern Wertentwicklung derselben Menge).
      return { result: betrag * (latestPrice / startPrice), availableFrom: firstYear };
    },
    [betrag, jahr]
  );

  const goldResult = useMemo(() => computeOverlayResult(goldData, "goldChf"), [goldData, computeOverlayResult]);
  const btcResult = useMemo(() => computeOverlayResult(btcData, "close"), [btcData, computeOverlayResult]);

  // Annualisierte Rate (geometrisches Mittel) über den gewählten persönlichen
  // Zeitraum — nur berechenbar, wenn mindestens 1 Jahr zwischen Startjahr und
  // dem letzten verfügbaren Datenjahr liegt (sonst Division durch 0 bei
  // yearsSpan). Formel konsistent mit der Jahresrate im Hauptchart: geometrisch,
  // nicht arithmetisch (siehe build-trueflation-index.mjs).
  const likYearsSpan = likLatestYear != null ? likLatestYear - jahr : 0;
  const likAnnualRatePercent = useMemo(() => {
    if (likStartValue == null || likLatestValue == null || likStartValue <= 0 || likYearsSpan <= 0) return null;
    return (Math.pow(likLatestValue / likStartValue, 1 / likYearsSpan) - 1) * 100;
  }, [likStartValue, likLatestValue, likYearsSpan]);

  const trueflationYearsSpan = trueflationYearly
    ? trueflationYearly.calendarYearAverages[trueflationYearly.calendarYearAverages.length - 1]?.year - jahr
    : 0;
  const trueflationAnnualRatePercent = useMemo(() => {
    if (!trueflationExists || trueflationStartValue == null || trueflationLatestValue == null || trueflationStartValue <= 0 || trueflationYearsSpan <= 0) {
      return null;
    }
    return (Math.pow(trueflationLatestValue / trueflationStartValue, 1 / trueflationYearsSpan) - 1) * 100;
  }, [trueflationExists, trueflationStartValue, trueflationLatestValue, trueflationYearsSpan]);

  function formatRate(value: number | null): string {
    if (value == null) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)} %/Jahr`;
  }

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = LIK_START_YEAR; y <= currentYear; y++) years.push(y);
    return years;
  }, []);

  function copyShareLink() {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      // Clipboard-API kann in unsicheren Kontexten fehlen — kein harter Fehler,
      // Nutzer kann die URL manuell aus der Adressleiste kopieren.
    });
  }

  if (error) {
    return (
      <div className="tf-chart-error" role="alert">
        Kaufkraft-Rechner: Daten konnten nicht geladen werden ({error}).
      </div>
    );
  }

  return (
    <section
      aria-labelledby="kaufkraft-rechner-heading"
      className="tf-rechner"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        backgroundColor: "var(--color-bg-elevated)",
      }}
    >
      <h2 id="kaufkraft-rechner-heading" className="text-lg font-medium">
        {t.rechner.title}
      </h2>
      <p className="mt-1 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {t.rechner.intro}
      </p>

      {/* Mobile-Fix (US 3.10): flex-col auf kleinen Bildschirmen statt
          flex-wrap — flex-wrap liess Eingabefelder auf schmalen Viewports
          nebeneinander umbrechen und dabei zu schmal werden (Betrag-Input
          auf 10rem fixiert quetschte sich neben das Jahr-Dropdown). Ab `sm`
          (Tailwind-Breakpoint, konsistent mit dem Rest der Seite) wieder
          nebeneinander. */}
      <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t.rechner.amountLabel}</span>
          <input
            type="number"
            min={1}
            step={1}
            value={betrag}
            onChange={(e) => {
              // Code-Review-Fund Runde 2 (29.08.2026): MAX_BETRAG wurde bisher NUR
              // beim initialen Lesen der URL-Query-Parameter geclampt
              // (readInitialParams) -- direkte Feldeingabe umging die Grenze
              // komplett. Derselbe Clamp muss an JEDEM Punkt gelten, an dem
              // betrag gesetzt wird, nicht nur am Einstiegspunkt.
              const v = Number(e.target.value);
              setBetrag(Number.isFinite(v) && v > 0 ? Math.min(v, MAX_BETRAG) : 1);
            }}
            aria-label={t.rechner.amountAriaLabel}
            className="tf-numeric"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-text-primary)",
              width: "100%",
              maxWidth: "12rem",
              // Touch-Zielgrösse (WCAG 2.5.5/US 3.10): min. 44px Bedienfläche.
              minHeight: "2.75rem",
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span>{t.rechner.yearLabel}</span>
          <select
            value={jahr}
            onChange={(e) => setJahr(Number(e.target.value))}
            aria-label={t.rechner.yearAriaLabel}
            className="tf-numeric"
            style={{
              padding: "var(--space-2) var(--space-3)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-text-primary)",
              width: "100%",
              maxWidth: "12rem",
              minHeight: "2.75rem",
            }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={copyShareLink}
          className="tf-preset-button"
          aria-label={t.rechner.shareButtonAriaLabel}
          style={{ minHeight: "2.75rem" }}
        >
          {linkCopied ? t.rechner.shareButtonCopied : t.rechner.shareButton}
        </button>
      </div>

      {/* Umschalter Niveau/Rate (Requirements 2.0) — konsistent mit dem
          Hauptchart-Umschalter, hier auf den persönlichen Rechner-Zeitraum
          bezogen statt auf die gesamte Reihe. Tastaturbedienbar per
          native <button>, aria-pressed signalisiert Screenreadern den
          aktiven Zustand (WCAG 4.1.2 Name/Role/Value). */}
      <div
        role="group"
        aria-label={t.rechner.modes.groupLabel}
        className="mt-3 flex flex-wrap gap-2"
      >
        <button
          onClick={() => setModus("niveau")}
          aria-pressed={modus === "niveau"}
          className={`tf-preset-button${modus === "niveau" ? " tf-preset-button--active" : ""}`}
          style={{ minHeight: "2.75rem" }}
        >
          {t.rechner.modes.niveau}
        </button>
        <button
          onClick={() => setModus("rate")}
          aria-pressed={modus === "rate"}
          className={`tf-preset-button${modus === "rate" ? " tf-preset-button--active" : ""}`}
          style={{ minHeight: "2.75rem" }}
        >
          {t.rechner.modes.rate}
        </button>
      </div>

      <dl className="mt-6 flex flex-col gap-3 text-sm">
        <div>
          <dt className="font-medium">{t.rechner.results.lik(formatChf(betrag), jahr)}</dt>
          <dd className="tf-numeric text-xl mt-1" style={{ color: "var(--color-line-lik, #4b5f7a)" }}>
            {likResult != null ? formatChf(likResult) : t.rechner.loading}
          </dd>
          {modus === "rate" && (
            <dd className="tf-numeric text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {t.rechner.results.rateSuffix(formatRate(likAnnualRatePercent), jahr)}
            </dd>
          )}
        </div>

        <div>
          <dt className="font-medium">{t.rechner.results.trueflation(formatChf(betrag), jahr)}</dt>
          {trueflationExists ? (
            <>
              <dd className="tf-numeric text-xl mt-1" style={{ color: "var(--color-line-trueflation, #d1495b)" }}>
                {trueflationResult != null ? formatChf(trueflationResult) : t.rechner.loading}
              </dd>
              {modus === "rate" && (
                <dd className="tf-numeric text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                  {t.rechner.results.rateSuffix(formatRate(trueflationAnnualRatePercent), jahr)}
                </dd>
              )}
            </>
          ) : jahr < TRUEFLATION_START_YEAR ? (
            <dd className="mt-1" style={{ color: "var(--color-text-muted)" }} role="status">
              Trueflation-Index existiert erst ab {TRUEFLATION_START_YEAR} — für {jahr} kein Wert
              verfügbar (kein Interpolieren, siehe Methodik).
            </dd>
          ) : (
            // Betreiber-Vorgabe (29.08.2026, nach Code-Review-Fund): eigener Meldungstext
            // für die OBERE Grenze — derselbe Zustand wie das Linienende im Hauptchart
            // (US 3.16 Zustand 5: Datenrealitaet, kein Fehler, keine Fortschreibung), NICHT
            // dieselbe Formulierung wie der Vor-2010-Fall (dort strukturelle Nicht-Existenz
            // VOR Reihenbeginn, hier fehlende amtliche Folgejahre NACH dem letzten Datenpunkt
            // — zwei unterschiedliche Gruende fuer denselben aeusseren Effekt).
            <dd className="mt-1" style={{ color: "var(--color-text-muted)" }} role="status">
              Prämiendaten reichen bis {trueflationLastAvailableYear} — für {jahr} liegt noch kein
              amtlicher BAG-Jahreswert vor (kein Interpolieren, keine Fortschreibung, siehe Methodik).
            </dd>
          )}
        </div>

        <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <dt className="font-medium" style={{ color: "var(--color-text-secondary)" }}>
            {t.rechner.results.comparisonIntro(formatChf(betrag), jahr)}
          </dt>
          <dd className="mt-2 flex flex-wrap gap-6">
            <span>
              {t.rechner.results.goldLabel}{" "}
              <span className="tf-numeric" style={{ color: "var(--color-overlay-gold, #b8860b)" }}>
                {goldResult.result != null
                  ? formatChf(goldResult.result)
                  : goldResult.availableFrom != null
                    ? t.rechner.results.availableFrom(goldResult.availableFrom)
                    : t.rechner.results.notAvailable}
              </span>
            </span>
            <span>
              {t.rechner.results.bitcoinLabel}{" "}
              <span className="tf-numeric" style={{ color: "var(--color-overlay-btc, #c26a00)" }}>
                {btcResult.result != null
                  ? formatChf(btcResult.result)
                  : btcResult.availableFrom != null
                    ? t.rechner.results.availableFrom(btcResult.availableFrom)
                    : t.rechner.results.notAvailable}
              </span>
            </span>
          </dd>
          <dd className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            Marktdaten, keine Inflationsmessung — reine Wertentwicklung derselben Anlagesumme, siehe{" "}
            <a href="/methodik" className="underline">Methodik</a>.
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs" style={{ color: "var(--color-text-muted)" }}>
        Geldmengenausweitung (M2) wird hier bewusst nicht gezeigt — sie misst eine Systemgrösse, keine
        persönliche Kaufkraft (siehe Hauptchart, Linie 3, und Methodik).
      </p>
    </section>
  );
}
