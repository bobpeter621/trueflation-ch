#!/usr/bin/env node
/**
 * trueflation.ch — CSS-Token-Vollständigkeitsprüfung (Betreiber-Vorgabe
 * 30.08.2026, nach ZWEI Vorfällen derselben Fehlerklasse).
 *
 * FEHLERKLASSE: Eine CSS-Custom-Property (`--token-name`) wird im Code
 * referenziert, ist aber nirgends definiert. Browser UND Canvas-API
 * ignorieren das still — es gibt keinen Fehler, keine Console-Warnung,
 * nur eine unsichtbare/falsch gerenderte Stelle:
 *   K1: Chart.js bekam `var(--color-line-lik, ...)` als Canvas-Farbstring
 *       (Canvas löst var() nicht auf → schwarze Linien). Gefixt via
 *       useThemeColors-Hook (getComputedStyle → echte Hexwerte).
 *   K2: Formel-Box in app/methodik/page.tsx nutzte
 *       `var(--color-surface-secondary)` — dieser Token existierte weder in
 *       tokens.css noch globals.css → transparenter statt sichtbarer
 *       Hintergrund. Gefixt auf `var(--color-bg-subtle)`.
 * Beide Fälle wurden nur durch Zufall/menschliches Review gefunden. Dieser
 * Test schliesst die Fehlerklasse STRUKTURELL: jeder künftige Fall derselben
 * Art schlägt hier sofort fehl.
 *
 * METHODE (statische Analyse, keine Browser-Instanz nötig — analog zu
 * scripts/pipeline/test-public-sync-completeness.mjs):
 *  a) DEFINIERTE Tokens: app/design-system/tokens.css UND app/globals.css
 *     werden nach `--token-name: wert;`-Deklarationen durchsucht. ALLE
 *     Fundorte zählen als "definiert" — :root, [data-theme="..."]-Blöcke,
 *     @media (prefers-color-scheme: dark)-Blöcke, @theme-Blöcke. Ein Token,
 *     der nur in einem bestimmten Modus auftaucht, gilt trotzdem als
 *     definiert (Modus-Abdeckung ist eine separate Frage, nicht diese
 *     Fehlerklasse). CSS-Kommentare werden vorher entfernt, damit ein
 *     auskommentierter Token NICHT als definiert zählt.
 *  b) REFERENZIERTE Tokens: rekursiv alle .tsx/.ts-Dateien unter app/
 *     (node_modules/.next ausgeschlossen) werden durchsucht nach:
 *       - `var(--token-name` bzw. `var(--token-name, FALLBACK)` — der
 *         Fallback macht den fehlenden Token NICHT unkritisch: greift der
 *         Fallback immer, funktioniert die gewollte Theme-Anpassung
 *         (Light/Dark) nie — das war genau der K2-Bug. Ein undefinierter
 *         Token-Name ist FAIL, auch MIT Fallback.
 *       - `getPropertyValue("--token-name")` / `getPropertyValue('--...')`
 *         (useThemeColors-Stil in LikChart.tsx)
 *       - direkte String-Literale `"--token-name"` / `'--token-name'`
 *         (z.B. get("--color-line-lik", fallback)-Aufrufe in
 *         readThemeColors())
 *     AUSNAHME (Definition, nicht Referenz): `variable: "--font-..."` in
 *     next/font-Konfigurationen (layout.tsx) DEFINIERT die Custom Property
 *     zur Laufzeit (next/font injiziert sie via generierter Klasse) — das
 *     ist eine Definitionsstelle, keine Referenz auf ein Theme-Token.
 *     Solche Tokens werden als "extern definiert" gezählt, nicht als
 *     fehlende Referenz.
 *  c) JEDER referenzierte Token-Name MUSS in der Menge der definierten
 *     (oder extern definierten) Tokens vorkommen. Sonst FAIL mit Datei,
 *     Zeile und Token-Name — konkret benannt, nicht nur "Fehler gefunden".
 *
 * NEGATIVTESTS (Pflicht, analog zu Test 1-neg in
 * test-public-sync-completeness.mjs — sonst wäre dieser Test selbst nur
 * ein Stub, der immer grün meldet):
 *  1. Ein erfundener, garantiert nicht existierender Token
 *     (--color-does-not-exist-xyz) wird als simulierte Referenz eingespeist
 *     und muss korrekt als NICHT definiert erkannt werden.
 *  2. Der historische K2-Fall: --color-surface-secondary muss HEUTE 0
 *     Referenzen im Code haben (Fix-Nachhaltigkeit) UND — simuliert als
 *     Referenz — von der Prüflogik als undefiniert erkannt werden (der
 *     Token ist nach wie vor nirgends definiert; käme er je zurück,
 *     schlägt dieser Test Alarm).
 *
 * Usage: node verification/css-token-completeness-check.mjs
 * Exit-Code 0 = bestanden, 1 = mindestens ein undefinierter Token referenziert.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

let passed = 0;
let failures = 0;
function check(name, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
  if (condition) passed++; else failures++;
}

/** Rekursiv alle .tsx/.ts-Dateien unter app/ einsammeln (keine node_modules/.next). */
function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const TOKEN_NAME = '--[a-zA-Z][a-zA-Z0-9-]*';

