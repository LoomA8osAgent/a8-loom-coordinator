#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// spec-gate.selftest.js — the RED-FIXTURE for hooks/spec-gate.js.
//
//   node hooks/spec-gate.selftest.js
//
// A red-fixture proves its gate can FAIL: it hands the gate the input the gate exists
// to reject and asserts a non-zero exit. A gate that exits 0 on its own known-bad
// input is FAILING OPEN (`GATE-FAILS-OPEN`) — silence scoring as a pass is the
// disease, and this is the antibody. `hooks/README.md`: *every gate ships with a
// red-fixture proven to block on known-bad input and to pass on good input; a gate
// nobody has watched fail is a decoration.*
//
// THE LOAD-BEARING LEGS ARE (a)(b)(c)(d): the SAME freehand bytes, four times, with
// only the RECEIPT changing — absent → DENY, forged HMAC → DENY, stale catalogSha →
// DENY, valid+fresh → PASS. One variable, four verdicts, so the receipt is PROVEN to
// be the thing that decides rather than assumed to be.
//
// OVER-BLOCKING IS HOW A GATE GETS SWITCHED OFF, so the GREEN legs (a comment-only
// mention, a logic-only edit, an out-of-scope path, an emitted call block, the
// consent token) are as load-bearing as the red ones.
//
// It runs against the shipped example (`tools/spec-catalog/example/`), which is what
// that fixture codebase is FOR: a red-fixture needs a catalog, and a catalog needs
// code. Receipts must live in the dir the gate reads, so the legs write REAL files
// under a `_selftest.` prefix and remove them in a `finally` — a crashed run may not
// leave an artefact behind claiming to cover a fixture's freehand surface.
//
// FALSIFY IT (the meta-proof — a fixture that cannot fail proves nothing):
//   SPEC_GATE_SELFTEST_NEUTER=1 node hooks/spec-gate.selftest.js
// neuters the receipt check inside a throwaway copy of the gate; legs (a)(b)(c) and
// (e) must then go RED.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const PKG = path.resolve(__dirname, '..');
const EX = path.join(PKG, 'tools', 'spec-catalog', 'example');
const CAT_DIR = path.join(PKG, 'tools', 'spec-catalog');
const OUT_DIR = path.join(CAT_DIR, 'out');
const CONFIG = path.join(EX, 'stack.config.json');

let GATE = path.join(__dirname, 'spec-gate.js');
const NEUTER = process.env.SPEC_GATE_SELFTEST_NEUTER === '1';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-gate-fixture-'));
const written = [];
let failed = 0, passed = 0;

function cleanup() {
  for (const f of written) { try { fs.unlinkSync(f); } catch (e) {} }
  written.length = 0;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}
function die(m) { cleanup(); console.log('FAIL  spec-gate — ' + m); process.exit(1); }

// The NEUTERED gate: the receipt-coverage test always says "covered". This is the
// falsification channel — if the fixture stays green against a gate that cannot
// refuse, the fixture is proving nothing.
if (NEUTER) {
  const src = fs.readFileSync(GATE, 'utf8')
    .replace('const hit = receipts.covers(nc, all.valid);',
      'const hit = { emittedSha: "neutered" };');
  if (src.indexOf('neutered') === -1) die('neuter patch did not apply — the anchor moved');
  GATE = path.join(tmpDir, 'spec-gate.js');
  fs.writeFileSync(GATE, src);
  // the gate requires ./lib/* relative to itself
  fs.cpSync(path.join(__dirname, 'lib'), path.join(tmpDir, 'lib'), { recursive: true });
}

function runGate(input) {
  const r = cp.spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(input), encoding: 'utf8',
    env: Object.assign({}, process.env, { A8_STACK_CONFIG: CONFIG })
  });
  return { code: r.status, stderr: r.stderr || '', stdout: r.stdout || '' };
}
function expect(label, res, code) {
  if (res.code === code) { passed++; console.log('  ok   ' + label); return res; }
  failed++;
  console.log('  FAIL ' + label + '  (exit ' + res.code + ', expected ' + code + ')');
  if (res.stderr) console.log('       ' + res.stderr.split('\n').slice(0, 5).join('\n       '));
  return res;
}
const abs = (rel) => path.join(EX, rel);
const editOf = (rel, body, extra) => Object.assign({
  tool_name: 'Edit',
  tool_input: { file_path: abs(rel), old_string: 'x', new_string: body }
}, extra || {});

