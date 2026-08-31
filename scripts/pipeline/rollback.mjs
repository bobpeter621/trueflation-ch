#!/usr/bin/env node
/**
 * trueflation.ch — Rollback-Prozess (US 1.13)
 *
 * Git-basiert, wie im Requirements-Dokument entschieden: "technisch trivial
 * (Revert des betreffenden Commits + Re-Deploy) — der Prozess muss aber
 * dokumentiert und einmal getestet sein, nicht erst im Ernstfall erfunden
 * werden."
 *
 * Rollback bedeutet hier konkret: den zuletzt fehlerhaften Datenstand-Commit
 * per `git revert` rückgängig machen (nicht `git reset` — das würde Historie
 * zerstören, `revert` erzeugt einen neuen Commit, der die Änderung aufhebt,
 * bleibt nachvollziehbar).
 *
 * Usage:
 *   node rollback.mjs --commit <sha>          # revert einen bestimmten Commit
 *   node rollback.mjs --last-data-commit       # revert den letzten Commit, der data/lik/ geändert hat
 */

import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
}

/** SECURITY-FIX (finaler Security-Review 30.08.2026, Finding N2 -- NIEDRIG):
 * `--commit <sha>` wurde bisher per String-Interpolation in `run()`
 * eingebaut (`git show --stat ${targetCommit}` / `git revert --no-edit
 * ${targetCommit}`) -- widerspricht dem im Rest des Projekts etablierten
 * Muster (execFileSync + Argument-Array, siehe fetch-with-resilience.mjs/
 * plausibility-check.mjs). Kein realistisches externes Bedrohungsmodell
 * (Skript wird manuell vom Betreiber mit eigenen Argumenten aufgerufen),
 * aber dieselbe Fehlerklasse, die andernorts bereits gefixt wurde, hier
 * ungefixt stehen zu lassen waere inkonsequent. Zwei Schichten: (a) SHA-
 * Format hart validieren, BEVOR irgendein git-Aufruf passiert, (b)
 * execFileSync mit Argument-Array statt Shell-String fuer die beiden
 * Aufrufe, die den Wert tatsaechlich nutzen. */
const COMMIT_SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

function runGitArgs(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
}

function assertValidCommitSha(sha) {
  if (typeof sha !== 'string' || !COMMIT_SHA_PATTERN.test(sha)) {
    throw new Error(`Ungueltiges Commit-SHA-Format: ${JSON.stringify(sha)} -- erwartet 7-40 Hex-Zeichen.`);
  }
}

function findLastDataCommit() {
  const log = run('git log --oneline -1 -- data/lik/');
  if (!log) throw new Error('Kein Commit gefunden, der data/lik/ geändert hat.');
  return log.split(' ')[0];
}

async function main() {
  const args = process.argv.slice(2);
  const commitIdx = args.indexOf('--commit');
  const useLastDataCommit = args.includes('--last-data-commit');

  let targetCommit;
  if (commitIdx >= 0) {
    targetCommit = args[commitIdx + 1];
  } else if (useLastDataCommit) {
    targetCommit = findLastDataCommit();
    console.log(`[rollback] Letzter Datenänderungs-Commit gefunden: ${targetCommit}`);
  } else {
    console.error('Usage: node rollback.mjs --commit <sha> | --last-data-commit');
    process.exit(1);
  }

  assertValidCommitSha(targetCommit);

  console.log(`[rollback] Zeige zu revertierenden Commit:`);
  console.log(runGitArgs(['show', '--stat', targetCommit]));

  console.log(`\n[rollback] Führe 'git revert --no-edit ${targetCommit}' aus...`);
  const result = runGitArgs(['revert', '--no-edit', targetCommit]);
  console.log(result);

  const newHead = run('git rev-parse HEAD');
  console.log(`\n[rollback] Rollback abgeschlossen. Neuer HEAD: ${newHead}`);
  console.log(`[rollback] Nächster Schritt (nicht automatisiert): git push origin main && git push mirror main`);
}

main().catch((err) => {
  console.error(`FEHLER beim Rollback: ${err.message}`);
  console.error('Manuelle Prüfung nötig — Rollback NICHT automatisch abgeschlossen.');
  process.exit(1);
});