/** Entfernt CSS-Kommentare (inkl. mehrzeiliger), damit auskommentierte
 * Deklarationen NICHT als definiert zählen. */
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Entfernt aus TS/TSX-Quellcode Blockkommentare und ganze Kommentarzeilen,
 * damit Token-Namen in Kommentaren (z.B. Erklärungen in LikChart.tsx) nicht
 * als Referenzen zählen. Inline-`//` wird NICHT gestrippt (Risiko: URLs,
 * Regex-Literale) — nur Zeilen, die (nach Whitespace) mit // beginnen. */
function stripTsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/** Sammelt alle definierten Token-Namen aus tokens.css + globals.css.
 * Jeder Fundort zählt (:root, [data-theme], @media, @theme) — ein Token,
 * der nur in einem Modus definiert ist, gilt als definiert. */
function extractDefinedTokens() {
  const cssFiles = [
    path.join(REPO_ROOT, 'app', 'design-system', 'tokens.css'),
    path.join(REPO_ROOT, 'app', 'globals.css'),
  ];
  const defined = new Map(); // token -> [datei, ...]
  const declRegex = new RegExp(`(${TOKEN_NAME})\\s*:`, 'g');
  for (const file of cssFiles) {
    const content = stripCssComments(readFileSync(file, 'utf-8'));
    let m;
    while ((m = declRegex.exec(content)) !== null) {
      const rel = path.relative(REPO_ROOT, file);
      if (!defined.has(m[1])) defined.set(m[1], []);
      defined.get(m[1]).push(rel);
    }
  }
  return defined;
}

/** Sammelt alle referenzierten Token-Namen aus .tsx/.ts unter app/.
 * Rückgabe: [{ token, file, line, pattern }] — pattern dient der
 * Nachvollziehbarkeit, ÜBER WELCHEN Mechanismus referenziert wurde. */
function extractReferencedTokens() {
  const files = collectSourceFiles(path.join(REPO_ROOT, 'app'));
  const references = [];
  const externallyDefined = []; // next/font variable:-Definitionen

  const varRegex = new RegExp(`var\\(\\s*(${TOKEN_NAME})`, 'g');
  const gpvRegex = new RegExp(`getPropertyValue\\(\\s*["'\`](${TOKEN_NAME})["'\`]`, 'g');
  const stringLiteralRegex = new RegExp(`["'\`](${TOKEN_NAME})["'\`]`, 'g');
  const fontVariableRegex = new RegExp(`variable\\s*:\\s*["'\`](${TOKEN_NAME})["'\`]`, 'g');

  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const rel = path.relative(REPO_ROOT, file);
    const content = stripTsComments(raw);
    // Zeilennummern-Mapping über den Originaltext (stripTsComments löscht
    // ganze //-Zeilen; für die Fundmeldung reicht die Zeile im bereinigten
    // Text nicht — wir suchen die Zeile im Original per Index des Tokens).
    const lineOf = (token) => {
      const idx = raw.indexOf(token);
      return idx === -1 ? '?' : raw.slice(0, idx).split('\n').length;
    };

    // 1. next/font `variable: "--..."`-Definitionen ZUERST erfassen — das
    //    sind Definitionsstellen, keine Referenzen (next/font injiziert die
    //    Custom Property zur Laufzeit via generierter Klasse).
    const fontTokens = new Set();
    let m;
    while ((m = fontVariableRegex.exec(content)) !== null) {
      fontTokens.add(m[1]);
      externallyDefined.push({ token: m[1], file: rel, pattern: 'next/font variable:' });
    }

    // 2. var(--token[, fallback])
    while ((m = varRegex.exec(content)) !== null) {
      references.push({ token: m[1], file: rel, line: lineOf(m[1]), pattern: 'var()' });
    }

    // 3. getPropertyValue("--token")
    while ((m = gpvRegex.exec(content)) !== null) {
      references.push({ token: m[1], file: rel, line: lineOf(m[1]), pattern: 'getPropertyValue' });
    }

    // 4. Direkte String-Literale "--token" (z.B. get("--color-line-lik", fb)
    //    im useThemeColors-Stil) — AUSSER next/font variable:-Definitionen.
    while ((m = stringLiteralRegex.exec(content)) !== null) {
      if (fontTokens.has(m[1])) continue;
      references.push({ token: m[1], file: rel, line: lineOf(m[1]), pattern: 'string-literal' });
    }
  }
  return { references, externallyDefined };
}

