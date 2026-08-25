# trueflation.ch — Requirements v1.0

---

## 0. Instruktion für Jarvis (vor Umsetzungsbeginn lesen)

**Auftrag:** Setze trueflation.ch gemäss diesem Dokument autonom um. Arbeite die Prioritätsblöcke P0→P5 (Abschnitt 12) in der dort definierten Abhängigkeitsreihenfolge ab. Blöcke ohne gegenseitige Abhängigkeit dürfen parallel laufen.

**Verbindliche Regeln:**

1. **Alle mit "Entscheidung getroffen" / "entschieden" / "fixiert" markierten Punkte sind gesetzt.** Nicht neu bewerten, nicht optimieren, nicht durch eigene Präferenzen ersetzen. Bei sachlich zwingendem Widerspruch: melden statt eigenmächtig abweichen.
2. **Reihenfolge P1 vor P3 ist nicht verhandelbar.** Die Pipeline-Architektur muss an einer einzigen Quelle (LIK) bewiesen sein, bevor sie auf sechs Quellen mit unterschiedlichen Zugriffsarten skaliert wird.
3. **Keine erfundenen Zahlen, keine Platzhalter-Daten im publizierten Stand.** Wenn eine Quelle nicht liefert, greift die Fehlerbehandlung (US 1.4 für die Pipeline, US 3.16 für die Darstellung) — niemals Werte schätzen, interpolieren oder mocken. Es gibt keine spezifizierte Ausnahme: alle Zutaten liegen mindestens jährlich vor, mehrjährige Interpolation ist nicht vorgesehen.
4. **Jeder Gewichtungswert muss auf eine amtliche Quelle zurückführbar sein** (Abschnitt 2.2). Keine selbst gesetzten Gewichte, unter keinen Umständen.
5. **Melde dich beim Betreiber**, wenn: eine Quelle strukturell anders liefert als in Abschnitt 3 dokumentiert; ein Plausi-Check anschlägt (US 1.7); eine der Betreiber-TODOs (Abschnitt 13) blockiert; oder eine "Entscheidung getroffen"-Vorgabe technisch nicht umsetzbar ist.
6. **Design nicht improvisieren.** Abschnitt 6a ist verbindliche Vorgabe (Fintech-präzise, Hell/Dunkel, WCAG AA). Kein generisches Framework-Default-Aussehen.
7. **Platzhalter `[KONTAKT-EMAIL]` und `[PSEUDONYM/PROJEKTNAME]`** bleiben als solche im Content stehen, bis der Betreiber sie ersetzt (US 5.7). Nicht selbst befüllen.
8. **Content-Texte (Abschnitt 10) erst in P5.** Nicht vorziehen — sie müssen das real gebaute System beschreiben, nicht ein geplantes.
9. **Definition of Done ist verbindlich (Abschnitt 12).** Ein Block gilt erst als abgeschlossen, wenn alle seine Abschlusskriterien erfüllt sind. Kein abhängiger Block startet vorher. Melde pro abgeschlossenem Block kurz, welche Kriterien erfüllt wurden — das ist der einzige Fortschrittsnachweis, den der Betreiber hat.

10. **Keine Datenannahme ohne Verifikation.** Die Annahmen-Verifikationsliste in Abschnitt 12 ist P0-Pflicht. Weicht ein Ergebnis von diesem Dokument ab, melden — nicht stillschweigend anpassen und nicht auf Basis der Dokumentannahme weiterbauen. Zwei Fehlannahmen sind in der Spezifikationsphase bereits aufgetreten und nur durch nachträgliche Prüfung gefunden worden.

**Erste konkrete Schritte (P0):** Next.js-Skeleton im Docker-Container, Git-Repo-Struktur für versionierte Daten, Whitelist-Konfiguration (US 1.6/1.9), Telegram-Approval-Grundgerüst (US 1.7), und als wichtigste Aufgabe: **die vollständige Annahmen-Verifikationsliste (Abschnitt 12) abarbeiten** — beginnend mit **V1 (LIK-Endpoint)** — das ist der einzige echte Startblocker. Die übrigen Verifikationen laufen parallel und halten jeweils nur ihren eigenen Block auf (Zuordnungstabelle in Abschnitt 12).

---

Community-Projekt zur transparenten Gegenüberstellung von offizieller Inflation, Trueflation und Geldmengenausweitung für die Schweiz. Keine kommerzielle Nutzung, keine Werbung, kein bezahlter Service.

**Offizielle Positionierung (Untertitel/Selbstbeschreibung, fachlich):** "Trueflation — alternative Teuerungsberechnung für die Schweiz". Bewusst sachlich statt provokant ("die wahre Inflation" verworfen — bringt zwar mehr Shares durch Empörung, kostet aber Glaubwürdigkeit bei Ökonomen/Journalisten/Institutionen und erhöht die rechtliche Angreifbarkeit; bei einem Projekt, dessen USP methodische Sauberkeit ist, wäre das kontraproduktiv). Der Name "Trueflation" bleibt griffig, der erklärende Claim darunter ist nüchtern.

---

## 1. Produktvision

**Was es ist:** Eine öffentliche, sich selbst aktualisierende Datenseite, die drei Kern-Zeitreihen zur Teuerung in der Schweiz nebeneinanderstellt (offizielle Inflation, Trueflation, Geldmengenausweitung), plus optionale Referenz-Overlays, ausschliesslich auf Basis amtlicher/institutioneller Datenquellen, mit voller Quellentransparenz.

**Was es nicht ist:** Kein Echtzeit-Dienst wie truflation.com (US-Original). Amtliche Schweizer Daten liefern monatlich (LIK, SNB), vierteljährlich (Mietpreisindex) oder jährlich (KVPI, HABE, Strukturerhebung) — nicht täglich. Nur die optionalen Markt-Overlays (Gold/BTC/SMI) sind tagesaktuell. Das wird explizit kommuniziert, nicht kaschiert.

**Zielgruppe:** Interessierte Schweizer Öffentlichkeit, Finanz-affine Community, keine Fachpublikation, keine Anlageberatung.

**Nicht-Ziele (bewusst ausgeschlossen aus v1):**
- Keine Echtzeitdaten
- Keine kantonale Auflösung (nur gesamtschweizerisch — Datenmodell aber so vorbereiten, dass Kanton als Dimension später ergänzbar ist, nicht nur der Content-Layer)
- Keine Monetarisierung, kein Tracking über das für den Betrieb Notwendige hinaus

---

## 2. Die Indizes — Definition & Berechnungslogik

### 2.0 Darstellungsart im Chart (Entscheidung getroffen)
**Default: indexierte Niveaus** (Basis = 100 am gewählten Chart-Startpunkt), **umschaltbar auf Jahreswachstumsraten (%)**.

**Rebasierungslogik bei gestaffelten Startjahren (Entscheidung getroffen — sonst zeigt der Chart eine Falschaussage):** Die Linien beginnen zu unterschiedlichen Zeitpunkten (LIK 1914, Geldmenge 1975, Trueflation 2010). Später startende Linien werden an ihrem Startdatum **an den Wert der Referenzlinie (LIK) angedockt** und divergieren von dort — sie beginnen also NICHT bei 100. Würde Trueflation 2010 bei 100 starten, während LIK dort bereits bei z.B. 130 steht, läge Trueflation optisch weit unter dem LIK und der Betrachter läse das Gegenteil der gemeinten Aussage. Das Andocken ist dasselbe Prinzip wie die Verkettung in 2.2a — methodisch konsistent. Am Chart erscheint ein erklärender Hinweis ("Trueflation ab 2010 auf LIK-Niveau angedockt"). Bewusst nicht gewählt: Rebasierung auf den spätesten gemeinsamen Start, weil dann der gesamte Chart bei jedem Ein-/Ausschalten einer Linie neu skalieren und springen würde.

Begründung: Bei Niveaus geht die Schere zwischen den Linien sichtbar auf — das entspricht der Kernaussage (kumulierter Kaufkraftverlust) und ist konsistent zum Kaufkraft-Rechner, der ohnehin Indexstände braucht. Wachstumsraten zeigen Momentaufnahmen besser, kumulative Wirkung schlechter; sie bleiben als Umschaltoption für Fachnutzer erhalten.

**Konsequenz für alle Vergleichslinien:** Die Darstellungsart gilt einheitlich für LIK, Trueflation, Geldmenge **und die Referenz-Overlays (Gold/BTC/SMI)** — es wird nie gemischt (nicht eine Linie als Niveau, eine als Rate). Schaltet der Besucher auf Raten um, wechseln auch die Overlays auf Jahreswachstumsraten.

**Einzige Ausnahme: der SNB-Leitzins (2.4).** Er ist ein Zinssatz in Prozent, weder ein Niveau noch eine Wachstumsrate, und wird deshalb in beiden Modi unverändert als Prozentwert auf der Sekundärachse dargestellt. Diese Ausnahme ist bewusst und muss in der Legende erkennbar sein (eigene Achsenbeschriftung), damit der Wert nicht mit den Wachstumsraten der anderen Linien verwechselt wird.

### 2.1 Linie 1 — Offizielle Inflation
- **Quelle:** BFS Landesindex der Konsumentenpreise (LIK)
- **Zeitraum:** ab Juni 1914, durchgehende BFS-Reihe
- **Basis:** BFS publiziert aktuell auf **Basis Dezember 2020 = 100** (Beispiel: Indexstand Dezember 2025 = 106,9). Die historische Reihe reicht via Verkettung bis Juni 1914 zurück, wird aber auf der aktuellen Basis geliefert — die Chart-Darstellung rebasiert ohnehin gemäss 2.0, entscheidend ist nur, dass Jarvis die gelieferte Basis kennt und nicht 1914=100 erwartet
- **Frequenz:** monatlich
- **Berechnung:** 1:1 Übernahme der amtlichen Jahresteuerung bzw. Indexstand, keine eigene Neuberechnung nötig — BFS liefert die Kettenindex-Reihe fertig

### 2.2 Linie 2 — "Trueflation" (verbindlicher Begriff, konstant verwenden — nicht "Schattenindex" oder Synonyme im Fliesstext)

Eigenkonstruktion, muss dokumentiert und reproduzierbar sein. Besteht aus zwei Komponenten (fixer Warenkorb + Korrektur), deren Zusammenspiel entschieden ist (sequenziell kombiniert, siehe unten).

#### 2.2a Fixer-Warenkorb-Variante
- Historische HABE-Gewichtungstabellen (BFS) für ein gewähltes Basisjahr fixieren. **Erstes Basisjahr: 2010** (Start der Reihe, siehe zeitliche Einschränkung unten), danach 2015, 2020, 2025 usw.
- **Rhythmus der Neufixierung: alle 5 Jahre (Entscheidung getroffen).** Eigene Projektentscheidung, keine amtlich hergeleitete Grösse — muss im Methodik-Text explizit so gekennzeichnet werden, um nicht dem eigenen Transparenzanspruch zu widersprechen.
- Teilindizes des LIK mit dieser fixen Gewichtung neu aggregieren statt mit der jährlich aktualisierten offiziellen Gewichtung
- **Strukturbrüche (2020, 2026): nur auf Hauptgruppen-Ebene fixieren (Entscheidung getroffen).** Die ~12-13 groben Kategorien (Wohnen, Nahrung, Gesundheit, Verkehr...) sind über Jahrzehnte stabil genug, auch wenn sich Detail-Subkategorien ändern. Deutlich wartungsärmer als eine manuelle Neuzuordnung bei jeder Reform.
- **Verkettung an den 5-Jahres-Nahtstellen (Entscheidung getroffen — kritisch):** Bei jeder Neufixierung der Gewichte wird die neue Reihe an den letzten Wert der alten angedockt (Chaining), sodass kein künstlicher Sprung entsteht. Verglichen wird immer die Veränderungsrate innerhalb einer Periode, die Perioden werden aneinandergehängt — exakt das Verfahren des offiziellen LIK-Kettenindex. Ohne dieses Chaining zeigt die Trueflation-Linie alle 5 Jahre einen Methodenartefakt-Sprung, der keine reale Teuerung ist. Maximal verteidigbar, weil identisch zum amtlichen Vorgehen.

**Zusammenspiel a) + b): sequenziell, ein kombinierter Index (Entscheidung getroffen).** Schritt 1: Gewichte auf Basisjahr fixieren. Schritt 2: Korrekturkategorien (Prämien etc.) addieren, alle fixierten Gewichte proportional runterskalieren, bis Summe wieder 100%. Ergebnis: eine Linie, ein dokumentierter Rechenweg — kein separates Linienpaar, um das Chart nicht zu überladen.

**Einordnung ggü. "gefühlter Inflation" — Pflichttext für die Methodik-Seite:** Die Lücke zwischen offiziellem LIK und individuellem Kostenempfinden hat drei getrennte Ursachen, die nicht vermischt werden dürfen: (1) tatsächlich fehlende/gedämpfte Kategorien wie Prämien und Neuvermietungsmieten — das bildet Trueflation ab; (2) reine Wahrnehmungsverzerrung (Verlustaversion, Häufigkeits-Bias bei alltäglichen Käufen, Ausblenden von Qualitätsverbesserungen) — das kann und soll kein Index "korrigieren"; (3) Vermögenspreise wie Wohneigentum, die LIK bewusst als Nicht-Konsum ausschliesst und die Trueflation bewusst nicht aufnimmt (siehe Entscheidung unten). **Kernsatz, wortwörtlich im Startseiten-Definitionsblock zu verwenden: "Trueflation bildet die messbare Lücke ab, nicht die gefühlte."**

**Abgrenzung zu bestehenden Alternativindizes (Pflichttext Methodik-Seite):** Der Comparis/KOF-Index der "gefühlten Inflation" existiert bereits am Markt, rechnet aber in die *entgegengesetzte* Richtung — er zieht Mieten und langlebige Güter vom LIK ab, um psychologische Konsumwahrnehmung abzubilden. Trueflation rechnet in die andere Richtung: Prämien und Neuvermietungsmieten werden hinzugefügt/korrigiert, um tatsächlich ausgeblendete Kosten abzubilden. Kein Datenimport von Comparis/KOF nötig — nur eine kurze Abgrenzung im Text, damit die beiden Indizes nicht als widersprüchlich missverstanden werden.

**Berechnungsfrequenz (Entscheidung getroffen): monatliche Datenpunkte, mit jährlich aktualisierten Korrekturfaktoren.** "Monatlich" bezieht sich auf die Punktdichte der Linie, nicht darauf, dass alle Bestandteile monatlich variieren: die LIK-Teilindizes tun das, die Korrekturfaktoren (Prämien, Mietdauer-Differenz) werden jährlich aktualisiert, die zugrundeliegende Mieterhebung läuft vierteljährlich. Die monatlichen LIK-Teilindizes treiben die Bewegung der Linie; die Korrekturkomponenten (Prämien aus KVPI, Mietdauer-Differenz aus Strukturerhebung) sind Faktoren, die einmal jährlich aktualisiert werden. Begründung: Eine rein jährliche Linie hätte seit 2010 nur ~15 Punkte und würde neben der monatlichen LIK-Linie visuell nicht funktionieren.
**Pflicht dabei:** Die jährliche Aktualisierung der Korrekturfaktoren erzeugt an den Jahresgrenzen kleine Sprünge. Diese sind zu glätten oder — falls nicht geglättet — im Methodik-Text und per Tooltip zu deklarieren. Nicht unkommentiert stehen lassen.

**Zeitliche Einschränkung:** Linie 2 kann nicht ab 1914 dargestellt werden wie Linie 1. Limitierender Faktor ist die schwächste Zutat: KVPI existiert ab ca. 1999, die jährliche Strukturerhebung mit Mietdauer-Dimension erst ab **2010** — massgeblich ist das spätere der beiden. **Linie 2 startet daher ab 2010** (Entscheidung: durchgehend konsistente jährliche Kalibrierung statt längerer Reihe mit sechsjährigem Interpolationsloch 2004–2009). Muss im Chart und in der Methodik-Seite explizit kommuniziert werden — sonst wirkt eine fehlende Linie vor 2010 wie ein Bug.

