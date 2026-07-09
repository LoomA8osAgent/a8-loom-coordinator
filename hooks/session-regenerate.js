#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// session-regenerate — SessionStart hook.
//
// WHY: a generated index beats memory, but only if it is CURRENT. This runs the
// project's generators at session start (code registry, manifest, changelog) so
// the anti-drift indexes never lag the code, and (re)deploys tracked skills +
// subagents into the gitignored .claude/ so a fresh clone has them. It then
// surfaces the "scan the registry before building UI" rule into session context.
//
// A generated index that reads EMPTY is worse than none (false confidence), so
// each generator's own one-line summary (which carries its counts) is echoed
// into context — a collapsed count is visible immediately.
//
// Config-driven (session.generators[], session.deploySkillsAgents,
// session.delegationHint). No config ⇒ no-op.

'use strict';
const { execSync } = require('child_process');
const CFG = require('./lib/config.js');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let cwd = process.cwd();
  try { const j = JSON.parse(input); if (j && j.cwd) cwd = j.cwd; } catch (e) {}

  const cfg = CFG.load(cwd);
  if (!cfg) { process.exit(0); return; }
  const root = cfg.__repoRoot;
  const sess = cfg.session || {};

  const lines = [];
  const run = (label, command) => {
    if (!command) return;
    try {
      const out = execSync(command, { cwd: root, timeout: 20000 }).toString().trim();
      lines.push(label + ' — ' + (out.split('\n').pop() || 'ok'));
    } catch (e) {
      lines.push(label + ' FAILED — ' + String(e.message || e).split('\n').slice(-2).join(' '));
    }
  };

  (sess.generators || []).forEach((command, i) => run('GEN[' + (i + 1) + ']', command));
  if (sess.deploySkillsAgents) run('SKILLS/AGENTS', sess.deploySkillsAgents);

  const regFile = (cfg.canon && cfg.canon.registryFile) || 'UI-REGISTRY.md';
  let msg = lines.join('\n');
  if (msg) msg += '\n';
  msg +=
    'BEFORE building ANY UI (control / chrome / accordion / slider host / widget / CSS class): ' +
    'SCAN ' + regFile + ' and USE what exists — reinventing a listed helper/class is a hand-roll. ' +
    'If the capability is genuinely NOT in the registry it is NEW UI — STOP and get the operator\'s ' +
    'express consent (' + ((cfg.consent && cfg.consent.tokens) || []).join(' / ') + ') before writing it. ' +
    'The registry §6 (orphan candidates) lists exports with zero live callers — the dead-code check ' +
    'the per-edit hooks cannot do; grep-confirm before deleting.';
  if (sess.delegationHint) msg += '\n' + sess.delegationHint;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg }
  }));
});
