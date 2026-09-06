#!/usr/bin/env node
/**
 * trueflation.ch — Overlay-Bulk-Import: Gold (CHF, abgeleitet, Twelve Data)
 * + BTC/CHF (CHF, abgeleitet, Bitstamp x Twelve Data) (Requirements 2.5, P4)
 *
 * ═══ AUFTRAG UND BETREIBER-ENTSCHEIDUNGEN (28.08.2026) ═══
 * SMI ist auf dem Twelve-Data-Free-Tier NICHT verfügbar (live geprüft,
 * HTTP 404 bei allen getesteten Symbolformen) — GESTRICHEN aus v1, siehe
 * config/sources.json -> overlayModuleNotes.smiStricken. v1-Overlays sind
 * ausschliesslich Gold und BTC.
 *
 * ═══ BTC-QUELLENUMSTELLUNG (Betreiber-Entscheidung 05.09.2026) ═══
 * BTC/CHF kam bisher direkt von Twelve Data (Historie ab 2021-01-31, siehe
 * altes data/overlays/btc-chf-daily.json). Live-Verifikation (05.09.2026)
 * ergab: Bitstamp liefert BTC/USD-Tageskerzen bereits ab 2011-08-18 (5497
 * Tage mehr Historie) -- ABER kein direktes BTC/CHF-Paar (verifiziert gegen
 * /api/v2/trading-pairs-info/). Betreiber-Entscheidung: Zugewinn an Historie
 * rechtfertigt die zusaetzliche Ableitung. BTC/CHF wird jetzt genauso wie
 * Gold/CHF abgeleitet: BTC/USD (Bitstamp) x USD/CHF (Twelve Data) -- gleiches
 * Ableitungsmuster, gleiche Datenvertrags-/Bulk-Validierungsdisziplin, gleiche
 * Kennzeichnung als abgeleitete Groesse auf der Methodik-Seite.
 *
 * GOLD IST EINE ABGELEITETE GRÖSSE (Betreiber-Entscheidung 28.08.2026):
 * XAU/CHF ist auf dem Free-Tier nicht direkt verfügbar (HTTP 404,
 * "available starting with the Grow or Venture plan"). Lösung ohne
 * Plan-Upgrade: XAU/USD × USD/CHF selbst multiplizieren. Auf der Methodik-
 * Seite (P5) ist explizit auszuweisen: (a) beide Quellreihen einzeln,
 * (b) der Umrechnungsweg, (c) dass es sich um eine ABGELEITETE Grösse
 * handelt, keine direkte/amtliche CHF-Notierung.
 *
 * Der Datenvertrags-Test (US 2.7) gilt für BEIDE Quellreihen (XAU/USD UND
 * USD/CHF), nicht nur für die Gold-Rohreihe — eine fehlerhafte
 * Wechselkursreihe würde sonst unbemerkt einen falschen CHF-Preis erzeugen.
 *
 * ═══ RATE-LIMITS (live getroffen, 28.08.2026) ═══
 * Twelve-Data-Free-Tier: 800 Abrufe/Tag UND 8 Credits/Minute (mehrere
 * schnelle Testabfragen lösten HTTP 429 aus). Dieser Bulk-Import läuft
 * SEQUENZIELL mit Pause zwischen den drei Abrufen (BTC, XAU/USD, USD/CHF)
 * — analog zur SNB-Etikette (US 1.16), obwohl Twelve Data das nicht explizit
 * vorschreibt wie die SNB (Vorsichtsprinzip nach dem live getroffenen 429).
 *
 * ═══ API-KEY ═══
 * Bevorzugt aus der Umgebungsvariable TWELVEDATA_API_KEY (GitHub-Actions-
 * Muster, siehe .github/workflows/pipeline.yml). Fallback fuer lokale/
 * manuelle Laeufe: Datei <TRUEFLATION_SECRETS_DIR>/twelvedata-api-key
 * (TRUEFLATION_SECRETS_DIR Default: ~/.openclaw/secrets).
 * NIEMALS aus Config/argv — verhindert, dass ein manipulierter
 * Aufrufparameter den Key überschreiben könnte.
 *
 * Usage:
 *   node bulk-import-twelvedata-overlays.mjs --fixture-btc-usd <pfad> --fixture-xau <pfad> --fixture-usdchf <pfad> [--dry-run]
 *   node bulk-import-twelvedata-overlays.mjs                     # echter Live-Import
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { homedir } from 'node:os';
import { fetchWhitelisted } from './lib/fetch-whitelisted.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCES_CONFIG_PATH = path.join(REPO_ROOT, 'config', 'sources.json');
const DATA_DIR = path.join(REPO_ROOT, 'data', 'overlays');
const SECRETS_DIR = process.env.TRUEFLATION_SECRETS_DIR || path.join(homedir(), '.openclaw', 'secrets');
const API_KEY_PATH = path.join(SECRETS_DIR, 'twelvedata-api-key');

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const fixtureXauPath = argVal('--fixture-xau');
const fixtureUsdChfPath = argVal('--fixture-usdchf');
const isDryRun = args.includes('--dry-run');

class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

class BulkValidationError extends Error {
  constructor(issues) {
    super(`Bulk-Validierung fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'BulkValidationError';
  }
}

function loadSourcesConfig() {
  return JSON.parse(readFileSync(SOURCES_CONFIG_PATH, 'utf-8'));
}

/**
 * CODE-REVIEW-FIX (Opus 4.8, 28.08.2026, Finding 2 — WICHTIG): Bevorzugt
 * process.env.TWELVEDATA_API_KEY (so wie der Telegram-Token im selben
 * GitHub-Actions-Workflow direkt als Env-Var an Schritte gereicht wird) —
 * das ist das etablierte Projektmuster und vermeidet den unnötigen Umweg
 * über eine lokale Klartextdatei. Fallback auf die Datei bleibt für lokale/
 * manuelle Läufe erhalten (dort ist keine Env-Var gesetzt).
 */
