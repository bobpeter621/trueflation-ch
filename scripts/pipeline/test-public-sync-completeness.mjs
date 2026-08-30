#!/usr/bin/env node
/**
 * trueflation.ch — automatische Sync-Vollständigkeitsprüfung (Betreiber-Vorgabe
 * 29.08.2026, nach dem LIK-Sync-Blocker-Fund im Code-Review).
 *
 * KONTEXT: Der Code-Review fand, dass public/data/lik/total-index-monthly.json
 * im GitHub-Actions-Sync-Schritt fehlte — die Datei existierte nur, weil sie
 * einmal manuell committed wurde, wurde aber nie automatisch aktualisiert.
 * Zwei ähnliche Lücken (Trueflation-yearly, Leitzins) wurden bereits vorher
 * gefunden und gefixt. Drei Vorfälle derselben Fehlerklasse ("Sync-Schritt
 * vergisst eine von mehreren Dateien") — ein manueller Review reicht nicht,
 * es braucht einen automatischen Test, der bei jedem künftigen neuen
 * fetch("/data/...")-Aufruf im Frontend sofort prüft, ob der Pfad auch im
 * Sync-Schritt der Pipeline abgedeckt ist.
 *
 * METHODE:
 * 1. Scannt app/ (rekursiv) nach `fetch("/data/...")`-Literalen (Client-Fetch-
 *    Pfade, die zwingend aus public/data/ bedient werden müssen).
 * 2. Scannt .github/workflows/pipeline.yml nach `cp data/X public/data/Y/`-
 *    Zeilen (harte UND weiche/if-Sync-Einträge zählen beide als "abgedeckt" —
 *    ein weicher Sync mit Warnung ist immer noch ein Sync-Versuch, siehe
 *    Overlay-Härtung unten für die Unterscheidung hart/weich).
 * 3. Jeder gefetchte Pfad MUSS eine passende cp-Zeile im Sync-Schritt haben.
 *    Fehlt sie, schlägt der Test fehl und nennt den betroffenen Pfad
 *    namentlich — das ist der automatisierte Nachfolger des manuellen Funds.
 *
 * NEGATIVTEST: Der Test simuliert einen fehlenden Sync-Eintrag (Pfad wird aus
 * der geparsten cp-Liste entfernt, nicht aus der echten Datei) und weist nach,
 * dass die Prüfung dann tatsächlich fehlschlägt — sonst wäre dieser Test
 * selbst nur ein weiterer Stub, der immer grün meldet.
 *
 * Usage: node test-public-sync-completeness.mjs
 * Exit-Code 0 = bestanden, 1 = mindestens ein fehlender Sync-Eintrag.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as yamlModule from 'js-yaml';
const yaml = yamlModule.default ?? yamlModule;

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');

let passed = 0;
let failures = 0;
function check(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
  if (condition) passed++; else failures++;
}

/** Rekursiv alle .tsx/.ts-Dateien unter app/ einsammeln (keine node_modules/.next). */
function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Extrahiert alle fetch("/data/...")-Literalpfade aus dem Quellcode. */
function extractFetchedDataPaths() {
  const files = collectSourceFiles(path.join(REPO_ROOT, 'app'));
  const paths = new Set();
  const fetchRegex = /fetch\(\s*["'`](\/data\/[^"'`]+)["'`]/g;
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    let m;
    while ((m = fetchRegex.exec(content)) !== null) {
      paths.add(m[1]);
    }
  }
  return [...paths].sort();
}

/** Extrahiert alle "cp data/X ... public/data/Y" Synchronisationszeilen aus
 * dem Pipeline-Workflow.
 *
 * HÄRTUNG (Code-Review Runde 2, 29.08.2026 — Finding 2): Die ursprüngliche
 * Fassung wandte den cp-Regex direkt auf den ROHEN Dateitext an, ohne YAML-
 * Struktur oder Kommentare zu berücksichtigen. Zwei konkrete Umgehungen
 * wurden nachgewiesen:
 *  (a) Eine auskommentierte cp-Zeile ("# cp data/lik/... public/data/lik/")
 *      wurde FÄLSCHLICH als aktiv erkannt — genau der stille Blindflug, den
 *      dieser Test verhindern soll.
 *  (b) Eine legitime Shell-Zeilenfortsetzung ("cp data/x \\\n  public/y/")
 *      wurde NICHT erkannt — False-Positive-FAIL bei harmlosem Refactoring.
 * Fix: `js-yaml` parst die Datei zu einer echten Struktur, wir extrahieren
 * NUR den `run:`-Block-Skalar der Sync-Stufe — das ist der einzige Ort, an
 * dem Sync-cp-Befehle stehen dürfen. Innerhalb dieses Blocks werden Shell-
 * Kommentarzeilen (beginnend mit optionalem Whitespace + "#") entfernt und
 * Backslash-Zeilenfortsetzungen zu einer Zeile zusammengeführt, BEVOR der
 * cp-Regex angewendet wird.
 *
 * ERKENNUNG DER SYNC-STUFE (Betreiber-Vorgabe 30.08.2026, Punkt i/k):
 * PRIMÄR über `step.id === 'sync_public_data'` — stabil gegen eine
 * harmlose Umbenennung des `name`-Feldes (das vorherige alleinige
 * Namens-Matching war zwar "fail closed" bei Rename, hätte aber die CI
 * unerwartet fuer den nächsten Bearbeiter gebrochen). FALLBACK auf den
 * Namens-Regex (enthält "synchronisieren"), falls die id fehlt — deckt
 * alte/manuelle Kopien der Datei ohne id ab und bleibt damit weiterhin
 * fail-closed, nicht fail-open. */
function extractSyncEntries(pipelineYmlContent) {
  const doc = yaml.load(pipelineYmlContent);
  const jobs = doc?.jobs ?? {};
  const runBlocks = [];
  for (const jobName of Object.keys(jobs)) {
    const steps = jobs[jobName]?.steps ?? [];
    for (const step of steps) {
      if (typeof step?.run !== 'string') continue;
      const isSyncStep = step?.id === 'sync_public_data' || /synchronisieren/i.test(step?.name ?? '');
      if (isSyncStep) {
        runBlocks.push(step.run);
      }
    }
  }

  const entries = [];
  const cpRegex = /cp\s+(data\/[^\s]+)\s+(public\/data\/[^\s/]+)\//g;
  for (const rawBlock of runBlocks) {
    const withoutComments = rawBlock
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    const joined = withoutComments.replace(/\\\s*\n\s*/g, ' ');
    let m;
    while ((m = cpRegex.exec(joined)) !== null) {
      entries.push({ source: m[1], destDir: m[2] });
    }
  }
  return entries;
}

/** Prüft, ob ein gefetchter Pfad (z.B. /data/lik/total-index-monthly.json)
 * durch einen Sync-Eintrag abgedeckt ist. */
function isPathCovered(fetchedPath, syncEntries) {
  // fetchedPath: "/data/lik/total-index-monthly.json"
  // Sync-Eintrag source: "data/lik/total-index-monthly.json" (ohne führenden Slash)
  const normalized = fetchedPath.replace(/^\//, '');
  return syncEntries.some((e) => e.source === normalized);
}

function main() {
  console.log('=== Test 1: Alle client-seitig gefetchten /data/-Pfade sind im Pipeline-Sync abgedeckt ===');
  const fetchedPaths = extractFetchedDataPaths();
  const pipelineYmlPath = path.join(REPO_ROOT, '.github', 'workflows', 'pipeline.yml');
  const pipelineYmlContent = readFileSync(pipelineYmlPath, 'utf-8');
  const syncEntries = extractSyncEntries(pipelineYmlContent);

  console.log('\n=== Test 0-neg: NEGATIVTEST — eine AUSKOMMENTIERTE cp-Zeile darf NICHT als aktiver Sync-Eintrag zählen ===');
  const commentedOutYml = pipelineYmlContent.replace(
    'cp data/lik/total-index-monthly.json public/data/lik/',
    '# cp data/lik/total-index-monthly.json public/data/lik/ (deaktiviert zum Testzweck)'
  );
  const entriesWithCommentedLik = extractSyncEntries(commentedOutYml);
  const likStillCountedAfterCommentOut = entriesWithCommentedLik.some((e) => e.source === 'data/lik/total-index-monthly.json');
  check(
    'NEGATIVTEST: eine auskommentierte cp-Zeile wird korrekt NICHT als aktiver Sync-Eintrag gezählt',
    likStillCountedAfterCommentOut === false,
    `nach Auskommentieren noch gezählt: ${likStillCountedAfterCommentOut}`
  );

  console.log('\n=== Test 0c: id-basierte Erkennung überlebt eine harmlose Umbenennung des Schritt-Namens (Betreiber-Vorgabe 30.08.2026, Punkt i/k) ===');
  const renamedStepYml = pipelineYmlContent.replace(
    'Trueflation — public/-Kopien synchronisieren',
    'Trueflation — public-Kopien aktualisieren (harmlos umbenannt)'
  );
  const entriesAfterRename = extractSyncEntries(renamedStepYml);
  const likStillCoveredAfterRename = entriesAfterRename.some((e) => e.source === 'data/lik/total-index-monthly.json');
  check(
    'Nach Umbenennung des Schritt-Namens wird der Sync-Schritt weiterhin über die id "sync_public_data" erkannt (kein CI-Bruch durch harmloses Refactoring)',
    likStillCoveredAfterRename === true,
    `nach Rename noch abgedeckt: ${likStillCoveredAfterRename}`
  );

  console.log('\n=== Test 0d: NEGATIVTEST — fehlen id UND passender Name gleichzeitig, bleibt die Prüfung weiterhin fail-closed ===');
  const noIdNoNameYml = pipelineYmlContent
    .replace('id: sync_public_data', 'id: irrelevant_step_id')
    .replace('Trueflation — public/-Kopien synchronisieren', 'Trueflation — Dateien aktualisieren');
  const entriesWithNeither = extractSyncEntries(noIdNoNameYml);
  const likCoveredWithNeither = entriesWithNeither.some((e) => e.source === 'data/lik/total-index-monthly.json');
  check(
    'NEGATIVTEST: fehlen sowohl die erwartete id als auch der Namens-Treffer, wird der Sync-Schritt korrekt NICHT erkannt (fail closed, kein stiller Blindflug)',
    likCoveredWithNeither === false,
    `ohne id und ohne Namens-Match noch abgedeckt: ${likCoveredWithNeither}`
  );

  console.log('\n=== Test 0b: eine legitime Backslash-Zeilenfortsetzung wird weiterhin korrekt erkannt ===');
  const wrappedYml = pipelineYmlContent.replace(
    'cp data/lik/total-index-monthly.json public/data/lik/',
    'cp data/lik/total-index-monthly.json \\\n            public/data/lik/'
  );
  const entriesWithWrappedLik = extractSyncEntries(wrappedYml);
  const likFoundAfterWrap = entriesWithWrappedLik.some((e) => e.source === 'data/lik/total-index-monthly.json');
  check(
    'Eine Zeilenfortsetzung (Backslash) wird weiterhin korrekt als aktiver Sync-Eintrag erkannt (kein False-Positive-FAIL bei harmlosem Refactoring)',
    likFoundAfterWrap === true,
    `nach Zeilenfortsetzung gefunden: ${likFoundAfterWrap}`
  );

  check(
    'Mindestens ein fetch("/data/...")-Aufruf im Frontend gefunden (Sanity-Check — sonst prüft der Test nichts)',
    fetchedPaths.length > 0,
    `${fetchedPaths.length} eindeutige Pfade gefunden`
  );
  check(
    'Mindestens ein cp-Sync-Eintrag in pipeline.yml gefunden (Sanity-Check)',
    syncEntries.length > 0,
    `${syncEntries.length} Sync-Einträge gefunden`
  );

  const uncovered = fetchedPaths.filter((p) => !isPathCovered(p, syncEntries));
  check(
    'JEDER gefetchte Pfad hat einen passenden Sync-Eintrag',
    uncovered.length === 0,
    uncovered.length > 0
      ? `FEHLENDE SYNC-EINTRÄGE: ${uncovered.join(', ')}`
      : `alle ${fetchedPaths.length} Pfade abgedeckt: ${fetchedPaths.join(', ')}`
  );

  console.log('\n=== Test 1-neg: NEGATIVTEST — ein simuliert entfernter Sync-Eintrag muss die Prüfung zum Scheitern bringen ===');
  // Simulation: Wir entfernen den LIK-Sync-Eintrag aus der GEPARSTEN Liste
  // (nicht aus der echten Datei!) und prüfen, dass isPathCovered() dann
  // korrekt false liefert — das beweist, dass die obige Prüfung nicht
  // trivial immer "true" zurückgibt.
  const syncEntriesWithoutLik = syncEntries.filter((e) => e.source !== 'data/lik/total-index-monthly.json');
  const likStillCovered = isPathCovered('/data/lik/total-index-monthly.json', syncEntriesWithoutLik);
  check(
    'NEGATIVTEST: Ohne den LIK-Sync-Eintrag erkennt die Prüfung den Pfad korrekt als NICHT abgedeckt',
    likStillCovered === false,
    `isPathCovered nach simuliertem Entfernen: ${likStillCovered}`
  );
  // Zusätzlich: mit einem frei erfundenen, garantiert nicht existierenden
  // Pfad muss die Prüfung ebenfalls "nicht abgedeckt" melden.
  const fakePathCovered = isPathCovered('/data/does-not-exist/fake.json', syncEntries);
  check(
    'NEGATIVTEST: ein frei erfundener, nicht existierender Datenpfad wird korrekt als NICHT abgedeckt erkannt',
    fakePathCovered === false,
    `isPathCovered für Fantasiepfad: ${fakePathCovered}`
  );

  console.log(`\n=== Ergebnis: ${passed} PASS, ${failures} FAIL ===`);
  if (failures > 0) {
    process.exit(1);
  }
}

main();
