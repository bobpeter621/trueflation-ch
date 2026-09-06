#!/usr/bin/env node
/**
 * trueflation.ch — CSS-Klassen-Vollständigkeitsprüfung (TEIL-B-Audit,
 * 05.09.2026), Schwester-Check zu css-token-completeness-check.mjs.
 *
 * FEHLERKLASSE: Eine eigene CSS-Klasse (`tf-*`) wird im TSX referenziert,
 * ist aber in KEINEM Stylesheet definiert. Der Browser ignoriert das still
 * — kein Fehler, keine Console-Warnung, das Element rendert nur ungestylt.
 * Drei reale Befunde dieser Klasse (Audit 05.09.2026):
 *   B1: .tf-chart-status--info (M2-Warnhinweis in LikChart.tsx)
 *   B2: .tf-overlay-menu / .tf-overlay-menu-content (Overlay-Menü LikChart.tsx)
 *   B3: .tf-rechner (KaufkraftRechner.tsx, mit Inline-Styles kompensiert)
 * Alle drei gefixt; dieser Test schliesst die Fehlerklasse STRUKTURELL:
 * jede künftige tf-*-Referenz ohne Definition schlägt hier fehl.
 *
 * METHODE (statische Analyse, analog zu css-token-completeness-check.mjs):
 *  a) DEFINIERTE Klassen: app/design-system/tokens.css + app/globals.css
 *     nach `.tf-klassenname` durchsuchen (Kommentare vorher entfernt).
 *  b) REFERENZIERTE Klassen: alle .tsx/.ts unter app/ nach className-
 *     Attributen durchsuchen (String- UND Template-Literal-Form, z.B.
 *     `tf-preset-button${cond ? " tf-preset-button--active" : ""}`),
 *     darin alle tf-*-Token finden. Kommentarzeilen werden vorher entfernt.
 *     NUR tf-*-Klassen werden geprüft — Tailwind-Utility-Klassen (text-sm
 *     etc.) sind durch das Framework abgedeckt und nicht Teil dieser
 *     Fehlerklasse.
 *  c) JEDE referenzierte tf-*-Klasse MUSS definiert sein, sonst FAIL mit
 *     Datei/Zeile.
 *
 * NEGATIVTESTS:
 *  1. Eine erfundene Klasse (tf-does-not-exist-xyz) als simulierte Referenz
 *     muss als NICHT definiert erkannt werden.
 *  2. Die drei historischen Befunde (B1/B2/B3) müssen HEUTE definiert sein
 *     (Fix-Nachhaltigkeit) — simuliert als Referenz dürfen sie NICHT mehr
 *     als fehlend gemeldet werden; und die Prüflogik selbst erkennt einen
 *     künstlich entfernten Definitionseintrag korrekt als fehlend.
 *
 * Usage: node verification/css-class-completeness-check.mjs
 * Exit-Code 0 = bestanden, 1 = mindestens eine undefinierte tf-*-Referenz.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

let passed = 0;
let failures = 0;
function check(name, condition, detail) {
  console.log(`[${condition ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (condition) passed++; else failures++;
}

function collectSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const CLASS_NAME = 'tf-[a-zA-Z][a-zA-Z0-9-]*';

function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function stripTsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
}

/** Definierte tf-*-Klassen aus tokens.css + globals.css (Kommentare
 * entfernt, damit dokumentierte aber nicht definierte Klassen — z.B. in
 * Fix-Kommentaren erwähnte — NICHT als definiert zählen). */
