#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// gen-code-registry.js — generate the single index of every existing helper /
// export / CSS class / component / engine in a codebase, PLUS a §6 orphan report
// (exports with zero live callers). This is the anti-drift index the model scans
// before building anything, so nothing gets hand-rolled that already exists — and
// the file grep-required's GATE 2 requires you to consult.
//
// SCOPE NOTE: this reference generator recognizes JS/browser idioms (window
// exports, typeId:, *Engine, CSS classes, `<style>` blocks) — it is the FRONTEND
// reference implementation. A backend project points `session.generators` at its
// OWN registry generator (a ctags / codegraph / language-server pass emitting the
// same markdown shape: a task→helper map + backtick-quoted reusable symbols + an
// orphan section). The gates only require THAT `canon.registryFile` exists and is
// consulted — they do not care which generator produced it.
//
//   node tools/gen-code-registry.js            # write the registry
//   node tools/gen-code-registry.js --help
//
// Config-driven (stack.config.json): source.codeGlobs (scan roots+ext),
// source.styleFiles + markupFiles (class scan), canon.registryFile (output).
// Optional cfg.codeRegistry: { chromePrefixes[], taskMap[[building,use,never]] }.
// Fully derived from code → never drifts. A collapsed count is a red flag
// (a generated index that reads empty is worse than none) — the summary carries
// the counts so a scan-target regression is visible immediately.

'use strict';
const fs = require('fs');
const path = require('path');

if (process.argv.includes('--help')) {
  console.log('gen-code-registry — index every helper/export/class/component/engine + orphan report.\n' +
    'Usage: node tools/gen-code-registry.js [--config <path>]\n' +
    'Reads stack.config.json (walk-up from cwd). Writes canon.registryFile.');
  process.exit(0);
}

// ---- config resolution (walk-up for stack.config.json) ----------------------
function loadConfig() {
  const argi = process.argv.indexOf('--config');
  let p = argi >= 0 ? process.argv[argi + 1] : null;
  if (!p) { let d = process.cwd(); while (d && d !== path.dirname(d)) { const c = path.join(d, 'stack.config.json'); if (fs.existsSync(c)) { p = c; break; } d = path.dirname(d); } }
  if (!p || !fs.existsSync(p)) { console.error('gen-code-registry: no stack.config.json found.'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.__repoRoot = (cfg.project && cfg.project.repoRoot) || path.dirname(p);
  return cfg;
}
const CFG = loadConfig();
const ROOT = CFG.__repoRoot;
const OUT = path.join(ROOT, (CFG.canon && CFG.canon.registryFile) || 'UI-REGISTRY.md');

// scan roots + extension from codeGlobs (e.g. "js/**/*.js" → {root:'js', ext:'.js'})
const SCAN = ((CFG.source && CFG.source.codeGlobs) || ['js/**/*.js']).map(g => {
  const ext = g.slice(g.lastIndexOf('.'));
  const root = g.split('/**')[0].split('/*')[0];
  return { root: path.join(ROOT, root), ext };
});
const STYLE_FILES = ((CFG.source && CFG.source.styleFiles) || []).map(f => path.join(ROOT, f));
const MARKUP_FILES = ((CFG.source && CFG.source.markupFiles) || []).map(f => path.join(ROOT, f));

const CR = CFG.codeRegistry || {};
const CHROME_PREFIXES = CR.chromePrefixes || [
  'panelBuild', 'panelWire', 'panelStamp', 'a8Build', 'a8Open', 'floMod', 'sxCreate', 'sxSet', 'cardOpen', 'presetBank'
];
const CHROME_RE = new RegExp('^(' + CHROME_PREFIXES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');
const TASK_MAP = CR.taskMap || [];

// ---- scan helpers -----------------------------------------------------------
function walk(dir, ext, out) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.isFile() && p.endsWith(ext)) out.push(p);
  }
  return out;
}
function allCodeFiles() { const out = []; for (const s of SCAN) walk(s.root, s.ext, out); return out; }
function rel(p) { return path.relative(ROOT, p); }

