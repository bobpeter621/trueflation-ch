#!/usr/bin/env node
/**
 * Frontend-Review /methodik (30.08.2026, interne Pflichtregel):
 * ECHTER Browser-Test der neu ausformulierten Methodik-Seite inkl. neuer
 * Komponente MietkorrekturMiniChart.tsx.
 *
 * Prüft:
 *  a) Fehlerfreies Rendering (Konsolenfehler/pageerror mitgeschnitten)
 *  b) Mini-Chart rendert sichtbar, Linien in erwarteten Token-Farben
 *     (Pixelprüfung Light UND Dark, Live-Theme-Wechsel analog theme-colors-check.mjs)
 *  c) Überschriften-Hierarchie, WCAG-Kontraste (selbst nachgerechnet),
 *     Links tastaturerreichbar, data-testid vorhanden
 *  d) Mobile 375px/768px: Formel-Box-Overflow-Prüfung
 *  e) Inhaltliche Konsistenz: 0.253 / 0.0608 / 0.024 konsistent, keine Verwechslung
 *
 * Aufruf: export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *         node verification/methodik-check.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = (process.env.TF_URL || 'http://localhost:3000') + '/methodik';
const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Erwartete Token-Werte aus tokens.css (Light :root / Dark media query).
const EXPECTED = {
  light: { lik: '#4b5f7a', trueflation: '#d1495b' },
  dark: { lik: '#7d93b3', trueflation: '#ff6b7f' },
};

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// WCAG-Kontrastrechnung (relativ luminance, WCAG 2.x)
function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(hexA, hexB) {
  const [l1, l2] = [luminance(hexToRgb(hexA)), luminance(hexToRgb(hexB))];
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
const warnings = [];
function check(ok, passMsg, failMsg) {
  console.log(ok ? `[PASS] ${passMsg}` : `[FAIL] ${failMsg}`);
  if (!ok) failures++;
}
function warn(msg) {
  console.log(`[WARN] ${msg}`);
  warnings.push(msg);
}

async function collectPage(browser, viewport, colorScheme) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  await page.emulateMedia({ colorScheme });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="mietkorrektur-mini-chart"] canvas', { timeout: 15000 });
  await page.waitForTimeout(700);
  return { page, consoleErrors };
}

// Pixelzählung im Mini-Chart-Canvas (analog theme-colors-check.mjs)
function countMatchingPixels([rgb, tolerance]) {
  const canvas = document.querySelector('[data-testid="mietkorrektur-mini-chart"] canvas');
  if (!canvas) return { error: 'mini-chart canvas not found' };
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let matches = 0;
  let nearBlack = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] < 200) continue;
    const dr = img[i] - rgb[0], dg = img[i + 1] - rgb[1], db = img[i + 2] - rgb[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) matches++;
    if (img[i] < 30 && img[i + 1] < 30 && img[i + 2] < 30) nearBlack++;
  }
  return { matches, nearBlack, width: canvas.width, height: canvas.height };
}

const TOLERANCE = 45;
const MIN_MATCHES = 30; // Mini-Chart: nur 5 Punkte pro Linie, ~750px breit -> weniger Pixel als Hauptchart

async function main() {
  const browser = await chromium.launch();

  // ---------- a) + b) Light + Dark: Rendering, Fehler, Pixel, Screenshots ----------
  for (const mode of ['light', 'dark']) {
    console.log(`\n=== Modus: ${mode.toUpperCase()} (Desktop 1280x900) ===`);
    const { page, consoleErrors } = await collectPage(browser, { width: 1280, height: 900 }, mode);

    await page.screenshot({ path: join(SCREENSHOT_DIR, `methodik-${mode}.png`), fullPage: true });
    await page.locator('[data-testid="mietkorrektur-mini-chart"]').screenshot({
      path: join(SCREENSHOT_DIR, `methodik-minichart-closeup-${mode}.png`),
    });
    console.log(`Screenshots: methodik-${mode}.png, methodik-minichart-closeup-${mode}.png`);

    check(
      consoleErrors.length === 0,
      `${mode}: keine Konsolen-/Pagefehler.`,
      `${mode}: ${consoleErrors.length} Konsolenfehler: ${consoleErrors.join(' | ')}`
    );

    for (const [line, hex] of Object.entries(EXPECTED[mode])) {
      const res = await page.evaluate(countMatchingPixels, [hexToRgb(hex), TOLERANCE]);
      if (res.error) { check(false, '', `${mode}: ${res.error}`); continue; }
      console.log(`  Linie "${line}": erwartet ${hex} -> ${res.matches} Pixel (Canvas ${res.width}x${res.height}, dunkle Pixel: ${res.nearBlack})`);
      check(
        res.matches >= MIN_MATCHES,
        `${mode}: Mini-Chart-Linie "${line}" rendert in Token-Farbe ${hex} (${res.matches} >= ${MIN_MATCHES} Pixel).`,
        `${mode}: Mini-Chart-Linie "${line}" rendert NICHT in ${hex} — nur ${res.matches} Pixel (var()-String-Verdacht).`
      );
    }

    // Dark: Light-Farben müssen verschwunden sein (Live-Theme-Wechsel)
    if (mode === 'dark') {
      const stale = await page.evaluate(countMatchingPixels, [hexToRgb(EXPECTED.light.trueflation), 20]);
      check(
        stale.matches < MIN_MATCHES,
        `dark: Light-Trueflation-Farbe verschwunden (${stale.matches} Pixel) — Theme-Wechsel greift im Mini-Chart.`,
        `dark: Light-Trueflation-Farbe ${EXPECTED.light.trueflation} noch ${stale.matches}x präsent — useThemeColors reagiert nicht.`
      );
    }

    // Manueller Theme-Toggle-Klick (falls Button sichtbar) — Dark -> Light -> Dark
    const toggle = page.locator('.tf-theme-toggle');
    if (await toggle.count() > 0) {
      await toggle.click();
      await page.waitForTimeout(500);
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      // Nach dem Klick muss der Modus GEWECHSELT haben; die Pixel muessen in
      // der Farbe des NEUEN Modus rendern.
      const newMode = mode === 'light' ? 'dark' : 'light';
      const res = await page.evaluate(countMatchingPixels, [hexToRgb(EXPECTED[newMode].trueflation), TOLERANCE]);
      check(
        theme === newMode && res.matches >= MIN_MATCHES,
        `${mode}: manueller Toggle-Klick -> data-theme="${theme}", Mini-Chart folgt (${res.matches} Pixel ${newMode}-Trueflation).`,
        `${mode}: manueller Toggle-Klick -> data-theme="${theme}", Mini-Chart-Pixel: ${res.matches} (erwartet >= ${MIN_MATCHES} in ${newMode}-Farbe).`
      );
      await toggle.click(); // zurückschalten
      await page.waitForTimeout(400);
    } else {
      warn(`${mode}: kein .tf-theme-toggle-Button auf der Seite gefunden — manueller Toggle nicht prüfbar.`);
    }

    await page.close();
  }

  // ---------- c) Accessibility-Checks (Light-Page) ----------
  console.log('\n=== ACCESSIBILITY ===');
  {
    const { page } = await collectPage(browser, { width: 1280, height: 900 }, 'light');

    // Überschriften-Hierarchie
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().slice(0, 60) }))
    );
    console.log('  Überschriften:', headings.map((h) => `h${h.level}`).join(' '));
    let hierarchyOk = headings.length > 0 && headings[0].level === 1;
    let prev = 0;
    for (const h of headings) {
      if (h.level > prev + 1) hierarchyOk = false;
      prev = h.level;
    }
    const h1Count = headings.filter((h) => h.level === 1).length;
    check(hierarchyOk && h1Count === 1,
      `Überschriften-Hierarchie korrekt (1x h1, keine übersprungenen Ebenen).`,
      `Überschriften-Hierarchie kaputt: h1-Anzahl=${h1Count}, Sequenz=${headings.map((h) => 'h' + h.level).join(',')}`);

    // WCAG-Kontraste — statisch nachgerechnet gegen tokens.css-Werte
    const pairs = [
      // [Vordergrund, Hintergrund, Min, Label]
      ['#14181f', '#ffffff', 4.5, 'light: text-primary/bg'],
      ['#4b5563', '#ffffff', 4.5, 'light: text-secondary/bg'],
      ['#6b7280', '#ffffff', 4.5, 'light: text-muted/bg'],
      ['#e8eaed', '#0d1117', 4.5, 'dark: text-primary/bg'],
      ['#a8b0bb', '#0d1117', 4.5, 'dark: text-secondary/bg'],
      ['#7d8590', '#0d1117', 4.5, 'dark: text-muted/bg'],
    ];
    for (const [fg, bg, min, label] of pairs) {
      const c = contrast(fg, bg);
      console.log(`  Kontrast ${label}: ${c.toFixed(2)}:1 (Min ${min}:1)`);
      check(c >= min, `WCAG ${label} = ${c.toFixed(2)}:1 >= ${min}:1.`, `WCAG ${label} = ${c.toFixed(2)}:1 < ${min}:1.`);
    }

    // Laufzeit-Kontrast: tatsächlich gerenderte Textfarben gegen tatsächlichen Hintergrund
    const liveContrast = await page.evaluate(() => {
      const sel = (s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { color: cs.color, bg: getComputedStyle(document.body).backgroundColor };
      };
      return { footer: sel('footer p'), body: sel('main p') };
    });
    console.log('  Laufzeit-Farben (Light):', JSON.stringify(liveContrast));

    // Links: erkennbar + tastaturerreichbar
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('main a')].map((a) => ({
        href: a.getAttribute('href'), text: a.textContent.trim(),
        underline: getComputedStyle(a).textDecorationLine,
        color: getComputedStyle(a).color,
      }))
    );
    console.log('  Links:', JSON.stringify(links));
    check(
      links.length >= 2 && links.every((l) => l.underline.includes('underline')),
      `Links (${links.map((l) => l.href).join(', ')}) vorhanden und unterstrichen.`,
      `Links fehlen oder nicht als solche erkennbar: ${JSON.stringify(links)}`
    );
    // Tastatur-Erreichbarkeit: Tab durch die Seite bis ein Link fokussiert ist
    await page.evaluate(() => document.body.focus());
    let focusedHref = null;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      focusedHref = await page.evaluate(() => {
        const el = document.activeElement;
        return el && el.tagName === 'A' ? el.getAttribute('href') : null;
      });
      if (focusedHref) break;
    }
    check(!!focusedHref, `Link per Tastatur erreichbar (Tab -> ${focusedHref}).`, 'Kein Link per Tab erreichbar.');

    // data-testid im DOM
    const testid = await page.locator('[data-testid="mietkorrektur-mini-chart"]').count();
    check(testid === 1, 'data-testid="mietkorrektur-mini-chart" im DOM vorhanden.', `data-testid fehlt (count=${testid}).`);

    // Formel-Box: Hintergrund-Token muss zu einer echten Farbe aufloesen
    // (Regression: var(--color-surface-secondary) war undefiniert ->
    // background-color invalid -> transparent, Box ohne Hintergrund).
    const formulaBg = await page.evaluate(() => {
      const el = document.querySelector('main .font-mono');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, overflowX: cs.overflowX };
    });
    console.log('  Formel-Box computed:', JSON.stringify(formulaBg));
    check(
      !!formulaBg && formulaBg.bg !== 'rgba(0, 0, 0, 0)' && formulaBg.bg !== 'transparent',
      `Formel-Box hat sichtbaren Hintergrund (${formulaBg && formulaBg.bg}).`,
      `Formel-Box-Hintergrund transparent/undefiniert (${JSON.stringify(formulaBg)}) — var()-Token-Verdacht.`
    );
    check(
      !!formulaBg && formulaBg.overflowX === 'auto',
      'Formel-Box scrollt intern horizontal (overflow-x: auto) statt mitten in Ausdrücken umzubrechen.',
      `Formel-Box overflow-x = ${formulaBg && formulaBg.overflowX} (erwartet auto).`
    );

    // ---------- e) Inhaltliche Konsistenz ----------
    const bodyText = await page.evaluate(() => document.querySelector('main').innerText);
    const checks = [
      ['0,253', true], ['0,0608', true], ['0,024', true],
      ['23,96', true], ['9,3', true],
    ];
    for (const [needle, expected] of checks) {
      check(bodyText.includes(needle) === expected,
        `Fliesstext enthält "${needle}".`, `Fliesstext: "${needle}" fehlt unerwartet.`);
    }
    // Verwechslungs-Check: die integrierte Variante muss als INTEGRIERT markiert sein,
    // die volle Variante NICHT als integrierte bezeichnet werden.
    // Negations-sensitiv: "0,253 ... nicht die integrierte Variante" ist
    // KORREKT (Abgrenzung), keine Verwechslung. Es gilt nur als Befund, wenn
    // die volle Variante OHNE Negation als integriert bezeichnet wird.
    const wrongClaims = [
      /0,253(?![^.]{0,120}nicht)[^.]{0,120}(integriert|Hauptlinie)/i,
      /volle[^.]{0,80}Variante(?![^.]{0,80}nicht)[^.]{0,80}integriert/i,
    ];
    for (const re of wrongClaims) {
      const m = bodyText.match(re);
      check(!m, 'Keine Verwechslung volle/integrierte Variante im Fliesstext.',
        `VERWECHSLUNG im Fliesstext: "${m && m[0]}"`);
    }
    // Mini-Chart-Beschriftung muss die volle Variante als solche kennzeichnen
    check(
      /volle Neubezug-Variante \(\+0,253/.test(bodyText) && /nicht die\s+im Hauptchart integrierte Bevölkerungsanteil-Variante/.test(bodyText.replace(/\s+/g, ' ')),
      'Mini-Chart-Caption benennt volle Variante (+0,253) und grenzt von integrierter Variante ab.',
      'Mini-Chart-Caption fehlt oder grenzt die Varianten nicht korrekt ab.'
    );
    // Legenden-Labels des Mini-Charts
    const legend = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="mietkorrektur-mini-chart"] canvas');
      return c ? 'canvas vorhanden' : 'canvas fehlt';
    });
    console.log('  Mini-Chart:', legend);

    await page.close();
  }

  // ---------- d) Mobile ----------
  for (const width of [375, 768]) {
    console.log(`\n=== MOBILE ${width}px ===`);
    const { page, consoleErrors } = await collectPage(browser, { width, height: 800 }, 'light');
    await page.screenshot({ path: join(SCREENSHOT_DIR, `methodik-mobile-${width}.png`), fullPage: true });
    check(consoleErrors.length === 0, `mobile ${width}: keine Konsolenfehler.`,
      `mobile ${width}: Konsolenfehler: ${consoleErrors.join(' | ')}`);

    // Horizontales Scrollen nötig?
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      // Formel-Box: das font-mono-Element
      const formula = document.querySelector('main .font-mono');
      const fr = formula ? formula.getBoundingClientRect() : null;
      return {
        docScrollW: doc.scrollWidth, clientW: doc.clientWidth,
        formulaScrollW: formula ? formula.scrollWidth : null,
        formulaClientW: formula ? formula.clientWidth : null,
        formulaRight: fr ? fr.right : null,
      };
    });
    console.log('  Overflow-Messung:', JSON.stringify(overflow));
    check(
      overflow.docScrollW <= overflow.clientW + 1,
      `mobile ${width}: kein horizontales Seiten-Overflow (scrollWidth ${overflow.docScrollW} <= clientWidth ${overflow.clientW}).`,
      `mobile ${width}: HORIZONTALER OVERFLOW — scrollWidth ${overflow.docScrollW} > clientWidth ${overflow.clientW} (Formel-Box läuft vermutlich über).`
    );
    if (overflow.formulaScrollW > overflow.formulaClientW + 1) {
      warn(`mobile ${width}: Formel-Box scrollt intern (scrollWidth ${overflow.formulaScrollW} > clientWidth ${overflow.formulaClientW}) — Zeilen umbrechen nicht; prüfe Screenshot methodik-mobile-${width}.png.`);
    }
    await page.close();
  }

  await browser.close();
  console.log(`\n=== Gesamtergebnis: ${failures === 0 ? 'PASS' : `FAIL (${failures} Checks)`} | Warnungen: ${warnings.length} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error('FEHLER:', err); process.exit(1); });
