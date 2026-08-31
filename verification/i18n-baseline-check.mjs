// Vorher/Nachher-Vergleich (i18n-Refactoring US 4.x): extrahiert den
// sichtbaren Rechner-Ergebnisblock + Chart-Legende + lang-Attribut und
// schreibt sie als JSON. Vorher- und Nachher-Output muessen identisch sein.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/?betrag=1000&jahr=2015";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle" });

// Warten bis Rechner-Daten geladen sind (kein "Daten werden geladen…" mehr)
await page.waitForFunction(() => {
  const el = document.querySelector(".tf-rechner");
  return el && !el.textContent.includes("Daten werden geladen");
}, { timeout: 15000 });

const result = await page.evaluate(() => {
  const rechner = document.querySelector(".tf-rechner");
  const legend = document.querySelector(".tf-chart-container");
  return {
    lang: document.documentElement.getAttribute("lang"),
    rechnerText: rechner ? rechner.textContent : null,
    // Legend ist Canvas — nicht als Text extrahierbar. Stattdessen die
    // Preset-/Toolbar-Buttons und Status-Texte (DOM) pruefen.
    toolbarText: legend ? legend.textContent : null,
    chartTitle: document.title,
  };
});
console.log(JSON.stringify(result, null, 2));
await browser.close();
