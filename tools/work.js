#!/usr/bin/env node
// A8 Loom Coordinator — MIT License.
//
// work.js — THE work list. ONE flat list of everything that needs doing.
//
// ── THE RULES (governance/WORK.template.md) ────────────────────────────────
//   1. ONE file: WORK.tsv. There is no second work list.
//   2. ONE row per item: id <TAB> title <TAB> body. Body newlines are escaped (\n),
//      so nesting is NOT REPRESENTABLE. That is the point, not a limitation.
//   3. No status column. On the list = needs doing. An item that does not need
//      doing is DELETED — and a row leaves ONLY behind a real, non-checkpoint
//      commit (`done <id> <hash>` resolves the hash here).
//   4. Zero prose in the file: no header, no column labels, no section markers.
//      Usage is `--help`; history is `git log -p WORK.tsv`.
//   5. A row with no BODY is refused — a title alone sends the next reader hunting
//      for a doc. The body IS the item.
//
// ── WHY ────────────────────────────────────────────────────────────────────
// The ancestor of this list was a goal tree + a backlog file: 185 KB of prose with
// checkboxes buried in it (an open item averaged 15 lines / 1.3 KB). Every tool that
// had to FIND work was a regex over English, so every hole was a parser hole — one
// heading-word test hid 20 goals and 43 open items. NESTING, STATUS COLUMNS and
// RESIDENT DONE WORK were the disease; a flat list cannot express any of them.
//
// ── USAGE ──────────────────────────────────────────────────────────────────
//   node tools/work.js                          print the list
//   node tools/work.js show <id>                one item, body unescaped
//   node tools/work.js add "<title>" "<body>"   append one — BOTH required
//   node tools/work.js done <id> <hash>         remove it; REFUSED on a fake/WIP hash
//   node tools/work.js --check                  the gate (wire into .githooks/pre-commit)
//   node tools/work.js --file <path>            operate on another list (red-fixtures)
// EXIT  0 ok · 1 malformed / unproven · 2 unreadable input
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// `node tools/work.js | head -5` closes the pipe mid-write; without this the tool
// dies with an unhandled EPIPE stack instead of just stopping. A list you cannot
// pipe is a list you will not read.
process.stdout.on('error', (e) => { if (e && e.code === 'EPIPE') process.exit(0); });

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

// POSITIONAL ARGS, NOT argv[0]: `work.js --file X add "t" "b"` must still ADD.
// A CLI that does something else entirely when a flag moves is a CLI used wrong.
const FLAG_WITH_VALUE = new Set(['--file']);
const ARGS = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (FLAG_WITH_VALUE.has(a)) { i++; continue; }
  if (a.startsWith('--') || a === '-h') continue;
  ARGS.push(a);
}
const verb = ARGS[0];

// The repo root: the nearest ancestor holding stack.config.json or .git.
function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'stack.config.json')) ||
        fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(start);
    dir = up;
  }
}
const ROOT = findRoot(process.env.WORK_ROOT || path.join(__dirname, '..'));

// `--file <path>` exists so a red-fixture can point --check at a throwaway list.
// A gate that can only ever run against the real file cannot be PROVEN to fail,
// which is the vacuity this stack keeps finding in its own gates (GATE-FAILS-OPEN).
const fileFlag = argv.indexOf('--file');
const WORK = fileFlag !== -1 && argv[fileFlag + 1]
  ? path.resolve(argv[fileFlag + 1])
  : path.join(ROOT, 'WORK.tsv');

if (has('--help') || has('-h')) {
  // THE USAGE LIVES HERE, not in the file. WORK.tsv is rows and nothing else.
  process.stdout.write(
    'work.js — THE work list (one flat TSV: id <TAB> title <TAB> body).\n' +
    '  (no verb)                       print the list\n' +
    '  show <id>                       one item, body unescaped\n' +
    '  add "<title>" "<body>"          append one — BOTH required\n' +
    '  done <id> <hash>                remove it; refused on a fake or WIP hash\n' +
    '  --check                         validate the file (pre-commit gate)\n' +
    '  --file <path>                   operate on another list\n');
  process.exit(0);
}

function read() {
  let raw;
  try { raw = fs.readFileSync(WORK, 'utf8'); }
  catch (e) {
    if (e && e.code === 'ENOENT') return [];
    process.stderr.write('work.js: cannot read ' + WORK + ': ' + e.message + '\n');
    process.exit(2);
  }
  return raw.split('\n').filter((l) => l.length).map((line, i) => {
    const f = line.split('\t');
    return { n: i + 1, id: f[0], title: f[1], body: f[2], fields: f.length };
  });
}

function write(rows) {
  const out = rows.map((r) => [r.id, r.title, r.body].join('\t')).join('\n');
  fs.writeFileSync(WORK, out.length ? out + '\n' : '');
}

