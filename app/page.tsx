import JahresratenTabelle from "./components/JahresratenTabelle";
import KernzahlenKacheln from "./components/KernzahlenKacheln";
import LikChart from "./components/LikChartLoader";
import KaufkraftRechner from "./components/KaufkraftRechnerLoader";
import Logo from "./components/Logo";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-4xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">
            <Logo />
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Offizielle Inflation und Trueflation (LIK, ab 2020 miet-korrigiert, + Prämienkorrektur)
            für die Schweiz — transparent gegenübergestellt. Geldmengenausweitung (M2) und
            SNB-Leitzins sind im Chart als optionale Linien zuschaltbar (Standard: aus).
          </p>
        </header>

        {/* US 3.1: Kopfzahlen der Seite — kumulierte Teuerung LIK vs.
            Trueflation seit 2010, gleiche Datenquelle und zentrale Rundung
            wie die Jahresraten-Tabelle unten (AC-T4.2 per Konstruktion). */}
        <KernzahlenKacheln />

        {/* Definitionsblock (US 4.4, Requirements Abschnitt 10): sachlich-neutral,
            ohne Prosa, laienverstaendlich -- VOR dem Chart, da der Chart der Beleg
            ist, nicht die erste Botschaft (US 3.1). Zwei Textebenen: fachliche
            Positionierung ("Was ist Trueflation?") + greifbarer Erklaersatz
            (Haushaltssicht) -- kein Widerspruch, zwei Ebenen fuer unterschiedliche
            Leser. */}
        <section aria-labelledby="was-ist-trueflation-heading" className="flex flex-col gap-2">
          <h2 id="was-ist-trueflation-heading" className="text-base font-medium">
            Was ist Trueflation?
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Trueflation ist eine alternative Teuerungsberechnung für die Schweiz auf Basis amtlicher
            Daten. Sie ergänzt den offiziellen Landesindex der Konsumentenpreise (LIK) um zwei
            Kostenblöcke, die real anfallen, aber in der Standardberechnung anders gewichtet sind:
            Krankenkassenprämien und die tatsächliche Mietentwicklung bei Neuvermietungen. Trueflation
            bildet damit die messbare Lücke ab, nicht die gefühlte — anders als etwa der
            Comparis/KOF-Index der &quot;gefühlten Inflation&quot;, der in die entgegengesetzte Richtung rechnet
            (siehe <a href="/methodik" className="underline">Methodik</a> für die Abgrenzung).
          </p>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Konkret gefragt: Wie stark steigen die Lebenshaltungskosten wirklich, wenn Krankenkasse
            und reale Mieten mitgerechnet werden? Der offizielle LIK beantwortet diese Frage nur
            teilweise — Trueflation rechnet beides ein.
          </p>
        </section>

        {/* Kaufkraft-Rechner (US 3.8) prominent auf der Startseite — "emotionalstes,
            teilbarstes Feature", gehört in die erste Interaktionsebene, nicht als
            separater, weggeklickter Screen. */}
        <KaufkraftRechner />

        <LikChart />

        {/* REQ-T1: Jahresraten-Tabelle direkt unter dem Chart "LIK vs.
            Trueflation" — tabellarische Entsprechung, Referenz statt
            Rechner. Unabhängig von den Rechner-Inputs (AC-T1.4). */}
        <JahresratenTabelle />

        <nav className="flex gap-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <a href="/methodik" className="underline">
            Methodik
          </a>
          <a href="/datenquellen" className="underline">
            Datenquellen
          </a>
          <a href="/kontakt" className="underline">
            Kontakt
          </a>
          {/* Disclaimer-Link (Requirements Abschnitt 6, Screen 1: "Disclaimer-Link"
              als fester Bestandteil der Startseite) -- war bisher nicht verlinkt,
              da die Seite selbst fehlte. */}
          <a href="/ueber" className="underline">
            Über / Disclaimer
          </a>
        </nav>
      </main>

      <footer className="mt-12 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
        <p>
          trueflation.ch — eigene Inhalte lizenziert unter{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/deed.de" className="underline">
            CC BY 4.0
          </a>
          . Amtliche Quelldaten unterliegen eigenen Lizenzbedingungen (siehe{" "}
          <a href="/datenquellen" className="underline">
            Datenquellen
          </a>
          ).
        </p>
      </footer>
    </div>
  );
}
