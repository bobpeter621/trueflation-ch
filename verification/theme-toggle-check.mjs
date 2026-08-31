#!/usr/bin/env node
/**
 * ECHTER Browser-Test für US 3.18 (manueller Hell/Dunkel-Umschalter),
 * 30.08.2026. Ergänzt theme-colors-check.mjs (der nur prefers-color-scheme
 * via page.emulateMedia prüft) um den MANUELLEN Pfad:
 *
 *   1) TOGGLE-KLICK ändert die gerenderten Chart-Farben nachweislich
 *      (Pixelvergleich VOR/NACH Klick, in BEIDE Richtungen hell->dunkel und
 *      dunkel->hell). Der useThemeColors-Hook muss auf den manuellen
 *      data-theme-Wechsel via MutationObserver reagieren (K2).
 *   2) PERSISTENZ: nach Toggle-Klick + Seiten-Reload bleibt die manuelle
 *      Wahl erhalten (data-theme-Attribut + gerenderte Farben), obwohl die
 *      emulierte Systempräferenz dem widerspricht.
 *   3) FOUC: das data-theme-Attribut und die berechnete Hintergrundfarbe
 *      stehen bereits bei domcontentloaded (VOR erstem Paint/Hydration)
 *      korrekt — Nachweis, dass das Inline-Script im <head> synchron greift.
 *   4) SYSTEM-DEFAULT: ohne gespeicherte Wahl folgt die Seite
 *      prefers-color-scheme (KEIN data-theme-Attribut gesetzt).
 *   5) MANUELL SCHLÄGT SYSTEM: gespeicherte Wahl "light" gewinnt gegen
 *      emuliertes prefers-color-scheme: dark.
 *   6) BARRIEREFREIHEIT: Button per Tastatur (Enter) bedienbar, aria-label
 *      vorhanden und zustandsabhängig, aria-pressed spiegelt den Zustand.
 *
 * NEGATIVTEST: simuliert den fehlerhaften Toggle (schreibt NUR localStorage,
 * setzt KEIN data-theme-Attribut — genau der Zustand vor diesem Fix, wo es
 * keinen Toggle gab / wo das Setzen fehlschlägt) und beweist, dass der
 * Haupttest in diesem Fall FAIL melden würde (dunkle Pixel < MIN).
 *
 * SCREENSHOTS: Toggle-Button in beiden Zuständen + Chart nach manuellem
 * Wechsel unter verification/screenshots/.
 *
 * Aufruf: export LD_LIBRARY_PATH=$HOME/.local/browser-libs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
 *         node verification/theme-toggle-check.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.env.TF_URL || 'http://localhost:3000';
const SCREENSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'screenshots');

// Erwartete Token-Werte aus tokens.css (müssen bei Token-Änderungen
// mitgepflegt werden, bewusst EXAKT wie in theme-colors-check.mjs).
const EXPECTED = {
  light: { lik: '#4b5f7a', trueflation: '#d1495b' },
  dark: { lik: '#7d93b3', trueflation: '#ff6b7f' },
};

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

// Wie in theme-colors-check.mjs: zählt Canvas-Pixel innerhalb der
// RGB-Toleranz zum Ziel-Hex (läuft im Page-Kontext, getImageData).
function countMatchingPixels([rgb, tolerance]) {
  const canvas = document.querySelector('.tf-chart-canvas-wrapper canvas');
  if (!canvas) return { error: 'canvas not found' };
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let matches = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] < 200) continue;
    const dr = img[i] - rgb[0];
    const dg = img[i + 1] - rgb[1];
    const db = img[i + 2] - rgb[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) matches++;
  }
  return { matches };
}

const TOLERANCE = 45;
const TOLERANCE_TIGHT = 20; // für "alte Farbe verschwunden"-Checks (siehe theme-colors-check)
const MIN_MATCHES = 200;

let failures = 0;
function check(ok, passMsg, failMsg) {
  console.log(ok ? `[PASS] ${passMsg}` : `[FAIL] ${failMsg}`);
  if (!ok) failures++;
}

async function waitForChart(page) {
  await page.waitForSelector('.tf-chart-canvas-wrapper canvas', { timeout: 15000 });
  await page.waitForTimeout(900); // Daten-Fetch + vollständiges Rendering
}

async function expectLineColor(page, mode, line, contextMsg) {
  const hex = EXPECTED[mode][line];
  const res = await page.evaluate(countMatchingPixels, [hexToRgb(hex), TOLERANCE]);
  if (res.error) {
    check(false, '', `${contextMsg}: Canvas nicht gefunden (${res.error}).`);
    return;
  }
  console.log(`  ${contextMsg}: Linie "${line}" erwartet ${hex} -> ${res.matches} Pixel`);
  check(
    res.matches >= MIN_MATCHES,
    `${contextMsg}: "${line}" rendert in ${hex} (${res.matches} >= ${MIN_MATCHES}).`,
    `${contextMsg}: "${line}" rendert NICHT in ${hex} — nur ${res.matches} Pixel. Theme-Wechsel greift nicht (MutationObserver/K2-Regression?).`
  );
}

async function expectStaleColorGone(page, staleMode, line, contextMsg) {
  const hex = EXPECTED[staleMode][line];
  const res = await page.evaluate(countMatchingPixels, [hexToRgb(hex), TOLERANCE_TIGHT]);
  check(
    !res.error && res.matches < MIN_MATCHES,
    `${contextMsg}: vorherige ${staleMode}-Farbe ${hex} ist verschwunden (${res.error ? 'canvas error' : res.matches + ' Pixel'} < ${MIN_MATCHES}).`,
    `${contextMsg}: vorherige ${staleMode}-Farbe ${hex} noch mit ${res.matches} Pixeln präsent — Chart wurde beim Toggle nicht neu eingefärbt.`
  );
}

const getThemeAttr = (page) => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
const getStored = (page) => page.evaluate(() => localStorage.getItem('tf-theme'));
const toggleButton = (page) => page.getByRole('button', { name: /modus/i });

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // ─── Kontext A: System HELL, aber gespeicherte Wahl DUNKEL ─────────────
  // (addInitScript simuliert den wiederkehrenden Besucher: localStorage ist
  // gesetzt, BEVOR irgendein Seiten-Script läuft — so wie beim echten Reload.)
  console.log('\n=== Kontext A: System=hell, gespeicherte Wahl=dunkel (Wiederkehrer) ===');
  const ctxA = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: 'light' });
  const pageA = await ctxA.newPage();
  await pageA.addInitScript(() => localStorage.setItem('tf-theme', 'dark'));

  // FOUC-Nachweis: Attribut + berechnete Hintergrundfarbe MÜSSEN bereits bei
  // domcontentloaded korrekt stehen (vor erstem Paint/Hydration), obwohl die
  // Systempräferenz hell ist.
  await pageA.goto(URL, { waitUntil: 'domcontentloaded' });
  const fouc = await pageA.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  console.log(`  Bei domcontentloaded: data-theme=${fouc.attr}, body background=${fouc.bg}`);
  check(
    fouc.attr === 'dark' && fouc.bg === 'rgb(13, 17, 23)', // #0d1117
    `FOUC: data-theme="dark" und dunkler Hintergrund (#0d1117) stehen bereits bei domcontentloaded — kein Flackern möglich.`,
    `FOUC-RISIKO: bei domcontentloaded ist data-theme=${fouc.attr}, background=${fouc.bg} (erwartet dark / rgb(13, 17, 23)) — Inline-Script greift zu spät oder gar nicht.`
  );
  await pageA.screenshot({ path: join(SCREENSHOT_DIR, 'toggle-fouc-first-paint.png') });

  // Persistenz: dunkel rendern OHNE Klick, trotz System=hell (manuell schlägt System)
  await waitForChart(pageA);
  await expectLineColor(pageA, 'dark', 'lik', 'A/persistenz');
  await expectLineColor(pageA, 'dark', 'trueflation', 'A/persistenz');
  await expectStaleColorGone(pageA, 'light', 'lik', 'A/persistenz');
  check(
    (await getStored(pageA)) === 'dark',
    'A/persistenz: localStorage "tf-theme" ist "dark" (rein lokale Persistenz, kein Tracking).',
    `A/persistenz: localStorage "tf-theme" = ${await getStored(pageA)}, erwartet "dark".`
  );
  await toggleButton(pageA).screenshot({ path: join(SCREENSHOT_DIR, 'toggle-button-dark-active.png') });
  console.log('  Screenshot: toggle-button-dark-active.png');

  // Richtung 1: Klick dunkel -> hell
  console.log('\n--- Klick 1: dunkel -> hell ---');
  await toggleButton(pageA).click();
  await pageA.waitForTimeout(600); // MutationObserver -> Hook -> Re-Render
  check(
    (await getThemeAttr(pageA)) === 'light' && (await getStored(pageA)) === 'light',
    'Klick 1: data-theme und localStorage wechseln auf "light".',
    `Klick 1: data-theme=${await getThemeAttr(pageA)}, localStorage=${await getStored(pageA)} — Toggle setzt Attribut/Persistenz nicht.`
  );
  await expectLineColor(pageA, 'light', 'lik', 'A/nach-klick-hell');
  await expectLineColor(pageA, 'light', 'trueflation', 'A/nach-klick-hell');
  await expectStaleColorGone(pageA, 'dark', 'lik', 'A/nach-klick-hell');
  await toggleButton(pageA).screenshot({ path: join(SCREENSHOT_DIR, 'toggle-button-light-active.png') });
  await pageA.locator('.tf-chart-container').screenshot({ path: join(SCREENSHOT_DIR, 'chart-after-manual-toggle-light.png') });
  console.log('  Screenshots: toggle-button-light-active.png, chart-after-manual-toggle-light.png');

  // Richtung 2: Klick hell -> dunkel
  console.log('\n--- Klick 2: hell -> dunkel ---');
  await toggleButton(pageA).click();
  await pageA.waitForTimeout(600);
  check(
    (await getThemeAttr(pageA)) === 'dark',
    'Klick 2: data-theme wechselt zurück auf "dark".',
    `Klick 2: data-theme=${await getThemeAttr(pageA)} — Rückrichtung defekt.`
  );
  await expectLineColor(pageA, 'dark', 'lik', 'A/nach-klick-dunkel');
  await expectStaleColorGone(pageA, 'light', 'lik', 'A/nach-klick-dunkel');
  await pageA.locator('.tf-chart-container').screenshot({ path: join(SCREENSHOT_DIR, 'chart-after-manual-toggle-dark.png') });

  // Persistenz über echten Reload
  console.log('\n--- Reload: manuelle Wahl muss erhalten bleiben ---');
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  check(
    (await getThemeAttr(pageA)) === 'dark',
    'Reload: data-theme="dark" steht sofort wieder (Inline-Script + localStorage).',
    `Reload: data-theme=${await getThemeAttr(pageA)} — Persistenz über Reload defekt.`
  );
  await waitForChart(pageA);
  await expectLineColor(pageA, 'dark', 'lik', 'A/nach-reload');

  // NEGATIVTEST: fehlerhafter Toggle (nur localStorage, KEIN data-theme) —
  // simuliert exakt den Zustand vor diesem Fix. Der Haupttest MÜSSTE hier
  // fehlschlagen; wir assertieren daher das Gegenteil als Mechanismus-Beweis.
  console.log('\n=== NEGATIVTEST: Toggle ohne data-theme-Attribut (Zustand vor Fix) ===');
  await pageA.evaluate(() => {
    // "Kaputter" Toggle: persistiert nur, wendet nicht an + Attribut entfernen.
    localStorage.setItem('tf-theme', 'dark');
    document.documentElement.removeAttribute('data-theme');
  });
  await pageA.waitForTimeout(600); // dem Hook Zeit geben, ggf. zu reagieren
  const negAttr = await getThemeAttr(pageA);
  const negRes = await pageA.evaluate(countMatchingPixels, [hexToRgb(EXPECTED.dark.lik), TOLERANCE_TIGHT]);
  console.log(`  Ohne data-theme: Attribut=${negAttr}, dunkle LIK-Pixel=${negRes.matches}`);
  check(
    negAttr === null && negRes.matches < MIN_MATCHES,
    `NEGATIVTEST: ohne data-theme-Attribut rendert der Chart NICHT dunkel (${negRes.matches} < ${MIN_MATCHES} Pixel) — der Haupttest würde im Fehlerfall FAIL melden, das Attribut ist der wirksame Mechanismus.`,
    `NEGATIVTEST fehlgeschlagen: ${negRes.matches} dunkle Pixel ohne data-theme-Attribut — der Test könnte den Fehlerfall nicht erkennen.`
  );
  await ctxA.close();

  // ─── Kontext B: KEINE gespeicherte Wahl, System DUNKEL ─────────────────
  console.log('\n=== Kontext B: Erstbesuch, System=dunkel, keine gespeicherte Wahl ===');
  const ctxB = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: 'dark' });
  const pageB = await ctxB.newPage();
  await pageB.goto(URL, { waitUntil: 'domcontentloaded' });
  check(
    (await getThemeAttr(pageB)) === null,
    'B/system-default: KEIN data-theme-Attribut gesetzt — Seite folgt rein der Systemeinstellung (spätere System-Änderung greift weiter).',
    `B/system-default: data-theme=${await getThemeAttr(pageB)} — Inline-Script setzt ein Attribut, obwohl keine Wahl gespeichert ist (friert System-Folge ein).`
  );
  check(
    (await getStored(pageB)) === null,
    'B/system-default: localStorage ist leer — kein Schreibzugriff ohne manuelle Wahl (Datensparsamkeit).',
    `B/system-default: localStorage=${await getStored(pageB)} — Seite schreibt unaufgefordert in localStorage.`
  );
  await waitForChart(pageB);
  await expectLineColor(pageB, 'dark', 'lik', 'B/system-dunkel');

  // Barrierefreiheit: Tastatur-Bedienung (Enter) + ARIA
  console.log('\n--- Barrierefreiheit: Tastatur + ARIA ---');
  const ariaBefore = await toggleButton(pageB).getAttribute('aria-label');
  const pressedBefore = await toggleButton(pageB).getAttribute('aria-pressed');
  console.log(`  Vor Tastatur-Klick: aria-label="${ariaBefore}", aria-pressed=${pressedBefore}`);
  check(
    !!ariaBefore && /modus/i.test(ariaBefore),
    `A11y: aria-label vorhanden und beschreibend ("${ariaBefore}").`,
    `A11y: aria-label fehlt oder nichtssagend ("${ariaBefore}").`
  );
  await toggleButton(pageB).focus();
  const isFocused = await pageB.evaluate(() => document.activeElement?.classList.contains('tf-theme-toggle'));
  check(isFocused, 'A11y: Button ist per Tastatur fokussierbar (natives <button>).', 'A11y: Button nicht fokussierbar.');
  await pageB.keyboard.press('Enter'); // System=dunkel -> manuell hell
  await pageB.waitForTimeout(600);
  check(
    (await getThemeAttr(pageB)) === 'light',
    'A11y: Enter-Taste schaltet um (dunkel -> hell) — vollständig tastaturbedienbar.',
    `A11y: Enter-Taste ohne Wirkung (data-theme=${await getThemeAttr(pageB)}).`
  );
  const ariaAfter = await toggleButton(pageB).getAttribute('aria-label');
  const pressedAfter = await toggleButton(pageB).getAttribute('aria-pressed');
  console.log(`  Nach Tastatur-Klick: aria-label="${ariaAfter}", aria-pressed=${pressedAfter}`);
  check(
    ariaAfter !== ariaBefore && /dunkel/i.test(ariaAfter),
    `A11y: aria-label aktualisiert sich zustandsabhängig ("${ariaAfter}" nach Wechsel auf hell).`,
    `A11y: aria-label unverändert/falsch nach Wechsel ("${ariaAfter}").`
  );
  check(
    pressedBefore === 'true' && pressedAfter === 'false',
    `A11y: aria-pressed spiegelt den Zustand (${pressedBefore} -> ${pressedAfter}).`,
    `A11y: aria-pressed inkonsistent (${pressedBefore} -> ${pressedAfter}).`
  );
  await expectLineColor(pageB, 'light', 'lik', 'B/manuell-hell-bei-system-dunkel');
  await expectStaleColorGone(pageB, 'dark', 'lik', 'B/manuell-hell-bei-system-dunkel');
  console.log('  (Manuelle Wahl "light" gewinnt gegen emuliertes prefers-color-scheme: dark — bewiesen.)');

  await ctxB.close();

  // ─── Kontext C: W1-REGRESSIONSTEST ──────────────────────────────────────
  // Betreiber-Vorgabe (30.08.2026, Re-Review-Befund W1): ein echter Bug
  // wurde gefunden UND gefixt (ThemeToggle.tsx, onSystemChange, catch-Zweig
  // riet faelschlich aus der Systemeinstellung statt das tatsaechlich
  // gesetzte data-theme-Attribut zu respektieren). Der urspruengliche
  // Nachweis-Test wurde nach der Verifikation geloescht -- "ein Test, der
  // einen echten Bug nachweist, ist ein Regressionstest, er wird behalten,
  // nicht weggeworfen". Deshalb HIER dauerhaft in der Suite.
  //
  // Reproduktion: localStorage wird VOLLSTAENDIG blockiert (addInitScript,
  // wirft VOR dem Inline-Script in layout.tsx -- realistischer als ein
  // Mock, der erst nach Hydration greift), System startet HELL, Nutzer
  // schaltet manuell auf DUNKEL (data-theme="dark" steht korrekt, auch ohne
  // Persistenz), danach wechselt das Betriebssystem zweimal (hell -> dunkel
  // -> hell) -- der KRITISCHE zweite change-Event ist der, bei dem der
  // Bug vor dem Fix zuschlug (erster Wechsel loeste u.U. noch den
  // Normalpfad aus, der zweite den catch-Zweig).
  console.log('\n=== Kontext C: W1-REGRESSIONSTEST — localStorage blockiert, manueller Toggle + doppelter System-Wechsel ===');
  const ctxC = await browser.newContext({ viewport: { width: 1400, height: 900 }, colorScheme: 'light' });
  const pageC = await ctxC.newPage();
  await pageC.addInitScript(() => {
    const blocked = () => { throw new DOMException('blocked in this test', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', {
      get() {
        return {
          getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked,
          key: blocked, length: 0,
        };
      },
    });
  });
  await pageC.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitForChart(pageC);

  // Manueller Toggle auf dunkel (funktioniert trotz blockiertem localStorage
  // — Umschalten wirkt fuer die Sitzung, nur ohne Persistenz, siehe toggle()).
  await toggleButton(pageC).click();
  await pageC.waitForTimeout(600);
  check(
    (await getThemeAttr(pageC)) === 'dark',
    'C/W1-Vorbedingung: manueller Toggle setzt data-theme="dark" trotz blockiertem localStorage.',
    `C/W1-Vorbedingung: data-theme=${await getThemeAttr(pageC)} — Toggle funktioniert nicht ohne Persistenz, Testaufbau ungueltig.`
  );

  // Simuliere zwei aufeinanderfolgende System-Wechsel (hell->dunkel->hell) —
  // der zweite change-Event ist der kritische Fall aus dem Re-Review.
  await pageC.emulateMedia({ colorScheme: 'dark' });
  await pageC.waitForTimeout(400);
  await pageC.emulateMedia({ colorScheme: 'light' });
  await pageC.waitForTimeout(400);

  const attrAfterC = await getThemeAttr(pageC);
  const ariaAfterC = await toggleButton(pageC).getAttribute('aria-label');
  const pressedAfterC = await toggleButton(pageC).getAttribute('aria-pressed');
  const bgAfterC = await pageC.evaluate(() => getComputedStyle(document.body).backgroundColor);
  console.log(`  Nach doppeltem System-Wechsel: data-theme=${attrAfterC}, aria-label="${ariaAfterC}", aria-pressed=${pressedAfterC}, bg=${bgAfterC}`);

  check(
    attrAfterC === 'dark' && bgAfterC === 'rgb(13, 17, 23)',
    'C/W1: data-theme bleibt "dark", Seite rendert weiterhin korrekt dunkel — vom System-Wechsel unbeeinflusst.',
    `C/W1: data-theme=${attrAfterC}, bg=${bgAfterC} — manuelle Wahl wurde vom System-Wechsel ueberschrieben.`
  );
  check(
    !!ariaAfterC && /dunkel/i.test(ariaAfterC) === false && /hell/i.test(ariaAfterC),
    `C/W1 (Kernbefund): aria-label ("${ariaAfterC}") stimmt mit dem TATSAECHLICHEN data-theme ("dark") ueberein, nicht mit der Systemeinstellung ("light") — vor dem Fix haette hier "Dunkelmodus aktivieren" gestanden (Icon/Label-Desync).`,
    `C/W1 (REGRESSION!): aria-label="${ariaAfterC}" — stimmt NICHT mit data-theme="dark" ueberein, der W1-Bug ist zurueckgekehrt (catch-Zweig raet wieder aus der Systemeinstellung statt aus dem Attribut zu lesen).`
  );
  check(
    pressedAfterC === 'true',
    'C/W1: aria-pressed="true" (entspricht dem aktiven Dunkelmodus, dem tatsaechlichen data-theme).',
    `C/W1 (REGRESSION!): aria-pressed="${pressedAfterC}" — entspricht nicht dem tatsaechlichen data-theme="dark".`
  );
  await expectLineColor(pageC, 'dark', 'lik', 'C/W1-chart-unbeeinflusst');

  await ctxC.close();
  await browser.close();

  console.log(`\n=== Gesamtergebnis: ${failures === 0 ? 'PASS' : `FAIL (${failures} fehlgeschlagene Checks)`} ===`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FEHLER:', err);
  process.exit(1);
});
