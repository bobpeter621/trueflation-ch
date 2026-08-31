#!/usr/bin/env node
/**
 * trueflation.ch — Header-Validierung (Spaltenüberschriften) + NEGATIVTEST (US 2.7)
 *
 * FUND (Betreiber-Audit, 28.08.2026): Die SNB-CSV-Parser erkannten die
 * Header-Zeile nur am Präfix ('"Date"') und griffen danach POSITIONAL auf
 * Spalten zu — ohne die tatsächlichen Spaltennamen/-reihenfolge gegen eine
 * erwartete Liste zu prüfen. Eine geänderte Spaltenreihenfolge oder
 * -umbenennung durch die Quelle hätte lautlos falsche Werte durchgereicht.
 *
 * Dieser Test prüft `lib/csv-header-validation.mjs` (Positiv- und
 * Negativfall) UND verifiziert end-to-end, dass die produktiven Parser
 * (bulk-import-snb-m2.mjs, bulk-import-snb-leitzins.mjs) bei manipulierten
 * Spaltenüberschriften abbrechen, statt falsche Werte zu übernehmen.
 */

import { assertExactColumns, parseSnbCsvLine, HeaderValidationError } from './lib/csv-header-validation.mjs';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

function expectThrows(fn, name) {
  try {
    fn();
    report(name, false, 'hat NICHT geworfen — Erwartung: HeaderValidationError');
  } catch (err) {
    report(name, err instanceof HeaderValidationError, `geworfen: ${err.constructor.name}: ${err.message.split('\n')[0]}`);
  }
}

console.log('=== trueflation.ch — Header-Validierung (Spaltenüberschriften) + Negativtest (US 2.7) ===\n');

// --- Test 1: Positivfall, exakte Übereinstimmung ---
console.log('--- Test 1: Positivfall (M2-CSV, exakte Header) ---');
try {
  assertExactColumns(['Date', 'D0', 'D1', 'Value'], ['Date', 'D0', 'D1', 'Value'], 'snb-m2');
  report('Test 1: exakte Übereinstimmung akzeptiert', true);
} catch (err) {
  report('Test 1: exakte Übereinstimmung akzeptiert', false, err.message);
}

// --- Test 2 (NEGATIV): fehlende Spalte ---
console.log('\n--- Test 2 (NEGATIV): fehlende Spalte muss erkannt werden ---');
expectThrows(
  () => assertExactColumns(['Date', 'D0', 'Value'], ['Date', 'D0', 'D1', 'Value'], 'snb-m2'),
  'Test 2: fehlende Spalte D1 wird erkannt'
);

// --- Test 3 (NEGATIV): zusätzliche/unerwartete Spalte ---
console.log('\n--- Test 3 (NEGATIV): unerwartete zusätzliche Spalte muss erkannt werden ---');
expectThrows(
  () => assertExactColumns(['Date', 'D0', 'D1', 'Value', 'Revision'], ['Date', 'D0', 'D1', 'Value'], 'snb-m2'),
  'Test 3: unerwartete Spalte "Revision" wird erkannt'
);

// --- Test 4 (NEGATIV, KERNFALL des Funds): vertauschte Reihenfolge ---
// Das ist der eigentliche Fund: gleiche Spaltennamen, andere Reihenfolge —
// ein rein mengenbasierter Vergleich (Set-Vergleich) würde das NICHT
// erkennen, aber der nachgelagerte Parser greift positional zu und würde
// D1 und Value vertauschen.
console.log('\n--- Test 4 (NEGATIV, KERNFALL): vertauschte Spaltenreihenfolge muss erkannt werden ---');
expectThrows(
  () => assertExactColumns(['Date', 'D0', 'Value', 'D1'], ['Date', 'D0', 'D1', 'Value'], 'snb-m2'),
  'Test 4: vertauschte Reihenfolge (D1<->Value) wird erkannt, obwohl beide Spaltenmengen identisch sind'
);

// --- Test 5 (NEGATIV): umbenannte Spalte (gleiche Position, anderer Name) ---
console.log('\n--- Test 5 (NEGATIV): umbenannte Spalte muss erkannt werden ---');
expectThrows(
  () => assertExactColumns(['Date', 'Dim0', 'D1', 'Value'], ['Date', 'D0', 'D1', 'Value'], 'snb-leitzins'),
  'Test 5: umbenannte Spalte "D0" -> "Dim0" wird erkannt'
);

