#!/usr/bin/env node
/**
 * trueflation.ch — NEGATIVTEST: Plausi-Check im PRODUKTIVPFAD (US 1.7, Fund 28.08.2026)
 *
 * FUND: `incremental-update-lik.mjs` (Produktivskript) importierte
 * `lib/plausibility-check.mjs` nie — die Sprungprüfung im Produktivlauf war
 * eine eigene Funktion, die bei Verstoss nur `console.warn` aufrief. Der Wert
 * wurde trotzdem übernommen und geschrieben. `lib/plausibility-check.mjs`
 * lief ausschliesslich im Testcode (`test-plausibility-check.mjs`), NIE im
 * Produktivpfad.
 *
 * DIESER TEST beweist das Gegenteil für den reparierten Code: Er ruft
 * `processSeries()` — dieselbe Funktion, die `main()` in
 * `incremental-update-lik.mjs` produktiv verwendet — mit einem präparierten
 * Datensatz auf, der einen offensichtlichen Sprung-/Bereichsverstoss enthält,
 * und verifiziert:
 *   1. Der fehlerhafte Punkt wird NICHT in die geschriebene Datei übernommen.
 *   2. Die Telegram-Eskalationsfunktion wird aufgerufen (gemockt, kein
 *      echter Versand — Produktionsverhalten separat in
 *      test-plausibility-check.mjs end-to-end verifiziert).
 *   3. Ein GÜLTIGER Punkt in derselben Serie läuft weiterhin normal durch
 *      (Positivkontrolle — der Fix darf nicht zu pauschaler Blockade führen).
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processSeries } from './incremental-update-lik.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

function makeTempDataDir(existingValues) {
  const dir = mkdtempSync(path.join(tmpdir(), 'trueflation-incremental-test-'));
  const file = {
    _comment: 'Test-Fixture, kein echter Produktionsdatensatz.',
    basis: 'Ewige Reihe',
    values: existingValues,
  };
  writeFileSync(path.join(dir, 'total-index-monthly.json'), JSON.stringify(file, null, 2));
  return dir;
}

async function main() {
  console.log('=== trueflation.ch — NEGATIVTEST: Plausi-Check im Produktivpfad (US 1.7) ===\n');

  const existingValues = [
    { indexDate: 20250901, indexValue: 108.2 },
    { indexDate: 20251001, indexValue: 108.5 },
  ];

  // Neue Punkte: erster Punkt ist ein offensichtlicher Sprung (>2%/Monat,
  // deutlich über dem konfigurierten Schwellwert), zweiter Punkt (falls der
  // erste NICHT blockiert würde) wäre für sich genommen unauffällig — muss
  // aber ebenfalls zurückgehalten werden, da seine Vergleichsbasis (der
  // verworfene erste Punkt) nicht vertrauenswürdig ist (US 1.7: "wird NICHT
  // automatisch übernommen").
  const freshValues = [
    ...existingValues,
    { indexDate: 20251101, indexValue: 118.5 }, // ~9.2% Sprung — muss zurückgehalten werden
    { indexDate: 20251201, indexValue: 119.0 }, // folgt auf verworfenen Punkt — ebenfalls zurückgehalten
  ];

  const notifications = [];
  const mockNotify = (msg) => {
    notifications.push(msg);
    return true; // kein echter Telegram-Versand
  };

  const dataDir = makeTempDataDir(existingValues);
  // FIX (Regression, 28.08.2026, selbstverursacht durch Fix 2/Zustandspersistenz):
  // Ohne eigenen plausiStateDir schreibt checkPlausibility() in den ECHTEN
  // Produktiv-Zustandsordner (data/_pipeline-status/plausi-pending/) — ein
  // zweiter Testlauf mit denselben Testwerten würde dann fälschlich als
  // 'pending-unchanged' statt 'jump-violation' erkannt, weil der Zustand aus
  // dem ersten Lauf noch dort liegt. Eigener Temp-Ordner macht den Test
  // wieder wiederholbar/deterministisch, unabhängig vom Produktivzustand.
  const plausiStateDir = mkdtempSync(path.join(tmpdir(), 'trueflation-plausi-state-test-'));
  try {
    const result = await processSeries({
      label: 'test-totalIndex-monthly',
      existingFile: 'total-index-monthly.json',
      freshValues,
      dateField: 'indexDate',
      valueField: 'indexValue',
      maxRatePercent: 2.0,
      absoluteRange: { min: 50, max: 5600 },
      sourceUrl: 'https://example.com/test-source',
      notifyFn: mockNotify,
      dataDir,
      dryRun: false,
      plausiStateDir,
    });

    report('Sprungverletzung wird erkannt (escalated=true)', result.escalated === true);
    report('Genau 0 neue Punkte übernommen (beide zurückgehalten)', result.newPoints.length === 0, `tatsächlich: ${result.newPoints.length}`);
    report('Beide neuen Punkte in withheldPoints', result.withheldPoints.length === 2, `tatsächlich: ${result.withheldPoints.length}`);
    report('Telegram-Mock wurde aufgerufen (keine stille Konsolen-Warnung)', notifications.length >= 1, `notifyFn-Aufrufe: ${notifications.length}`);
    if (notifications.length > 0) {
      report('Eskalationsnachricht referenziert den Sprungwert', notifications[0].includes('118.5') || notifications[0].includes('9'), notifications[0].slice(0, 80));
    }

    // Geschriebene Datei muss weiterhin nur die ursprünglichen 2 Punkte enthalten.
    const written = JSON.parse(readFileSync(path.join(dataDir, 'total-index-monthly.json'), 'utf-8'));
    report('Geschriebene Datei enthält NUR die ursprünglichen Punkte (fehlerhafter Wert nicht publiziert)', written.values.length === 2, `tatsächlich: ${written.values.length} Punkte`);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(plausiStateDir, { recursive: true, force: true });
  }

  // --- Positivkontrolle: ein gültiger neuer Punkt läuft normal durch ---
  console.log('\n--- Positivkontrolle: gültiger Punkt wird normal übernommen ---');
  const okNotifications = [];
  const okMockNotify = (msg) => { okNotifications.push(msg); return true; };
  const dataDir2 = makeTempDataDir(existingValues);
  const plausiStateDir2 = mkdtempSync(path.join(tmpdir(), 'trueflation-plausi-state-test-'));
  try {
    const okResult = await processSeries({
      label: 'test-totalIndex-monthly-ok',
      existingFile: 'total-index-monthly.json',
      freshValues: [...existingValues, { indexDate: 20251101, indexValue: 108.9 }], // ~0.37%, unauffällig
      dateField: 'indexDate',
      valueField: 'indexValue',
      maxRatePercent: 2.0,
      absoluteRange: { min: 50, max: 5600 },
      sourceUrl: 'https://example.com/test-source',
      notifyFn: okMockNotify,
      dataDir: dataDir2,
      dryRun: false,
      plausiStateDir: plausiStateDir2,
    });
    report('Gültiger Punkt: escalated=false', okResult.escalated === false);
    report('Gültiger Punkt: 1 neuer Punkt übernommen', okResult.newPoints.length === 1, `tatsächlich: ${okResult.newPoints.length}`);
    report('Gültiger Punkt: keine Eskalation ausgelöst', okNotifications.length === 0, `notifyFn-Aufrufe: ${okNotifications.length}`);
  } finally {
    rmSync(dataDir2, { recursive: true, force: true });
    rmSync(plausiStateDir2, { recursive: true, force: true });
  }

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FEHLER: ${err.stack}`);
  process.exit(1);
});
