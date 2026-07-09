#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// docsync-commit — PreToolUse gate for Bash (git commit).
//
// WHY: docs are the memory. A user-visible change that ships without its doc
// companions rots — the next session reinvents, collides with, or misses the
// feature (LIVE-FEATURE-UNDOCUMENTED). This binds the bidirectional doc duty at
// the commit boundary: a feature-surface commit must carry a `<trailerName>:`
// trailer declaring, PER PILLAR, which doc moved or an explicit n/a reason —
// the decision travels in git history, never a silent skip.
//
// Fully config-driven (docSync.*): trailer name, feature globs + exempt
// prefixes, the pillars[] (each with its staged-file prefixes), optional
// citation lint. No config / docSync disabled ⇒ no-op. Exit 2 → rejected.

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
  if (!cfg || !cfg.docSync || !cfg.docSync.enabled) return;
  const dc = cfg.docSync;
  const root = cfg.__repoRoot;

  // Adjudicate only a REAL `git commit` (not a command that merely quotes the
  // words). Strip quoted segments (incl. newlines) so a printf/echo of a payload
  // doesn't trip; the actual `git commit` keyword sits outside the quotes.
  const bare = cmd.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  if (!/\bgit\b[^|;&\n]*\bcommit\b/.test(bare)) return;

  const exemptMk = dc.exemptMarker || 'docsync-exempt';
  if (new RegExp('\\[' + exemptMk + ':\\s*[^\\]]+\\]').test(cmd)) return;

  let staged;
  try {
    staged = execSync('git diff --cached --name-only', { cwd: root, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch (e) { return; }

  const featureGlobs = dc.featureGlobs || [];
  const exemptPrefixes = dc.featureExemptPrefixes || [];
  const isFeature = f =>
    featureGlobs.some(g => (g.endsWith('/') ? f.startsWith(g) : f === g)) &&
    !exemptPrefixes.some(p => f.startsWith(p));
  const feat = staged.filter(isFeature);
  if (!feat.length) return;

  const pillars = dc.pillars || [];
  const stagedHas = {};
  pillars.forEach(p => { stagedHas[p.name] = staged.some(f => (p.stagedPrefixes || []).some(pre => f.startsWith(pre))); });

  const trailer = dc.trailerName || 'Docs';
  const docsLine = (cmd.match(new RegExp(trailer + ':\\s*([^\\n"\']+)', 'i')) || [])[1];

  function reject(msg) { CFG.logGate(cfg, 'docsync-commit', 'BLOCK', 'git commit', msg.split('\n')[0]); process.stderr.write(msg); process.exit(2); }

  // Optional citation lint on staged spec markdown.
  const cl = dc.citationLint;
  if (cl && cl.enabled && cl.command && cl.specGlobPrefix &&
      staged.some(f => f.startsWith(cl.specGlobPrefix) && f.endsWith('.md'))) {
    try { execSync(cl.command, { cwd: root, encoding: 'utf8', timeout: 30000 }); }
    catch (e) {
      const out = String((e.stdout || '') + (e.stderr || '')).split('\n').slice(0, 20).join('\n');
      reject('DOCSYNC HARD-BLOCK — citation lint failed on staged spec .md (fabricated / out-of-range file:line cites).\n\n' + out + '\n\nFix the cites and re-commit.\n');
    }
  }

  const pillarNames = pillars.map(p => p.name);
  const checklist =
    'Per-pillar duty (declare each: moved, or WHY not):\n' +
    pillars.map(p => '  ' + p.name + '  → ' + (p.stagedPrefixes || []).join(' / ')).join('\n') + '\n\n' +
    'Trailer forms:\n' +
    '  ' + trailer + ': ' + pillarNames.join('+') + '\n' +
    '  ' + trailer + ': ' + (pillarNames[0] || 'spec') + '; ' + (pillarNames[1] || 'manual') + ' n/a (<why>)\n' +
    '  ' + trailer + ': none (<why — pure refactor / zero user-visible delta>)\n';

  if (!docsLine) {
    reject('DOCSYNC HARD-BLOCK — feature-surface commit without a ' + trailer + ': trailer.\n\n' +
      'Staged feature files:\n' + feat.map(f => '  ' + f).join('\n') + '\n\n' + checklist);
  }

  const dl = docsLine.toLowerCase();
  const claims = {}; pillarNames.forEach(n => { claims[n] = new RegExp('\\b' + n + '\\b').test(dl); });
  const isNone = /\bnone\b/.test(dl);

  if (isNone && !/\(.+\)/.test(dl)) reject('DOCSYNC HARD-BLOCK — "' + trailer + ': none" requires a reason in parentheses.\n\n' + checklist);

  const missing = [];
  pillarNames.forEach(n => {
    if (!claims[n] || isNone) return;
    const na = new RegExp(n + '[^;,.]*n\\/a').test(dl);
    if (!na && !stagedHas[n]) missing.push(n);
  });
  if (missing.length) {
    reject('DOCSYNC HARD-BLOCK — ' + trailer + ': trailer claims [' + missing.join(', ') + '] moved, but no matching files are staged.\n\n' +
      trailer + ' line: ' + docsLine.trim() + '\n\n' + checklist);
  }

  if (!isNone) {
    const unaddressed = pillarNames.filter(n => !claims[n]);
    if (unaddressed.length) {
      reject('DOCSYNC HARD-BLOCK — ' + trailer + ': trailer leaves [' + unaddressed.join(', ') + '] unaddressed.\n\n' +
        trailer + ' line: ' + docsLine.trim() + '\n\nEvery pillar is a conscious call: name it moved, or give its n/a reason.\n\n' + checklist);
    }
  }

  CFG.logGate(cfg, 'docsync-commit', 'PASS', 'git commit', docsLine.trim());
});
