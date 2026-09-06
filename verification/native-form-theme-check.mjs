#!/usr/bin/env node
/**
 * trueflation.ch — Native Formularelemente + SVG-var()-Auflösung
 * (TEIL-B-Audit Punkte a/c, 05.09.2026). ECHTER Browser-Test, weil genau
 * diese Fehlerklasse (stilles Ignorieren ungültiger/fehlender CSS-Werte)
 * nur durch echtes Rendering sichtbar wird.
 *
 * PRÜFT:
 *  1. accent-color auf nativen Checkboxen (LikChart-Overlays) folgt dem
 *     Theme-Token --color-line-lik in BEIDEN Modi — nicht dem UA-Default-
 *     Blau. Ohne accent-color bliebe das Häkchen-Füllblau ein Fremdkörper
 *     im Farbsystem (analog zum K3-color-scheme-Fund: Hintergrund/Rahmen
 *     waren gefixt, Akzentfarbe nicht geprüft).
 *  2. Logo-SVG: stroke="var(--color-line-lik)" als SVG-Presentation-
 *     Attribute. Presentation Attributes werden vom Browser als CSS
 *     interpretiert und var() dort aufgelöst — ANDERS als bei der Canvas-
 *     2D-API (K1). Verifiziert per getComputedStyle, dass der Stroke
 *     tatsächlich zum Token-Hex auflöst (light #4b5f7a / dark #7d93b3)
 *     und NICHT schwarz/unaufgelöst bleibt. Das ist die Kontroll-Probe
 *     für Audit-Punkt (a): var() an eine Nicht-CSS-API wäre ein Fehler,
 *     var() im SVG-DOM ist es nicht — dieser Test beweist die Unterscheidung
 *     empirisch statt per Annahme.
 *
 * Aufruf:
 *   export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *   node verification/native-form-theme-check.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.TF_URL || 'http://localhost:3000';

const EXPECTED = {
  light: { lineLik: 'rgb(75, 95, 122)' },   // #4b5f7a
  dark: { lineLik: 'rgb(125, 147, 179)' },  // #7d93b3
};

let failures = 0;
function check(ok, passMsg, failMsg) {
  console.log(ok ? `[PASS] ${passMsg}` : `[FAIL] ${failMsg}`);
  if (!ok) failures++;
}

async function main() {
  const browser = await chromium.launch();

  for (const mode of ['light', 'dark']) {
    console.log(`\n=== Modus: ${mode.toUpperCase()} ===`);
    const context = await browser.newContext({ colorScheme: mode, viewport: { width: 1200, height: 900 } });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('.tf-chart-canvas-wrapper canvas', { timeout: 15000 });

    // Overlay-Menü öffnen, damit eine echte Checkbox im DOM sichtbar ist
    const summary = page.locator('.tf-overlay-menu summary');
    if ((await page.locator('.tf-overlay-menu').getAttribute('open')) === null) {
      await summary.click();
    }

    const accent = await page.evaluate(() => {
      const cb = document.querySelector('.tf-overlay-menu input[type="checkbox"]');
      if (!cb) return null;
      return getComputedStyle(cb).accentColor;
    });
    console.log(`  Checkbox accent-color (computed): ${accent} | erwartet: ${EXPECTED[mode].lineLik}`);
    check(
      accent === EXPECTED[mode].lineLik,
      `${mode}: Checkbox-Akzentfarbe folgt dem Theme-Token (${EXPECTED[mode].lineLik}), nicht dem UA-Blau.`,
      `${mode} VERLETZT: accent-color = ${accent}, erwartet ${EXPECTED[mode].lineLik} (UA-Default wäre z.B. rgb(0, 85, 255)/"auto").`
    );

    const logoStroke = await page.evaluate(() => {
      const path = document.querySelector('header svg path');
      if (!path) return null;
      return getComputedStyle(path).stroke;
    });
    console.log(`  Logo-SVG erster Pfad stroke (computed): ${logoStroke} | erwartet: ${EXPECTED[mode].lineLik}`);
    check(
      logoStroke === EXPECTED[mode].lineLik,
      `${mode}: var() in SVG-Presentation-Attribut wird korrekt aufgelöst (Browser-CSS, NICHT Canvas-API) — Logo folgt dem Theme.`,
      `${mode} VERLETZT: Logo-Stroke = ${logoStroke} — var() im SVG wird hier nicht aufgelöst (wäre ein echter Fund).`
    );

    await context.close();
  }

  await browser.close();
  console.log(`\n=== Gesamtergebnis: ${failures === 0 ? 'PASS' : `FAIL (${failures} fehlgeschlagene Checks)`} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
