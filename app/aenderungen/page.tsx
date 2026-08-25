/**
 * trueflation.ch — Änderungshistorie (US 4.10)
 *
 * P2-Grundgerüst: Struktur steht, Einträge werden ab jetzt bei jeder
 * relevanten Änderung ergänzt (Formel-Änderungen ab P3, Methodik-
 * Anpassungen, neue Datenquellen, korrigierte Werte aus Rollbacks).
 * Statischer Inhalt hier — kein Pipeline-generierter Content, da
 * Änderungshistorie von Menschen kuratiert wird (Requirements 7a:
 * Governance methodischer Änderungen entscheidet der Betreiber).
 */

export const metadata = {
  title: "Änderungshistorie — trueflation.ch",
  description: "Formel-Änderungen, Methodik-Anpassungen, neue Datenquellen und Korrekturen.",
};

const CHANGES = [
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
