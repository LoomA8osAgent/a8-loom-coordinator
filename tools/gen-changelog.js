#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// gen-changelog.js — project a user-facing CHANGELOG.md from `git log`. Git IS
// the authoritative, append-only version log; this renders it reverse-chrono,
// grouped by session tag, filtered to what SHIPPED (feat/fix). Fully derived →
// no hand-curation, no doc-sync burden. Idempotent; overwrites each run.
//
//   node tools/gen-changelog.js [--config <path>]
//   node tools/gen-changelog.js --help
//
// Config (optional cfg.changelog): featureTypes (default feat,fix),
// sessionRegex (default S<NN>[ cont.<n>]), maxCommits, out (default CHANGELOG.md).

'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.argv.includes('--help')) {
  console.log('gen-changelog — project git log into a session-grouped, feature-filtered CHANGELOG.md.\n' +
    'Usage: node tools/gen-changelog.js [--config <path>]');
  process.exit(0);
}

function loadConfig() {
  const argi = process.argv.indexOf('--config');
  let p = argi >= 0 ? process.argv[argi + 1] : null;
  if (!p) { let d = process.cwd(); while (d && d !== path.dirname(d)) { const c = path.join(d, 'stack.config.json'); if (fs.existsSync(c)) { p = c; break; } d = path.dirname(d); } }
  if (!p || !fs.existsSync(p)) { console.error('gen-changelog: no stack.config.json found.'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.__repoRoot = (cfg.project && cfg.project.repoRoot) || path.dirname(p);
  return cfg;
}
const CFG = loadConfig();
const ROOT = CFG.__repoRoot;
const CL = CFG.changelog || {};
const OUT = path.join(ROOT, CL.out || 'CHANGELOG.md');
const MAX_COMMITS = CL.maxCommits || 600;
const FEATURE_RE = new RegExp('^(' + (CL.featureTypes || ['feat', 'fix']).join('|') + ')(\\([^)]*\\))?:', 'i');
const SESSION_RE = CL.sessionRegex ? new RegExp(CL.sessionRegex, 'i') : /\bS(\d{1,3})(?:[ .-]?cont\.?\s*(\d+)?)?/i;

function readLog() {
  let raw;
  try {
    raw = execFileSync('git', ['log', '--no-merges', '-n', String(MAX_COMMITS), '--pretty=format:%h\x1f%ad\x1f%s', '--date=short'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) { console.error('gen-changelog: git log failed — ' + (e.message || e)); return []; }
  return raw.split('\n').filter(Boolean).map(line => { const p = line.split('\x1f'); return { hash: p[0], date: p[1], subject: p.slice(2).join('\x1f') }; });
}

function parseSession(subject) {
  const scope = subject.match(/^[a-z]+(?:\(([^)]*)\))?:/i);
  if (scope && scope[1]) { const m = scope[1].match(SESSION_RE); if (m) return normSession(m); }
  const m = subject.match(SESSION_RE);
  return m ? normSession(m) : null;
}
function normSession(m) {
  let id = 'S' + parseInt(m[1], 10);
  if (m[0].toLowerCase().indexOf('cont') !== -1) id += ' cont' + (m[2] ? '.' + m[2] : '.');
  return id;
}
function isFeature(s) { return FEATURE_RE.test(s); }

function build(commits) {
  const groups = [], byId = new Map(); let running = null;
  for (const c of commits) {
    const tag = parseSession(c.subject); if (tag) running = tag;
    const sid = running || 'Recent';
    if (!isFeature(c.subject)) continue;
    let g = byId.get(sid);
    if (!g) { g = { session: sid, dateMin: c.date, dateMax: c.date, entries: [] }; byId.set(sid, g); groups.push(g); }
    if (c.date < g.dateMin) g.dateMin = c.date;
    if (c.date > g.dateMax) g.dateMax = c.date;
    g.entries.push(c);
  }
  return groups.filter(g => g.entries.length);
}
function fmtBullet(c) {
  const m = c.subject.match(/^((?:feat|fix)(?:\([^)]*\))?):\s*(.*)$/i);
  const body = m ? ('**' + m[1] + '** — ' + m[2]) : c.subject;
  return '- ' + body + ' `' + c.hash + '`';
}

function main() {
  const commits = readLog();
  const groups = build(commits);
  const out = ['# Changelog', '',
    '> **GENERATED — do not hand-edit.** `node tools/gen-changelog.js` regenerates from `git log`',
    '> (feature commits only, newest first, grouped by session). Git is the authoritative history.', ''];
  let total = 0;
  for (const g of groups) {
    const range = g.dateMin === g.dateMax ? g.dateMax : (g.dateMin + ' → ' + g.dateMax);
    out.push('## ' + g.session + ' — ' + range); out.push('');
    for (const c of g.entries) { out.push(fmtBullet(c)); total++; }
    out.push('');
  }
  if (!groups.length) { out.push('_No feature commits found._'); out.push(''); }
  fs.writeFileSync(OUT, out.join('\n'));
  console.log('CHANGELOG.md written: ' + groups.length + ' session groups, ' + total + ' entries (from ' + commits.length + ' commits).');
}
main();
