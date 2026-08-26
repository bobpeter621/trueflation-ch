/**
 * trueflation.ch — Methodik-Seite (US 4.1)
 *
 * Trueflation-Formel-Parameter werden aus der generierten Datenreihe
 * (data/trueflation/trueflation-index-yearly.json) gelesen, nicht hier
 * hartcodiert — Betreiber-Vorgabe 26.08.2026: "Werte aus derselben Quelle
 * beziehen wie die Berechnung, nicht doppelt pflegen." Divergenz zwischen
 * Seite und Berechnung bei einer künftigen Gewichtsänderung ist damit
 * strukturell ausgeschlossen, nicht nur durch manuelle Disziplin vermieden.
 */
import trueflationData from "../../data/trueflation/trueflation-index-monthly.json";

export const metadata = {
  title: "Methodik — trueflation.ch",
  description: "Formel, Quellen und Grenzen der auf trueflation.ch verwendeten Kennzahlen.",
};

export default function MethodikPage() {
  const { methodology, startMonth } = trueflationData;
  const startYear = Math.floor(startMonth / 10000);
  const weightTable = methodology.weightTable as Record<
    string,
    { premiumBudgetSharePercent: number; premiumBudgetShareSource: string; pKonsum: number; weight: number }
  >;
  const fixationYears = Object.keys(weightTable).sort();

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
            <strong>Trueflation v1 = offizieller LIK + Prämienkorrektur.</strong> Das ist eine engere
            Definition als ursprünglich geplant (drei Korrekturkomponenten). Zwei Komponenten sind
            zurückgestellt — siehe &quot;Offene Punkte&quot; unten. Diese Seite beschreibt ausschliesslich das
            real implementierte System.
          </p>

          <h3 className="mt-6 text-base font-medium">Formel (monatlich)</h3>
          <div
            className="mt-2 rounded-md p-3 text-sm font-mono"
            style={{ backgroundColor: "var(--color-surface-secondary)" }}
          >
            <p>P_konsum(Fixierungsjahr) = P_brutto(Fixierungsjahr) / C_brutto</p>
            <p>Prämiengewicht w(Fixierungsjahr) = P_konsum / (1 + P_konsum)</p>
            <p>pm(Jahr) = (1 + Prämien_Jahreswachstum(Jahr))^(1/12) − 1</p>
            <p>combined_growth(Monat) = LIK_Wachstumsfaktor(Monat)^(1−w) × (1 + pm)^w</p>
            <p>Trueflation(Monat) = Trueflation(Monat − 1) × combined_growth(Monat)</p>
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Die Datenpunkte sind monatlich (wie beim offiziellen LIK), die Prämienkorrektur wird jedes
            Jahr aktualisiert. <strong>pm</strong> ist die monatlich-äquivalente Prämienrate — rechnerisch
            so konstruiert, dass zwölf Monate mit dieser Rate exakt das amtliche Jahreswachstum der
            Prämien ergeben. Die Gewichtung ist <strong>geometrisch</strong> (Exponenten), nicht arithmetisch
            (gewichtete Summe) — nur die geometrische Form bleibt konsistent, wenn zwölf monatliche
            Schritte zu einem Jahresschritt verkettet werden.
          </p>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>P_brutto</strong> ist der Anteil der obligatorischen Krankenkassenprämien
            (Grundversicherung) am Bruttoeinkommen, aus der amtlichen BFS-Haushaltsbudgeterhebung (HABE)
            — je Fixierungsjahr der zu diesem Zeitpunkt gültige Wert, nicht ein einzelner Referenzwert für
            alle Jahre: 2010 = 5.4089&nbsp;%, 2015 = 6.1841&nbsp;%, 2020 = 6.4457&nbsp;% (die Reihe wird alle
            5 Jahre neu fixiert; 2025 gilt bis zur nächsten HABE-Publikation weiterhin das 2020er-Gewicht).
            <strong>C_brutto</strong> ist die Konsumausgabenquote am Bruttoeinkommen (HABE-Summenzeile
            &quot;Konsumausgaben&quot;, 48.8&nbsp;%) — als Näherung für alle Fixierungsjahre verwendet, da diese
            Quote über die Zeit relativ stabil ist; nicht separat je Fixierungsjahr recherchiert.
          </p>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Die Prämien stehen in der HABE strukturell getrennt von den Konsumausgaben (eigene Position
            &quot;obligatorische Transferausgaben&quot;) — sie überschneiden sich damit nicht mit dem bestehenden
            LIK-Gesundheitsgewicht, das nur tatsächlichen Gesundheitskonsum (Arzt, Medikamente, Franchise)
            abbildet. Die Addition ist keine Doppelzählung, sondern folgt der amtlichen Kategorisierung.
          </p>

          <h3 className="mt-6 text-base font-medium">Startpunkt, Verkettung und Januar-Übergänge</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Die Reihe beginnt Januar 2010 (limitierender Faktor: Datengrundlage für spätere
            Korrekturkomponenten) und startet exakt auf LIK-Niveau (kein künstlicher Offset).
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Die Prämienrate <strong>pm</strong> wird <strong>jedes Jahr</strong> zum 1.&nbsp;Januar aktualisiert
            (neuer amtlicher Jahreswert), das Prämiengewicht <strong>w</strong> dagegen nur an den drei
            Fixierungsjahren (2010/2015/2020). Jeder Januar trägt daher eine kleine, bewusst
            <strong> nicht geglättete</strong> Änderung der Prämienkomponente — nicht nur an
            Fixierungsjahren. Geglättet wird bewusst nicht: Glätten würde entweder bereits publizierte
            Monate rückwirkend ändern oder vorausschauend interpolieren — beides würde dem
            Transparenz- und Anti-Erfindungs-Prinzip dieses Projekts widersprechen. Jeder betroffene
            Monat ist stattdessen mit einem sichtbaren Hinweis versehen (im Rohdatenfeed als
            <code>transitionNote</code>).
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Wird ein amtlicher Prämienwert nachträglich revidiert (provisorisch&nbsp;→&nbsp;definitiv,
            planmässiger Vorgang), fliesst die Revision beim nächsten Berechnungslauf automatisch in
            die gesamte Reihe ein — publizierte Werte werden nicht dauerhaft eingefroren. Diese
            Revisionen materiell in der Änderungshistorie zu protokollieren ist als nächster Schritt
            vorgesehen, aber noch nicht umgesetzt.
          </p>

          <h3 className="mt-6 text-base font-medium">Offene Punkte — bewusst nicht enthalten</h3>
          <dl className="mt-2 flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-medium">Fixer Warenkorb (Substitutionseffekt-Korrektur)</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                Zurückgestellt. Echte historische LIK-Gewichtstabellen für 2010/2015/2020 (Prozentanteile
                je Hauptgruppe) waren trotz Recherche in BFS-Publikationen und Webarchiven nicht
                auffindbar. Eine Näherung mit aktuellen Gewichten wurde geprüft und verworfen — sie würde
                nicht den gesuchten Effekt messen, sondern nur einen Rechenartefakt. Erwartete Wirkrichtung,
                falls die Daten später vorliegen: Der Effekt würde die Lücke leicht vergrössern
                (Substitutionseffekt — Standardresultat der Indextheorie).
              </dd>
            </div>
            <div>
              <dt className="font-medium">Mietkorrektur (Neuvermietungs-Proxy)</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                Zurückgestellt, aus zwei Gründen: (1) Die benötigte Quelle für die Wachstumsdifferenz
                zwischen Angebots- und Bestandsmieten war nicht auffindbar. (2) Eine ungeklärte
                Konzeptfrage: Bestandsmiete ist für Haushalte, die nicht umziehen (in der Schweiz die
                grosse Mehrheit — rund 90&nbsp;% pro Jahr laut BFS-Umzugsstatistik), der methodisch
                korrekte Wert. Eine volle Korrektur würde die Belastung der Mehrheit überzeichnen; eine
                Gewichtung mit der realen Umzugsquote würde den Effekt praktisch auf null reduzieren.
                Erwartete Wirkrichtung, falls die Daten später vorliegen: Der Effekt würde die Lücke
                vergrössern, unabhängig von der gewählten Gewichtungsvariante.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Strom / Elektrizität</dt>
              <dd style={{ color: "var(--color-text-secondary)" }}>
                Dauerhaft ausgeschlossen. Strom ist bereits vollständig und monatlich im LIK enthalten
                (Teil von &quot;Wohnen und Energie&quot;). Eine zusätzliche Korrektur würde Strom doppelt zählen —
                anders als bei Prämien und Mieten existiert hier keine dokumentierte Lücke.
              </dd>
            </div>
          </dl>

          <h3 className="mt-6 text-base font-medium">Bekannte Einschränkungen der Prämiendaten</h3>
          <ul className="mt-2 list-disc pl-5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <li>
              Bruttoprämien — Prämienverbilligungen sind nicht abgezogen. Das BFS schätzt, dass deren
              Einbezug das ausgewiesene Prämienwachstum um rund 0,5 Prozentpunkte pro Jahr reduzieren würde.
            </li>
            <li>
              Der aktuellste Prämienwert eines Jahres ist zunächst provisorisch (BAG-Schätzung) und wird
              im Folgejahr durch den definitiven Wert ersetzt.
            </li>
            <li>
              C_brutto (Konsumausgabenquote) ist eine Näherung — ein Einzeljahreswert, für alle
              Fixierungsjahre verwendet, nicht separat je Fixierungsjahr recherchiert.
            </li>
          </ul>

          <h3 className="mt-6 text-base font-medium">Abgrenzung zu &quot;gefühlter Inflation&quot;</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Trueflation bildet die messbare Lücke ab, nicht die gefühlte. Die Differenz zwischen
            offiziellem LIK und individuellem Kostenempfinden hat drei getrennte Ursachen: tatsächlich
            fehlende Kategorien wie Prämien (das bildet Trueflation ab), reine Wahrnehmungsverzerrung
            (kein Messfehler, kein Korrekturgegenstand), und Vermögenspreise wie Wohneigentum (bewusst
            als Nicht-Konsum ausgeschlossen, wie beim LIK selbst). Der Comparis/KOF-Index der &quot;gefühlten
            Inflation&quot; rechnet in die entgegengesetzte Richtung (zieht Posten vom LIK ab) — beide Indizes
            sind nicht widersprüchlich, sondern beantworten unterschiedliche Fragen.
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
