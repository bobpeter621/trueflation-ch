/**
 * trueflation.ch — i18n-Zugangspunkt (US 4.x Grundgerüst)
 *
 * Komponenten holen ihre Texte ausschliesslich über getMessages(locale) —
 * nie direkt aus einer Sprachdatei. v2 (FR/IT/EN): Sprachdatei unter
 * locales/ anlegen, Locale-Typ in config.ts erweitern, einen Eintrag in
 * MESSAGES ergänzen. Keine Komponenten-Änderung.
 */

import { DEFAULT_LOCALE, type Locale } from "./config";
import { de, type Messages } from "./locales/de";

const MESSAGES: Record<Locale, Messages> = {
  de,
};

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return MESSAGES[locale];
}

export { DEFAULT_LOCALE, type Locale, type Messages };
