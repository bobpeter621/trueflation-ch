#!/usr/bin/env node
/**
 * NEGATIVTEST zu REQ-T7 (Datenkonsistenz, 05.09.2026): Wert in der
 * Datenquelle künstlich ändern und nachweisen, dass Tabelle UND Chart UND
 * Rechner sich GEMEINSAM ändern. Ändert sich nur eines: FAIL.
 *
 * METHODE: Playwright page.route() fängt die drei JSON-Endpunkte ab und
 * verändert den jeweils LETZTEN Trueflation-Wert künstlich (+50 %) —
 * dieselbe Situation wie ein echtes Daten-Update durch die Pipeline
 * (neuer Monat / Prämie definitiv statt provisorisch ändert diese Dateien).
 * Verglichen wird Baseline (Originaldaten) vs. modifizierter Datenstand:
 *
 *  1. TABELLE: Zelle "Trueflation (%)" der Endjahr-Zeile + Fusszeile müssen
 *     sich ändern (Quelle: trueflation-index-yearly.json).
 *  2. RECHNER: Trueflation-Ergebnis-CHF bei betrag=1000&jahr=2010 muss
 *     sich ändern (Quelle: trueflation-index-yearly.json, latest-Value).
 *  3. CHART: Canvas-Pixel müssen sich ändern (Quelle:
 *     trueflation-index-monthly.json — Linienendpunkt verschiebt sich).
 *
 * Zusätzlich KONTROLL-Lauf ohne Modifikation: zwei aufeinanderfolgende
 * Läufe mit Originaldaten müssen IDENTISCHE Werte liefern (Determinismus —
 * sonst wäre der Vergleich oben wertlos).
 *
 * Aufruf:
 *   export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *   node verification/daten-kopplung-check.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.TF_URL || 'http://localhost:3000';
const FACTOR = 1.5; // künstliche Änderung: letzter Trueflation-Wert +50 %

let failures = 0;
function check(ok, passMsg, failMsg) {
  console.log(ok ? `[PASS] ${passMsg}` : `[FAIL] ${failMsg}`);
  if (!ok) failures++;
}

async function snapshot(browser, modify) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  if (modify) {
    await page.route('**/data/trueflation/trueflation-index-yearly.json', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      const last = json.calendarYearAverages[json.calendarYearAverages.length - 1];
      last.trueflationIndexAvg = Math.round(last.trueflationIndexAvg * FACTOR * 10000) / 10000;
      await route.fulfill({ response: res, json });
    });
    await page.route('**/data/trueflation/trueflation-index-monthly.json', async (route) => {
      const res = await route.fetch();
      const json = await res.json();
      const last = json.values[json.values.length - 1];
      last.trueflationIndex = Math.round(last.trueflationIndex * FACTOR * 10000) / 10000;
      await route.fulfill({ response: res, json });
    });
  }
  await page.goto(`${URL}?betrag=1000&jahr=2010`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tf-tabelle tbody tr', { timeout: 15000 });
  await page.waitForSelector('.tf-chart-canvas-wrapper canvas', { timeout: 15000 });
  await page.waitForTimeout(900); // Chart-Render + Rechner-Fetch abwarten

  const tableLastRow = await page.locator('.tf-tabelle tbody tr').last().locator('td').allTextContents();
  const tableFooter = await page.locator('.tf-tabelle tfoot td').allTextContents();
  // Rechner: Trueflation-Ergebniszeile (dd mit Trueflation-Farbe)
  const rechnerTf = await page.locator('.tf-rechner dd.text-xl').nth(1).innerText();
  const canvasHash = await page.evaluate(() => {
    const c = document.querySelector('.tf-chart-canvas-wrapper canvas');
    const d = c.toDataURL('image/png');
    // einfacher Hash (FNV-1a) — reicht für Gleich/Ungleich-Vergleich
    let h = 0x811c9dc5;
    for (let i = 0; i < d.length; i++) { h ^= d.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  });
  await context.close();
  return { tableLastRow: tableLastRow.map((s) => s.trim()), tableFooter: tableFooter.map((s) => s.trim()), rechnerTf: rechnerTf.trim(), canvasHash };
}

async function main() {
  const browser = await chromium.launch();

  console.log('=== Kontroll-Lauf: 2x Originaldaten -> identische Werte (Determinismus) ===');
  const base1 = await snapshot(browser, false);
  const base2 = await snapshot(browser, false);
  console.log(`  Lauf 1: Zeile 2024 ${JSON.stringify(base1.tableLastRow)}, Fuss ${JSON.stringify(base1.tableFooter)}, Rechner ${base1.rechnerTf}, Canvas ${base1.canvasHash}`);
  check(
    JSON.stringify(base1) === JSON.stringify(base2),
    'KONTROLLE: Zwei Läufe mit Originaldaten liefern identische Werte (Vergleich ist belastbar).',
    'KONTROLLE FEHLGESCHLAGEN: Originaldaten-Läufe unterscheiden sich — flackernder Test, keine Aussage möglich.'
  );

  console.log('\n=== NEGATIVTEST REQ-T7: letzter Trueflation-Wert künstlich +50 % ===');
  const mod = await snapshot(browser, true);
  console.log(`  Modifiziert: Zeile 2024 ${JSON.stringify(mod.tableLastRow)}, Fuss ${JSON.stringify(mod.tableFooter)}, Rechner ${mod.rechnerTf}, Canvas ${mod.canvasHash}`);

  const tabelleGeaendert = mod.tableLastRow[1] !== base1.tableLastRow[1] && mod.tableFooter[1] !== base1.tableFooter[1];
  const rechnerGeaendert = mod.rechnerTf !== base1.rechnerTf;
  const chartGeaendert = mod.canvasHash !== base1.canvasHash;

  check(
    tabelleGeaendert,
    `TABELLE reagiert auf Datenquellen-Änderung (Endjahr-TF ${base1.tableLastRow[1]} -> ${mod.tableLastRow[1]}, Fuss ${base1.tableFooter[1]} -> ${mod.tableFooter[1]}).`,
    'TABELLE zeigt nach Datenquellen-Änderung noch die ALTEN Werte — Entkopplung!'
  );
  check(
    rechnerGeaendert,
    `RECHNER reagiert auf Datenquellen-Änderung (Trueflation-Ergebnis ${base1.rechnerTf} -> ${mod.rechnerTf}).`,
    'RECHNER zeigt nach Datenquellen-Änderung noch den ALTEN Wert — Entkopplung!'
  );
  check(
    chartGeaendert,
    `CHART reagiert auf Datenquellen-Änderung (Canvas-Hash ${base1.canvasHash} -> ${mod.canvasHash}).`,
    'CHART rendert nach Datenquellen-Änderung unverändert — Entkopplung!'
  );
  check(
    tabelleGeaendert && rechnerGeaendert && chartGeaendert,
    'REQ-T7 NEGATIVTEST bestanden: Tabelle UND Chart UND Rechner ändern sich GEMEINSAM bei Datenquellen-Änderung.',
    'REQ-T7 VERLETZT: mindestens eine der drei Darstellungen zeigte alte Werte (siehe Einzelbefunde oben).'
  );

  await browser.close();
  console.log(`\n=== Gesamtergebnis: ${failures === 0 ? 'PASS' : `FAIL (${failures} fehlgeschlagene Checks)`} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
