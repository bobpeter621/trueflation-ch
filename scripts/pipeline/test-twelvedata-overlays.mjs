#!/usr/bin/env node
/**
 * trueflation.ch — Twelve-Data-Overlay-Import: Datenvertrag + Negativtests (P4, US 2.7)
 *
 * Prüft die Kernlogik aus bulk-import-twelvedata-overlays.mjs isoliert
 * (ohne Live-Netzwerkabruf): Datenvertrags-Verletzungen müssen erkannt
 * werden, die Gold-Ableitung darf NIEMALS einen Wert für ein Datum
 * erfinden, für das keine passende Wechselkurs-Gegenbuchung existiert
 * (Requirements-Regel 3: keine erfundenen Zahlen).
 */

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

// Re-Implementierung der zu testenden Funktionen (nicht exportiert aus dem
// CLI-orientierten Skript) — identische Logik, isoliert testbar.
class DataContractError extends Error {
  constructor(issues) {
    super(`Datenvertrags-Test fehlgeschlagen:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DataContractError';
  }
}

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
  return true;
}

function round4(x) { return Math.round(x * 10000) / 10000; }

function deriveGoldChf(xauUsdSeries, usdChfSeries) {
  const usdChfByDate = new Map(usdChfSeries.map((p) => [p.date, p.close]));
  const derived = [];
  const skippedDates = [];
  for (const xau of xauUsdSeries) {
    const fxRate = usdChfByDate.get(xau.date);
    if (fxRate == null) {
      skippedDates.push(xau.date);
      continue;
    }
    derived.push({ date: xau.date, xauUsd: xau.close, usdChf: fxRate, goldChf: round4(xau.close * fxRate) });
  }
  return { derived, skippedDates };
}

// BITSTAMP-UMSTELLUNG (05.09.2026): Re-Implementierung von deriveBtcChf()
// aus bulk-import-twelvedata-overlays.mjs, identische Logik wie deriveGoldChf,
// isoliert testbar (analog zum bestehenden Testmuster dieser Datei).
function deriveBtcChf(btcUsdSeries, usdChfSeries) {
  const usdChfByDate = new Map(usdChfSeries.map((p) => [p.date, p.close]));
  const derived = [];
  const skippedDates = [];
  for (const btc of btcUsdSeries) {
    const fxRate = usdChfByDate.get(btc.date);
    if (fxRate == null) {
      skippedDates.push(btc.date);
      continue;
    }
    derived.push({ date: btc.date, btcUsd: btc.close, usdChf: fxRate, close: round4(btc.close * fxRate) });
  }
  return { derived, skippedDates };
}

// BITSTAMP-UMSTELLUNG (05.09.2026): Re-Implementierung von
// assertBitstampDataContract() aus bulk-import-twelvedata-overlays.mjs --
// anderes Antwortschema als Twelve Data (data.ohlc statt values, timestamp
// statt datetime), eigene Pruefung noetig.
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
  return true;
}

async function main() {
  console.log('=== trueflation.ch — Twelve-Data-Overlays: Datenvertrag + Negativtests (US 2.7) ===\n');

  // --- Test 1: Positivfall, gültige Twelve-Data-Antwort ---
  console.log('--- Test 1: Positivfall (gültige Struktur) ---');
  const validResponse = {
    meta: { symbol: 'BTC/CHF', interval: '1day' },
    values: [{ datetime: '2026-08-28', open: '64000', high: '65000', low: '63000', close: '64500' }],
    status: 'ok',
  };
  try {
    assertDataContract(validResponse, 'BTC/CHF');
    report('Test 1: gültige Antwort wird akzeptiert', true);
  } catch (err) {
    report('Test 1: gültige Antwort wird akzeptiert', false, err.message);
  }

  // --- Test 2 (NEGATIV): API-Fehlerantwort (z.B. SMI-404-Fall) muss erkannt werden ---
  console.log('\n--- Test 2 (NEGATIV): API-Fehlerantwort wird erkannt, nicht stillschweigend als leere Reihe behandelt ---');
  const errorResponse = { code: 404, message: "This symbol is available starting with the Pro or Venture plan.", status: 'error' };
  try {
    assertDataContract(errorResponse, 'SMI');
    report('Test 2: API-Fehlerantwort wird erkannt', false, 'hat NICHT geworfen');
  } catch (err) {
    report('Test 2: API-Fehlerantwort wird erkannt', err instanceof DataContractError, err.message.split('\n')[0]);
  }

  // --- Test 3 (NEGATIV): fehlendes Pflichtfeld in values[0] ---
  console.log('\n--- Test 3 (NEGATIV): fehlendes Pflichtfeld (z.B. "close") wird erkannt ---');
  const missingFieldResponse = {
    meta: { symbol: 'XAU/USD' },
    values: [{ datetime: '2026-08-28', open: '4000', high: '4100', low: '3900' }], // close fehlt
    status: 'ok',
  };
  try {
    assertDataContract(missingFieldResponse, 'XAU/USD');
    report('Test 3: fehlendes Feld wird erkannt', false, 'hat NICHT geworfen');
  } catch (err) {
    report('Test 3: fehlendes Feld wird erkannt', err.message.includes('close'), err.message.split('\n')[1] ?? err.message);
  }

  // --- Test 4 (NEGATIV): leeres values-Array ---
  console.log('\n--- Test 4 (NEGATIV): leeres values-Array wird erkannt ---');
  const emptyResponse = { meta: { symbol: 'BTC/CHF' }, values: [], status: 'ok' };
  try {
    assertDataContract(emptyResponse, 'BTC/CHF');
    report('Test 4: leeres Array wird erkannt', false, 'hat NICHT geworfen');
  } catch (err) {
    report('Test 4: leeres Array wird erkannt', true, err.message.split('\n')[1] ?? err.message);
  }

  // --- Test 5 (KERNFALL): Gold-Ableitung erfindet KEINE Werte für fehlende Wechselkurstage ---
  console.log('\n--- Test 5 (KERNFALL, Requirements-Regel 3): Gold-Ableitung erfindet keine Werte ---');
  const xauSeries = [
    { date: '2026-08-25', close: 4000 },
    { date: '2026-08-26', close: 4010 },
    { date: '2026-08-27', close: 4020 }, // KEIN passender USD/CHF-Kurs unten
    { date: '2026-08-28', close: 4030 },
  ];
  const usdChfSeries = [
    { date: '2026-08-25', close: 0.80 },
    { date: '2026-08-26', close: 0.81 },
    // 2026-08-27 fehlt absichtlich (simuliert Feiertag/Lücke einer der beiden Quellen)
    { date: '2026-08-28', close: 0.805 },
  ];
  const { derived, skippedDates } = deriveGoldChf(xauSeries, usdChfSeries);
  report('Test 5: genau 3 von 4 Tagen abgeleitet (nicht 4)', derived.length === 3, `tatsächlich: ${derived.length}`);
  report('Test 5: der Tag ohne Wechselkurs-Gegenbuchung wird übersprungen, nicht interpoliert', skippedDates.includes('2026-08-27'), `übersprungen: ${skippedDates.join(', ')}`);
  report('Test 5: kein Eintrag für 2026-08-27 im Ergebnis (kein erfundener Wert)', !derived.some((d) => d.date === '2026-08-27'));
  const day1 = derived.find((d) => d.date === '2026-08-25');
  report('Test 5: Multiplikation korrekt (4000 * 0.80 = 3200)', day1 && day1.goldChf === 3200, `tatsächlich: ${day1?.goldChf}`);

  // --- Test 6 (KERNFALL, BTC-Umstellung 05.09.2026): BTC-Ableitung erfindet KEINE Werte für fehlende Wechselkurstage ---
  console.log('\n--- Test 6 (KERNFALL, BTC-Umstellung): Bitstamp-BTC-Ableitung erfindet keine Werte ---');
  const btcUsdSeries = [
    { date: '2026-08-25', close: 100000 },
    { date: '2026-08-26', close: 101000 },
    { date: '2026-08-27', close: 102000 }, // KEIN passender USD/CHF-Kurs unten (Bitstamp handelt 24/7, USD/CHF nicht am Wochenende)
    { date: '2026-08-28', close: 103000 },
  ];
  const usdChfSeriesForBtc = [
    { date: '2026-08-25', close: 0.80 },
    { date: '2026-08-26', close: 0.81 },
    // 2026-08-27 fehlt absichtlich (simuliert Wochenende/Feiertag der FX-Quelle)
    { date: '2026-08-28', close: 0.805 },
  ];
  const btcResult = deriveBtcChf(btcUsdSeries, usdChfSeriesForBtc);
  report('Test 6: genau 3 von 4 Tagen abgeleitet (nicht 4)', btcResult.derived.length === 3, `tatsächlich: ${btcResult.derived.length}`);
  report('Test 6: der Tag ohne Wechselkurs-Gegenbuchung wird übersprungen, nicht interpoliert', btcResult.skippedDates.includes('2026-08-27'), `übersprungen: ${btcResult.skippedDates.join(', ')}`);
  report('Test 6: kein Eintrag für 2026-08-27 im Ergebnis (kein erfundener Wert)', !btcResult.derived.some((d) => d.date === '2026-08-27'));
  const btcDay1 = btcResult.derived.find((d) => d.date === '2026-08-25');
  report('Test 6: Multiplikation korrekt (100000 * 0.80 = 80000)', btcDay1 && btcDay1.close === 80000, `tatsächlich: ${btcDay1?.close}`);

  // --- Test 7 (NEGATIV, Bitstamp-Schema): fehlendes Pflichtfeld im OHLC-Datenvertrag ---
  console.log('\n--- Test 7 (NEGATIV): Bitstamp-Antwort mit fehlendem Pflichtfeld wird erkannt ---');
  const bitstampMissingField = { data: { pair: 'BTC/USD', ohlc: [{ timestamp: '1313625600', open: '10.90', high: '10.90', low: '10.90' }] } }; // close fehlt
  try {
    assertBitstampDataContract(bitstampMissingField, 'BTC/USD-Bitstamp');
    report('Test 7: fehlendes Feld (close) wird erkannt', false, 'hat NICHT geworfen');
  } catch (err) {
    report('Test 7: fehlendes Feld (close) wird erkannt', err.message.includes('close'), err.message.split('\n')[1] ?? err.message);
  }

  // --- Test 8 (NEGATIV, Bitstamp-Schema): leeres ohlc-Array ---
  console.log('\n--- Test 8 (NEGATIV): leeres Bitstamp-ohlc-Array wird erkannt ---');
  const bitstampEmpty = { data: { pair: 'BTC/USD', ohlc: [] } };
  try {
    assertBitstampDataContract(bitstampEmpty, 'BTC/USD-Bitstamp');
    report('Test 8: leeres ohlc-Array wird erkannt', false, 'hat NICHT geworfen');
  } catch (err) {
    report('Test 8: leeres ohlc-Array wird erkannt', true, err.message.split('\n')[1] ?? err.message);
  }

  console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
