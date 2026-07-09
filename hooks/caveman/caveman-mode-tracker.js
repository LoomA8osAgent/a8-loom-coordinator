#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// caveman — UserPromptSubmit hook. Tracks which caveman mode is active (writes
// the flag on /caveman commands + natural-language activation) and re-injects a
// terse per-turn reminder so the mode survives across turns even when other
// context competes for the model's attention.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultMode, safeWriteFlag, readFlag } = require('./caveman-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.caveman-active');

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase();

    // Natural-language activation.
    if ((/\b(activate|enable|turn on|start|talk like)\b.*\bcaveman\b/i.test(prompt) ||
         /\bcaveman\b.*\b(mode|activate|enable|turn on|start)\b/i.test(prompt)) &&
        !/\b(stop|disable|turn off|deactivate)\b/i.test(prompt)) {
      const mode = getDefaultMode();
      if (mode !== 'off') safeWriteFlag(flagPath, mode);
    }

    // Slash commands.
    if (prompt.startsWith('/caveman')) {
      const parts = prompt.split(/\s+/);
      const cmd = parts[0], arg = parts[1] || '';
      let mode = null;
      if (cmd === '/caveman-commit') mode = 'commit';
      else if (cmd === '/caveman-review') mode = 'review';
      else if (cmd === '/caveman-compress') mode = 'compress';
      else if (cmd === '/caveman') {
        if (arg === 'lite') mode = 'lite';
        else if (arg === 'ultra') mode = 'ultra';
        else if (arg === 'full') mode = 'full';
        else mode = getDefaultMode();
      }
      if (mode && mode !== 'off') safeWriteFlag(flagPath, mode);
      else if (mode === 'off') { try { fs.unlinkSync(flagPath); } catch (e) {} }
    }

    // Deactivation.
    if (/\b(stop|disable|deactivate|turn off)\b.*\bcaveman\b/i.test(prompt) ||
        /\bcaveman\b.*\b(stop|disable|deactivate|turn off)\b/i.test(prompt) ||
        /\bnormal mode\b/i.test(prompt)) {
      try { fs.unlinkSync(flagPath); } catch (e) {}
    }

    // Per-turn reinforcement (skip independent modes — their own skills conflict).
    // readFlag enforces symlink-safe read + size cap + whitelist; null on anomaly
    // means we inject nothing (never leak untrusted bytes into context).
    const INDEPENDENT_MODES = new Set(['commit', 'review', 'compress']);
    const activeMode = readFlag(flagPath);
    if (activeMode && !INDEPENDENT_MODES.has(activeMode)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: 'CAVEMAN MODE ACTIVE (' + activeMode + '). ' +
            'Drop articles/filler/pleasantries/hedging. Fragments OK. ' +
            'Code/commits/security: write normal.'
        }
      }));
    }
  } catch (e) {}
});
