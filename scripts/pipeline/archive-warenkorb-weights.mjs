#!/usr/bin/env node
/**
 * trueflation.ch — Warenkorb-Gewichte-Archivierung (US 1.17, Betreiber-Vorgabe
 * 30.08.2026, im Zuge des Frontend-Reviews / P4-Nacharbeiten)
 *
 * ═══ KONTEXT ═══
 * Der 12-vs-13-Hauptgruppen-Fund (siehe Requirements 2.2d, Punkt 0) zeigte:
 * das BFS ändert die Kategorienstruktur des LIK-Warenkorbs zwischen
 * Publikationsjahrgängen (2020: 12 Hauptgruppen, 2026: 13 — "Sonstige"
 * wurde aufgespalten, "Versicherungen und Finanzdienstleistungen" als eigene
 * Gruppe herausgelöst). Diese Rekonstruktion musste 2026 manuell nachrecher-
 * chiert werden (PDF-Extraktion des 2020er-Jahrgangs). Damit das bei der
 * NÄCHSTEN Strukturrevision nicht wieder manuell passieren muss, archiviert
 * dieses Skript jeden Jahrgang automatisch und versioniert im Repo.
 *
 * ═══ PUBLIKATIONSRHYTHMUS ═══
 * BFS publiziert die Gewichte jährlich im Dezember unter dem Asset-Namens-
 * muster "Landesindex der Konsumentenpreise (LIK): Warenkorb und Gewichte -
 * JJJJ" (Themenseite config/sources.json -> warenkorbWeights.sourcePage).
 * Prüf-Rhythmus: jährlich im Dezember-Fenster, analog zu anderen periodischen
 * Quellen (US 1.3) — NICHT monatlich, das wäre unnötiger Traffic gegen eine
 * Quelle, die sich zwischen Dezember-Publikationen nie ändert.
 *
 * ═══ ARCHIVIERUNG ═══
 * Jeder abgerufene Jahrgang wird als EIGENE, versionierte Datei abgelegt:
 *   config/lik-warenkorb-gewichte-<JAHR>.json
 * Nie überschrieben — die Historie der Gewichtssätze SELBST ist das Archiv,
 * nicht nur der jeweils aktuellste Stand. config/lik-warenkorb-gewichte-2026.json
 * (bereits vorhanden aus der 2.2d-Recherche) ist der erste, "manuell"
 * eingepflegte Archiv-Eintrag — dieses Skript übernimmt ab jetzt künftige
 * Jahrgänge automatisch nach demselben Dateischema, damit die manuelle
 * PDF-Extraktion (28.08.2026) ein einmaliger Vorgang bleibt.
 *
 * ═══ DATENVERTRAGS-TEST ═══
 * - Struktur: 'positions' ist ein nicht-leeres Array
 * - Jede Position hat posId (Zahl), label (String, nicht leer) und
 *   weightPercent (Zahl, endlich, > 0)
 * - Kategorienzahl: 12 ODER 13 Hauptgruppen sind BEIDE gültig (eine künftige
 *   Strukturrevision ist erwartetes Verhalten, kein Fehler — siehe 2.2d).
 *   Eine völlig andere Anzahl (z.B. 5 oder 40) deutet auf einen Parse-Fehler
 *   hin und schlägt fehl.
 *
 * ═══ ABDECKUNGSPRÜFUNG ═══
 * Summe aller Hauptgruppen-Gewichte muss exakt (Toleranz ±0.01 Prozentpunkte,
 * Rundungsfehler) 100% ergeben — schlägt fehl, BEVOR ein fehlerhaft
 * geparster Jahrgang die fixer-Warenkorb-Berechnung (build-warenkorb-
 * fixation-test.mjs, Requirements 2.2d) verfälscht.
 *
 * ═══ FEHLERBEHANDLUNG ═══
 * Folgt demselben Muster wie andere jährliche Quellen (US 1.3/1.4) — ein
 * Ausfall wird nicht still verschluckt. Dieses Skript wirft bei jedem
 * Datenvertrags-/Abdeckungsverstoss eine Exception (Exit-Code != 0), die
 * GitHub-Actions-Schritt entsprechend sichtbar macht bzw. eskaliert werden
 * kann (analog zu anderen Pipeline-Fehlern).
 *
 * Usage:
 *   node archive-warenkorb-weights.mjs --fixture <pfad-zu-fixture.json> --year 2027 --dry-run
 *   node archive-warenkorb-weights.mjs --year 2027   # echter Live-Lauf (setzt fetchWarenkorbYear() um)
 *   node archive-warenkorb-weights.mjs --verify-only # prüft NUR bestehende Archiv-Dateien (CI-Regressionsschutz)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_DIR = path.join(REPO_ROOT, 'config');

const args = process.argv.slice(2);
const fixtureIdx = args.indexOf('--fixture');
const fixturePath = fixtureIdx >= 0 ? args[fixtureIdx + 1] : null;
const yearIdx = args.indexOf('--year');
const targetYear = yearIdx >= 0 ? parseInt(args[yearIdx + 1], 10) : null;
const isDryRun = args.includes('--dry-run');
const isVerifyOnly = args.includes('--verify-only');

const MIN_PLAUSIBLE_CATEGORIES = 8; // deutlich unter 12/13, fängt grobe Parse-Fehler ab
const MAX_PLAUSIBLE_CATEGORIES = 20; // deutlich über 12/13, fängt grobe Parse-Fehler ab
const WEIGHT_SUM_TOLERANCE = 0.01; // Prozentpunkte, reine Rundungstoleranz

class DataContractError extends Error {
  constructor(fileLabel, issues) {
    super(`Datenvertrags-Test fehlgeschlagen für '${fileLabel}':\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
    this.issues = issues;
  }
}

/**
 * Datenvertrags-Test + Abdeckungsprüfung für EINEN Warenkorb-Gewichte-Jahrgang.
 * Wird sowohl beim Import eines neuen Jahrgangs als auch beim Verifizieren
 * bestehender Archiv-Dateien (--verify-only, CI-Regressionsschutz) genutzt.
 */
