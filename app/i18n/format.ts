/**
 * trueflation.ch — Locale-abhängige Formatierung (US 4.x Grundgerüst)
 *
 * Zahlen-/Währungs-/Prozent-Formatierung als Funktion der Sprache — kein
 * hartcodiertes `Intl.NumberFormat("de-CH", ...)` mehr in Komponenten.
 * v2 (FR/IT/EN) ergänzt nur die Tabelle INTL_TAGS; Aufrufer bleiben
 * unverändert.
 */

import { DEFAULT_LOCALE, type Locale } from "./config";

/** BCP-47-Tag pro Locale. "de" ist bewusst "de-CH" (Schweizer
 *  Formatierungskonvention: CHF 1'000, Apostroph als Tausendertrennzeichen).
 *  v2: "fr" -> "fr-CH", "it" -> "it-CH", "en" -> "en-CH" o.ä. — eine Zeile
 *  pro Sprache, keine Komponenten-Änderung. */
const INTL_TAGS: Record<Locale, string> = {
  de: "de-CH",
};

export function localeToIntlTag(locale: Locale): string {
  return INTL_TAGS[locale];
}

/** CHF-Beträge ohne Rappen (Verhalten identisch zur früheren lokalen
 *  formatChf-Funktion in KaufkraftRechner.tsx). */
export function formatCurrency(value: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(localeToIntlTag(locale), {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeToIntlTag(locale), options).format(value);
}

export function formatPercent(
  value: number,
  locale: Locale = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(localeToIntlTag(locale), {
    style: "percent",
    ...options,
  }).format(value);
}
