#!/usr/bin/env node
/**
 * trueflation.ch — Plausi-Check End-to-End-Test (P2, US 1.7)
 *
 * ═══ DRY-RUN-DEFAULT (Betreiber-Direktive, 28.08.2026, Fund: 6 echte
 * Telegram-Sends in 27 Minuten) ═══
 * URSACHE DES VORFALLS (geklärt vor diesem Fix, nicht behauptet): Test 2
 * sendete bislang UNGEMOCKT bei jedem Lauf dieser Datei — inkl. jedem Lauf
 * der vollen Regressionssuite (`for f in test-*.mjs`). Während einer
 * iterativen Reparatursession wurde diese Suite mehrfach neu ausgeführt
 * (nach jedem Fix, zur Verifikation) — sechs Vollaufläufe = sechs echte
 * Sends, unregelmässiger Abstand exakt passend zur Iterationskadenz, KEIN
 * Cron/Watcher/Hook (Hypothese A bestehend bestätigt, Hypothese B
 * verworfen: es existiert in diesem Repo kein Mechanismus, der die Pipeline
 * automatisch wiederholt auslösen könnte — nichts war gepusht, GitHub
 * Actions kann nicht gelaufen sein).
 *
 * Die ursprüngliche P2-Vorgabe ("muss mindestens einmal real ausgelöst
 * werden") bleibt gültig, ABER: ein Testskript, das den PRODUKTIVEN
 * Alarmkanal bei jedem Lauf benutzt, trainiert dem Betreiber genau das
 * falsche Verhalten an (US 1.7: Gewöhnungseffekt entwertet den
 * Schutzmechanismus). Lösung: DEFAULT = Dry-Run (Nachricht geht an stdout,
 * kein echter Versand). Ein ECHTER Versand ist nur mit explizitem Opt-in
 * möglich:
 *   node test-plausibility-check.mjs --real-send
 *   REAL_TELEGRAM_TEST=1 node test-plausibility-check.mjs
 * Damit ist ein Wiederholungslauf (z.B. Teil der vollen Suite während einer
 * Reparatursession) standardmässig folgenlos für den Telegram-Kanal.
 */

import { checkPlausibility } from './lib/plausibility-check.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REAL_SEND = process.argv.includes('--real-send') || process.env.REAL_TELEGRAM_TEST === '1';

