#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// new-surface-consent — PreToolUse gate for Edit | Write | MultiEdit.
//   (generalized from Anim8's anim8-ui-consent)
//
// WHY: makes it MECHANICALLY HARD to write NEW UI machinery — a hand-rolled
// slider host, mount/scroll CSS, or a NEW CSS class (new visual chrome) —
// without the operator's EXPRESS consent. The failure it prevents: a model
// invents a fresh class/surface next to canon that already provides it, forking
// the design vocabulary the registry exists to keep single.
//
// Three shapes, all via the shared detector so "UI machinery" never drifts:
//   A. slider-host hand-roll — an inputs.forEach loop building sxCreate sliders
//      by hand (the registry has a helper for this).
//   B. mount/scroll CSS — a rule on the framework mount classes touching
//      position/flex/min-height/overflow/display (the layout family that breaks
//      panels). Only checked in style/markup files; class names are configurable.
//   C. NEW CSS class — a rule defining a class ABSENT from the code registry.
//
// New EXPORTED helpers are NOT gated here — extraction is the sanctioned remedy
// (governed by helper-home.js). OVERRIDE: a consent token in the operator's own
// most-recent message. Exit 2 → rejected. No config ⇒ no-op.

'use strict';
const path = require('path');
const CFG = require('./lib/config.js');
const D = require('./lib/detect.js');

// Framework mount classes whose layout props break panels (shape B). Kept small
// + generic; projects extend via convention (any `*-editor` / overlay / floating).
const MOUNT_CLASS_RE = /\.(component|[A-Za-z][\w-]*-editor|ws-overlay-panel|ws-floating-panel)\b[^{}\n]*\{/;
const LAYOUT_PROP_RE = /\b(position|min-height|max-height|flex|overflow|display)\s*:/;

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

  // A — slider-host hand-roll.
  if (D.detectSignals(nc).includes('inputs-forEach-sxCreate')) {
    shapes.push('A — slider host hand-rolled (an inputs.forEach loop building sxCreate() sliders). Route through the canonical slider-host helper (see the registry task→helper map).');
  }

  // B — mount / scroll CSS (style/markup files only).
  if (D.isStyleOrMarkup(cfg, filePath)) {
    if (MOUNT_CLASS_RE.test(nc) && LAYOUT_PROP_RE.test(nc)) {
      shapes.push('B — component-mount / editor-scroll CSS (layout props on framework mount classes). This family breaks panel layout — reuse the existing mount/scroll rule instead of adding a new one.');
    }
  }

  // C — new CSS class not in the registry (new chrome).
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
    'NEW-SURFACE HARD-BLOCK — ' + tool + ' rejected: new UI machinery without express consent.',
    '', 'File: ' + path.relative(cfg.__repoRoot, filePath), 'Flagged:',
    ...shapes.map(s => '  • ' + s), '',
    'You may not write new UI machinery (hand-rolled host / mount-CSS / new chrome',
    'class) without the operator\'s EXPRESS consent. Do ONE of:',
    '  1. Use the existing helper/class (scan ' + cfg.canon.registryFile + '). Almost always the answer.',
    '  2. If GENUINELY new, STOP and ask. Re-issue only after the operator replies',
    '     ' + (cfg.consent.tokens || []).join(' / ') + ' in their message.'
  ].join('\n');

  CFG.logGate(cfg, 'new-surface-consent', 'BLOCK', filePath, shapes.length + ' flag(s)');
  process.stderr.write(msg + '\n');
  process.exit(2);
})();
