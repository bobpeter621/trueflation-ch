/**
 * trueflation.ch — Änderungshistorie (US 4.10)
 *
 * Content-Stand 30.08.2026: Einträge bis P5 nachgetragen (vorher endete
 * die Liste bei P2). Statischer Inhalt — kein Pipeline-generierter Content,
 * da Änderungshistorie von Menschen kuratiert wird (Requirements 7a:
 * Governance methodischer Änderungen entscheidet der Betreiber).
 */

export const metadata = {
  title: "Änderungshistorie — trueflation.ch",
  description: "Formel-Änderungen, Methodik-Anpassungen, neue Datenquellen und Korrekturen.",
};

const CHANGES = [
  {
    date: "2026-08-30",
    title: "Hell/Dunkel-Umschalter, Methodik-Seite ausformuliert (P5)",
    detail:
      "Manueller Hell/Dunkel-Umschalter ergänzt (vorher nur Systemeinstellung). Methodik-Seite um die Erklärung der Prämien-Wirkung und ein separates Mini-Chart zur Miet-Korrektur erweitert.",
  },
  {
    date: "2026-08-29",
    title: "Miet-Korrektur in die Trueflation-Hauptlinie integriert (P4)",
    detail:
      "Ab Januar 2020 (Beginn der verfügbaren Datengrundlage) wird die LIK-Komponente zusätzlich um die Differenz zwischen Neubezugs- und Bestandsmieten korrigiert (Variante Bevölkerungsanteil, +0,0608 Prozentpunkte/Jahr). Der offizielle LIK-Wert bleibt davon unberührt. Kernzahl seither: LIK 5,51 % / Trueflation 9,93 % Jahresdurchschnitt 2010–2024 (vorher 9,66 %). Details siehe Methodik.",
  },
  {
    date: "2026-08-28",
    title: "Referenz-Overlays Gold und Bitcoin hinzugefügt (P4)",
    detail:
      "Optional zuschaltbare Vergleichslinien (Twelve Data) im Chart und Kaufkraft-Rechner — Marktdaten, keine Inflationsmessung. Ein ursprünglich geplantes SMI-Overlay entfällt (auf dem genutzten Datenanbieter nicht verfügbar).",
  },
  {
    date: "2026-08-27",
    title: "Trueflation-Berechnung live geschaltet (P3)",
    detail:
      "Die Trueflation-Linie (LIK + Kranken­kassenprämien-Korrektur) ist ab jetzt Teil des Hauptcharts, mit eigener Methodik-Seite (Formel, Quellen, bekannte Grenzen). Reihe beginnt 2010 (früheste verfügbare Datengrundlage).",
  },
  {
    date: "2026-08-26",
    title: "SNB-Leitzins als Overlay hinzugefügt (P2)",
    detail:
      "Der SNB-Leitzins läuft als eigene, optional zuschaltbare Linie auf einer separaten Skala (Prozentwert, nicht indexiert) — unabhängig vom Umschalter Niveau/Rate.",
  },
  {
    date: "2026-08-25",
    title: "SNB M2 als zweite Datenquelle hinzugefügt (P2)",
    detail:
      "Geldmengenaggregat M2 (SNB Cube snbmonagg, Dimension GM2) läuft ab jetzt über dieselbe Pipeline-Architektur wie der LIK.",
  },
  {
    date: "2026-08-25",
    title: "LIK-Quelle verifiziert (P1)",
    detail:
      "Der Landesindex der Konsumentenpreise wird aus der BFS-Fachapplikation lik-app.bfs.admin.ch bezogen (Basis: die vom BFS verkettete Gesamtreihe), nicht aus STAT-TAB/PxWeb oder Swiss Stats Explorer — beide enthalten den LIK (noch) nicht.",
  },
];

export default function AenderungenPage() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-3xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Was hat sich geändert?</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Formel-Änderungen, Methodik-Anpassungen, neue Datenquellen und Korrekturen — keine stillen
            Anpassungen.
          </p>
        </header>

        <ol className="flex flex-col gap-6">
          {CHANGES.map((c) => (
            <li key={c.date + c.title} className="border-l-2 pl-4" style={{ borderColor: "var(--color-line-lik)" }}>
              <time className="text-xs tf-numeric" style={{ color: "var(--color-text-muted)" }}>
                {c.date}
              </time>
              <h2 className="text-base font-medium mt-1">{c.title}</h2>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                {c.detail}
              </p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
