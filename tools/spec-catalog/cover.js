#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// cover.js — "which catalog entry COVERS this need?"
//
// ONE home, because the validator and the gate ask the SAME question at two moments:
// the validator asks it of a spec node that named a unit which does not exist, the
// gate asks it of an edit that hand-rolled what a unit already does. Two copies of
// that lookup would drift, and the REFUSAL is the half that matters — a rule in a
// refusal is a wall (PATCH-NOT-ESCALATED-TO-SHARED).
//
//   node tools/spec-catalog/cover.js <unitName | .className | "free text">
//
// DEPENDENCY-FREE ON PURPOSE. A PreToolUse hook runs on every Edit; it may not pay a
// vendored-package load just to print a refusal. This file requires catalog.json and
// nothing else.

'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const CATALOG_PATH = path.join(HERE, 'catalog.json');

let _cat = null;
function catalog() {
  if (_cat) return _cat;
  _cat = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return _cat;
}
// Absent/corrupt catalog ⇒ null, and EVERY caller must treat that as "I cannot
// answer", never as "nothing matched". A lookup that returns an empty answer when its
// data failed to load is GATE-FAILS-OPEN with extra steps.
function catalogOrNull() { try { return catalog(); } catch (e) { return null; } }

// ---- Levenshtein, capped ----------------------------------------------------
// Capped so the DP can bail: the only decision it feeds is "distance ≤ 2", and an
// uncapped walk over every known name per lookup is work nobody reads.
function lev(a, b, cap) {
  cap = cap == null ? 3 : cap;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = new Array(b.length + 1), cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}

function nearMiss(name, pool, cap) {
  cap = cap == null ? 2 : cap;
  const scored = [];
  for (const cand of pool) {
    const d = lev(name, cand, cap + 1);
    if (d <= cap && d > 0) scored.push({ name: cand, d: d });
  }
  scored.sort((x, y) => x.d - y.d || x.name.localeCompare(y.name));
  const best = scored.length ? scored[0].d : -1;
  const atBest = scored.filter(s => s.d === best);
  return { candidates: scored, unique: atBest.length === 1 ? atBest[0].name : null, best: best };
}

// ---- THE NAME RESOLVER — three arms, tightest first -------------------------
// A plain edit-distance rule is not enough, and that is measured rather than
// assumed: the dominant agent mistake is a TRUNCATED name, which is a PREFIX error
// and not a typo — `buildRowHost` → `buildRowHostFromItems` is 9 edits apart and
// invisible to any sane distance cap. So: three arms, EACH requiring UNIQUENESS.
//
//   A typo     Levenshtein ≤ 2                  (`buldRows` → `buildRows`)
//   B prefix   a proper prefix of exactly one   (`buildRowHost` → `buildRowHostFromItems`)
//   C tokens   camel tokens, in order, in one   (`buildHostItems` → `buildRowHostFromItems`)
//
// A LOOSER ARM NEVER RUNS AFTER A TIGHTER ONE FOUND ≥2 CANDIDATES: resolving with a
// looser rule an ambiguity a tighter rule already saw is exactly how a lossy fix gets
// called lossless. Two candidates ⇒ REFUSE with both named. Zero candidates ⇒ the
// name was INVENTED, and there is nothing to fix it to.
function camelTokens(n) {
  return String(n).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean);
}
function tokensInOrder(needle, hay) {
  let at = 0;
  for (const t of needle) {
    const i = hay.indexOf(t, at);
    if (i === -1) return false;
    at = i + 1;
  }
  return true;
}
function resolveName(name, pool) {
  const typo = nearMiss(name, pool, 2);
  if (typo.candidates.length) {
    return { unique: typo.unique, arm: 'typo',
      candidates: typo.candidates.filter(c => c.d === typo.best).map(c => c.name),
      all: typo.candidates.map(c => c.name) };
  }
  const pre = pool.filter(c => c !== name && c.indexOf(name) === 0);
  if (pre.length) {
    return { unique: pre.length === 1 ? pre[0] : null, arm: 'prefix',
      candidates: pre.slice().sort(), all: pre.slice().sort() };
  }
  const want = camelTokens(name);
  const tok = want.length ? pool.filter(c => c !== name && tokensInOrder(want, camelTokens(c))) : [];
  if (tok.length) {
    return { unique: tok.length === 1 ? tok[0] : null, arm: 'tokens',
      candidates: tok.slice().sort(), all: tok.slice().sort() };
  }
  return { unique: null, arm: null, candidates: [], all: [] };
}

function helperNames() { const c = catalogOrNull(); return c ? Object.keys(c.entries) : []; }
function classNames() { const c = catalogOrNull(); return c ? Object.keys(c.knownClasses || {}) : []; }