// ---- preconditions ----------------------------------------------------------
// A fixture that runs against a missing catalog reports RED for the wrong reason,
// and a RED nobody can diagnose gets disabled. Say so precisely instead.
if (!fs.existsSync(path.join(CAT_DIR, 'catalog.json'))) {
  die('no catalog at ' + path.join(CAT_DIR, 'catalog.json') + ' — build it first:\n' +
    '        node tools/gen-code-registry.js --config ' + CONFIG + '\n' +
    '        node tools/gen-catalog.js       --config ' + CONFIG);
}

// ---- the freehand block every receipt leg reuses VERBATIM --------------------
// It is the row-host hand-roll the example config DECLARES in machinery.signals: an
// items.forEach loop building rows by hand, which the task map answers with
// buildRowHostFromItems.
const FREEHAND = [
  '  function exFixRows(host, items) {',
  '    items.forEach(function (it) {',
  '      var row = document.createElement("div");',
  '      row.className = "ex-param-row";',
  '      host.appendChild(row);',
  '    });',
  '  }'
].join('\n');

// A receipt in the dir the gate reads. `forge` breaks the HMAC, `stale` breaks the
// catalogSha — everything else is exactly what compile.js writes.
function plantReceipt(tag, emitted, opts) {
  opts = opts || {};
  const R = require(path.join(CAT_DIR, 'receipt.js'));
  const live = R.liveCatalogSha();
  const catalogSha = opts.stale ? 'stale'.padEnd(64, '0') : live;
  const emittedSha = R.sha256(emitted);
  const key = R.loadKey(false);
  const rec = {
    spec: 'specs/ui-specs/_selftest-' + tag + '.json',
    specSha: R.sha256(tag), catalogSha: catalogSha, emittedSha: emittedSha,
    tier: 'declared', derivedTier: [], helpers: ['buildRowHostFromItems'],
    fn: 'exFixRows', out: 'out/_selftest-' + tag + '.js', emitted: emitted,
    written: new Date().toISOString(),
    // A HAND-AUTHORED receipt is exactly this: correct-looking fields and an hmac the
    // author made up. It must not verify — that is the shape which would fail the
    // WHOLE layer open, since anyone who can write a JSON file can produce it.
    hmac: opts.forge ? crypto.randomBytes(32).toString('hex')
      : (key ? R.hmacOf(emittedSha, catalogSha, key) : 'no-key')
  };
  const p = path.join(OUT_DIR, '_selftest.' + tag + '.json');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(rec, null, 2) + '\n');
  written.push(p);
  return rec;
}
function unplant() { for (const f of written.splice(0)) { try { fs.unlinkSync(f); } catch (e) {} } }

