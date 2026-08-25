/**
 * trueflation.ch — Whitelist-durchsetzender Fetch-Wrapper (US 1.6/1.9)
 *
 * SSRF-Schutz: Jede Pipeline-Komponente MUSS diesen Wrapper nutzen, niemals
 * direkt `fetch()` mit einer aus Config/Nutzereingabe zusammengesetzten URL
 * aufrufen. Nur URLs, die exakt in config/sources.json unter einem der
 * `sources.*.url`-Felder eingetragen sind, werden abgerufen.
 *
 * Das ist der Negativtest-Beweis aus P1-DoD (Betreiber-Korrektur 25.08.2026):
 * "ein Abruf gegen eine NICHT eingetragene URL wird nachweislich abgelehnt".
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SOURCES_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'sources.json');

export class WhitelistViolationError extends Error {
  constructor(url) {
    super(`SSRF-Schutz: URL nicht in config/sources.json whitelisted, Abruf verweigert: ${url}`);
    this.name = 'WhitelistViolationError';
    this.url = url;
  }
}

function loadWhitelistedUrls() {
  const cfg = JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf-8'));
  const urls = new Set();
  for (const source of Object.values(cfg.sources)) {
    if (source.url) urls.add(source.url);
  }
  return urls;
}

/**
 * Einziger erlaubter Weg, wie Pipeline-Code externe URLs abruft.
 * Wirft WhitelistViolationError, wenn die URL nicht exakt in
 * config/sources.json gelistet ist — KEIN Abruf wird ausgeführt.
 */
export async function fetchWhitelisted(url, options = {}) {
  const whitelisted = loadWhitelistedUrls();
  if (!whitelisted.has(url)) {
    throw new WhitelistViolationError(url);
  }
  return fetch(url, options);
}
