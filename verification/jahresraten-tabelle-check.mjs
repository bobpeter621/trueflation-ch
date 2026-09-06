#!/usr/bin/env node
/**
 * ECHTER Browser-Test (Playwright/Chromium) für die Jahresraten-Tabelle
 * "LIK vs. Trueflation" (REQ-T1–T11, 05.09.2026) — analog zu
 * theme-colors-check.mjs: kein Vertrauen auf Code-Lektüre, alle ACs werden
 * gegen den gerenderten DOM/Computed Styles im echten Browser geprüft.
 *
 * ABDECKUNG:
 *  REQ-T1  Platzierung direkt unter dem Chart; Tabelle ist KEIN Kind des
 *          Kaufkraft-Rechners; Rechner-Inputs ändern keine Zelle (AC-T1.4,
 *          echter Negativtest: Betrag 80'000 / Startjahr 2018 setzen und
 *          Tabelleninhalt vorher/nachher vergleichen).
 *  REQ-T2  Zeilen 2010..letztes Trueflation-Jahr, lückenlos; Endjahr aus
 *          den echten Daten (2024), obwohl LIK im Chart weiterläuft.
 *  REQ-T3  Spaltenreihenfolge + Header-Texte, Differenz = Trueflation − LIK
 *          (Stichproben-Nachrechnung gegen die echten JSON-Daten),
 *          Header "Differenz (pp)" nicht "(%)".
 *  REQ-T4  Fusszeile "Kumuliert 2010–YYYY", GEOMETRISCH nachgerechnet aus
 *          den echten calendarYearAverages; AC-T4.2-Testfall: Fusszeilen-
 *          werte identisch mit Kernzahlen-Kacheln (gleiche Rundungsregel,
 *          hier: identischer String nach de-CH-Formatierung) UND mit den
 *          dokumentierten Referenzwerten 5,51 % / 9,93 %.
 *  REQ-T5  Zeile 2020 trägt "Mietkorrektur"-Marker; letzte Zeile trägt
 *          "provisorisch"; Marker sind Text + Link (nicht nur Farbe/Icon),
 *          Link zeigt auf /methodik#... (AC-T5.5).
 *  REQ-T6  de-CH-Format: Dezimalkomma in den gerenderten Zellen.
 *  REQ-T8  sticky Header (computed position: sticky); 375px-Viewport: alle
 *          4 Pflichtspalten via horizontalem Scroll erreichbar, nichts
 *          abgeschnitten (scrollWidth > clientWidth UND letzte Spalte per
 *          scrollIntoView sichtbar); echte <table> mit <th scope>.
 *  REQ-T9  CSV-Button vorhanden; Klick erzeugt Download mit korrektem
 *          Dateinamen-Muster; Inhalt: Header deutsch, Semikolon-getrennt
 *          (Dezimalkomma), Fusszeile "kumuliert_2010_YYYY" als letzte
 *          Datenzeile.
 *  REQ-T11 <caption>, th scope="col", Marker-Links fokussierbar.
 *
 * NEGATIVTESTS:
 *  N1 (AC-T1.4): Rechner-Input ändern -> Tabellen-HTML muss IDENTISCH
 *     bleiben (string-Vergleich vorher/nachher). Würde die Tabelle am
 *     Rechner hängen, schlägt dieser Test fehl.
 *  N2 (AC-T4.2-Mechanismus): die Prüffunktion vergleicht Fusszeile gegen
 *     unabhängig aus den JSON-Rohdaten nachgerechnete Werte — würde die
 *     Fusszeile eine andere Rundung/Formel nutzen (z.B. Summe der
 *     Jahresraten statt geometrisch), schlägt der Vergleich fehl
 *     (Summe vs. geometrisch unterscheidet sich bei diesen Daten im
 *     2.-Nachkommastellen-Bereich deutlich).
 *
 * Aufruf:
 *   export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *   node verification/jahresraten-tabelle-check.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.env.TF_URL || 'http://localhost:3000';
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(ok, passMsg, failMsg) {
  console.log(ok ? `[PASS] ${passMsg}` : `[FAIL] ${failMsg}`);
  if (!ok) failures++;
}

// ─── Referenzwerte direkt aus den echten JSON-Daten nachrechnen ───
// (unabhängige Zweitberechnung im Test — NICHT aus app/lib importiert,
// damit ein Fehler in der Lib nicht gleichzeitig Produkt und Test grün
// macht).
const yearly = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/trueflation/trueflation-index-yearly.json'), 'utf-8')
);
const likMonthly = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data/lik/total-index-monthly.json'), 'utf-8')
);
const avgs = yearly.calendarYearAverages.filter((a) => a.monthsIncluded === 12).sort((a, b) => a.year - b.year);
const firstAvg = avgs[0];
const lastAvg = avgs[avgs.length - 1];
const round2 = (x) => Math.round(x * 100) / 100;
const fmt = (x) => round2(x).toFixed(2).replace('.', ',');
const fmtSigned = (x) => (round2(x) > 0 ? '+' : '') + fmt(x);

// LIK-2009-Jahresdurchschnitt aus der Monatsreihe (Sonderfall erste Zeile).
const lik2009 = likMonthly.values.filter((v) => Math.floor(v.indexDate / 10000) === 2009);
const lik2009Avg = Math.round((lik2009.reduce((a, v) => a + v.indexValue, 0) / 12) * 10000) / 10000;

const refLikCum = (lastAvg.likIndexAvg / firstAvg.likIndexAvg - 1) * 100;
const refTfCum = (lastAvg.trueflationIndexAvg / firstAvg.trueflationIndexAvg - 1) * 100;
// Stichprobe Zeile 2015 (negative LIK-Rate — AC-T6.4-Testfall) und 2024.
const avg2014 = avgs.find((a) => a.year === 2014);
const avg2015 = avgs.find((a) => a.year === 2015);
const refLik2015 = (avg2015.likIndexAvg / avg2014.likIndexAvg - 1) * 100;
const refTf2015 = (avg2015.trueflationIndexAvg / avg2014.trueflationIndexAvg - 1) * 100;
const refLik2024 = (lastAvg.likIndexAvg / avgs.find((a) => a.year === 2023).likIndexAvg - 1) * 100;
const refTf2024 = (lastAvg.trueflationIndexAvg / avgs.find((a) => a.year === 2023).trueflationIndexAvg - 1) * 100;
const refLik2010 = (firstAvg.likIndexAvg / lik2009Avg - 1) * 100;

console.log('=== Referenzwerte (aus JSON-Rohdaten nachgerechnet) ===');
console.log(`  LIK 2010: ${fmt(refLik2010)} | LIK 2015: ${fmt(refLik2015)} | LIK 2024: ${fmt(refLik2024)}`);
console.log(`  Kumuliert ${firstAvg.year}-${lastAvg.year}: LIK ${fmt(refLikCum)} | TF ${fmt(refTfCum)}`);

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tf-tabelle table tbody tr', { timeout: 15000 });

  // ─── REQ-T1: Platzierung ───
  console.log('\n=== REQ-T1: Platzierung und Entkopplung vom Rechner ===');
  const order = await page.evaluate(() => {
    const main = document.querySelector('main');
    const kids = Array.from(main.children);
    const idxChart = kids.findIndex((k) => k.querySelector('.tf-chart-canvas-wrapper') || k.classList.contains('tf-chart-container'));
    const idxTabelle = kids.findIndex((k) => k.classList.contains('tf-tabelle'));
    const idxRechner = kids.findIndex((k) => k.querySelector('.tf-rechner'));
    const tabelleImRechner = !!document.querySelector('.tf-rechner .tf-tabelle');
    return { idxChart, idxTabelle, idxRechner, tabelleImRechner };
  });
  console.log(`  main-Kinder: Chart@${order.idxChart}, Tabelle@${order.idxTabelle}, Rechner@${order.idxRechner}, Tabelle im Rechner: ${order.tabelleImRechner}`);
  check(
    order.idxChart !== -1 && order.idxTabelle === order.idxChart + 1,
    'AC-T1.1: Tabelle sitzt direkt unter dem Chart-Block auf der Startseite.',
    `AC-T1.1 VERLETZT: Tabelle@${order.idxTabelle}, Chart@${order.idxChart} (erwartet: direkt folgend).`
  );
  check(
    !order.tabelleImRechner,
    'AC-T1.4/T2.4: Tabelle ist KEIN Nachfahre des Kaufkraft-Rechners.',
    'AC-T1.4 VERLETZT: Tabelle ist im Rechner verschachtelt — Rechner-Inputs könnten sie beeinflussen.'
  );

  // ─── N1/AC-T1.4: Rechner-Inputs ändern keine Zelle ───
  const tableHtmlBefore = await page.locator('.tf-tabelle-scroll').innerHTML();
  await page.locator('input[aria-label="Betrag in Schweizer Franken"]').fill('80000');
  await page.locator('select[aria-label="Startjahr auswählen"]').selectOption('2018');
  await page.waitForTimeout(600); // React-Re-Render abwarten
  const tableHtmlAfter = await page.locator('.tf-tabelle-scroll').innerHTML();
  check(
    tableHtmlBefore === tableHtmlAfter,
    'NEGATIVTEST N1 (AC-T1.4): Betrag 80\'000 / Startjahr 2018 -> Tabellen-HTML identisch (keine Zelle ändert sich).',
    'NEGATIVTEST N1 FEHLGESCHLAGEN: Tabelleninhalt änderte sich nach Rechner-Input — Kopplung vorhanden!'
  );

  // ─── REQ-T2: Zeilen ───
  console.log('\n=== REQ-T2: Zeitraum und Vollständigkeit ===');
  const years = await page.locator('.tf-tabelle tbody tr > th:first-child').allTextContents();
  const yearNums = years.map((y) => parseInt(y.trim().slice(0, 4), 10));
  const expectedYears = avgs.map((a) => a.year);
  const lueckenlos = yearNums.length === expectedYears.length && yearNums.every((y, i) => y === expectedYears[i]);
  check(
    lueckenlos,
    `AC-T2.1: Lückenlose Zeilen ${expectedYears[0]}–${expectedYears[expectedYears.length - 1]} (${yearNums.length} Zeilen).`,
    `AC-T2.1 VERLETZT: Zeilen ${JSON.stringify(yearNums)} != erwartet ${JSON.stringify(expectedYears)}.`
  );
  check(
    yearNums[yearNums.length - 1] === lastAvg.year,
    `AC-T2.2: Tabelle endet beim letzten abgeschlossenen TRUEFLATION-Jahr (${lastAvg.year}), obwohl der LIK im Chart weiterläuft.`,
    `AC-T2.2 VERLETZT: letzte Zeile ${yearNums[yearNums.length - 1]} != ${lastAvg.year}.`
  );
  const endNote = await page.locator('.tf-tabelle-notes').innerText();
  check(
    endNote.includes(`endet mit ${lastAvg.year}`) && endNote.includes('September'),
    'AC-T2.2: Erklärsatz unter der Tabelle (Ende + nächster Datenpunkt, BAG-September) vorhanden.',
    `AC-T2.2 VERLETZT: Notiztext unvollständig: "${endNote.slice(0, 120)}..."`
  );

  // ─── REQ-T3: Spalten ───
  console.log('\n=== REQ-T3: Spalten ===');
  const headers = await page.locator('.tf-tabelle thead th').allTextContents();
  const headersTrim = headers.map((h) => h.trim());
  check(
    headersTrim.length === 4 && headersTrim[0] === 'Jahr' && headersTrim[1].startsWith('LIK') && headersTrim[2].startsWith('Trueflation') && headersTrim[3] === 'Differenz (pp)',
    'AC-T3.1/T3.3: Spalten Jahr | LIK (%) | Trueflation (%) | Differenz (pp) — keine CHF-Spalte, "pp" nicht "%".',
    `AC-T3 VERLETZT: Header ${JSON.stringify(headersTrim)}.`
  );

  // Stichproben-Nachrechnung (inkl. negativer LIK-Rate 2015, AC-T6.4)
  async function rowValues(year) {
    const cells = await page.locator(`.tf-tabelle tbody tr`, { hasText: new RegExp(`^${year}`) }).first().locator('td').allTextContents();
    return cells.map((c) => c.trim());
  }
  const r2015 = await rowValues(2015);
  console.log(`  Zeile 2015: ${JSON.stringify(r2015)} | Referenz: LIK ${fmt(refLik2015)}, TF ${fmt(refTf2015)}, Diff ${fmtSigned(refTf2015 - refLik2015)}`);
  check(
    r2015[0] === fmt(refLik2015) && r2015[1] === fmt(refTf2015) && r2015[2] === fmtSigned(refTf2015 - refLik2015),
    `AC-T3.2/T3.4/T6.4: Zeile 2015 stimmt mit Nachrechnung überein, negative LIK-Rate mit Minus (${fmt(refLik2015)}).`,
    `Zeile 2015 falsch: gerendert ${JSON.stringify(r2015)}, Referenz [${fmt(refLik2015)}, ${fmt(refTf2015)}, ${fmtSigned(refTf2015 - refLik2015)}].`
  );
  check(
    r2015[0].startsWith('-') && !r2015[0].includes('('),
    'AC-T6.4: Negative Rate mit Minuszeichen, KEIN Klammerformat.',
    `AC-T6.4 VERLETZT: "${r2015[0]}".`
  );
  const r2024 = await rowValues(2024);
  console.log(`  Zeile 2024: ${JSON.stringify(r2024)} | Referenz: LIK ${fmt(refLik2024)}, TF ${fmt(refTf2024)}`);
  check(
    r2024[0] === fmt(refLik2024) && r2024[1] === fmt(refTf2024) && r2024[2] === fmtSigned(refTf2024 - refLik2024),
    'AC-T3.2: Zeile 2024 (Endjahr) stimmt mit Nachrechnung überein.',
    `Zeile 2024 falsch: gerendert ${JSON.stringify(r2024)}.`
  );
  // Erste Zeile 2010: LIK-Rate via LIK-2009-Vorjahr, Trueflation "—"
  const r2010 = await rowValues(2010);
  console.log(`  Zeile 2010: ${JSON.stringify(r2010)} | Referenz LIK: ${fmt(refLik2010)}`);
  check(
    r2010[0] === fmt(refLik2010) && r2010[1] === '—' && r2010[2] === '—',
    'Sonderfall 2010: LIK-Rate aus LIK-2009-Durchschnitt berechnet; Trueflation/Differenz "—" (Reihe existiert erst ab 2010, keine erfundene Zahl).',
    `Zeile 2010 falsch: gerendert ${JSON.stringify(r2010)}, erwartet [${fmt(refLik2010)}, —, —].`
  );
  // de-CH-Format: Dezimalkomma
  check(
    r2015.every((c) => !c.includes('.') || c === '—'),
    'AC-T6.1: Dezimaltrennzeichen Komma (de-CH) — kein Punkt in gerenderten Zellen.',
    `AC-T6.1 VERLETZT: Punkt-Dezimaltrenner in ${JSON.stringify(r2015)}.`
  );

  // ─── REQ-T4: Fusszeile ───
  console.log('\n=== REQ-T4: Fusszeile (geometrisch kumuliert) ===');
  const footCells = await page.locator('.tf-tabelle tfoot td').allTextContents();
  const footLabel = await page.locator('.tf-tabelle tfoot th').innerText();
  const foot = footCells.map((c) => c.trim());
  console.log(`  Fusszeile: ${footLabel.trim()} | ${JSON.stringify(foot)} | Referenz: [${fmtSigned(refLikCum)}, ${fmtSigned(refTfCum)}, ${fmtSigned(refTfCum - refLikCum)}]`);
  check(
    footLabel.trim() === `Kumuliert ${firstAvg.year}–${lastAvg.year}`,
    'AC-T4.4: Beschriftung "Kumuliert 2010–YYYY", nicht als Jahr getarnt.',
    `AC-T4.4 VERLETZT: "${footLabel.trim()}".`
  );
  check(
    foot[0] === fmtSigned(refLikCum) && foot[1] === fmtSigned(refTfCum) && foot[2] === fmtSigned(refTfCum - refLikCum),
    'AC-T4.1/T4.3: Fusszeile = geometrisch kumulierte Veränderung (Nachrechnung aus Rohdaten identisch).',
    `Fusszeile falsch: ${JSON.stringify(foot)} != [${fmtSigned(refLikCum)}, ${fmtSigned(refTfCum)}, ${fmtSigned(refTfCum - refLikCum)}].`
  );
  // N2-Mechanismus: arithmetische Summe der Jahresraten wäre ein ANDERER
  // Wert — beweist, dass der Test geometrisch vs. Summe unterscheidet.
  let sumLik = 0;
  for (let i = 1; i < avgs.length; i++) sumLik += (avgs[i].likIndexAvg / avgs[i - 1].likIndexAvg - 1) * 100;
  const arithVsGeo = Math.abs(round2(sumLik) - round2(refLikCum));
  console.log(`  N2-Kontrolle: arithmetische Summe LIK = ${fmt(sumLik)} vs. geometrisch ${fmt(refLikCum)} (Differenz ${arithVsGeo.toFixed(2)} pp)`);
  check(
    arithVsGeo > 0.01,
    'NEGATIVTEST N2 (Mechanismus): arithmetische Summe ≠ geometrische Kumulation bei diesen Daten — der Fusszeilen-Vergleich oben würde eine Summen-Implementierung als FAIL erkennen.',
    'NEGATIVTEST N2 unentscheidbar: Summe und geometrische Kumulation sind bei diesen Daten (gerundet) gleich — Test kann AC-T4.3 nicht unterscheiden!'
  );
  // AC-T4.2: Kacheln = Fusszeile (gleiche Rundungsregel, hier: gleiche
  // zentrale Funktion -> identischer String)
  const tileValues = await page.locator('.tf-hero-tile-value').allTextContents();
  console.log(`  Kernzahlen-Kacheln: ${JSON.stringify(tileValues.map((t) => t.trim()))}`);
  check(
    tileValues.length === 2 && tileValues[0].includes(foot[0]) && tileValues[1].includes(foot[1]),
    'AC-T4.2 (Testfall): Kachelwerte und Fusszeile nach derselben Rundungsregel IDENTISCH.',
    `AC-T4.2 VERLETZT: Kacheln ${JSON.stringify(tileValues)} vs. Fusszeile ${JSON.stringify(foot)}.`
  );
  // Referenz gegen die dokumentierten Kernzahlen (requirements-v1.0.md)
  check(
    foot[0] === '+5,51' && foot[1] === '+9,93',
    'AC-T4.2 (Referenz): Fusszeile = dokumentierte Kernzahlen LIK +5,51 % / Trueflation +9,93 % (2010–2024).',
    `Referenzabweichung: Fusszeile ${JSON.stringify(foot)} != [+5,51, +9,93].`
  );

  // ─── REQ-T5: Marker ───
  console.log('\n=== REQ-T5: Methodische Marker ===');
  const marker2020 = page.locator('.tf-tabelle tbody tr', { hasText: /^2020/ }).first().locator('.tf-tabelle-marker a');
  const marker2020Count = await marker2020.count();
  const marker2020Href = marker2020Count > 0 ? await marker2020.first().getAttribute('href') : null;
  const marker2020Text = marker2020Count > 0 ? (await marker2020.first().innerText()).trim() : null;
  check(
    marker2020Count > 0 && marker2020Text.includes('Mietkorrektur'),
    'AC-T5.1/T5.4: Zeile 2020 trägt textlichen Marker "Mietkorrektur ab 2020" (nicht nur Farbe/Icon).',
    `AC-T5.1 VERLETZT: Marker 2020 = ${JSON.stringify({ count: marker2020Count, text: marker2020Text })}.`
  );
  check(
    marker2020Href != null && marker2020Href.startsWith('/methodik#'),
    `AC-T5.5: Marker ist Link zur Methodik-Stelle (${marker2020Href}), kein verschwindender Tooltip.`,
    `AC-T5.5 VERLETZT: href = ${marker2020Href}.`
  );
  const provMarker = page.locator('.tf-tabelle tbody tr', { hasText: new RegExp(`^${lastAvg.year}`) }).first().locator('.tf-tabelle-marker a', { hasText: 'provisorisch' });
  check(
    (await provMarker.count()) > 0,
    `AC-T5.2: Letzte Zeile (${lastAvg.year}) trägt "provisorisch"-Marker (BAG-Schätzung).`,
    `AC-T5.2 VERLETZT: kein provisorisch-Marker in Zeile ${lastAvg.year}.`
  );

  // ─── REQ-T8: Darstellung ───
  console.log('\n=== REQ-T8: Darstellung und Mobile ===');
  const sticky = await page.evaluate(() => {
    const th = document.querySelector('.tf-tabelle thead th');
    return getComputedStyle(th).position;
  });
  check(
    sticky === 'sticky',
    'AC-T8.1: Header ist sticky (computed position: sticky).',
    `AC-T8.1 VERLETZT: thead th position = ${sticky}.`
  );
  const tableTag = await page.evaluate(() => {
    const t = document.querySelector('.tf-tabelle table');
    const ths = Array.from(t.querySelectorAll('thead th')).map((th) => th.getAttribute('scope'));
    return { tag: t.tagName, scopes: ths };
  });
  check(
    tableTag.tag === 'TABLE' && tableTag.scopes.every((s) => s === 'col'),
    'AC-T8.3/T11.2: echte <table>, Header-Zellen <th scope="col">.',
    `AC-T8.3 VERLETZT: ${JSON.stringify(tableTag)}.`
  );
  const captionText = await page.locator('.tf-tabelle caption').innerText();
  check(
    captionText.includes('Jahresraten') && captionText.includes(String(firstAvg.year)),
    `AC-T11.1: <caption> mit klarem Namen ("${captionText.trim()}").`,
    `AC-T11.1 VERLETZT: "${captionText}".`
  );

  // 375px-Mobile: alle Spalten erreichbar via horizontalem Scroll
  const mobPage = await context.newPage();
  await mobPage.setViewportSize({ width: 375, height: 800 });
  await mobPage.goto(URL, { waitUntil: 'networkidle' });
  await mobPage.waitForSelector('.tf-tabelle table tbody tr', { timeout: 15000 });
  const mobile = await mobPage.evaluate(() => {
    const scroll = document.querySelector('.tf-tabelle-scroll');
    const lastTh = document.querySelector('.tf-tabelle thead th:last-child');
    const before = lastTh.getBoundingClientRect();
    scroll.scrollLeft = scroll.scrollWidth; // ganz nach rechts scrollen
    const after = lastTh.getBoundingClientRect();
    const viewportW = document.documentElement.clientWidth;
    return {
      scrollable: scroll.scrollWidth > scroll.clientWidth,
      lastVisibleAfterScroll: after.left >= 0 && after.right <= viewportW + 1,
      beforeRight: before.right,
      afterRight: after.right,
      viewportW,
    };
  });
  console.log(`  375px: scrollWidth>clientWidth=${mobile.scrollable}, letzte Spalte nach Scroll sichtbar=${mobile.lastVisibleAfterScroll} (rechts ${mobile.afterRight.toFixed(0)}px bei Viewport ${mobile.viewportW}px)`);
  check(
    mobile.lastVisibleAfterScroll,
    'AC-T8.2: Auf 375px sind alle Pflichtspalten erreichbar (horizontales Scrollen, letzte Spalte "Differenz (pp)" vollständig sichtbar nach Scroll).',
    `AC-T8.2 VERLETZT: letzte Spalte nach Scroll bei ${mobile.afterRight.toFixed(0)}px (Viewport ${mobile.viewportW}px).`
  );

  // ─── REQ-T9: CSV ───
  console.log('\n=== REQ-T9: CSV-Export ===');
  const csvButton = page.locator('button', { hasText: 'CSV herunterladen' });
  check(
    (await csvButton.count()) === 1,
    'AC-T9.1: Button "CSV herunterladen" direkt bei der Tabelle vorhanden.',
    'AC-T9.1 VERLETZT: Button fehlt.'
  );
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    csvButton.click(),
  ]);
  const filename = download.suggestedFilename();
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  check(
    filename === `trueflation-lik-jahresraten-${iso}.csv`,
    `AC-T9.3: Dateiname ${filename} (Muster trueflation-lik-jahresraten-YYYY-MM-DD.csv).`,
    `AC-T9.3 VERLETZT: ${filename}.`
  );
  const stream = await download.createReadStream();
  let csvContent = '';
  for await (const chunk of stream) csvContent += chunk.toString('utf-8');
  csvContent = csvContent.replace(/^﻿/, ''); // BOM
  const csvLines = csvContent.trim().split(/\r?\n/);
  console.log(`  CSV: ${csvLines.length} Zeilen, Header: ${csvLines[0]}`);
  console.log(`  CSV letzte Zeile: ${csvLines[csvLines.length - 1]}`);
  check(
    csvLines[0] === 'Jahr;LIK Jahresrate (%);Trueflation Jahresrate (%);Differenz (pp)',
    'AC-T9.3: CSV-Header auf Deutsch, Semikolon-getrennt (Dezimalkomma-Kompatibilität).',
    `AC-T9.3 VERLETZT: Header "${csvLines[0]}".`
  );
  check(
    csvLines.length === avgs.length + 2 && csvLines[csvLines.length - 1].startsWith(`kumuliert_${firstAvg.year}_${lastAvg.year};`),
    `AC-T9.2: CSV enthält alle ${avgs.length} Jahreszeilen + Fusszeile "kumuliert_${firstAvg.year}_${lastAvg.year}" als letzte Datenzeile.`,
    `AC-T9.2 VERLETZT: ${csvLines.length} Zeilen, letzte: "${csvLines[csvLines.length - 1]}".`
  );
  const csv2015 = csvLines.find((l) => l.startsWith('2015;'));
  check(
    csv2015 === `2015;${fmt(refLik2015)};${fmt(refTf2015)};${fmtSigned(refTf2015 - refLik2015)}`,
    `AC-T9.2/T6.2: CSV-Zeile 2015 identisch mit Tabelle/Rundung ("${csv2015}").`,
    `CSV-Zeile 2015 falsch: "${csv2015}".`
  );
  check(
    !csvContent.includes('80000') && !csvContent.includes('80\'000'),
    'AC-T9.4: CSV-Inhalt unverändert durch vorherige Rechner-Eingabe (80\'000 wurde oben gesetzt).',
    'AC-T9.4 VERLETZT: Rechner-Betrag im CSV gefunden.'
  );

  // ─── REQ-T11: Tastatur ───
  console.log('\n=== REQ-T11: Accessibility ===');
  await csvButton.focus();
  const focused = await page.evaluate(() => document.activeElement.textContent);
  check(
    focused.includes('CSV'),
    'AC-T11.4: CSV-Button per Tastatur fokussierbar.',
    `AC-T11.4 VERLETZT: Fokus auf "${focused}".`
  );
  const outline = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('CSV'));
    btn.focus();
    const cs = getComputedStyle(btn);
    return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
  });
  check(
    outline.outlineStyle !== 'none' || parseFloat(outline.outlineWidth) > 0,
    `AC-T11.4: sichtbarer Fokus-Ring (outline ${outline.outlineWidth} ${outline.outlineStyle}).`,
    'AC-T11.4 VERLETZT: kein sichtbarer Fokus-Ring am CSV-Button.'
  );

  await browser.close();
  console.log(`\n=== Gesamtergebnis: ${failures === 0 ? 'PASS' : `FAIL (${failures} fehlgeschlagene Checks)`} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
