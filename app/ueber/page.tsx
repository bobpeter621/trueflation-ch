/**
 * trueflation.ch — Über/Disclaimer-Seite (US 4.2, Requirements Abschnitt 6/7)
 *
 * Requirements Abschnitt 6, Screen 5: "Über/Disclaimer-Seite — Projektzweck,
 * Nicht-kommerziell-Hinweis, vollständiger Disclaimer". Bisher stand der
 * finale Disclaimer-Text nur in requirements.md (Abschnitt 7) — nirgends
 * live auf der Seite, obwohl US 4.2 "klar sichtbar" verlangt.
 */

export const metadata = {
  title: "Über / Disclaimer",
  description: "Projektzweck, Nicht-kommerziell-Hinweis und vollständiger Disclaimer.",
};

export default function UeberPage() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-2xl flex flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Über trueflation.ch</h1>
        </header>

        <section aria-labelledby="projektzweck-heading" className="flex flex-col gap-2">
          <h2 id="projektzweck-heading" className="text-base font-medium">
            Projektzweck
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            trueflation.ch stellt die offizielle Schweizer Teuerung (LIK) einer eigenen, transparent
            dokumentierten Berechnung gegenüber, die Krankenkassenprämien und die tatsächliche
            Mietentwicklung mit einbezieht. Ziel ist ein zusätzlicher, nachvollziehbarer Blickwinkel —
            nicht der Ersatz der amtlichen Statistik.
          </p>
        </section>

        <section aria-labelledby="nichtkommerziell-heading" className="flex flex-col gap-2">
          <h2 id="nichtkommerziell-heading" className="text-base font-medium">
            Nicht-kommerziell
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            trueflation.ch ist ein unabhängiges Community-Projekt ohne kommerzielle Absicht. Es gibt
            keine Werbung, kein Tracking von Einzelpersonen und keinen Verkauf von Daten. Eine
            aggregierte, cookiefreie Reichweitenmessung (ohne Personenbezug) ist vorgesehen, aber
            aktuell <strong>nicht</strong> im Einsatz.
          </p>
        </section>

        <section aria-labelledby="disclaimer-heading" className="flex flex-col gap-2">
          <h2 id="disclaimer-heading" className="text-base font-medium">
            Disclaimer
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            trueflation.ch ist ein unabhängiges, nicht-kommerzielles Community-Projekt. Die offiziellen
            Werte (LIK, SNB) werden unverändert aus amtlichen Quellen übernommen; der Trueflation-Index
            ist eine <strong>eigene Berechnung auf Basis amtlicher Daten</strong> und keine amtliche
            Zahl. Die individuelle Kostensituation kann erheblich abweichen. Aktualisierungsfrequenz
            und Datenstand unterscheiden sich je Kennzahl und sind pro Kennzahl transparent ausgewiesen.
            Diese Seite ersetzt keine offizielle Statistik (BFS, SNB) und keine Anlage- oder
            Finanzberatung. Keine Haftung für Richtigkeit, Vollständigkeit oder Aktualität der Angaben.
          </p>
        </section>

        {/* US 4.9 AC Platz 1: Lizenztext-Link auf der Über/Disclaimer-Seite.
            Gilt nur fuer eigene Inhalte — amtliche Quelldaten bleiben
            unberuehrt (Abgrenzung US 4.9). */}
        <section aria-labelledby="lizenz-heading" className="flex flex-col gap-2">
          <h2 id="lizenz-heading" className="text-base font-medium">
            Lizenz
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Eigene Inhalte von trueflation.ch (berechnete Werte, Grafiken, Feed-Daten) stehen unter{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/deed.de" className="underline">
              CC BY 4.0
            </a>{" "}
            — Namensnennung trueflation.ch, kommerzielle Nutzung erlaubt. Die zugrundeliegenden
            amtlichen Daten (BFS, SNB, BAG) und Marktdaten (Twelve Data, Bitstamp) unterliegen ihren
            eigenen Lizenzbedingungen — siehe{" "}
            <a href="/datenquellen" className="underline">
              Datenquellen
            </a>
            .
          </p>
        </section>

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
          <a href="/" className="underline">
            Startseite
          </a>
        </nav>
      </main>

      {/* US 4.9 AC Platz 2: CC-BY-Kurzhinweis im Footer jeder Seite — fehlte
          auf /ueber und /kontakt (Frontend-Review-Fund 06.09.2026). */}
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
