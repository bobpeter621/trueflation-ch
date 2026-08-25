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
/** Erlaubte zusätzliche Query-Parameter, die die Pipeline selbst anhängen darf
 * (nicht aus Nutzereingabe, sondern aus Code-konstanten Datumsangaben) — kein
 * SSRF-Risiko, da Host/Pfad weiterhin exakt aus der Whitelist stammen müssen. */
const ALLOWED_APPENDED_PARAMS = new Set(['fromDate', 'toDate']);
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Prüft, ob url entweder exakt whitelisted ist, ODER ob die whitelisted-Basis-URL
 * (ohne zusätzliche fromDate/toDate-Parameter) mit url übereinstimmt und die
 * zusätzlichen Parameter ausschliesslich aus ALLOWED_APPENDED_PARAMS mit
 * validem Datumsformat bestehen.
 */
function isWhitelistedWithDateRange(url, whitelisted) {
  if (whitelisted.has(url)) return true;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  for (const w of whitelisted) {
    let wParsed;
    try {
      wParsed = new URL(w);
    } catch {
      continue;
    }
    if (parsed.origin !== wParsed.origin || parsed.pathname !== wParsed.pathname) continue;

    // Alle Query-Parameter der whitelisted-Basis-URL müssen mit denselben Werten vorhanden sein
    let baseParamsMatch = true;
    for (const [key, value] of wParsed.searchParams) {
      if (parsed.searchParams.get(key) !== value) {
        baseParamsMatch = false;
        break;
      }
    }
    if (!baseParamsMatch) continue;

    // Zusätzliche Parameter in url (die nicht in der whitelisted-Basis-URL stehen)
    // dürfen NUR aus ALLOWED_APPENDED_PARAMS mit validem Datumsformat bestehen
    let extraParamsValid = true;
    for (const [key, value] of parsed.searchParams) {
      if (wParsed.searchParams.has(key)) continue; // schon oben geprüft
      if (!ALLOWED_APPENDED_PARAMS.has(key) || !DATE_PARAM_PATTERN.test(value)) {
        extraParamsValid = false;
        break;
      }
    }
    if (extraParamsValid) return true;
  }
  return false;
}

export async function fetchWhitelisted(url, options = {}) {
  const whitelisted = loadWhitelistedUrls();
  if (!isWhitelistedWithDateRange(url, whitelisted)) {
    throw new WhitelistViolationError(url);
  }
  return fetch(url, options);
}