// ---- entry formatting — the refusal payload's body --------------------------
// ONE renderer, so the validator's issue and the gate's refusal describe an entry in
// the same words. `desc` / `slots` are null at the DERIVED tier and that is PRINTED
// rather than omitted — an agent told "slots: none" for a unit whose slots were never
// declared has been told something false.
function formatEntry(name, indent) {
  const c = catalogOrNull();
  const pad = indent || '  ';
  if (!c) return pad + name + '  (catalog unreadable — run `node tools/gen-catalog.js`)';
  const e = c.entries[name];
  if (!e) return pad + name + '  (NOT a catalog entry)';
  const out = [];
  out.push(pad + e.name + '  (' + e.file + ':' + e.line + ')   tier: ' + e.tier +
    (e.orphan ? '   ⚠ zero live callers' : '') +
    (e.defAlias ? '   (export aliases ' + e.defAlias + ')' : ''));
  out.push(pad + '  desc: ' + (e.desc ||
    '— (derived tier: no annotation block yet — see integrations/spec-catalog.md)'));
  if (e.props) {
    const req = Object.keys(e.props).filter(k => e.props[k].required);
    const opt = Object.keys(e.props).filter(k => !e.props[k].required);
    if (req.length) out.push(pad + '  required: ' + req.map(k => k + ': ' + e.props[k].type).join(', '));
    if (opt.length) out.push(pad + '  optional: ' + opt.join(', '));
  } else {
    out.push(pad + '  props (' + (e.propNames || []).length + ', names measured from the body — ' +
      'types undeclared): ' + (e.propNames || []).join(', '));
  }
  out.push(pad + '  slots:    ' + (e.slots
    ? (e.slots.length ? e.slots.join(', ') : 'none')
    : 'undeclared (derived tier) — read the unit\'s return at ' + e.file + ':' + e.line));
  const owns = (e.owns || []).concat((e.ownsConcat || []).map(x => x + ' (concat)'));
  if (c.frontend) {
    out.push(pad + '  owns:     ' + (owns.length
      ? owns.slice(0, 12).map(x => '.' + x).join(' ') + (owns.length > 12 ? ' …' : '') +
        '   (the compiler writes these; you never do)'
      : '— (writes no class of its own)'));
  }
  return out.join('\n');
}

// ---- "what covers this need?" ----------------------------------------------
// Two inputs, because the two callers hold different evidence:
//   signals  detector codes from the shared hook lib (the hand-roll shapes the
//            project DECLARED in machinery.signals) — a signal that names its unit
//            is the WHOLE answer
//   text     the content / the unknown name, scored against the task map
//
// The task map is NOT re-typed here: it is carried in catalog.json, straight off the
// registry config. A second hand-listed table is the duplication the layer forbids.
const STOP = new Set(['a', 'an', 'the', 'any', 'of', 'or', 'on', 'to', 'for', 'in', 'and',
  'one', 'per', 'its', 'not', 'with', 'from', 'new']);
function tokens(s) {
  return (String(s).toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || []).filter(t => !STOP.has(t));
}
function taskMatches(text, limit) {
  const c = catalogOrNull();
  if (!c) return [];
  const hay = String(text || '').toLowerCase();
  const rows = [];
  (c.taskMap || []).forEach((r, i) => {
    let score = 0;
    for (const t of tokens(r.task)) if (hay.indexOf(t) !== -1) score += 2;
    // the unit's own name appearing in the edit is weak evidence EITHER way, so it
    // scores 1: the author may be calling it correctly right beside a hand-roll
    if (r.use && hay.indexOf(String(r.use).split(/[^\w]/)[0].toLowerCase()) !== -1) score += 1;
    if (score > 0) rows.push({ i: i, score: score, row: r });
  });
  rows.sort((a, b) => b.score - a.score || a.i - b.i);
  return rows.slice(0, limit || 3).map(x => x.row);
}

// signal code → the ONE unit that answers it, declared by the project in
// specCatalog.signalEntry (a map, carried in catalog.json). A refusal is read once,
// under pressure: when the covering unit is not in doubt, printing four candidates
// and three task rows buries the answer, and that is how a wall becomes wallpaper.
function signalEntryMap() {
  const c = catalogOrNull();
  return (c && c.signalEntry) || {};
}

