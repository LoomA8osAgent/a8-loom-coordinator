#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// helper-home — PreToolUse gate for Edit | Write | MultiEdit.
//
// WHY: makes it IMPOSSIBLE to ship new UI capability as one-off private code. A
// new named DOM-building function (`function … { … createElement … }`) added to
// a file that is NOT a registered helper home is blocked UNLESS one of three
// sanctioned outcomes holds:
//   (a) it is EXPORTED in the same edit (window.X = …) — you ARE extracting a
//       shared helper (the correct remedy; the opposite of a hand-roll), OR
//   (b) its body CONSUMES a shared helper (a canon hint call) — a wiring method
//       composing canon, not a raw builder, OR
//   (c) it carries an explicit one-off marker AND the operator gave consent.
//
// This forces the classify-every-new-DOM-builder decision that gets skipped:
// "shared helper (export it)" or "operator-sanctioned one-off" — never silently
// a private reinvention. Config-driven (helper homes, hints, consent). Exit 2.

'use strict';
const path = require('path');
const CFG = require('./lib/config.js');
const D = require('./lib/detect.js');

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
  if (!D.isCodeFile(cfg, filePath)) return;          // only source builds DOM fns
  if (D.isHelperHome(cfg, filePath)) return;         // shared builders belong here

  const nc = D.newContentOf(tool, input);
  if (!nc) return;
  if (!D.domBuildingFn(nc)) return;

  // escape (a) — exported in the same edit (it IS a shared helper).
  if (/window\.[A-Za-z_]\w*\s*=/.test(nc) || /module\.exports\b/.test(nc)) {
    CFG.logGate(cfg, 'helper-home', 'PASS', filePath, 'exported-helper'); return;
  }
  // escape (b) — composes a shared helper (wiring method).
  if (D.callsSharedHelper(cfg, nc)) { CFG.logGate(cfg, 'helper-home', 'PASS', filePath, 'composes-helper'); return; }
  // escape (c) — explicit one-off marker + operator consent.
  if (D.hasOneOffMarker(cfg, nc) && D.hasConsent(cfg, data.transcript_path)) {
    CFG.logGate(cfg, 'helper-home', 'PASS', filePath, 'one-off+consent'); return;
  }

  const oneOffNoConsent = D.hasOneOffMarker(cfg, nc);
  const homes = (cfg.canon.helperHomes || []).join(', ');
  const msg = [
    'HELPER-HOME HARD-BLOCK — ' + tool + ' rejected: new DOM builder as one-off code.',
    '', 'File: ' + path.relative(cfg.__repoRoot, filePath) + '  (not a registered helper home)',
    'Issue: a named function that builds raw DOM (createElement) was added to a',
    'non-helper file, it is NOT exported, and it does not compose a shared helper.',
    'New UI capability may not ship as private one-off code.', '',
    'Resolve with ONE of:',
    '  (a) EXTRACT it as a shared helper — define it in a helper home and export it.',
    '      Homes: ' + homes,
    '  (b) COMPOSE existing helpers instead of building raw DOM (call a canon helper).',
    '  (c) If a JUSTIFIED one-off, add `// ' + (cfg.consent.oneOffMarker) + ': <reason>` in the',
    '      function AND get the operator\'s consent (' + (cfg.consent.tokens || []).join(' / ') + ').',
    oneOffNoConsent ? '      (A one-off marker is present but no operator consent token was found.)' : '',
    '', 'Make it IMPOSSIBLE to ship new UI without extracting a reusable helper.'
  ].filter(Boolean).join('\n');

  CFG.logGate(cfg, 'helper-home', 'BLOCK', filePath, 'raw-dom-builder');
  process.stderr.write(msg + '\n');
  process.exit(2);
})();
