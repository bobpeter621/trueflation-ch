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

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function run(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
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

  console.log(`[rollback] Zeige zu revertierenden Commit:`);
  console.log(run(`git show --stat ${targetCommit}`));

  console.log(`\n[rollback] Führe 'git revert --no-edit ${targetCommit}' aus...`);
  const result = run(`git revert --no-edit ${targetCommit}`);
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
