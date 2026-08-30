import LikChart from "./components/LikChartLoader";
import KaufkraftRechner from "./components/KaufkraftRechnerLoader";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-4xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">trueflation.ch</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Offizielle Inflation und Trueflation (LIK, ab 2020 miet-korrigiert, + Prämienkorrektur)
            für die Schweiz — transparent gegenübergestellt. Geldmengenausweitung folgt als eigene
            Linie im Chart.
          </p>
        </header>

        {/* Kaufkraft-Rechner (US 3.8) prominent auf der Startseite — "emotionalstes,
            teilbarstes Feature", gehört in die erste Interaktionsebene, nicht als
            separater, weggeklickter Screen. */}
        <KaufkraftRechner />

        <LikChart />

        <nav className="flex gap-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <a href="/methodik" className="underline">
            Methodik
          </a>
          <a href="/datenquellen" className="underline">
            Datenquellen
          </a>
          <a href="/aenderungen" className="underline">
            Änderungen
          </a>
          <a href="/kontakt" className="underline">
            Kontakt
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
