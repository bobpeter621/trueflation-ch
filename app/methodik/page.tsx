/**
 * trueflation.ch — Methodik-Seite (Epic 4 Grundgerüst, US 4.1)
 *
 * P2-Umfang: Grundgerüst mit echten, live geprüften Fakten zu den bisher
 * verifizierten Quellen (LIK, SNB M2). Ausführliche Formel-/Berechnungstexte
 * für Trueflation folgen erst in P3, sobald die Berechnung existiert
 * (Requirements Regel 8: Content erst, wenn das System real gebaut ist).
 */

export const metadata = {
  title: "Methodik — trueflation.ch",
  description: "Formel, Quellen und Grenzen der auf trueflation.ch verwendeten Kennzahlen.",
};

export default function MethodikPage() {
  return (
    <div className="flex flex-col min-h-screen items-center px-4 py-12 sm:px-8">
      <main className="w-full max-w-3xl flex flex-col gap-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Methodik</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Formel, Quellen und bekannte Grenzen jeder verwendeten Kennzahl. Trueflation-Formel folgt,
            sobald die Berechnung implementiert ist (P3).
          </p>
        </header>

        <section aria-labelledby="lik-heading">
          <h2 id="lik-heading" className="text-lg font-medium">
            Linie 1 — Offizielle Inflation (LIK)
          </h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div>
              <dt className="font-medium">Quelle</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                BFS Landesindex der Konsumentenpreise, Gesamtreihe (&quot;Ewige Reihe&quot;), verkettet vom
                Bundesamt für Statistik selbst.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Zeitraum</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>Juni 1914 bis laufend, monatlich.</dd>
            </div>
            <div>
              <dt className="font-medium">Berechnung</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                1:1 Übernahme des amtlichen Indexstands, keine eigene Neuberechnung.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Bekannte Grenzen</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                Der Datenendpunkt ist keine dokumentierte öffentliche API, sondern der interne
                Anwendungszustand einer BFS-Webapplikation. Zur Absicherung gleichen wir jeden neuen
                Monatswert automatisch gegen die separat publizierte BFS-Medienmitteilung ab
                (Drift-Erkennung).
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="geldmenge-heading">
          <h2 id="geldmenge-heading" className="text-lg font-medium">
            Linie 3 — Geldmengenausweitung (M2)
          </h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div>
              <dt className="font-medium">Quelle</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                SNB Datenportal, Cube &quot;snbmonagg&quot;, Dimension M2 (Bestand).
              </dd>
            </div>
            <div>
              <dt className="font-medium">Wichtige methodische Klarstellung</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                Geldmengenwachstum ist <strong>keine alternative Berechnung derselben Grösse</strong> wie
                LIK oder Trueflation. Es misst die Verwässerung der Geldmenge, nicht die
                Preisentwicklung — beide sind nach der Quantitätstheorie nur locker gekoppelt (Beispiel:
                Geldmengenwachstum nach 2008 bei gleichzeitig niedriger Konsumenteninflation).
              </dd>
            </div>
            <div>
              <dt className="font-medium">Frequenz</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>Monatlich.</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="trueflation-heading">
          <h2 id="trueflation-heading" className="text-lg font-medium">
            Linie 2 — Trueflation
          </h2>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Formel und Berechnungsweg werden hier veröffentlicht, sobald Epic 2 (Trueflation-Berechnung,
            P3) implementiert ist. Die Methodik ist bereits vollständig in den Projekt-Requirements
            spezifiziert — dieser Text beschreibt erst das real gebaute System, nicht das geplante.
          </p>
        </section>

        <footer className="mt-6 text-xs" style={{ color: "var(--color-text-muted)" }}>
          <p>
            Fehler gefunden oder methodische Rückfrage?{" "}
            <a href="/kontakt" className="underline">
              Kontakt
            </a>
            . Änderungen an dieser Methodik erscheinen in der{" "}
            <a href="/aenderungen" className="underline">
              Änderungshistorie
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}
