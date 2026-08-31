#!/usr/bin/env node
/**
 * Re-Review (unabhängiger 2. Durchgang, 31.08.2026):
 * Bestätigt die zwei Fixes aus dem ersten Frontend-Review durch eigene
 * Browser-Testläufe (Playwright, echtes Rendering):
 *
 *  Fix 1: WCAG-AA-Kontrast im Hero (app/page.tsx) — Kicker, Stichtag-Note,
 *         officialLabel/trueflationLabel jetzt --color-text-secondary.
 *  Fix 2: Kein horizontales Overflow auf /datenquellen bei 375px
 *         (Tabelle in overflow-x-auto gewrappt).
 *
 * Prüfungen:
 *  1. Hero-Kontraste Dark + Light: computed colors -> WCAG-Formel, >= 4.5:1
 *  2. /datenquellen @375px: kein documentElement-Overflow + Screenshot
 *  3. Regression: grosse Kennzahlen behalten Linienfarben (>= 3:1 grosser Text)
 *  4. Konsolenfehler/pageerror auf / und /datenquellen (Light+Dark, Desktop+Mobile)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.env.TF_URL || 'http://localhost:3000';
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const findings = [];
const report = (sev, area, msg) => { findings.push({ sev, area, msg }); console.log(`[${sev}] ${area}: ${msg}`); };
const ok = (area, msg) => console.log(`[ok] ${area}: ${msg}`);

// --- WCAG: relative Luminanz + Kontrast ---
const lum = ({ r, g, b }) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (fg, bg) => (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
const parseRGB = (s) => { const m = s?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? { r: +m[1], g: +m[2], b: +m[3] } : null; };

const browser = await chromium.launch();
const errors = [];

async function newPage(viewport, colorScheme) {
  const ctx = await browser.newContext({ viewport, colorScheme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error @ ${page.url()} (${colorScheme}, ${viewport.width}px): ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()} (${colorScheme}, ${viewport.width}px): ${e.message}`));
  return { ctx, page };
}

// ============ 1) Hero-Kontraste: Dark + Light ============
for (const scheme of ['dark', 'light']) {
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, scheme);
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const data = await page.evaluate(() => {
    const sec = document.querySelector('[aria-labelledby="hero-heading"]');
    if (!sec) return null;
    const cs = (el) => el ? getComputedStyle(el) : null;
    const grab = (el) => el ? { text: el.textContent.trim(), color: cs(el).color, fontSize: cs(el).fontSize, fontWeight: cs(el).fontWeight } : null;
    // Kicker
    const kicker = sec.querySelector('#hero-heading');
    // Stichtag-Note: letztes p.mt-1.text-xs im Hero
    const notes = [...sec.querySelectorAll('p.mt-1.text-xs')];
    const note = notes[notes.length - 1];
    // Labels: p.text-sm direkt ueber den grossen Zahlen (die NICHT tf-numeric sind)
    const labels = [...sec.querySelectorAll('p.text-sm')].filter((p) => !p.classList.contains('tf-numeric'));
    // Grosse Zahlen
    const nums = [...sec.querySelectorAll('.tf-numeric')];
    // Hintergrund: naechster Vorfahre mit deckender bg (Hero-Section selbst hat --color-bg-elevated)
    let bg = null, node = kicker;
    while (node) {
      const b = getComputedStyle(node).backgroundColor;
      if (b && b !== 'transparent' && !/^rgba\(0,\s*0,\s*0,\s*0\)/.test(b)) { bg = b; break; }
      node = node.parentElement;
    }
    return {
      bg,
      kicker: grab(kicker),
      note: grab(note),
      labels: labels.map(grab),
      nums: nums.map((el) => ({ text: el.textContent.trim(), color: cs(el).color, fontSize: cs(el).fontSize })),
    };
  });

  if (!data) { report('kritisch', `hero/${scheme}`, 'Hero-Section nicht gefunden'); await ctx.close(); continue; }
  const bg = parseRGB(data.bg);
  console.log(`--- ${scheme.toUpperCase()}: Hero-Hintergrund = ${data.bg} ---`);

  const texts = [
    ['Kicker (#hero-heading)', data.kicker],
    ['Stichtag-Note', data.note],
    ...data.labels.map((l, i) => [`Label ${i + 1} "${l.text.slice(0, 30)}"`, l]),
  ];
  for (const [name, t] of texts) {
    if (!t) { report('kritisch', `hero/${scheme}`, `${name}: Element nicht gefunden`); continue; }
    const c = contrast(parseRGB(t.color), bg);
    if (c < 4.5) report('kritisch', `hero/${scheme}`, `${name}: Kontrast ${c.toFixed(2)}:1 < 4.5:1 (WCAG AA Normaltext) — ${t.color} auf ${data.bg}`);
    else ok(`hero/${scheme}`, `${name}: Kontrast ${c.toFixed(2)}:1 >= 4.5:1 (${t.color} auf ${data.bg})`);
  }

  // ============ 3) Regression: grosse Zahlen behalten Linienfarben ============
  const lineColors = await page.evaluate(() => {
    const rs = getComputedStyle(document.documentElement);
    return { lik: rs.getPropertyValue('--color-line-lik').trim(), tf: rs.getPropertyValue('--color-line-trueflation').trim() };
  });
  for (const [i, n] of data.nums.entries()) {
    const c = contrast(parseRGB(n.color), bg);
    const expected = i === 0 ? lineColors.lik : lineColors.tf;
    const rgb = parseRGB(n.color);
    // Farbvergleich: hex -> rgb
    const hexToRgb = (h) => { const m = h.replace('#', ''); return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) }; };
    const expRgb = expected.startsWith('#') ? hexToRgb(expected) : parseRGB(expected);
    const sameColor = rgb && expRgb && rgb.r === expRgb.r && rgb.g === expRgb.g && rgb.b === expRgb.b;
    if (!sameColor) report('wichtig', `hero/${scheme}`, `Grosse Zahl ${i + 1} "${n.text}" hat Farbe ${n.color}, erwartet Linienfarbe ${expected} — Farbkodierung verloren?`);
    else ok(`hero/${scheme}`, `Grosse Zahl "${n.text}" behaelt Linienfarbe ${expected}`);
    if (c < 3) report('kritisch', `hero/${scheme}`, `Grosse Zahl "${n.text}": Kontrast ${c.toFixed(2)}:1 < 3:1 (grosser Text) — ${n.color} auf ${data.bg}`);
    else ok(`hero/${scheme}`, `Grosse Zahl "${n.text}": Kontrast ${c.toFixed(2)}:1 >= 3:1 (grosser Text)`);
  }
  await page.screenshot({ path: join(SHOTS, `re-review-home-hero-${scheme}.png`), fullPage: true });
  await ctx.close();
}

// ============ 2) /datenquellen @375px: Overflow + Screenshot ============
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await newPage({ width: 375, height: 812 }, scheme);
  await page.goto(`${URL}/datenquellen`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    tableWrapped: !!document.querySelector('div.overflow-x-auto > table'),
    tableScrollable: (() => { const d = document.querySelector('div.overflow-x-auto'); return d ? { scrollW: d.scrollWidth, clientW: d.clientWidth } : null; })(),
  }));
  if (m.scrollW > m.clientW + 1) report('kritisch', `datenquellen/${scheme}/375`, `Horizontales Seiten-Overflow: scrollWidth ${m.scrollW} > clientWidth ${m.clientW}`);
  else ok(`datenquellen/${scheme}/375`, `Kein Seiten-Overflow (scrollWidth ${m.scrollW} <= clientWidth ${m.clientW})`);
  if (!m.tableWrapped) report('kritisch', `datenquellen/${scheme}/375`, 'Tabelle NICHT in div.overflow-x-auto gewrappt');
  else ok(`datenquellen/${scheme}/375`, `Tabelle in overflow-x-auto gewrappt (Container scrollW ${m.tableScrollable?.scrollW} > clientW ${m.tableScrollable?.clientW} -> intern scrollbar)`);
  await page.screenshot({ path: join(SHOTS, `re-review-datenquellen-mobile-375-${scheme}.png`), fullPage: true });
  await ctx.close();
}

// ============ 4) Konsolenfehler/pageerror: beide Seiten, Light+Dark, Desktop+Mobile ============
for (const [url, name] of [['/', 'home'], ['/datenquellen', 'datenquellen']]) {
  for (const scheme of ['light', 'dark']) {
    for (const vp of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
      const { ctx, page } = await newPage(vp, scheme);
      await page.goto(`${URL}${url}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      await ctx.close();
    }
  }
}
ok('console', 'Alle Kombinationen geladen (Fehler siehe Zusammenfassung)');

await browser.close();

console.log('\n================ RE-REVIEW ZUSAMMENFASSUNG ================');
if (errors.length) { console.log('KONSOLENFEHLER/PAGEERROR:'); errors.forEach((e) => console.log('  ' + e)); }
else console.log('Keine Konsolenfehler / pageerror auf / und /datenquellen (Light+Dark, Desktop+Mobile).');
const krit = findings.filter((f) => f.sev === 'kritisch');
const wichtig = findings.filter((f) => f.sev === 'wichtig');
console.log(`Befunde: ${krit.length} kritisch, ${wichtig.length} wichtig`);
findings.forEach((f) => console.log(`  [${f.sev}] ${f.area}: ${f.msg}`));
if (errors.length || krit.length) { console.log('VERDICT: FAIL'); process.exit(1); }
if (wichtig.length) { console.log('VERDICT: PASS MIT AUFLAGEN'); process.exit(2); }
console.log('VERDICT: PASS');
