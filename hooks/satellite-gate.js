#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// satellite-gate — PreToolUse gate for Bash (git commit).
//
// WHY: a composed design system is not atomic — its classes assume their
// ancestor context (surface tiers, generic flow rules, cumulative offsets).
// A SATELLITE surface (a standalone product built from the design system:
// an embeddable player, a docs/diary page, a portal) that reuses classes
// outside their real host chain renders wrong in dozens of ways at once,
// and each mismatch gets "fixed" as a styling patch when the defect is the
// HOST (STRIPPED-SHELL-HOST-MISMATCH — lived: one structural mismatch,
// ~40 symptoms, a 3-hour grind, product parked).
//
// This binds the satellite canon at the commit boundary: a commit staging
// any file listed in the satellite manifest must carry a `<trailer>:` line
// declaring parity was MEASURED (rendered-geometry comparison against the
// real app host) or an explicit n/a reason. The decision travels in git
// history — never a silent skip.
//
// Config-driven (satellite.*): enabled, trailerName, manifestFile. The
// manifest is JSON: { "satellites": [{ "files": [...] }], "prefixes": [...] }.
// No config / disabled / no manifest ⇒ no-op. Exit 2 → rejected.

'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const CFG = require('./lib/config.js');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch (e) { return; }
  const cmd = (data && data.tool_input && data.tool_input.command) || '';
  const cwd = (data && data.cwd) || process.cwd();
  const cfg = CFG.load(cwd);
  if (!cfg || !cfg.satellite || !cfg.satellite.enabled) return;
  const sc = cfg.satellite;
  const root = cfg.__repoRoot;

  // Real `git commit` only — strip quoted segments so payload strings that
  // merely quote the words don't trip the gate.
  const bare = cmd.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  if (!/\bgit\b[^|;&\n]*\bcommit\b/.test(bare)) return;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(
      path.join(root, sc.manifestFile || 'design/satellite-manifest.json'), 'utf8'));
  } catch (e) { return; } // no manifest → no satellites → no gate

  const files = (manifest.satellites || []).flatMap(s => s.files || []);
  const prefixes = manifest.prefixes || [];

  let staged;
  try {
    staged = execSync('git diff --cached --name-only', { cwd: root, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) { return; }

  const hits = staged.filter(f =>
    files.includes(f) || prefixes.some(p => f.startsWith(p)));
  if (!hits.length) return;

  const trailer = sc.trailerName || 'Satellite';
  const satLine = (cmd.match(new RegExp(trailer + ':\\s*([^\\n"\']+)', 'i')) || [])[1];

  function reject(msg) { CFG.logGate(cfg, 'satellite-gate', 'BLOCK', 'git commit', msg.split('\n')[0]); process.stderr.write(msg); process.exit(2); }

  const checklist =
    'Satellite canon (host-first law):\n' +
    '  1. HOST-FIRST — the unit of design-system reuse is HOST CHAIN + HELPERS +\n' +
    '     CLASSES, never classes alone. Mount components inside a REAL app host\n' +
    '     built by the REAL helpers — never a hand-rolled lookalike shell.\n' +
    '  2. Extraction is GENERATED from the rendered DOM (an extractor walks the\n' +
    '     live surface and pulls used classes + their ancestor-context rules +\n' +
    '     the FULL token block) — never a hand-curated CSS subset.\n' +
    '  3. MEASURED PARITY — getBoundingClientRect() the same component in the app\n' +
    '     and the satellite BEFORE any styling patch. TWO-MISMATCH TRIPWIRE:\n' +
    '     >=2 geometry mismatches on one component = a HOST problem — stop\n' +
    '     patching styles, fix the host, re-measure.\n\n' +
    'Trailer forms:\n' +
    '  ' + trailer + ': parity-measured (<component set / how>)\n' +
    '  ' + trailer + ': n/a (<why — content-only, no component DOM/CSS touched>)\n';

  if (!satLine) {
    reject('SATELLITE HARD-BLOCK — commit stages satellite surface(s) without a ' + trailer + ': trailer.\n\n' +
      'Staged satellite files:\n' + hits.map(f => '  ' + f).join('\n') + '\n\n' + checklist);
  }

  const sl = satLine.toLowerCase();
  if (!/parity-measured/.test(sl) && !/\bn\/a\b/.test(sl)) {
    reject('SATELLITE HARD-BLOCK — ' + trailer + ': trailer must declare "parity-measured (…)" or "n/a (<why>)".\n\n' +
      trailer + ' line: ' + satLine.trim() + '\n\n' + checklist);
  }
  if (!/\(.+\)/.test(sl)) {
    reject('SATELLITE HARD-BLOCK — ' + trailer + ': trailer requires detail in parentheses (what was measured, or why n/a).\n\n' +
      trailer + ' line: ' + satLine.trim() + '\n\n' + checklist);
  }

  CFG.logGate(cfg, 'satellite-gate', 'PASS', 'git commit', satLine.trim());
});