**Methodik-Notiz (Betreiber-Ergänzung 25.08.2026, für spätere Diskussionen festgehalten):** Die 2010-Grenze ist nicht mehr nur durch die Strukturerhebung bestimmt, sondern jetzt **doppelt verankert**. Bei der V1-Verifikation wurde festgestellt, dass die LIK-Teilindizes (`majorGroupsMonthly`/`-Yearly`, Grundlage von 2.2a) in der verifizierten Quelle erst **ab Mai 2000** verfügbar sind. Für v1 folgenlos, da 2010 ohnehin die restriktivere Grenze ist (2000 < 2010) — aber sollte der Trueflation-Start je nach vorne verschoben werden (z.B. bei künftiger Klärung von V2/V4), ist **Mai 2000 die harte Wand**, nicht verhandelbar durch bessere KVPI- oder HABE-Quellen. Vor jeder Diskussion einer Vordatierung ist das hier zu prüfen, damit es nicht neu ausgegraben werden muss.

#### 2.2b Korrektur um ausgeblendete/gedämpfte Kosten

| Korrekturkomponente | Ersetzt/ergänzt | Datenquelle |
|---|---|---|
| Krankenkassenprämien | Addition als eigene Kategorie | BFS/BAG Krankenversicherungsprämien-Index — **zwingend der Teilindex "Grundversicherung", NICHT der KVPI-Gesamtindex** (siehe Warnung unten). National aggregiert, jährlich, Basis 1999=100, via XLS-Parsing automatisierbar |
| Wohnkosten real (Neuvermietungs-Proxy) | Korrekturfaktor auf Bestandsmiete | BFS Mietpreisindex (Bestand, **vierteljährlich**) **+** Mietdauer-Differenz aus BFS-Strukturerhebung (**jährlich, ab 2010**) |

**⚠️ Kritische Präzisierung KVPI (geprüft):** Der KVPI-Gesamtindex ist ein gewichtetes Mittel aus **Grundversicherung UND Zusatzversicherung**. Das HABE-Gewicht bezieht sich aber ausschliesslich auf die obligatorische Grundversicherung. Die beiden Teilindizes entwickeln sich stark unterschiedlich (Grundversicherung 1999→2025: 100 → über 250 Punkte; Zusatzversicherung: 100 → ~127 Punkte). Wird der Gesamtindex mit dem Grundversicherungs-Gewicht kombiniert, **unterschätzt die Berechnung die Prämienentwicklung systematisch**. Zu verwenden ist der separat publizierte Teilindex Grundversicherung.

**Bekannte Einschränkungen des KVPI (transparent auszuweisen):**
- **Prämienverbilligungen sind nicht berücksichtigt** — der Index zeigt Bruttoprämien. BFS schätzt selbst, dass deren Einbezug das ausgewiesene Prämienwachstum um rund 0,5 Prozentpunkte pro Jahr reduzieren würde. Muss auf der Methodik-Seite explizit stehen, sonst ist es der naheliegendste Angriffspunkt ("ihr rechnet mit Prämien, die viele so nicht zahlen").
- **Der aktuellste Wert ist provisorisch** — seit Prämienjahr 2004 stützt sich das BFS auf eine BAG-Schätzung; der definitive Wert folgt erst im Folgejahr. Systematische, planbare Revision → US 1.8 deckt das explizit ab.

**✅ Verifiziert Wohnkosten (V3, geklärt):** Die Datengrundlage für den Neuvermietungs-Proxy existiert als reguläre BFS-Publikation. Die jährlich durchgeführte **Strukturerhebung** (neues Volkszählungssystem) liefert Wohnungsmieten nach dem Merkmal **Mietdauer** — funktional die gesuchte Dimension (Langzeitmieter vs. Neumieter), als jährliche Momentaufnahme. Korrekturen gegenüber früheren Annahmen dieses Dokuments: die Dimension heisst **Mietdauer** (nicht "Einzugsjahr"), sie ist **jährlich** verfügbar (nicht alle ~5 Jahre), Quelle ist die **Strukturerhebung ab 2010** (nicht die Einzelerhebungen 1996/2003).

**Methodik-Entscheidung (fixiert):** Addition mit Neu-Gewichtung, keine selbst gesetzten Gewichte.

Formel-Prinzip:
1. Prämien-Budgetanteil wird nicht geschätzt, sondern **bestätigt** aus der amtlichen jährlichen HABE-Publikation übernommen: BFS weist "obligatorische Krankenkassenprämien (Grundversicherung)" als eigene, isolierte Position innerhalb der "obligatorischen Ausgaben" aus (getrennt von den Konsumausgaben, z.B. 2023: 6,7% des Bruttoeinkommens / 689 CHF/Monat). Diese Trennung bedeutet: kein Überschneidungsrisiko mit dem bestehenden LIK-Gesundheitsgewicht, das nur tatsächlichen Gesundheitskonsum (Arzt, Medikamente, Zahnarzt) abbildet, keine Prämien. Die Addition ist damit nicht nur methodisch vertretbar, sondern folgt der Kategorisierung, die BFS selbst schon vornimmt.
2. Dieser Prämien-Anteil wird als eigene Kategorie ins Gesamtmodell aufgenommen.
3. Alle bestehenden LIK-Kategoriegewichte werden proportional so herunterskaliert, dass die Summe wieder 100% ergibt.
4. Für Wohnen: der vierteljährliche LIK-Mietpreisindex (Bestand) wird laufend fortgeschrieben und **jährlich** anhand der Mietdauer-Differenz aus der Strukturerhebung rekalibriert. Keine mehrjährige Interpolation nötig. Mit sichtbarem Hinweis "letzte Kalibrierung: [Jahr]".

Jeder Gewichtungswert in der Formel muss auf eine amtliche Messung zurückführbar sein — keine frei gewählte Gewichtung. Das ist der entscheidende Unterschied zwischen "methodisch verteidigbar" und "willkürlich", nicht die Rechenoperation an sich.

**HABE-Gewichte ↔ LIK-Teilindizes (geprüft):** Beide Systeme beruhen auf derselben internationalen Klassifikation (COICOP) — die HABE ist per Konstruktion die Datenquelle, aus der BFS die LIK-Gewichte ableitet. Auf **Hauptgruppen-Ebene** (ohnehin gewählt) ist das Mapping sauber. Auf Detailebene wären die Systeme nicht deckungsgleich (HABE enthält z.B. obligatorische Ausgaben wie Steuern/Prämien, die der LIK nicht führt) — die Beschränkung auf Hauptgruppen umgeht dieses Risiko. **Aufgabe in P3:** eine dokumentierte Mapping-Tabelle (COICOP-Hauptgruppe ↔ verwendeter LIK-Teilindex) als Artefakt erstellen, damit die Zuordnung nachvollziehbar und reproduzierbar ist.

**Status:** Blocker gelöst, Formel vollständig quellenbasiert, keine offene Methodikfrage mehr in Epic 2.

**Bekannte Einschränkung, offen zu kommunizieren:** Der Miet-Korrekturfaktor ist nicht taggenau aktuell, sondern folgt dem Publikationsrhythmus der zugrundeliegenden BFS-Mietpreisdaten. Auf der Methodik-Seite explizit ausweisen.

#### 2.2c Bewusst nicht enthalten (Ausschlüsse mit Begründung)

Diese Positionen wurden geprüft und bewusst **nicht** in Trueflation aufgenommen. Die Begründungen gehören auf die Methodik-Seite, weil sie die naheliegendsten Rückfragen beantworten.

**Strom / Elektrizität — ausgeschlossen wegen Doppelzählung.** Ursprünglich als dritte Korrekturkomponente vorgesehen, begründet mit "im LIK nur teilweise abgebildet". Diese Annahme ist falsch: Elektrizität ist vollwertig im LIK enthalten (Teil von "Wohnen und Energie", eigener Teilindex, monatlich erhoben; BFS publiziert zusätzlich die Reihe "LIK, Durchschnittspreise für Energie und Treibstoffe" ab 1993). Eine Addition von ElCom-Daten würde Strom doppelt zählen. Anders als bei Prämien (nachweislich nicht im LIK) und Mieten (nachweislich Bestandsmieten-gedämpft) existiert bei Strom keine dokumentierte Lücke — eine Korrektur ohne belegbare Lücke würde das eigene Kernprinzip verletzen. ElCom bleibt v2-Kandidat, falls je eine konkrete LIK-Schwäche belegt wird.

**Wohneigentumspreise — ausgeschlossen als Vermögenswert.** Der LIK klammert Immobilienpreise bewusst aus, weil Wohneigentumserwerb Vermögensbildung ist, kein Konsum. Trueflation folgt dieser Abgrenzung. Eine Aufnahme würde die Definition des Index verwässern (Konsumteuerung vs. Vermögenspreisinflation sind unterschiedliche Phänomene).

**Wahrnehmungsverzerrung — nicht korrigierbar und nicht Aufgabe des Index.** Verlustaversion, Häufigkeits-Bias bei Alltagskäufen und das Ausblenden von Qualitätsverbesserungen erklären einen Teil der Lücke zwischen offizieller Zahl und Kostenempfinden. Das ist psychologisch real, aber kein Messfehler — Trueflation bildet die messbare Lücke ab, nicht die gefühlte.

### 2.3 Linie 3 — Geldmengenausweitung
- **Quelle:** SNB Datenportal (data.snb.ch)
- **Verwendetes Aggregat: M2 (Entscheidung getroffen)** — bildet ab, was die meisten intuitiv als "ihr Geld" verstehen (verfügbares + gespartes Geld), international gängigste Referenz in Inflationsdebatten. M1 zu eng (nur Bargeld/Sichteinlagen), M3 zu stark von institutionellem Anlageverhalten geprägt. Muss auf der Methodik-Seite deklariert und in einem Satz erklärt werden. Optionale spätere Erweiterung: umschaltbar M1/M2/M3 (nicht v1).
- **Zeitraum:** ab 1975 mit Fussnote "vor 1995 abweichende Berechnungsdefinition", volle Reihe theoretisch ab 1907 vorhanden aber schlecht vergleichbar
- **Frequenz:** monatlich
- **Darstellung:** folgt dem global gewählten Modus (2.0) — im Default indexiertes Niveau (Basis 100), im Raten-Modus Jahreswachstumsrate. Nie Absolutwert in CHF.

**Methodische Pflichtklarstellung (nicht verhandelbar, sonst angreifbarster Punkt der Seite):** Geldmengenwachstum ist **keine alternative Berechnung derselben Grösse** wie LIK/Trueflation. Nach der Quantitätstheorie (Geldmenge × Umlaufgeschwindigkeit = Preisniveau × Wirtschaftsleistung) schlägt Geldmengenwachstum nur dann 1:1 auf Preise durch, wenn Umlaufgeschwindigkeit und reale Wirtschaftsleistung konstant bleiben — das tun sie nicht (Beispiel: post-2008 QE, massives Geldmengenwachstum bei jahrelang niedriger Konsumenteninflation, weil das Geld in Vermögenswerte statt Konsum floss). Linie 3 misst **Verwässerung der Geldmenge**, nicht **Preisentwicklung**. Muss im Chart-Label und in der Methodik-Seite klar getrennt von den beiden Inflationslinien beschriftet werden — keine implizite Gleichsetzung.

### 2.4 Overlay — SNB-Leitzins
- **Quelle:** SNB Datenportal, historische Zinssätze
- **Zeitraum:** vom frühesten verfügbaren Instrument bis heute — **exakter Startzeitpunkt in V6 zu verifizieren** (SNB-Zinsreihen reichen prinzipiell weit zurück, der belastbare Beginn ist nicht angenommen, sondern zu prüfen). Wie bei allen Linien gilt: vor dem Verfügbarkeitsbeginn greift der Nichtexistenz-Zustand aus US 3.16, keine Interpolation.
- **Frequenz:** ereignisbasiert (SNB-Zinsentscheide, ca. 4×/Jahr) — im Chart als Stufenlinie, nicht interpoliert, da der Satz zwischen Entscheiden konstant gilt
- **Darstellung:** sekundäre Achse im Chart in Prozent, nicht eigene Linie im Hauptvergleich; von der Modus-Umschaltung in 2.0 ausgenommen
- **Fussnote Pflicht:** Instrumentenbruch — Diskont-/Lombardsatz (bis ~2000) → Libor-Zielband (2000–2019) → SNB-Leitzins (ab 2019). Nicht durchgehend dasselbe Instrument.

### 2.5 Overlay-Modul v1 — Referenzlinien (Checkbox-aktivierbar)
Architektur-Entscheidung: nicht als "v2 später" gebaut, sondern als generisches Overlay-Modul bereits in v1 — Chart-Komponente wird von Anfang an für beliebige zusätzliche Zeitreihen ausgelegt, nicht fest verdrahtet auf die drei Kernlinien. Aufwand für Gold/BTC/SMI ist dann marginal.

