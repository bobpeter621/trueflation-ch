/**
 * trueflation.ch — Kontakt / Fehlermeldung (US 4.11)
 *
 * Niedrigschwelliger Weg für vermutete Fehler oder methodische Rückfragen.
 * Platzhalter-E-Mail gemäss US 5.7 — Betreiber-TODO, nicht selbst befüllen
 * (Requirements Regel 7).
 */

export const metadata = {
  title: "Kontakt",
  description: "Fehler melden oder methodische Rückfrage stellen.",
};

export default function KontaktPage() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-2xl flex flex-col gap-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Kontakt</h1>
        </header>

        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Fehler gefunden? Methodische Rückfrage? Schreib an{" "}
          <a href="mailto:[KONTAKT-EMAIL]" className="underline">
            [KONTAKT-EMAIL]
          </a>
          . Berechtigte Korrekturen erscheinen in der{" "}
          <a href="/methodik#aenderungen-heading" className="underline">
            Änderungshistorie
          </a>
          .
        </p>

        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          trueflation.ch wird betrieben von [PSEUDONYM/PROJEKTNAME]. Angaben gemäss revDSG und
          Datenschutzerklärung:{" "}
          <a href="/impressum" className="underline">
            Impressum &amp; Datenschutz
          </a>
          .
        </p>
      </main>

      {/* US 4.9 AC Platz 2: CC-BY-Kurzhinweis im Footer jeder Seite. */}
      <footer className="mt-12 text-xs text-center" style={{ color: "var(--color-text-muted)" }}>
        <p>
          Eigene Inhalte lizenziert unter{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/deed.de" className="underline">
            CC BY 4.0
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
