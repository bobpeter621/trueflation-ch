/**
 * trueflation.ch — i18n-Konfiguration (US 4.x Grundgerüst, 30.08.2026)
 *
 * v1-Scope: NUR Deutsch wird befüllt. FR/IT/EN sind explizit v2 und werden
 * hier NICHT implementiert — der Locale-Typ ist bewusst als Union mit einem
 * einzigen Mitglied deklariert, damit v2 nur erweitert werden muss
 * (`type Locale = "de" | "fr" | "it" | "en"`), ohne dass Aufrufer-Code
 * angefasst werden muss.
 *
 * Architektur-Vorgabe (Betreiber, 30.08.2026): Eine neue Sprache darf später
 * AUSSCHLIESSLICH durch eine neue Datei unter `locales/` plus einem Eintrag
 * in MESSAGES unten hinzugefügt werden — keine Komponenten-Änderung.
 */

// v2-Erweiterungspunkt: "fr" | "it" | "en" hier ergänzen, dann
// locales/fr.ts etc. anlegen und in MESSAGES (i18n/index.ts) eintragen.
export type Locale = "de";

export const DEFAULT_LOCALE: Locale = "de";