function assertWarenkorbContract(data, fileLabel) {
  const issues = [];

  if (!Array.isArray(data.positions) || data.positions.length === 0) {
    throw new DataContractError(fileLabel, ["'positions' ist kein nicht-leeres Array"]);
  }

  const n = data.positions.length;
  if (n < MIN_PLAUSIBLE_CATEGORIES || n > MAX_PLAUSIBLE_CATEGORIES) {
    issues.push(
      `Kategorienzahl ${n} liegt ausserhalb des plausiblen Bereichs [${MIN_PLAUSIBLE_CATEGORIES}, ${MAX_PLAUSIBLE_CATEGORIES}] ` +
      `— deutet auf einen Parse-Fehler hin, nicht auf eine normale Strukturrevision (bekannte Fälle: 12, 13 Hauptgruppen).`
    );
  }
  // Info, kein Fehler: 12 oder 13 sind die bisher bekannten, "normalen" Werte.
  if (n !== 12 && n !== 13) {
    console.log(
      `[info] Kategorienzahl ${n} weicht von den bisher bekannten Jahrgängen (12/2020, 13/2026) ab — ` +
      `das ist EINE MÖGLICHE Strukturrevision (siehe Requirements 2.2d), kein automatischer Fehlschlag, ` +
      `solange die Zahl im plausiblen Bereich liegt. Bitte manuell gegenprüfen, analog zur 2020->2026-Recherche.`
    );
  }

  const seenPosIds = new Set();
  let weightSum = 0;
  for (const [idx, p] of data.positions.entries()) {
    if (typeof p.posId !== 'number') {
      issues.push(`positions[${idx}]: 'posId' ist keine Zahl (${JSON.stringify(p.posId)})`);
    } else if (seenPosIds.has(p.posId)) {
      issues.push(`positions[${idx}]: doppelte posId ${p.posId}`);
    } else {
      seenPosIds.add(p.posId);
    }
    if (typeof p.label !== 'string' || p.label.trim().length === 0) {
      issues.push(`positions[${idx}] (posId ${p.posId}): 'label' fehlt oder ist leer`);
    }
    if (typeof p.weightPercent !== 'number' || !Number.isFinite(p.weightPercent) || p.weightPercent <= 0) {
      issues.push(`positions[${idx}] (posId ${p.posId}): 'weightPercent' ungültig (${JSON.stringify(p.weightPercent)})`);
    } else {
      weightSum += p.weightPercent;
    }
  }

  if (issues.length > 0) throw new DataContractError(fileLabel, issues);

  // Abdeckungsprüfung: Summe muss (nahezu) exakt 100% ergeben.
  if (Math.abs(weightSum - 100) > WEIGHT_SUM_TOLERANCE) {
    throw new DataContractError(fileLabel, [
      `Gewichtssumme weicht von 100% ab: ${weightSum.toFixed(4)}% (Toleranz ±${WEIGHT_SUM_TOLERANCE}pp)`,
    ]);
  }

  console.log(
    `[datenvertrag+abdeckung/${fileLabel}] OK — ${n} Hauptgruppen, Summe ${weightSum.toFixed(4)}% ` +
    `(Toleranz ±${WEIGHT_SUM_TOLERANCE}pp erfüllt).`
  );
}

