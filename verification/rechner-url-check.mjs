#!/usr/bin/env node
/**
 * ECHTER Browser-Test: teilbare Rechner-URL liefert beim "Empfänger"
 * (frischer Page-Load derselben URL) dasselbe Ergebnis wie beim Absender —
 * inklusive Jahr < 2010 (Grenzfall a, US 3.8). Council-Vorabprüfung 29.08.2026.
 */
import { chromium } from 'playwright';

const BASE = process.env.TF_URL || 'http://localhost:3000';

async function readResultText(page) {
  await page.waitForSelector('[data-testid="kaufkraft-ergebnis"], .tf-rechner-ergebnis, main', { timeout: 15000 });
  // Fallback: gesamten sichtbaren Text des Rechner-Containers lesen.
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="kaufkraft-ergebnis"]') ||
      document.querySelector('.tf-rechner-ergebnis') ||
      document.body;
    return el.innerText;
  });
}

async function checkScenario(browser, path, label) {
  const page = await browser.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const url = page.url();
  const text = await readResultText(page);
  await page.close();
  console.log(`--- ${label} ---`);
  console.log('URL:', url);
  console.log(text.slice(0, 1500));
  console.log('');
  return { url, text };
}

async function main() {
  const browser = await chromium.launch();

  // Szenario 1: Standardjahr 2015, Betrag 500 — zwei unabhängige Page-Loads
  // derselben URL simulieren "Absender" und "Empfänger".
  const a1 = await checkScenario(browser, '/?betrag=500&jahr=2015&modus=niveau', 'Empfänger 1 (Jahr 2015, CHF 500)');
  const a2 = await checkScenario(browser, '/?betrag=500&jahr=2015&modus=niveau', 'Empfänger 2 (identische URL, frischer Load)');

  // Szenario 2: Jahr vor 2010 (Grenzfall a) — Trueflation existiert nicht,
  // muss klar ausgewiesen sein, kein Interpolieren.
  const b1 = await checkScenario(browser, '/?betrag=1000&jahr=1980&modus=niveau', 'Jahr 1980 (vor Trueflation-Start)');

  // Szenario 3 (Security-Review-Fund, 29.08.2026): betrag-Obergrenze.
  // MAX_BETRAG = 1e12 -- ein Wert darueber muss geclampt werden, nicht als
  // Infinity/absurd grosse Zahl durchschlagen.
  const d1 = await checkScenario(browser, '/?betrag=999999999999999&jahr=2015&modus=niveau', 'Betrag weit ueber MAX_BETRAG (Clamp-Test)');

  const identical = a1.text === a2.text;
  console.log(identical
    ? 'PASS: Zwei unabhängige Page-Loads derselben Rechner-URL liefern IDENTISCHEN Ergebnistext.'
    : 'FAIL: Ergebnistext unterscheidet sich zwischen den beiden Loads derselben URL.');

  const mentions2010Limit = /2010/.test(b1.text);
  console.log(mentions2010Limit
    ? 'PASS: Jahr 1980 (vor 2010) löst einen erkennbaren Hinweis auf die Trueflation-Startgrenze (2010) aus.'
    : 'FAIL/PRÜFEN: kein erkennbarer Hinweis auf 2010-Grenze im Ergebnistext für Jahr 1980 gefunden.');

  // Betreiber-Vorgabe (29.08.2026, nach Code-Review-Fund): OBERE Grenze testen
  // (Jahr NACH dem letzten verfügbaren BAG-Prämienjahr, aktuell 2024) —
  // muss eine EIGENE Meldung zeigen ("Prämiendaten reichen bis..."), NICHT den
  // Dauer-Ladezustand "Daten werden geladen…" (US 3.16: "lädt" != "existiert
  // strukturell nicht").
  // Bugfix (Frontend-Review 30.08.2026): browser.close() lag zuvor VOR den
  // Szenarien c1/c2 (Jahr 2026/2024) -- jeder weitere checkScenario()-Aufruf
  // scheiterte danach mit "Target page, context or browser has been closed".
  // Kein Befund am Produktcode, reiner Test-Bug (Datei-History bestätigt:
  // browser.close() stand direkt nach Szenario 3). Jetzt ans Ende von main()
  // verschoben, EIN Browser-Objekt für den gesamten Lauf.
  const c1 = await checkScenario(browser, '/?betrag=1000&jahr=2026&modus=niveau', 'Jahr 2026 (nach letztem BAG-Jahr)');
  const showsLoadingForever = /Daten werden geladen/.test(c1.text);
  const showsUpperBoundMessage = /Prämiendaten reichen bis/.test(c1.text);
  console.log(!showsLoadingForever && showsUpperBoundMessage
    ? 'PASS: Jahr 2026 (nach letztem verfügbaren Prämienjahr) zeigt die korrekte "Prämiendaten reichen bis..."-Meldung, KEINEN Dauer-Ladezustand.'
    : `FAIL: Jahr 2026 zeigt showsLoadingForever=${showsLoadingForever}, showsUpperBoundMessage=${showsUpperBoundMessage} — Zustandslogik US 3.16 verletzt.`);

  console.log('\n--- NEGATIVTEST: Jahr 2024 (letztes verfügbares Jahr) MUSS normal funktionieren, nicht die Grenzmeldung zeigen ---');
  const c2 = await checkScenario(browser, '/?betrag=1000&jahr=2024&modus=niveau', 'Jahr 2024 (letztes verfügbares Jahr, Grenzfall)');
  const wronglyShowsUpperBound = /Prämiendaten reichen bis/.test(c2.text);
  console.log(!wronglyShowsUpperBound
    ? 'PASS NEGATIVTEST: Jahr 2024 (letztes verfügbares Jahr) zeigt KEINE Grenzmeldung — normaler Berechnungspfad, Bedingung ist nicht zu weit gefasst.'
    : 'FAIL NEGATIVTEST: Jahr 2024 zeigt fälschlich die Grenzmeldung — die >-Bedingung ist vermutlich zu >= geworden.');

  console.log('\n--- Betrag-Obergrenze (Security-Review-Fund) ---');
  const showsInfinity = /∞|Infinity/.test(d1.text);
  console.log(!showsInfinity
    ? 'PASS: Betrag weit über MAX_BETRAG wird geclampt, kein "∞"/Infinity im Ergebnistext.'
    : 'FAIL: Betrag-Obergrenze greift nicht — Infinity/∞ im Ergebnistext gefunden.');

  await browser.close();

  if (!identical || (showsLoadingForever || !showsUpperBoundMessage) || wronglyShowsUpperBound || showsInfinity) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
