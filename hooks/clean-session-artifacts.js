#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// clean-session-artifacts — SessionStart hook.
//
// WHY: verification screenshots, snapshot dumps, and probe scratch accumulate at
// the repo root during a work session and get accidentally committed. There is
// no session-CLOSE event in Claude Code hooks, so this runs at session START =
// "clean the PREVIOUS session's leftovers" (equivalent + reliable).
//
// SAFETY (config-driven, conservative): only ever removes
//   (a) repo-root DEPTH-1 image files (artifacts.imageExtensions) — no image
//       belongs at the repo root; project images live in subdirs, NEVER touched;
//   (b) an explicit depth-1 scratch-name allow-list (artifacts.scratchPatterns);
//   (c) the contents of artifacts.scratchDirs (e.g. .playwright-mcp/).
// It never recurses into project dirs, never touches artifacts.keepFiles, and
// no-ops unless the dir is the project root (all project.rootMarkers present).

'use strict';
const fs = require('fs');
const path = require('path');
const CFG = require('./lib/config.js');

function main() {
  let root = process.cwd();
  try { const j = JSON.parse(fs.readFileSync(0, 'utf8')); if (j && j.cwd) root = j.cwd; } catch (e) {}

  const cfg = CFG.load(root);
  if (!cfg || !cfg.artifacts || !cfg.artifacts.enabled) { process.exit(0); }
  const a = cfg.artifacts;
  root = cfg.__repoRoot;

  // Guard: only run at the project root (all root markers present).
  const markers = (cfg.project && cfg.project.rootMarkers) || [];
  if (!markers.every(m => fs.existsSync(path.join(root, m)))) process.exit(0);

  const IMG = new RegExp('\\.(' + (a.imageExtensions || []).join('|') + ')$', 'i');
  const scratch = (a.scratchPatterns || []).map(p => { try { return new RegExp(p, 'i'); } catch (e) { return null; } }).filter(Boolean);
  const keep = new Set(a.keepFiles || []);

  const removed = [];
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { process.exit(0); }
  for (const e of entries) {
    if (!e.isFile() || keep.has(e.name)) continue;
    const isImg = a.sweepRootImages && IMG.test(e.name);
    const isScratch = scratch.some(rx => rx.test(e.name));
    if (!isImg && !isScratch) continue;
    try { fs.unlinkSync(path.join(root, e.name)); removed.push(e.name); } catch (e) {}
  }

  let scratchCount = 0;
  for (const d of (a.scratchDirs || [])) {
    const dir = path.join(root, d);
    if (!fs.existsSync(dir)) continue;
    const walk = w => {
      let items = [];
      try { items = fs.readdirSync(w, { withFileTypes: true }); } catch (e) { return; }
      for (const it of items) {
        const p = path.join(w, it.name);
        if (it.isDirectory()) { walk(p); try { fs.rmdirSync(p); } catch (e) {} }
        else { try { fs.unlinkSync(p); scratchCount++; } catch (e) {} }
      }
    };
    walk(dir);
  }

  if (removed.length || scratchCount) {
    process.stdout.write('ARTIFACT SWEEP — removed ' + removed.length + ' root artifact(s)' +
      (scratchCount ? ' + ' + scratchCount + ' scratch-dir file(s)' : '') +
      (removed.length ? ': ' + removed.slice(0, 12).join(', ') + (removed.length > 12 ? ' …' : '') : '') + '\n');
  }
  process.exit(0);
}

try { main(); } catch (e) { process.exit(0); }