function extractDefinedClasses() {
  const cssFiles = [
    path.join(REPO_ROOT, 'app', 'design-system', 'tokens.css'),
    path.join(REPO_ROOT, 'app', 'globals.css'),
  ];
  const defined = new Map();
  const declRegex = new RegExp(`\\.(${CLASS_NAME})`, 'g');
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

/** Referenzierte tf-*-Klassen in className-Attributen (String- UND
 * Template-Literal-Form) aller .tsx/.ts unter app/. */
function extractReferencedClasses() {
  const files = collectSourceFiles(path.join(REPO_ROOT, 'app'));
  const references = [];
  const classTokenRegex = new RegExp(`(${CLASS_NAME})`, 'g');
  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const rel = path.relative(REPO_ROOT, file);
    const content = stripTsComments(raw);
    // className="..." und className={`...`}-Bereiche finden
    const attrRegex = /className\s*=\s*(\{[`'"]([\s\S]*?)[`'"]\}|"([^"]*)")/g;
    let m;
    while ((m = attrRegex.exec(content)) !== null) {
      const classAttr = m[2] ?? m[3] ?? '';
      let t;
      while ((t = classTokenRegex.exec(classAttr)) !== null) {
        const idx = raw.indexOf(t[1]);
        references.push({
          className: t[1],
          file: rel,
          line: idx === -1 ? '?' : raw.slice(0, idx).split('\n').length,
        });
      }
    }
  }
  return references;
}

function findUndefinedReferences(references, definedClasses) {
  return references.filter((r) => !definedClasses.has(r.className));
}

function main() {
  console.log('=== Test 1: Jede referenzierte tf-*-Klasse ist definiert (Fehlerklasse B1/B2/B3 strukturell schliessen) ===\n');

  const definedClasses = extractDefinedClasses();
  const references = extractReferencedClasses();
  const uniqueReferenced = [...new Set(references.map((r) => r.className))].sort();

  console.log(`Definierte tf-*-Klassen (${definedClasses.size}):`);
  for (const c of [...definedClasses.keys()].sort()) {
    console.log(`  def  .${c}  [${[...new Set(definedClasses.get(c))].join(', ')}]`);
  }
  console.log(`\nReferenzierte tf-*-Klassen (${uniqueReferenced.length} eindeutige):`);
  for (const c of uniqueReferenced) {
    const files = [...new Set(references.filter((r) => r.className === c).map((r) => r.file))].join(', ');
    console.log(`  ref  .${c}  (${files})`);
  }
  console.log('');

  check('Mindestens eine definierte tf-*-Klasse gefunden (Sanity)', definedClasses.size > 0, `${definedClasses.size} definiert`);
  check('Mindestens eine referenzierte tf-*-Klasse gefunden (Sanity)', references.length > 0, `${references.length} Fundstellen`);

  const undefinedRefs = findUndefinedReferences(references, definedClasses);
  check(
    'JEDE referenzierte tf-*-Klasse ist in tokens.css/globals.css definiert',
    undefinedRefs.length === 0,
    undefinedRefs.length > 0
      ? `UNDEFINIERT: ${undefinedRefs.map((r) => `.${r.className} in ${r.file}:${r.line}`).join('; ')}`
      : `alle ${uniqueReferenced.length} referenzierten Klassen definiert`
  );

  console.log('\n=== Test 2-neg: erfundene Klasse muss als NICHT definiert erkannt werden ===');
  const fake = findUndefinedReferences([{ className: 'tf-does-not-exist-xyz', file: 'simuliert.tsx', line: 1 }], definedClasses);
  check('NEGATIVTEST: tf-does-not-exist-xyz wird als NICHT definiert erkannt', fake.length === 1, `Treffer: ${fake.length}`);

  console.log('\n=== Test 3-neg: historische Befunde B1/B2/B3 sind gefixt UND werden bei Regression erkannt ===');
  const historical = ['tf-chart-status--info', 'tf-overlay-menu', 'tf-overlay-menu-content', 'tf-rechner'];
  for (const cls of historical) {
    const isDefined = definedClasses.has(cls);
    const sim = findUndefinedReferences([{ className: cls, file: 'simuliert.tsx', line: 1 }], definedClasses);
    check(
      `.${cls}: definiert (Fix nachhaltig) — simulierte Referenz wird korrekt NICHT als fehlend gemeldet`,
      isDefined && sim.length === 0,
      `definiert=${isDefined}, Referenzen im Code=${references.filter((r) => r.className === cls).length}`
    );
  }
  // Prüflogik-Selbsttest: entferne eine Definition künstlich -> muss FAIL ergeben
  const sabotaged = new Map(definedClasses);
  sabotaged.delete('tf-rechner');
  const sabotagedResult = findUndefinedReferences([{ className: 'tf-rechner', file: 'simuliert.tsx', line: 1 }], sabotaged);
  check(
    'Prüflogik-Selbsttest: künstlich entfernte Definition (.tf-rechner) wird als fehlend erkannt',
    sabotagedResult.length === 1,
    `Treffer: ${sabotagedResult.length}`
  );

  console.log(`\n=== Ergebnis: ${passed} PASS, ${failures} FAIL ===`);
  if (failures > 0) process.exit(1);
}

main();
