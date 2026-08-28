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

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluatePending, recordEscalation, markReminderSent } from './plausibility-state.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * SECURITY-FIX (Security-Review Durchgang 1/3, 28.08.2026, Finding F1 —
 * HIGH): Vorherige Implementierung baute den Shell-Befehl per String-
 * Interpolation (`execSync(\`bash "..." "${message...}"\`)`). Das Escaping
 * neutralisierte nur `"`, liess aber `$(...)`/Backticks/`${...}`
 * (Command Substitution) INNERHALB der doppelten Anführungszeichen aktiv.
 * Da `message` u.a. `sourceKey` enthält, der wiederum ungeprüfte Werte aus
 * externen BFS/SNB-Antworten transportiert (z.B. `point[dateField]` in
 * incremental-validation.mjs), hätte eine manipulierte Quelle beliebigen
 * Shell-Code mit den Rechten des Pipeline-Users ausführen können (inkl.
 * Exfiltration des Telegram-Tokens). Fix: `execFileSync` mit Argument-Array
 * — kein Shell-Parsing der Message mehr, `message` wird nie interpretiert.
 */
function defaultNotify(message) {
  try {
    execFileSync('bash', [path.join(REPO_ROOT, 'scripts', 'notify-telegram.sh'), message], {
      stdio: 'pipe',
    });
    return true;
  } catch (err) {
    console.error(`[plausi/notify] Telegram-Versand fehlgeschlagen: ${err.message}`);
    return false;
  }
}

/**
 * FIX 4 (Betreiber-Direktive 28.08.2026, Fund: Link kaputt — "...masterWert",
 * zwei Steuerzeichen U+FFFC plus das Wort "Wert" wurden ins Linkziel gezogen).
 * URSACHE: Die bisherigen Templates hingen den Folgetext direkt (nur `\n`,
 * kein Leerzeilen-Abstand) an die URL an — manche Telegram-Client-Renderer
 * (Linkerkennung per Regex, endet erst an Whitespace ODER am Zeilenende,
 * abhängig von Client-Version) zogen dadurch das erste Wort der Folgezeile
 * mit ins Link-Ziel, wenn zwischen URL und Folgetext kein sauberer
 * Absatzumbruch (doppeltes `\n\n`) stand oder unsichtbare Steuerzeichen
 * (U+FFFC, vermutlich aus einer früheren Kopier-/Formatierungsstufe) in der
 * Nähe der URL lagen.
 *
 * ROBUSTE LÖSUNG: EIN zentraler Message-Builder statt drei unabhängiger
 * Templates (verhindert erneutes Auseinanderlaufen). Die URL steht IMMER:
 *   - auf einer eigenen Zeile,
 *   - mit einer Leerzeile DAVOR,
 *   - mit einer Leerzeile DANACH,
 *   - ohne jegliches Markup (kein "Quelle:" DAVOR in derselben Zeile, kein
 *     Klammer-/Doppelpunkt-Zeichen direkt anliegend, das ein Renderer als
 *     Teil der URL interpretieren könnte),
 *   - als einziger Inhalt ihrer Zeile (kein Suffix-Text nach der URL in
 *     derselben Zeile).
 * Zusätzlich: alle Eingabe-Strings (sourceKey, bodyLines) werden auf
 * Steuerzeichen (U+0000-U+001F ausser \n, U+007F-U+009F, U+FFF9-U+FFFC)
 * gefiltert, BEVOR sie in die Nachricht eingebaut werden — verhindert, dass
 * ein unsichtbares Zeichen aus einer Datenquelle sich erneut in die Nähe
 * der URL schmuggelt.
 */
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFF9-\uFFFC]/g;

function stripControlChars(s) {
  return String(s).replace(CONTROL_CHAR_PATTERN, '');
}

/**
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.sourceKey
 * @param {string[]} params.bodyLines
 * @param {string} params.sourceUrl
 * @param {string|null} params.question - optionale Frage vor dem Freigabe-Hinweis
 * @returns {string}
 */