function coverFor(opts) {
  const c = catalogOrNull();
  if (!c) {
    return { entries: [], tasks: [], note: 'catalog.json unreadable — run ' +
      '`node tools/gen-catalog.js`. (The refusal stands: a lookup that cannot read its ' +
      'data may not answer "nothing matched".)' };
  }
  const o = opts || {};
  const entries = [];
  const seen = new Set();
  const push = (n) => { if (n && c.entries[n] && !seen.has(n)) { seen.add(n); entries.push(n); } };

  const map = signalEntryMap();
  const definite = (o.signals || []).map(s => map[s]).filter(n => n && c.entries[n]);
  if (definite.length) { definite.forEach(push); return { entries: entries, tasks: [], note: null }; }

  if (o.name) resolveName(o.name, helperNames()).candidates.slice(0, 3).forEach(push);
  const tasks = taskMatches((o.text || '') + ' ' + (o.name || ''), o.taskLimit || 3);
  tasks.forEach(r => push(r.use));

  return {
    entries: entries, tasks: tasks,
    note: entries.length ? null
      : 'no catalog entry scored against this edit. Scan the code registry (task map → units ' +
        '→ classes); if the capability genuinely does not exist it is NEW and needs the ' +
        'operator\'s express consent (NEW-VOCABULARY-WITHOUT-CONSENT).'
  };
}

function renderCover(cov, indent) {
  const pad = indent || '  ';
  const out = [];
  cov.entries.forEach(n => { out.push(formatEntry(n, pad)); out.push(''); });
  if (cov.tasks && cov.tasks.length) {
    out.push(pad + 'Task rows that match this edit:');
    cov.tasks.forEach(r => out.push(pad + '  ' + r.task + '  →  USE ' + r.use +
      (r.never ? '   ·   NEVER ' + r.never : '')));
    out.push('');
  }
  if (cov.note) out.push(pad + cov.note);
  return out.join('\n').replace(/\n+$/, '');
}

// ---- class cover (frontend only) --------------------------------------------
// Three answers, in the order that is actually useful: the class IS known; a catalog
// entry OWNS it (so the compiler writes it and the agent must not); or it is unknown,
// with the near-misses named. "That name is unknown" is a true and useless answer on
// its own.
function classCover(cls) {
  const c = catalogOrNull();
  if (!c) return { known: false, note: 'catalog unreadable' };
  const known = !!(c.knownClasses && c.knownClasses[cls]);
  const owners = [];
  for (const e of Object.values(c.entries)) {
    if ((e.owns || []).indexOf(cls) !== -1) owners.push({ helper: e.name, how: 'owns' });
    else if ((e.ownsConcat || []).indexOf(cls) !== -1) owners.push({ helper: e.name, how: 'owns (concat)' });
  }
  return { known: known, owners: owners, nearMiss: resolveName(cls, classNames()) };
}

function renderClassCover(cls, cc, indent) {
  const pad = indent || '  ';
  const out = [pad + '.' + cls + (cc.known ? '  — KNOWN (in the code registry)' : '  — not in the scan')];
  if (cc.owners && cc.owners.length) {
    out.push(pad + '  written by: ' + cc.owners.map(o => o.helper + ' [' + o.how + ']').join(', ') +
      '  — the compiler emits this class; a spec never names it');
  }
  if (cc.nearMiss && cc.nearMiss.candidates.length) {
    out.push(pad + '  near [' + cc.nearMiss.arm + ']: ' +
      cc.nearMiss.candidates.slice(0, 4).map(x => '.' + x).join(' ') +
      (cc.nearMiss.unique
        ? '   (unique near-miss — autofix repairs to .' + cc.nearMiss.unique + ')'
        : '   (' + cc.nearMiss.candidates.length + ' candidates — REFUSED, not fixed)'));
  }
  return out.join('\n');
}

module.exports = {
  CATALOG_PATH, catalog, catalogOrNull,
  lev, nearMiss, resolveName, camelTokens, helperNames, classNames,
  formatEntry, coverFor, renderCover, classCover, renderClassCover, taskMatches
};

if (require.main === module) {
  const a = process.argv.slice(2);
  const c = catalogOrNull();
  if (!c) { console.error('catalog unreadable — run `node tools/gen-catalog.js`'); process.exit(2); }
  if (!a.length) {
    console.log('catalog ' + String(c.sha).slice(0, 12) + ': ' + c.counts.helpers + ' units, ' +
      c.counts.classes + ' classes, ' + (c.taskMap || []).length + ' task rows');
    console.log('usage: node tools/spec-catalog/cover.js <unitName|.className|"free text">');
  } else if (a[0][0] === '.') {
    const cls = a[0].slice(1);
    console.log(renderClassCover(cls, classCover(cls), '  '));
  } else if (c.entries[a[0]]) {
    console.log(formatEntry(a[0], '  '));
  } else {
    console.log(renderCover(coverFor({ name: a[0], text: a.join(' ') }), '  '));
  }
}
