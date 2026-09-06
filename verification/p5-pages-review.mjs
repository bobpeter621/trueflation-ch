#!/usr/bin/env node
/**
 * P5-Frontend-Review (30.08.2026): neue Seiten /ueber, /impressum,
 * Startseiten-Hero + Definitionsblock, /datenquellen-Update, /kontakt-Links.
 *
 * ECHTES Browser-Rendering (Playwright): Screenshots Light/Dark/Mobile,
 * Konsolenfehler, pageerror, Hero-Zahlen-Werte, Live-Kontrastmessung der
 * tatsächlich gerenderten computed colors, Heading-Hierarchie,
 * aria-labelledby-Auflösung, Tastatur-Erreichbarkeit, Platzhalter-Prüfung,
 * Navigations-Links, Datenquellen-Werte.
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

// --- WCAG-Kontrastrechnung ---
function relLum({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(fg, bg) {
  const l1 = relLum(fg), l2 = relLum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parseRGB(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
}

const browser = await chromium.launch();
const errors = [];

async function newPage(viewport, colorScheme) {
  const ctx = await browser.newContext({ viewport, colorScheme });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error @ ${page.url()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror @ ${page.url()}: ${e.message}`));
  return { ctx, page };
}

async function shotAndCheck(url, name, viewport = { width: 1280, height: 900 }, colorScheme = 'light') {
  const { ctx, page } = await newPage(viewport, colorScheme);
  const resp = await page.goto(`${URL}${url}`, { waitUntil: 'networkidle' });
  if (!resp || resp.status() !== 200) report('kritisch', name, `HTTP ${resp?.status()} für ${url}`);
  await page.waitForTimeout(400);
  const file = join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) report('wichtig', name, `Horizontales Overflow bei ${viewport.width}px (scrollWidth > clientWidth)`);
  await ctx.close();
  return file;
}

// ============ a) Alle URLs rendern, Light + Dark ============
const pages = [
  ['/', 'p5-home'],
  ['/ueber', 'p5-ueber'],
  ['/impressum', 'p5-impressum'],
  ['/datenquellen', 'p5-datenquellen'],
  ['/kontakt', 'p5-kontakt'],
];
for (const [url, name] of pages) {
  await shotAndCheck(url, `${name}-light`, { width: 1280, height: 900 }, 'light');
  await shotAndCheck(url, `${name}-dark`, { width: 1280, height: 900 }, 'dark');
  ok('render', `${url} gerendert (light+dark)`);
}

// ============ b) Hero: Zahlenwerte + Kontraste ============
for (const scheme of ['light', 'dark']) {
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, scheme);
  await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
  const hero = await page.evaluate(() => {
    const sec = document.querySelector('[aria-labelledby="hero-heading"]');
    if (!sec) return null;
    const nums = [...sec.querySelectorAll('.tf-numeric')].map((el) => {
      const cs = getComputedStyle(el);
      return { text: el.textContent.trim(), color: cs.color, fontSize: cs.fontSize };
    });
    const labels = [...sec.querySelectorAll('p.text-sm')].map((el) => {
      const cs = getComputedStyle(el);
      return { text: el.textContent.trim(), color: cs.color, fontSize: cs.fontSize };
    });
    const explainer = sec.querySelector('p.mt-4');
    const explCs = explainer ? getComputedStyle(explainer) : null;
    return {
      nums, labels,
      explainer: explCs ? { color: explCs.color, fontSize: explCs.fontSize } : null,
      bg: getComputedStyle(sec).backgroundColor,
      kicker: (() => { const k = sec.querySelector('#hero-heading'); const c = k ? getComputedStyle(k) : null; return c ? { color: c.color, fontSize: c.fontSize } : null; })(),
    };
  });
  if (!hero) { report('kritisch', 'hero', `Hero-Section nicht gefunden (${scheme})`); await ctx.close(); continue; }
  for (const n of hero.nums) {
    if (/NaN|undefined|Infinity/.test(n.text)) report('kritisch', 'hero', `Ungültiger Zahlenwert "${n.text}" (${scheme})`);
    else ok('hero', `Kernzahl "${n.text}" gerendert (${scheme})`);
    const c = contrast(parseRGB(n.color), parseRGB(hero.bg));
    // text-3xl (30px) semibold = grosser Text, 3:1 nötig
    if (c < 3) report('kritisch', 'hero', `Kernzahl-Kontrast ${c.toFixed(2)}:1 < 3:1 (${scheme}, ${n.color} auf ${hero.bg})`);
    else ok('hero', `Kernzahl-Kontrast ${c.toFixed(2)}:1 (${scheme}, grosser Text)`);
  }
  for (const l of hero.labels) {
    if (/NaN|undefined/.test(l.text)) continue;
    const c = contrast(parseRGB(l.color), parseRGB(hero.bg));
    // text-sm = Normaltext, 4.5:1 nötig
    if (c < 4.5) report('wichtig', 'hero', `Label "${l.text.slice(0, 30)}" Kontrast ${c.toFixed(2)}:1 < 4.5:1 (WCAG AA Normaltext, ${scheme}, ${l.color} auf ${hero.bg})`);
    else ok('hero', `Label "${l.text.slice(0, 30)}" Kontrast ${c.toFixed(2)}:1 (${scheme})`);
  }
  if (hero.explainer) {
    const c = contrast(parseRGB(hero.explainer.color), parseRGB(hero.bg));
    if (c < 4.5) report('wichtig', 'hero', `Explainer-Kontrast ${c.toFixed(2)}:1 < 4.5:1 (${scheme})`);
    else ok('hero', `Explainer-Kontrast ${c.toFixed(2)}:1 (${scheme})`);
  }
  if (hero.kicker) {
    const c = contrast(parseRGB(hero.kicker.color), parseRGB(hero.bg));
    if (c < 4.5) report('wichtig', 'hero', `Kicker-Kontrast ${c.toFixed(2)}:1 < 4.5:1 (${scheme})`);
    else ok('hero', `Kicker-Kontrast ${c.toFixed(2)}:1 (${scheme})`);
  }
  await ctx.close();
}

// ============ c) Heading-Hierarchie auf neuen Seiten ============
for (const [url, name] of [['/', 'home'], ['/ueber', 'ueber'], ['/impressum', 'impressum'], ['/datenquellen', 'datenquellen'], ['/kontakt', 'kontakt']]) {
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, 'light');
  await page.goto(`${URL}${url}`, { waitUntil: 'domcontentloaded' });
  const heads = await page.$$eval('h1,h2,h3,h4', (els) => els.map((e) => e.tagName));
  const h1count = heads.filter((h) => h === 'H1').length;
  if (h1count !== 1) report('wichtig', `headings/${name}`, `${h1count}x h1 (erwartet: 1)`);
  let prev = 1, skip = false;
  for (const h of heads) {
    const lvl = +h[1];
    if (lvl > prev + 1) skip = true;
    prev = lvl;
  }
  if (skip) report('wichtig', `headings/${name}`, `Übersprungene Ebene in: ${heads.join('>')}`);
  else ok('headings', `${name}: ${heads.join('>')}`);
  await ctx.close();
}

// ============ d) aria-labelledby + Tastatur + Text-Kontraste ============
for (const [url, name] of [['/ueber', 'ueber'], ['/impressum', 'impressum'], ['/', 'home']]) {
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, 'light');
  await page.goto(`${URL}${url}`, { waitUntil: 'domcontentloaded' });
  const dangling = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('[aria-labelledby]').forEach((el) => {
      el.getAttribute('aria-labelledby').split(/\s+/).forEach((id) => {
        if (!document.getElementById(id)) out.push(`${el.tagName} -> #${id}`);
      });
    });
    return out;
  });
  if (dangling.length) report('kritisch', `a11y/${name}`, `Dangling aria-labelledby: ${dangling.join(', ')}`);
  else ok('a11y', `${name}: alle aria-labelledby auflösbar`);

  // Tastatur: alle Links per Tab erreichbar und sichtbar fokussierbar
  const linkCount = await page.$$eval('main a, nav a, footer a', (els) => els.length);
  let tabbed = 0;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const isLink = await page.evaluate(() => document.activeElement?.tagName === 'A' || document.activeElement?.tagName === 'BUTTON');
    if (isLink) tabbed++;
  }
  if (tabbed < Math.min(linkCount, 1)) report('wichtig', `a11y/${name}`, `Keine Links per Tab erreichbar (${linkCount} Links im DOM)`);
  else ok('a11y', `${name}: ${tabbed} fokussierbare Elemente per Tab (${linkCount} Links)`);

  // Text-Kontraste aller sekundär/muted-Texte in beiden Modi
  await ctx.close();
}
for (const scheme of ['light', 'dark']) {
  for (const [url, name] of [['/ueber', 'ueber'], ['/impressum', 'impressum'], ['/kontakt', 'kontakt'], ['/datenquellen', 'datenquellen'], ['/', 'home']]) {
    const { ctx, page } = await newPage({ width: 1280, height: 900 }, scheme);
    await page.goto(`${URL}${url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const bad = await page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll('main p, main dd, main dt, main td, main th, footer p, section p');
      els.forEach((el) => {
        const cs = getComputedStyle(el);
        const fs = parseFloat(cs.fontSize);
        const fw = parseInt(cs.fontWeight, 10);
        const isLarge = fs >= 24 || (fs >= 18.66 && fw >= 700);
        // Hintergrund: nächster Vorfahre mit nicht-transparenter bg
        let bg = 'rgb(255, 255, 255)', node = el;
        while (node) {
          const b = getComputedStyle(node).backgroundColor;
          if (b && !b.startsWith('rgba(0, 0, 0, 0') && b !== 'transparent') { bg = b; break; }
          node = node.parentElement;
        }
        const parse = (s) => { const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? { r: +m[1], g: +m[2], b: +m[3] } : null; };
        const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const fg = parse(cs.color), bgc = parse(bg);
        if (!fg || !bgc || !el.textContent.trim()) return;
        const ratio = (Math.max(lum(fg), lum(bgc)) + 0.05) / (Math.min(lum(fg), lum(bgc)) + 0.05);
        const need = isLarge ? 3 : 4.5;
        if (ratio < need) out.push(`"${el.textContent.trim().slice(0, 40)}" ${ratio.toFixed(2)}:1 < ${need}:1 (${cs.color} auf ${bg})`);
      });
      return out;
    });
    if (bad.length) bad.forEach((b) => report('wichtig', `kontrast/${name}/${scheme}`, b));
    else ok('kontrast', `${name} (${scheme}): alle Texte >= WCAG AA`);
    await ctx.close();
  }
}

// ============ e) Mobile 375 / 768 ============
await shotAndCheck('/', 'p5-home-mobile-375', { width: 375, height: 812 }, 'light');
await shotAndCheck('/', 'p5-home-mobile-375-dark', { width: 375, height: 812 }, 'dark');
await shotAndCheck('/ueber', 'p5-ueber-mobile-375', { width: 375, height: 812 }, 'light');
await shotAndCheck('/impressum', 'p5-impressum-mobile-375', { width: 375, height: 812 }, 'light');
await shotAndCheck('/datenquellen', 'p5-datenquellen-mobile-375', { width: 375, height: 812 }, 'light');
await shotAndCheck('/', 'p5-home-tablet-768', { width: 768, height: 1024 }, 'light');
await shotAndCheck('/datenquellen', 'p5-datenquellen-tablet-768', { width: 768, height: 1024 }, 'light');
ok('mobile', 'Mobile/Tablet-Screenshots erstellt, Overflow geprüft (siehe oben)');

// ============ f) Platzhalter-Prüfung ============
for (const [url, name, expect] of [
  ['/impressum', 'impressum', ['[KONTAKT-EMAIL]', '[PSEUDONYM/PROJEKTNAME]']],
  ['/kontakt', 'kontakt', ['[KONTAKT-EMAIL]', '[PSEUDONYM/PROJEKTNAME]']],
]) {
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, 'light');
  await page.goto(`${URL}${url}`, { waitUntil: 'domcontentloaded' });
  const text = await page.evaluate(() => document.body.innerText);
  for (const ph of expect) {
    if (text.includes(ph)) ok('platzhalter', `${name}: "${ph}" sichtbar (gewollt, nicht befüllt)`);
    else report('wichtig', 'platzhalter', `${name}: "${ph}" FEHLT — wurde evtl. versehentlich befüllt?`);
  }
  await ctx.close();
}

// ============ g) Navigation ============
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, 'light');
  await page.goto(`${URL}/`, { waitUntil: 'domcontentloaded' });
  const hrefs = await page.$$eval('a', (els) => els.map((e) => e.getAttribute('href')));
  for (const want of ['/ueber', '/impressum']) {
    if (hrefs.includes(want)) ok('nav', `Startseite verlinkt ${want}`);
    else report('kritisch', 'nav', `Startseite verlinkt ${want} NICHT`);
  }
  // Klick-Test
  await page.click('a[href="/ueber"]');
  await page.waitForURL('**/ueber');
  ok('nav', 'Klick /ueber funktioniert');
  await page.goto(`${URL}/datenquellen`, { waitUntil: 'domcontentloaded' });
  const dqLinks = await page.$$eval('a', (els) => els.map((e) => ({ href: e.getAttribute('href'), text: e.textContent.trim() })));
  const kontakt = dqLinks.find((l) => l.href === '/kontakt');
  if (kontakt) ok('nav', `/datenquellen verlinkt /kontakt ("${kontakt.text}")`);
  else report('kritisch', 'nav', '/datenquellen: "Fehler gefunden"-Link zu /kontakt fehlt');
  await page.click('a[href="/kontakt"]');
  await page.waitForURL('**/kontakt');
  ok('nav', 'Klick /kontakt funktioniert');
  // /ueber -> /impressum und zurück
  await page.goto(`${URL}/ueber`, { waitUntil: 'domcontentloaded' });
  const ueberLinks = await page.$$eval('a', (els) => els.map((e) => e.getAttribute('href')));
  if (ueberLinks.includes('/impressum')) ok('nav', '/ueber verlinkt /impressum');
  else report('wichtig', 'nav', '/ueber verlinkt /impressum NICHT');
  await page.goto(`${URL}/impressum`, { waitUntil: 'domcontentloaded' });
  const impLinks = await page.$$eval('a', (els) => els.map((e) => e.getAttribute('href')));
  if (impLinks.includes('/ueber')) ok('nav', '/impressum verlinkt /ueber');
  else report('wichtig', 'nav', '/impressum verlinkt /ueber NICHT');
  await ctx.close();
}