- **Standardzustand:** alle Overlays aus (opt-in), Kernchart zeigt nur LIK / Trueflation / Geldmenge
- **Verfügbare Overlays:** Goldpreis (CHF), Bitcoin-Kurs (CHF), SMI — dargestellt als indexierte Wertentwicklung, nicht als "Kaufkraft"
- **Kategorisierung:** eindeutig als "Wertaufbewahrung/Rendite", nicht als "Inflationsmessung" gekennzeichnet — eigene Farbcodierung, eigene Legende, eigener Disclaimer-Absatz (SMI ist keine amtliche Quelle, sondern Marktdaten)
- **Datenquellen:** **Twelve Data** (echte dokumentierte API, Free-Tier 800 Req/Tag, deckt SMI + Gold + BTC aus einer einzigen Quelle) als primäre Empfehlung. **CoinGecko als BTC-Fallback gestrichen (Befund V8):** Der Free-Tier liefert nur die letzten 365 Tage Historie und ist für eine mehrjährige Zeitreihe untauglich. Es gibt damit **keinen Fallback für BTC** — fällt Twelve Data aus, entfällt das BTC-Overlay, was hinnehmbar ist (optionales Feature, betrifft keine Kernlinie). Gold braucht USD/CHF-Umrechnung. **Free-Tier-Grenzen (geprüft): 800 Abrufe/Tag, max. 5000 Datenpunkte pro Abruf.** Tagesreihen sind vollständig bis zum jeweils ersten Handelstag verfügbar — für lange Historien (SMI seit 1988 ≈ 9'500 Handelstage) muss der Erstimport in mehrere Zeitfenster aufgeteilt werden (siehe US 1.12). Kommerzielle Nutzung kostenpflichtig — für nicht-kommerzielles Projekt unproblematisch, Nutzungsbedingungen einmal prüfen. Marktdaten, kein amtlicher Ursprung — im Disclaimer separat vermerken.

---

## 3. Datenquellen-Matrix

| Quelle | Kennzahl | Frequenz | Zugriff | Automatisierbar? |
|---|---|---|---|---|
| BFS | LIK Total + Teilindizes | monatlich | **✅ V1 VERIFIZIERT (25.08.2026).** Weder opendata.swiss, PxWeb/STAT-TAB (auch mit `www.` erneut geprüft — Domäne 05 fehlt dort nachweislich komplett) noch Swiss Stats Explorer/SDMX enthalten den LIK. Die reale Quelle ist eine **dedizierte BFS-Webapp** (`lik-app.bfs.admin.ch`), deren Frontend seine Daten aus einem öffentlichen, unauthentifizierten JSON-Endpunkt lädt: `https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master`. Enthält `yearlySeries`/`monthlySeries` (13 Basisjahre inkl. `12.2020=100`, Reihe ab 06.1914 bis aktueller Monat) sowie `majorGroupsMonthly`/`majorGroupsYearly` (Teilindizes nach Hauptgruppen). Antwortet mit `Last-Modified`-Header — nutzbar für bedingte Abfragen (US 1.1/1.16). Gefunden über: LIK-Downloads-Seite → Teuerungsrechner-Asset → Weblink zu `lik-app.bfs.admin.ch` → `assets/global-params.js` der App, die `likDataUrl` im Klartext enthält. Dieselbe Datei liefert **`kvpiDataUrl`** (Korrekturfaktor, klein) und **`itrDataUrl`** (Indexierungsrechner-Profile) — relevant für V2/V4. | Ja — **mit Vorbehalt, siehe Fragilitätshinweis unten** |
| BFS/BAG | KVPI | jährlich | **Verifiziert: nur XLS/HTML (opendata.swiss), keine PxWeb/STAT-TAB-API gefunden** | Ja, via XLS-Parsing (nicht JSON-API) |
| BFS | Mietpreisindex (Bestand) | **vierteljährlich** (Feb/Mai/Aug/Nov, ~10'000 Wohnungen; publiziert seit 1939, vierteljährlich seit 1993) | BFS STAT-TAB | Ja — STAT-TAB-Abschaltung 2028 betrifft auch diese Quelle |
| BFS | Strukturerhebung: Mieten nach **Mietdauer** | jährlich, ab 2010 | BFS-Publikation (Strukturerhebung) | Ja — Zugriffsweg in V3 zu dokumentieren |
| BFS | HABE-Haushaltsbudgeterhebung (Prämien-Budgetanteil) | jährlich | BFS-Publikation (Medienmitteilung, strukturierte Tabelle vorhanden) | Ja |
| SNB | Geldmenge **M2** (M1/M3 optional erst v2) | monatlich | **Cube `snbmonagg`** (verifiziert). Daten: `/api/cube/snbmonagg/data/csv/de?dimSel=D0(B),D1(GM1)&fromDate=…&toDate=…`; Struktur: `/api/cube/snbmonagg/dimensions/de` — **ohne `/json`-Segment**. `GM1`=M1, M2-Selektor über den dimensions-Endpoint bestätigen | Ja |
| SNB | Leitzins-Historie | ereignisbasiert | data.snb.ch | Ja |

**Entfernt:** Drittanbieter-Mietindex (Wüest Partner/Fahrländer Partner) — ersetzt durch BFS-eigene Mietpreisstrukturerhebung, siehe 2.2b. Kein Lizenzrisiko mehr, dafür geringere Update-Frequenz bei der Miet-Korrekturkomponente.

**Plattformwechsel BFS — Stand der Erkenntnis (zweimal korrigiert, jetzt belegt):** STAT-TAB weist auf den Wechsel zu **Swiss Stats Explorer (stats.swiss)** hin, formuliert aber ausdrücklich, dass **"einige"** Datenwürfel dort nicht mehr verfügbar sein werden — die Migration ist **selektiv und noch nicht abgeschlossen**. Für den LIK wurde in drei unabhängigen Prüfungen belegt: Agency `LIK` und Kategorie `05-02` existieren auf stats.swiss strukturell, es sind aber **keine Dataflows verknüpft** (Katalog-Dump: 215 Dataflows über 29 Agencies, LIK nicht darunter; Categorisation für 05-02 leer; direkte Abfrage 404). Der LIK ist dort also **vorbereitet, aber nicht migriert**.

**Aufgelöst (25.08.2026):** Der `www.`-Test war die richtige nächste Massnahme, hat aber ebenfalls nichts gebracht (Domäne 05 fehlt identisch mit und ohne `www.`). Der tatsächliche Fund kam über einen dritten, bis dahin nicht bedachten Weg: Weder PxWeb/STAT-TAB noch Swiss Stats Explorer/SDMX führen den LIK — er lebt in einer **eigenständigen BFS-Fachapplikation** (`lik-app.bfs.admin.ch`), erreichbar über die offizielle LIK-Downloads-Seite (Asset "LIK-Teuerungsrechner") und deren Config-Datei `assets/global-params.js`, die den Daten-Endpunkt im Klartext enthält. **Verbindliche Lehre für künftige Quellen-Verifikation:** Bei BFS-Fachthemen mit eigener Erhebung (LIK, KVPI hier bereits mitgefunden) zuerst prüfen, ob eine **dedizierte Fachapplikation** existiert (Muster: `<kuerzel>-app.bfs.admin.ch`), bevor generische Kataloge (PxWeb, STAT-TAB, Swiss Stats Explorer, opendata.swiss) als erschöpfend behandelt werden. Indiz dafür: ein interaktiver "Rechner" oder eine "Online-Applikation" auf der Themenseite — deren Config-Dateien (oft `global-params.js` o.ä.) verlinken direkt auf den Rohdaten-Endpunkt.

**Mögliche Vereinfachung (weiterhin gültig, in V2–V5 zu prüfen):** Falls Quellen auf Swiss Stats Explorer liegen, entfallen dort XLS-Parsing und PDF-Extraktion. Die SDMX-API ist verifiziert funktionsfähig (`disseminate.stats.swiss`, Struktur- und Datenabfragen liefern valide Antworten) — sie enthält nur den LIK noch nicht.

**⚠️ Fragilität der LIK-Quelle (bewusst akzeptiert, aber abzusichern):** Der verifizierte Endpunkt liefert den **Anwendungszustand einer BFS-Frontend-App**, keine dokumentierte öffentliche API. Er ist amtliche Primärquelle (Host `dam-api.bfs.admin.ch`) und damit jedem Drittanbieter-Spiegel klar vorzuziehen — aber es gibt keinen API-Vertrag, keine Zusicherung zur Stabilität und keine Ankündigungspflicht bei Strukturänderungen. Konsequenzen, verbindlich:
- Der **Datenvertrags-Test (US 2.7)** ist für diese Quelle keine Kür, sondern Voraussetzung: Struktur (erwartete Schlüssel, Typen, Wertebereiche) bei jedem Lauf prüfen und bei Abweichung abbrechen, statt fehlerhafte Werte durchzureichen.
- Die **Drift-Erkennung (US 1.14)** greift hier besonders: Referenzabgleich gegen die monatliche BFS-Medienmitteilung (publizierter Indexstand) als unabhängige Kontrolle.
- Bei Strukturbruch ist **nicht** auf einen Drittanbieter-Spiegel auszuweichen, sondern der aktuelle Zugriffsweg neu zu ermitteln (siehe Fachapp-Heuristik unten) und der Betreiber zu informieren.

**Fachapp-Heuristik für die Quellensuche (aus V1 gelernt, für V2–V5 verbindliche Suchreihenfolge):** Bei BFS-Themen mit eigener Erhebung existiert häufig eine dedizierte Fachapplikation unter `<kürzel>-app.bfs.admin.ch`, erkennbar am «Rechner»- oder «Online-Applikation»-Link auf der Themenseite bzw. in der Downloads-Rubrik. Deren `global-params.js` (oder vergleichbare Config) verlinkt oft direkt auf die Rohdaten-Endpunkte. **Suchreihenfolge für jede BFS-Quelle:** (1) dedizierte Fachapp, (2) Swiss Stats Explorer/SDMX, (3) STAT-TAB/PxWeb, (4) BFS-Support. Konkret für V2 bereits gefunden: dieselbe `global-params.js` der LIK-App enthält `kvpiDataUrl` und `itrDataUrl`.

**Verifikations-Hinweis:** `data.bfs.admin.ch` bietet eine zentrale Übersicht aller BFS-Datensätze, kategorisiert nach Zugänglichkeit (xlsx / csv+json / API) — Ausgangspunkt für jede weitere Quellen-Prüfung, statt einzeln zu raten.

Jede Kennzahl auf der Seite zeigt sichtbar: Quelle, Stand (Datum letzte Aktualisierung), erwarteter nächster Aktualisierungstermin, Link zur Original-Publikation.

---

## 4. Epics & User Stories

### Epic 1 — Daten-Pipeline

**Architekturprinzip (verbindlich für alle Stories dieses Epics):** Publikationsgetriggert, nicht kalendergetriggert. Jede Quelle hat ihren eigenen, unregelmässigen Publikationsrhythmus (LIK monatlich, Mietpreisindex vierteljährlich, HABE/KVPI/Strukturerhebung jährlich, SNB-Leitzins ereignisbasiert). Die Pipeline prüft pro Quelle regelmässig, ob eine neue Version vorliegt (Versions-/Datumsvergleich gegen letzten bekannten Stand), und verarbeitet nur bei tatsächlicher Änderung. Das ist zugleich die Grundlage für Erweiterbarkeit: neue Quellen bekommen ihre eigene Prüf-Logik mit eigenem Rhythmus, ohne bestehende Quellen anzufassen.

- **US 1.1:** Als System will ich BFS-LIK-Daten automatisch auf neue Publikationen prüfen und abrufen, damit die Seite ohne manuellen Eingriff aktuell bleibt.
  *AC:* Scheduler prüft in sinnvollem Intervall (nicht zwingend täglich) auf neue Version, zieht bei Änderung neue Daten, versioniert den alten Stand. Fehlerbehandlung siehe US 1.4, Plausibilitätsprüfung siehe US 1.7.
  *AC (BFS/SDMX — nativer Mechanismus, verbindlich):* Die SDMX-API stellt den Parameter **`updatedAfter`** bereit, der ausschliesslich seit einem Zeitpunkt eingefügte, geänderte oder gelöschte Beobachtungen zurückgibt. Das BFS empfiehlt ihn ausdrücklich für wiederkehrende Synchronisation. Damit ist die inkrementelle Speicherung (US 1.11) und die Revisionserkennung (US 1.8) serverseitig gelöst — **nicht selbst nachbauen, sondern `updatedAfter` verwenden.**
  *AC (SNB — konkrete API-Vorgabe, verbindlich):* Die SNB stellt für genau diesen Zweck eine **`lastUpdate`-Methode und eTags** bereit und verlangt ausdrücklich, Daten nur abzurufen, wenn tatsächlich neue vorliegen — bei exzessiver Nutzung behält sie sich vor, die IP zu sperren. Der publikationsgetriggerte Ansatz ist hier also keine Stilfrage, sondern Nutzungsbedingung.

**Abruf-Disziplin (verbindlich für alle Quellen — schützt gegen Sperrung):**
1. **Nur Metadaten pollen, nie Volldaten.** Geprüft wird ausschliesslich per `lastUpdate`/eTag (bzw. conditional request mit `If-None-Match`). Volldaten werden erst geladen, wenn die Prüfung eine Änderung anzeigt. Ein unveränderter Stand kostet damit einen 304-Response, keinen Datentransfer.
2. **Maximal ein Prüfaufruf pro Quelle und Tag.** Bei monatlich publizierten Daten sind das ~30 Prüfungen pro Veröffentlichung — bereits deutlich mehr als nötig, aber unauffällig.
3. **Nur im erwarteten Publikationsfenster prüfen.** BFS und SNB publizieren Publikationskalender. Ausserhalb des Fensters (z.B. LIK-Publikation um den Monatsanfang) wird nicht geprüft. Reduziert die Aufrufe pro Quelle auf ~100–150/Jahr.
4. **Harte Obergrenze im Code, nicht nur im Zeitplan.** Ein Zähler begrenzt Aufrufe pro Quelle und Stunde (Richtwert: 5). Das ist der eigentliche Schutz: Der geplante Rhythmus ist ohnehin harmlos — gefährlich wäre ein Fehler, der eine Abrufschleife erzeugt. Die Obergrenze macht das unmöglich.
5. **Exponentielles Back-off bei Fehlern.** Nach einem Fehlschlag nicht sofort erneut versuchen; Wartezeit verdoppeln. Verhindert Hämmern gegen eine gestörte Quelle.
6. **Identifizierbarer User-Agent** mit Projektname und Kontaktmöglichkeit. Falls doch etwas auffällt, kann die Institution nachfragen statt direkt zu sperren.
7. **Letzten bekannten eTag/lastUpdate-Wert im Repo persistieren**, damit die Prüfung auch nach einem Neustart ohne Volldatenabruf funktioniert.
- **US 1.2:** Als System will ich SNB-Geldmengen- und Zinsdaten (monatlich/ereignisbasiert) nach demselben API-Prüf-Muster automatisch abrufen.
- **US 1.3:** Als System will ich jährliche/periodische Quellen (HABE, KVPI, Strukturerhebung) mit eigenem, deutlich selteneren Prüf-Rhythmus behandeln, ohne dass das die restliche Pipeline-Logik verkompliziert.
  *Bekanntes Risiko (dokumentiert, kein Feature):* Ändert eine Quelle rückwirkend ihre eigene Methodik (nicht nur einen Datenpunkt, sondern die Bedeutung der ganzen Reihe — wie beim LIK-Warenkorb 2020/2026, denkbar auch bei KVPI), entsteht ein Sprung, den die Plausi-Prüfung (US 1.7) automatisch abfängt und zur manuellen Freigabe eskaliert. Kein stilles Durchlaufen.
- **US 1.4:** Als System will ich bei Fehlschlag eines Datenabrufs die zuletzt bekannten validen Daten weiter anzeigen und einen sichtbaren "Daten möglicherweise veraltet"-Hinweis setzen, statt die Seite kaputtgehen zu lassen.
  *AC (Eskalation bei dauerhaftem Ausfall):* Nach mehreren aufeinanderfolgenden Fehlversuchen derselben Quelle (Schwellwert konfigurierbar, Richtwert: 3 Läufe) wird nicht still weiter "veraltet" angezeigt, sondern über den Telegram-Kanal eskaliert — mit Angabe, welche Quelle wie lange ausfällt. Verhindert, dass eine dauerhaft abgeschaltete Quelle (z.B. eingestellter Free-Tier, abgeschaltete BFS-Tabelle) monatelang unbemerkt bleibt.
- **US 1.5:** Als Betreiber will ich pro Datenquelle einen manuellen Override/Re-Trigger auslösen können, falls die automatische Pipeline scheitert.
- **US 1.6:** Als Betreiber will ich pro Quelle eine zentrale Konfiguration (Herkunfts-URL, erwarteter Rhythmus, Prüf-Logik-Typ) pflegen können, damit neue Quellen ohne Codeänderung an der Kernlogik angebunden werden können.
  *Security-Vorgabe:* Quellen-URLs sind auf eine feste Whitelist begrenzt, nicht frei eintragbar (SSRF-Schutz).
- **US 1.7:** Als System will ich neue Datenpunkte vor Veröffentlichung auf Plausibilität prüfen, damit ein fehlerhafter oder kompromittierter Quellenwert nicht ungeprüft live geht. Zwei Prüfarten:
  *Prüfart 1 — Bereichsprüfung (alle Quellen):* Liegt der Wert in einem plausiblen absoluten Bereich? Fängt kaputte Parses ab (z.B. verrutschte XLS-Spalte → 8'500 statt 85).
  *Prüfart 2 — Sprungprüfung (Schwellwert PRO QUELLE, weil Volatilität extrem unterschiedlich):* LIK/Trueflation ~1-2%/Monat, KVPI ~10%/Jahr, SNB-Geldmenge ~5%/Monat, SMI ~15%/Tag, Gold ~10%/Tag, BTC ~30%/Tag. Ein globaler Schwellwert wäre wertlos (triggert ständig bei BTC oder nie bei LIK). Schwellwerte sind Projektentscheidung, konfigurierbar pro Quelle in der Whitelist-Config, nicht hart im Code.
  *AC (Bulk-Import bekommt eigenes Validierungsprofil, Betreiber-Klärung 25.08.2026):* Die Sprungprüfung (Prüfart 2) gilt **ausschliesslich für den laufenden Betrieb** (US 1.11), nicht für den einmaligen Bulk-Import (US 1.12). Historische Monatswerte (Weltkriegsinflation, Ölkrisen der 1970er) überschreiten 2%/Monat routinemässig — bei einer Reihe von über 1300 Monaten würde die laufende Sprungprüfung dutzendfach eskalieren und damit exakt den Gewöhnungseffekt auslösen, den dieser Mechanismus verhindern soll. Der Bulk-Import validiert stattdessen: (a) Vollständigkeit der Monatsfolge (keine Lücken), (b) monotone, aufsteigende, duplikatfreie Datumsfolge, (c) Referenzpunkt-Abgleich gegen einen unabhängig bekannten Ankerwert (z.B. Dezember 2025 = 106.9 auf Basis 12.2020=100), (d) grobe Erwartung eines über lange Zeiträume steigenden Verlaufs. Umgesetzt als getrennte Validierungsprofile `bulk` und `incremental` in `config/sources.json`.
  *AC (erwartete Sprünge nicht fälschlich eskalieren):* Zwei Vorgänge erzeugen planmässig Sprünge, die **keine** Eskalation auslösen dürfen: (a) die **jährliche Aktualisierung der Trueflation-Korrekturfaktoren** zum Jahreswechsel (siehe 2.2a — falls nicht geglättet, springt die Linie dort systematisch); (b) die **Ersetzung des provisorischen KVPI-Werts durch den definitiven** (US 1.8). Beide sind der Plausi-Prüfung als erwartete Regelvorgänge bekannt zu machen, sonst eskaliert das System jeden Januar ohne Anlass und der Betreiber gewöhnt sich an, Meldungen wegzuklicken — womit der Schutzmechanismus wertlos wird.
  *AC:* Bei Überschreitung wird der Wert zurückgehalten und markiert statt automatisch publiziert. Freigabe über bestehenden Jarvis-Telegram-Kanal, **mit strukturiertem Kontext** (Kennzahl, alter Wert, neuer Wert, Abweichung in %, Link zur Originalquelle). Der Betreiber prüft dabei nicht die Zahl selbst, sondern ob die Bewegung ein echtes Ereignis (Zinsentscheid, Prämienrunde, Markt-Crash) oder ein Datenfehler (Formatänderung, falsche Spalte, Einheitenwechsel) ist.
- **US 1.8:** Als System will ich zwischen "neuer Datenpunkt" und "nachträgliche Revision eines bestehenden Datenpunkts" unterscheiden, damit sich die Historie nicht stillschweigend verfälscht.
  *AC (planbare Revision, kein Ausnahmefall):* Der KVPI-Wert des laufenden Prämienjahres ist systematisch **provisorisch** (BAG-Schätzung), der definitive Wert folgt im Folgejahr. Die Pipeline muss diesen Fall als erwarteten Regelvorgang behandeln — provisorische Werte als solche markieren (sichtbar in US 3.17) und beim definitiven Wert automatisch ersetzen, ohne dass die Plausi-Prüfung dabei jedes Mal eskaliert.
  *AC (LIK-Rebasierung — planbares Ereignis, kein Ausnahmefall, Betreiber-Ergänzung 25.08.2026, KORRIGIERT nach realem Fund):* Das BFS rebasiert den LIK periodisch auf ein neues Basisjahr. **Praxisfall statt Theorie:** Bei der Verifikation (25.08.2026) existierte bereits die Basis `12.2025=100` — die ursprünglich als "aktuelle amtliche Basis" vorgesehene `12.2020=100` war zu diesem Zeitpunkt schon veraltet. Ausserdem stellte sich die ursprüngliche Annahme als falsch heraus, dass alle 13 Basisreihen denselben Zeitraum abdecken und sich nur in der Skalierung unterscheiden — tatsächlich startet jede Basisreihe erst bei ihrem eigenen Basisjahr (z.B. `12.2020=100` beginnt erst Dezember 2020, keine frühere Historie). **Korrigierte Entscheidung:** Statt einer einzelnen Basisreihe wird die vom BFS selbst gepflegte **"Ewige Reihe"** importiert (siehe `config/sources.json` → `importedSeries.totalIndex`) — diese deckt lückenlos Juni 1914 bis heute ab und **überlebt jede künftige Rebasierung**, weil das BFS die Verkettung selbst durchführt. Die Pipeline muss diese Verkettung nicht mehr selbst nachbauen. Für die Trueflation-Teilindizes (2.2a) wird separat das Top-Level-Feld `majorGroupsMonthly`/`-Yearly` genutzt, das dynamisch der jeweils aktuellsten Basis folgt und ab Mai 2000 lückenlos verfügbar ist (deckt den ab 2010 benötigten Zeitraum ab). Rebasierungen bleiben der Plausi-Prüfung als erwarteter Regelvorgang bekannt (Beobachtungslogik im Code bleibt aktiv), lösen aber für die Ewige Reihe keine Umstellung mehr aus.
- **US 1.9 (Security):** Als Betreiber will ich, dass Admin-Funktionen (manueller Override/Re-Trigger aus US 1.5, Quellenkonfiguration aus US 1.6) ausschliesslich authentifiziert zugänglich sind, damit niemand Drittes die Pipeline kapern und falsche Zahlen einschleusen kann.
- **US 1.10:** Als System will ich für Quellen ohne API (KVPI via XLS-Parsing; Strukturerhebungs-Daten je nach in V3 dokumentiertem Zugriffsweg ggf. via XLS/PDF-Extraktion) einen eigenen "Low-Frequency-Ingestion"-Pfad haben, getrennt von der API-basierten Haupt-Pipeline, damit ein fehlendes API-Format nicht die gesamte Automatisierung blockiert.
- **US 1.11:** Als System will ich bei jedem Pipeline-Lauf nur die seit dem letzten Stand neuen Datenpunkte abrufen und lokal (Git-Repo) an die bestehende Historie anhängen, statt die komplette Zeitreihe jedes Mal neu abzufragen.
  *AC:* Fällt eine Quelle temporär aus oder ändert sich strukturell (v.a. relevant bei externen Marktdatenquellen), bleibt die bereits gespeicherte Historie unberührt — nur der aktuelle Ingestion-Lauf schlägt fehl und wird über US 1.4/1.7 sichtbar gemacht.
- **US 1.12 (Erstinitialisierung, sonst startet nichts):** Als System brauche ich einen einmaligen Bulk-Import, der die komplette historische Reihe pro Quelle initial ins Repo lädt (LIK ab 1914, SNB M2 ab 1975, KVPI ab 1999, Strukturerhebung ab 2010, Marktdaten ab jeweiligem Verfügbarkeitsbeginn), bevor der inkrementelle Betrieb (US 1.11) übernimmt.
  *AC:* Bulk-Import ist ein separater, explizit auslösbarer Vorgang (nicht Teil des regulären Laufs), idempotent wiederholbar, und schreibt denselben Datenstrukturtyp wie der inkrementelle Pfad. Bei Marktdaten (Twelve Data): Free-Tier liefert max. 5000 Datenpunkte pro Abruf und 800 Abrufe/Tag — für lange Tagesreihen (SMI seit 1988 ≈ 9'500 Handelstage) ist der Import in mehrere Fenster (start_date/end_date) aufzuteilen. Kein Blocker, aber muss beim Bulk-Import eingeplant werden.
- **US 1.13 (Rollback):** Als Betreiber will ich einen publizierten Datenstand gezielt zurückrollen können, falls trotz Plausi-Prüfung (US 1.7) ein falscher Wert live geht. Git-basiert technisch trivial (Revert des betreffenden Commits + Re-Deploy) — der Prozess muss aber dokumentiert und einmal getestet sein, nicht erst im Ernstfall erfunden werden.
- **US 1.14 (Drift-Erkennung — Plausi-Check greift hier nicht):** Als System will ich nicht nur einzelne Sprünge (US 1.7), sondern auch **schleichende Abweichungen** erkennen. Liefert eine Quelle über Monate systematisch leicht falsche Werte (z.B. nach einer stillen Formatänderung wird die falsche Spalte gelesen und die Werte sind plausibel, aber falsch), schlägt kein Sprung-Schwellwert an.
  *AC:* Periodischer Abgleich gegen einen unabhängigen Referenzwert derselben Grösse (z.B. LIK-Jahresteuerung gegen die von BFS separat publizierte Jahresteuerungs-Angabe; KVPI gegen die BAG-Medienmitteilung). Bei anhaltender Abweichung über Toleranz → Eskalation wie US 1.7. Ohne diese Prüfung ist ein stiller Parse-Fehler monatelang unsichtbar.
- **US 1.15 (Backup & Redundanz):** Als Betreiber will ich, dass die Datenhistorie nicht an einem einzigen Ort hängt. Git-basierte Speicherung ist Versionierung, **kein Backup**, solange nur ein Remote existiert.
  *AC:* Mindestens ein zweites, unabhängiges Remote/Mirror der Datenreihen (z.B. Spiegelung auf den Projekte-Droplet oder ein zweites Git-Remote), automatisch aktualisiert. Verlust des primären Hosting-Accounts darf nicht bedeuten, dass 110 Jahre aufbereitete Datenreihen weg sind.
- **US 2.1:** Als System will ich aus fixierten HABE-Gewichten und LIK-Teilindizes den fixer-Warenkorb-Index berechnen und historisch fortschreiben.
- **US 2.2:** Als System will ich KVPI und Mietpreis-Differenz gemäss dokumentierter Formel in den Trueflation-Index einrechnen (Strom bewusst nicht — siehe 2.2b).
- **US 2.3:** Als Betreiber will ich die Berechnungsformel und -parameter versioniert dokumentiert haben (Changelog), damit jede Änderung am Index nachvollziehbar bleibt und keine stille Verzerrung entsteht.
- **US 2.4:** Als Betreiber will ich Unit- und Regressionstests gegen bekannte historische Referenzwerte haben, damit eine Formel-Änderung nicht unbemerkt die gesamte Zeitreihe verfälscht.
- **US 2.5:** Als Besucher will ich, dass die Trueflation-Linie im Chart erst ab dem Jahr erscheint, ab dem alle Zutaten tatsächlich verfügbar sind (2010, limitiert durch die Strukturerhebung mit Mietdauer-Dimension), mit sichtbarem Hinweis statt stillem Fehlen.
- **US 2.6:** Als Betreiber will ich die COICOP-Hauptgruppen-Mapping-Tabelle (HABE ↔ LIK) als dokumentiertes, versioniertes Artefakt pflegen, damit die Gewichtszuordnung reproduzierbar und nachprüfbar bleibt.

### Epic 3 — Visualisierung & UX
- **US 2.7 (Testkonzept über Unit-Tests hinaus):** Als Betreiber will ich ein Testkonzept, das mehr abdeckt als die Berechnungslogik (US 2.4):
  - **Datenvertrags-Tests:** prüfen bei jedem Lauf, ob die Quelle noch die erwartete Struktur liefert (Spalten, Typen, Wertebereiche) — schlägt fehl, bevor falsche Werte in die Berechnung laufen.
  - **End-to-End-Test:** ein Durchlauf von Quellenabruf bis gerendertem Chart, damit ein Bruch zwischen Pipeline und Frontend nicht erst live auffällt.
  - **Visuelle Regression** für das Chart und das OG-Bild: verhindert, dass ein CSS-/Library-Update die Darstellung unbemerkt zerlegt.
- **US 3.1:** Als Besucher will ich in den ersten Sekunden die Kernaussage erfassen, ohne den Chart interpretieren zu müssen — eine grosse, prominente Gegenüberstellung zuoberst plus den laienverständlichen Erklärsatz. Der Chart darunter ist der Beleg, nicht die erste Botschaft.
  *AC (zwei Kernzahlen, nicht eine):* (1) **aktuelle Jahresrate** im Vergleich (z.B. "Offiziell 1,2% — Trueflation 3,8%"); (2) **kumulierter Kaufkraftverlust** seit Beginn der Trueflation-Reihe (z.B. "Seit 2010: offiziell X% Kaufkraft verloren — nach Trueflation Y%") — der Vergleichszeitraum beginnt zwingend 2010, da davor kein Trueflation-Wert existiert. Kumulierte Werte sind eindrücklicher und teilbarer als Jahresraten, weil sie die Grössenordnung der Differenz über Zeit sichtbar machen.
  *AC (Stichtag-Normierung — sonst Äpfel/Birnen):* LIK aktualisiert monatlich, die Trueflation-Korrekturfaktoren jährlich. Beide Kernzahlen werden zwingend auf **denselben Stichtag** normiert (letzter gemeinsam verfügbarer Datenstand) und dieser wird sichtbar deklariert. Ohne das würde ein aktueller LIK-Wert gegen einen bis zu 12 Monate älteren Trueflation-Wert gestellt.
  *AC (Symmetrie — wichtig für Glaubwürdigkeit):* Die Darstellung muss **beide Richtungen** aushalten. Trueflation kann in einzelnen Perioden auch **unter** dem offiziellen LIK liegen (belegt: der Comparis/KOF-Alternativindex lag 2023 erstmals unter dem offiziellen Wert — die Richtung der Abweichung kippt je nach Wirtschaftslage). Formulierungen, Farbcodierung und OG-Bild dürfen nicht implizit voraussetzen, dass Trueflation immer höher ist; andernfalls wirkt der umgekehrte Fall wie ein Darstellungsfehler. Eine Seite, die auch die Gegenrichtung sauber zeigt, gewinnt methodische Glaubwürdigkeit — genau das unterscheidet sie von einem Boulevard-Warenkorb.
- **US 3.2:** Als Betreiber will ich, dass beim Teilen eines Links automatisch ein OG-/Social-Preview-Bild erscheint, das die aktuelle Differenz offiziell-vs-Trueflation zeigt, sodass jeder geteilte Link selbst zur Botschaft wird (dynamisch im Pipeline-Lauf generiert). Ohne definiertes OG-Image wirkt jeder geteilte Link leer und würgt Reichweite ab.
- **US 3.3:** Als Laie will ich die Seite in einer einfachen Standardansicht sehen (Kernaussage + 2 Hauptlinien LIK/Trueflation), während Fachnutzer Overlays, Geldmenge, Leitzins, Ereignis-Layer und Detailtiefe auf Abruf zuschalten (progressive Disclosure). Nicht alles gleichrangig auf einmal — gestufte Tiefe je nach Interesse.
- **US 3.4:** Als Besucher will ich die drei Linien (LIK, Trueflation, Geldmenge) in einem interaktiven Zeitreihen-Chart sehen, mit Zoom und definierten Zeitraum-Presets.
  *AC (Presets, weil die Linien gestaffelt starten):* Mindestens drei Voreinstellungen — **"Seit 2010" (alle drei Linien vollständig, Default)**, "Seit 1975" (LIK + Geldmenge), "Maximum ab 1914" (nur LIK durchgehend). Ohne Presets landet der Besucher entweder in einer Ansicht, in der zwei von drei Linien fast leer sind, oder er sieht die 110-jährige Tiefe nie. Zusätzlich freie Zoom-/Bereichswahl.
  *AC (Umschalter Darstellungsart):* Sichtbare Umschaltmöglichkeit zwischen indexierten Niveaus (Default) und Jahreswachstumsraten (siehe 2.0).
- **US 3.5:** Als Besucher will ich den SNB-Leitzins als Overlay ein-/ausblenden können.
- **US 3.6:** Als Besucher will ich pro Datenpunkt/Linie die Quelle und den Stand per Tooltip einsehen.
- **US 3.7:** Als Besucher will ich im Moment des Betrachtens verstehen, dass die Geldmengen-Linie etwas anderes misst als die beiden Inflationslinien — ein niedrigschwelliges UX-Element direkt am Chart (Info-Icon/Kurzhinweis beim Einblenden der Geldmenge), nicht nur Text auf der Methodik-Seite, die kaum jemand liest (siehe methodische Pflichtklarstellung 2.3).
- **US 3.8:** Als Besucher will ich einen Kaufkraft-Rechner nutzen: Eingabe Betrag (CHF) + Startjahr, Ausgabe immer bezogen auf den aktuellsten verfügbaren Datenstand ("jetzt"), nicht auf ein wählbares Zieljahr (hält die UI auf einen Eingabewert statt zwei begrenzt).
  *AC (Jahresbereich):* Startjahre **ab 1914 wählbar** (volle LIK-Tiefe nutzbar), aber der **Default steht auf einem Jahr, in dem alle Werte existieren** (2010 oder später) — damit der Erstnutzer ein vollständiges Ergebnis sieht statt sofort eine Grenzfall-Meldung. Für frühere Jahre erscheint der LIK-Wert normal, die nicht verfügbaren Werte als klarer Hinweis (siehe Grenzfälle unten).
  *Platzierung:* prominent auf der Startseite (nicht nur als separater Screen weggeklickt) — es ist das emotionalste, teilbarste Feature und gehört in die erste Interaktionsebene.
  *AC:* Ausgabe zeigt zwei Kernwerte — Kaufkraft nach LIK, Kaufkraft nach Trueflation. **Geldmengen-Verwässerung wird NICHT im Rechner gezeigt** (beantwortet keine persönliche Kaufkraft-Frage, sondern eine System-Kennzahl — bleibt ausschliesslich im Hauptchart als Linie 3).
  *AC (Grenzfall a — strukturelle Nichtverfügbarkeit Trueflation):* Für Startjahre vor 2010 wird kein Trueflation-Wert berechnet oder geschätzt, sondern klar als "Trueflation-Index existiert erst ab 2010" ausgewiesen — kein Interpolieren.
  *AC (Grenzfall b — temporäre Datenlücke):* Falls der aktuellste Datenpunkt einer Quelle noch nicht publiziert oder ein Pipeline-Lauf fehlgeschlagen ist, wird der letzte bekannte Wert verwendet, sichtbar markiert mit "vorläufig, Datenstand [Datum]" — kein Leerwert, keine Lücke im Chart.
  *AC (Teilbarkeit):* Jedes Rechnerergebnis ist über eine URL mit Parametern direkt teilbar (z.B. `?betrag=100&jahr=2015`), sodass ein konkretes Ergebnis — nicht nur die Startseite — verlinkt werden kann. Verstärkt US 3.13 erheblich bei minimalem Aufwand; das OG-Bild (US 3.2) sollte für solche Links idealerweise das jeweilige Ergebnis zeigen.
- **US 3.9:** Als Besucher will ich im Kaufkraft-Rechner zusätzlich sehen, was derselbe Betrag heute wert wäre, hätte ich ihn stattdessen in SMI, Gold oder Bitcoin gehalten — nutzt dieselben Datenquellen wie das Overlay-Modul (2.5).
  *AC (Grenzfälle je Referenz, konkret statt Platzhalter):* Für Startjahre vor Existenz der jeweiligen Referenz wird kein Wert berechnet, sondern der konkrete Verfügbarkeitsbeginn genannt ("Bitcoin existiert erst ab [Jahr]", "SMI existiert erst ab 1988"). Die exakten Verfügbarkeitsbeginne je Reihe werden in V8 real geprüft und danach im Content fixiert — keine geschätzten Jahreszahlen im Live-Text.
  *Datenquellen (recherchiert):* **Twelve Data** als primäre Quelle für SMI, Gold und BTC (echte dokumentierte API, stabiles Schema, Free-Tier 800 Req/Tag, ein Integrationsaufwand für alle drei). CoinGecko als BTC-Fallback. Gold braucht historische USD/CHF-Umrechnung als Zusatzschritt.
- **US 3.10:** Als mobiler Besucher will ich eine für kleine Bildschirme eigens gestaltete Ansicht, nicht ein geschrumpftes Desktop-Chart. Konkret: Kernaussage (grosse Zahl) und Rechner zuerst, Chart mit reduzierter Standard-Linienzahl (LIK/Trueflation), Overlays/Ereignis-Layer über ein aufklappbares Menü statt permanent sichtbar, Touch-taugliche Bedienung (Zoom, Tap-Tooltips). Mobile ist eine eigene Design-Aufgabe, kein Skalierungsfall.
- **US 3.11:** Als Besucher mit Farbfehlsichtigkeit will ich die Linien auch ohne Farbunterscheidung auseinanderhalten können (Linienmuster/direkte Beschriftung zusätzlich zur Farbe).
- **US 3.12:** Als Besucher will ich sinnvolle Übergangszustände sehen: Beim Laden live nachgeladener Daten (Twelve-Data-Overlays) ein dezenter Ladeindikator/Skeleton statt Leersprung; die statisch vorgerenderten Kerndaten (LIK/Trueflation/Geldmenge) sind sofort da. Kein Layout-Sprung, wenn Overlay-Daten nachträglich eintreffen.
- **US 3.13:** Als Besucher will ich aktiv teilen können — **zwei getrennte Mechanismen, nicht zu verwechseln mit US 3.2:** (a) **Link teilen**: kopierbare URL, die den aktuellen Chart-Zustand (Zeitraum, aktive Linien, Darstellungsart) als Parameter enthält, sodass der Empfänger dieselbe Ansicht sieht; (b) **Bild herunterladen**: PNG-Export des aktuellen Chart-Ausschnitts zur Verwendung in Präsentationen/Artikeln, mit eingebrannter Quellenangabe und CC-BY-Hinweis.
  *Abgrenzung zu US 3.2:* Jenes beschreibt die **automatische Link-Vorschau** (OG-Image, erscheint ohne Zutun des Nutzers, wenn ein Link irgendwo gepostet wird). US 3.13 sind die **aktiven Teilen-Funktionen** auf der Seite selbst.
- **US 3.14:** Als Besucher will ich optional einen historischen Ereignis-Layer auf der Zeitachse einblenden können (z.B. Ende Golddeckung, Ölkrisen, Finanzkrise 2008, Frankenschock 2015, Inflationsschub 2022), der die 110-jährige Datentiefe erlebbar macht — nutzt die einzigartige Reihe ab 1914, die vergleichbare Seiten nicht haben.
- **US 3.15:** Als Besucher will ich, dass das Chart auch bei langen Zeiträumen schnell lädt (besonders mobil) — adaptives Downsampling, **gekoppelt an die Länge des dargestellten Zeitraums, nicht an ein bestimmtes Preset**.
  *AC:* Ab einer Zeitraumlänge, bei der Monatswerte visuell ohnehin nicht mehr auflösbar sind (Richtwert: mehr als ~25 Jahre), werden Jahreswerte gezeigt; darunter Monatswerte. Der Default-Preset "Seit 2010" (15 Jahre, US 3.4) liegt damit im **Monatsbereich** — Jahreswerte wären dort mit nur 15 Punkten zu grob und würden die Kernaussage verschenken. Erst "Seit 1975" und "Maximum ab 1914" laufen über die Jahreswert-Darstellung. Beide Auflösungen werden vorberechnet als getrennte Datenfiles (kein Live-Rechnen im Browser).
- **US 3.16:** Als Besucher will ich pro Linie einen klaren Statuszustand sehen. Vier Zustände, unterschiedlich zu kommunizieren:
  1. **Aktuell** — Normalfall, keine Kennzeichnung nötig.
  2. **Vorläufig/veraltet** — letzter bekannter Wert wird gezeigt, mit Datumshinweis (z.B. provisorischer KVPI-Wert nach US 1.8).
  3. **Temporär nicht verfügbar (Ausfall)** — Linie ausgegraut, Hinweis in der Legende ("Gold-Daten derzeit nicht verfügbar"). Das ist ein **Problem**: Ausfall eines optionalen Overlays bleibt unauffällig, Ausfall einer Kernlinie wird prominenter kommuniziert.
  4. **Strukturell nicht existent im gewählten Zeitraum** — zoomt der Besucher z.B. auf 1950–1960, existieren Trueflation, Geldmenge und alle Overlays dort schlicht nicht. Linie ausgegraut mit Hinweis "existiert erst ab [Jahr]". Das ist **kein Problem, sondern Datenrealität** und muss sprachlich klar von Zustand 3 unterschieden sein.
  *AC:* Die Seite bricht in keinem Zustand — es wird nie eine leere Fläche ohne Erklärung gezeigt.
- **US 3.17:** Als Besucher will ich pro Kennzahl ein prominentes "Stand: [Datum]"-Badge sehen (pro Quelle, nicht global — da die Quellen unterschiedliche Rhythmen haben und ein globales Datum irreführend wäre). Das Erste, was ein skeptischer Besucher zur Aktualität sehen will.
- **US 3.18:** Als Besucher will ich zwischen Hell- und Dunkelmodus umschalten können; meine Wahl wird lokal respektiert (ohne personenbezogenes Tracking), Standard folgt der Systemeinstellung. Beide Modi erfüllen WCAG-AA-Kontrast, auch für die Linienfarben.

### Epic 4 — Transparenz & Methodik
- **US 4.1:** Als Besucher will ich eine Methodik-Seite pro Index lesen können (Formel, Quellen, Grenzen, letzte Änderung).
- **US 4.2:** Als Besucher will ich den Disclaimer klar sichtbar haben (siehe Abschnitt 7).
- **US 4.3:** Als Besucher will ich pro Kennzahl sehen, wann sie zuletzt aktualisiert wurde und wann die nächste Aktualisierung erwartet wird.
- **US 4.4:** Als Besucher will ich auf der Startseite einen kurzen, sachlichen Definitionsblock lesen ("Was ist Trueflation?"), bevor ich das Chart sehe — sachlich-neutral, ohne Prosa, aber laienverständlich formuliert. Erklärt den Begriff und grenzt ihn kurz von verwandten Konzepten ab (offizielle Inflation, gefühlte Inflation, Comparis/KOF-Index), damit keine Verwechslung entsteht. **Textentwurf ausstehend, siehe Content (Abschnitt 10).**
- **US 4.5:** Als Besucher will ich die Berechnung nachvollziehen können — die Formel in Worten/Mathematik, der Datenursprung (Links zu den amtlichen Originalquellen, die jeder selbst herunterladen kann) und der Formel-Changelog sind öffentlich einsehbar. **Keine eigenen Rohdaten-Downloads** (Entscheidung): Formel + verlinkter Datenursprung genügen für Nachvollziehbarkeit, ohne dass aufbereitete Zwischendaten gehostet werden müssen. Code bleibt aus Sicherheitsgründen privat.
- **US 4.6:** Als Betreiber will ich pro Kennzahl die Quellenangabe (Autor, Titel, Link zum Datensatz) sichtbar ausweisen, da dies für BFS/SNB-Daten (Bundesstatistikgesetz) vorgeschrieben ist und für Marktdatenanbieter (Twelve Data) deren Nutzungsbedingungen entspricht.
- **US 4.7:** Als Dritter (Journalist, Entwickler, Bot) will ich die aktuellsten Werte pro Kennzahl über einen maschinenlesbaren Feed (JSON unter fester URL, z.B. `/feed.json`, optional RSS) abrufen können, damit ich die Daten weiterverwenden/-verbreiten kann — jede Weiterverwendung nennt trueflation.ch als Quelle. Bei der statischen Git-Architektur fast geschenkt: der Feed ist eine weitere Ausgabedatei desselben Pipeline-Laufs. Fehlerhafte Werte verbreiten sich dadurch schneller — die Plausi-Prüfung (US 1.7) fängt das vorher ab.
- **US 4.8:** Als Suchender will ich die Seite über organische Suche finden ("wahre Inflation Schweiz", "echte Teuerung", "Kaufkraft CHF"). **Bewusste Trennung, kein Widerspruch zur Ton-Entscheidung:** Diese Begriffe werden als Suchbegriffe bedient (so suchen Menschen tatsächlich), aber nicht als Claim/Positionierung auf der Seite verwendet — Meta-Keywords ≠ Selbstbeschreibung. Braucht Meta-Tags (Title/Description pro Seite), strukturierte Daten (schema.org, z.B. Dataset), sprechende URLs und eine Sitemap — mit Next.js schlank umsetzbar. Organische Suche ist der zweite, günstigere Wachstumskanal neben Community-Teilen.
- **US 4.9 (eigene Lizenz — sonst darf niemand etwas weiterverwenden):** Als Betreiber will ich die Nutzungsbedingungen für die von trueflation.ch erzeugten Inhalte (berechnete Werte, Grafiken, Feed-Daten) explizit angeben. Ohne Lizenzangabe gilt automatisch das strengste Urheberrecht — was dem erklärten Ziel (Feed US 4.7, Teilen US 3.13, Embed, Community-Verbreitung) direkt widerspricht. **Entscheidung getroffen: CC BY** (Namensnennung, kommerzielle Nutzung erlaubt) — bewusst nicht CC BY-NC, da Medienhäuser kommerziell sind und eine NC-Klausel genau die journalistische Weiterverwendung blockieren würde, die Reichweite bringt.
  *AC (Platzierung an drei Stellen):* (1) Über/Disclaimer- bzw. Impressum-Seite mit Lizenztext-Link; (2) Footer jeder Seite als Kurzhinweis; (3) Lizenzfeld in der JSON-Feed-Ausgabe (US 4.7), damit auch maschinelle Weiterverwender die Bedingung sehen.
  *Abgrenzung:* Die Lizenz gilt nur für trueflation.ch-eigene Inhalte. Die zugrundeliegenden amtlichen Daten bleiben davon unberührt — deren Lizenzbedingungen und Quellenangabepflicht gelten weiterhin (US 4.6).
- **US 4.10:** Als Besucher will ich eine öffentliche "Was hat sich geändert"-Seite sehen (Formel-Änderungen aus US 2.3, Methodik-Anpassungen, neue Datenquellen, korrigierte Werte aus US 1.13). Für ein Projekt, dessen USP Transparenz ist, ist eine sichtbare Änderungshistorie ein Vertrauens-Asset — nicht nur ein internes Log.
- **US 4.11 (Fehlermeldung — bei einem Community-Projekt zwingend):** Als Besucher will ich einen niedrigschwelligen Weg, einen vermuteten Fehler oder eine methodische Rückfrage zu melden. Aktuell existiert nur die Impressum-E-Mail, die niemand sucht.
  *AC:* Sichtbarer, kurzer Hinweis auf Methodik- und Datenquellenseite ("Fehler gefunden? [Kontakt]"), der auf die Kontakt-E-Mail führt. Eingegangene Korrekturen erscheinen — sofern berechtigt — in der Änderungshistorie (US 4.10). Das ist zugleich Qualitätssicherung: die Community findet Fehler, die kein automatischer Check erkennt.


### Epic 5 — Betrieb & Wartbarkeit
- **US 5.1:** Als Betreiber will ich neue Datenquellen (z.B. Reallohnindex, kantonale Daten in v2) modular hinzufügen können, ohne bestehende Pipeline-Logik umzubauen.
- **US 5.2:** Als Betreiber will ich Sprachinhalte (DE zuerst) so strukturieren, dass FR/IT/EN später ohne Architekturänderung ergänzbar sind (Content-Layer getrennt von Berechnungslayer).
  *AC (über reine Textübersetzung hinaus — sonst wird v2 doch zum Umbau):* Von Anfang an vorbereiten: **Zahlen- und Datumsformatierung als Funktion der Sprache** (Schweizer Konvention 1'234.50 im Deutschen, 1 234,50 im Französischen), **Fachbegriff-Glossar** je Sprache (LIK/IPC/IPC, Teuerung/renchérissement/rincaro), sprachabhängige URLs, und Chart-Beschriftungen aus dem Content-Layer statt hartcodiert. Der Markenname "Trueflation" bleibt in allen Sprachen unverändert.
- **US 5.3:** Als Betreiber will ich Pipeline-Fehler und Freigabe-Anfragen (aus US 1.7) über bestehende Notification-Infrastruktur erhalten, statt eine neue aufzubauen.
- **US 5.4:** Als System will ich die Seite als komplett statische Files ausliefern können (Next.js Static Generation), sodass sie auch bei Ausfall des Droplets über CDN/GitHub Pages verfügbar bleibt — maximale Verfügbarkeit bei minimalem Betriebsaufwand.
- **US 5.5:** Als Betreiber will ich über jeden publizierten Datenstand eine Prüfsumme (Hash) bilden, damit nachträgliche Manipulation an gespeicherten Datendateien auffällt — verstärkt das Vertrauensversprechen bei fast null Zusatzaufwand (Git-basiert).
- **US 5.6:** Als Betreiber will ich privacy-freundliche, aggregierte Reichweitenmessung (z.B. Plausible/Umami, self-hosted, cookiefrei, keine personenbezogenen Daten) einsetzen, um zu sehen ob das Community-Wachstumsziel (US 3.13) erreicht wird — ohne den Datenschutz-Anspruch zu verletzen und ohne Consent-Banner.
- **US 5.7:** Als Betreiber will ich Impressum und Datenschutzerklärung mit einem Pseudonym als Träger und einer Kontakt-E-Mail bereitstellen, sodass ich nach aussen nicht mit Klarnamen auftrete, aber die revDSG-Pflicht zur Nennung eines Verantwortlichen und einer Kontaktmöglichkeit erfülle.
  *AC:* Kontakt-E-Mail und Pseudonym als Platzhalter im Content hinterlegen.
  **⚠️ TODO (Betreiber, vor Launch):** Platzhalter `[KONTAKT-EMAIL]` und `[PSEUDONYM/PROJEKTNAME]` durch die tatsächlichen Werte ersetzen. Pseudonym-Betrieb ist ein rechtlicher Graubereich — vor Launch einmal anwaltlich kurz prüfen lassen (siehe Risiko 6).

---

## 5. Security & Non-Functional Requirements

- **Keine Benutzerkonten, kein Login für Besucher** — Angriffsfläche bewusst klein halten, keine personenbezogenen Daten verarbeiten.
- **Admin-Bereich (Pipeline-Override, Quellenkonfiguration) zwingend authentifiziert**, nicht öffentlich erreichbar.
- **Quellen-URLs als feste Whitelist**, keine frei administrierbaren URLs (SSRF-Schutz).
- **Plausibilitätsprüfung vor Publikation** neuer Datenpunkte (siehe US 1.7) — Kernschutz gegen fehlerhafte/kompromittierte Quellenwerte, da falsche Zahlen bei einer Vertrauens-basierten Seite den grössten Reputationsschaden anrichten.
- **HTTPS/TLS** für die gesamte Seite, keine Ausnahme.
- **Barrierefreiheit (WCAG AA als Ziel):** Farbcodierung nie alleinige Informationsquelle (US 3.11); Tastaturnavigation für alle interaktiven Elemente; Screenreader-taugliche Beschriftung (ARIA) inkl. Textalternative für Chart-Kernaussagen; ausreichende Kontraste in beiden Modi. Details siehe Abschnitt 6a.
- **Kein personenbezogenes Tracking.** Aggregierte, cookiefreie, self-hosted Reichweitenmessung (US 5.6) ist erlaubt und erwünscht — sie misst nur, ob das Projekt genutzt wird, ohne Personen zu erfassen, und steht damit nicht im Widerspruch zum Datenschutz-Anspruch.
- **Datenlizenzen (geprüft):** BFS/SNB-Daten unterliegen dem Bundesstatistikgesetz — freie Nutzung, Quellenangabe Pflicht. Für nicht-kommerzielle Nutzung unproblematisch; pro genutztem Datensatz einmal das Lizenzsymbol auf opendata.swiss prüfen (mögliche "kommerzielle Nutzung nur mit Bewilligung"-Kennzeichnung betrifft Non-Profit nicht). Marktdaten: **Twelve Data** (einzige Quelle für SMI/Gold/BTC, kein Fallback) — Attributions-/Nutzungsbedingungen vor Launch prüfen (Betreiber-TODO). Quellenangabe pro Kennzahl ist Pflicht (US 4.6).

---

## 6. Screens

1. **Startseite / Hauptchart** — **grosse Kernaussage zuoberst** (Gegenüberstellung offiziell vs. Trueflation + Erklärsatz), Kaufkraft-Rechner prominent, darunter 3 Kernlinien (LIK, Trueflation, Geldmenge M2) + Leitzins-Overlay + optionale Referenz-Overlays (Gold/BTC/SMI) + optionaler historischer Ereignis-Layer, Zeitraum-Presets (Default "Seit 2010") und freier Zoom, Umschalter Niveau/Rate, Datenstand-Badges, Hell/Dunkel-Umschalter, Disclaimer-Link. Einfache Standardansicht mit progressive Disclosure (Details/Overlays auf Abruf).
2. **Methodik-Seite** — pro Index eine Sektion: Formel, Quellen, bekannte Grenzen, Änderungshistorie; Abgrenzung zu Comparis/KOF; Erklärung M2-Wahl; Nachrechenbarkeit (Formel + verlinkter Datenursprung + Changelog)
3. **Kaufkraft-Rechner** — Eingabe Betrag + Startjahr, Ausgabe heutiger Wert nach LIK vs. Trueflation, plus optionale Werte SMI/Gold/BTC. Grenzfälle betreffen ausschliesslich Startjahre **vor 2010** (kein Trueflation-Wert) bzw. vor dem jeweiligen Verfügbarkeitsbeginn der Referenz (BTC ~2010/2011, in V8 zu fixieren). Ab 2010 liefert der Rechner im Normalfall vollständige Werte — der Default liegt deshalb dort
4. **Datenquellen-Transparenzseite** — tabellarische Übersicht aller Quellen mit Stand/Lizenz/Quellenangabe/Link (Inhalt aus Abschnitt 3, live gerendert)
5. **Über/Disclaimer-Seite** — Projektzweck, Nicht-kommerziell-Hinweis, vollständiger Disclaimer
6. **Änderungshistorie** — öffentliche "Was hat sich geändert"-Seite (Formel-Änderungen, Methodik-Anpassungen, neue Quellen, korrigierte Werte) — Vertrauens-Asset, US 4.10
7. **Impressum & Datenschutz** — Träger/Verantwortlicher (Pseudonym/Projektname + Kontakt-E-Mail, siehe US 5.7 / Risiko 6), Datenschutzerklärung (Pflicht bei Analytics/Serverlogs unter revDSG), Kontaktmöglichkeit

---

## 6a. Design & visuelle Identität

**Gewählte Richtung: Fintech-präzise (Daten-Tool-Ästhetik).** Signalisiert Kompetenz und technische Präzision, passt zur finanzaffinen Kern-Community. Die einzige Schwäche dieser Richtung (kann Laien abschrecken) wird über UX abgefangen: die "grosse Zahl" und der laienverständliche Erklärsatz (siehe US 3.1) holen Nicht-Techniker ab, während die Datendarstellung darunter präzise bleibt.

**Hell/Dunkel: beide Modi, umschaltbar.** Bei Fintech-Ästhetik Standard-Erwartung. Umschalter sichtbar, Präferenz wird (systemseitig bzw. lokal, ohne personenbezogenes Tracking) respektiert. Dunkelmodus als möglicher Default (passt zur Daten-Tool-Anmutung), Entscheidung Jarvis/Design-Umsetzung überlassen.

**Design-Prinzipien (Vorgabe für die Umsetzung, damit kein generisches Framework-Default entsteht):**
- **Zahl vor Zierde:** Daten sind der Held. Kein dekoratives Beiwerk, das von den Werten ablenkt. Grosszügiger Weissraum/Negativraum, klare Hierarchie.
- **Typografie:** serifenlose, technisch-präzise Schrift für Fliesstext (z.B. Inter); **monospace-Akzente für alle Zahlenwerte** (Indexstände, Prozente, Beträge) — verstärkt die Präzisions-Anmutung und verbessert die Vergleichbarkeit untereinanderstehender Zahlen.
- **Farbe sparsam und funktional:** neutrale Basis (Grautöne/Anthrazit im Dunkelmodus), Farbe fast ausschliesslich zur Datenunterscheidung. Jede der drei Kernlinien bekommt eine feste, konsistente Farbe (durchgängig auf allen Screens/im Feed-Preview gleich). Trueflation-Linie als visueller Fokus (kräftigster Akzent).
- **Dichte mit Eleganz:** viele Daten, aber nicht überladen — luftige Anordnung, klare Trennung von Bereichen.
- **Konsistente Farbcodierung als System:** LIK, Trueflation, Geldmenge behalten ihre Farbe überall (Chart, Rechner, Legende, Badges, OG-Image) — Wiedererkennbarkeit als Vertrauensanker.

**Barrierefreiheit als Designvorgabe (nicht nachträglich):**
- WCAG AA als Zielstandard (Kontrastverhältnisse in beiden Modi, auch für die Akzentfarben).
- Farbe nie alleinige Informationsquelle (Linienmuster/direkte Beschriftung zusätzlich, siehe US 3.11).
- Tastaturnavigation für alle interaktiven Elemente (Zeitraumfilter, Overlay-Checkboxen, Rechner, Modus-Umschalter).
- Screenreader-taugliche Beschriftung von Chart und Bedienelementen (ARIA), Chart-Kernaussagen auch als Textalternative verfügbar.

**Assets:**
- **Favicon** und Logo (schlicht, funktioniert in beiden Modi).
- **OG-/Social-Preview-Bild (US 3.2):** was beim Teilen eines Links erscheint. Kernasset für das Community-Wachstum — ohne definiertes OG-Image wirkt jeder geteilte Link leer/kaputt und würgt Reichweite ab. Idealfall: das Preview-Bild zeigt automatisch die aktuelle Differenz offiziell-vs-Trueflation, sodass jeder geteilte Link selbst zur Botschaft wird (dynamisch generiert im Pipeline-Lauf, konsistent mit statischer Architektur).

---

## 7. Disclaimer (finaler Text-Entwurf)

> trueflation.ch ist ein unabhängiges, nicht-kommerzielles Community-Projekt. Die offiziellen Werte (LIK, SNB) werden unverändert aus amtlichen Quellen übernommen; der Trueflation-Index ist eine **eigene Berechnung auf Basis amtlicher Daten** und keine amtliche Zahl. Die individuelle Kostensituation kann erheblich abweichen. Aktualisierungsfrequenz und Datenstand unterscheiden sich je Kennzahl und sind pro Kennzahl transparent ausgewiesen. Diese Seite ersetzt keine offizielle Statistik (BFS, SNB) und keine Anlage- oder Finanzberatung. Keine Haftung für Richtigkeit, Vollständigkeit oder Aktualität der Angaben.

---

## 7a. Betrieb, Kosten & Nachhaltigkeit

Für ein nicht-kommerzielles Projekt, das dauerhaft laufen und Vertrauen tragen soll, ist die Betriebsperspektive kein Nebenaspekt.

**Laufende Kosten (bekannt zu machen, damit nichts überrascht):**
- Domain `.ch` (jährlich)
- Anteil am Projekte-Droplet (geteilt mit anderen Projekten)
- Analytics self-hosted: kein Zusatzentgelt, aber Rechenlast auf demselben Droplet
- Twelve Data: Free-Tier ausreichend geplant — **Kostenrisiko, falls der Anbieter den Free-Tier einschränkt oder einstellt.** Dann entweder Overlays deaktivieren oder zahlen. Kein Kernrisiko, da die drei Hauptlinien ausschliesslich auf kostenlosen amtlichen Quellen beruhen.
- Amtliche Datenquellen (BFS/SNB): kostenfrei

**Bus-Faktor / Nachfolge (offen, bewusst benannt):** Das Projekt hängt an einer Person plus einem autonomen Agenten. Fällt beides aus, friert die Seite ein — sie bleibt dank statischer Auslieferung (US 5.4) erreichbar, aber die Daten veralten stillschweigend.
- **Minimalmassnahme (umsetzbar):** Der Datenstand-Hinweis (US 3.17) und die Veraltet-Kennzeichnung (US 1.4) sorgen dafür, dass eine eingefrorene Seite als solche erkennbar ist statt falsche Aktualität vorzutäuschen. Das ist die wichtigste Vorkehrung — eine tote Seite darf nicht wie eine lebende aussehen.
- **Offen:** Ob und wie das Projekt bei dauerhaftem Ausfall des Betreibers übergeben würde, ist nicht geregelt. Für v1 akzeptiert; bei wachsender Nutzung neu zu bewerten.

**Governance methodischer Änderungen:** Änderungen an der Formel oder an Datenquellen entscheidet der Betreiber. Verbindlich ist nur, dass jede Änderung im Formel-Changelog (US 2.3) und in der öffentlichen Änderungshistorie (US 4.10) erscheint — keine stillen Anpassungen. Ein Gremium oder Community-Mitbestimmung ist für v1 bewusst nicht vorgesehen (Aufwand ohne erkennbaren Nutzen bei dieser Projektgrösse).

**Browser-/Geräte-Support:** aktuelle Versionen der gängigen Browser (Chrome, Firefox, Safari, Edge) sowie mobiles Safari und Chrome. Kein Support für Legacy-Browser — die Zielgruppe rechtfertigt den Aufwand nicht. Kein JavaScript-freier Fallback für das interaktive Chart, aber: die statischen Inhaltsseiten (Methodik, Disclaimer, Impressum, Datenquellen) müssen auch ohne JavaScript lesbar sein.

**Datenwachstum:** Das Git-Repo wächst mit jedem Datenpunkt. Grössenordnung unkritisch (einige Dutzend Zeitreihen, überwiegend monatlich/jährlich; nur Marktdaten täglich) — jährlich einmal auf Repo-Grösse prüfen. Falls Marktdaten-Tagesreihen dominieren: Ausdünnung älterer Marktdaten auf Wochen-/Monatswerte erwägen, da die Kernaussage der Seite ohnehin nicht auf Tagesgenauigkeit beruht.

**Traffic-Spitzen:** Durch statische Auslieferung (US 5.4) unkritisch — die Seite skaliert über CDN. Einziger dynamischer Punkt ist das self-hosted Analytics; fällt es unter Last aus, ist das folgenlos für die Besucher.

---

## 8. Roadmap

- **v1:** LIK, Trueflation (fixer Warenkorb + Verkettung + KVPI/HABE-Gewichtung + Miet-Korrektur, ab 2010), Geldmenge (M2), Leitzins-Overlay, generisches Referenzlinien-Overlay-Modul (Gold/BTC/SMI), historischer Ereignis-Layer, Zeitraum-Presets, Umschalter Niveau/Rate, Kaufkraft-Rechner, "grosse Zahl"-Kernaussage, progressive Disclosure, Hell/Dunkel-Modus, dynamisches OG-Preview-Bild, SEO-Grundausstattung, Methodik- und Transparenzseiten mit Update-Status pro Kennzahl, Nachrechenbarkeit (Formel + verlinkter Datenursprung), maschinenlesbarer Feed (JSON), teilbare Rechner-Links, öffentliche Änderungshistorie, eigene Inhaltslizenz (CC BY), Teilen-Funktion, aggregierte Analytics, WCAG-AA-Barrierefreiheit, DE only, automatisierte Pipeline mit Plausibilitätsprüfung
- **v2:** Mehrsprachigkeit (FR/IT/EN), Embed-Funktion (iframe für Blogs/fremde Seiten — Reichweiten-Multiplikator), ggf. kantonale Zusatzansicht für Miete/Prämien, Reallohn-Overlay (BFS Reallohnindex — Kandidat), ElCom-Strom nur falls je eine konkrete LIK-Schwäche belegt wird, umschaltbare Geldmenge M1/M2/M3 (v1 zeigt nur M2)
- **v3 (offen, nicht spezifiziert):** öffentliche API-Endpunkte für Dritte (über den reinen Feed hinaus), Benachrichtigungsfunktion bei neuen Datenpunkten

---

## 9. Getroffene Entscheidungen, bekannte Einschränkungen & Restrisiken

**Keine offenen Blocker.** Alle ursprünglichen Blocker sind entschieden (Verschmelzungslogik: Option A kombiniert, siehe 2.2; Strukturbrüche: Hauptgruppen-Ebene, siehe 2.2a; Zugriffsart KVPI/Strukturerhebung: verifiziert, siehe Abschnitt 3). **Kaufkraft-Rechner ist definiert (siehe US 3.8) und bleibt in v1.**

**Bekannte Einschränkungen (technisch eingeplant, keine Blocker):**
1. **Miet-Korrektur-Aktualität:** Die Mietdauer-Differenz wird jährlich aus der Strukturerhebung rekalibriert, der Mietpreisindex läuft vierteljährlich. Die Korrektur ist damit bis zu ein Jahr alt. Transparent ausweisen ("Wohnkosten-Korrektur zuletzt kalibriert: [Jahr]").
2. **STAT-TAB-Abschaltung Anfang 2028** — Migration zu "Swiss Stats Explorer" angekündigt. Pipeline braucht eine Abstraktionsschicht zwischen Datenquelle und Kernlogik, damit der Plattformwechsel 2028 kein Rewrite auslöst.
3. **Unterschiedliche Startjahre je Linie** — Linie 1 ab 1914, Linie 2 erst ab 2010, Linie 3 sauber ab 1975. Muss im Chart und Kaufkraft-Rechner klar kommuniziert werden, nicht als Datenfehler wirken.
4. **Gold/BTC/SMI-Datenquelle** — Twelve Data als primäre Empfehlung (echte API, ein Integrationsaufwand für alle drei, Free-Tier ausreichend), CoinGecko als BTC-Fallback. Kein Blocker für P0/P1, da Kernchart unabhängig funktioniert.

**Getroffene Entscheidungen (keine Risiken — hier dokumentiert, weil sie zuvor offen waren):**

5. **Framing/Ton (entschieden: sachlich):** Positionierung "alternative Teuerungsberechnung für die Schweiz" statt "die wahre Inflation" gewählt — verhindert den Vorwurf, die offizielle Statistik sei "unwahr", und reduziert die rechtliche Angreifbarkeit. Methodik-Text muss weiterhin sauber trennen zwischen der abgebildeten Mess-Lücke und reiner Wahrnehmungsverzerrung (siehe 2.2c).
6. **Impressum & Anonymität (Entscheidung: Pseudonym + Kontakt-Mail; anwaltliche Kurzprüfung vor Launch empfohlen):** Vollständige Anonymität und rechtskonformer Betrieb schliessen sich in der Schweiz weitgehend aus. Impressumspflicht (UWG Art. 3 lit. s) greift v.a. bei kommerziellem Angebot — ein reines Info-/Community-Projekt fällt möglicherweise nicht darunter, aber revDSG verlangt bei Analytics/Serverlogs eine Datenschutzerklärung mit Nennung des Verantwortlichen. `.ch`-Domain-Halter ist nach aussen nicht öffentlich (SWITCH kennt ihn aber). **Gewählter Weg: Pseudonym/Projektname als Träger + Kontakt-E-Mail** (US 5.7) — rechtlicher Graubereich, in der Praxis für nicht-kommerzielle Projekte gelebt, aber nicht garantiert rechtssicher. Vor Launch einmal anwaltlich prüfen lassen. Alternative mit höchster Sicherheit falls nötig: Verein als Träger (juristische Person trägt Verantwortung, Klarname bleibt privat).

**Gelöst:** HABE-Prämienanteil isoliert verfügbar, HABE↔LIK-Kompatibilität via COICOP geprüft, Mietkorrektur-Datenquelle ohne Drittanbieter-Lizenz, Strom-Korrektur nach Prüfung gestrichen (Doppelzählung), SSRF-Schutz spezifiziert, Verschmelzungslogik und Strukturbruch-Umgang entschieden, Kaufkraft-Rechner definiert, Geldmenge M2 festgelegt, Plausi-Check-Schwellwerte pro Quelle definiert, Datenlizenzen geklärt (BFS/SNB frei mit Quellenangabe, Twelve Data Attribution), Transparenz-ohne-Code-Offenlegung gelöst.

---

## 10. Content — noch zu entwerfen (bewusst zurückgestellt bis P3/P4 funktional stehen)

Benötigte Texte, sachlich-neutral, ohne Prosa, laienverständlich heruntergebrochen:
- Definitionsblock Startseite ("Was ist Trueflation?" inkl. Abgrenzung zu verwandten Konzepten, Kernsatz "bildet die messbare Lücke ab, nicht die gefühlte")
- **Greifbarer Erklärsatz für Laien** (zweite Textebene unter der fachlichen Positionierung "alternative Teuerungsberechnung"), der die Haushaltssicht transportiert, z.B. "Wie stark steigen die Lebenshaltungskosten wirklich, wenn Krankenkasse und reale Mieten mitgerechnet werden?" — fachliche Positionierung + greifbare Erklärung arbeiten auf zwei Ebenen, kein Widerspruch
- Methodik-Texte pro Linie (Formel, Quellen, Grenzen — Kurzform für die Seite, nicht der volle Requirements-Text)
- Erklärung M2-Wahl (ein Satz, warum M2 statt M1/M3)
- Erklärung Geldmengen-Verwässerung (konzeptionell die am wenigsten intuitive Grösse — braucht besonders einfache Erklärung)
- Abgrenzung zu Comparis/KOF (entgegengesetzte Rechenrichtung)
- Finale Disclaimer-Formulierung (Entwurf steht in Abschnitt 7, ggf. noch zu verfeinern)
- Kaufkraft-Rechner-Copy inkl. Grenzfall-Hinweise

Status: nicht gestartet, bewusst zurückgestellt bis P3/P4 funktional stehen (siehe Priorisierung P5).

---

## 11. Technische Architektur — Entscheidungen

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Datenhaltung | Git-basiert (versionierte JSON/CSV im Repo), keine separate Datenbank, **inkrementelle Speicherung — Pipeline holt nur neue Datenpunkte seit letztem Stand, keine Neuabfrage der Gesamthistorie** | Jede Datenänderung = Git-Commit mit Diff, deckt Versionierung (US 2.3) ab; inkrementeller Ansatz macht die Seite robust gegen Ausfall/Änderung einer Quelle (nur der neueste Datenpunkt ist im Fehlerfall betroffen, nicht die gespeicherte Historie) |
| Plausi-Freigabe (US 1.7) | Über bestehenden Jarvis-Telegram-Kanal, mit strukturiertem Kontext pro Nachricht | Kein separates Admin-Panel/Login nötig, deckt "nichts manuell ausser Plausi-Check" exakt ab |
| Scheduler | GitHub Actions (scheduled workflows), nicht systemd-Timer | Unabhängig vom Droplet-Zustand, bereits etabliertes Muster aus OpenClaw-Deploy-Pipeline, kein neues Werkzeug |
| Frontend | **Next.js** (nicht Astro — Korrektur nach Rücksprache mit Jarvis), interaktive Komponenten (Chart, Kaufkraft-Rechner) als React-Komponenten, statische Seiten via Next.js Static Generation | Next.js läuft bereits produktiv in der Factory (Docker-Container, API-Routes) — zweites Frontend-Framework einzuführen wäre unnötige Komplexität, kein echter Vorteil ggü. Konsistenz mit bestehender Infrastruktur |
| Chart-Library | Chart.js, nicht D3 | Deckt Zeitreihen/Zoom/mehrere Linien/Overlays bereits ab, D3 wäre unnötiger Implementierungsaufwand für den Bedarf hier |
| Design-Richtung | Fintech-präzise (Daten-Tool-Ästhetik), Hell + Dunkel umschaltbar, WCAG AA (Details Abschnitt 6a) | Signalisiert Kompetenz für die finanzaffine Kern-Community; Design-Prinzipien als explizite Vorgabe, damit kein generisches Framework-Default entsteht |
| Hosting | **Auslieferung der Seite: statisch über CDN** (Build via GitHub Actions, US 5.4). **Droplet-Rolle bewusst minimal:** trägt ausschliesslich das self-hosted Analytics (US 5.6) und dient als Deploy-/Mirror-Ziel (US 1.15) — nicht als Webserver für die Seite selbst. Containerisiert (Docker) auf dem separaten Projekte-Droplet | Eine vollständig statische Seite braucht keinen laufenden Server; das entkoppelt die Verfügbarkeit der Seite vom Droplet-Zustand. Trennung Jarvis/Projekte wie vorgegeben; Containerisierung reduziert den Blast-Radius gegenüber Nachbarprojekten. **Ohne diese Klarstellung würde unnötige Server-Infrastruktur für eine statische Seite aufgebaut.** |
| i18n | Content-Layer (Texte als separate Datei pro Sprache) von Tag 1 getrennt von Berechnungslogik, auch wenn v1 nur Deutsch | Vermeidet Rewrite bei v2-Mehrsprachigkeit |
| Backend-Sprache | **Entschieden (Jarvis-Antwort):** TypeScript/Node.js für HTTP-API-Calls und XLS-Parsing (läuft direkt in Next.js API Routes/GitHub Actions), Python (pdfplumber) ausschliesslich für PDF-Extraktion (Strukturerhebungs-Daten, falls in V3 kein maschinenlesbares Format bestätigt wird; Low-Frequency-Pfad US 1.10) | Vollständig in bestehender Factory-Infrastruktur integrierbar, kein technischer Grund für eine dritte Sprache |

---

## 12. Priorisierung & Abhängigkeiten

**Kein Sprint-Modell.** Jarvis läuft kontinuierlich, nicht in getakteten Zeitboxen — relevant ist die Abhängigkeitskette, nicht ein Kalenderplan. Jeder Block unten kann gestartet werden, sobald seine Abhängigkeiten erfüllt sind, unabhängig davon, wie lange der vorherige Block gedauert hat. Blöcke ohne gegenseitige Abhängigkeit können parallel bearbeitet werden.

| Prio | Block | Enthält | Abhängig von | Parallelisierbar mit |
|---|---|---|---|---|
| P0 | Setup | Next.js-Skeleton im Docker-Container, Git-Repo-Struktur für versionierte Daten, Whitelist-Konfiguration (US 1.6/1.9), Jarvis-Telegram-Approval-Grundgerüst (US 1.7), **V1 verifizieren** (Startblocker); V2–V8 parallel starten, blockieren aber nur ihren jeweiligen Block | — (Startpunkt) | — |
| P1 | LIK-Pipeline + Minimal-Chart + Design-Fundament | US 1.1, 1.8 (Revisions-Handling), **1.12 (Bulk-Import Erstinitialisierung — ohne das existiert keine Historie)**, 1.11 (inkrementelle Speicherung), 1.13 (Rollback-Prozess dokumentiert+getestet), 1.15 (zweites Remote/Mirror), 1.4 (Fehlerresilienz), 2.7 (Datenvertrags-Tests ab der ersten Quelle); Epic 3 minimal: Next.js + Chart.js, nur Linie 1, Zoom/Zeitraum; **Design-Fundament: Fintech-Stil, Hell/Dunkel-Basis, Farbsystem, Typografie, WCAG-AA-Setup (Abschnitt 6a) — jetzt festlegen, damit spätere Screens nicht auf Framework-Default aufsetzen und teuer nachgebessert werden müssen**; US 5.4 (statischer Export als Basis-Architektur) | P0 | — |
| P2 | Pipeline verbreitern | SNB Geldmenge M2 (US 1.2) + Leitzins-Overlay (US 3.5); US 1.7 (Plausi-Check produktiv), US 1.14 (Drift-Erkennung), US 5.5 (Prüfsummen); Epic 4 Grundgerüst: Methodik-Seite, Transparenzseite mit Update-Status/Quellenangabe (US 4.3/4.6), eigene Inhaltslizenz CC BY (US 4.9), Änderungshistorie (US 4.10), Fehlermeldungs-Hinweis (US 4.11) | P1 (Pipeline-Architekturprinzip muss an LIK bewiesen sein) | — |
| P3 | Trueflation-Berechnung | Epic 2 komplett (US 2.1–2.6, inkl. Verkettung + COICOP-Mapping-Tabelle), Low-Frequency-Ingestion für KVPI (XLS) und Mietpreisdaten (US 1.10), Tests/Regression (US 2.4), Nachrechenbarkeit/Formel-Offenlegung (US 4.5) | P1 (Pipeline-Fundament) — **nicht** von P2 abhängig | P2 |
| P4 | Kaufkraft-Rechner + Overlays + UX + Reichweite | US 3.1 (grosse Zahl, inkl. Symmetrie-AC), 3.2 (OG-Bild), 3.3 (progressive Disclosure), 3.7 (Geldmengen-Onboarding), 3.8 (Rechner), 3.9 (SMI/Gold/BTC), Overlay-Modul (2.5), Ereignis-Layer (3.14), Downsampling (3.15), Statuszustände (3.16), Datenstand-Badges (3.17), Hell/Dunkel (3.18), Mobile-Ansicht (3.10), Loading-States (3.12), Barrierefreiheit (3.11), Teilen (3.13), Feed (4.7), SEO (4.8), Analytics (5.6), E2E- und visuelle Regressionstests (2.7) | P3 (Trueflation-Werte müssen existieren); Overlay-Datenanbindung unabhängig startbar | Teile von P4 (Overlay-Daten, OG-Bild, SEO) parallel zu P3 möglich |
| P5 | Content & Launch-Vorbereitung | Abschnitt 10: Definitionstext, Methodik-Texte, finaler Disclaimer, Kaufkraft-Rechner-Copy; i18n-Grundgerüst (Content-Layer, nur DE befüllt); vollständiger Security-Review (Abschnitt 5) | P3 + P4 müssen funktional stehen, sonst beschreiben die Texte ein System, das es noch nicht gibt | Generische Textteile (z.B. genereller Disclaimer-Rahmen ohne Formel-Bezug) können früher entstehen, sobald P1 steht |

**Bewusste Reihenfolge-Entscheidung, nicht verhandelbar ohne guten Grund:** P1 vor P3 — die Pipeline-Architektur (publikationsgetriggert, inkrementell, Whitelist, Plausi-Check) muss an einer einzigen, robusten Quelle (LIK) bewiesen sein, bevor sie auf sechs weitere Quellen mit unterschiedlichen Zugriffsarten (API, XLS, PDF) ausgeweitet wird. Sonst wird ein Architekturfehler erst spät und an mehreren Stellen gleichzeitig sichtbar.

### Definition of Done pro Block

Ein Block gilt erst als abgeschlossen, wenn **alle** seine Kriterien erfüllt sind. Vorher darf kein abhängiger Block als gestartet gemeldet werden.

| Block | Abschlusskriterien |
|---|---|
| **P0** | Next.js läuft im Container; Git-Repo-Struktur steht und ist dokumentiert; **Whitelist-Config existiert, ist strukturell korrekt und vollständig (alle bekannten Quellen eingetragen)** — Durchsetzung zur Laufzeit ist P1-Kriterium, da ohne Pipeline-Code nichts durchsetzbar ist; eine Test-Nachricht über den Telegram-Kanal ist erfolgreich zugestellt; **V1 verifiziert und dokumentiert** (LIK-Endpoint real abgerufen, Antwortformat und Tabellen-ID festgehalten); die übrigen Verifikationen sind gestartet und blockieren jeweils nur ihren zugeordneten Block (siehe Zuordnungstabelle unten) |
| **P1** | LIK-Historie ab 1914 vollständig im Repo (Bulk-Import US 1.12 durchgelaufen); ein inkrementeller Lauf hat nachweislich nur neue Punkte ergänzt; ein simulierter Quellenausfall führt zu korrektem Fallback statt Absturz; Rollback wurde einmal real getestet; zweites Remote/Mirror ist eingerichtet und synchronisiert nachweislich; **Whitelist-Durchsetzung verifiziert — ein Abruf gegen eine NICHT eingetragene URL wird nachweislich abgelehnt (Negativtest, nicht nur Positivtest — ein Positivtest zeigt nur, dass erlaubte URLs funktionieren, nicht dass unerlaubte blockiert werden)**; Chart rendert Linie 1 mit funktionierendem Zoom; Design-Fundament (Farben, Typografie, Hell/Dunkel, Kontrastprüfung) ist als wiederverwendbares System angelegt, nicht ad hoc gestylt |
| **P2** | SNB M2 + Leitzins laufen über dieselbe Pipeline-Struktur wie LIK (keine Sonderpfade); Plausi-Check hat mindestens einmal ausgelöst und die Telegram-Freigabe funktioniert end-to-end; Drift-Referenzabgleich ist je Quelle definiert und läuft; Prüfsummen werden geschrieben; Methodik- und Transparenzseite zeigen echte Werte inkl. Quellenangabe und Datenstand |
| **P3** | Trueflation-Reihe berechnet, inkl. Verkettung an Nahtstellen (nachweislich sprungfrei); COICOP-Mapping-Tabelle existiert als versioniertes Artefakt; Regressionstests laufen grün gegen definierte Referenzwerte; Linie startet korrekt erst ab Verfügbarkeitsjahr statt mit Lücke; Formel ist öffentlich dokumentiert |
| **P4** | Kernzahlen (aktuell + kumuliert) sichtbar und auf gemeinsamen Stichtag normiert; Zeitraum-Presets und Umschalter Niveau/Rate funktionieren; Zoom in Zeiträume ohne Daten zeigt korrekten Nichtexistenz-Zustand; Rechner funktioniert inkl. beider Grenzfälle und teilbarer URL; Overlays zu-/abschaltbar mit korrektem Statusverhalten bei Ausfall; OG-Bild wird generiert und in einer echten Link-Vorschau geprüft; Mobile-Ansicht auf echtem Gerät getestet; WCAG-AA-Kontrast und Tastaturnavigation geprüft; Feed liefert valides JSON inkl. Lizenzfeld; E2E-Durchlauf (Quelle → Chart) und visuelle Regression laufen grün |
| **P5** | Alle Texte aus Abschnitt 10 vorhanden und inhaltlich mit dem gebauten System übereinstimmend; Platzhalter `[KONTAKT-EMAIL]`/`[PSEUDONYM/PROJEKTNAME]` sind noch als Platzhalter erkennbar (Ersetzung durch Betreiber); CC-BY-Angabe an allen drei Stellen; Security-Review gegen Abschnitt 5 abgeschlossen und dokumentiert |

### Annahmen-Verifikationsliste (P0, verbindlich)

**Hintergrund:** Im Verlauf der Spezifikation sind mehrfach plausible, aber ungeprüfte Annahmen über Datenverfügbarkeit eingeflossen — zwei davon erwiesen sich bei nachträglicher Prüfung als falsch (Strom-Korrektur: Doppelzählung, da Elektrizität bereits im LIK; Mietpreisstrukturerhebung: falsche Frequenzannahme). Deshalb gilt: **Keine Datenannahme wird übernommen, bevor sie hands-on verifiziert ist.** Jede Zeile unten wird real abgerufen/geprüft, das Ergebnis dokumentiert, und bei Abweichung vom Dokument wird eskaliert statt stillschweigend angepasst.

| # | Zu verifizieren | Konsequenz bei Abweichung |
|---|---|---|
| V1 | ✅ **Abgeschlossen (25.08.2026).** LIK liegt in der dedizierten Fachapplikation `lik-app.bfs.admin.ch`, Endpunkt und Fundweg in Abschnitt 3 dokumentiert. Widerlegt wurden: opendata.swiss (nur PDF/HTML), Swiss Stats Explorer/SDMX (Agency+Kategorie vorhanden, keine Dataflows), PxWeb/STAT-TAB (mit und ohne `www.` byte-identisch, Domäne 05 fehlt in beiden). | **P1 entsperrt** |
| V2 | ⚠️ **Timeboxed angetestet (25.08.2026), noch nicht abgeschlossen.** `kvpiDataUrl` aus derselben `global-params.js` der LIK-App liefert unter `https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-kvpi-app-state/master` einen validen, `Last-Modified`-versehenen JSON-Endpunkt (Stand 20.11.2025) — aber nur drei Felder: `korrekturFaktor` (27.38), `durchschnittlicherEinfluss` (-0.3), `vorjahr` (2024). **Kein Teilindex, keine Zeitreihe, keine Trennung Grund-/Zusatzversicherung** — das ist ein fertig berechneter Korrekturwert für genau ein Jahr, keine Rohdatenreihe. Reicht nicht für die in 2.2b geforderte historische KVPI-Teilindex-Reihe. **Offen:** ob `korrekturFaktor`/`durchschnittlicherEinfluss` methodisch bereits das ist, was 2.2b braucht (dann wäre die Fallback-Leiter obsolet), oder ob weiterhin die volle Zeitreihe gesucht werden muss — nächster Schritt: Fachapp-Heuristik am `itr`-Rechner (`itrDataUrl`, ebenfalls in derselben Config) und an einer dedizierten KVPI-Fachapp prüfen, danach stats.swiss/STAT-TAB. | Siehe vorentschiedene Fallback-Leiter unten — Jarvis muss hier nicht stehenbleiben |
| V3 | ✅ **Inhaltlich geklärt:** Mietdauer-Dimension existiert in der jährlichen Strukturerhebung ab 2010. **Verbleibend:** Zugriffsweg — **zuerst auf stats.swiss suchen** (SDMX), erst danach PDF-Extraktion erwägen | Nur noch Zugriffsweg offen, Methodik steht |
| V4 | HABE-Prämienanteil — **zuerst auf stats.swiss suchen**. Als isolierte, maschinell extrahierbare Position verfügbar? Zeitreihe ab wann? | Betrifft die Gewichtungsformel (Epic 2) |
| V5 | LIK-Teilindizes auf Hauptgruppen-Ebene: historisch durchgehend ab 2010 verfügbar? | Betrifft Startjahr und Basisjahr-Fixierung |
| V6 | SNB M2: Reihe ab 1975 tatsächlich abrufbar? Definitionsbrüche dokumentiert? **Zusätzlich: belastbarer Startzeitpunkt der Leitzins-Reihe** (2.4) | Betrifft Linie 3 und das Leitzins-Overlay samt deren Startjahren |
| V7 | **Twelve Data: SMI konkret verfügbar** (nicht nur "Indizes allgemein")? Historientiefe? Attributionspflicht? | Betrifft Overlay-Modul und US 3.9 |
| V8 | Verfügbarkeitsbeginn je Marktdatenreihe (SMI, Gold in CHF, BTC) real prüfen statt annehmen | Betrifft Grenzfall-Logik im Rechner |

**Regel:** Weicht ein Verifikationsergebnis vom Dokument ab, meldet Jarvis das mit Beleg an den Betreiber — die Methodik wird dann bewusst angepasst, nicht improvisiert.

**Zuordnung: welche Verifikation blockiert welchen Block (Korrektur einer zu strengen Vorgabe).** Ursprünglich musste die gesamte Liste vor P1 abgeschlossen sein. Das ist falsch dimensioniert: V7/V8 betreffen ausschliesslich die optionalen Markt-Overlays und dürfen den Bau der LIK-Pipeline nicht aufhalten. Verbindlich ist stattdessen:

| Verifikation | Blockiert | Konsequenz |
|---|---|---|
| V1 (LIK-Endpoint) | **P1** | Ohne LIK-Zugriff gibt es keine Kernlinie — echter Startblocker |
| V6 (SNB M2 + Leitzins) | **P2** | Betrifft Linie 3 und Overlay, nicht das Fundament |
| V2, V4, V5 (KVPI-Teilindex, HABE, LIK-Teilindizes) | **P3** | Betreffen ausschliesslich die Trueflation-Berechnung |
| V3 (Zugriffsweg Strukturerhebung) | **P3** | Methodik steht bereits, nur der maschinelle Weg fehlt |
| V7, V8 (Twelve Data, Marktdaten-Beginn) | **P4** | Optionale Overlays — dürfen nichts anderes aufhalten |

**Vorentschiedener Fallback für V2 (damit ein negatives Ergebnis nicht blockiert):** Falls der KVPI-Teilindex Grundversicherung nicht maschinell zugänglich ist, wird die Prämienreihe **direkt aus den BAG-Durchschnittsprämien der obligatorischen Grundversicherung** aufgebaut (jährlich publiziert, national aggregiert) und daraus eine eigene Indexreihe berechnet — Basisjahr analog zum übrigen Modell. Das ist methodisch sogar sauberer als der Umweg über einen Teilindex, weil die Grundversicherung dann ausschliesslich aus Grundversicherungs-Zahlen stammt. **Ausdrücklich nicht zulässig:** ersatzweise den KVPI-Gesamtindex verwenden — er enthält die Zusatzversicherung und unterschätzt die Entwicklung systematisch (siehe 2.2b).

**Konsequenz für P0:** P0 gilt als abgeschlossen, wenn die Infrastruktur steht **und V1 verifiziert ist**. Die übrigen Verifikationen laufen parallel und blockieren jeweils nur ihren eigenen Block.

**Vorentschiedene Fallback-Leiter für V2 (KVPI-Teilindex Grundversicherung)** — damit die Umsetzung bei negativem Verifikationsergebnis nicht anhält:
1. **Maschinenlesbarer Teilindex Grundversicherung**, falls auffindbar (bevorzugt).
2. **Falls nur als Publikation verfügbar:** Extraktion aus XLS/PDF über den Low-Frequency-Ingestion-Pfad (US 1.10). Die Reihe ist jährlich und kurz (ab 1999) — der Extraktionsaufwand ist vertretbar, die Werte sind nach dem Erstimport stabil.
3. **Falls beides scheitert: eskalieren, nicht substituieren.** Der KVPI-Gesamtindex darf **nicht** als Ersatz verwendet werden (systematische Unterschätzung, siehe Warnung in 2.2b). In diesem Fall entscheidet der Betreiber, ob die Prämien-Korrektur zurückgestellt wird — Trueflation liefe dann vorläufig nur mit Warenkorb-Fixierung und Miet-Korrektur, transparent ausgewiesen.

---

## 13. Betreiber-TODOs (manuell, nicht durch Jarvis automatisierbar)

- [ ] **Kontakt-E-Mail + Pseudonym festlegen** und Platzhalter `[KONTAKT-EMAIL]` / `[PSEUDONYM/PROJEKTNAME]` im Content ersetzen (US 5.7)
- [ ] **Anwaltliche Kurzprüfung vor Launch** zu Impressum/Datenschutz/Pseudonym-Betrieb (Risiko 6)
- [ ] **Zweites Git-Remote/Mirror-Ziel festlegen** (US 1.15) — wo liegt die Zweitkopie der Datenhistorie?
- [x] **Twelve Data API-Key bereitgestellt** — liegt unter `~/.openclaw/secrets/twelvedata-api-key`. V7/V8 damit entsperrt. Key niemals ins Repo committen, ausschliesslich aus dem Secrets-Pfad lesen.
- [ ] **Twelve Data Nutzungsbedingungen** einmal gegenlesen: nicht-kommerzielle Nutzung bestätigen **und prüfen, ob eine Attributionspflicht besteht** (falls ja, in US 4.6 mit aufnehmen)
- [ ] **Lizenzsymbole auf opendata.swiss** pro genutztem BFS/SNB-Datensatz einmal prüfen (mögliche "kommerzielle Nutzung nur mit Bewilligung"-Kennzeichnung — betrifft Non-Profit nicht, aber verifizieren)
- [ ] **Plausi-Schwellwerte pro Quelle** final festlegen (Startwerte in US 1.7 vorgeschlagen, ggf. nach ersten Live-Daten justieren)
- [x] **Lizenz für eigene Inhalte: CC BY (entschieden)** — Jarvis setzt die Angabe an drei Stellen um (Impressum/Über-Seite, Footer, Feed — US 4.9). Keine weitere Betreiber-Aktion nötig.
- [ ] **Logo/Favicon prüfen** (nicht selbst erstellen) — Jarvis generiert schlichtes Logo + Favicon im Fintech-Stil (Abschnitt 6a) in P1 mit; Betreiber prüft nur das Ergebnis und greift bei Bedarf ein
- **US 1.16 (API-Etikette — Schutz vor IP-Sperre):** Als System will ich fremde Datenportale so sparsam abfragen, dass keine Sperre droht. Die SNB behält sich ausdrücklich vor, IPs bei exzessiver Nutzung zu blockieren; für BFS gilt sinngemäss dasselbe. Verbindliche Regeln:
  - **Bedingte Anfragen zuerst:** vor jedem Datenabruf `lastUpdate`/eTag prüfen (`If-None-Match`) — bei unverändertem Stand antwortet der Server mit 304 und es wird nichts geladen.
  - **Prüffrequenz im Normalbetrieb: höchstens 1× pro Tag und Quelle.** Bei monatlich publizierten Daten sind das ~365 billige Prüfungen und ~12 echte Abrufe pro Jahr — weit unterhalb jeder Missbrauchsschwelle. Optional weiter reduzieren, indem nur im bekannten Publikationsfenster geprüft wird.
  - **Klarstellung Tagesbudget vs. Retries (Betreiber-Klärung 25.08.2026):** Das Tageslimit zählt ausschliesslich **erfolgreich abgeschlossene Prüfzyklen** (Antwort 200 oder 304), nicht Verbindungsversuche. Schlägt die eine tägliche Prüfung durch einen Netzwerkfehler fehl, dürfen die in US 1.4 vorgesehenen 3 Retries mit Backoff **nicht** gegen dieses Tagesbudget gezählt werden — sonst würde ein einzelner Verbindungsabbruch die Pipeline fälschlich 24h blockieren. Ein optionales Stunden-Burst-Limit gilt entsprechend nur für den Retry-Pfad, nicht für reguläre Prüfzyklen (bei 1 Prüfung/Tag wäre ein Stunden-Limit auf den Normalpfad ohnehin wirkungslos).
  - **Bulk-Import (US 1.12) gedrosselt:** sequenziell, mindestens 1 Sekunde Pause zwischen Anfragen, **niemals parallel**. Der Erstimport langer Reihen in vielen Zeitfenstern ist das grösste Sperr-Risiko des ganzen Projekts.
  - **Fehler-Backoff mit hartem Deckel:** exponentiell zurückweichen, nach höchstens 3 Versuchen abbrechen und melden (US 1.4). Niemals eine Retry-Schleife gegen einen fehlerhaften Endpoint laufen lassen.
  - **Kompression aktivieren:** `Accept-Encoding: gzip, deflate, br` — vom BFS ausdrücklich empfohlen, reduziert Bandbreite und Ladezeit.
  - **Identifizierender User-Agent** mit Projektname und Kontakt-URL — bei Auffälligkeiten wird eher kontaktiert als kommentarlos gesperrt.
  - **Entwicklung und Tests laufen gegen lokale Fixtures**, nicht gegen die Live-Endpunkte. Iterative Entwicklung ist sonst die zweitgrösste Sperr-Ursache.

### Epic 2 — Trueflation-Berechnung


