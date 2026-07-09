#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// lint-citations.js — mechanical `path/file.ext:NN` (and `:NN-MM` range)
// citation lint for markdown. Verifies each cited file exists and the line
// number(s) are in range. Kills fabricated / stale citations mechanically — the
// failure a hand-written spec accretes when it cites code that has since moved.
//
//   node tools/lint-citations.js <file.md> [more.md ...]
//   node tools/lint-citations.js --dir <dir>
//   node tools/lint-citations.js --changed        (git diff --name-only HEAD -- '*.md')
//   node tools/lint-citations.js --help
//
// Config (optional cfg.citations): extensions (tracked cite extensions),
// tryPrefixes (roots to resolve a cited path against). Exit 1 = bad citations.

'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

if (process.argv.includes('--help')) {
  console.log('lint-citations — verify path:line citations in markdown exist + are in range.\n' +
    'Usage: node tools/lint-citations.js <file.md ...> | --dir <d> | --changed');
  process.exit(0);
}

function loadConfig() {
  let d = process.cwd();
  while (d && d !== path.dirname(d)) { const c = path.join(d, 'stack.config.json'); if (fs.existsSync(c)) { const cfg = JSON.parse(fs.readFileSync(c, 'utf8')); cfg.__repoRoot = (cfg.project && cfg.project.repoRoot) || path.dirname(c); return cfg; } d = path.dirname(d); }
  return { __repoRoot: process.cwd() };
}
const CFG = loadConfig();
const ROOT = CFG.__repoRoot;
const CI = CFG.citations || {};

const EXTS = (CI.extensions || ['js', 'css', 'html', 'json', 'md', 'py', 'sh', 'rs', 'ts', 'tsx', 'go']).join('|');
const CITE_RE = new RegExp('([A-Za-z0-9_./-]+\\.(?:' + EXTS + ')):(\\d+)(?:-(\\d+))?', 'g');
const TRY_PREFIXES = CI.tryPrefixes || ['', 'src/', 'js/', 'tools/', 'specs/'];

function skippable(p) {
  if (/^https?:/.test(p)) return true;
  if (p.indexOf('...') !== -1 || p.indexOf('…') !== -1) return true;
  if (p.indexOf('node_modules') !== -1) return true;
  if (/^(file|path|foo|bar|example|module|somefile)\./.test(path.basename(p))) return true;
  return false;
}
function resolveCited(p) {
  for (const pre of TRY_PREFIXES) { const full = path.join(ROOT, pre + p); if (fs.existsSync(full) && fs.statSync(full).isFile()) return full; }
  return null;
}
const lineCountCache = new Map();
function lineCount(full) { if (lineCountCache.has(full)) return lineCountCache.get(full); const n = fs.readFileSync(full, 'utf8').split('\n').length; lineCountCache.set(full, n); return n; }

function lintFile(mdFile) {
  const rel = path.relative(ROOT, mdFile);
  let src; try { src = fs.readFileSync(mdFile, 'utf8'); } catch (e) { return [{ file: rel, line: 0, cite: '(unreadable)', problem: 'cannot read file' }]; }
  const problems = [];
  src.split('\n').forEach((ln, i) => {
    let m; CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(ln)) !== null) {
      const cited = m[1], a = parseInt(m[2], 10), b = m[3] ? parseInt(m[3], 10) : null;
      if (skippable(cited)) continue;
      lintFile.totals = (lintFile.totals || 0) + 1;
      const full = resolveCited(cited);
      if (!full) { problems.push({ file: rel, line: i + 1, cite: m[0], problem: 'cited file not found' }); continue; }
      const n = lineCount(full);
      if (a < 1 || a > n) problems.push({ file: rel, line: i + 1, cite: m[0], problem: 'line ' + a + ' out of range (file has ' + n + ' lines)' });
      else if (b !== null && (b < a || b > n)) problems.push({ file: rel, line: i + 1, cite: m[0], problem: 'range end ' + b + ' out of range (file has ' + n + ' lines)' });
    }
  });
  return problems;
}

let targets = [];
const args = process.argv.slice(2).filter(a => a !== '--config');
if (args[0] === '--dir') {
  const walk = d => fs.readdirSync(d).forEach(f => { const full = path.join(d, f); if (fs.statSync(full).isDirectory()) walk(full); else if (f.endsWith('.md')) targets.push(full); });
  walk(path.resolve(ROOT, args[1]));
} else if (args[0] === '--changed') {
  const out = cp.execSync("git diff --name-only HEAD -- '*.md'", { cwd: ROOT }).toString().trim();
  targets = out ? out.split('\n').map(f => path.join(ROOT, f)).filter(fs.existsSync) : [];
} else {
  targets = args.map(f => path.resolve(f));
}

if (!targets.length) { console.log('lint-citations: no targets'); process.exit(0); }
let all = [];
for (const t of targets) all = all.concat(lintFile(t));
console.log('lint-citations: ' + targets.length + ' file(s), ' + (lintFile.totals || 0) + ' citation(s), ' + all.length + ' problem(s)');
for (const p of all) console.log('  BAD  ' + p.file + ':' + p.line + '  [' + p.cite + ']  ' + p.problem);
process.exit(all.length ? 1 : 0);