function buildEscalationMessage({ title, sourceKey, bodyLines, sourceUrl, question }) {
  const cleanSourceKey = stripControlChars(sourceKey);
  const cleanUrl = stripControlChars(sourceUrl).trim();
  const cleanBodyLines = bodyLines.map(stripControlChars);

  const lines = [
    `${title}: ${cleanSourceKey}`,
    '',
    ...cleanBodyLines,
    '', // Leerzeile VOR der URL
    cleanUrl, // URL AUF EIGENER ZEILE, kein Präfix wie "Quelle:" in derselben Zeile
    '', // Leerzeile NACH der URL
    'Wert wurde zurückgehalten, NICHT publiziert.',
  ];
  if (question) {
    lines.push(question);
  }
  lines.push(`Antworte mit "JA ${cleanSourceKey}" zum Freigeben oder "NEIN ${cleanSourceKey}" zum Verwerfen.`);
  return lines.join('\n');
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
 * @param {string} [params.plausiStateDir] - Override für Tests (siehe lib/plausibility-state.mjs)
 * @returns {{status: 'ok'|'range-violation'|'jump-violation'|'expected-jump'|'pending-unchanged'|'approved-override'|'rejected-suppressed'|'reminder-sent', changePercent: number, dataFreshnessImpact?: 'none'|'stale'}}
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
  plausiStateDir,
}) {
  // FIX 2+3 (Betreiber-Direktive 28.08.2026, Zustandspersistenz + drei
  // Ausgänge): Bevor überhaupt geprüft wird, ob dieser Wert einen Verstoss
  // darstellt, wird der bestehende Pending-Zustand ausgewertet:
  //   - 'approved-override': eine frühere Eskalation für GENAU DIESEN Wert
  //     wurde freigegeben — der Wert wird publiziert (siehe Rückgabe unten),
  //     der Aufrufer (incremental-validation.mjs) übernimmt ihn als neue
  //     Vergleichsbasis und löscht den Pending-Zustand.
  //   - 'rejected-suppressed': eine frühere Eskalation wurde verworfen, der
  //     Wert bleibt UNVERÄNDERT verworfen, solange die Quelle denselben
  //     Wert liefert — keine erneute Meldung, Datenstand gilt als
  //     'vorläufig/veraltet' (US 3.16 Zustand 2).
  //   - 'reminder-sent': 7 Tage unbeantwortet — GENAU EINE Erinnerung wird
  //     jetzt gesendet, danach Ruhe (wie 'rejected-suppressed' behandelt).
  //   - 'pending-unchanged': bereits gemeldet, noch unentschieden, noch
  //     keine Erinnerung fällig — keine erneute Eskalation (Fix 2).
  const pendingEval = evaluatePending(sourceKey, newValue, plausiStateDir);

  if (pendingEval.action === 'approved-override') {
    console.log(
      `[plausi/${sourceKey}] Wert war zuvor freigegeben ("JA") — wird publiziert, ` +
      `Vergleichsbasis wird vom Aufrufer aktualisiert.`
    );
    return { status: 'approved-override', changePercent: oldValue !== 0 ? ((newValue - oldValue) / oldValue) * 100 : 0, dataFreshnessImpact: 'none' };
  }

  if (pendingEval.action === 'send-reminder') {
    const message = buildEscalationMessage({
      title: '⏰ Plausi-Check: Erinnerung (7 Tage unbeantwortet)',
      sourceKey,
      bodyLines: [
        `Alter Wert: ${pendingEval.pending.oldValue}`,
        `Neuer Wert: ${pendingEval.pending.newValue}`,
        `Erstmalig gemeldet: ${pendingEval.pending.firstEscalatedAt}`,
        'Seit 7 Tagen keine Antwort — dies ist die EINZIGE Erinnerung, danach bleibt der Datenstand ohne weitere Meldung auf dem letzten validen Punkt stehen, bis eine Entscheidung vorliegt.',
      ],
      sourceUrl,
      question: null,
    });
    notifyFn(message);
    markReminderSent(sourceKey, plausiStateDir);
    console.error(`[plausi/${sourceKey}] 7-Tage-Erinnerung gesendet — Datenstand bleibt 'vorläufig/veraltet' (US 3.16 Zustand 2).`);
    return { status: 'reminder-sent', changePercent: NaN, dataFreshnessImpact: 'stale' };
  }

  if (pendingEval.action === 'suppress') {
    // WICHTIG (Regressionsfund 28.08.2026, während Fix-3-Bau selbst entdeckt):
    // 'suppress' deckt DREI unterschiedliche Situationen ab, die bestehende
    // Aufrufer (test-plausibility-state.mjs, Fix 2) unterscheiden können
    // müssen — alle drei pauschal als 'rejected-suppressed' zurückzugeben
    // war falsch und brach den bereits bestehenden Fix-2-Vertrag (Status
    // 'pending-unchanged' für den einfachen "noch unentschieden"-Fall):
    //   a) resolution === 'rejected' -> ECHTE Verwerfung (Ausgang 2)
    //   b) reminderSentAt gesetzt, resolution === null -> nach der einzigen
    //      Erinnerung, weiterhin unentschieden (Ausgang 3, Ruhephase)
    //   c) resolution === null, kein reminderSentAt -> schlicht noch nicht
    //      fällig (Fix 2, unveränderter Alt-Fall) -> 'pending-unchanged'
    const isActuallyRejected = pendingEval.pending.resolution === 'rejected';
    const isPostReminderQuiet = !isActuallyRejected && !!pendingEval.pending.reminderSentAt;
    const status = isActuallyRejected || isPostReminderQuiet ? 'rejected-suppressed' : 'pending-unchanged';
    const reason = isActuallyRejected
      ? 'verworfen ("NEIN")'
      : isPostReminderQuiet
        ? 'unentschieden, Erinnerung bereits gesendet'
        : 'bereits gemeldet, noch unentschieden (Fix 2)';
    console.log(`[plausi/${sourceKey}] Wert bleibt zurückgehalten (${reason}), Quellwert unverändert — keine erneute Meldung.`);
    return {
      status,
      changePercent: NaN,
      dataFreshnessImpact: status === 'rejected-suppressed' ? pendingEval.dataFreshnessImpact : 'none',
    };
  }

  // Ab hier: pendingEval.action === 'escalate' (Ausgang "neue Eskalation
  // nötig" — entweder erste Meldung oder geänderter Wert; ein bereits
  // gemeldeter, unveränderter, noch unentschiedener Wert wurde oben bereits
  // als 'suppress' abgefangen). Der folgende Code ist die eigentliche
  // Prüflogik, wird also nur erreicht, wenn tatsächlich neu eskaliert
  // werden muss.
  // SECURITY-FIX (Security-Review Durchgang 1/3, 28.08.2026, Finding F2 —
  // MEDIUM): Ohne diese Prüfung würde ein nicht-numerischer/NaN-Wert (z.B.
  // durch einen Formatwechsel der Quelle oder eine manipulierte Antwort)
  // BEIDE Prüfarten unbemerkt durchlaufen — `NaN < min`/`NaN > max` sind
  // beide `false`, `Math.abs(NaN) > schwellwert` ist ebenfalls `false`.
  // Ergebnis ohne diesen Guard: status 'ok', der ungültige Wert würde
  // publiziert — genau die Fehlerklasse, die diese Prüfung verhindern soll.
  if (typeof newValue !== 'number' || !Number.isFinite(newValue)) {
    const message = buildEscalationMessage({
      title: '⚠️ Plausi-Check FEHLGESCHLAGEN',
      sourceKey,
      bodyLines: [`Typprüfung: neuer Wert ist nicht-numerisch oder nicht endlich (${JSON.stringify(newValue)})`, `Alter Wert: ${oldValue}`],
      sourceUrl,
      question: null,
    });
    notifyFn(message);
    recordEscalation(sourceKey, { newValue, oldValue, status: 'range-violation' }, plausiStateDir);
    console.error(`[plausi/${sourceKey}] Typprüfung fehlgeschlagen (nicht-numerischer Wert) — Eskalation gesendet.`);
    return { status: 'range-violation', changePercent: NaN };
  }

  const changePercent = oldValue !== 0 ? ((newValue - oldValue) / oldValue) * 100 : 0;

  // Prüfart 1 — Bereichsprüfung
  if (newValue < absoluteRange.min || newValue > absoluteRange.max) {
    const message = buildEscalationMessage({
      title: '⚠️ Plausi-Check FEHLGESCHLAGEN',
      sourceKey,
      bodyLines: [`Bereichsprüfung: Wert ${newValue} liegt ausserhalb [${absoluteRange.min}, ${absoluteRange.max}]`, `Alter Wert: ${oldValue}`],
      sourceUrl,
      question: null,
    });
    notifyFn(message);
    recordEscalation(sourceKey, { newValue, oldValue, status: 'range-violation' }, plausiStateDir);
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
    const message = buildEscalationMessage({
      title: '⚠️ Plausi-Check',
      sourceKey,
      bodyLines: [`Alter Wert: ${oldValue}`, `Neuer Wert: ${newValue}`, `Abweichung: ${changePercent.toFixed(2)}% (Schwellwert: ${maxChangeRatePercent}%)`],
      sourceUrl,
      question: 'Ist das ein echtes Ereignis oder ein Datenfehler?',
    });
    notifyFn(message);
    recordEscalation(sourceKey, { newValue, oldValue, status: 'jump-violation' }, plausiStateDir);
    console.error(`[plausi/${sourceKey}] Sprungprüfung fehlgeschlagen (${changePercent.toFixed(2)}% > ${maxChangeRatePercent}%) — Eskalation gesendet.`);
    return { status: 'jump-violation', changePercent };
  }

  console.log(`[plausi/${sourceKey}] OK — Wert ${newValue} im Bereich, Änderung ${changePercent.toFixed(2)}% unter Schwellwert ${maxChangeRatePercent}%.`);
  return { status: 'ok', changePercent };
}
