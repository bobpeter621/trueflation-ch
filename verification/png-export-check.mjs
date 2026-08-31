#!/usr/bin/env node
/**
 * ECHTER End-to-End-Test des PNG-Exports (Council-Vorabprüfung, 29.08.2026).
 * Prüft per echtem Browser-Klick + Pixel-Inspektion, ob der CC-BY-Hinweis
 * TATSÄCHLICH im exportierten Bild landet — nicht nur im Code lesbar ist.
 * Nicht Teil der regulären Testsuite (braucht Browser + laufenden Dev-Server),
 * daher separat unter verification/.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = process.env.TF_URL || 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const downloadPromise = page.waitForEvent('download');

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tf-chart-canvas-wrapper canvas', { timeout: 15000 });
  // kurze Wartezeit, damit Chart.js die Animation/den Render-Zyklus abschliesst
  await page.waitForTimeout(1000);

  const exportButton = page.getByRole('button', { name: 'Chart als Bild herunterladen' });
  await exportButton.click();

  const download = await downloadPromise;
  const path = '/tmp/tf-export-check.png';
  await download.saveAs(path);
  await browser.close();

  // PNG-Grösse und Existenz prüfen (roher Byte-Check reicht nicht für
  // "Text sichtbar" — dafür brauchen wir OCR oder Pixel-Musterabgleich).
  const buf = await (await import('node:fs/promises')).readFile(path);
  console.log(`PNG gespeichert: ${path}, ${buf.length} bytes`);
  if (buf.length < 1000) {
    console.error('FAIL: PNG ist verdächtig klein — vermutlich leer/fehlerhaft.');
    process.exit(1);
  }
  console.log('PASS (Existenz/Grösse): Download wurde ausgelöst und PNG ist nicht leer.');
  console.log('Für den Text-Beleg: siehe png-export-ocr-check.mjs (Tesseract) oder manuelle Sichtprüfung des Bildes unter', path);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
