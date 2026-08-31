#!/usr/bin/env node
/**
 * trueflation.ch — Whitelist-Erweiterung für Twelve-Data-Parameter (P4, US 1.6)
 *
 * FUND (28.08.2026, im eigenen Negativtest entdeckt): Die erste Version der
 * `outputsize`-Validierung prüfte nur das ZIFFERN-FORMAT (`/^[1-9]\d{0,4}$/`),
 * nicht die tatsächliche Obergrenze — `outputsize=99999` (5-stellig, aber
 * weit über dem Twelve-Data-Free-Tier-Limit von 5000) wurde fälschlich
 * durchgelassen. Fix: echte numerische Obergrenzenprüfung statt reiner
 * Formatprüfung. Dieser Test beweist den Fix UND verhindert eine Regression.
 *
 * Negativtest-Pflicht (P1-DoD, gilt weiterhin): jede neue erlaubte
 * Parameter-Klasse braucht einen Beweis, dass sie NICHT zu einer
 * Sicherheitslücke wird.
 */

import { fetchWhitelisted, WhitelistViolationError } from './lib/fetch-whitelisted.mjs';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function expectRejected(url, name) {
  try {
    await fetchWhitelisted(url, { method: 'HEAD' });
    report(name, false, 'wurde NICHT abgelehnt — SICHERHEITSLÜCKE');
  } catch (err) {
    report(name, err instanceof WhitelistViolationError, err instanceof WhitelistViolationError ? 'korrekt abgelehnt' : `falscher Fehlertyp: ${err.constructor.name}`);
  }
}

async function expectAllowed(url, name) {
  try {
    const res = await fetchWhitelisted(url, { method: 'HEAD' });
    report(name, true, `HTTP ${res.status} (durchgelassen, wie erwartet)`);
  } catch (err) {
    report(name, false, `wurde faelschlich abgelehnt: ${err.message}`);
  }
}

async function main() {
  console.log('=== trueflation.ch — Whitelist-Erweiterung Twelve-Data (P4, US 1.6) ===\n');

  const btcBase = 'https://api.twelvedata.com/time_series?symbol=BTC/CHF&interval=1day';

  await expectRejected(`https://evil.example.com/time_series?symbol=BTC/CHF&interval=1day&apikey=abc`, 'Fremder Host wird abgelehnt');
  await expectRejected(`${btcBase}&apikey=abc/../etc`, 'Manipulierter apikey mit URL-Struktur-Zeichen wird abgelehnt');
  await expectRejected(`${btcBase}&apikey=abc123&evil=1`, 'Fremder, nicht-whitelisted Zusatzparameter wird abgelehnt');
  await expectRejected(`${btcBase}&apikey=abc123&outputsize=99999`, 'KERNFALL (Fund 28.08.2026): outputsize über dem Twelve-Data-Limit (5000) wird abgelehnt');
  await expectRejected(`${btcBase}&apikey=abc123&outputsize=5001`, 'outputsize knapp über dem Limit (5001) wird abgelehnt');
  await expectRejected(`https://api.twelvedata.com/time_series?symbol=SMI&interval=1day&apikey=abc123`, 'Nicht-whitelistetes Symbol (SMI, in v1 gestrichen) wird abgelehnt');

  await expectAllowed(`${btcBase}&apikey=abc123&outputsize=5000`, 'outputsize exakt am Limit (5000) wird durchgelassen');
  await expectAllowed(`${btcBase}&apikey=abc123`, 'BTC/CHF mit gültigem apikey-Format wird durchgelassen (whitelisted Basis-URL + erlaubter Zusatzparameter)');

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
