#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// new-surface-consent — PreToolUse gate for Edit | Write | MultiEdit.
//
// WHY: makes it MECHANICALLY HARD to HAND-ROLL a NEW reusable surface — a
// re-implementation of a declared hand-roll shape, or (frontend only) mount/scroll
// CSS on a framework mount class, or a NEW CSS class — without the operator's
// EXPRESS consent. The failure it prevents: a model invents a fresh unit next to
// canon that already provides it, forking the vocabulary the registry keeps single.
// This is the discover-then-reuse gate — it forces DETERMINISTIC building against
// an existing codebase's own canon.
//
// Three shapes, ALL config-declared so nothing is language/framework-specific:
//   A. hand-roll shape — a code shape the project declared in machinery.signals[]
//      (a re-implemented helper the codebase already provides).
//   B. mount/scroll CSS — FRONTEND ONLY (frontend.enabled): a rule on the project's
//      mount classes (frontend.mountClassRe) touching layout props
//      (frontend.layoutPropRe). Empty regexes → skipped.
//   C. NEW CSS class — FRONTEND ONLY: a class ABSENT from the code registry.
//
// New EXPORTED helpers are NOT gated here — extraction is the sanctioned remedy
// (governed by helper-home.js). OVERRIDE: a consent token in the operator's own
// most-recent message. Exit 2 → rejected. No config / nothing declared ⇒ no-op.

'use strict';
const path = require('path');
const CFG = require('./lib/config.js');
const D = require('./lib/detect.js');

function _rx(src) { try { return src ? new RegExp(src) : null; } catch (e) { return null; } }

(function main() {
  let data;
  try { data = JSON.parse(D.readStdin()); } catch (e) { return; }
  const tool = data.tool_name;
  if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) return;

  const input = data.tool_input || {};
  const filePath = input.file_path || '';
  if (!filePath) return;

  const cfg = CFG.load(filePath);
  if (!cfg) return;
  if (D.isExemptFile(cfg, filePath)) return;

  const nc = D.newContentOf(tool, input);
  if (!nc) return;

  const shapes = [];
  const feOn = !!(cfg.frontend && cfg.frontend.enabled);

  // A — a project-declared hand-roll shape (machinery.signals[]).
  const fired = D.detectSignals(cfg, nc);
  if (fired.length) {
    shapes.push('A — hand-roll shape(s) [' + fired.join(', ') + '] the codebase already provides. Route through the canonical helper (see the registry task→helper map).');
  }

  // B — mount / scroll CSS (FRONTEND ONLY, style/markup files, config regexes).
  if (feOn && D.isStyleOrMarkup(cfg, filePath)) {
    const mountRe = _rx(cfg.frontend.mountClassRe);
    const layoutRe = _rx(cfg.frontend.layoutPropRe);
    if (mountRe && layoutRe && mountRe.test(nc) && layoutRe.test(nc)) {
      shapes.push('B — mount/scroll CSS (layout props on a framework mount class). This family breaks panel layout — reuse the existing mount/scroll rule instead of adding a new one.');
    }
  }

  // C — new CSS class not in the registry (FRONTEND ONLY; newCssClasses is a no-op otherwise).
  const reg = D.loadRegistry(cfg);
  if (reg.ok) {
    const newCls = D.newCssClasses(cfg, filePath, nc, reg);
    if (newCls.length) {
      shapes.push('C — NEW CSS class' + (newCls.length > 1 ? 'es' : '') + ' not in ' + cfg.canon.registryFile + ': ' +
        newCls.slice(0, 8).map(c => '`.' + c + '`').join(', ') + (newCls.length > 8 ? ' …' : '') +
        '. New chrome ⇒ express consent. If legit-new, get consent, land it, then regenerate the registry so it reads as known.');
    }
  }

  if (!shapes.length) { CFG.logGate(cfg, 'new-surface-consent', 'PASS', filePath, 'no-flag'); return; }

  if (D.hasConsent(cfg, data.transcript_path)) { CFG.logGate(cfg, 'new-surface-consent', 'PASS', filePath, 'consent'); return; }

  const msg = [
    'NEW-SURFACE HARD-BLOCK — ' + tool + ' rejected: hand-rolled new surface without express consent.',
    '', 'File: ' + path.relative(cfg.__repoRoot, filePath), 'Flagged:',
    ...shapes.map(s => '  • ' + s), '',
    'You may not hand-roll a new reusable surface (a re-implemented helper / mount-CSS',
    '/ new chrome class) without the operator\'s EXPRESS consent. Do ONE of:',
    '  1. Use the existing helper/class (scan ' + cfg.canon.registryFile + '). Almost always the answer.',
    '  2. If GENUINELY new, STOP and ask. Re-issue only after the operator replies',
    '     ' + (cfg.consent.tokens || []).join(' / ') + ' in their message.'
  ].join('\n');

  CFG.logGate(cfg, 'new-surface-consent', 'BLOCK', filePath, shapes.length + ' flag(s)');
  process.stderr.write(msg + '\n');
  process.exit(2);
})();
