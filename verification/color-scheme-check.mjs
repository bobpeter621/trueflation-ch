#!/usr/bin/env node
/**
 * trueflation.ch — color-scheme Verifikation (Dark-Mode-Mobile-Bug,
 * 05.09.2026).
 *
 * FEHLERKLASSE: Weder tokens.css/globals.css noch layout.tsx setzten die
 * CSS-Eigenschaft `color-scheme`. Ohne diese Property wissen Browser NICHT,
 * dass die Seite ein eigenes Dark-Theme via CSS-Variablen implementiert —
 * sie rendern native Formularelemente (hier real vorhanden:
 * KaufkraftRechner.tsx <input type="number">, <select>; LikChart.tsx
 * <input type="checkbox"> x mehrere) weiterhin mit den UA-Light-Mode-
 * Standardfarben (weisser Hintergrund/schwarzer Text bei Chromium/WebKit
 * auf Mobile), selbst wenn `prefers-color-scheme: dark` aktiv ist und die
 * eigenen Tokens korrekt auf dunkel umschalten. Das Ergebnis ist ein
 * heller "Fremdkörper" (Dropdown-Pfeil-Bereich, Eingabefeld-Rahmen) mitten
 * im sonst konsistent dunklen Layout — sichtbar u.a. beim Startjahr-
 * <select> im Kaufkraft-Rechner auf mobilen Viewports.
 *
 * METHODE: ECHTER Browser-Test (Playwright, Chromium), analog zu
 * theme-colors-check.mjs — kein Vertrauen auf statische Code-Lektüre, da
 * genau diese Fehlerklasse (K1) zuvor bereits durch drei rein
 * code-lesende Reviews unentdeckt blieb. Prüft `getComputedStyle(html).
 * colorScheme` direkt im Browser, mit `colorScheme: "dark"` Context (
 * entspricht prefers-color-scheme: dark auf dem Endgerät).
 *
 * NEGATIVTEST: Vor dem Fix MUSS dieser Test fehlschlagen (colorScheme ===
 * "normal" statt "dark light" bzw. enthält "dark" nicht) — das ist der
 * Nachweis, dass der Test die Fehlerklasse tatsächlich erkennt, nicht nur
 * im Erfolgsfall grün meldet. Nach dem Fix (color-scheme: light dark in
 * tokens.css bzw. dediziert im Dark-Media-Query/[data-theme=dark]) MUSS er
 * bestehen.
 *
 * Aufruf:
 *   export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *   node verification/color-scheme-check.mjs
 * Voraussetzung: `npm run build && npm run start` (oder `npm run dev`) läuft
 * bereits auf TF_URL (Default http://localhost:3000).
 */
import { chromium } from 'playwright';

const URL = process.env.TF_URL || 'http://localhost:3000';

async function checkColorScheme(colorScheme, expectContains) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    colorScheme,
    viewport: { width: 390, height: 844 }, // Mobile-Viewport (iPhone-ähnlich)
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });

  const htmlColorScheme = await page.evaluate(
    () => getComputedStyle(document.documentElement).colorScheme
  );

  const pass = expectContains.every((token) => htmlColorScheme.includes(token));
  await browser.close();
  return { colorScheme, htmlColorScheme, pass };
}

async function main() {
  const results = [];

  // Test 1: System-Präferenz "dark" -> html muss "dark" im computed
  // color-scheme-Wert enthalten (z.B. "dark light" oder "dark").
  results.push({
    name: 'prefers-color-scheme: dark -> html color-scheme enthält "dark"',
    ...(await checkColorScheme('dark', ['dark'])),
  });

  // Test 2: System-Präferenz "light" -> html muss weiterhin "light"
  // unterstützen (kein Bruch des Light-Mode durch den Fix).
  results.push({
    name: 'prefers-color-scheme: light -> html color-scheme enthält "light"',
    ...(await checkColorScheme('light', ['light'])),
  });

  let allPass = true;
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    if (!r.pass) allPass = false;
    console.log(`[${status}] ${r.name} — computed: "${r.htmlColorScheme}"`);
  }

  if (!allPass) {
    console.error('\nFEHLGESCHLAGEN: color-scheme ist nicht korrekt gesetzt.');
    process.exit(1);
  }
  console.log('\nALLE TESTS BESTANDEN.');
}

main().catch((e) => {
  console.error('Test-Fehler:', e);
  process.exit(1);
});
