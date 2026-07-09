#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// no-worktree — SessionStart hook. OPTIONAL, off by default (worktree.guardEnabled).
//
// WHY: a session that resumes inside a git worktree (`.claude/worktrees/*`) can
// land on a STALE branch and edit against out-of-date code with no audit — a
// reconcile from a long-branched worktree silently imports old canon onto current
// HEAD. This aborts loudly and instructs the model to operate against absolute
// paths to the main checkout instead.
//
// Config-driven (worktree.guardEnabled, worktree.dirSegment). No config /
// disabled ⇒ no-op.

'use strict';
const CFG = require('./lib/config.js');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let cwd = process.cwd();
  try { const j = JSON.parse(input); if (j && j.cwd) cwd = j.cwd; } catch (e) {}

  const cfg = CFG.load(cwd);
  if (!cfg || !cfg.worktree || !cfg.worktree.guardEnabled) return;

  const seg = cfg.worktree.dirSegment || '/.claude/worktrees/';
  if (cwd.indexOf(seg) < 0) return;

  process.stdout.write(
'WORKTREE CWD DETECTED — ABORT.\n\n' +
'Session started inside ' + cwd + '\n\n' +
'A worktree may lag the canonical branch by multiple commits; edits there land on\n' +
'stale code. REQUIRED before any edit:\n' +
'  1. State to the operator that CWD is a worktree, not the main checkout.\n' +
'  2. Operate against ABSOLUTE paths to the main repo (' + cfg.__repoRoot + ') for every\n' +
'     Read/Edit/Write/Bash call — bash CWD does not persist across tool calls.\n' +
'  3. Verify the branch: `git -C ' + cfg.__repoRoot + ' branch --show-current`.\n' +
'  4. Worktree cleanup (operator approves): `git worktree remove ' + cwd + ' --force`.\n\n' +
'Do NOT spawn agents with worktree isolation — that is how leftovers accumulate.\n');
});
