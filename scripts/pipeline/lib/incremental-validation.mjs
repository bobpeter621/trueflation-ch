/**
 * trueflation.ch — Produktivpfad-Bindung der Plausibilitätsprüfung (US 1.7)
 *
 * FUND (Betreiber-Audit, 28.08.2026): `incremental-update-lik.mjs` importierte
 * `lib/plausibility-check.mjs` NIE. Die Sprungprüfung im Produktivlauf bestand
 * aus einer eigenen, parallelen Funktion (`validateIncrementalJump`), die bei
 * Überschreitung NUR `console.warn` aufrief — kein Zurückhalten des Werts,
 * keine Bereichsprüfung, keine Telegram-Eskalation. `lib/plausibility-check.mjs`
 * wurde ausschliesslich von `test-plausibility-check.mjs` importiert. Die
 * Plausi-Prüfung lief im Produktivpfad faktisch NIE — Konsolenausgabe wurde
 * fälschlich für den Schutzmechanismus selbst gehalten.
 *
 * FIX: Dieses Modul ist die EINZIGE Stelle, an der Produktivskripte neue
 * Datenpunkte gegen `checkPlausibility()` prüfen. Es kapselt die
 * sequenzielle Prüfung mehrerer neuer Punkte (Bereich + Sprungrate je
 * Punkt) und STOPPT beim ersten Verstoss — Punkte NACH einem verworfenen
 * Punkt werden ebenfalls zurückgehalten, weil ihre Vergleichsbasis
 * (der verworfene Punkt) nicht mehr vertrauenswürdig ist.
 */

import { checkPlausibility } from './plausibility-check.mjs';

/**
 * @param {object} params
 * @param {Array<object>} params.newPoints - neue, noch nicht übernommene Datenpunkte (chronologisch sortiert)
 * @param {number} params.lastKnownValue - letzter bereits übernommener Wert (Vergleichsbasis für den ersten neuen Punkt)
 * @param {string} params.dateField - Feldname des Datums im Punkt-Objekt
 * @param {string} params.valueField - Feldname des Werts im Punkt-Objekt
 * @param {{min: number, max: number}} params.absoluteRange
 * @param {number} params.maxChangeRatePercent
 * @param {string} params.sourceKey - für Plausi-Eskalationskontext, z.B. "lik-totalIndex-monthly"
 * @param {string} params.sourceUrl
 * @param {(msg: string) => boolean} [params.notifyFn]
 * @param {string} [params.plausiStateDir] - Override für Tests (siehe lib/plausibility-state.mjs).
 *   OHNE diesen Parameter nutzt checkPlausibility() den echten Produktiv-
 *   Zustandsordner — das ist für Produktivläufe KORREKT (Fix 2 soll dort
 *   greifen), aber Tests MÜSSEN einen eigenen Temp-Ordner übergeben, sonst
 *   pollutieren sie den echten Zustand und ein zweiter Testlauf schlägt
 *   fälschlich fehl (Regressionsfund 28.08.2026, siehe
 *   test-incremental-plausibility.mjs).
 * @returns {{acceptedPoints: Array<object>, withheldPoints: Array<object>, escalated: boolean, firstViolation: object|null}}
 */
export function validateIncrementalPoints({
  newPoints,
  lastKnownValue,
  dateField,
  valueField,
  absoluteRange,
  maxChangeRatePercent,
  sourceKey,
  sourceUrl,
  notifyFn,
  plausiStateDir,
}) {
  const acceptedPoints = [];
  const withheldPoints = [];
  let escalated = false;
  let firstViolation = null;
  let prevValue = lastKnownValue;
  let blocked = false;

  for (const point of newPoints) {
    if (blocked) {
      // Vergleichsbasis nach einem Verstoss nicht mehr vertrauenswürdig —
      // alle nachfolgenden Punkte werden ebenfalls zurückgehalten, nicht
      // einzeln neu geprüft (US 1.7: "wird NICHT automatisch übernommen").
      withheldPoints.push(point);
      continue;
    }

    const newValue = point[valueField];
    const result = checkPlausibility({
      sourceKey: `${sourceKey}/${point[dateField]}`,
      oldValue: prevValue,
      newValue,
      absoluteRange,
      maxChangeRatePercent,
      sourceUrl,
      notifyFn,
      plausiStateDir,
    });

    if (result.status === 'range-violation' || result.status === 'jump-violation') {
      blocked = true;
      escalated = true;
      firstViolation = { point, status: result.status, changePercent: result.changePercent };
      withheldPoints.push(point);
      continue;
    }

    // 'ok' oder 'expected-jump' — übernehmen, Vergleichsbasis fortschreiben.
    acceptedPoints.push(point);
    prevValue = newValue;
  }

  return { acceptedPoints, withheldPoints, escalated, firstViolation };
}
