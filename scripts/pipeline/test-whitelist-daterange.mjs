#!/usr/bin/env node
/**
 * trueflation.ch — Test: Whitelist-Erweiterung für fromDate/toDate (P2, US 1.12)
 *
 * Nachweis, dass die Lockerung für Datums-Query-Parameter (nötig für
 * Bulk-Import mit historischen Zeitfenstern) den SSRF-Schutz nicht aufweicht:
 * nur fromDate/toDate mit validem Datumsformat sind erlaubt, alles andere
 * (andere Parameter, ungültiges Format, anderer Host/Pfad) bleibt verweigert.
 */
import { fetchWhitelisted, WhitelistViolationError } from './lib/fetch-whitelisted.mjs';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function main() {
  console.log('=== Whitelist-Erweiterung: fromDate/toDate-Test ===\n');

  const baseUrl = 'https://data.snb.ch/api/cube/snb-m2/data/csv/de?dimSel=D0(B),D1(GM2)';
  // Diese Basis-URL ist NICHT in sources.json (falscher Cube-Name) - nur zum
  // Testen der Ablehnungslogik, kein echter Request wird ausgeführt, da er
  // schon vor dem fetch() abgelehnt wird.

  // Test 1: gültige fromDate/toDate an eine ECHTE whitelisted URL angehängt -> sollte durchgehen
  const realWhitelisted = 'https://data.snb.ch/api/cube/snbmonagg/data/csv/de?dimSel=D0(B),D1(GM2)';
  try {
    // GET statt HEAD — data.snb.ch antwortet auf HEAD mit 400 (kein Whitelist-Problem,
    // nur fehlende serverseitige HEAD-Unterstützung).
    const res = await fetchWhitelisted(`${realWhitelisted}&fromDate=2020-01-01&toDate=2020-02-01`);
    report('Test 1: gültige Datumsparameter an whitelisted URL -> durchgelassen', res.status === 200, `HTTP ${res.status}`);
  } catch (err) {
    report('Test 1: gültige Datumsparameter an whitelisted URL -> durchgelassen', false, err.message);
  }

  // Test 2: nicht-Datums-Parameter zusätzlich angehängt -> muss verweigert werden
  try {
    await fetchWhitelisted(`${realWhitelisted}&someOtherParam=hack`);
    report('Test 2: fremder Zusatzparameter -> verweigert', false, 'NICHT verweigert — Sicherheitslücke');
  } catch (err) {
    report('Test 2: fremder Zusatzparameter -> verweigert', err instanceof WhitelistViolationError);
  }

  // Test 3: fromDate mit ungültigem Format -> muss verweigert werden
  try {
    await fetchWhitelisted(`${realWhitelisted}&fromDate=not-a-date`);
    report('Test 3: ungültiges Datumsformat -> verweigert', false, 'NICHT verweigert — Sicherheitslücke');
  } catch (err) {
    report('Test 3: ungültiges Datumsformat -> verweigert', err instanceof WhitelistViolationError);
  }

  // Test 4: anderer Host, gleicher Pfad -> muss verweigert werden
  try {
    await fetchWhitelisted('https://evil.example.com/api/cube/snbmonagg/data/csv/de?dimSel=D0(B),D1(GM2)&fromDate=2020-01-01');
    report('Test 4: fremder Host -> verweigert', false, 'NICHT verweigert — Sicherheitslücke');
  } catch (err) {
    report('Test 4: fremder Host -> verweigert', err instanceof WhitelistViolationError);
  }

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