const WINDOW_RE = /window\.([A-Za-z_][A-Za-z0-9_]*)\s*=/;
const FN_DEF_RE = /(?:function\s+|const\s+|var\s+|window\.)([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*function|=\s*\(|\()/;
const TYPEID_RE = /typeId:\s*['"]([a-z0-9-]+)['"]/;
const ENGINE_RE = /window\.([A-Za-z0-9_]*Engine)\s*=/;

function scanCode() {
  const files = allCodeFiles();
  const exportsMap = new Map(), chromeMap = new Map(), components = new Map(), engines = new Map();
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]; let m;
      if ((m = ln.match(WINDOW_RE))) {
        const name = m[1];
        if (!exportsMap.has(name)) exportsMap.set(name, { file: rel(f), line: i + 1 });
        if (CHROME_RE.test(name) && !chromeMap.has(name)) chromeMap.set(name, { file: rel(f), line: i + 1, sig: ln.trim().slice(0, 110) });
      }
      if ((m = ln.match(FN_DEF_RE)) && CHROME_RE.test(m[1]) && !chromeMap.has(m[1])) chromeMap.set(m[1], { file: rel(f), line: i + 1, sig: ln.trim().slice(0, 110) });
      if ((m = ln.match(TYPEID_RE)) && !components.has(m[1])) components.set(m[1], rel(f));
      if ((m = ln.match(ENGINE_RE)) && !engines.has(m[1])) engines.set(m[1], rel(f));
    }
  }
  return { exportsMap, chromeMap, components, engines };
}

function scanClasses() {
  const classes = new Map();
  const addRuleHead = (ln, file, i) => {
    if (!/[{,]\s*$/.test(ln) && !/\{/.test(ln)) return;
    const re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g; let m;
    while ((m = re.exec(ln))) if (!classes.has(m[1])) classes.set(m[1], file + ':' + (i + 1));
  };
  for (const f of STYLE_FILES) {
    if (!fs.existsSync(f)) continue;
    const ls = fs.readFileSync(f, 'utf8').split('\n');
    for (let i = 0; i < ls.length; i++) addRuleHead(ls[i], rel(f), i);
  }
  for (const f of MARKUP_FILES) {
    if (!fs.existsSync(f)) continue;
    const ls = fs.readFileSync(f, 'utf8').split('\n'); let inStyle = false;
    for (let i = 0; i < ls.length; i++) {
      if (/<style\b/i.test(ls[i])) inStyle = true;
      if (/<\/style>/i.test(ls[i])) inStyle = false;
      if (inStyle) addRuleHead(ls[i], rel(f), i);
    }
  }
  return classes;
}

// ---- orphan scan (the dead-code blind spot hooks can't see) -----------------
// For each export, count LIVE references (not the def, not the window.X= export,
// not inside a comment). Zero = orphan CANDIDATE (not a verdict — may be reached
// dynamically / by string). This is the check that auto-flags superseded surfaces.
function scanCallers(names) {
  const files = allCodeFiles();
  const live = new Map(); for (const n of names) live.set(n, 0);
  for (const f of files) {
    for (const raw of fs.readFileSync(f, 'utf8').split('\n')) {
      const ci = raw.indexOf('//'); const code = ci >= 0 ? raw.slice(0, ci) : raw;
      if (!code.trim()) continue;
      const toks = code.match(/[A-Za-z_]\w*/g); if (!toks) continue;
      const seen = new Set();
      for (const t of toks) {
        if (seen.has(t) || !live.has(t)) continue; seen.add(t);
        const isDef = new RegExp('(?:window\\.' + t + '\\s*=|function\\s+' + t + '\\b|\\b' + t + '\\s*[:=]\\s*function|\\b(?:const|var|let)\\s+' + t + '\\b)').test(code);
        if (!isDef) live.set(t, live.get(t) + 1);
      }
    }
  }
  return live;
}
const FEATURE_SURFACE = /(?:Open|Picker|Component|Engine)$|^(?:panelBuild|panelWire|panelStamp|a8Build|a8Open|floMod|cardOpen|sxCreate)/;
const DEBUG_NOISE = /^__|Debug|Dump|Test|^onerror$|^_/;

function table(rows) { return rows.map(r => '| ' + r.join(' | ') + ' |').join('\n'); }

function main() {
  const { exportsMap, chromeMap, components, engines } = scanCode();
  const classes = scanClasses();

  const chromeRows = [...chromeMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, v]) => ['`' + n + '`', v.file + ':' + v.line, '`' + v.sig.replace(/\|/g, '\\|') + '`']);
  const exportRows = [...exportsMap.keys()].sort().map(n => '`' + n + '`');
  const compRows = [...components.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, f]) => ['`' + t + '`', f]);
  const engRows = [...engines.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, f]) => ['`' + n + '`', f]);
  const classRows = [...classes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([c, l]) => '`.' + c + '` (' + l + ')');

  const out = [];
  out.push('# ' + ((CFG.canon && CFG.canon.registryFile) || 'UI-REGISTRY.md') + ' — the index of everything already built');
  out.push('');
  out.push('> **GENERATED — do not hand-edit.** `node tools/gen-code-registry.js` regenerates from source,');
  out.push('> so it never drifts. **Before building ANY UI, scan this file and USE what exists.** Reinventing');
  out.push('> a helper/class/component listed here is a hand-roll. If a capability is NOT here it is genuinely');
  out.push('> new — STOP and get operator consent.');
  out.push('');
  out.push('> Counts: ' + chromeRows.length + ' chrome helpers · ' + exportRows.length + ' exports · ' + classRows.length + ' CSS classes · ' + compRows.length + ' components · ' + engRows.length + ' engines.');
  out.push('');
  if (TASK_MAP.length) {
    out.push('## 0. Task → canonical helper (the anti-handroll map — READ FIRST)');
    out.push(''); out.push('| building… | USE | never |'); out.push('|---|---|---|');
    out.push(table(TASK_MAP.map(r => [r[0], '`' + r[1] + '`', r[2] || '']))); out.push('');
  }
  out.push('## 1. Chrome / UI helpers — scan before building any control/chrome');
  out.push(''); out.push('| helper | file:line | first line |'); out.push('|---|---|---|');
  out.push(table(chromeRows)); out.push('');
  out.push('## 2. Components (typeId) — already-built modules/editors');
  out.push(''); out.push('| typeId | file |'); out.push('|---|---|'); out.push(table(compRows)); out.push('');
  out.push('## 3. Engines'); out.push(''); out.push('| engine | file |'); out.push('|---|---|'); out.push(table(engRows)); out.push('');
  out.push('## 4. All exports (full API surface — grep here before adding a global)');
  out.push(''); out.push(exportRows.join(' · ')); out.push('');
  out.push('## 5. CSS classes — grep before adding ANY new class');
  out.push(''); out.push(classRows.join(' · ')); out.push('');

  const live = scanCallers(new Set(exportsMap.keys()));
  const orphans = [...exportsMap.entries()].filter(([n]) => live.get(n) === 0).sort((a, b) => a[0].localeCompare(b[0]));
  const featOrphans = orphans.filter(([n]) => FEATURE_SURFACE.test(n));
  const debugOrphans = orphans.filter(([n]) => !FEATURE_SURFACE.test(n) && DEBUG_NOISE.test(n));
  const otherOrphans = orphans.filter(([n]) => !FEATURE_SURFACE.test(n) && !DEBUG_NOISE.test(n));
  out.push('## 6. Orphan candidates — exports with ZERO live callers (VERIFY reachability)');
  out.push('');
  out.push('> A `window.`-export whose bareword appears nowhere as a LIVE call — only its own def / export /');
  out.push('> comments. **CANDIDATE, not a verdict.** May still be reached dynamically or string-registered.');
  out.push('> Before deleting, `grep <name>` excluding defs/exports/comments. Feature-surface orphans first.');
  out.push('');
  out.push('**Feature surface (' + featOrphans.length + '):** ' + (featOrphans.length ? featOrphans.map(([n, v]) => '`' + n + '` (' + v.file + ':' + v.line + ')').join(' · ') : '_none_'));
  out.push('');
  out.push('**Suspect (' + otherOrphans.length + '):** ' + (otherOrphans.length ? otherOrphans.map(([n, v]) => '`' + n + '` (' + v.file + ':' + v.line + ')').join(' · ') : '_none_'));
  out.push('');
  out.push('**Debug / internal (' + debugOrphans.length + '):** ' + (debugOrphans.length ? debugOrphans.map(([n]) => '`' + n + '`').join(' · ') : '_none_'));
  out.push('');

  fs.writeFileSync(OUT, out.join('\n'));
  console.log('code-registry written: ' + chromeRows.length + ' helpers, ' + exportRows.length + ' exports, ' + classRows.length + ' classes, ' + compRows.length + ' components, ' + engRows.length + ' engines. Orphans: ' + featOrphans.length + ' feature, ' + otherOrphans.length + ' suspect, ' + debugOrphans.length + ' debug.');
  if (exportRows.length === 0 && classRows.length === 0) console.error('WARNING: registry read EMPTY — check source.codeGlobs / styleFiles scan targets (an empty index is worse than none).');
}
main();
