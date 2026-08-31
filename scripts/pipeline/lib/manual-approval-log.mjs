/**
 * trueflation.ch — Protokoll manueller Plausi-Freigaben (US 4.10, Fix 3)
 *
 * FUND/AUFTRAG (Betreiber, 28.08.2026): "In der Änderungshistorie (US 4.10)
 * protokollieren: welcher Wert, wann freigegeben." Die eigentliche
 * Änderungshistorie (app/aenderungen/page.tsx) ist bewusst MENSCHLICH
 * kuratierter, statischer Content — siehe Datei-Header dort ("kein
 * Pipeline-generierter Content, da Änderungshistorie von Menschen
 * kuratiert wird"). Die Pipeline darf diese Datei nicht automatisch
 * editieren, ohne dieses Prinzip zu brechen.
 *
 * LÖSUNG: ein separates, MASCHINENGESCHRIEBENES JSON-Protokoll (analog zu
 * den Checksummen-/Pipeline-Status-Dateien unter data/), das jede manuelle
 * Freigabe strukturiert festhält. Der Betreiber (oder ein späterer
 * P5-Schritt) übernimmt daraus bei Bedarf einen menschenlesbaren Eintrag in
 * die kuratierte Seite — die Pipeline selbst generiert keinen TSX-Content.
 * Das erfüllt "protokollieren", ohne das bestehende Kurations-Prinzip zu
 * verletzen.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
export const DEFAULT_APPROVAL_LOG_PATH = path.join(REPO_ROOT, 'data', '_changelog', 'plausi-manual-approvals.json');

/**
 * @param {object} params
 * @param {string} params.sourceKey
 * @param {number} params.oldValue
 * @param {number} params.newValue
 * @param {string} params.sourceUrl
 * @param {string} [params.approvedAt]
 * @param {string} [logPath]
 */
export function recordApproval({ sourceKey, oldValue, newValue, sourceUrl, approvedAt = new Date().toISOString() }, logPath = DEFAULT_APPROVAL_LOG_PATH) {
  const dir = path.dirname(logPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const entries = loadApprovalLog(logPath);
  entries.push({ sourceKey, oldValue, newValue, sourceUrl, approvedAt });
  writeFileSync(logPath, JSON.stringify(entries, null, 2) + '\n');
}

export function loadApprovalLog(logPath = DEFAULT_APPROVAL_LOG_PATH) {
  if (!existsSync(logPath)) return [];
  try {
    return JSON.parse(readFileSync(logPath, 'utf-8'));
  } catch (err) {
    console.error(`[manual-approval-log] Protokolldatei defekt (${err.message}) — als leer behandelt.`);
    return [];
  }
}
