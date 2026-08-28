#!/usr/bin/env node
/**
 * trueflation.ch — Link-Format-Verifikation in Plausi-Eskalationsnachrichten
 * (US 1.7, Fix 4)
 *
 * FUND (Betreiber, 28.08.2026): Ein früherer Fix hatte NICHT gehalten —
 * Beobachtung "...masterWert" zeigte zwei Steuerzeichen (U+FFFC) plus das
 * Wort "Wert" im verlinkten Ziel. Der Text NACH der URL wurde ins Linkziel
 * gezogen.
 *
 * ROBUSTE LÖSUNG (siehe lib/plausibility-check.mjs, buildEscalationMessage):
 * URL auf eigener Zeile, Leerzeile davor UND danach, kein Markup, keine
 * Steuerzeichen in der Nähe. Dieser Test verifiziert die STRUKTUR der
 * erzeugten Nachricht direkt (nicht nur "irgendein Link ist drin").
 */

import { checkPlausibility } from './lib/plausibility-check.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function main() {
  console.log('=== trueflation.ch — Link-Format-Verifikation (US 1.7, Fix 4) ===\n');

  const stateDir = mkdtempSync(path.join(tmpdir(), 'trueflation-link-test-'));
  try {
    let capturedMessage = null;
    const captureNotify = (msg) => {
      capturedMessage = msg;
      return true;
    };

    // Testfall bewusst mit einem sourceUrl, das dem realen Fundort ähnelt
    // (BFS DAM-Master-Asset, endet auf "master" — genau das Suffix, das im
    // Fund "...masterWert" betroffen war).
    const testUrl = 'https://dam-api.bfs.admin.ch/hub/api/dam/assets/orderNr:ds-q-05.02-lik-app-state/master';

    checkPlausibility({
      sourceKey: 'test-link-format',
      oldValue: 108.2,
      newValue: 118.5,
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: testUrl,
      notifyFn: captureNotify,
      plausiStateDir: stateDir,
    });

    report('Nachricht wurde erzeugt', capturedMessage !== null);

    const lines = capturedMessage.split('\n');
    const urlLineIndex = lines.findIndex((l) => l.trim() === testUrl);

    report('URL erscheint als EIGENSTÄNDIGE Zeile (kein Prefix/Suffix in derselben Zeile)', urlLineIndex !== -1, `gefunden bei Zeile ${urlLineIndex}`);

    if (urlLineIndex !== -1) {
      const lineBefore = lines[urlLineIndex - 1];
      const lineAfter = lines[urlLineIndex + 1];
      report('Zeile VOR der URL ist eine Leerzeile', lineBefore === '', `tatsächlich: ${JSON.stringify(lineBefore)}`);
      report('Zeile NACH der URL ist eine Leerzeile', lineAfter === '', `tatsächlich: ${JSON.stringify(lineAfter)}`);
    }

    // Kernfall des ursprünglichen Funds: Text direkt NACH der URL, ohne
    // Trennzeichen, der ins Linkziel gezogen werden könnte.
    const urlIndexInFullString = capturedMessage.indexOf(testUrl);
    const charsAfterUrl = capturedMessage.slice(urlIndexInFullString + testUrl.length, urlIndexInFullString + testUrl.length + 5);
    report(
      'Direkt nach der URL folgt sofort ein Zeilenumbruch (kein Text/Steuerzeichen unmittelbar anschliessend)',
      charsAfterUrl.startsWith('\n'),
      `Zeichen nach URL: ${JSON.stringify(charsAfterUrl)}`
    );

    // Keine Steuerzeichen (insbesondere U+FFFC, das exakte Zeichen aus dem Fund) irgendwo in der Nachricht.
    // eslint-disable-next-line no-control-regex
    const controlCharPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFF9-\uFFFC]/;
    report('Keine Steuerzeichen (insbes. U+FFFC) in der gesamten Nachricht', !controlCharPattern.test(capturedMessage));

    // Kein Markup/Präfix unmittelbar vor der URL in derselben Zeile (z.B. "Quelle: <url>").
    report('Kein Text-Präfix in der URL-Zeile selbst', lines[urlLineIndex] === testUrl, `Zeileninhalt: ${JSON.stringify(lines[urlLineIndex])}`);

    // Regressionstest: Steuerzeichen IM sourceKey (simuliert eine Quelle mit
    // korrupten Zeichen) dürfen nicht in die Nähe der URL durchsickern.
    console.log('\n--- Regressionstest: Steuerzeichen im sourceKey werden gefiltert ---');
    let capturedMessage2 = null;
    checkPlausibility({
      sourceKey: 'test-dirty-key\uFFFC\uFFFC',
      oldValue: 108.2,
      newValue: 118.5,
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: testUrl,
      notifyFn: (msg) => { capturedMessage2 = msg; return true; },
      plausiStateDir: stateDir,
    });
    report('Steuerzeichen aus sourceKey werden aus der Nachricht entfernt', !controlCharPattern.test(capturedMessage2));
    const url2Index = capturedMessage2.split('\n').findIndex((l) => l.trim() === testUrl);
    report('URL bleibt auch bei korruptem sourceKey eigenständige Zeile', url2Index !== -1);

    console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

main();