/** Kernlogik (separat testbar): welche Referenzen zeigen auf keinen
 * definierten Token? */
function findUndefinedReferences(references, definedTokens, externallyDefined) {
  const externalSet = new Set(externallyDefined.map((e) => e.token));
  return references.filter(
    (r) => !definedTokens.has(r.token) && !externalSet.has(r.token)
  );
}

function main() {
  console.log('=== Test 1: Jeder im Code referenzierte CSS-Token ist auch definiert (Fehlerklasse K1/K2 strukturell schliessen) ===\n');

  const definedTokens = extractDefinedTokens();
  const { references, externallyDefined } = extractReferencedTokens();

  const uniqueReferenced = [...new Set(references.map((r) => r.token))].sort();
  const uniqueDefined = [...definedTokens.keys()].sort();

  console.log(`Definierte Tokens (${uniqueDefined.length}, aus tokens.css + globals.css):`);
  for (const t of uniqueDefined) console.log(`  def  ${t}  [${[...new Set(definedTokens.get(t))].join(', ')}]`);
  console.log(`\nReferenzierte Tokens (${uniqueReferenced.length} eindeutige, ${references.length} Fundstellen in app/):`);
  for (const t of uniqueReferenced) {
    const spots = references.filter((r) => r.token === t);
    const files = [...new Set(spots.map((s) => s.file))].join(', ');
    const patterns = [...new Set(spots.map((s) => s.pattern))].join('+');
    console.log(`  ref  ${t}  (${patterns}; ${files})`);
  }
  if (externallyDefined.length > 0) {
    console.log(`\nExtern definiert (next/font variable:, zählt NICHT als Referenz):`);
    for (const e of externallyDefined) console.log(`  ext  ${e.token}  [${e.file}]`);
  }
  console.log('');

  check(
    'Mindestens ein definierter Token gefunden (Sanity-Check — sonst prüft der Test nichts)',
    uniqueDefined.length > 0,
    `${uniqueDefined.length} definierte Tokens`
  );
  check(
    'Mindestens eine Token-Referenz im Code gefunden (Sanity-Check)',
    references.length > 0,
    `${references.length} Referenz-Fundstellen`
  );

  const undefinedRefs = findUndefinedReferences(references, definedTokens, externallyDefined);
  check(
    'JEDE referenzierte CSS-Custom-Property ist definiert (tokens.css/globals.css) oder extern definiert (next/font)',
    undefinedRefs.length === 0,
    undefinedRefs.length > 0
      ? `UNDEFINIERTE TOKEN-REFERENZEN: ${undefinedRefs.map((r) => `${r.token} in ${r.file}:${r.line} (${r.pattern})`).join('; ')}`
      : `alle ${uniqueReferenced.length} referenzierten Tokens sind definiert`
  );

  console.log('\n=== Test 2-neg: NEGATIVTEST — ein erfundener Token muss als NICHT definiert erkannt werden ===');
  const fakeRef = [{ token: '--color-does-not-exist-xyz', file: 'simuliert/fake.tsx', line: 1, pattern: 'var()' }];
  const fakeFound = findUndefinedReferences(fakeRef, definedTokens, externallyDefined);
  check(
    'NEGATIVTEST: --color-does-not-exist-xyz wird korrekt als NICHT definiert erkannt',
    fakeFound.length === 1 && fakeFound[0].token === '--color-does-not-exist-xyz',
    `findUndefinedReferences Treffer: ${fakeFound.length}`
  );

  console.log('\n=== Test 3-neg: NEGATIVTEST — der historische K2-Fall (--color-surface-secondary) ===');
  const surfaceRefs = references.filter((r) => r.token === '--color-surface-secondary');
  check(
    'K2-Fix ist nachhaltig: --color-surface-secondary hat 0 Referenzen im aktuellen Code',
    surfaceRefs.length === 0,
    `Referenz-Fundstellen: ${surfaceRefs.length}`
  );
  check(
    '--color-surface-secondary ist auch nirgends definiert (Token existiert nicht — daran lag der Bug)',
    !definedTokens.has('--color-surface-secondary'),
    `definiert: ${definedTokens.has('--color-surface-secondary')}`
  );
  const surfaceSim = findUndefinedReferences(
    [{ token: '--color-surface-secondary', file: 'simuliert/k2-regression.tsx', line: 1, pattern: 'var()' }],
    definedTokens,
    externallyDefined
  );
  check(
    'NEGATIVTEST: käme --color-surface-secondary als Referenz zurück (Regression), würde die Prüfung ihn als undefiniert flaggen',
    surfaceSim.length === 1,
    `simulierte K2-Regression erkannt: ${surfaceSim.length === 1}`
  );

  console.log(`\n=== Ergebnis: ${passed} PASS, ${failures} FAIL ===`);
  if (failures > 0) {
    process.exit(1);
  }
}

main();
