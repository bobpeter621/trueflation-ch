#!/usr/bin/env node
/**
 * trueflation.ch — Simulierter Ausfall/Fallback-Test (P1-DoD, US 1.4)
 *
 * Simuliert eine dauerhaft unerreichbare Quelle über mehrere Pipeline-Läufe
 * hinweg und verifiziert:
 *   1. Nach jedem einzelnen Lauf: 3 Versuche mit exponentiellem Backoff,
 *      dann Fallback (kein Absturz), "veraltet"-Kennzeichnung gesetzt.
 *   2. Über mehrere Läufe: konsekutive Fehlläufe akkumulieren im Status.
 *   3. Nach 3 aufeinanderfolgenden LÄUFEN (nicht Versuchen): Telegram-
 *      Eskalation ausgelöst (via notifyFn-Mock, kein echter Versand).
 *   4. Nach einem erfolgreichen Lauf: Status wird zurückgesetzt, "veraltet"
 *      verschwindet.
 */

import { fetchWithResilience, getSourceStatus } from './lib/fetch-with-resilience.mjs';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATUS_FILE = path.join(REPO_ROOT, 'data', '_pipeline-status', 'test-fake-source.status.json');

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

// Sauberer Start: alten Test-Status entfernen
if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);

const notifications = [];
const mockNotify = (msg) => {
  notifications.push(msg);
  return true; // Simuliert erfolgreichen Versand ohne echten Telegram-Call
};

async function simulateAlwaysFailingFetch() {
  throw new Error('ECONNREFUSED (simulierter Netzwerkausfall für Testzwecke)');
}

async function simulateSuccessfulFetch() {
  return { indexValue: 108.2, indexDate: 20260701 };
}

async function main() {
  console.log('=== trueflation.ch — Simulierter Ausfall/Fallback-Test (US 1.4) ===\n');

  // --- Lauf 1: Ausfall ---
  console.log('--- Simulierter Pipeline-Lauf 1 (Quelle unerreichbar) ---');
  const run1 = await fetchWithResilience('test-fake-source', simulateAlwaysFailingFetch, {
    maxRetries: 3,
    escalationThreshold: 3,
    notifyFn: mockNotify,
  });
  report('Lauf 1: success=false (Fallback statt Absturz)', run1.success === false);
  report('Lauf 1: isStale=true gesetzt', run1.status.isStale === true);
  report('Lauf 1: consecutiveFailures=1', run1.status.consecutiveFailures === 1);
  report('Lauf 1: KEINE Eskalation (Schwelle noch nicht erreicht)', notifications.length === 0, `${notifications.length} Benachrichtigungen`);

  // --- Lauf 2: Ausfall ---
  console.log('\n--- Simulierter Pipeline-Lauf 2 (Quelle weiterhin unerreichbar) ---');
  const run2 = await fetchWithResilience('test-fake-source', simulateAlwaysFailingFetch, {
    maxRetries: 3,
    escalationThreshold: 3,
    notifyFn: mockNotify,
  });
  report('Lauf 2: consecutiveFailures=2', run2.status.consecutiveFailures === 2);
  report('Lauf 2: KEINE Eskalation (Schwelle noch nicht erreicht)', notifications.length === 0, `${notifications.length} Benachrichtigungen`);

  // --- Lauf 3: Ausfall — Eskalationsschwelle erreicht ---
  console.log('\n--- Simulierter Pipeline-Lauf 3 (Quelle weiterhin unerreichbar — Eskalation erwartet) ---');
  const run3 = await fetchWithResilience('test-fake-source', simulateAlwaysFailingFetch, {
    maxRetries: 3,
    escalationThreshold: 3,
    notifyFn: mockNotify,
  });
  report('Lauf 3: consecutiveFailures=3', run3.status.consecutiveFailures === 3);
  report('Lauf 3: Telegram-Eskalation AUSGELÖST (US 1.4-AC)', notifications.length === 1, `${notifications.length} Benachrichtigungen`);
  if (notifications.length === 1) {
    report('Lauf 3: Eskalationsnachricht enthält Quellenname und Fehleranzahl', notifications[0].includes('test-fake-source') && notifications[0].includes('3'));
    console.log(`  Eskalationstext: "${notifications[0]}"`);
  }

  // --- Lauf 4: Erfolg — Status muss zurückgesetzt werden ---
  console.log('\n--- Simulierter Pipeline-Lauf 4 (Quelle wieder erreichbar) ---');
  const run4 = await fetchWithResilience('test-fake-source', simulateSuccessfulFetch, {
    maxRetries: 3,
    escalationThreshold: 3,
    notifyFn: mockNotify,
  });
  report('Lauf 4: success=true', run4.success === true);
  report('Lauf 4: consecutiveFailures zurückgesetzt auf 0', run4.status.consecutiveFailures === 0);
  report('Lauf 4: isStale wieder false', run4.status.isStale === false);
  report('Lauf 4: keine weitere Eskalation ausgelöst', notifications.length === 1, `${notifications.length} Benachrichtigungen total`);

  // Aufräumen
  if (existsSync(STATUS_FILE)) rmSync(STATUS_FILE);

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
