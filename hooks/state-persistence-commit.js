#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// state-persistence-commit — PreToolUse gate for Bash (git commit).
//   (generalized from Anim8's anim8-preset-walk-commit)
//
// WHY: a control the user can change but a save/recall can't restore is a broken
// save. When a commit ADDS a new user-selectable/persistable control (a mode
// enum, a capability toggle, a menu section) it MUST also wire that control into
// the project's save-walk (snapshot / restore) in the SAME commit — else a
// preset/project reload silently loses the user's choice (STATE-NOT-IN-PRESET-WALK).
//
// Fires ONLY when the ADDED diff of a state file (statePersistence.stateFileGlobs)
// matches a strong new-selectable signal (statePersistence.signals[]). Then the
// commit message must carry a `<trailerName>:` trailer:
//   <trailer>: covered          (wired into snapshot/restore + verified)
//   <trailer>: n/a (<why>)      (not persistable — a transient trigger, display-only)
//
// Config-driven; disabled by default in a fresh config until you name your
// state files + signals. No config / disabled ⇒ no-op. Exit 2 → rejected.

'use strict';
const { execSync } = require('child_process');
const CFG = require('./lib/config.js');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch (e) { return; }
  const cmd = (data && data.tool_input && data.tool_input.command) || '';

  const cwd = (data && data.cwd) || process.cwd();
  const cfg = CFG.load(cwd);
  if (!cfg || !cfg.statePersistence || !cfg.statePersistence.enabled) return;
  const sp = cfg.statePersistence;
  const root = cfg.__repoRoot;

  const bare = cmd.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  if (!/\bgit\b[^|;&\n]*\bcommit\b/.test(bare)) return;
  const exemptMk = sp.exemptMarker || 'state-walk-exempt';
  if (new RegExp('\\[' + exemptMk + ':\\s*[^\\]]+\\]').test(cmd)) return;

  let staged;
  try {
    staged = execSync('git diff --cached --name-only', { cwd: root, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) { return; }

  const globs = sp.stateFileGlobs || [];
  const isStateFile = f => globs.some(g => (g.endsWith('/') ? f.startsWith(g) : f === g)) && f.endsWith('.js');
  const stateFiles = staged.filter(isStateFile);
  if (!stateFiles.length) return;

  let added = '';
  try {
    added = execSync('git diff --cached -U0 -- ' + stateFiles.map(f => '"' + f + '"').join(' '),
      { cwd: root, encoding: 'utf8' });
  } catch (e) { return; }
  const addedBody = added.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');

  const signals = sp.signals || [];
  const hits = [];
  for (const s of signals) {
    let re; try { re = new RegExp(s.re); } catch (e) { continue; }
    if (re.test(addedBody)) hits.push(s.what || s.re);
  }
  if (!hits.length) return;

  const trailer = sp.trailerName || 'State';
  const walkLine = (cmd.match(new RegExp(trailer + ':\\s*([^\\n"\']+)', 'i')) || [])[1];

  const checklist =
    'A new user-selectable control detected — it MUST round-trip the ' + sp.walkName + ':\n' +
    '  • the card/object snapshot() + restore()  — a DEDICATED named field, not buried in a params bag.\n' +
    '  • for a SHARED capability capture GENERICALLY via the getter/setter so every consumer inherits it.\n' +
    '  • the editor getValues() / setValues()     — editor-side save/recall.\n' +
    '  • VERIFY: set non-default → save slot → change → recall → restored.\n\n' +
    'Then declare it in the commit message:\n' +
    '  ' + trailer + ': covered\n' +
    '  ' + trailer + ': n/a (<why — transient trigger / display-only, not persistable>)\n';

  function reject(msg) { CFG.logGate(cfg, 'state-persistence-commit', 'BLOCK', 'git commit', hits.join(';')); process.stderr.write(msg); process.exit(2); }

  if (!walkLine) {
    reject('STATE-PERSISTENCE HARD-BLOCK — new user-selectable added without a ' + trailer + ': trailer.\n\n' +
      'Signal(s) in the staged diff:\n' + hits.map(h => '  • ' + h).join('\n') + '\n' +
      'Staged state files:\n' + stateFiles.map(f => '  ' + f).join('\n') + '\n\n' + checklist);
  }
  const wl = walkLine.toLowerCase();
  if (/\bn\/a\b/.test(wl) && !/\(.+\)/.test(wl)) {
    reject('STATE-PERSISTENCE HARD-BLOCK — "' + trailer + ': n/a" requires a reason in parentheses.\n\n' + checklist);
  }
  CFG.logGate(cfg, 'state-persistence-commit', 'PASS', 'git commit', walkLine.trim());
});
