/**
 * trueflation.ch — Startseiten-Content: Hero (US 3.1) + Definitionsblock (US 4.4)
 *
 * Content-Layer analog zu locales/de.ts (i18n-Grundgerüst) — Prosa-Texte
 * waren beim initialen Refactoring bewusst ausgeklammert (siehe Scope-Notiz
 * dort), werden hier für v1 nachgezogen, weiterhin als reine Deutsch-Texte
 * ohne Locale-Parametrisierung (v2 würde eine analoge Datei unter einem
 * neuen Locale-Ordner anlegen).
 *
 * Tonalität (Betreiber-Vorgabe): fundiert, transparent, sachlich, einfach
 * erklärt. NICHT schreiben: "manipuliert", "geschönt", "versteckt", "die
 * wahre Wahrheit". Jede Abweichung vom LIK wird mit der zugrundeliegenden
 * BFS-Messentscheidung begründet, nicht als Fehler dargestellt.
 */

export const home = {
  hero: {
    /** US 3.1 AC: zwei Kernzahlen, kumulierter Kaufkraftverlust seit 2010,
     * nicht nur die aktuelle Jahresrate — eindrücklicher und teilbarer. */
    kicker: "Seit 2010",
    /** Werte werden dynamisch aus den Pipeline-Daten berechnet (siehe
     * app/page.tsx) und hier nur formatiert — keine Zahl im Content-Layer
     * hartcodiert. */
    officialLabel: "Offiziell (LIK)",
    trueflationLabel: "Trueflation",
    explainer: (likPercent: string, trueflationPercent: string): string =>
      `Der offizielle Index (LIK) misst die Teuerung seit 2010 mit ${likPercent} — schliesst die ` +
      `Krankenkassenprämien dabei bewusst aus (siehe unten, warum). Rechnet man sie ein, liegt die ` +
      `Teuerung bei ${trueflationPercent}.`,
    stichtagNote: (yearFrom: number, yearTo: number): string =>
      `Jahresdurchschnitt ${yearFrom}–${yearTo}, gleicher Stichtag für beide Werte.`,
  },

  /** US 4.4: sachlich-neutraler Definitionsblock, laienverständlich,
   * grenzt gegen verwandte Begriffe ab, damit keine Verwechslung entsteht. */
  definition: {
    heading: "Was ist Trueflation?",
    paragraphs: [
      "Der Landesindex der Konsumentenpreise (LIK) ist die amtliche Schweizer Inflationsmessung. " +
        "Er misst reine Preisveränderungen eines festgelegten Warenkorbs — methodisch sauber, aber " +
        "mit bewussten Auslassungen: Krankenkassenprämien gehören nicht dazu, weil sich bei ihnen " +
        "Preis- und Mengeneffekt nicht sauber trennen lassen (Details siehe Methodik).",
      "Trueflation rechnet diese Auslassung ein und zeigt, wie sich die Kaufkraft privater Haushalte " +
        "tatsächlich entwickelt, wenn man die Prämien mitzählt. Es ist eine eigene Berechnung auf " +
        "Basis amtlicher Daten — keine amtliche Zahl, keine Kritik am LIK, sondern eine Ergänzung " +
        "um eine real relevante Grösse, die der LIK aus guten methodischen Gründen nicht abbildet.",
      "Das unterscheidet Trueflation von der \"gefühlten Inflation\" (z.B. Comparis/KOF-Index): " +
        "jene misst eine Wahrnehmungsverzerrung, kein zusätzliches, objektiv messbares Ausgabenelement. " +
        "Trueflation bildet nur die messbare Lücke ab, nicht das subjektive Empfinden.",
    ],
  },

  /** Screen 1 (Requirements Abschnitt 6): Disclaimer-Link auf der Startseite. */
  disclaimerLink: {
    text: "Wichtige Hinweise zu diesem Projekt",
    href: "/ueber",
  },
} as const;
