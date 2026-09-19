#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// verification-first.selftest.js — the RED-FIXTURE for hooks/verification-first.js.
//
//   node hooks/verification-first.selftest.js
//
// A red-fixture proves its gate can FAIL: it hands the gate the input the gate exists
// to reject and asserts a non-zero exit. A gate that exits 0 on its own known-bad
// input is FAILING OPEN (`GATE-FAILS-OPEN`) — silence scoring as a pass is the
// disease, and this is the antibody. `hooks/README.md`: *every gate ships with a
// red-fixture proven to block on known-bad input and to pass on good input; a gate
// nobody has watched fail is a decoration.*
//
// THE LOAD-BEARING LEGS ARE (d)(e)(f): the SAME receipt bytes, three times, with only
// the INSTRUMENT NAME changing — declared+enabled → PASS, declared-but-disabled →
// DENY, undeclared → DENY. One variable, three verdicts, so the DECLARATION is proven
// to be the thing that decides rather than assumed to be. That is the whole claim of
// an instrument roster: an instrument is declared, never assumed, and a roster that
// waved through a name nobody declared would silently exempt every instrument added
// after it was written.
//
// OVER-BLOCKING IS HOW A GATE GETS SWITCHED OFF, so the GREEN legs (the scripted call,
// the good receipt, and the whole gate going inert when verification.enabled is false)
// are as load-bearing as the red ones.
//
// FALSIFY IT (the meta-proof — a fixture that cannot fail proves nothing):
//   VERIFICATION_FIRST_SELFTEST_NEUTER=1 node hooks/verification-first.selftest.js
// neuters the declaration lookup inside a throwaway copy of the gate — every name then
// resolves to an enabled instrument. Legs (e) and (f) must go RED.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

let GATE = path.join(__dirname, 'verification-first.js');
const NEUTER = process.env.VERIFICATION_FIRST_SELFTEST_NEUTER === '1';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-first-fixture-'));
let failed = 0, passed = 0;

function cleanup() { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} }
function die(m) { cleanup(); console.log('FAIL  verification-first — ' + m); process.exit(1); }

// The NEUTERED gate: every instrument name resolves to a declared, enabled entry. This
// is the falsification channel — if the fixture stays green against a gate that cannot
// refuse an undeclared instrument, the fixture is proving nothing.
if (NEUTER) {
  const src = fs.readFileSync(GATE, 'utf8')
    .replace('const entry = declared.find(i => i && i.id === id);',
      'const entry = { id: id, enabled: true, kind: "neutered" };');
  if (src.indexOf('"neutered"') === -1) die('neuter patch did not apply — the anchor moved');
  GATE = path.join(tmpDir, 'verification-first.js');
  fs.writeFileSync(GATE, src);
  fs.cpSync(path.join(__dirname, 'lib'), path.join(tmpDir, 'lib'), { recursive: true });
}

// ---- the config under test --------------------------------------------------
// Written into the fixture's own tmp dir and reached through A8_STACK_CONFIG, so the
// fixture governs itself and never depends on whatever repo it is run from.
const INSTRUMENTS = [
  { id: 'browser', kind: 'browser', driver: 'node tools/run-flows.js',
    launch: 'http://localhost:8080/', receipt: 'verification/receipts/<hash>.json', enabled: true },
  { id: 'native', kind: 'native-desktop', driver: 'bash hooks/native-instrument.example.sh',
    launch: 'dist/MyApp.app', receipt: 'verification/receipts/<hash>.json', enabled: false },
];
function writeConfig(name, enabled) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, JSON.stringify({
    project: { name: 'fixture' },
    devServer: { url: 'http://localhost:8080/' },
    verification: {
      enabled: enabled, testApiPrefix: 'fx',
      allowedCalls: ['fxRun', 'fxRunBatch'],
      browserTools: ['mcp__example__browser_evaluate'],
      instruments: INSTRUMENTS,
    },
    install: { gateLog: path.join(tmpDir, 'gate.log') },
  }, null, 2));
  return p;
}
const CONFIG = writeConfig('stack.config.json', true);
const CONFIG_OFF = writeConfig('stack.config.off.json', false);

function run(args, input, cfg) {
  const r = cp.spawnSync(process.execPath, [GATE].concat(args || []), {
    input: input === undefined ? '' : input, encoding: 'utf8', cwd: tmpDir,
    env: Object.assign({}, process.env, { A8_STACK_CONFIG: cfg || CONFIG }),
  });
  return { code: r.status, stderr: r.stderr || '', stdout: r.stdout || '' };
}
function expect(label, res, code) {
  if (res.code === code) { passed++; console.log('  ok   ' + label); return res; }
  failed++;
  console.log('  FAIL ' + label + '  (exit ' + res.code + ', expected ' + code + ')');
  if (res.stderr) console.log('       ' + res.stderr.split('\n').slice(0, 4).join('\n       '));
  return res;
}

