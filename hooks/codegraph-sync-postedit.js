#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// codegraph-sync-postedit — PostToolUse hook for Edit | Write | MultiEdit.
//
// WHY: keep the codegraph index fresh so `codegraph_explore` (caller/orphan/
// blast-radius queries) reflects the edit you just made. Non-blocking: detached
// spawn, returns immediately. No-ops gracefully if codegraph is not installed or
// no .codegraph/ index exists. See integrations/codegraph.md.

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const CFG = require('./lib/config.js');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(input); } catch (e) { process.exit(0); }
  if (!/^(Edit|Write|MultiEdit)$/.test(data.tool_name || '')) process.exit(0);

  const filePath = data.tool_input && data.tool_input.file_path;
  if (!filePath) process.exit(0);

  const cfg = CFG.load(filePath);
  if (cfg && cfg.codegraph && cfg.codegraph.syncEnabled === false) process.exit(0);

  if (!/\.(js|jsx|ts|tsx|py|rs|go|java|c|h|cpp|hpp|cs|php|rb|swift|kt)$/.test(filePath)) process.exit(0);

  // Find the nearest .codegraph directory.
  let dir = path.dirname(filePath), cgRoot = null;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.codegraph'))) { cgRoot = dir; break; }
    dir = path.dirname(dir);
  }
  if (!cgRoot) process.exit(0);

  const bin = resolveBin(cfg);
  if (!bin) process.exit(0);
  spawn(bin, ['sync', cgRoot], { detached: true, stdio: 'ignore' }).unref();
  process.exit(0);
});

function resolveBin(cfg) {
  const HOME = os.homedir();
  const cands = ((cfg && cfg.codegraph && cfg.codegraph.binaryCandidates) || [
    '~/.local/bin/codegraph', '/opt/homebrew/bin/codegraph', '/usr/local/bin/codegraph'
  ]).map(p => p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
  return cands.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}
