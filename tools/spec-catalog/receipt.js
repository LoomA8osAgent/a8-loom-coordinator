#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// receipt.js — the compile receipt: write it, verify it.
//
//   node tools/spec-catalog/receipt.js        # list receipts, partitioned
//
// ONE home, required by BOTH sides: compile.js WRITES receipts, hooks/spec-gate.js
// READS them. Two implementations of "is this receipt valid" is exactly where a gate
// and its producer drift and the gate quietly starts accepting everything
// (PATCH-NOT-ESCALATED-TO-SHARED · GATE-FAILS-OPEN).
//
// DEPENDENCY-FREE, deliberately: the gate runs on every Edit and may not pay a
// vendored-package load to check an HMAC.
//
// THE THREE CHECKS, each closing a specific forgery:
//   1. emittedSha === sha256(emitted)       the BYTES are the ones the sha names
//                                           (else: edit `emitted`, keep the hmac)
//   2. hmac === HMAC(emittedSha+catalogSha) MACHINE-written (else: a hand-authored
//                                           receipt asserting its own validity)
//   3. catalogSha === the live catalog      not STALE (else: a receipt compiled
//                                           against a catalog the code has moved past)
//
// A MISSING KEY FILE FAILS ALL THREE, which is the correct direction: no key ⇒ no
// receipt verifies ⇒ the gate refuses. A verifier that passes when it cannot check is
// the failure this file exists to make impossible. The gate NEVER mints the key (only
// compile.js does) — a gate that can create the secret that satisfies it is not a gate.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const OUT_DIR = path.join(HERE, 'out');
const CATALOG_PATH = path.join(HERE, 'catalog.json');

// The machine-local key path is configurable (specCatalog.keyFile) so a project can
// place it where its own secrets live; it is read from the catalog, which the
// generator stamps, so the gate and the compiler cannot disagree about it.
function keyPath() {
  let p = '';
  try { p = (JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).keyFile) || ''; } catch (e) {}
  if (!p) p = '~/.claude/spec-catalog.key';
  if (p === '~') return os.homedir();
  if (p.indexOf('~/') === 0) return path.join(os.homedir(), p.slice(2));
  return path.isAbsolute(p) ? p : path.join(HERE, p);
}
const KEY_PATH = keyPath();

// `mint:true` creates the key (compile.js's first run). The GATE passes mint=false.
function loadKey(mint) {
  try {
    const k = fs.readFileSync(KEY_PATH, 'utf8').trim();
    if (k) return k;
  } catch (e) { /* fall through */ }
  if (!mint) return null;
  const k = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
  fs.writeFileSync(KEY_PATH, k + '\n', { mode: 0o600 });
  return k;
}

function hmacOf(emittedSha, catalogSha, key) {
  const k = key || loadKey(true);
  return crypto.createHmac('sha256', k)
    .update(String(emittedSha) + String(catalogSha)).digest('hex');
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// Read FRESH every call — staleness is the whole point of check 3, so this may never
// be cached across a process that outlives a rebuild.
function liveCatalogSha() {
  try { return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).sha || null; }
  catch (e) { return null; }
}

// The byte size of the prompt payload in force when a block was compiled, recorded on
// the receipt as `promptBytes`. It is PROVENANCE, not a check: the payload may be
// PRUNED per spawn (gen-catalog's `--sections`), so two receipts against one catalog
// can legitimately carry different sizes, and a compile is never refused over it. 0
// when the payload has not been generated yet.
//
// `verify()` IGNORES IT DELIBERATELY. A receipt written before this field existed must
// still verify: the three checks are over the BYTES, the KEY and the CATALOG, and
// widening them to a field that decides nothing would invalidate every receipt on disk
// for no gain. Tolerating an unknown field is not the same as failing open — the field
// is not evidence of anything.
const PROMPT_PATH = path.join(HERE, 'catalog.prompt.md');
function promptBytes() {
  try { return fs.statSync(PROMPT_PATH).size; } catch (e) { return 0; }
}

