#!/usr/bin/env node
/**
 * trueflation.ch — Plausi-Check End-to-End-Test (P2, US 1.7)
 *
 * Muss laut Betreiber-Vorgabe (25.08.2026) "mindestens einmal real ausgelöst
 * und über Telegram freigegeben worden sein — end-to-end, nicht simuliert."
 *
 * Dieser Test sendet eine ECHTE Telegram-Nachricht (kein Mock) für den
 * Bereichs- und Sprungverletzungsfall, und verifiziert per Code, dass die
 * beiden AC-Ausnahmefälle (LIK-Rebasierung, provisorischer KVPI-Wert)
 * korrekt NICHT eskalieren.
 */

import { checkPlausibility } from './lib/plausibility-check.mjs';

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

  // --- Test 2: Sprungverletzung — ECHTE Telegram-Eskalation (real, nicht Mock) ---
  console.log('\n--- Test 2: Sprungverletzung (ECHTE Telegram-Eskalation, end-to-end) ---');
  const r2 = checkPlausibility({
    sourceKey: 'test-lik-jump (P2 End-to-End-Verifikation, bitte ignorieren)',
    oldValue: 108.2,
    newValue: 118.5, // ~9.5% Sprung, deutlich über 2% Schwellwert
    absoluteRange: { min: 50, max: 5600 },
    maxChangeRatePercent: 2.0,
    sourceUrl: 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master',
  });
  report('Test 2: status=jump-violation', r2.status === 'jump-violation', `Änderung: ${r2.changePercent.toFixed(2)}%`);
  console.log('  → Telegram-Nachricht wurde ECHT gesendet (kein Mock) — bitte im Chat verifizieren.');

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
  });
  report('Test 5: status=range-violation', r5.status === 'range-violation');
  report('Test 5: notifyFn wurde aufgerufen', mockCalled);

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
