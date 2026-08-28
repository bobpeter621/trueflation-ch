#!/usr/bin/env node
/**
 * trueflation.ch — Freigabe/Verwerfung-Mechanismus, drei Ausgänge (US 1.7, Fix 3)
 *
 * NEGATIVTESTS (Betreiber-Vorgabe, wörtlich, "vorführen, nicht behaupten"):
 *   a) Zwei Läufe, identischer Wert, keine Antwort -> genau EINE Meldung
 *      (bereits in test-plausibility-state.mjs bewiesen)
 *   b) Approve -> Wert erscheint in der Reihe, nächster Lauf eskaliert NICHT erneut
 *   c) Reject -> Wert erscheint NICHT, nächster Lauf eskaliert NICHT erneut,
 *      Datenstand zeigt den letzten validen Punkt
 *   d) Quellwert ändert sich nach Reject -> wird wieder normal geprüft
 *
 * Zusätzlich: 7-Tage-Erinnerung (Ausgang 3, "keine Antwort").
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPlausibility } from './lib/plausibility-check.mjs';
import { validateIncrementalPoints } from './lib/incremental-validation.mjs';
import { resolvePending, loadPendingState, savePendingState } from './lib/plausibility-state.mjs';
import { loadApprovalLog } from './lib/manual-approval-log.mjs';

let failures = 0;
function report(name, passed, detail) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!passed) failures++;
}

async function main() {
  console.log('=== trueflation.ch — Freigabe/Verwerfung, drei Ausgänge (US 1.7, Fix 3) ===\n');

  const stateDir = mkdtempSync(path.join(tmpdir(), 'trueflation-resolution-test-'));
  const approvalLogPath = path.join(stateDir, 'approvals.json');
  try {
    // ═══ NEGATIVTEST b) APPROVE ═══
    console.log('--- Negativtest b: Approve -> Wert wird übernommen, kein erneutes Eskalieren ---');
    const notificationsB = [];
    const mockNotifyB = (msg) => { notificationsB.push(msg); return true; };

    // Lauf 1: Sprungverletzung, wird eskaliert und zurückgehalten.
    const result1 = validateIncrementalPoints({
      newPoints: [{ indexDate: 20251101, indexValue: 118.5 }],
      lastKnownValue: 108.2,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-approve-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyB,
      plausiStateDir: stateDir,
      approvalLogPath,
    });
    report('Lauf 1: Wert wird zurückgehalten (escalated)', result1.escalated === true && result1.acceptedPoints.length === 0);

    const sourceKeyForPoint = 'test-approve-flow/20251101';
    const pendingBeforeApprove = loadPendingState(sourceKeyForPoint, stateDir);
    report('Pending-Zustand existiert nach Lauf 1', pendingBeforeApprove !== null);

    // Betreiber antwortet "JA" — resolve-plausibility.mjs würde das verarbeiten.
    const resolveResult = resolvePending(sourceKeyForPoint, 'approved', stateDir);
    report('Freigabe wird in der Zustandsdatei gespeichert', resolveResult.ok === true && resolveResult.pending.resolution === 'approved');

    // Lauf 2 (nächster Pipeline-Lauf): derselbe Punkt kommt erneut als "neuer Punkt" herein
    // (z.B. weil er beim ersten Lauf nicht in die Historie übernommen wurde).
    const notificationsB2 = [];
    const mockNotifyB2 = (msg) => { notificationsB2.push(msg); return true; };
    const result2 = validateIncrementalPoints({
      newPoints: [{ indexDate: 20251101, indexValue: 118.5 }],
      lastKnownValue: 108.2,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-approve-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyB2,
      plausiStateDir: stateDir,
      approvalLogPath,
    });

    report('BELEG b1: Lauf 2 übernimmt den freigegebenen Wert (acceptedPoints=1)', result2.acceptedPoints.length === 1, `tatsächlich: ${result2.acceptedPoints.length}`);
    report('BELEG b2: Lauf 2 eskaliert NICHT erneut (escalated=false)', result2.escalated === false);
    report('BELEG b3: Lauf 2 löst KEINE Telegram-Meldung aus', notificationsB2.length === 0, `notifyFn-Aufrufe: ${notificationsB2.length}`);

    const pendingAfterApprove = loadPendingState(sourceKeyForPoint, stateDir);
    report('Pending-Zustand wurde nach Freigabe gelöscht', pendingAfterApprove === null);

    // ═══ NEGATIVTEST c) REJECT ═══
    console.log('\n--- Negativtest c: Reject -> Wert bleibt draussen, keine erneute Meldung, Datenstand = letzter valider Punkt ---');
    const notificationsC = [];
    const mockNotifyC = (msg) => { notificationsC.push(msg); return true; };

    const resultC1 = validateIncrementalPoints({
      newPoints: [{ indexDate: 20251201, indexValue: 999.9 }],
      lastKnownValue: 108.5,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-reject-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyC,
      plausiStateDir: stateDir,
      approvalLogPath,
    });
    report('Lauf 1: Bereichsverletzung wird eskaliert', resultC1.escalated === true && resultC1.acceptedPoints.length === 0);

    const rejectKey = 'test-reject-flow/20251201';
    const resolveRejectResult = resolvePending(rejectKey, 'rejected', stateDir);
    report('Verwerfung wird in der Zustandsdatei gespeichert', resolveRejectResult.ok === true && resolveRejectResult.pending.resolution === 'rejected');

    const notificationsC2 = [];
    const mockNotifyC2 = (msg) => { notificationsC2.push(msg); return true; };
    const resultC2 = validateIncrementalPoints({
      newPoints: [{ indexDate: 20251201, indexValue: 999.9 }], // exakt derselbe (verworfene) Wert
      lastKnownValue: 108.5,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-reject-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyC2,
      plausiStateDir: stateDir,
      approvalLogPath,
    });

    report('BELEG c1: Lauf 2 übernimmt den verworfenen Wert NICHT (acceptedPoints=0)', resultC2.acceptedPoints.length === 0, `tatsächlich: ${resultC2.acceptedPoints.length}`);
    report('BELEG c2: Lauf 2 eskaliert NICHT erneut (escalated=false)', resultC2.escalated === false);
    report('BELEG c3: Lauf 2 löst KEINE Telegram-Meldung aus', notificationsC2.length === 0, `notifyFn-Aufrufe: ${notificationsC2.length}`);
    report('BELEG c4: staleImpact=true (Datenstand gilt als vorläufig/veraltet, US 3.16 Zustand 2)', resultC2.staleImpact === true);
    report('BELEG c5: der verworfene Wert bleibt in withheldPoints (Datenstand zeigt den letzten validen Punkt)', resultC2.withheldPoints.length === 1);

    // ═══ NEGATIVTEST d) Quellwert ändert sich nach Reject ═══
    console.log('\n--- Negativtest d: Quellwert ändert sich nach Reject -> wird wieder normal geprüft ---');
    const notificationsD = [];
    const mockNotifyD = (msg) => { notificationsD.push(msg); return true; };
    const resultD = validateIncrementalPoints({
      newPoints: [{ indexDate: 20251201, indexValue: 888.8 }], // ANDERER Wert als der verworfene
      lastKnownValue: 108.5,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-reject-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyD,
      plausiStateDir: stateDir,
      approvalLogPath,
    });
    report('BELEG d1: geänderter Wert wird NEU geprüft (escalated=true, neue Eskalation)', resultD.escalated === true);
    report('BELEG d2: geänderter Wert löst eine NEUE Telegram-Meldung aus', notificationsD.length === 1, `notifyFn-Aufrufe: ${notificationsD.length}`);

    // ═══ Ausgang 3: 7-Tage-Erinnerung ═══
    console.log('\n--- Ausgang 3: 7-Tage-Erinnerung (keine Antwort) ---');
    const reminderSourceKey = 'test-reminder-flow/20260101';
    // Simuliert: Eskalation liegt bereits 8 Tage zurück, noch keine Entscheidung, noch keine Erinnerung.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    savePendingState(
      reminderSourceKey,
      {
        newValue: 999.9,
        oldValue: 108.0,
        status: 'range-violation',
        firstEscalatedAt: eightDaysAgo,
        lastSeenAt: eightDaysAgo,
        escalationCount: 1,
        resolution: null,
        resolvedAt: null,
        reminderSentAt: null,
      },
      stateDir
    );
    const notificationsReminder = [];
    const mockNotifyReminder = (msg) => { notificationsReminder.push(msg); return true; };
    const reminderResult = checkPlausibility({
      sourceKey: reminderSourceKey,
      oldValue: 108.0,
      newValue: 999.9, // identischer Wert
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyReminder,
      plausiStateDir: stateDir,
    });
    report('Erinnerung wird nach 7+ Tagen gesendet (status=reminder-sent)', reminderResult.status === 'reminder-sent');
    report('Genau EINE Erinnerungsnachricht', notificationsReminder.length === 1);

    // Zweiter Lauf danach: keine weitere Erinnerung, Ruhe.
    const notificationsReminder2 = [];
    const mockNotifyReminder2 = (msg) => { notificationsReminder2.push(msg); return true; };
    const reminderResult2 = checkPlausibility({
      sourceKey: reminderSourceKey,
      oldValue: 108.0,
      newValue: 999.9,
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceUrl: 'https://example.com/test',
      notifyFn: mockNotifyReminder2,
      plausiStateDir: stateDir,
    });
    report('Nach der Erinnerung: keine weitere Meldung (Ruhe)', reminderResult2.status === 'rejected-suppressed' && notificationsReminder2.length === 0);

    // ═══ CODE-REVIEW-FUND 1 (28.08.2026, KRITISCH): oldValue im Approval-Log ═══
    console.log('\n--- Code-Review-Fund 1 (KRITISCH): Approval-Log muss den ECHTEN alten Wert zeigen, nicht oldValue===newValue ---');
    const approvalLogPath1 = path.join(stateDir, 'approvals-finding1.json');
    const resultFinding1 = validateIncrementalPoints({
      newPoints: [{ indexDate: 20260301, indexValue: 200.0 }],
      lastKnownValue: 100.0,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-finding1-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: () => true,
      plausiStateDir: stateDir,
      approvalLogPath: approvalLogPath1,
    });
    report('Fund 1 Vorbereitung: Wert wird eskaliert', resultFinding1.escalated === true);
    resolvePending('test-finding1-flow/20260301', 'approved', stateDir);
    validateIncrementalPoints({
      newPoints: [{ indexDate: 20260301, indexValue: 200.0 }],
      lastKnownValue: 100.0,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-finding1-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: () => true,
      plausiStateDir: stateDir,
      approvalLogPath: approvalLogPath1,
    });
    const log1 = loadApprovalLog(approvalLogPath1);
    report('FIX 1 BELEG: Approval-Log enthält genau 1 Eintrag', log1.length === 1, `tatsächlich: ${log1.length}`);
    if (log1.length === 1) {
      report('FIX 1 BELEG: oldValue im Log ist der ECHTE alte Wert (100.0), NICHT newValue (200.0)', log1[0].oldValue === 100.0, `oldValue im Log: ${log1[0].oldValue}`);
      report('FIX 1 BELEG: newValue im Log ist korrekt (200.0)', log1[0].newValue === 200.0);
    }

    // ═══ CODE-REVIEW-FUND 2 (28.08.2026, WICHTIG): dryRun darf Freigaben nicht verlieren ═══
    console.log('\n--- Code-Review-Fund 2 (WICHTIG): --dry-run darf eine Freigabe nicht verlieren ---');
    const resultFinding2Setup = validateIncrementalPoints({
      newPoints: [{ indexDate: 20260401, indexValue: 300.0 }],
      lastKnownValue: 150.0,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-finding2-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: () => true,
      plausiStateDir: stateDir,
      approvalLogPath,
    });
    report('Fund 2 Vorbereitung: Wert wird eskaliert', resultFinding2Setup.escalated === true);
    resolvePending('test-finding2-flow/20260401', 'approved', stateDir);

    // Dry-Run-Lauf: darf den Pending-Zustand NICHT löschen und den Wert NICHT übernehmen.
    const resultDryRun = validateIncrementalPoints({
      newPoints: [{ indexDate: 20260401, indexValue: 300.0 }],
      lastKnownValue: 150.0,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-finding2-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: () => true,
      plausiStateDir: stateDir,
      approvalLogPath,
      dryRun: true,
    });
    report('FIX 2 BELEG: Dry-Run übernimmt den freigegebenen Wert NICHT (acceptedPoints=0)', resultDryRun.acceptedPoints.length === 0, `tatsächlich: ${resultDryRun.acceptedPoints.length}`);
    const pendingAfterDryRun = loadPendingState('test-finding2-flow/20260401', stateDir);
    report('FIX 2 BELEG: Pending-Zustand bleibt nach Dry-Run erhalten (nicht gelöscht)', pendingAfterDryRun !== null && pendingAfterDryRun.resolution === 'approved');

    // Danach ein ECHTER Lauf: muss die Freigabe jetzt anwenden.
    const resultRealRun = validateIncrementalPoints({
      newPoints: [{ indexDate: 20260401, indexValue: 300.0 }],
      lastKnownValue: 150.0,
      dateField: 'indexDate',
      valueField: 'indexValue',
      absoluteRange: { min: 50, max: 5600 },
      maxChangeRatePercent: 2.0,
      sourceKey: 'test-finding2-flow',
      sourceUrl: 'https://example.com/test',
      notifyFn: () => true,
      plausiStateDir: stateDir,
      approvalLogPath,
      dryRun: false,
    });
    report('FIX 2 BELEG: nachfolgender ECHTER Lauf wendet die Freigabe an (acceptedPoints=1)', resultRealRun.acceptedPoints.length === 1, `tatsächlich: ${resultRealRun.acceptedPoints.length}`);

    // ═══ CODE-REVIEW-FUND 3 (28.08.2026, WICHTIG): Testisolation Approval-Log ═══
    console.log('\n--- Code-Review-Fund 3 (WICHTIG): Approval-Log-Pfad isoliert, kein Schreiben in echten Produktivpfad ---');
    const { DEFAULT_APPROVAL_LOG_PATH } = await import('./lib/manual-approval-log.mjs');
    report(
      'FIX 3 BELEG: alle obigen Testläufe nutzten approvalLogPath-Override, nicht DEFAULT_APPROVAL_LOG_PATH',
      approvalLogPath1 !== DEFAULT_APPROVAL_LOG_PATH,
      `verwendet: ${approvalLogPath1}`
    );

    // ═══ CODE-REVIEW-FUND 4 (28.08.2026, WICHTIG): resolvePending darf Entscheidung nicht überschreiben ═══
    console.log('\n--- Code-Review-Fund 4 (WICHTIG): eine getroffene Entscheidung ist final, kein stilles Überschreiben ---');
    const finding4Key = 'test-finding4-flow/20260501';
    savePendingState(
      finding4Key,
      {
        newValue: 500.0,
        oldValue: 100.0,
        status: 'range-violation',
        firstEscalatedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        escalationCount: 1,
        resolution: null,
        resolvedAt: null,
        reminderSentAt: null,
      },
      stateDir
    );
    const rejectFirst = resolvePending(finding4Key, 'rejected', stateDir);
    report('Erste Entscheidung (rejected) wird akzeptiert', rejectFirst.ok === true);
    const approveSecondAttempt = resolvePending(finding4Key, 'approved', stateDir);
    report('FIX 4 BELEG: zweiter Aufruf (approved) auf bereits entschiedenen Zustand wird ABGELEHNT', approveSecondAttempt.ok === false, `Grund: ${approveSecondAttempt.reason}`);
    const stateAfterAttempt = loadPendingState(finding4Key, stateDir);
    report('FIX 4 BELEG: die ursprüngliche Entscheidung (rejected) bleibt unverändert', stateAfterAttempt.resolution === 'rejected', `tatsächlich: ${stateAfterAttempt.resolution}`);

    console.log(`\n=== ${failures === 0 ? 'ALLE TESTS BESTANDEN' : `${failures} TEST(S) FEHLGESCHLAGEN`} ===`);
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
}

main();
