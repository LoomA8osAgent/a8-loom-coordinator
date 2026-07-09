#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// caveman — SessionStart activation hook (terse output mode).
//
// WHY: token savings BOTH directions. A terse-mode contract drops filler,
// articles, and pleasantries from model output while ALL technical substance
// stays — fewer tokens per turn, cheaper + faster, without losing signal.
//
// Runs on every session start:
//   1. Writes the flag file (statusline + per-turn tracker read this).
//   2. Emits the caveman ruleset (for the active intensity level) as SessionStart
//      context — the full ruleset anchors behavior far better than a 2-line summary
//      (models drift back to verbose mid-conversation after context compression).
//   3. Nudges statusline setup if unconfigured.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag } = require('./caveman-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.caveman-active');
const settingsPath = path.join(claudeDir, 'settings.json');

const mode = getDefaultMode();

if (mode === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) {}
  process.stdout.write('OK');
  process.exit(0);
}

safeWriteFlag(flagPath, mode);

// Modes with their own skills — not intensity levels.
const INDEPENDENT_MODES = new Set(['commit', 'review', 'compress']);
if (INDEPENDENT_MODES.has(mode)) {
  process.stdout.write('CAVEMAN MODE ACTIVE — level: ' + mode + '. Behavior defined by /caveman-' + mode + ' skill.');
  process.exit(0);
}

// The self-contained ruleset (this package ships no external SKILL.md — the rules
// live here so a standalone install always has them).
const output =
  'CAVEMAN MODE ACTIVE — level: ' + mode + '\n\n' +
  'Respond terse like smart caveman. All technical substance stay. Only fluff die.\n\n' +
  '## Persistence\n\n' +
  'ACTIVE EVERY RESPONSE. No revert after many turns. No filler drift. Still active if unsure. ' +
  'Off only: "stop caveman" / "normal mode".\n\n' +
  'Current level: **' + mode + '**. Switch: `/caveman lite|full|ultra`.\n' +
  '  lite  — trim filler + pleasantries; keep grammar.\n' +
  '  full  — drop articles/filler/hedging; fragments OK. (default)\n' +
  '  ultra — maximal compression; telegraphic.\n\n' +
  '## Rules\n\n' +
  'Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries ' +
  '(sure/certainly/of course/happy to), hedging. Fragments OK. Short synonyms (big not extensive, ' +
  'fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact.\n\n' +
  'Pattern: `[thing] [action] [reason]. [next step].`\n' +
  'Not: "Sure! I\'d be happy to help. The issue is likely caused by..."\n' +
  'Yes: "Bug in auth middleware. Token expiry check uses `<` not `<=`. Fix:"\n\n' +
  '## Auto-Clarity (carve-outs — substance over brevity)\n\n' +
  'Drop caveman for: security warnings, irreversible-action confirmations, multi-step sequences where ' +
  'fragment order risks misread, user asks to clarify or repeats a question. Resume caveman after the ' +
  'clear part is done.\n\n' +
  '## Boundaries\n\n' +
  'Code / commits / PRs: write normal. "stop caveman" / "normal mode": revert. Level persists until ' +
  'changed or session end.';

// Statusline nudge.
let out = output;
try {
  let hasStatusline = false;
  if (fs.existsSync(settingsPath)) {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (settings.statusLine) hasStatusline = true;
  }
  if (!hasStatusline) {
    const scriptPath = path.join(__dirname, 'caveman-statusline.sh');
    const snippet = '"statusLine": { "type": "command", "command": ' + JSON.stringify('bash "' + scriptPath + '"') + ' }';
    out += '\n\nSTATUSLINE SETUP: a badge shows the active mode ([CAVEMAN], [CAVEMAN:ULTRA]). Not configured yet. ' +
      'Add to ' + settingsPath + ': ' + snippet;
  }
} catch (e) {}

process.stdout.write(out);