// A receipt in the shape every instrument writes. Only `instrument` varies across the
// load-bearing legs; `mutate` breaks one field at a time for the shape legs.
function plantReceipt(tag, instrument, mutate) {
  const rec = {
    instrument: instrument,
    timestamp: new Date().toISOString(),
    treeHash: '0123456789ab',
    launch: { app: 'dist/MyApp.app', pid: 4242, version: '1.2.3' },
    flows: [{ id: 'native.launch-nonblack', ok: true,
      frames: [{ file: 'frames/f00.png', sha256: 'a'.repeat(64), darkFrac: 0.94, avgLuma: 2.2 }],
      verdicts: { hang: null, console: null } }],
    autoReds: [],
  };
  if (typeof mutate === 'function') mutate(rec);
  const p = path.join(tmpDir, 'receipt-' + tag + '.json');
  fs.writeFileSync(p, JSON.stringify(rec, null, 2));
  return p;
}

console.log('verification-first red-fixture' + (NEUTER ? '  [NEUTERED — legs (e)(f) must go RED]' : ''));

// ---- the browser-tool half (unchanged behaviour, guarded against regression) --
const toolCall = (code) => JSON.stringify({
  cwd: tmpDir, tool_name: 'mcp__example__browser_evaluate', tool_input: { function: code },
});
// (a) GREEN — the scripted API is how the app is driven.
expect('(a) scripted-API call passes', run([], toolCall('() => fxRun("flow.one")')), 0);
// (b) RED — an ad-hoc poke at the running app.
expect('(b) ad-hoc browser call is DENIED', run([], toolCall('() => document.querySelector("#go").click()')), 2);
// (c) GREEN — the whole gate is inert when the project has not opted in.
expect('(c) inert when verification.enabled=false',
  run([], toolCall('() => document.querySelector("#go").click()'), CONFIG_OFF), 0);

// ---- the instrument half: ONE variable, three verdicts -----------------------
// (d) GREEN — a declared, enabled instrument may vouch.
expect('(d) receipt from a DECLARED+ENABLED instrument is accepted',
  run(['--receipt', plantReceipt('browser', 'browser')]), 0);
// (e) RED — the same bytes, an instrument nobody declared.
expect('(e) receipt from an UNDECLARED instrument is REFUSED',
  run(['--receipt', plantReceipt('ghost', 'ghost-driver')]), 2);
// (f) RED — declared, but switched off. Disabling it is what that means.
expect('(f) receipt from a DECLARED-but-DISABLED instrument is REFUSED',
  run(['--receipt', plantReceipt('native', 'native')]), 2);

// ---- the shape legs: absence never scores as a pass --------------------------
// (g) RED — no instrument field: absence is not "the usual one".
expect('(g) receipt naming NO instrument is REFUSED',
  run(['--receipt', plantReceipt('anon', 'browser', r => { delete r.instrument; })]), 2);
// (h) RED — no findings array: a receipt whose findings were never recorded is not clean.
expect('(h) receipt with NO autoReds array is REFUSED',
  run(['--receipt', plantReceipt('nofind', 'browser', r => { delete r.autoReds; })]), 2);
// (i) RED — unparseable: "I could not read it, so I allowed it" is the purest
//     silence-as-a-pass. Fail closed, loud.
(() => {
  const p = path.join(tmpDir, 'receipt-garbage.json');
  fs.writeFileSync(p, '{ this is not json');
  expect('(i) unparseable receipt is REFUSED (fail closed)', run(['--receipt', p]), 2);
})();
// (j) RED — a receipt path that does not exist at all.
expect('(j) missing receipt file is REFUSED',
  run(['--receipt', path.join(tmpDir, 'no-such-receipt.json')]), 2);

// ---- verdict ----------------------------------------------------------------
cleanup();
if (NEUTER) {
  // Under the neuter, (e) and (f) are EXPECTED to fail. A neutered run that reports all
  // green means the fixture is not testing what it claims.
  if (failed >= 2) { console.log('\nNEUTERED: ' + failed + ' leg(s) RED — the fixture is proving something.'); process.exit(0); }
  console.log('\nNEUTERED but only ' + failed + ' leg(s) went RED — the fixture proves nothing. FIX THE FIXTURE.');
  process.exit(1);
}
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