try {
  console.log('spec-gate red-fixture' + (NEUTER ? '  [NEUTERED — legs a/b/c/e must go RED]' : ''));

  // (a) freehand new surface, NO receipt → DENY
  const legA = expect('RED (a) freehand items.forEach+createElement, no receipt',
    runGate(editOf('src/panel.js', FREEHAND)), 2);
  if (!NEUTER && !/buildRowHostFromItems/.test(legA.stderr)) {
    die('(a) refusal did not carry the covering catalog entry — "spec first" is not an answer');
  }

  // (b) the SAME bytes with a HAND-AUTHORED receipt (forged HMAC) → DENY
  plantReceipt('forged', FREEHAND, { forge: true });
  const legB = expect('RED (b) same bytes + hand-authored receipt (forged HMAC)',
    runGate(editOf('src/panel.js', FREEHAND)), 2);
  if (!NEUTER && !/HMAC invalid/.test(legB.stderr)) {
    die('(b) refused but did not say WHY the receipt was rejected — stale and forged are ' +
      'different answers, and only one of them is actionable');
  }
  unplant();

  // (c) the SAME bytes, valid HMAC but STALE catalogSha → DENY
  plantReceipt('stale', FREEHAND, { stale: true });
  const legC = expect('RED (c) same bytes + valid HMAC but STALE catalogSha',
    runGate(editOf('src/panel.js', FREEHAND)), 2);
  if (!NEUTER && !/STALE/.test(legC.stderr)) die('(c) refused but did not report the staleness');
  unplant();

  // (d) the SAME bytes, fresh catalog + VALID HMAC → PASS.
  // THE LEG THAT PROVES THE RECEIPT IS DECISIVE: identical content to (a)(b)(c), and
  // the only thing that changed is that the receipt verifies.
  const planted = plantReceipt('valid', FREEHAND, {});
  if (planted.hmac === 'no-key') {
    die('no machine key — run `node tools/spec-catalog/compile.js ' +
      'tools/spec-catalog/example/specs/ui-specs/panel-rows.json` once to mint it. ' +
      '(A verifier with no key correctly refuses everything, so this leg cannot run.)');
  }
  expect('GREEN (d) IDENTICAL bytes, fresh+valid receipt — the receipt is what decides',
    runGate(editOf('src/panel.js', FREEHAND)), 0);
  unplant();

  // (e) a new class in the stylesheet, no receipt → DENY
  const legE = expect('RED (e) new CSS class in src/app.css with no receipt',
    runGate(editOf('src/app.css', '.ex-invented-lane { position: absolute; display: flex; }')), 2);
  if (!NEUTER && !/ex-invented-lane/.test(legE.stderr)) {
    die('(e) refusal did not name the minted class');
  }

  // (f) R1 — build tooling inside the application scope → DENY, both import forms
  const legF = expect('RED (f) require("@json-render/core") inside the app scope',
    runGate(editOf('src/chrome.js', "  var jr = require('@json-render/core');")), 2);
  if (!NEUTER && !/BUILD-TOOLING-STAYS-OUT-OF-THE-APP/.test(legF.stderr)) {
    die('(f) refusal did not name the rule');
  }
  expect('RED (f2) the ESM import form — a rule catching only require() waves through ' +
    'exactly the shape a modern paste arrives in',
    runGate(editOf('src/chrome.js', 'import { traverseSpec } from "@json-render/codegen";')), 2);

  // ---- the GREEN legs — over-blocking is how a gate gets switched off --------
  expect('GREEN a COMMENT naming @json-render in an app file — fires on INTRODUCE, not READ',
    runGate(editOf('src/chrome.js',
      '// emitted by tools/spec-catalog/compile.js (@json-render/core validateSpec)')), 0);

  expect('GREEN a logic-only edit — invisible to this gate',
    runGate(editOf('src/panel.js', '  if (items && items.length > cap) items = items.slice(0, cap);')), 0);

  expect('GREEN an emitted call block — the compiler\'s OUTPUT is the remedy and must never trip',
    runGate(editOf('src/panel.js', [
      '  var grp = window.buildSection({ prefix: \'ex\', label: \'parameters\' });',
      '  window.buildRowHostFromItems({ host: grp.body, items: items });',
      '  body.appendChild(grp.section);'
    ].join('\n'))), 0);

  expect('GREEN the same freehand block OUT OF SCOPE (a markdown file)',
    runGate(editOf('README.md', FREEHAND)), 0);

  expect('GREEN Bash is not gated',
    runGate({ tool_name: 'Bash', tool_input: { command: 'grep -rn json-render src' } }), 0);

  // (g) the operator's consent token in their OWN message clears (a). It is read from
  // the transcript by the shared D.hasConsent — the model cannot forge it — and NO
  // second escape is minted.
  const tx = path.join(tmpDir, 'transcript.jsonl');
  fs.writeFileSync(tx, JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'new-ok, hand-roll it for now' }] }
  }) + '\n');
  expect('GREEN (g) operator consent token in the transcript clears leg (a)',
    runGate(editOf('src/panel.js', FREEHAND, { transcript_path: tx })), 0);
  // …and the SAME payload with an empty transcript is still refused, so (g) proves
  // the TOKEN rather than a coincidence.
  expect('RED (g-neg) the same edit with an EMPTY transcript is still refused',
    runGate(editOf('src/panel.js', FREEHAND, { transcript_path: '/nonexistent/tx.jsonl' })), 2);

  console.log('\n' + (failed ? 'FAIL' : 'PASS') + '  spec-gate — ' + passed + ' ok, ' +
    failed + ' failed');
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);
