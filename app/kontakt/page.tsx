/**
 * trueflation.ch — Kontakt / Fehlermeldung (US 4.11)
 *
 * Niedrigschwelliger Weg für vermutete Fehler oder methodische Rückfragen.
 * Platzhalter-E-Mail gemäss US 5.7 — Betreiber-TODO, nicht selbst befüllen
 * (Requirements Regel 7).
 */

export const metadata = {
  title: "Kontakt — trueflation.ch",
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
          <a href="/aenderungen" className="underline">
            Änderungshistorie
          </a>
          .
        </p>

        <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Rechtliche Angaben: siehe{" "}
          <a href="/impressum" className="underline">
            Impressum &amp; Datenschutz
          </a>
          . Projekthintergrund und Disclaimer: siehe{" "}
          <a href="/ueber" className="underline">
            Über trueflation.ch
          </a>
          .
        </p>

        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          trueflation.ch wird betrieben von [PSEUDONYM/PROJEKTNAME].
        </p>
      </main>
    </div>
  );
}