// One receipt → {ok, why}. `why` is reported in the refusal so a REJECTED receipt is
// diagnosable (stale vs forged vs tampered), never just absent: "no receipt covers
// this" and "your receipt is stale" are different answers and the second is actionable.
function verify(r, opts) {
  opts = opts || {};
  const key = opts.key !== undefined ? opts.key : loadKey(false);
  const live = opts.catalogSha !== undefined ? opts.catalogSha : liveCatalogSha();
  if (!r || typeof r !== 'object') return { ok: false, why: 'not an object' };
  if (typeof r.emitted !== 'string' || !r.emitted) return { ok: false, why: 'no `emitted` bytes' };
  if (!r.emittedSha || !r.catalogSha || !r.hmac) {
    return { ok: false, why: 'missing emittedSha/catalogSha/hmac' };
  }
  if (sha256(r.emitted) !== r.emittedSha) {
    return { ok: false, why: 'emittedSha does not match sha256(emitted) — the bytes were ' +
      'edited after compile' };
  }
  if (!key) return { ok: false, why: 'no machine key at ' + KEY_PATH + ' — nothing can verify' };
  if (hmacOf(r.emittedSha, r.catalogSha, key) !== r.hmac) {
    return { ok: false, why: 'HMAC invalid — not written by tools/spec-catalog/compile.js on ' +
      'this machine' };
  }
  if (!live) return { ok: false, why: 'live catalog.json unreadable — cannot judge staleness' };
  if (r.catalogSha !== live) {
    return { ok: false, why: 'STALE: compiled against catalog ' + String(r.catalogSha).slice(0, 12) +
      ', live catalog is ' + String(live).slice(0, 12) + ' — recompile the spec' };
  }
  return { ok: true, why: null };
}

// Every receipt in out/, partitioned. The REJECTED list is carried, not dropped.
function loadAll() {
  const valid = [], rejected = [];
  let names = [];
  try { names = fs.readdirSync(OUT_DIR).filter(f => /\.json$/.test(f)); }
  catch (e) { return { valid: valid, rejected: rejected, dir: OUT_DIR, present: 0 }; }
  const key = loadKey(false);
  const live = liveCatalogSha();
  for (const n of names) {
    let r;
    try { r = JSON.parse(fs.readFileSync(path.join(OUT_DIR, n), 'utf8')); }
    catch (e) { rejected.push({ file: n, why: 'unparseable JSON' }); continue; }
    const v = verify(r, { key: key, catalogSha: live });
    if (v.ok) valid.push(Object.assign({ file: n }, r));
    else rejected.push({ file: n, why: v.why, spec: r && r.spec });
  }
  return { valid: valid, rejected: rejected, dir: OUT_DIR, present: names.length };
}

// THE TEST THE GATE PERFORMS: is this added content byte-contained in a valid
// receipt? Trimmed at the ends only — the interior bytes must match, because the
// point is that the content IS the compiler's output and not a near-copy of it.
function covers(content, receipts) {
  const needle = String(content || '').trim();
  if (!needle) return null;
  for (const r of (receipts || [])) {
    if (r.emitted && r.emitted.indexOf(needle) !== -1) return r;
  }
  return null;
}

module.exports = { OUT_DIR, KEY_PATH, CATALOG_PATH, PROMPT_PATH,
  loadKey, hmacOf, sha256, liveCatalogSha, promptBytes, verify, loadAll, covers };

if (require.main === module) {
  const all = loadAll();
  console.log('receipts in ' + OUT_DIR + ': ' + all.present + ' present · ' +
    all.valid.length + ' VALID · ' + all.rejected.length + ' rejected');
  all.valid.forEach(r => console.log('  ok   ' + String(r.emittedSha).slice(0, 12) + '  ' +
    r.spec + '  [' + (r.helpers || []).join(', ') + ']'));
  all.rejected.forEach(r => console.log('  BAD  ' + r.file.slice(0, 12) + '  ' + r.why));
  if (!loadKey(false)) console.log('  ⚠ no machine key at ' + KEY_PATH);
}
