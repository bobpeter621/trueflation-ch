#!/usr/bin/env node
/**
 * ECHTER Browser-Test (K1/W1-Fix-Verifikation, 30.08.2026): Chart.js-Linien
 * werden mit den tatsächlich aufgelösten Theme-Token-Farben gerendert —
 * in BEIDEN Modi (Light + Dark) — und NICHT mit ungültigen
 * "var(--...)"-Strings, die die Canvas-2D-API stillschweigend ignoriert
 * (Resultat: schwarze Linien).
 *
 * METHODIK: Pixelfarben des gerenderten Chart-Canvas werden direkt über die
 * öffentliche Canvas-API ausgelesen (getImageData — dieselbe API-Familie wie
 * toDataURL in rate-mode-check.mjs/png-export-check.mjs, kein interner Hook).
 * Für jede Kernlinie (LIK, Trueflation, M2) wird gezählt, wie viele Pixel im
 * Canvas dem erwarteten Token-Hexwert entsprechen (Toleranz für
 * Anti-Aliasing). Bei korrekter Umsetzung müssen tausende Pixel matchen
 * (2px durchgezogene Linien über ~1300px Breite + Legenden-Farbboxen).
 * Läge der alte Fehler vor (var()-String -> Canvas ignoriert -> schwarz),
 * gäbe es ~0 Matches.
 *
 * NEGATIVTEST (zweistufig):
 *  a) Mechanismus-Beweis: Auf einem frischen Offscreen-Canvas wird eine
 *     Linie mit strokeStyle="var(--color-line-lik, #4b5f7a)" gezeichnet —
 *     der Pixel wird als SCHWARZ nachgewiesen (Canvas ignoriert den
 *     ungültigen String, Default #000000 bleibt). Damit ist bewiesen: hätte
 *     der Chart noch var()-Strings, würde dieser Test fehlschlagen (0
 *     Farb-Matches), d.h. der Test schliesst die Fehlerklasse tatsächlich.
 *  b) Kontroll-Assertion: im Offscreen-Canvas aus (a) findet der
 *     Match-Algorithmus exakt 0 Pixel der erwarteten LIK-Farbe — der
 *     Algorithmus selbst meldet also im Fehlerfall FAIL, nicht PASS.
 *
 * SCREENSHOTS: Light- und Dark-Mode-Chart werden als PNG-Artefakte unter
 * verification/screenshots/ abgelegt (Pfade im Abschlussbericht).
 *
 * Aufruf: export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *         node verification/theme-colors-check.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.env.TF_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');

// Erwartete Token-Werte aus tokens.css (Light :root / Dark media query).
// WICHTIG: wenn tokens.css geändert wird, müssen diese Erwartungswerte
// mitgepflegt werden — der Test ist bewusst EXAKT (kein Abgleich gegen die
// zur Laufzeit gelesenen Werte), damit er Token-Regressionen erkennt.
const EXPECTED = {
  light: {
    lik: '#4b5f7a',
    trueflation: '#d1495b',
    money: '#2f9e6f',
  },
  dark: {
    lik: '#7d93b3',
    trueflation: '#ff6b7f',
    money: '#4fc491',
  },
};

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// Zählt im Page-Kontext die Pixel des Chart-Canvas, deren Farbe innerhalb
// der Toleranz zum Ziel-Hex liegt (Euklidische Distanz im RGB-Raum).
// Läuft im Browser, weil getImageData ein Same-Origin-Canvas braucht.
function countMatchingPixels([rgb, tolerance]) {
  const canvas = document.querySelector('.tf-chart-canvas-wrapper canvas');
  if (!canvas) return { error: 'canvas not found' };
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let matches = 0;
  let nearBlack = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] < 200) continue; // (nahezu) transparente Pixel ignorieren
    const dr = img[i] - rgb[0];
    const dg = img[i + 1] - rgb[1];
    const db = img[i + 2] - rgb[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) matches++;
    // "schwarze Linie"-Detektor: sehr dunkle, opake Pixel im Plot.
    // ACHTUNG: Achsen-/Legendentext ist ebenfalls dunkel — nearBlack ist
    // nur ein Indikator, keine harte Assertion (siehe Report-Ausgabe).
    if (img[i] < 30 && img[i + 1] < 30 && img[i + 2] < 30) nearBlack++;
  }
  return { matches, nearBlack, width: canvas.width, height: canvas.height };
}

const TOLERANCE = 45; // Anti-Aliasing an Linienrändern; Linienkern ist exakt
const MIN_MATCHES = 200; // 2px-Linie über >1000 Datenpunkte -> weit über 200 Kernpixel

let failures = 0;
function check(ok, passMsg, failMsg) {
  console.log(ok ? `[PASS] ${passMsg}` : `[FAIL] ${failMsg}`);
  if (!ok) failures++;
}

async function verifyMode(page, mode) {
  const expected = EXPECTED[mode];
  console.log(`\n=== Modus: ${mode.toUpperCase()} ===`);
  await page.emulateMedia({ colorScheme: mode });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tf-chart-canvas-wrapper canvas', { timeout: 15000 });
  await page.waitForTimeout(900); // Daten-Fetch + vollständiges Chart-Rendering abwarten

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const shotPath = join(SCREENSHOT_DIR, `chart-${mode}.png`);
  await page.locator('.tf-chart-container').screenshot({ path: shotPath });
  console.log(`Screenshot: ${shotPath}`);

  for (const [line, hex] of Object.entries(expected)) {
    const res = await page.evaluate(countMatchingPixels, [hexToRgb(hex), TOLERANCE]);
    if (res.error) {
      check(false, '', `Canvas nicht gefunden (${res.error}).`);
      continue;
    }
    console.log(
      `  Linie "${line}": erwartet ${hex} -> ${res.matches} passende Pixel ` +
      `(Canvas ${res.width}x${res.height}, dunkle Pixel gesamt: ${res.nearBlack})`
    );
    check(
      res.matches >= MIN_MATCHES,
      `${mode}: Linie "${line}" rendert in erwarteter Token-Farbe ${hex} (${res.matches} >= ${MIN_MATCHES} Pixel).`,
      `${mode}: Linie "${line}" rendert NICHT in ${hex} — nur ${res.matches} Pixel gefunden. Verdacht: var()-String oder falscher Token (Canvas ignoriert ungültige Farben -> schwarz).`
    );
  }

  // Live-Wechsel-Nachweis (nur Dark): die LIGHT-Farbwerte dürfen im Dark
  // Mode praktisch nicht mehr vorkommen — beweist, dass der Hook beim
  // Theme-Wechsel neu auflöst und chartData neu aufbaut (K2).
  // ENGERE Toleranz (20 statt 45): Achsen-/Tick-Grautöne liegen sonst
  // innerhalb von 45 um den hellen LIK-Ton und erzeugen False Positives;
  // die Kernpixel einer falsch gerenderten Linie sind exakt gefärbt und
  // werden auch mit 20 zuverlässig erkannt.
  if (mode === 'dark') {
    const staleRes = await page.evaluate(countMatchingPixels, [hexToRgb(EXPECTED.light.lik), 20]);
    check(
      staleRes.matches < MIN_MATCHES,
      `dark: Light-Mode-LIK-Farbe ${EXPECTED.light.lik} ist verschwunden (${staleRes.matches} Pixel < ${MIN_MATCHES}) — Theme-Live-Wechsel funktioniert.`,
      `dark: Light-Mode-LIK-Farbe ${EXPECTED.light.lik} noch mit ${staleRes.matches} Pixeln präsent — Farben werden beim Theme-Wechsel nicht aktualisiert (K2-Regression).`
    );
  }
}

async function negativeTest(page) {
  console.log('\n=== NEGATIVTEST: var()-String an Canvas -> schwarzer Pixel (Mechanismus-Beweis) ===');
  const res = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 50;
    const ctx = c.getContext('2d');
    // Exakt der alte, fehlerhafte Aufruf aus LikChart.tsx vor dem K1-Fix:
    ctx.strokeStyle = 'var(--color-line-lik, #4b5f7a)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 25);
    ctx.lineTo(200, 25);
    ctx.stroke();
    const px = ctx.getImageData(100, 25, 1, 1).data;
    // Kontrolle: derselbe Match-Algorithmus wie im Haupttest
    let matches = 0;
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 200) continue;
      const dr = img[i] - 0x4b, dg = img[i + 1] - 0x5f, db = img[i + 2] - 0x7a;
      if (Math.sqrt(dr * dr + dg * dg + db * db) <= 45) matches++;
    }
    return { r: px[0], g: px[1], b: px[2], a: px[3], likMatches: matches };
  });
  console.log(`  Pixel nach strokeStyle="var(--color-line-lik, #4b5f7a)": rgb(${res.r},${res.g},${res.b}), alpha=${res.a}; LIK-Farb-Matches im Test-Canvas: ${res.likMatches}`);
  check(
    res.r < 30 && res.g < 30 && res.b < 30,
    'NEGATIVTEST (a): Canvas ignoriert var()-String und zeichnet SCHWARZ — Fehlerklasse reproduziert.',
    `NEGATIVTEST (a) fehlgeschlagen: Pixel ist rgb(${res.r},${res.g},${res.b}), nicht schwarz — Browser verhält sich unerwartet, Testaussage hinterfragen.`
  );
  check(
    res.likMatches === 0,
    'NEGATIVTEST (b): Match-Algorithmus findet 0 LIK-Pixel im var()-Canvas — der Haupttest würde im Fehlerfall FAIL melden (nicht grün).',
    `NEGATIVTEST (b) fehlgeschlagen: ${res.likMatches} LIK-Matches trotz var()-String — Algorithmus zu großzügig.`
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Vor dem Negativtest initial navigieren — verifyMode nutzt page.reload(),
  // das auf about:blank wirkungslos bliebe.
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await negativeTest(page);
  await verifyMode(page, 'light');
  await verifyMode(page, 'dark');

  await browser.close();
  console.log(`\n=== Gesamtergebnis: ${failures === 0 ? 'PASS' : `FAIL (${failures} fehlgeschlagene Checks)`} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