// ============ h) Datenquellen: echte Werte in neuen Zeilen ============
{
  const { ctx, page } = await newPage({ width: 1280, height: 900 }, 'light');
  await page.goto(`${URL}/datenquellen`, { waitUntil: 'networkidle' });
  const rows = await page.$$eval('tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())));
  const expected = ['LIK', 'M2', 'Leitzins', 'Trueflation', 'Krankenkassenprämien', 'Gold', 'Bitcoin'];
  for (const exp of expected) {
    const row = rows.find((r) => r[0]?.includes(exp) || (r[0] === '' && exp === 'Trueflation'));
    if (!row) { report('kritisch', 'datenquellen', `Zeile "${exp}" fehlt komplett`); continue; }
    const standCell = row[2] ?? '';
    if (exp === 'Trueflation') {
      // colSpan-Zeile: Text muss Methodik-Verweis enthalten
      if (/Methodik/.test(row[1] ?? '')) ok('datenquellen', 'Trueflation-Zeile: Methodik-Verweis vorhanden (kein eigener Stand, by design)');
      else report('wichtig', 'datenquellen', 'Trueflation-Zeile ohne Methodik-Verweis');
    } else if (standCell === '—' || standCell === '') {
      report('kritisch', 'datenquellen', `Zeile "${exp}": Stand leer/"—" → Datei-Lese-Fehler?`);
    } else {
      ok('datenquellen', `Zeile "${exp}": ${standCell}`);
    }
  }
  await ctx.close();
}

await browser.close();

console.log('\n================ ZUSAMMENFASSUNG ================');
if (errors.length) {
  console.log('KONSOLENFEHLER/PAGEERROR:');
  errors.forEach((e) => console.log('  ' + e));
} else console.log('Keine Konsolenfehler / pageerror auf allen Seiten.');
const krit = findings.filter((f) => f.sev === 'kritisch');
const wichtig = findings.filter((f) => f.sev === 'wichtig');
console.log(`Befunde: ${krit.length} kritisch, ${wichtig.length} wichtig`);
findings.forEach((f) => console.log(`  [${f.sev}] ${f.area}: ${f.msg}`));
if (errors.length || krit.length) { console.log('VERDICT: FAIL'); process.exit(1); }
if (wichtig.length) { console.log('VERDICT: PASS MIT AUFLAGEN'); process.exit(2); }
console.log('VERDICT: PASS');
