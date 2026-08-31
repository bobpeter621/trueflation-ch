/**
 * trueflation.ch — Impressum & Datenschutz (Screen 7, US 5.7)
 *
 * Platzhalter [KONTAKT-EMAIL]/[PSEUDONYM/PROJEKTNAME] bewusst NICHT befüllt
 * (Requirements Regel 7) — Betreiber-TODO vor Launch. Pseudonym-Betrieb ist
 * laut Requirements ein rechtlicher Graubereich und braucht eine kurze
 * anwaltliche Prüfung vor Launch (separates Betreiber-TODO, nicht Teil
 * dieses Contents).
 */

export const impressum = {
  heading: "Impressum & Datenschutz",

  impressumHeading: "Impressum",
  impressumIntro:
    "Angaben gemäss Art. 3 lit. s revDSG (Verantwortlicher und Kontaktmöglichkeit):",
  operatorLabel: "Verantwortlich für den Inhalt:",
  operatorPlaceholder: "[PSEUDONYM/PROJEKTNAME]",
  contactLabel: "Kontakt:",
  contactPlaceholder: "[KONTAKT-EMAIL]",
  pseudonymNote:
    "trueflation.ch wird unter einem Pseudonym betrieben. Die Kontakt-E-Mail oben ist der " +
    "verbindliche Weg, den Betreiber zu erreichen.",

  datenschutzHeading: "Datenschutzerklärung",
  datenschutzIntro:
    "trueflation.ch verarbeitet bewusst so wenig Daten wie möglich — es gibt kein Login, kein " +
    "Benutzerkonto und keine Formulare, die personenbezogene Daten entgegennehmen (Ausnahme: " +
    "eine freiwillige E-Mail an die Kontaktadresse).",
  analyticsHeading: "Reichweitenmessung",
  analyticsText:
    "Für die Reichweitenmessung wird eine self-hosted, cookiefreie Analytics-Lösung eingesetzt " +
    "(z.B. Plausible oder Umami), die ausschliesslich aggregierte, anonyme Zugriffszahlen erfasst " +
    "— keine IP-Adressen im Klartext, keine Cookies, kein Consent-Banner nötig, da keine " +
    "personenbezogenen Daten verarbeitet werden. Die Messung dient einzig der Frage, ob das " +
    "Projekt genutzt wird, nicht der Identifikation einzelner Besucher.",
  serverLogsHeading: "Server-/Hosting-Logs",
  serverLogsText:
    "Die Auslieferung der Seite erfolgt statisch über ein Content Delivery Network (CDN). " +
    "Technisch bedingte Zugriffslogs (z.B. IP-Adresse, Zeitstempel) können dabei kurzzeitig beim " +
    "Hosting-/CDN-Anbieter anfallen — sie werden nicht ausgewertet und dienen ausschliesslich der " +
    "Betriebssicherheit.",
  noThirdPartyHeading: "Keine Weitergabe an Dritte",
  noThirdPartyText:
    "Es findet keine Weitergabe von Daten an Dritte zu Werbe- oder Marketingzwecken statt. " +
    "trueflation.ch finanziert sich nicht über Werbung oder den Verkauf von Nutzerdaten.",
} as const;
