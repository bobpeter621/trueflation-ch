/**
 * trueflation.ch — Plausibilitätsprüfung (US 1.7, produktiv)
 *
 * Zwei Prüfarten gemäss Requirements US 1.7:
 *   1. Bereichsprüfung: liegt der Wert im konfigurierten absoluten Bereich?
 *   2. Sprungprüfung: liegt die Änderungsrate ggü. dem letzten Wert unter
 *      dem quellenspezifischen Schwellwert?
 *
 * AC "erwartete Sprünge nicht fälschlich eskalieren" (Requirements US 1.7):
 * LIK-Rebasierung und provisorischer KVPI-Wert sind der Prüfung als
 * erwartete Regelvorgänge bekannt zu machen — als expectedJumpReasons
 * übergebbar, unterdrückt die Eskalation für diesen einen Aufruf.
 *
 * Bei Überschreitung: Wert wird NICHT automatisch übernommen, sondern über
 * den bestehenden Telegram-Kanal mit strukturiertem Kontext eskaliert
 * (Kennzahl, alter Wert, neuer Wert, Abweichung in %, Link zur Quelle).
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function defaultNotify(message) {
  try {
    execSync(`bash "${path.join(REPO_ROOT, 'scripts', 'notify-telegram.sh')}" "${message.replace(/"/g, '\\"')}"`, {
      stdio: 'pipe',
    });
    return true;
  } catch (err) {
    console.error(`[plausi/notify] Telegram-Versand fehlgeschlagen: ${err.message}`);
    return false;
  }
}

/**
 * @param {object} params
 * @param {string} params.sourceKey - z.B. "lik-total-index"
 * @param {number} params.oldValue
 * @param {number} params.newValue
 * @param {{min: number, max: number}} params.absoluteRange
 * @param {number} params.maxChangeRatePercent
 * @param {string} params.sourceUrl - für den strukturierten Eskalations-Kontext
 * @param {boolean} [params.expectedJump=false] - Rebasierung/provisorische Revision (US 1.7 AC)
 * @param {string} [params.expectedJumpReason]
 * @param {(msg: string) => boolean} [params.notifyFn]
 * @returns {{status: 'ok'|'range-violation'|'jump-violation'|'expected-jump', changePercent: number}}
 */
export function checkPlausibility({
  sourceKey,
  oldValue,
  newValue,
  absoluteRange,
  maxChangeRatePercent,
  sourceUrl,
  expectedJump = false,
  expectedJumpReason,
  notifyFn = defaultNotify,
}) {
  const changePercent = oldValue !== 0 ? ((newValue - oldValue) / oldValue) * 100 : 0;

  // Prüfart 1 — Bereichsprüfung
  if (newValue < absoluteRange.min || newValue > absoluteRange.max) {
    const message =
      `⚠️ Plausi-Check FEHLGESCHLAGEN: ${sourceKey}\n` +
      `Bereichsprüfung: Wert ${newValue} liegt ausserhalb [${absoluteRange.min}, ${absoluteRange.max}]\n` +
      `Alter Wert: ${oldValue}\n` +
      `Quelle: ${sourceUrl}\n` +
      `Freigabe erforderlich, bevor der Wert publiziert wird.`;
    notifyFn(message);
    console.error(`[plausi/${sourceKey}] Bereichsprüfung fehlgeschlagen — Eskalation gesendet.`);
    return { status: 'range-violation', changePercent };
  }

  // Prüfart 2 — Sprungprüfung
  if (Math.abs(changePercent) > maxChangeRatePercent) {
    if (expectedJump) {
      console.log(
        `[plausi/${sourceKey}] Sprung von ${changePercent.toFixed(2)}% erkannt, aber als erwarteter ` +
        `Regelvorgang markiert (${expectedJumpReason ?? 'kein Grund angegeben'}) — KEINE Eskalation (US 1.7 AC).`
      );
      return { status: 'expected-jump', changePercent };
    }
    const message =
      `⚠️ Plausi-Check: ${sourceKey}\n` +
      `Alter Wert: ${oldValue}\n` +
      `Neuer Wert: ${newValue}\n` +
      `Abweichung: ${changePercent.toFixed(2)}% (Schwellwert: ${maxChangeRatePercent}%)\n` +
      `Quelle: ${sourceUrl}\n` +
      `Freigabe erforderlich — ist das ein echtes Ereignis oder ein Datenfehler?`;
    notifyFn(message);
    console.error(`[plausi/${sourceKey}] Sprungprüfung fehlgeschlagen (${changePercent.toFixed(2)}% > ${maxChangeRatePercent}%) — Eskalation gesendet.`);
    return { status: 'jump-violation', changePercent };
  }

  console.log(`[plausi/${sourceKey}] OK — Wert ${newValue} im Bereich, Änderung ${changePercent.toFixed(2)}% unter Schwellwert ${maxChangeRatePercent}%.`);
  return { status: 'ok', changePercent };
}
