#!/usr/bin/env node
/**
 * trueflation.ch — Whitelist-Durchsetzungstest (P1-DoD, US 1.6/1.9)
 *
 * Beweis, nicht Behauptung: ein Positivtest zeigt nur, dass erlaubte URLs
 * funktionieren. Der eigentliche Sicherheitsnachweis ist der NEGATIVTEST —
 * ein Abruf gegen eine NICHT in config/sources.json gelistete URL muss
 * nachweislich abgelehnt werden, BEVOR irgendein Netzwerk-Request passiert.
 *
 * Usage: node test-whitelist-enforcement.mjs
 * Exit-Code 0 = beide Tests bestanden, 1 = mindestens einer fehlgeschlagen.
 */

import { fetchWhitelisted, WhitelistViolationError } from './lib/fetch-whitelisted.mjs';

let failures = 0;

function report(name, passed, detail) {
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function testPositive() {
  // Positivtest: eine WIRKLICH whitelisted URL muss durchgehen (kein Wurf).
  const whitelistedUrl = 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master';
  try {
    // HEAD statt vollem GET, um Bandbreite zu sparen (US 1.16) — reicht, um
    // zu beweisen, dass der Wrapper den Request überhaupt zulässt.
    const res = await fetchWhitelisted(whitelistedUrl, { method: 'HEAD' });
    report('Positivtest (whitelisted URL wird durchgelassen)', res.status === 200, `HTTP ${res.status}`);
  } catch (err) {
    report('Positivtest (whitelisted URL wird durchgelassen)', false, `Unerwarteter Fehler: ${err.message}`);
  }
}

async function testNegative() {
  // Negativtest: eine NICHT whitelisted URL muss VOR jedem Netzwerk-Request
  // abgelehnt werden. Absichtlich eine URL, die real erreichbar wäre
  // (example.com), damit der Test beweist, dass die Ablehnung an der
  // Whitelist-Prüfung liegt — nicht daran, dass die URL zufällig kaputt ist.
  const nonWhitelistedUrl = 'https://example.com/nicht-in-sources-json-gelistet';
  try {
    await fetchWhitelisted(nonWhitelistedUrl, { method: 'HEAD' });
    report('Negativtest (nicht-whitelisted URL wird abgelehnt)', false, 'Abruf wurde NICHT verweigert — SICHERHEITSLÜCKE');
  } catch (err) {
    const isCorrectRejection = err instanceof WhitelistViolationError;
    report(
      'Negativtest (nicht-whitelisted URL wird abgelehnt)',
      isCorrectRejection,
      isCorrectRejection ? `korrekt verweigert: ${err.message}` : `falscher Fehlertyp: ${err.constructor.name}: ${err.message}`
    );
  }
}

async function testNegativeSimilarUrl() {
  // Verschärfter Negativtest: eine URL, die der whitelisted URL SEHR ÄHNLICH
  // sieht (gleicher Host, anderer Pfad) — beweist, dass exakter String-Match
  // greift, nicht nur Host-basierte Prüfung (die wäre zu grosszügig).
  const similarButNotWhitelisted = 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:irgendwas-anderes/master';
  try {
    await fetchWhitelisted(similarButNotWhitelisted, { method: 'HEAD' });
    report('Negativtest verschärft (ähnliche, aber nicht exakt gelistete URL)', false, 'Abruf wurde NICHT verweigert — SICHERHEITSLÜCKE (Whitelist zu grosszügig)');
  } catch (err) {
    const isCorrectRejection = err instanceof WhitelistViolationError;
    report(
      'Negativtest verschärft (ähnliche, aber nicht exakt gelistete URL)',
      isCorrectRejection,
      isCorrectRejection ? 'korrekt verweigert — exakter Match erforderlich' : `falscher Fehlertyp: ${err.constructor.name}`
    );
  }
}

async function main() {
  console.log('=== trueflation.ch — Whitelist-Durchsetzungstest (P1-DoD) ===\n');
  await testPositive();
  await testNegative();
  await testNegativeSimilarUrl();
  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
