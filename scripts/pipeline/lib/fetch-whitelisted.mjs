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
/** SECURITY-FIX (Security-Review 05.09.2026, Kimi + Sonnet pass@2,
 * Testinfrastruktur): Testbarer Override fuer den Whitelist-Pfad, analog
 * zum bestehenden Muster plausiStateDir/approvalLogPath in anderen Modulen
 * (Tests duerfen den echten Produktivzustand nicht beruehren). Nur per
 * Umgebungsvariable, NICHT dokumentiert als Public API -- Produktivcode
 * setzt diese Variable nie, ausschliesslich Testskripte tun das. */
const SOURCES_CONFIG_PATH = process.env.TRUEFLATION_SOURCES_CONFIG_PATH
  || path.join(REPO_ROOT, 'config', 'sources.json');

/** SECURITY-FIX (Security-Review Durchgang 1/3, 28.08.2026, Finding F-1 —
 * LOW): Die ursprüngliche Fehlermeldung enthielt die VOLLE URL inkl.
 * Query-String — bei Twelve-Data-URLs also inkl. `apikey=<echter Key>`.
 * Im Fehlerfall (z.B. Config-Drift) landet das via console.error in
 * CI-Logs. GitHub Actions maskiert das exakte Secret zwar zusätzlich, aber
 * das ist nur EIN Schutzwall, kein Grund, den Key trotzdem in die
 * Fehlermeldung zu schreiben. Fix: nur origin+pathname loggen, niemals den
 * Query-String (der Query-String ist ohnehin nicht nötig, um den Fehler zu
 * diagnostizieren — origin+pathname identifiziert die Quelle eindeutig). */
