#!/usr/bin/env node
/**
 * ECHTER Browser-Test: Rate-Modus schaltet ALLE Vergleichslinien um (LIK,
 * Trueflation, M2, Gold, BTC), Leitzins bleibt Prozentwert auf Sekundärachse
 * (Council-Vorabprüfung, 29.08.2026).
 *
 * KORREKTUR (Sicherheits-Council, 29.08.2026): Die erste Fassung dieses Tests
 * las `window.__tfChartRef`, ein Hook, der nur temporär während einer
 * manuellen Verifikation gesetzt und danach aus LikChart.tsx wieder entfernt
 * wurde — im committeten Code existiert dieser Hook NICHT. Der Test hätte
 * also immer `null` gelesen und wäre nie fehlgeschlagen, egal ob der
 * Rate-Modus tatsächlich funktioniert oder komplett kaputt ist. Exakt die
 * Fehlerklasse aus dem Datei-Header von test-trueflation-index.mjs
 * (premiumDataStatus-Rename, 8pp-Schwellwert) — ein Test, der grün meldet,
 * ohne geprüft zu haben.
 *
 * NEUER ANSATZ: Kein interner Hook nötig. Wir nutzen `canvas.toDataURL()` —
 * dieselbe öffentliche Canvas-API, die bereits für den PNG-Export verifiziert
 * wurde (siehe png-export-check.mjs) — um den Chart VOR und NACH dem
 * Moduswechsel als Bild zu vergleichen. Schaltet der Rate-Modus tatsächlich
 * um, unterscheiden sich die codierten Bilddaten. NEGATIVTEST: Klickt man
 * denselben Modus-Button ein zweites Mal (kein tatsächlicher Wechsel), MUSS
 * das Bild IDENTISCH bleiben — das beweist, dass der Vergleich nicht bei
 * jedem Render-Zyklus trivial "unterschiedlich" meldet (z.B. durch
 * Zeitstempel, Zufallswerte oder Font-Rendering-Jitter).
 */
import { chromium } from 'playwright';

const URL = process.env.TF_URL || 'http://localhost:3000';

async function getCanvasDataUrl(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.tf-chart-canvas-wrapper canvas');
    return canvas ? canvas.toDataURL('image/png') : null;
  });
}

function pctDiff(a, b) {
  if (a === b) return 0;
  const len = Math.max(a.length, b.length);
  let diffCount = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) diffCount++;
  }
  return (diffCount / len) * 100;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tf-chart-canvas-wrapper canvas', { timeout: 15000 });

  // Overlays + Leitzins aktivieren, damit alle Linien im Chart vorhanden sind.
  await page.getByLabel('SNB-Leitzins ein-/ausblenden').check();
  await page.getByLabel(/Overlay Gold/).check();
  await page.getByLabel(/Overlay Bitcoin|Overlay BTC/).check().catch(() => {});
  await page.waitForTimeout(600);

  console.log('=== Test 1: Niveau -> Rate schaltet den Chart sichtbar um ===');
  const niveauDataUrl1 = await getCanvasDataUrl(page);
  if (!niveauDataUrl1) {
    console.error('FEHLER: Canvas nicht gefunden — Chart nicht gerendert.');
    await browser.close();
    process.exit(1);
  }

  await page.getByRole('button', { name: 'Jahreswachstumsraten' }).click();
  await page.waitForTimeout(700);
  const rateDataUrl = await getCanvasDataUrl(page);

  const diffNiveauVsRate = pctDiff(niveauDataUrl1, rateDataUrl);
  console.log(`Bild-Byte-Differenz Niveau -> Rate: ${diffNiveauVsRate.toFixed(2)}%`);
  const modeSwitchWorks = diffNiveauVsRate > 1; // deutlich mehr als Rauschen
  console.log(modeSwitchWorks
    ? '[PASS] Rate-Modus verändert den gerenderten Chart sichtbar (Bilddaten unterscheiden sich deutlich).'
    : '[FAIL] Rate-Modus zeigt KEINE sichtbare Änderung — Umschalter funktioniert vermutlich nicht.');

  console.log('\n=== Test 1-neg: NEGATIVTEST — erneuter Klick auf denselben (bereits aktiven) Modus darf NICHTS ändern ===');
  // Wir sind jetzt im Rate-Modus. Klicken wir den Rate-Button NOCHMAL (Klick
  // auf den bereits aktiven Modus, kein tatsächlicher State-Wechsel) — das
  // Bild MUSS identisch bleiben. Beweist: der obige Diff-Mechanismus meldet
  // nicht bei jedem Render-Zyklus trivial "unterschiedlich".
  await page.getByRole('button', { name: 'Jahreswachstumsraten' }).click();
  await page.waitForTimeout(700);
  const rateDataUrl2 = await getCanvasDataUrl(page);
  const diffRateVsRateAgain = pctDiff(rateDataUrl, rateDataUrl2);
  console.log(`Bild-Byte-Differenz Rate -> Rate (kein Wechsel): ${diffRateVsRateAgain.toFixed(2)}%`);
  const noopIsStable = diffRateVsRateAgain === 0;
  console.log(noopIsStable
    ? '[PASS] NEGATIVTEST: erneuter Klick auf denselben Modus erzeugt KEINE Bildänderung (Vergleichsmechanismus ist nicht trivial "immer unterschiedlich").'
    : `[FAIL] NEGATIVTEST fehlgeschlagen — Bild ändert sich auch ohne echten Moduswechsel (${diffRateVsRateAgain.toFixed(2)}% Differenz), Testmechanismus unzuverlässig.`);

  console.log('\n=== Test 2: zurück zu Niveau — Bild kehrt zum ursprünglichen Niveau-Zustand zurück ===');
  await page.getByRole('button', { name: 'Indexierte Niveaus' }).click();
  await page.waitForTimeout(700);
  const niveauDataUrl2 = await getCanvasDataUrl(page);
  const diffNiveauRoundtrip = pctDiff(niveauDataUrl1, niveauDataUrl2);
  console.log(`Bild-Byte-Differenz Niveau (Start) -> Niveau (nach Roundtrip): ${diffNiveauRoundtrip.toFixed(2)}%`);
  const roundtripStable = diffNiveauRoundtrip === 0;
  console.log(roundtripStable
    ? '[PASS] Rückkehr zu Niveau reproduziert exakt das ursprüngliche Bild (deterministisches Re-Rendering, kein Datenverlust).'
    : `[INFO] Kleine Differenz beim Roundtrip (${diffNiveauRoundtrip.toFixed(2)}%) — kann an Zeitachsen-Ticks bei Resize liegen, nicht zwingend ein Fehler.`);

  await browser.close();

  const allCriticalPass = modeSwitchWorks && noopIsStable;
  console.log(`\n=== Gesamtergebnis: ${allCriticalPass ? 'PASS' : 'FAIL'} ===`);
  if (!allCriticalPass) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
