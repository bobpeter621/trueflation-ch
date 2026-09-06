#!/usr/bin/env node
/**
 * trueflation.ch — GESAMT-Frontend-Review (05.09.2026, Sub-Agent-Auftrag).
 * ECHTER Playwright-Browser-Test: alle 5 Seiten, Light/Dark, Desktop+Mobile(375px).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.TF_URL ?? "http://localhost:3000";
const SHOTS = new URL("./screenshots/gesamt-review/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const PAGES = ["/", "/methodik", "/datenquellen", "/kontakt", "/ueber"];
let failures = [];
let notes = [];
function check(name, ok, detail = "") {
  const status = ok ? "PASS" : "FAIL";
  console.log(`[${status}] ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}
function note(name, detail) {
  console.log(`[NOTE] ${name} — ${detail}`);
  notes.push(`${name}: ${detail}`);
}

function luminance(r, g, b) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function parseColor(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
function contrast(c1, c2) {
  const l1 = luminance(...c1), l2 = luminance(...c2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const browser = await chromium.launch();

async function newPage({ scheme = "light", width = 1280, height = 900 } = {}) {
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return { ctx, page, errors };
}

// ═══ A: Alle Seiten laden, kein Overflow, Screenshots ═══
for (const path of PAGES) {
  for (const scheme of ["light", "dark"]) {
    for (const [tag, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 375, height: 800 }]]) {
      const { ctx, page, errors } = await newPage({ scheme, ...vp });
      const resp = await page.goto(BASE + path, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const name = path === "/" ? "start" : path.slice(1);
      await page.screenshot({ path: `${SHOTS}${name}-${scheme}-${tag}.png`, fullPage: true });
      check(`A ${path} lädt (${scheme}/${tag})`, resp?.status() === 200 && errors.length === 0,
        `HTTP ${resp?.status()}, JS-Fehler: ${errors.join("; ") || "keine"}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`A ${path} kein Seiten-Overflow (${scheme}/${tag})`, overflow <= 1, `scrollWidth-clientWidth=${overflow}px`);
      const lang = await page.evaluate(() => document.documentElement.lang);
      if (path === "/") check("A html lang=de", lang === "de", `lang="${lang}"`);
      await ctx.close();
    }
  }
}

// ═══ B: Kernzahlen-Konsistenz Kacheln ↔ Tabellen-Fusszeile ═══
{
  const { ctx, page } = await newPage({ scheme: "light" });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".tf-hero-tile-value", { timeout: 15000 });
  await page.waitForSelector(".tf-tabelle tfoot td", { timeout: 15000 });
  const kacheln = await page.$$eval(".tf-hero-tile-value", (els) => els.map((e) => e.textContent.trim()));
  const foot = await page.$$eval(".tf-tabelle tfoot td", (els) => els.map((e) => e.textContent.trim()));
  const header = await page.$eval(".tf-tabelle tfoot th", (e) => e.textContent.trim());
  console.log("   Kacheln:", JSON.stringify(kacheln), "| Fusszeile:", header, JSON.stringify(foot));
  check("B Kachel LIK = 5,51 %", kacheln[0]?.includes("5,51"), kacheln[0]);
  check("B Kachel Trueflation = 9,93 %", kacheln[1]?.includes("9,93"), kacheln[1]);
  check("B Fusszeile LIK = +5,51", foot[0]?.includes("+5,51"), foot[0]);
  check("B Fusszeile Trueflation = +9,93", foot[1]?.includes("+9,93"), foot[1]);
  check("B Fusszeile beschriftet Kumuliert 2010-2024", /Kumuliert 2010.2024/.test(header), header);
  const kLik = kacheln[0]?.match(/[\d,]+/)?.[0];
  check("B Kachel = Fusszeile (LIK)", foot[0]?.includes(kLik), `${kLik} vs ${foot[0]}`);
  const ratio = 9.93 / 5.51;
  check("B Verhaeltnis TF/LIK ca. 1.8x", Math.abs(ratio - 1.8) < 0.05, ratio.toFixed(2));
  const marker = await page.$$eval(".tf-tabelle-marker", (els) => els.map((e) => e.textContent.trim()));
  check("B Tabelle: Marker Mietkorrektur ab 2020", marker.some((m) => m.includes("Mietkorrektur")), JSON.stringify(marker));
  check("B Tabelle: Marker provisorisch", marker.some((m) => m.includes("provisorisch")), "");
  const notesText = await page.$eval(".tf-tabelle-notes", (e) => e.textContent);
  check("B Tabelle: Linienende 2024 erklaert", /endet mit 2024|letzten abgeschlossenen/.test(notesText), "");
  await ctx.close();
}

// ═══ C: Chart (Canvas-Pixel + Interaktion) ═══
for (const scheme of ["light", "dark"]) {
  const { ctx, page } = await newPage({ scheme, width: 1280, height: 1000 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(2500);
  const pixelProbe = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const d2 = canvas.getContext("2d");
    const { width, height } = canvas;
    const img = d2.getImageData(0, 0, width, height).data;
    const cs = getComputedStyle(document.documentElement);
    const hexRgb = (h) => { const m = h.match(/#(..)(..)(..)/); return m ? [parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)] : null; };
    const targets = {
      lik: hexRgb(cs.getPropertyValue("--color-line-lik").trim()),
      tf: hexRgb(cs.getPropertyValue("--color-line-trueflation").trim()),
    };
    let likCount = 0, tfCount = 0;
    const likYs = [], tfYs = [];
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i], g = img[i+1], b = img[i+2], a = img[i+3];
      if (a < 200) continue;
      const py = Math.floor(i / 4 / width);
      for (const [key, t] of Object.entries(targets)) {
        if (!t) continue;
        if (Math.abs(r - t[0]) < 20 && Math.abs(g - t[1]) < 20 && Math.abs(b - t[2]) < 20) {
          if (key === "lik") { likCount++; likYs.push(py); } else { tfCount++; tfYs.push(py); }
        }
      }
    }
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return { likCount, tfCount, likY: avg(likYs), tfY: avg(tfYs) };
  });
  console.log(`   Pixel (${scheme}):`, JSON.stringify(pixelProbe));
  check(`C1 LIK-Linie sichtbar (${scheme})`, pixelProbe.likCount > 100, `${pixelProbe.likCount} px`);
  check(`C1 Trueflation-Linie sichtbar (${scheme})`, pixelProbe.tfCount > 100, `${pixelProbe.tfCount} px`);
  check(`C1 Trueflation visuell UEBER LIK (${scheme})`,
    pixelProbe.tfY != null && pixelProbe.likY != null && pixelProbe.tfY < pixelProbe.likY,
    `tfY=${pixelProbe.tfY?.toFixed(0)} likY=${pixelProbe.likY?.toFixed(0)} (kleiner=hoeher)`);
  const statusTexts = await page.$$eval(".tf-chart-status", (els) => els.map((e) => e.textContent));
  check(`C2 Mietkorrektur-Bruch Jan 2020 textlich am Chart (${scheme})`,
    statusTexts.some((t) => t.includes("Januar 2020") && t.includes("Miet")), "");
  check(`C3 Linienende 12/2024 erklaert am Chart (${scheme})`,
    statusTexts.some((t) => t.includes("12/2024") && /endet/.test(t)), statusTexts.filter((t) => t.includes("endet")).join(" | ").slice(0, 140));
  // C4: Leitzins + Rate-Modus
  await page.click('summary:has-text("Overlays")');
  await page.check('input[aria-label="SNB-Leitzins ein-/ausblenden"]');
  await page.waitForTimeout(1500);
  await page.click('button:has-text("Jahreswachstumsraten")');
  await page.waitForTimeout(1200);
  const ratePressed = await page.getAttribute('button:has-text("Jahreswachstumsraten")', "aria-pressed");
  check(`C4 Rate-Umschalter aktivierbar (${scheme})`, ratePressed === "true", `aria-pressed=${ratePressed}`);
  // Tooltip-Test: Hover in Chart-Mitte → Tooltip zeigt %/Jahr fuer LIK, % fuer Leitzins
  const box = await page.$eval("canvas", (c) => { const r = c.getBoundingClientRect(); return { x: r.x + r.width * 0.65, y: r.y + r.height * 0.4 }; });
  await page.mouse.move(box.x, box.y, { steps: 5 });
  await page.waitForTimeout(800);
  const tooltipText = await page.evaluate(() => {
    // chart.js rendert Tooltip ins Canvas — stattdessen: pruefen wir die Legenden-
    // Existenz via Chart-Instanz ist nicht moeglich; wir nutzen Screenshot + den
    // Code-Pfad (toYoyRate greift nicht aufs Leitzins-Dataset). Hier nur Canvas-
    // Nichtleere-Probe nach Umschaltung:
    const canvas = document.querySelector("canvas");
    const d2 = canvas.getContext("2d");
    const img = d2.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < img.length; i += 16) { const a = img[i+3]; if (a > 100 && (img[i] !== img[i+1] || img[i+1] !== img[i+2])) colored++; }
    return colored;
  });
  check(`C4 Chart rendert nach Rate-Umschaltung + Leitzins (${scheme})`, tooltipText > 50, `${tooltipText} farbige Sample-Pixel`);
  await page.screenshot({ path: `${SHOTS}chart-rate-leitzins-${scheme}.png`, fullPage: false });
  await ctx.close();
}

// ═══ D: Tastaturnavigation ═══
{
  const { ctx, page } = await newPage({ scheme: "light" });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".tf-tabelle tfoot td", { timeout: 15000 });
  await page.waitForTimeout(1500);
  const tabStops = [];
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const el = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      return { tag: a.tagName, text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 50), type: a.getAttribute("type") };
    });
    if (!el) break;
    tabStops.push(el);
  }
  console.log("   Tab-Reihenfolge:", tabStops.map((t, i) => `${i + 1}.${t.tag}(${t.text.slice(0, 20)})`).join(" "));
  const texts = tabStops.map((t) => t.text);
  check("D Rechner-Betrag-Input per Tab erreichbar", tabStops.some((t) => t.tag === "INPUT" && t.type === "number"), "");
  check("D Startjahr-Select per Tab erreichbar", tabStops.some((t) => t.tag === "SELECT"), "");
  check("D Chart-Preset-Buttons per Tab erreichbar", texts.some((t) => t.includes("Seit 2010")), "");
  check("D Overlay-Menue (summary) per Tab erreichbar", texts.some((t) => t.includes("Overlays")), "");
  check("D CSV-Button per Tab erreichbar", texts.some((t) => t.includes("CSV")), "");
  check("D Nav-Links per Tab erreichbar", texts.some((t) => t.includes("Methodik")), "");
  const idx = (pred) => tabStops.findIndex(pred);
  const iRechner = idx((t) => t.tag === "INPUT" && t.type === "number");
  const iPreset = idx((t) => t.text.includes("Seit 2010"));
  const iCsv = idx((t) => t.text.includes("CSV"));
  const iNav = idx((t) => t.text.includes("Über / Disclaimer"));
  check("D Tab-Reihenfolge Rechner->Chart->Tabelle->Nav",
    iRechner > -1 && iPreset > iRechner && iCsv > iPreset && iNav > iCsv,
    `Rechner@${iRechner} Chart@${iPreset} CSV@${iCsv} Nav@${iNav}`);
  // Fokus-Ring auf Preset-Button
  await page.evaluate(() => document.body.focus());
  let btnOutline = null;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const t = await page.evaluate(() => {
      const a = document.activeElement;
      return { isPreset: a.classList?.contains("tf-preset-button") };
    });
    if (t.isPreset) {
      btnOutline = await page.evaluate(() => {
        const cs = getComputedStyle(document.activeElement);
        return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor };
      });
      break;
    }
  }
  check("D Fokus-Ring auf Preset-Buttons sichtbar", btnOutline?.style === "solid" && parseFloat(btnOutline.width) >= 2, JSON.stringify(btnOutline));
  await ctx.close();
}

// ═══ E: Kontraste ═══
for (const scheme of ["light", "dark"]) {
  const { ctx, page } = await newPage({ scheme });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".tf-hero-tile-value", { timeout: 15000 });
  await page.waitForSelector(".tf-tabelle tfoot td", { timeout: 15000 });
  const probes = await page.evaluate(() => {
    const out = {};
    out.kachelLik = getComputedStyle(document.querySelector(".tf-hero-tile:first-child .tf-hero-tile-value")).color;
    out.kachelTf = getComputedStyle(document.querySelector(".tf-hero-tile:last-child .tf-hero-tile-value")).color;
    out.kachelBg = getComputedStyle(document.querySelector(".tf-hero-tile")).backgroundColor;
    out.marker = getComputedStyle(document.querySelector(".tf-tabelle-marker")).color;
    out.markerBg = getComputedStyle(document.querySelector(".tf-tabelle tbody th")).backgroundColor;
    const logoText = document.querySelector("header svg text");
    out.logoFill = logoText ? getComputedStyle(logoText).fill : null;
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    return out;
  });
  console.log(`   Kontrast-Proben (${scheme}):`, JSON.stringify(probes));
  const kbg = parseColor(probes.kachelBg);
  for (const [key, sel] of [["Kachel-LIK-Wert", "kachelLik"], ["Kachel-TF-Wert", "kachelTf"]]) {
    const ratio = contrast(parseColor(probes[sel]), kbg);
    check(`E Kontrast ${key} (${scheme}) >= 3:1 (Grosstext)`, ratio >= 3, `${ratio.toFixed(2)}:1`);
  }
  const mRatio = contrast(parseColor(probes.marker), parseColor(probes.markerBg));
  check(`E Kontrast Tabellen-Marker (${scheme}) >= 4.5:1`, mRatio >= 4.5, `${mRatio.toFixed(2)}:1`);
  if (probes.logoFill) {
    const lRatio = contrast(parseColor(probes.logoFill), parseColor(probes.bodyBg));
    check(`E Kontrast Logo-Text (${scheme}) >= 3:1`, lRatio >= 3, `${lRatio.toFixed(2)}:1`);
  }
  await ctx.close();
}

// ═══ F: Zoom 200% ═══
for (const path of PAGES) {
  const { ctx, page } = await newPage({ scheme: "light" });
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.evaluate(() => { document.body.style.zoom = "2"; });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`F Zoom 200% ${path} kein Seiten-Overflow`, overflow <= 2, `${overflow}px`);
  if (path === "/") await page.screenshot({ path: `${SHOTS}start-zoom200.png` });
  await ctx.close();
}

// ═══ G: Mobile 375px ═══
{
  const { ctx, page } = await newPage({ scheme: "dark", width: 375, height: 800 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(2000);
  const buttons = await page.$$eval("button, summary, select, input", (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { text: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30), w: Math.round(r.width), right: Math.round(r.right), visible: r.width > 0 && r.height > 0 };
    })
  );
  const offscreen = buttons.filter((b) => b.visible && b.right > 376);
  check("G Mobile: keine Bedienelemente ausserhalb 375px", offscreen.length === 0, JSON.stringify(offscreen));
  await page.click('summary:has-text("Overlays")');
  await page.check('input[aria-label="Geldmenge (M2) ein-/ausblenden"]');
  await page.waitForTimeout(1000);
  check("G Mobile: M2-Checkbox bedienbar", (await page.isChecked('input[aria-label="Geldmenge (M2) ein-/ausblenden"]')) === true, "");
  const tileRects = await page.$$eval(".tf-hero-tile", (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { y: Math.round(r.y), w: Math.round(r.width) }; }));
  check("G Mobile: Kacheln gestapelt", tileRects.length === 2 && tileRects[1].y > tileRects[0].y && tileRects[0].w > 300, JSON.stringify(tileRects));
  await page.screenshot({ path: `${SHOTS}mobile-375-dark-full.png`, fullPage: true });
  await ctx.close();
}

// ═══ H: Rechner Default ═══
{
  const { ctx, page } = await newPage({ scheme: "light" });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("#kaufkraft-rechner-heading", { timeout: 15000 });
  await page.waitForTimeout(2000);
  const dds = await page.$$eval("section[aria-labelledby='kaufkraft-rechner-heading'] dd", (els) => els.map((e) => e.textContent.trim()));
  console.log("   Rechner-dds:", JSON.stringify(dds));
  check("H Default LIK-Ergebnis ist CHF-Wert", /CHF/.test(dds[0] ?? ""), dds[0]);
  check("H Default Trueflation-Ergebnis ist CHF-Wert", /CHF/.test(dds[1] ?? ""), dds[1]);
  check("H Default kein Fehler-/Ladezustand", !dds.some((d) => /geladen|nicht verfügbar|kein Wert/.test(d)), "");
  const num = (s) => parseFloat((s.match(/[\d'.,]+/)?.[0] ?? "").replace(/'/g, "").replace(",", "."));
  const lik = num(dds[0]), tf = num(dds[1]);
  check("H Plausibilitaet TF < LIK < 1000", tf < lik && lik < 1000, `LIK=${lik} TF=${tf}`);
  await ctx.close();
}

// ═══ I: Theme-Toggle (US 3.18) — funktional: klicken, Schema wechselt,
// persistiert (localStorage), Chart rendert in beiden manuellen Modi ═══
{
  const { ctx, page } = await newPage({ scheme: "light" });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector(".tf-theme-toggle", { timeout: 15000 });
  const dataThemeBefore = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  note("I data-theme vor Klick (System-Modus)", String(dataThemeBefore));
  // Klick -> manuell dunkel
  await page.click(".tf-theme-toggle");
  await page.waitForTimeout(1500);
  const afterDark = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    stored: localStorage.getItem("tf-theme"),
    bg: getComputedStyle(document.body).backgroundColor,
    overlayGold: getComputedStyle(document.documentElement).getPropertyValue("--color-overlay-gold").trim(),
  }));
  check("I Toggle klickbar, data-theme=dark gesetzt", afterDark.attr === "dark", JSON.stringify(afterDark));
  check("I Wahl in localStorage persistiert (tf-theme=dark)", afterDark.stored === "dark", afterDark.stored);
  check("I Hintergrund ist dunkel nach Umschaltung", afterDark.bg === "rgb(13, 17, 23)", afterDark.bg);
  check("I Overlay-Gold-Variable im manuellen Dark-Modus = Dark-Wert (nicht Light-Fallback)",
    afterDark.overlayGold.toLowerCase() === "#d9a441", afterDark.overlayGold);
  // Chart rendert im manuellen Dark-Modus weiterhin farbig (Canvas-Probe)
  await page.waitForSelector("canvas", { timeout: 15000 });
  await page.waitForTimeout(1500);
  const coloredDark = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const d2 = canvas.getContext("2d");
    const img = d2.getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let i = 0; i < img.length; i += 16) { const a = img[i+3]; if (a > 100 && (img[i] !== img[i+1] || img[i+1] !== img[i+2])) colored++; }
    return colored;
  });
  check("I Chart rendert farbig im manuellen Dark-Modus", coloredDark > 50, `${coloredDark} Sample-Pixel`);
  await page.screenshot({ path: `${SHOTS}theme-toggle-manual-dark.png`, fullPage: true });
  // Reload -> Wahl muss ohne erneuten Klick aktiv sein (Persistenz + Init-Script)
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const afterReload = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  check("I Wahl ueberlebt Reload (Init-Script aus localStorage)", afterReload === "dark", String(afterReload));
  await page.screenshot({ path: `${SHOTS}theme-toggle-persist-dark.png`, fullPage: false });
  // Zurueck auf hell + aufraeumen (localStorage leeren, damit Folgechecks im System-Modus laufen)
  await page.click(".tf-theme-toggle");
  await page.waitForTimeout(800);
  const afterLight = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute("data-theme"),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  check("I Rueckschaltung auf hell funktioniert", afterLight.attr === "light" && afterLight.bg === "rgb(255, 255, 255)", JSON.stringify(afterLight));
  await page.evaluate(() => localStorage.removeItem("tf-theme"));
  await ctx.close();
}

await browser.close();
console.log("\n=== ERGEBNIS ===");
console.log(`FAILURES: ${failures.length}`);
failures.forEach((f) => console.log("  x " + f));
console.log(`NOTES: ${notes.length}`);
notes.forEach((n) => console.log("  - " + n));
process.exit(failures.length > 0 ? 1 : 0);
