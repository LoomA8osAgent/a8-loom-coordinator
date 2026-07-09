#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// codegraph-sync-stale — UserPromptSubmit hook.
//
// WHY: catches edits made OUTSIDE this session (another Claude session, a manual
// edit, a git pull) by syncing the codegraph index when it hasn't been touched
// in > staleThresholdMinutes. Non-blocking detached spawn. No-ops if codegraph
// is absent or no index exists. See integrations/codegraph.md.

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
  const cwd = data.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!cwd) process.exit(0);

  const cfg = CFG.load(cwd);
  if (cfg && cfg.codegraph && cfg.codegraph.syncEnabled === false) process.exit(0);
  const thresholdMin = (cfg && cfg.codegraph && cfg.codegraph.staleThresholdMinutes) || 5;

  let dir = cwd, cgRoot = null;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.codegraph'))) { cgRoot = dir; break; }
    dir = path.dirname(dir);
  }
  if (!cgRoot) process.exit(0);

  const dbPath = path.join(cgRoot, '.codegraph', 'codegraph.db');
  if (!fs.existsSync(dbPath)) process.exit(0);
  let mtime; try { mtime = fs.statSync(dbPath).mtimeMs; } catch (e) { process.exit(0); }
  if (Date.now() - mtime < thresholdMin * 60 * 1000) process.exit(0);

  const HOME = os.homedir();
  const cands = ((cfg && cfg.codegraph && cfg.codegraph.binaryCandidates) || [
    '~/.local/bin/codegraph', '/opt/homebrew/bin/codegraph', '/usr/local/bin/codegraph'
  ]).map(p => p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);
  const bin = cands.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
  if (!bin) process.exit(0);
  spawn(bin, ['sync', cgRoot], { detached: true, stdio: 'ignore' }).unref();
  process.exit(0);
});