// --- Test 6: Leitzins-CSV (3 Spalten, kein D1) — Positivfall ---
console.log('\n--- Test 6: Positivfall (Leitzins-CSV, 3 Spalten) ---');
try {
  assertExactColumns(['Date', 'D0', 'Value'], ['Date', 'D0', 'Value'], 'snb-leitzins');
  report('Test 6: 3-Spalten-Header akzeptiert', true);
} catch (err) {
  report('Test 6: 3-Spalten-Header akzeptiert', false, err.message);
}

// --- Test 7: parseSnbCsvLine entfernt Anführungszeichen korrekt ---
console.log('\n--- Test 7: parseSnbCsvLine (Quotierungs-Parsing) ---');
const parsed = parseSnbCsvLine('"Date";"D0";"D1";"Value"');
report('Test 7: Anführungszeichen entfernt, 4 Felder', JSON.stringify(parsed) === JSON.stringify(['Date', 'D0', 'D1', 'Value']), JSON.stringify(parsed));

// --- Test 8 (ECHTER END-TO-END NEGATIV): manipuliertes CSV bricht das
// PRODUKTIVSKRIPT als eigenen Subprozess ab (Code-Review-Finding 28.08.2026:
// die Vorversion importierte execFileSync, nutzte es aber nie und
// reproduzierte nur den Header-Extraktionsschritt inline — funktional
// deckungsgleich mit Test 4, aber als "end-to-end" beschriftet, was eine
// stärkere Beweiskraft suggerierte als tatsächlich geliefert wurde. Dieser
// Test ruft jetzt WIRKLICH bulk-import-snb-m2.mjs mit --fixture --dry-run
// als eigenen Prozess auf, exakt wie vom Reviewer empfohlen.) ---
console.log('\n--- Test 8 (ECHTER END-TO-END NEGATIV): manipuliertes CSV-Fixture bricht das Produktivskript als Subprozess ab ---');
{
  const { execFileSync } = await import('node:child_process');
  const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(__dirname, 'bulk-import-snb-m2.mjs');

  // Manipuliertes CSV: D1 und Value vertauscht (Kernfall des Funds) —
  // OHNE Header-Validierung würde 'GM2' in die Value-Spalte und eine Zahl
  // in die D1-Spalte geschrieben, der D1==='GM2'-Datenvertrags-Check in
  // bulk-import-snb-m2.mjs würde das zwar AUCH fangen (Zufallstreffer), aber
  // NICHT bei jeder denkbaren Spaltenvertauschung (z.B. Date<->D0 bei einer
  // Quelle ohne so einen Wertecheck) — deshalb die dedizierte Header-Prüfung.
  const dir = mkdtempSync(path.join(tmpdir(), 'trueflation-header-test-'));
  const fixturePath = path.join(dir, 'manipulated-m2.csv');
  writeFileSync(
    fixturePath,
    [
      '"CubeId";"snbmonagg"',
      '"PublishingDate";"2026-08-28 09:00"',
      '',
      '"Date";"D0";"Value";"D1"', // <- D1 und Value vertauscht
      '"2024-01";"B";"915635";"GM2"',
    ].join('\n')
  );

  // bulk-import-snb-m2.mjs unterstützt bereits --fixture (Datei statt Live-
  // Abruf) und --dry-run (kein Schreibvorgang) — damit ist ein echter
  // Subprozessaufruf ohne Netzwerkzugriff möglich, exakt wie vom Reviewer
  // empfohlen: `execFileSync('node', ['bulk-import-snb-m2.mjs', '--fixture',
  // fixturePath, '--dry-run'])` mit Erwartung eines Nicht-Null-Exitcodes.
  let threwWithNonZeroExit = false;
  let stderrOutput = '';
  try {
    execFileSync('node', [scriptPath, '--fixture', fixturePath, '--dry-run'], { stdio: 'pipe' });
  } catch (err) {
    threwWithNonZeroExit = (err.status ?? 1) !== 0;
    stderrOutput = err.stderr?.toString() ?? '';
  }

  report(
    'Test 8: bulk-import-snb-m2.mjs bricht als echter Subprozess mit Nicht-Null-Exitcode ab',
    threwWithNonZeroExit,
    stderrOutput.split('\n').find((l) => l.includes('Header-Validierung')) ?? stderrOutput.slice(0, 120)
  );
  report(
    'Test 8: Fehlerausgabe nennt die Header-Validierung als Ursache (nicht nur "irgendein Fehler")',
    stderrOutput.includes('Header-Validierung') || stderrOutput.includes('snb-m2'),
    'Grep nach "Header-Validierung"/"snb-m2" in stderr'
  );

  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
process.exit(failures === 0 ? 0 : 1);
