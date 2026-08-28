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
import { clearPendingState } from './plausibility-state.mjs';
import { recordApproval } from './manual-approval-log.mjs';

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
 * @param {string} [params.approvalLogPath] - Override für Tests (siehe
 *   lib/manual-approval-log.mjs). CODE-REVIEW-FUND (28.08.2026, Finding 3,
 *   WICHTIG): fehlte ursprünglich — recordApproval() schrieb IMMER in den
 *   echten Produktivpfad data/_changelog/plausi-manual-approvals.json,
 *   auch aus Tests. Reproduziert: ein Testlauf kontaminierte reale
 *   Repo-Daten mit einem Fake-Eintrag. Jetzt analog zu plausiStateDir
 *   durchreichbar, Tests MÜSSEN einen eigenen Temp-Pfad übergeben.
 * @param {boolean} [params.dryRun=false] - CODE-REVIEW-FUND (28.08.2026,
 *   Finding 2, WICHTIG): Ohne dieses Flag löschten approved-Werte ihren
 *   Pending-Zustand und schrieben das Approval-Log auch dann, wenn
 *   processSeries() im --dry-run-Modus lief und GAR NICHTS publizierte —
 *   die Freigabe ging damit unwiederbringlich verloren (der nächste ECHTE
 *   Lauf hätte den Wert erneut als neuen Sprung eskaliert, exakt die
 *   Endlosschleife, die Fix 3 verhindern sollte, nur über einen anderen
 *   Pfad wieder eingeführt). Im dryRun-Fall werden approved-Werte JETZT
 *   NICHT übernommen und der Pending-Zustand NICHT gelöscht — ein
 *   nachfolgender ECHTER Lauf sieht die Freigabe weiterhin und wendet sie
 *   dann an.
 * @returns {{acceptedPoints: Array<object>, withheldPoints: Array<object>, escalated: boolean, firstViolation: object|null, staleImpact: boolean}}
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
  approvalLogPath,
  dryRun = false,
}) {
  const acceptedPoints = [];
  const withheldPoints = [];
  let escalated = false;
  let firstViolation = null;
  let prevValue = lastKnownValue;
  let blocked = false;
  let staleImpact = false;

  for (const point of newPoints) {
    if (blocked) {
      // Vergleichsbasis nach einem Verstoss nicht mehr vertrauenswürdig —
      // alle nachfolgenden Punkte werden ebenfalls zurückgehalten, nicht
      // einzeln neu geprüft (US 1.7: "wird NICHT automatisch übernommen").
      withheldPoints.push(point);
      continue;
    }

    const newValue = point[valueField];
    const pointSourceKey = `${sourceKey}/${point[dateField]}`;
    const result = checkPlausibility({
      sourceKey: pointSourceKey,
      oldValue: prevValue,
      newValue,
      absoluteRange,
      maxChangeRatePercent,
      sourceUrl,
      notifyFn,
      plausiStateDir,
    });

    // FIX 3 (Betreiber-Direktive 28.08.2026, Ausgang 1 — APPROVED): Eine
    // frühere Eskalation für GENAU DIESEN Wert wurde über den Telegram-
    // Rückkanal freigegeben (siehe resolve-plausibility.mjs). Der Wert wird
    // jetzt PUBLIZIERT (in acceptedPoints übernommen) UND als neue
    // Vergleichsbasis für den nächsten Punkt gesetzt — sonst würde der
    // nächste Lauf denselben "Sprung" gegen die ALTE Basis erneut erkennen
    // (Variante 1 wäre eine Endlosschleife gewesen, siehe Betreiber-Vorgabe).
    // Pending-Zustand wird gelöscht (endgültig aufgelöst) und die Freigabe
    // im Protokoll festgehalten (US 4.10).
    if (result.status === 'approved-override') {
      // FIX 2 (Code-Review 28.08.2026): im Dry-Run NICHTS anwenden — weder
      // übernehmen noch den Pending-Zustand löschen noch protokollieren.
      // Ein nachfolgender ECHTER Lauf muss die Freigabe noch vorfinden.
      if (dryRun) {
        withheldPoints.push(point);
        console.log(`[incremental-validation/${pointSourceKey}] [dry-run] Freigabe vorhanden, aber NICHT angewendet (kein Schreibvorgang, Pending-Zustand bleibt erhalten für den nächsten echten Lauf).`);
        continue;
      }
      // FIX 1 (Code-Review 28.08.2026, KRITISCH): recordApproval() MUSS VOR
      // der prevValue-Reassignment aufgerufen werden — sonst protokolliert
      // das Audit-Log oldValue === newValue (der alte Wert wäre bereits
      // überschrieben), was den Zweck von US 4.10 ("welcher Wert, wovon aus,
      // wann freigegeben") durchbricht. Reproduziert: Testlauf zeigte exakt
      // dieses falsche Protokoll, bevor dieser Fix angewendet wurde.
      const oldValueForLog = prevValue;
      recordApproval(
        { sourceKey: pointSourceKey, oldValue: oldValueForLog, newValue, sourceUrl },
        approvalLogPath,
      ); // FIX 3 (Code-Review 28.08.2026): approvalLogPath jetzt durchreichbar (siehe JSDoc oben) statt hartem Produktivpfad.
      acceptedPoints.push(point);
      prevValue = newValue;
      clearPendingState(pointSourceKey, plausiStateDir);
      console.log(`[incremental-validation/${pointSourceKey}] Freigegebener Wert übernommen, Vergleichsbasis aktualisiert, Pending-Zustand gelöscht.`);
      continue;
    }

    // FIX 3, Ausgang 2 (REJECTED) und Ausgang 3 (7-Tage-Erinnerung/Ruhe nach
    // Erinnerung): Wert bleibt zurückgehalten, KEINE erneute Eskalation,
    // solange der Quellwert unverändert bleibt. Präzisierung (Betreiber):
    // der angezeigte Datenstand muss den letzten VALIDEN Punkt zeigen — das
    // ist automatisch der Fall, weil dieser Punkt NICHT in acceptedPoints
    // landet und damit nicht in die publizierte Reihe einfliesst. Der
    // Aufrufer (processSeries) markiert ihn als 'stale' via
    // dataFreshnessImpact (siehe Rückgabe unten).
    if (result.status === 'rejected-suppressed' || result.status === 'reminder-sent') {
      withheldPoints.push(point);
      staleImpact = staleImpact || result.dataFreshnessImpact === 'stale';
      continue;
    }

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

  return { acceptedPoints, withheldPoints, escalated, firstViolation, staleImpact };
}
