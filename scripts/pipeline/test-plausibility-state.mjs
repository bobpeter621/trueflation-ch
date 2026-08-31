#!/usr/bin/env node
/**
 * trueflation.ch — Zustandspersistenz für Plausi-Eskalationen (US 1.7, Fix 2)
 *
 * FUND (Betreiber, 28.08.2026): Ohne Zustandspersistenz erzeugt JEDER
 * Pipeline-Lauf, der auf einen bereits gemeldeten, noch unentschiedenen Wert
 * trifft, ERNEUT eine Eskalation. Bei täglichem Scheduler wäre das täglich
 * dieselbe Meldung — der Gewöhnungseffekt (US 1.7) entwertet den
 * Schutzmechanismus.
 *
 * NEGATIVTEST (Betreiber-Vorgabe, wörtlich): "Zwei aufeinanderfolgende
 * Pipeline-Läufe mit demselben verdächtigen Wert dürfen GENAU EINE Meldung
 * erzeugen. Vorführen, nicht erklären."
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPlausibility } from './lib/plausibility-check.mjs';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function main() {
  console.log('=== trueflation.ch — Zustandspersistenz Plausi-Eskalation (US 1.7, Fix 2) ===\n');

  const stateDir = mkdtempSync(path.join(tmpdir(), 'trueflation-plausi-state-test-'));
  try {
    const notifications = [];
    const mockNotify = (msg) => {
      notifications.push(msg);
      return true;
    };

    console.log('--- NEGATIVTEST (Kernfall): zwei aufeinanderfolgende Läufe, IDENTISCHER Wert ---');
    const run1 = checkPlausibility({
      sourceKey: 'test-repeated-jump',
      oldValue: 108.2,
      newValue: 118.5, // ~9.5% Sprung
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotify,
      plausiStateDir: stateDir,
    });
    const run2 = checkPlausibility({
      sourceKey: 'test-repeated-jump',
      oldValue: 108.2,
      newValue: 118.5, // exakt derselbe Wert wie Lauf 1 — simuliert zweiten Pipeline-Lauf
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotify,
      plausiStateDir: stateDir,
    });

    report('Lauf 1: status=jump-violation (erste Meldung)', run1.status === 'jump-violation');
    report('Lauf 2: status=pending-unchanged (KEINE zweite Meldung)', run2.status === 'pending-unchanged');
    report(
      'BELEG: genau EINE Telegram-Meldung nach zwei Läufen mit identischem Wert',
      notifications.length === 1,
      `notifyFn-Aufrufe gesamt: ${notifications.length} (erwartet: 1)`
    );

    console.log('\n--- Kontrolltest: dritter Lauf mit GEÄNDERTEM Wert löst erneut aus ---');
    const run3 = checkPlausibility({
      sourceKey: 'test-repeated-jump',
      oldValue: 108.2,
      newValue: 125.0, // anderer Wert als Lauf 1/2
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotify,
      plausiStateDir: stateDir,
    });
    report('Lauf 3 (geänderter Wert): status=jump-violation (neue Meldung, kein Spam-Unterdrücken)', run3.status === 'jump-violation');
    report(
      'BELEG: geänderter Wert erzeugt eine ZWEITE Meldung (Gesamt jetzt 2)',
      notifications.length === 2,
      `notifyFn-Aufrufe gesamt: ${notifications.length} (erwartet: 2)`
    );

    console.log('\n--- Kontrolltest: andere sourceKey ist unabhängig (kein Cross-Talk zwischen Quellen) ---');
    const runOtherKey = checkPlausibility({
      sourceKey: 'test-different-source',
      oldValue: 108.2,
      newValue: 118.5, // gleicher Wert wie Lauf 1, aber ANDERE Quelle
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotify,
      plausiStateDir: stateDir,
    });
    report('Andere Quelle mit gleichem Wert: status=jump-violation (eigener Zustand pro sourceKey)', runOtherKey.status === 'jump-violation');

    console.log('\n--- Kontrolltest: Bereichsverletzung folgt demselben Muster (nicht nur Sprungprüfung) ---');
    const rangeRun1 = checkPlausibility({
      sourceKey: 'test-repeated-range',
      oldValue: 108.0,
      newValue: 99999.9,
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotify,
      plausiStateDir: stateDir,
    });
    const rangeRun2 = checkPlausibility({
      sourceKey: 'test-repeated-range',
      oldValue: 108.0,
      newValue: 99999.9, // identischer Wert
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotify,
      plausiStateDir: stateDir,
    });
    report('Bereichsverletzung Lauf 1: status=range-violation', rangeRun1.status === 'range-violation');
    report('Bereichsverletzung Lauf 2 (identischer Wert): status=pending-unchanged', rangeRun2.status === 'pending-unchanged');

    console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

main();