function redactUrlForLogging(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname} (Query-String redigiert, siehe Code-Kommentar)`;
  } catch {
    return '(URL nicht parsebar)';
  }
}

export class WhitelistViolationError extends Error {
  constructor(url) {
    super(`SSRF-Schutz: URL nicht in config/sources.json whitelisted, Abruf verweigert: ${redactUrlForLogging(url)}`);
    this.name = 'WhitelistViolationError';
    this.url = url; // volle URL bleibt am Error-Objekt verfuegbar fuer Code, der sie braucht (nicht fuer Logging)
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
 * (nicht aus Nutzereingabe, sondern aus Code-konstanten Datumsangaben oder dem
 * lokalen Secrets-Pfad) — kein SSRF-Risiko, da Host/Pfad weiterhin exakt aus
 * der Whitelist stammen müssen.
 *
 * ERWEITERUNG (P4, 28.08.2026, Twelve-Data-Overlays): 'apikey' (Wert kommt
 * AUSSCHLIESSLICH aus der Umgebungsvariable TWELVEDATA_API_KEY bzw. der
 * Datei <TRUEFLATION_SECRETS_DIR>/twelvedata-api-key — siehe
 * bulk-import-twelvedata-overlays.mjs loadApiKey() — niemals aus
 * Nutzereingabe/Config) und 'outputsize' (numerische Datenpunkt-Obergrenze
 * pro Abruf, Twelve-Data-Free-Tier-Limit 5000).
 *
 * SECURITY-FIX (Security-Review Durchgang 3/3 Retry, 28.08.2026, Finding
 * F3-2 — LOW): 'start_date'/'end_date' waren ursprünglich mit vorgesehen
 * (analog fromDate/toDate bei SNB), werden aber vom aktuellen Twelve-Data-
 * Bulk-Import (bulk-import-twelvedata-overlays.mjs) GAR NICHT verwendet —
 * nur 'outputsize' steuert dort die Datenmenge. Eine freigeschaltete, aber
 * ungenutzte UND ungetestete Parameter-Klasse ist eine tote Berechtigung
 * ohne Nutzen und verletzt die Negativtest-Pflicht des Projekts (jeder
 * erlaubte Parameter braucht einen Beweis, dass er sicher ist). Entfernt,
 * bis ein tatsächlicher Bedarf (z.B. ein künftiges Datumsfenster-Feature)
 * mit eigenem Positiv-/Negativtest entsteht. */
const ALLOWED_APPENDED_PARAMS = new Set(['fromDate', 'toDate', 'apikey', 'outputsize', 'start', 'step', 'limit']);
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** apikey: nicht auf ein festes Format prüfbar (Anbieter-spezifisch), aber
 * MUSS nicht-leer und darf keine URL-Struktur-Zeichen enthalten (verhindert,
 * dass ein manipulierter 'apikey'-Wert selbst eine weitere URL/einen Pfad
 * einschleust). outputsize: rein numerisch, Obergrenze durch das Free-Tier-
 * Limit selbst begrenzt (Validierung hier nur Format, nicht Geschäftslogik). */
const SAFE_OPAQUE_PARAM_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const POSITIVE_INT_PATTERN = /^[1-9]\d*$/;
// Twelve-Data-Free-Tier-Limit (verifiziert 28.08.2026): max. 5000 Datenpunkte
// pro Abruf. Bug gefunden im eigenen Negativtest: ein reiner Ziffern-Regex
// haette outputsize=99999 durchgelassen (5-stellig, aber weit ueber dem
// Limit) — jetzt echte Obergrenzenpruefung statt nur Formatpruefung.
const MAX_OUTPUT_SIZE = 5000;
/** BITSTAMP-ERWEITERUNG (05.09.2026, BTC-Quellenumstellung): 'start' ist ein
 * Unix-Timestamp (Sekunden) fuer den paginierten OHLC-Bulk-Import, 'step'
 * die Kerzenbreite in Sekunden (Code-Konstante 86400 = Tageskerzen, siehe
 * bulk-import-twelvedata-overlays.mjs BITSTAMP_STEP_SECONDS), 'limit' die
 * Punktzahl pro Abruf (serverseitig hart auf 1000 begrenzt, verifiziert
 * 05.09.2026 -- Obergrenze hier trotzdem zusaetzlich durchgesetzt, analog
 * zu outputsize/MAX_OUTPUT_SIZE, nicht nur der Quelle vertraut). Keine
 * Nutzereingabe -- alle drei Werte sind Code-Konstanten/abgeleitete Werte
 * aus einem vorherigen Response-Timestamp, kein SSRF-Risiko. */
const UNIX_TIMESTAMP_PATTERN = /^[1-9]\d{0,10}$/; // bis Jahr ~2286, ausreichend
const BITSTAMP_MAX_LIMIT = 1000;
const BITSTAMP_ALLOWED_STEPS = new Set(['86400']); // nur Tageskerzen, kein anderer Wert getestet/gebraucht

function isValidAppendedParamValue(key, value) {
  if (key === 'fromDate' || key === 'toDate') {
    return DATE_PARAM_PATTERN.test(value);
  }
  if (key === 'apikey') {
    return SAFE_OPAQUE_PARAM_PATTERN.test(value);
  }
  if (key === 'outputsize') {
    return POSITIVE_INT_PATTERN.test(value) && Number(value) <= MAX_OUTPUT_SIZE;
  }
  if (key === 'start') {
    return UNIX_TIMESTAMP_PATTERN.test(value);
  }
  if (key === 'step') {
    return BITSTAMP_ALLOWED_STEPS.has(value);
  }
  if (key === 'limit') {
    return POSITIVE_INT_PATTERN.test(value) && Number(value) <= BITSTAMP_MAX_LIMIT;
  }
  return false;
}

/**
 * Prüft, ob url entweder exakt whitelisted ist, ODER ob die whitelisted-Basis-URL
 * (ohne zusätzliche fromDate/toDate-Parameter) mit url übereinstimmt und die
 * zusätzlichen Parameter ausschliesslich aus ALLOWED_APPENDED_PARAMS mit
 * validem Datumsformat bestehen.
 */
/** SECURITY-FIX (Security-Review 05.09.2026, Finding 1.3, MEDIUM): Requirement
 * 5 verlangt HTTPS/TLS ohne Ausnahme. Die bisherige Pruefung akzeptierte JEDES
 * Scheme, solange Origin+Pathname matchten -- ein versehentlich als http://
 * eingetragener Whitelist-Eintrag waere unverschluesselt akzeptiert worden.
 * Ausnahme NUR fuer localhost/127.0.0.1 (Testinfrastruktur, siehe
 * test-whitelist-hardening.mjs) -- Produktivquellen sind ausschliesslich https. */
function isHttpsOrLocalTest(parsedUrl) {
  if (parsedUrl.protocol === 'https:') return true;
  const isLocal = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
  return parsedUrl.protocol === 'http:' && isLocal;
}

function isWhitelistedWithDateRange(url, whitelisted) {
  let parsedForScheme;
  try {
    parsedForScheme = new URL(url);
  } catch {
    return false;
  }
  if (!isHttpsOrLocalTest(parsedForScheme)) return false;

  if (whitelisted.has(url)) return true;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // SECURITY-FIX (Security-Review Durchgang 1/3, 28.08.2026, Finding F-2 —
  // LOW/MEDIUM, Defense-in-Depth): Doppelte Query-Parameter (z.B.
  // ?symbol=BTC/CHF&symbol=SMI) wurden bisher NICHT abgelehnt — die
  // Basis-Parameter-Prüfung unten nutzt `searchParams.get(key)`, das nur
  // das ERSTE Vorkommen liefert. Ein zweites, abweichendes Vorkommen desselben
  // Schlüssels würde die Prüfung unbemerkt passieren, obwohl je nach
  // Server-Interpretation (manche APIs werten "last wins") der TATSÄCHLICH
  // angefragte Wert ein anderer wäre als der geprüfte — ein Policy-Bypass.
  // Aktuell nicht ausnutzbar (URL-Strings sind Code-Konstanten, keine
  // Nutzereingabe), aber ein echtes Lücke im Negativtest-Versprechen dieses
  // Moduls. Fix: JEDE Duplikation eines Parameter-Schlüssels lehnt die
  // gesamte URL pauschal ab, bevor irgendeine weitere Prüfung läuft.
  const seenKeys = new Set();
  for (const key of parsed.searchParams.keys()) {
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
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
    // dürfen NUR aus ALLOWED_APPENDED_PARAMS mit jeweils validem Format bestehen
    // (siehe isValidAppendedParamValue — unterschiedliche Formate je Parameter).
    let extraParamsValid = true;
    for (const [key, value] of parsed.searchParams) {
      if (wParsed.searchParams.has(key)) continue; // schon oben geprüft
      if (!ALLOWED_APPENDED_PARAMS.has(key) || !isValidAppendedParamValue(key, value)) {
        extraParamsValid = false;
        break;
      }
    }
    if (extraParamsValid) return true;
  }
  return false;
}

/**
 * DoS-Schutzschwelle (Security-Review, 28.08.2026, Finding "keine
 * Grössenlimits bei externen Responses"): Verteidigung in der Tiefe gegen
 * eine kompromittierte/fehlerhafte Quelle, die eine ungewöhnlich grosse
 * Antwort liefert (Speicher-Exhaustion beim spaeteren Volltext-Einlesen via
 * res.text()/res.json()). Reale Antworten dieses Projekts liegen im
 * niedrigen MB-Bereich (LIK-App-State ~190KB, siehe config/sources.json).
 * Nur als Content-Length-Vorabprüfung wirksam (Angreifer mit Kontrolle
 * ueber Response-Header koennte diesen Header weglassen/fälschen) — kein
 * Ersatz fuer serverseitige Limits, aber ein kostenloser erster Schutzwall.
 */
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024; // 100 MB

/** SECURITY-FIX (Security-Review 05.09.2026, Finding 1.4, MEDIUM): Ohne
 * Timeout blockiert ein haengender Server (Netzwerk-Fehlkonfiguration,
 * kompromittierte Quelle, langsamer Angriff) die Pipeline unbegrenzt --
 * in GitHub Actions bedeutet das im schlimmsten Fall ein Fest-haengen bis
 * zum Job-Timeout (Minuten statt Sekunden), in einem manuellen Lauf
 * potenziell unbegrenzt. 20 Sekunden sind grosszuegig fuer die realen
 * Quellen dieses Projekts (LIK-Antwort ~190KB, siehe config/sources.json). */
const FETCH_TIMEOUT_MS = 20_000;

/** SECURITY-FIX (Security-Review 05.09.2026, Finding 1.1, MEDIUM, WICHTIGSTER
 * FUND): fetch() folgt Redirects (301/302/307/308) per Default OHNE die
 * Whitelist erneut zu pruefen. Eine kompromittierte/gehijackte whitelisted
 * Quelle (DNS-Hijack, Open Redirect, kaputtes CDN) koennte per 3xx auf
 * http://169.254.169.254/... (Cloud-Metadata-Endpunkt, in GitHub-Actions-
 * Runnern real erreichbar!) oder ein beliebiges internes Ziel umleiten --
 * der SSRF-Schutz waere fuer diesen Pfad wirkungslos. Fix: redirect: 'manual'
 * setzen und jede Location-URL rekursiv erneut durch isWhitelistedWithDateRange
 * pruefen, bevor ihr gefolgt wird. Redirect-Kette auf 5 begrenzt (Schutz
 * gegen Redirect-Loops als Nebeneffekt). */
const MAX_REDIRECTS = 5;

async function fetchWhitelistedOnce(url, options, whitelisted) {
  if (!isWhitelistedWithDateRange(url, whitelisted)) {
    throw new WhitelistViolationError(url);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...options, redirect: 'manual', signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Anfrage nach ${FETCH_TIMEOUT_MS}ms abgebrochen (Timeout) bei ${redactUrlForLogging(url)} — Abruf verweigert.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  return res;
}

/** SECURITY-FIX (Security-Review 05.09.2026, Finding 1.2, MEDIUM): Der
 * bisherige DoS-Schutz vertraute ausschliesslich dem Content-Length-Header
 * -- bei chunked Transfer-Encoding (kein Content-Length-Header) oder einem
 * absichtlich gefaelschten/fehlenden Header griff die Pruefung NICHT.
 * Fix: Response-Body wird gestreamt (ReadableStream-Reader) und die
 * tatsaechlich empfangene Bytezahl waehrend des Lesens gezaehlt -- ueberschreitet
 * sie MAX_RESPONSE_BYTES, wird der Stream sofort abgebrochen (res.body.cancel()),
 * bevor mehr Speicher belegt wird. Das gestreamte Ergebnis wird als neue
 * Response mit identischen Headern/Status zurueckgegeben, damit Aufrufer
 * (die .json()/.text() erwarten) unveraendert weiterarbeiten koennen. */
async function enforceStreamingSizeLimit(res, url) {
  if (!res.body) return res;
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(
        `Antwort überschreitet DoS-Schutzschwelle (${MAX_RESPONSE_BYTES} Bytes) beim Streamen ` +
        `(mehr als ${MAX_RESPONSE_BYTES} Bytes tatsächlich empfangen, unabhängig vom Content-Length-Header) ` +
        `bei ${redactUrlForLogging(url)} — Abruf verweigert.`
      );
    }
    chunks.push(value);
  }
  const body = chunks.length ? new Blob(chunks) : undefined;
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export async function fetchWhitelisted(url, options = {}) {
  const whitelisted = loadWhitelistedUrls();
  let currentUrl = url;
  let res;

  for (let redirectCount = 0; ; redirectCount++) {
    if (redirectCount > MAX_REDIRECTS) {
      throw new Error(`Zu viele Redirects (>${MAX_REDIRECTS}) ausgehend von ${redactUrlForLogging(url)} — Abruf verweigert.`);
    }
    res = await fetchWhitelistedOnce(currentUrl, options, whitelisted);
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const location = new URL(res.headers.get('location'), currentUrl).toString();
      // Jede Redirect-Ziel-URL MUSS erneut die volle Whitelist-Prüfung
      // durchlaufen (isWhitelistedWithDateRange via fetchWhitelistedOnce) --
      // kein automatisches Folgen auf ein nicht geprüftes Ziel.
      currentUrl = location;
      continue;
    }
    break;
  }

  const contentLength = res.headers?.get?.('content-length');
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error(
      `Antwort überschreitet DoS-Schutzschwelle (${MAX_RESPONSE_BYTES} Bytes): ` +
      `Content-Length=${contentLength} bei ${redactUrlForLogging(currentUrl)} — Abruf verweigert.`
    );
  }

  return enforceStreamingSizeLimit(res, currentUrl);
}
