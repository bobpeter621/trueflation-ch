/**
 * trueflation.ch — Prüfsummen über publizierte Datenstände (US 5.5)
 *
 * "Über jeden publizierten Datenstand eine Prüfsumme (Hash) bilden, damit
 * nachträgliche Manipulation an gespeicherten Datendateien auffällt."
 *
 * SHA-256 über den Inhalt jeder data/**\/*.json-Datei (ausser Meta-Felder
 * wie importedAt, die sich bei jedem Lauf ändern, aber keine Dateninhalt-
 * Änderung darstellen). Geschrieben nach data/_checksums/checksums.json,
 * versioniert im Repo — jede Abweichung zwischen gespeicherter und
 * tatsächlicher Prüfsumme ist damit über die Git-Historie nachvollziehbar.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const CHECKSUMS_DIR = path.join(REPO_ROOT, 'data', '_checksums');
const CHECKSUMS_FILE = path.join(CHECKSUMS_DIR, 'checksums.json');

// Felder, die bei jedem Lauf variieren dürfen, ohne dass das eine inhaltliche
// Änderung ist (Zeitstempel des Imports selbst) — werden vor dem Hashing entfernt.
const VOLATILE_META_FIELDS = ['importedAt', 'lastIncrementalUpdate'];

function findDataFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_')) continue; // _pipeline-status, _checksums selbst überspringen
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      findDataFiles(fullPath, results);
    } else if (entry.endsWith('.json')) {
      results.push(fullPath);
    }
  }
  return results;
}

function canonicalizeForHashing(obj) {
  if (Array.isArray(obj)) return obj.map(canonicalizeForHashing);
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const key of Object.keys(obj).sort()) {
      if (VOLATILE_META_FIELDS.includes(key)) continue;
      out[key] = canonicalizeForHashing(obj[key]);
    }
    return out;
  }
  return obj;
}

function hashFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const canonical = canonicalizeForHashing(parsed);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Berechnet und schreibt Prüfsummen für alle data/**\/*.json-Dateien. */
export function writeChecksums() {
  const files = findDataFiles(DATA_DIR);
  const checksums = {};
  for (const filePath of files) {
    const relPath = path.relative(REPO_ROOT, filePath);
    checksums[relPath] = hashFile(filePath);
  }

  if (!existsSync(CHECKSUMS_DIR)) mkdirSync(CHECKSUMS_DIR, { recursive: true });
  writeFileSync(
    CHECKSUMS_FILE,
    JSON.stringify(
      {
        _comment: 'Prüfsummen über publizierte Datenstände (US 5.5). SHA-256 über Dateiinhalt, exkl. volatiler Metafelder (importedAt etc.). Bei jedem Pipeline-Lauf neu geschrieben, versioniert im Git-Verlauf.',
        generatedAt: new Date().toISOString(),
        checksums,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[checksums] ${files.length} Datei(en) geprüft, geschrieben nach ${path.relative(REPO_ROOT, CHECKSUMS_FILE)}.`);
  return checksums;
}

/**
 * Verifiziert, ob die aktuellen Datendateien mit den zuletzt gespeicherten
 * Prüfsummen übereinstimmen. Gibt Liste der Abweichungen zurück (leer =
 * alles konsistent).
 */
export function verifyChecksums() {
  if (!existsSync(CHECKSUMS_FILE)) {
    console.warn('[checksums] Keine gespeicherten Prüfsummen gefunden — nichts zu verifizieren.');
    return { ok: true, mismatches: [], missing: true };
  }
  const stored = JSON.parse(readFileSync(CHECKSUMS_FILE, 'utf-8')).checksums;
  const mismatches = [];
  for (const [relPath, storedHash] of Object.entries(stored)) {
    const fullPath = path.join(REPO_ROOT, relPath);
    if (!existsSync(fullPath)) {
      mismatches.push({ file: relPath, issue: 'fehlt', storedHash, currentHash: null });
      continue;
    }
    const currentHash = hashFile(fullPath);
    if (currentHash !== storedHash) {
      mismatches.push({ file: relPath, issue: 'abweichend', storedHash, currentHash });
    }
  }
  return { ok: mismatches.length === 0, mismatches, missing: false };
}