function loadApiKey() {
  const fromEnv = process.env.TWELVEDATA_API_KEY;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  if (!existsSync(API_KEY_PATH)) {
    throw new Error(`Twelve-Data-API-Key nicht gefunden — weder TWELVEDATA_API_KEY gesetzt noch Datei unter ${API_KEY_PATH} vorhanden. Abbruch, kein Fallback.`);
  }
  return readFileSync(API_KEY_PATH, 'utf-8').trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Datenvertrags-Test (US 2.7) — gilt für JEDE der drei Quellreihen (BTC,
 * XAU/USD, USD/CHF) identisch, da alle drei dasselbe Twelve-Data-
 * time_series-Antwortschema haben. */
function assertDataContract(json, label) {
  const issues = [];
  if (json.status === 'error') {
    issues.push(`API-Fehlerantwort: ${json.message ?? '(keine Meldung)'}`);
  } else {
    if (!json.meta || typeof json.meta !== 'object') issues.push("Fehlendes/ungültiges 'meta'-Objekt");
    if (!Array.isArray(json.values) || json.values.length === 0) issues.push("'values' ist kein nicht-leeres Array");
    else {
      const sample = json.values[0];
      for (const key of ['datetime', 'open', 'high', 'low', 'close']) {
        if (!(key in sample)) issues.push(`values[0] fehlt Feld '${key}'`);
      }
    }
  }
  if (issues.length > 0) throw new DataContractError([`${label}: ${issues.join('; ')}`]);
  console.log(`[datenvertrag/${label}] OK — ${json.values.length} Datenpunkte, erwartete Struktur vorhanden.`);
}

/** Bulk-Validierung: monotone, lückenlose Handelstage (Wochenenden/Feiertage
 * bei FX/Aktien sind normale Lücken, KEIN Fehler — anders als bei BTC, das
 * 24/7 handelt). Grobe Plausibilitätsbereiche je Reihe. */
function validateBulk(values, label, { minVal, maxVal, allowGaps }) {
  const issues = [];
  const parsed = values.map((v) => ({
    date: v.datetime,
    close: parseFloat(v.close),
  }));

  // Chronologische Sortierung sicherstellen (Twelve Data liefert i.d.R.
  // neueste zuerst — NICHT annehmen, sondern selbst sortieren).
  parsed.sort((a, b) => new Date(a.date) - new Date(b.date));

  const seen = new Set();
  for (const p of parsed) {
    if (seen.has(p.date)) issues.push(`${label}: Duplikat-Datum ${p.date}`);
    seen.add(p.date);
    if (Number.isNaN(p.close)) issues.push(`${label}: ungültiger close-Wert bei ${p.date}`);
  }

  const closes = parsed.map((p) => p.close).filter((c) => Number.isFinite(c));
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  if (min < minVal || max > maxVal) {
    issues.push(`${label}: Werte ausserhalb plausibler Grössenordnung (min=${min}, max=${max}, erwartet [${minVal}, ${maxVal}]) — Einheitenfehler-Verdacht.`);
  }

  if (!allowGaps) {
    // Nur für 24/7-Märkte (BTC) relevant — lückenlose Tagesfolge erwartet.
    for (let i = 1; i < parsed.length; i++) {
      const prev = new Date(parsed[i - 1].date);
      const cur = new Date(parsed[i].date);
      const diffDays = Math.round((cur - prev) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) issues.push(`${label}: Lücke von ${diffDays} Tagen zwischen ${parsed[i - 1].date} und ${parsed[i].date}`);
    }
  }

  if (issues.length > 0) throw new BulkValidationError(issues);
  console.log(`[bulk-validierung/${label}] OK — ${parsed.length} Punkte, Bereich [${round4(min)}, ${round4(max)}] plausibel.`);
  return parsed;
}

function round4(x) { return Math.round(x * 10000) / 10000; }

async function fetchSeries({ label, sourceCfg, fixturePath, apiKey, outputsize = 5000 }) {
  if (fixturePath) {
    console.log(`[fixture/${label}] Lade lokale Fixture: ${fixturePath} (kein Live-Abruf)`);
    return JSON.parse(readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8'));
  }
  const url = `${sourceCfg.url}&apikey=${apiKey}&outputsize=${outputsize}`;
  console.log(`[live/${label}] GET gegen: ${sourceCfg.url}&apikey=***&outputsize=${outputsize}`);
  const res = await fetchWhitelisted(url, {
    headers: { 'User-Agent': 'trueflation.ch-bulk-import/1.0 (+https://github.com/bobpeter621/trueflation-ch)' },
  });
  if (!res.ok) throw new Error(`Live-Abruf fehlgeschlagen (${label}): HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

/** BITSTAMP-SPEZIFISCH (Betreiber-Entscheidung 05.09.2026): Bitstamp braucht
 * kein apikey (oeffentlicher Marktdaten-Endpunkt), begrenzt aber `limit` hart
 * auf 1000 Datenpunkte pro Call (live verifiziert 05.09.2026, HTTP 400 bei
 * limit=1001). Fuer die volle Historie ab 2011-08-18 (~5497 Tage) braucht es
 * mehrere sequenzielle Fenster-Abrufe, aelteste zuerst, mit `start`-Parameter
 * (Unix-Timestamp). fetchWhitelisted() akzeptiert `start`/`step`/`limit` als
 * zusaetzliche Query-Parameter -- siehe lib/fetch-whitelisted.mjs
 * ALLOWED_APPENDED_PARAMS (muss dort noch erweitert werden, siehe unten). */
const BITSTAMP_MAX_LIMIT = 1000;
const BITSTAMP_STEP_SECONDS = 86400; // Tageskerzen

async function fetchBitstampBtcUsdFull({ sourceCfg, fixturePath }) {
  if (fixturePath) {
    console.log(`[fixture/BTC-USD-Bitstamp] Lade lokale Fixture: ${fixturePath} (kein Live-Abruf)`);
    return JSON.parse(readFileSync(path.resolve(REPO_ROOT, fixturePath), 'utf-8'));
  }
  const allPoints = [];
  // Verifizierter frühester Datenpunkt (05.09.2026): 2011-08-18, timestamp 1313625600.
  let cursorStart = 1313625600;
  const nowSeconds = Math.floor(Date.now() / 1000);
  let windowCount = 0;
  while (cursorStart < nowSeconds) {
    windowCount++;
    const url = `${sourceCfg.url}?step=${BITSTAMP_STEP_SECONDS}&limit=${BITSTAMP_MAX_LIMIT}&start=${cursorStart}`;
    console.log(`[live/BTC-USD-Bitstamp] Fenster ${windowCount}: GET ${sourceCfg.url}?step=${BITSTAMP_STEP_SECONDS}&limit=${BITSTAMP_MAX_LIMIT}&start=${cursorStart}`);
    const res = await fetchWhitelisted(url, {
      headers: { 'User-Agent': 'trueflation.ch-bulk-import/1.0 (+https://github.com/bobpeter621/trueflation-ch)' },
    });
    if (!res.ok) throw new Error(`Live-Abruf fehlgeschlagen (BTC-USD-Bitstamp, Fenster ${windowCount}): HTTP ${res.status} ${res.statusText}`);
    const json = await res.json();
    const points = json?.data?.ohlc ?? [];
    if (points.length === 0) break; // keine weiteren Daten -> fertig
    allPoints.push(...points);
    const lastTimestamp = Number(points[points.length - 1].timestamp);
    if (!Number.isFinite(lastTimestamp) || lastTimestamp <= cursorStart) break; // Schutz gegen Endlosschleife
    cursorStart = lastTimestamp + BITSTAMP_STEP_SECONDS;
    // Freundliche Pause zwischen Fenstern (kein dokumentiertes Rate-Limit
    // gefunden, Vorsichtsprinzip analog SNB/Twelve-Data-Etikette, US 1.16).
    await sleep(1000);
  }
  console.log(`[live/BTC-USD-Bitstamp] ${windowCount} Fenster abgerufen, ${allPoints.length} Rohpunkte gesamt.`);
  return { data: { pair: 'BTC/USD', ohlc: allPoints } };
}

/** Datenvertrags-Test fuer Bitstamp-Antwortschema (anderes Format als
 * Twelve Data -- eigene Pruefung statt assertDataContract() wiederzuverwenden,
 * das Twelve-Data-spezifische Feldnamen erwartet). */
function assertBitstampDataContract(json, label) {
  const issues = [];
  if (!json?.data || typeof json.data !== 'object') issues.push("Fehlendes/ungültiges 'data'-Objekt");
  else if (!Array.isArray(json.data.ohlc) || json.data.ohlc.length === 0) issues.push("'data.ohlc' ist kein nicht-leeres Array");
  else {
    const sample = json.data.ohlc[0];
    for (const key of ['timestamp', 'open', 'high', 'low', 'close']) {
      if (!(key in sample)) issues.push(`data.ohlc[0] fehlt Feld '${key}'`);
    }
  }
  if (issues.length > 0) throw new DataContractError([`${label}: ${issues.join('; ')}`]);
  console.log(`[datenvertrag/${label}] OK — ${json.data.ohlc.length} Datenpunkte, erwartete Struktur vorhanden.`);
}

/** Bitstamp liefert Unix-Timestamps (Sekunden) statt ISO-Datumsstrings wie
 * Twelve Data -- Normalisierung auf dasselbe 'date'/'close'-Format, das
 * validateBulk() und deriveGoldChf()-analoge Ableitung erwarten. */
function normalizeBitstampSeries(ohlcPoints) {
  return ohlcPoints.map((p) => ({
    date: new Date(Number(p.timestamp) * 1000).toISOString().slice(0, 10),
    close: parseFloat(p.close),
  }));
}

/** Multipliziert XAU/USD × USD/CHF zu Gold/CHF, NUR für Datumsstempel, die in
 * BEIDEN Reihen vorhanden sind (Schnittmenge) — unterschiedliche Handelstage
 * (Feiertage etc.) zwischen den beiden Quellen dürfen keine erfundenen
 * Werte erzeugen (Requirements-Regel 3: keine Interpolation/Erfindung). */
function deriveGoldChf(xauUsdSeries, usdChfSeries) {
  const usdChfByDate = new Map(usdChfSeries.map((p) => [p.date, p.close]));
  const derived = [];
  const skippedDates = [];
  for (const xau of xauUsdSeries) {
    const fxRate = usdChfByDate.get(xau.date);
    if (fxRate == null) {
      skippedDates.push(xau.date);
      continue; // kein Wechselkurs für dieses Datum -> kein erfundener Wert
    }
    derived.push({ date: xau.date, xauUsd: xau.close, usdChf: fxRate, goldChf: round4(xau.close * fxRate) });
  }
  if (skippedDates.length > 0) {
    console.log(`[gold-derivation] ${skippedDates.length} Datum/-Daten ohne passenden USD/CHF-Kurs übersprungen (keine Erfindung): ${skippedDates.slice(0, 5).join(', ')}${skippedDates.length > 5 ? ', ...' : ''}`);
  }
  return derived;
}

/** BITSTAMP-UMSTELLUNG (05.09.2026): Multipliziert BTC/USD (Bitstamp) ×
 * USD/CHF (Twelve Data) zu BTC/CHF -- identisches Ableitungsmuster wie
 * deriveGoldChf() (Schnittmenge der Datumsstempel, keine Erfindung fehlender
 * Tage), separate Funktion fuer klare Log-Meldungen/Nachvollziehbarkeit. */
function deriveBtcChf(btcUsdSeries, usdChfSeries) {
  const usdChfByDate = new Map(usdChfSeries.map((p) => [p.date, p.close]));
  const derived = [];
  const skippedDates = [];
  for (const btc of btcUsdSeries) {
    const fxRate = usdChfByDate.get(btc.date);
    if (fxRate == null) {
      skippedDates.push(btc.date);
      continue; // kein Wechselkurs für dieses Datum -> kein erfundener Wert
    }
    derived.push({ date: btc.date, btcUsd: btc.close, usdChf: fxRate, close: round4(btc.close * fxRate) });
  }
  if (skippedDates.length > 0) {
    console.log(`[btc-derivation] ${skippedDates.length} Datum/-Daten ohne passenden USD/CHF-Kurs übersprungen (keine Erfindung): ${skippedDates.slice(0, 5).join(', ')}${skippedDates.length > 5 ? ', ...' : ''} (Bitstamp handelt 24/7, USD/CHF nur an Bankarbeitstagen — Wochenenden/Feiertage sind erwartete Lücken, kein Fehler.)`);
  }
  return derived;
}

/**
 * SECURITY-FIX (Security-Review Durchgang 2/3, 28.08.2026, Finding F2-4 —
 * LOW): Vorherige Implementierung schrieb direkt auf die Zieldatei
 * (writeFileSync). Ein Crash/Absturz MITTEN im Schreibvorgang hätte eine
 * trunkierte, aber weiterhin öffentlich unter /data/overlays/ ausgelieferte
 * JSON-Datei hinterlassen können. Fix: atomares Schreiben über Temp-Datei +
 * renameSync (rename ist auf demselben Dateisystem atomar) — die Zieldatei
 * existiert entweder vollständig (alter Stand) oder vollständig (neuer
 * Stand), nie in einem trunkierten Zwischenzustand.
 */
function writeOutput(filename, payload) {
  if (isDryRun) {
    console.log(`[dry-run] ${filename}: kein Schreibvorgang.`);
    return;
  }
  mkdirSync(DATA_DIR, { recursive: true });
  const finalPath = path.join(DATA_DIR, filename);
  const tempPath = `${finalPath}.tmp-${process.pid}`;
  writeFileSync(tempPath, JSON.stringify(payload, null, 2) + '\n');
  renameSync(tempPath, finalPath);
  console.log(`[geschrieben] ${DATA_DIR}/${filename}`);
}

async function main() {
  console.log('=== trueflation.ch — Overlay-Bulk-Import (Gold [abgeleitet] + BTC/CHF [abgeleitet, Bitstamp x Twelve Data]) ===\n');
  console.log('SMI aus v1 gestrichen (Betreiber-Entscheidung 28.08.2026) — nicht Teil dieses Imports.\n');

  const cfg = loadSourcesConfig();
  const bitstampBtcCfg = cfg.sources['bitstamp-btc-usd'];
  const xauCfg = cfg.sources['twelvedata-xau-usd'];
  const usdChfCfg = cfg.sources['twelvedata-usd-chf'];
  if (!bitstampBtcCfg || !xauCfg || !usdChfCfg) {
    throw new Error("Quellen fehlen in config/sources.json — zuerst eintragen (Whitelist, US 1.6).");
  }

  const fixtureBtcUsdPath = argVal('--fixture-btc-usd');
  const apiKey = fixtureBtcUsdPath && fixtureXauPath && fixtureUsdChfPath ? 'unused-in-fixture-mode' : loadApiKey();

  console.log('--- BTC/USD (Bitstamp, Roh-Reihe ab 2011-08-18) ---');
  const btcUsdJson = await fetchBitstampBtcUsdFull({ sourceCfg: bitstampBtcCfg, fixturePath: fixtureBtcUsdPath });
  assertBitstampDataContract(btcUsdJson, 'BTC/USD-Bitstamp');
  const btcUsdSeriesRaw = normalizeBitstampSeries(btcUsdJson.data.ohlc);
  const btcUsdSeries = validateBulk(
    btcUsdSeriesRaw.map((p) => ({ datetime: p.date, close: p.close })),
    'BTC/USD-Bitstamp',
    { minVal: 0.01, maxVal: 10000000, allowGaps: false }
  );

  console.log('\n--- XAU/USD (Gold-Rohreihe, Zwischenschritt) ---');
  const xauJson = await fetchSeries({ label: 'XAU/USD', sourceCfg: xauCfg, fixturePath: fixtureXauPath, apiKey });
  assertDataContract(xauJson, 'XAU/USD');
  const xauSeries = validateBulk(xauJson.values, 'XAU/USD', { minVal: 100, maxVal: 20000, allowGaps: true });

  if (!fixtureXauPath) await sleep(8000);

  console.log('\n--- USD/CHF (Wechselkurs-Zwischenschritt, Datenvertrags-Test PFLICHT wie bei der Rohreihe) ---');
  const usdChfJson = await fetchSeries({ label: 'USD/CHF', sourceCfg: usdChfCfg, fixturePath: fixtureUsdChfPath, apiKey });
  assertDataContract(usdChfJson, 'USD/CHF');
  const usdChfSeries = validateBulk(usdChfJson.values, 'USD/CHF', { minVal: 0.5, maxVal: 2.0, allowGaps: true });

  console.log('\n--- BTC/CHF ABLEITEN (Bitstamp BTC/USD × Twelve-Data USD/CHF) ---');
  const btcChfDerived = deriveBtcChf(btcUsdSeries, usdChfSeries);
  console.log(`[btc-derivation] ${btcChfDerived.length} Datenpunkte mit vollständigem Quellenpaar abgeleitet.`);

  console.log('\n--- Gold/CHF ABLEITEN (XAU/USD × USD/CHF) ---');
  const goldChfDerived = deriveGoldChf(xauSeries, usdChfSeries);
  console.log(`[gold-derivation] ${goldChfDerived.length} Datenpunkte mit vollständigem Quellenpaar abgeleitet.`);

  writeOutput('btc-chf-daily.json', {
    _comment:
      'Automatisch generiert durch bulk-import-twelvedata-overlays.mjs. ABGELEITETE Grösse ' +
      '(Betreiber-Entscheidung 05.09.2026, BTC-Quellenumstellung): Bitstamp liefert kein direktes ' +
      'BTC/CHF-Paar (verifiziert 05.09.2026) — btcChf = btcUsd (Bitstamp) * usdChf (Twelve Data), NUR ' +
      'für Datumsstempel mit vollständigem Quellenpaar (keine Interpolation, Requirements-Regel 3). ' +
      'Historie ab 2011-08-18 (Bitstamp) statt vorher 2021-01-31 (direkter Twelve-Data-Feed).',
    methodology: 'btcChf(t) = btcUsd(t) * usdChf(t)',
    sourceUrlBtcUsd: bitstampBtcCfg.url,
    sourceUrlUsdChf: usdChfCfg.url,
    isDerivedQuantity: true,
    importedAt: new Date().toISOString(),
    importType: 'bulk',
    unit: 'CHF (abgeleitet)',
    values: btcChfDerived,
  });

  writeOutput('gold-chf-daily-derived.json', {
    _comment:
      'Automatisch generiert durch bulk-import-twelvedata-overlays.mjs. ABGELEITETE Grösse ' +
      '(Betreiber-Entscheidung 28.08.2026): keine direkte/amtliche CHF-Notierung für Gold auf dem ' +
      'Twelve-Data-Free-Tier verfügbar (XAU/CHF liefert HTTP 404, kostenpflichtiger Plan nötig). ' +
      'goldChf = xauUsd * usdChf, NUR für Datumsstempel mit vollständigem Quellenpaar (keine ' +
      'Interpolation für fehlende Tage, Requirements-Regel 3).',
    methodology: 'goldChf(t) = xauUsd(t) * usdChf(t)',
    sourceUrlXauUsd: xauCfg.url,
    sourceUrlUsdChf: usdChfCfg.url,
    isDerivedQuantity: true,
    importedAt: new Date().toISOString(),
    importType: 'bulk',
    unit: 'CHF (abgeleitet)',
    values: goldChfDerived,
  });

  console.log('\n=== Bulk-Import abgeschlossen ===');
}

main().catch((err) => {
  console.error(`FEHLER: ${err.message}`);
  process.exit(1);
});
