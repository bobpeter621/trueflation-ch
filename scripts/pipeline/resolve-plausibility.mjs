#!/usr/bin/env node
/**
 * trueflation.ch — Plausi-Freigabe/Verwerfung verarbeiten (US 1.7, Fix 3)
 *
 * RÜCKKANAL-BEFUND (Betreiber-Direktive 28.08.2026): notify-telegram.sh ist
 * reiner Sende-Code, aber der Telegram-Kanal insgesamt ist bidirektional —
 * dieselbe Chat-ID, über die der Betreiber mit dem Pipeline-Tooling spricht.
 * Antwortet der Betreiber dort mit "JA <sourceKey>" oder "NEIN <sourceKey>",
 * kommt das als normale Nachricht an.
 *
 * ASYNCHRONITÄT (Betreiber-Vorgabe): Die Pipeline läuft in GitHub Actions
 * und sendet dort, die Antwort verarbeitet der Agent u.U. Stunden später in
 * einer eigenen Session. Die Entscheidung darf deshalb NICHT flüchtig sein
 * — dieses Skript SCHREIBT die Entscheidung in die Pending-Zustandsdatei
 * (resolvePending()), wendet sie aber NICHT sofort an. Der NÄCHSTE
 * Pipeline-Lauf (validateIncrementalPoints -> checkPlausibility) liest den
 * Zustand und wendet ihn an — kein Rennen zwischen Actions-Lauf und
 * Agent-Session, die Datei ist der einzige Übergabepunkt.
 *
 * Usage (vom Agenten aufzurufen, wenn eine "JA"/"NEIN"-Antwort verarbeitet wird):
 *   node resolve-plausibility.mjs --source-key "<exakter sourceKey>" --decision approved
 *   node resolve-plausibility.mjs --source-key "<exakter sourceKey>" --decision rejected
 *
 * Der sourceKey muss EXAKT dem in der Eskalationsnachricht genannten Wert
 * entsprechen (Format: "lik-<label>/<indexDate>", siehe
 * incremental-validation.mjs) — kein Fuzzy-Match, damit keine falsche
 * Zuordnung entsteht.
 */

import { resolvePending, loadPendingState } from './lib/plausibility-state.mjs';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const sourceKey = argVal('--source-key');
const decision = argVal('--decision');

function main() {
  if (!sourceKey || !decision) {
    console.error('Usage: node resolve-plausibility.mjs --source-key "<key>" --decision approved|rejected');
    process.exit(1);
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    console.error(`Ungültige Entscheidung: '${decision}' — erwartet 'approved' oder 'rejected'.`);
    process.exit(1);
  }

  const existingBefore = loadPendingState(sourceKey);
  if (!existingBefore) {
    console.error(
      `Kein Pending-Zustand für sourceKey '${sourceKey}' gefunden — nichts zu tun. ` +
      `Mögliche Ursachen: sourceKey-Tippfehler, Wert wurde bereits entschieden, oder der Quellwert hat ` +
      `sich seither geändert (dann wäre eine NEUE Eskalation mit neuem Zustand die Folge, keine der alten).`
    );
    process.exit(1);
  }

  const result = resolvePending(sourceKey, decision);
  if (!result.ok) {
    console.error(`Konnte Entscheidung nicht speichern: ${result.reason}`);
    process.exit(1);
  }

  console.log(`[resolve-plausibility] sourceKey='${sourceKey}' -> Entscheidung '${decision}' gespeichert.`);
  console.log(`  Wert: ${result.pending.newValue} (alt: ${result.pending.oldValue})`);
  console.log(`  Erstmalig gemeldet: ${result.pending.firstEscalatedAt}`);
  console.log(
    decision === 'approved'
      ? '  -> Beim NÄCHSTEN Pipeline-Lauf wird dieser Wert publiziert und als neue Vergleichsbasis übernommen.'
      : '  -> Beim NÄCHSTEN Pipeline-Lauf bleibt dieser Wert verworfen, solange die Quelle denselben Wert liefert. ' +
        'Datenstand zeigt bis dahin den letzten validen Punkt (US 3.16 Zustand 2). ' +
        'Randfall: eine Verwerfung lässt sich nicht per Nachricht zurücknehmen — nur durch manuelles Löschen ' +
        'der Zustandsdatei unter data/_pipeline-status/plausi-pending/.'
  );
}

// Nur ausführen, wenn direkt als Skript gestartet — nicht bei Import (z.B.
// durch einen Syntax-/Modul-Check oder einen künftigen Test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