/**
 * Live-Abruf des Warenkorb-Jahrgangs. NICHT als reiner JSON-API-Aufruf
 * umsetzbar — die BFS-Themenseite liefert die Tabelle eingebettet im HTML
 * (siehe config/lik-warenkorb-gewichte-2026.json -> sourcePage), das
 * ursprünglich per Live-PDF-/HTML-Extraktion gewonnen wurde (28.08.2026).
 * Für den automatisierten Jahresbetrieb braucht dieser Pfad einen HTML-
 * Parser gegen die Themenseiten-Struktur — bewusst NICHT hier blind
 * nachgebaut (Gefahr: stille Fehlextraktion bei jeder BFS-Seiten-
 * Layoutänderung, siehe US 1.10 "Low-Frequency-Ingestion-Pfad getrennt von
 * der API-Hauptpipeline"). Nutzt zwingend eine --fixture für Tests/CI, bis
 * ein realer Extraktions-Lauf im Dezember-Publikationsfenster ansteht und
 * die tatsächliche HTML-Struktur des dann aktuellen Jahrgangs gegen die
 * 2026er-Referenz geprüft werden kann.
 */
async function fetchWarenkorbYear(year) {
  if (fixturePath) {
    console.log(`[fixture] Lade lokale Fixture: ${fixturePath} (kein Live-Abruf)`);
    return JSON.parse(readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8'));
  }
  throw new Error(
    `Live-Extraktion für Jahrgang ${year} ist NICHT implementiert (bewusst, siehe Kommentar oben) — ` +
    `die BFS-Themenseite liefert die Tabelle eingebettet im HTML, kein stabiler JSON-Endpunkt. ` +
    `Erfordert einen dedizierten HTML/PDF-Extraktions-Lauf im Dezember-Publikationsfenster, ` +
    `analog zur 2026er-Recherche (siehe config/lik-warenkorb-gewichte-2026.json). ` +
    `Für Tests/CI: --fixture <pfad> verwenden.`
  );
}

function archiveFilePath(year) {
  return path.join(CONFIG_DIR, `lik-warenkorb-gewichte-${year}.json`);
}

async function runImport() {
  if (!targetYear) {
    throw new Error('--year <JAHR> ist erforderlich für einen Import-Lauf (oder --verify-only für reine Verifikation bestehender Archiv-Dateien).');
  }
  const outPath = archiveFilePath(targetYear);
  if (existsSync(outPath) && !isDryRun) {
    throw new Error(
      `Archiv-Datei ${outPath} existiert bereits — wird NICHT überschrieben (Historie der Gewichtssätze ` +
      `selbst ist das Archiv, siehe Skript-Header). Bei einem echten Korrektur-Bedarf: manuell entscheiden, ` +
      `nicht automatisch überschreiben.`
    );
  }

  const data = await fetchWarenkorbYear(targetYear);
  assertWarenkorbContract(data, `lik-warenkorb-gewichte-${targetYear}.json (neu)`);

  if (isDryRun) {
    console.log(`[dry-run] Würde schreiben: ${outPath} (${data.positions.length} Hauptgruppen) — kein Datei-Write.`);
    return;
  }

  writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`[archiviert] ${outPath} geschrieben (${data.positions.length} Hauptgruppen).`);
}

/** CI-Regressionsschutz: alle bereits archivierten Jahrgänge erneut gegen
 * denselben Datenvertrags-/Abdeckungstest prüfen — fängt eine nachträgliche,
 * versehentliche Beschädigung einer Archiv-Datei ab (z.B. durch einen
 * fehlerhaften manuellen Edit). */
function runVerifyOnly() {
  const files = readdirSync(CONFIG_DIR).filter((f) => /^lik-warenkorb-gewichte-\d{4}\.json$/.test(f));
  if (files.length === 0) {
    throw new Error(`Keine archivierten Warenkorb-Gewichte-Dateien in ${CONFIG_DIR} gefunden — Sanity-Check fehlgeschlagen.`);
  }
  console.log(`=== Verifiziere ${files.length} archivierte Jahrgänge: ${files.join(', ')} ===`);
  for (const f of files) {
    const data = JSON.parse(readFileSync(path.join(CONFIG_DIR, f), 'utf-8'));
    assertWarenkorbContract(data, f);
  }
  console.log(`\n=== Alle ${files.length} Archiv-Jahrgänge bestehen den Datenvertrags-/Abdeckungstest ===`);
}

async function main() {
  if (isVerifyOnly) {
    runVerifyOnly();
    return;
  }
  await runImport();
}

if (import.meta.url === new URL(process.argv[1], 'file://').href || import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`FEHLER: ${err.message}`);
    process.exit(1);
  });
}
