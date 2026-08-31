import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";
import { DEFAULT_LOCALE } from "./i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://trueflation.ch"),
  title: {
    default: "trueflation.ch — alternative Teuerungsberechnung für die Schweiz",
    template: "%s — trueflation.ch",
  },
  description:
    "Offizielle Inflation (LIK) und Trueflation transparent gegenübergestellt — Krankenkassenprämien " +
    "und Mietkorrektur einbezogen, Formel und Quellen offen dokumentiert. Kaufkraft-Rechner für die " +
    "Schweiz.",
  // US 4.8: Suchbegriffe, wie Menschen tatsächlich suchen, bewusst getrennt von der Selbstbeschreibung
  // auf der Seite ("alternative Teuerungsberechnung", nicht "die wahre Inflation") — Meta-Keywords
  // ≠ Positionierung.
  keywords: ["wahre Inflation Schweiz", "echte Teuerung", "Kaufkraft CHF", "Landesindex Konsumentenpreise", "LIK"],
  openGraph: {
    type: "website",
    locale: "de_CH",
    siteName: "trueflation.ch",
    title: "trueflation.ch — alternative Teuerungsberechnung für die Schweiz",
    description: "Offizielle Inflation vs. Trueflation, transparent gegenübergestellt.",
  },
  twitter: {
    card: "summary_large_image",
    title: "trueflation.ch — alternative Teuerungsberechnung für die Schweiz",
    description: "Offizielle Inflation vs. Trueflation, transparent gegenübergestellt.",
  },
  alternates: {
    canonical: "/",
  },
};

// US 3.18 (Hell/Dunkel-Umschalter): dieses Inline-Script läuft SYNCHRON im
// <head>, VOR dem ersten sichtbaren Paint und vor der React-Hydration — nur
// so gibt es kein Farb-Flackern (FOUC) beim Seitenaufruf, wenn ein Besucher
// zuvor manuell umgeschaltet hat. Es macht bewusst NUR eines: eine
// gespeicherte Wahl als data-theme-Attribut auf <html> setzen. Keine
// gespeicherte Wahl -> Attribut bleibt UNGESETZT, damit die
// prefers-color-scheme-Media-Query (tokens.css) der Systemeinstellung folgt
// und eine spätere System-Änderung weiterhin durchgreift (Requirement:
// "Standard folgt der Systemeinstellung"). Rein lokal (localStorage), kein
// Tracking, kein Server-Roundtrip.
//
// FOUC-Analyse gilt fuer die AKTUELLE Next.js-Rendering-Strategie (Betreiber-
// Notiz 30.08.2026): das Script steht im <head>, render-blocking, VOR dem
// ersten Paint des <body> — in keiner Auslieferungsreihenfolge kann eine
// falsche Theme-Farbe sichtbar aufblitzen, empirisch bestaetigt (Review,
// toggle-fouc-first-paint.png). Bei einem KUENFTIGEN Wechsel auf Streaming-SSR
// (Next.js `loading.tsx`/Suspense-Boundaries mit fruehem Teil-Flush) ist diese
// Annahme NEU zu pruefen — ein fruehzeitig gestreamter Teil-Body koennte vor
// diesem Head-Script sichtbar werden. Kein aktueller Handlungsbedarf, nur
// Wachsamkeitsnotiz fuer eine kuenftige Architekturaenderung.
const themeInitScript = `(function(){try{var t=localStorage.getItem('tf-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      // WCAG 3.1.1 (Betreiber-Fund 30.08.2026, im Zuge des Theme-Toggle-Reviews):
      // Seiteninhalt ist Deutsch, lang="en" liess Screenreader ihn mit
      // englischer Aussprache vorlesen. i18n-Grundgerüst (US 4.x, 30.08.2026):
      // der Wert kommt jetzt aus dem Content-Layer (DEFAULT_LOCALE), nicht
      // mehr hartcodiert — bei FR/IT/EN in v2 folgt er der aktiven Sprache.
      lang={DEFAULT_LOCALE}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Das Inline-Script setzt data-theme vor der Hydration — das Attribut
      // weicht dadurch bewusst vom Server-HTML ab (kein Fehler).
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
