/**
 * trueflation.ch — deutsche Texte (Content-Layer, US 4.x Grundgerüst)
 *
 * Enthält die Chart-/Rechner-Beschriftungen, die vor dem i18n-Refactoring
 * als String-Literale in LikChart.tsx, KaufkraftRechner.tsx und
 * MietkorrekturMiniChart.tsx standen. Texte sind 1:1 übernommen — reines
 * Refactoring, keine inhaltliche Änderung.
 *
 * Dynamische Texte (mit Werten) sind Funktionen, keine Template-Konkatenation
 * in den Komponenten — so kann eine v2-Sprache dieselbe Struktur mit eigener
 * Grammatik/Wortstellung füllen.
 *
 * SCOPE: Fliesstext-Seiten (Methodik-Prosa, Kontakt, Datenquellen,
 * Änderungshistorie) sind bewusst NICHT hier — nur die strukturellen
 * Chart-/Rechner-Labels als Beweis, dass die Architektur trägt.
 */

export type DisplayMode = "niveau" | "rate";

export const de = {
  chart: {
    /** Dataset-/Linien-Labels (Legende + Tooltip-Matching). */
    datasets: {
      lik: "Offizielle Inflation (LIK)",
      trueflation: "Trueflation (LIK + Prämienkorrektur)",
      m2: "Geldmengenausweitung (M2)",
      leitzins: "SNB-Leitzins",
    },
    /** Overlay-Linien (Requirements 2.5) — Keyed nach OverlayConfig.messageKey. */
    overlays: {
      labels: {
        btc: "Bitcoin (CHF)",
        gold: "Gold (CHF, abgeleitet)",
      },
      /** Kategorie-Beschriftungen der Overlay-Toolbar-Gruppen. */
      categories: {
        "wertaufbewahrung": "Wertaufbewahrung/Rendite, keine Inflationsmessung",
        "trueflation-variante": "Trueflation-Variante, alternative Berechnung",
      },
      tooltips: {
        btc: (v: number, displayMode: DisplayMode): string[] => [
          displayMode === "rate"
            ? `Bitcoin: ${v.toFixed(2)}%/Jahr (Jahreswachstumsrate, Quelle: Twelve Data/Kraken)`
            : `Bitcoin: ${v.toFixed(1)} (indexiert, Quelle: Twelve Data/Kraken)`,
          "Marktdaten, keine amtliche Quelle — Wertaufbewahrung/Rendite, keine Inflationsmessung.",
        ],
        gold: (v: number, displayMode: DisplayMode): string[] => [
          displayMode === "rate"
            ? `Gold: ${v.toFixed(2)}%/Jahr (Jahreswachstumsrate, ABGELEITET: XAU/USD × USD/CHF, Quelle: Twelve Data)`
            : `Gold: ${v.toFixed(1)} (indexiert, ABGELEITET: XAU/USD × USD/CHF, Quelle: Twelve Data)`,
          "Keine direkte/amtliche CHF-Notierung verfügbar — abgeleitete Grösse, siehe Methodik. Marktdaten, keine Inflationsmessung.",
        ],
      },
    },
    /** Zeitraum-Presets (US 3.4) — Keyed nach PresetKey. */
    presets: {
      "since-2010": "Seit 2010",
      "since-1975": "Seit 1975",
      "max": "Maximum ab 1914",
    },
    /** Umschalter Darstellungsart (US 3.4 AC). */
    displayModes: {
      niveau: "Indexierte Niveaus",
      rate: "Jahreswachstumsraten",
    },
    toolbar: {
      resetZoom: "Zoom zurücksetzen",
      downloadImage: "Bild herunterladen",
      groupLabelTimeframe: "Zeitraum wählen",
      groupLabelDisplayMode: "Darstellungsart wählen",
      leitzinsToggle: "SNB-Leitzins ein-/ausblenden",
      overlayToggle: (label: string): string => `Overlay ${label} ein-/ausblenden`,
      overlayCategoryGroup: (categoryLabel: string): string => `Referenz-Overlays (${categoryLabel})`,
    },
    axes: {
      yNiveau: "Index (indexierte Niveaus)",
      yRate: "Jahreswachstumsrate (%)",
      leitzins: "Leitzins (%)",
    },
    loading: "Lade Daten…",
    pngExport: {
      footer: "Quelle: trueflation.ch — CC BY 4.0 (Namensnennung erforderlich)",
      fileNamePrefix: "trueflation-chart",
    },
    /** Tooltip-Texte der Kernlinien (Chart.js label-Callback). */
    tooltips: {
      leitzins: (v: number): string =>
        `SNB-Leitzins: ${v.toFixed(2)}% (Quelle: SNB, historisch UG0/aktuell LZ)`,
      trueflation: (v: number, displayMode: DisplayMode, rentCorrectionApplied: boolean): string => {
        const correction = `LIK + Prämienkorrektur${rentCorrectionApplied ? " + Miet-Korrektur" : ""} — siehe Methodik`;
        return displayMode === "rate"
          ? `Trueflation: ${v.toFixed(2)}%/Jahr (${correction})`
          : `Trueflation: ${v.toFixed(1)} (${correction})`;
      },
      m2: (v: number, displayMode: DisplayMode): string[] => [
        displayMode === "rate"
          ? `Geldmenge M2: ${v.toFixed(2)}%/Jahr (Quelle: SNB)`
          : `Geldmenge M2: ${v.toFixed(1)} (indexiert, Quelle: SNB)`,
        "Misst Verwässerung der Geldmenge, NICHT Preisentwicklung — keine direkte Vergleichsgrösse zu LIK/Trueflation.",
      ],
      lik: (v: number, displayMode: DisplayMode): string =>
        displayMode === "rate"
          ? `LIK: ${v.toFixed(2)}%/Jahr (Quelle: BFS, Basis: Ewige Reihe)`
          : `LIK: ${v.toFixed(1)} (Quelle: BFS, Basis: Ewige Reihe)`,
    },
  },

  rechner: {
    title: "Kaufkraft-Rechner",
    intro:
      "Was ist ein Betrag von damals heute noch wert — nach offizieller Inflation und nach Trueflation?",
    amountLabel: "Betrag (CHF)",
    amountAriaLabel: "Betrag in Schweizer Franken",
    yearLabel: "Startjahr",
    yearAriaLabel: "Startjahr auswählen",
    shareButton: "Ergebnis-Link teilen",
    shareButtonCopied: "Link kopiert ✓",
    shareButtonAriaLabel: "Rechner-Ergebnis-Link kopieren",
    modes: {
      groupLabel: "Darstellungsart wählen",
      niveau: "Betrag (Niveau)",
      rate: "Jahresrate",
    },
    loading: "Daten werden geladen…",
    /** Ergebniszeilen — betragFormatted kommt bereits via formatCurrency formatiert herein. */
    results: {
      lik: (betragFormatted: string, jahr: number): string =>
        `${betragFormatted} aus ${jahr} entsprechen heute (nach LIK)`,
      trueflation: (betragFormatted: string, jahr: number): string =>
        `${betragFormatted} aus ${jahr} entsprechen heute (nach Trueflation)`,
      comparisonIntro: (betragFormatted: string, jahr: number): string =>
        `Zum Vergleich: ${betragFormatted} aus ${jahr}, stattdessen gehalten in…`,
      goldLabel: "Gold:",
      bitcoinLabel: "Bitcoin:",
      availableFrom: (year: number): string => `verfügbar erst ab ${year}`,
      notAvailable: "nicht verfügbar",
      rateSuffix: (rateFormatted: string, jahr: number): string =>
        `${rateFormatted} im Schnitt seit ${jahr}`,
    },
  },

  /** Methodik-Mini-Chart (Requirements 2.2d). */
  mietkorrekturMini: {
    datasets: {
      proxy: "Neubezug-Proxy",
      longestTenure: "Längste Bezugsdauer (21J+)",
    },
    yAxisTitle: "Index (2020 = 100)",
  },
} as const;

/** Struktur-Typ: eine v2-Sprachdatei muss exakt diese Form erfüllen. */
export type Messages = typeof de;