function git(args, opts) {
  return cp.execFileSync('git', args, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts || {}));
}

function slug(title) {
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16)
    || 'item';
  const ids = new Set(read().map((r) => r.id));
  if (!ids.has(base)) return base;
  for (let n = 2; ; n++) if (!ids.has(base + '-' + n)) return base + '-' + n;
}

// ── --check : the gate ─────────────────────────────────────────────────────
// It must be able to FAIL, and every refusal names the line and the remedy.
if (has('--check')) {
  const rows = read();
  const bad = [];
  const seen = new Set();
  rows.forEach((r) => {
    if (r.fields !== 3) bad.push('line ' + r.n + ': ' + r.fields + ' tab-separated fields, expected 3 (id\\ttitle\\tbody)');
    if (!r.id || /\s/.test(r.id)) bad.push('line ' + r.n + ': bad id "' + r.id + '" (no whitespace, never empty)');
    if (!r.title || !r.title.trim()) bad.push('line ' + r.n + ': empty title');
    if (!r.body || !r.body.trim()) bad.push('line ' + r.n + ': empty body — the body IS the item (rule 5)');
    if (seen.has(r.id)) bad.push('line ' + r.n + ': duplicate id "' + r.id + '"');
    seen.add(r.id);
    if (/\r/.test(r.body || '')) bad.push('line ' + r.n + ': carriage return in body');
  });
  if (bad.length) {
    process.stderr.write('WORK.tsv REFUSED (' + bad.length + '):\n  ' + bad.join('\n  ') + '\n');
    process.exit(1);
  }
  process.stdout.write('WORK.tsv ok — ' + rows.length + ' row(s)\n');
  process.exit(0);
}

// ── show ───────────────────────────────────────────────────────────────────
if (verb === 'show') {
  const id = ARGS[1];
  const row = read().find((r) => r.id === id);
  if (!row) { process.stderr.write('work.js: no row "' + id + '"\n'); process.exit(1); }
  process.stdout.write(row.id + '\t' + row.title + '\n\n' + String(row.body).replace(/\\n/g, '\n') + '\n');
  process.exit(0);
}

// ── add ────────────────────────────────────────────────────────────────────
if (verb === 'add') {
  const title = ARGS[1];
  const body = ARGS[2];
  if (!title || !body) {
    process.stderr.write('work.js add "<title>" "<body>" — BOTH required. A title alone sends the\n' +
      'next reader hunting for a doc; the body IS the item (what, where, what done looks like).\n');
    process.exit(1);
  }
  const rows = read();
  rows.push({ id: slug(title), title: String(title).replace(/\t/g, ' '), body: String(body).replace(/\t/g, ' ').replace(/\n/g, '\\n') });
  write(rows);
  process.stdout.write(rows[rows.length - 1].id + '\n');
  process.exit(0);
}

// ── done ───────────────────────────────────────────────────────────────────
// "Done" is not a sentence anyone can write; it is a commit that exists and is
// not a checkpoint. Both halves are resolved HERE, against git, not trusted.
if (verb === 'done') {
  const id = ARGS[1];
  const hash = ARGS[2];
  if (!id || !hash) { process.stderr.write('work.js done <id> <hash>\n'); process.exit(1); }
  const rows = read();
  const row = rows.find((r) => r.id === id);
  if (!row) { process.stderr.write('work.js: no row "' + id + '"\n'); process.exit(1); }
  let subject = '';
  try { subject = git(['log', '-1', '--format=%s', hash], { stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (e) {
    process.stderr.write('work.js: "' + hash + '" does not resolve to a commit in this repo.\n' +
      'A row leaves the list only behind a commit that exists.\n');
    process.exit(1);
  }
  if (/^\s*(WIP|wip)\b/.test(subject)) {
    process.stderr.write('work.js: "' + hash + '" is a checkpoint (' + subject + ').\n' +
      'A checkpoint is not a claim — close the arc with a non-WIP, gate-green commit.\n');
    process.exit(1);
  }
  write(rows.filter((r) => r.id !== id));
  process.stdout.write('struck ' + id + ' against ' + hash.slice(0, 8) + ' (' + subject + ')\n');
  process.exit(0);
}

if (verb) { process.stderr.write('work.js: unknown verb "' + verb + '" — see --help\n'); process.exit(1); }

// ── (no verb) : print the list ─────────────────────────────────────────────
const rows = read();
if (!rows.length) { process.stdout.write('(empty — nothing needs doing, or nothing was written down)\n'); process.exit(0); }
const w = rows.reduce((m, r) => Math.max(m, (r.id || '').length), 0);
rows.forEach((r) => {
  process.stdout.write((r.id || '').padEnd(w) + '  ' + (r.title || '') + '\n');
});
process.stdout.write('\n' + rows.length + ' row(s) — order is the only priority signal. `show <id>` for the body.\n');
