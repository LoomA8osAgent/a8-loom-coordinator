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

  const regFile = (cfg.canon && cfg.canon.registryFile) || 'CODE-REGISTRY.md';
  let msg = lines.join('\n');
  if (msg) msg += '\n';
  // The registry reminder is the discover-then-reuse pump. A project may override
  // the exact wording via session.registryReminder; otherwise emit this neutral,
  // language-agnostic default. {reg} / {consent} are substituted.
  const reminderTpl = (sess.registryReminder && String(sess.registryReminder)) ||
    ('BEFORE building ANY reusable unit (a helper / builder / component / module / — for frontend — ' +
     'a control or CSS class): SCAN {reg} and USE what exists — reinventing a listed symbol is a ' +
     'hand-roll. If the capability is genuinely NOT in the registry it is NEW — STOP and get the ' +
     'operator\'s express consent ({consent}) before writing it. The registry orphan section lists ' +
     'exports with zero live callers — the dead-code check the per-edit hooks cannot do; grep-confirm ' +
     'before deleting.');
  msg += reminderTpl
    .replace(/\{reg\}/g, regFile)
    .replace(/\{consent\}/g, ((cfg.consent && cfg.consent.tokens) || []).join(' / '));
  // spec-catalog (integrations/spec-catalog.md): when the layer is adopted the session
  // is told the CONSTRAINT, not just the index — a builder emits a spec and pastes the
  // compiled block, and an edit adding a new surface with no receipt is REFUSED. Silent
  // when specCatalog.enabled is false, like every other optional piece here.
  const specCat = cfg.specCatalog || {};
  if (specCat.enabled) {
    const cd = specCat.catalogDir || 'tools/spec-catalog';
    msg += '\nSPEC-CATALOG IS ON — do not hand-assemble a new surface. Write ' +
      (specCat.specDir || 'specs/ui-specs') + '/<name>.json, run `node ' + cd +
      '/validate.js` then `node ' + cd + '/compile.js`, and paste the emitted block. An ' +
      'edit that adds a new surface with no compile receipt is REFUSED by spec-gate. The ' +
      'catalog payload (what you may name) is ' + cd + '/catalog.prompt.md.';
  }

  // judgment (skills/judgment-SKILL.md): the session is told which ENGAGEMENT state it is
  // in, because that is the one property that keeps the layer auditable — a reader must
  // always be able to tell "no provider configured, so nothing is being asked" apart from
  // "asked, failed, approved anyway", and the second never happens. Silent when the layer
  // is not adopted.
  const jud = cfg.judgment || {};
  if (jud.enabled) {
    const kind = (process.env.A8_DECISION_PROVIDER || (jud.provider && jud.provider.kind) || '').trim();
    msg += '\nJUDGMENT LAYER IS ON — ' + (kind
      ? ('ENGAGED on provider `' + kind + '`. A seam that cannot reach it DENIES; it never ' +
         'passes on silence. Questions live in ' + (jud.roster || 'hooks/judgment-roster.js') +
         ' and nowhere else, and a band arms only on a TRAINED provider after a labeled set ' +
         'measures it (governance/LOCAL-MODELS.md).')
      : ('NOT ENGAGED — no provider configured, so no seam will ask anything and none is ' +
         'promised. This is shadow-mode-first, not a failure. Configure judgment.provider.kind ' +
         '(`fixture` for a deterministic stub, `systemone` for a loopback judge) to engage.'));
  }

  if (sess.delegationHint) msg += '\n' + sess.delegationHint;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg }
  }));
});