// FIX (Regression, 28.08.2026, selbstverursacht durch Fix 2/Zustandspersistenz):
// Dieser Test nutzte bislang KEINEN eigenen plausiStateDir und schrieb damit
// in den echten Produktiv-Zustandsordner (data/_pipeline-status/plausi-pending/).
// Nach dem ERSTEN Lauf blieb dort ein Pending-Zustand für die fest kodierten
// Testwerte liegen — jeder Folgelauf derselben Datei schlug dadurch fehl
// (status='pending-unchanged' statt 'jump-violation'/'range-violation'),
// weil Test und Produktivbetrieb sich denselben Zustand teilten. Tests
// müssen deterministisch wiederholbar sein — eigener Temp-Ordner pro Lauf,
// analog zu test-plausibility-state.mjs und test-incremental-plausibility.mjs.
const testStateDir = mkdtempSync(path.join(tmpdir(), 'trueflation-plausi-check-test-'));
process.on('exit', () => {
  try { rmSync(testStateDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

/** Dry-Run-notifyFn: druckt die Nachricht sichtbar auf stdout, sendet NICHTS.
 * Rückgabewert `true` (wie ein erfolgreicher echter Versand), damit der
 * Rückgabewert von checkPlausibility() sich nicht je nach Modus unterscheidet
 * — nur der SEITENEFFEKT (echter Versand ja/nein) ändert sich. */
function dryRunNotify(message) {
  console.log('  [DRY-RUN, kein echter Versand — mit --real-send erzwingen] Würde senden:');
  console.log('  ' + message.split('\n').join('\n  '));
  return true;
}

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function main() {
  console.log('=== trueflation.ch — Plausi-Check End-to-End-Test (US 1.7) ===\n');

  // --- Test 1: Normaler Wert, keine Eskalation ---
  console.log('--- Test 1: Normaler Wert (innerhalb Range + Schwellwert) ---');
  const r1 = checkPlausibility({
    sourceKey: 'test-lik-normal',
    oldValue: 108.2,
    newValue: 108.5,
    absoluteRange: { min: 50, max: 5600 },
    maxChangeRatePercent: 2.0,
    sourceUrl: 'https://example.com/test',
  });
  report('Test 1: status=ok', r1.status === 'ok');

  // --- Test 2: Sprungverletzung — DRY-RUN per Default, echter Versand nur mit --real-send ---
  console.log(`\n--- Test 2: Sprungverletzung (${REAL_SEND ? 'ECHTE Telegram-Eskalation, end-to-end' : 'DRY-RUN, siehe Kommentar oben'}) ---`);
  const r2 = checkPlausibility({
    sourceKey: 'test-lik-jump (P2 End-to-End-Verifikation, bitte ignorieren)',
    oldValue: 108.2,
    newValue: 118.5, // ~9.5% Sprung, deutlich über 2% Schwellwert
    absoluteRange: { min: 50, max: 5600 },
    maxChangeRatePercent: 2.0,
    sourceUrl: 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master',
    notifyFn: REAL_SEND ? undefined : dryRunNotify, // undefined -> Default-Parameter greift (echter Versand)
    plausiStateDir: testStateDir,
  });
  report('Test 2: status=jump-violation', r2.status === 'jump-violation', `Änderung: ${r2.changePercent.toFixed(2)}%`);
  console.log(
    REAL_SEND
      ? '  → Telegram-Nachricht wurde ECHT gesendet (--real-send aktiv) — bitte im Chat verifizieren.'
      : '  → DRY-RUN: keine echte Telegram-Nachricht gesendet (Default). Fuer echten Versand: --real-send.'
  );

  // --- Test 3: Erwarteter Sprung (LIK-Rebasierung) — DARF NICHT eskalieren ---
  console.log('\n--- Test 3: Erwarteter Sprung (LIK-Rebasierung, US 1.7 AC) ---');
  const r3 = checkPlausibility({
    sourceKey: 'test-lik-rebasing',
    oldValue: 100.0,
    newValue: 1029.9, // simuliert Basiswechsel-Sprung
    absoluteRange: { min: 50, max: 5600 },
    maxChangeRatePercent: 2.0,
    sourceUrl: 'https://example.com/test',
    expectedJump: true,
    expectedJumpReason: 'LIK-Rebasierung auf neue Basis (US 1.8-Ergänzung)',
    plausiStateDir: testStateDir,
  });
  report('Test 3: status=expected-jump (KEINE Eskalation)', r3.status === 'expected-jump');

  // --- Test 4: Erwarteter Sprung (provisorischer KVPI-Wert) — DARF NICHT eskalieren ---
  console.log('\n--- Test 4: Erwarteter Sprung (provisorischer KVPI-Wert, US 1.8) ---');
  const r4 = checkPlausibility({
    sourceKey: 'test-kvpi-provisional',
    oldValue: 250.0,
    newValue: 265.0, // ~6% Sprung bei Ersetzung provisorisch → definitiv
    absoluteRange: { min: 0, max: 500 },
    maxChangeRatePercent: 3.0,
    sourceUrl: 'https://example.com/test',
    expectedJump: true,
    expectedJumpReason: 'Ersetzung provisorischer KVPI-Wert durch definitiven Wert (US 1.8)',
    plausiStateDir: testStateDir,
  });
  report('Test 4: status=expected-jump (KEINE Eskalation)', r4.status === 'expected-jump');

  // --- Test 5: Bereichsverletzung (kaputter Parse) — muss eskalieren, aber als Mock (kein Spam) ---
  console.log('\n--- Test 5: Bereichsverletzung (Mock, kein zweiter echter Telegram-Spam) ---');
  let mockCalled = false;
  const r5 = checkPlausibility({
    sourceKey: 'test-range-violation',
    oldValue: 108.0,
    newValue: 99999.9, // offensichtlicher Parse-Fehler
    absoluteRange: { min: 50, max: 5600 },
    maxChangeRatePercent: 2.0,
    sourceUrl: 'https://example.com/test',
    notifyFn: (msg) => {
      mockCalled = true;
      console.log(`  [mock-notify] würde senden: ${msg.split('\n')[0]}`);
      return true;
    },
    plausiStateDir: testStateDir,
  });
  report('Test 5: status=range-violation', r5.status === 'range-violation');
  report('Test 5: notifyFn wurde aufgerufen', mockCalled);

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
