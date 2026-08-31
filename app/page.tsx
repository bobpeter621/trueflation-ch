import LikChart from "./components/LikChartLoader";
import KaufkraftRechner from "./components/KaufkraftRechnerLoader";
import trueflationYearly from "../data/trueflation/trueflation-index-yearly.json";
import { home } from "./i18n/content/home";
import { formatPercent } from "./i18n/format";

export default function Home() {
  // US 3.1 AC: kumulierter Kaufkraftverlust seit Reihenbeginn statt nur der
  // aktuellen Jahresrate (eindrücklicher/teilbarer), Stichtag-normiert —
  // beide Kennzahlen aus derselben Quelle wie das Hauptchart, keine separate
  // Berechnung.
  const avgs = trueflationYearly.calendarYearAverages;
  const first = avgs[0];
  const last = avgs[avgs.length - 1];
  const likGrowth = last.likIndexAvg / first.likIndexAvg - 1;
  const trueflationGrowth = last.trueflationIndexAvg / first.trueflationIndexAvg - 1;

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

        {/* Hero (US 3.1) — Kernaussage vor jeder Interaktion, ohne dass der
            Chart interpretiert werden muss. */}
        <section
          aria-labelledby="hero-heading"
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-6)",
            backgroundColor: "var(--color-bg-elevated)",
          }}
        >
          {/* WCAG-AA-Fix (P5-Frontend-Review): Kicker und Stichtag-Note von
              --color-text-muted auf --color-text-secondary — muted erreicht auf
              --color-bg-elevated im Dark Mode nur 4.34:1 (< 4.5:1). Zeitraum-Angabe
              ist zudem inhaltlich wichtig, kein dekoratives Beiwerk. */}
          <p id="hero-heading" className="text-xs uppercase tracking-wide" style={{ color: "var(--color-text-secondary)" }}>
            {home.hero.kicker}
          </p>
          <div className="mt-2 flex flex-wrap gap-8">
            <div>
              {/* Label in --color-text-secondary statt Linienfarbe: #d1495b erreicht
                  auf weiss nur 4.36:1 (< 4.5:1 WCAG AA Normaltext). Farbkodierung
                  bleibt über die grosse Zahl erhalten (grosser Text, 3:1 erfüllt). */}
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{home.hero.officialLabel}</p>
              <p className="tf-numeric text-3xl font-semibold" style={{ color: "var(--color-line-lik)" }}>
                {formatPercent(likGrowth, undefined, { maximumFractionDigits: 1, signDisplay: "exceptZero" })}
              </p>
            </div>
            <div>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{home.hero.trueflationLabel}</p>
              <p className="tf-numeric text-3xl font-semibold" style={{ color: "var(--color-line-trueflation)" }}>
                {formatPercent(trueflationGrowth, undefined, { maximumFractionDigits: 1, signDisplay: "exceptZero" })}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {home.hero.explainer(
              formatPercent(likGrowth, undefined, { maximumFractionDigits: 2, signDisplay: "exceptZero" }),
              formatPercent(trueflationGrowth, undefined, { maximumFractionDigits: 2, signDisplay: "exceptZero" })
            )}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
            {home.hero.stichtagNote(first.year, last.year)}
          </p>
        </section>

        {/* Definitionsblock (US 4.4) — vor dem Chart, damit der Begriff steht,
            bevor die Grafik interpretiert werden muss. */}
        <section aria-labelledby="definition-heading">
          <h2 id="definition-heading" className="text-lg font-medium">
            {home.definition.heading}
          </h2>
          <div className="mt-2 flex flex-col gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {home.definition.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>

        {/* Kaufkraft-Rechner (US 3.8) prominent auf der Startseite — "emotionalstes,
            teilbarstes Feature", gehört in die erste Interaktionsebene, nicht als
            separater, weggeklickter Screen. */}
        <KaufkraftRechner />

        <LikChart />

        <nav className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          <a href="/methodik" className="underline">
            Methodik
          </a>
          <a href="/datenquellen" className="underline">
            Datenquellen
          </a>
          <a href="/aenderungen" className="underline">
            Änderungen
          </a>
          {/* Screen 1 (Requirements Abschnitt 6): Disclaimer-Link auf der Startseite. */}
          <a href={home.disclaimerLink.href} className="underline">
            {home.disclaimerLink.text}
          </a>
          <a href="/impressum" className="underline">
            Impressum &amp; Datenschutz
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
