/**
 * trueflation.ch — Methodik-Seite (US 4.1)
 *
 * Trueflation-Formel-Parameter werden aus der generierten Datenreihe
 * (data/trueflation/trueflation-index-yearly.json) gelesen, nicht hier
 * hartcodiert — Betreiber-Vorgabe 26.08.2026: "Werte aus derselben Quelle
 * beziehen wie die Berechnung, nicht doppelt pflegen." Divergenz zwischen
 * Seite und Berechnung bei einer künftigen Gewichtsänderung ist damit
 * strukturell ausgeschlossen, nicht nur durch manuelle Disziplin vermieden.
 *
 * Content-Stand 30.08.2026: Formel, alle drei Miet-Korrektur-Varianten und
 * die Prämien-Begründung ("Warum verdoppelt sich die Teuerung?") sind vollständig
 * ausformuliert. Falls hier je wieder ein Platzhalter-Hinweis auf einen
 * zukünftigen Implementierungsschritt steht: prüfen, ob er noch stimmt, bevor
 * er stehen bleibt — ein solcher Hinweis blieb hier zuvor ueber P3 hinaus
 * unkorrigiert stehen, obwohl die beschriebene Arbeit laengst erledigt war.
 */
import trueflationData from "../../data/trueflation/trueflation-index-monthly.json";
import MietkorrekturMiniChart from "../components/MietkorrekturMiniChart";

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
            Formel, Quellen und bekannte Grenzen jeder verwendeten Kennzahl.
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
            <strong>Trueflation v1 (final, 29.08.2026) = offizieller LIK (ab 2020 miet-korrigiert) +
            Prämienkorrektur.</strong> Der fixe Warenkorb wurde ebenfalls geprüft, aber bewusst nicht
            integriert — siehe &quot;Offene Punkte&quot; unten. Diese Seite beschreibt ausschliesslich das real
            implementierte System.
          </p>

          <h3 className="mt-6 text-base font-medium">Formel (monatlich)</h3>
          <div
            className="mt-2 rounded-md p-3 text-sm font-mono overflow-x-auto"
            style={{ backgroundColor: "var(--color-bg-subtle)" }}
          >
            <p className="whitespace-nowrap">rentMonthlyFactor = (1 + Miet-Korrektur_pp/Jahr / 100)^(1/12)&nbsp;&nbsp;[nur ab 2020]</p>
            <p className="whitespace-nowrap">LIK_korrigiert(Monat) = LIK_Wachstumsfaktor(Monat) × rentMonthlyFactor&nbsp;&nbsp;[nur ab 2020, sonst unverändert]</p>
            <p className="whitespace-nowrap">P_konsum(Fixierungsjahr) = P_brutto(Fixierungsjahr) / C_brutto</p>
            <p className="whitespace-nowrap">Prämiengewicht w(Fixierungsjahr) = P_konsum / (1 + P_konsum)</p>
            <p className="whitespace-nowrap">pm(Jahr) = (1 + Prämien_Jahreswachstum(Jahr))^(1/12) − 1</p>
            <p className="whitespace-nowrap">combined_growth(Monat) = LIK_korrigiert(Monat)^(1−w) × (1 + pm)^w</p>
            <p className="whitespace-nowrap">Trueflation(Monat) = Trueflation(Monat − 1) × combined_growth(Monat)</p>
          </div>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Reihenfolge ist verbindlich (nicht vertauschbar):</strong> erst wird die Preisreihe
            (LIK-Wachstumsfaktor) um die Miet-Korrektur bereinigt, <strong>danach</strong> greift die
            Prämien-Gewichtsformel. Die Miet-Korrektur wirkt <strong>ausschliesslich ab Januar 2020</strong>
            (Datengrundlage beginnt dort) — davor läuft die LIK-Komponente unverändert, der Bruch wird
            am Datenpunkt sichtbar gekennzeichnet, nicht rückwirkend geglättet. Sie verwendet die
            Variante &quot;Bevölkerungsanteil&quot;: gewichtet mit dem tatsächlichen Anteil der Neubezug-Klasse an
            der Bevölkerung (+0,0608 Prozentpunkte/Jahr) — nicht die volle Neubezugs-Variante (die
            unterstellen würde, alle wohnten zu Neuvermietungspreisen) und nicht die mit der
            Umzugsquote gewichtete Variante (die nur Jahresumzüge statt kumulierter Exposition erfasst).
          </p>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Die Datenpunkte sind monatlich (wie beim offiziellen LIK), die Prämienkorrektur wird jedes
            Jahr aktualisiert. <strong>pm</strong> ist die monatlich-äquivalente Prämienrate — rechnerisch
            so konstruiert, dass zwölf Monate mit dieser Rate exakt das amtliche Jahreswachstum der
            Prämien ergeben. Die Gewichtung ist <strong>geometrisch</strong> (Exponenten), nicht arithmetisch
            (gewichtete Summe) — nur die geometrische Form bleibt konsistent, wenn zwölf monatliche
            Schritte zu einem Jahresschritt verkettet werden.
          </p>
          <p className="mt-3 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Wichtig für die Interpretation der offiziellen LIK-Linie im Chart:</strong> Die
            Miet-Korrektur fliesst ausschliesslich in die Trueflation-Linie ein. Der ausgewiesene LIK-Wert
            und die ausgewiesene LIK-Wachstumsrate bleiben in jedem Monat identisch mit dem amtlichen
            BFS-Wert, unabhängig davon, ob die Miet-Korrektur für den betreffenden Zeitraum aktiv ist.
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

          <h3 className="mt-6 text-base font-medium">Warum verdoppelt sich die Teuerung fast?</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Die Krankenkassenprämien (Grundversicherung) machen rund 12&nbsp;% des Haushaltsbudgets aus und
            sind seit 2010 im Schnitt um rund 3&nbsp;% pro Jahr gestiegen — der offizielle LIK insgesamt nur
            um rund 0,4&nbsp;% pro Jahr. Ein Ausgabenposten mit deutlich höherem Wachstum und spürbarem
            Budgetanteil, der im offiziellen Index fehlt, erklärt den grössten Teil der Differenz zwischen
            LIK und Trueflation.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Warum schliesst das BFS die Prämien aus?</strong> Das ist eine bewusste Messentscheidung,
            kein Fehler: Der LIK misst reine <strong>Preisveränderungen</strong> bei gleichbleibender Menge
            und Qualität des Warenkorbs. Bei den Krankenkassenprämien lassen sich Preis- und
            Mengeneffekt nicht sauber trennen — eine Prämienerhöhung kann eine reine Preissteigerung sein,
            aber auch eine Folge veränderter Leistungsmenge (mehr Behandlungen, neue Medikamente,
            demografischer Wandel), die der LIK-Methodik zufolge nicht in einen reinen Preisindex gehört.
            Das BFS führt die Prämien deshalb konsequent als eigene Statistik, nicht im LIK. Trueflation
            übernimmt diese Prämienentwicklung trotzdem, weil sie für die tatsächliche Kaufkraft der
            privaten Haushalte real relevant ist — unabhängig davon, wie sauber sich Preis- und
            Mengeneffekt methodisch trennen liessen.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Bekannte Einschränkung:</strong> Die verwendeten Prämienwerte sind Bruttoprämien —
            individuelle Prämienverbilligungen (einkommensabhängige Vergünstigungen) sind nicht
            abgezogen. Das BFS schätzt, dass deren Einbezug das ausgewiesene Prämienwachstum um rund
            0,5&nbsp;Prozentpunkte pro Jahr reduzieren würde.
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
                Geprüft, als Befund dokumentiert, bewusst <strong>nicht</strong> integriert. Die aktuellsten
                amtlichen Gewichte (13 Hauptgruppen, Tabelle &quot;LIK-Warenkorb und Gewichte 2026&quot;) wurden
                rückwirkend 2010–2024 fixiert und gegen dieselbe 13er-Struktur verrechnet wie die
                verkettete Reihe. Gemessener Effekt: &minus;0,035 Prozentpunkte/Jahr — das Kriterium
                (Betrag &ge; 0,10&nbsp;pp/Jahr) wurde nicht erfüllt, obwohl die Datenabdeckung vollständig war
                (15 von 15 Jahren). Mit aktuellen Gewichten rückwärts gerechnet ist das methodisch eine
                Paasche-artige Konstruktion (nicht Laspeyres) — ein Index mit historischen
                Basisjahr-Gewichten würde tendenziell in die andere Richtung weisen; solche Gewichte sind
                für die aktuelle 13-Gruppen-Struktur aber nicht verfügbar.
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

          <h3 className="mt-6 text-base font-medium">Miet-Korrektur — integriert, mit Vorbehalt</h3>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Anders als der Warenkorb-Befund ist die Miet-Korrektur seit dem 29.08.2026 Teil der
            Hauptlinie (siehe Formel oben). Der LIK-Mietpreisindex misst Bestandsmieten (alle laufenden
            Mietverhältnisse, dominiert von langjährigen Mietern), waehrend Neuvermietungen am Markt
            deutlich staerker steigen — Trueflation korrigiert diese Luecke.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Drei Varianten, drei unterschiedliche Fragen:</strong>
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <li>
              <strong>+0,253&nbsp;pp/Jahr (volle Variante):</strong> „Was kostet ein Neubezug gegenüber
              Langzeitmiete?“ — vergleicht Neuvermietungen direkt mit der längsten Bezugsdauer-Klasse
              (21&nbsp;Jahre und mehr). Unterstellt implizit, ALLE würden zu Neuvermietungspreisen wohnen —
              das trifft real nicht zu, deshalb nicht die integrierte Grosse.
            </li>
            <li>
              <strong>+0,0608&nbsp;pp/Jahr (Bevölkerungsanteil, INTEGRIERT):</strong> gewichtet den vollen
              Effekt mit dem tatsächlichen Bevölkerungsanteil der Neubezug-Klasse (Ø 23,96&nbsp;% 2020–2024)
              — misst die tatsächliche, kumulierte Exposition der Bevölkerung gegenüber diesem Effekt, nicht
              eine hypothetische Vollexposition. Dieselbe Logik wie bei der Prämienkorrektur (tatsächliche
              statt hypothetische Exposition) — deshalb die konsistente Grösse für die Hauptlinie.
            </li>
            <li>
              <strong>+0,024&nbsp;pp/Jahr (Umzugsquote):</strong> gewichtet mit der jährlichen Umzugsquote
              (9,3&nbsp;%) — misst nur, wer in EINEM Jahr tatsächlich umzieht, nicht den kumulierten Anteil
              der Bevölkerung, der irgendwann in den letzten Jahren umgezogen ist und seither zu
              Neuvermietungspreisen wohnt. Andere Kennzahl, kein Ersatz für die Bevölkerungsanteil-Variante.
            </li>
          </ul>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Datengrundlage deckt nur 2020–2024 ab (5 von 15 Jahren) — deshalb greift die Korrektur
            ausschliesslich ab 2020, nicht rückwirkend auf die gesamte Reihe (siehe Kennzeichnung im
            Chart, Datenpunkt Januar 2020).
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Einordnung des gemessenen Fensters:</strong> Die volle Variante (+0,253&nbsp;pp/Jahr)
            gilt für ein BESONDERES Fenster (2020–2024, geprägt vom Angebotsmieten-Schub ab 2022 und den
            Referenzzinssatz-Erhöhungen 2023) und darf nicht als Dauerzustand gelesen werden — der
            langfristige Richtwert liegt bei rund 0,5&nbsp;Prozentpunkten/Jahr Wachstumsdifferenz zwischen
            Neubezug und Bestand.
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
            <strong>Meldepflichtiger Widerspruchsbefund:</strong> Eine Kreuzprüfung gegen die
            Mietpreis-pro-Quadratmeter-Tabelle zeigt die entgegengesetzte Korrekturrichtung (+1,84&nbsp;pp)
            — mögliche, nicht verifizierte Ursache: Neumieter beziehen im Schnitt kleinere Wohnungen.
          </p>

          <MietkorrekturMiniChart />

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
