import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

// US 3.18: gespeicherte Hell/Dunkel-Wahl VOR dem ersten Paint anwenden
// (Anti-FOUC) — liest ausschliesslich localStorage, kein Tracking, kein
// Server-Roundtrip. Ohne gespeicherte Wahl bleibt data-theme ungesetzt und
// die Systemeinstellung (prefers-color-scheme) gilt unveraendert.
const themeInitScript = `(function(){try{var t=localStorage.getItem("tf-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* US 3.18: sichtbarer Hell/Dunkel-Umschalter auf allen Seiten
            (fixed positioniert, siehe .tf-theme-toggle in globals.css) */}
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
