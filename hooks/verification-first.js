#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// verification-first — PreToolUse gate for browser/app-driving tools.
//   (generalized from a scripted-verification gate; OPTIONAL, off by default)
//
// WHY: ad-hoc clicks/evaluates against a live app are unrepeatable and let a
// model "verify" against a state it hand-drove into existence. This gate forces
// every app interaction through the project's SCRIPTED test API (a replayable
// macro / command layer) so verification is native and the library of flows
// grows as a side effect. If no scripted flow covers a need, you author one
// FIRST, then drive through it.
//
// Enabled only when verification.enabled = true. The matcher (which browser
// tools route here) is wired in settings from verification.browserTools. A call
// is allowed ONLY when it invokes a function in verification.allowedCalls (each
// beginning with verification.testApiPrefix). Pure observation tools are simply
// not routed here (kept out of the matcher), so loading + snapshotting stays open.
//
// Exit 2 → rejected (a rejection, not a nudge — a message loses to momentum).
//
// ─── THE RECEIPT READER (the instrument half) ────────────────────────────────
// The gate above polices HOW the app is driven. The reader below polices WHO
// drove it: a run that vouches for a change writes a RECEIPT, and the receipt
// names its INSTRUMENT. One shape serves every instrument — a browser driver and
// a desktop driver differ only in where a frame comes from, never in what a
// receipt says — so the reader is one function, not one per instrument.
//
//   node hooks/verification-first.js --receipt <path>      → exit 0 accepted / 2 refused
//   require('./verification-first.js').readReceipt(cfg, obj)
//
// A receipt is ACCEPTED only when it names an instrument the project DECLARED in
// verification.instruments[] and that entry is enabled. Everything else is
// refused, and each refusal is the same species of mistake:
//   • unreadable / unparseable            → refused (a payload it cannot read is
//     not a payload it may pass — "I couldn't read it, so I allowed it" is the
//     purest silence-as-a-pass);
//   • no `instrument` field               → refused (absence is not "the usual one");
//   • instrument not declared             → refused (a list of instruments silently
//     exempts every instrument added after it; declaration is what closes that);
//   • instrument declared but enabled:false → refused (a disabled instrument may not
//     vouch — that is what disabling it means);
//   • no `autoReds` array                 → refused (a receipt with no findings field
//     is silence scoring as clean, which is the disease the frame probe exists for).
// The reader does NOT judge the run's content — freshness, tree-hash binding and
// unacknowledged-RED policy belong to the project's own commit gate, which reads
// the same accepted object.

'use strict';
const fs = require('fs');
const CFG = require('./lib/config.js');

// readReceipt(cfg, receipt) → { ok:true, instrument } | { ok:false, reason, detail }
// `receipt` is the parsed object (or null when it could not be parsed at all).
function readReceipt(cfg, receipt) {
  const v = (cfg && cfg.verification) || {};
  const declared = Array.isArray(v.instruments) ? v.instruments : [];
  const names = declared.map(i => (i && i.id) || '').filter(Boolean);
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    return { ok: false, reason: 'unreadable',
      detail: 'the receipt is missing or is not a JSON object — refused (fail closed).' };
  }
  const id = receipt.instrument;
  if (!id || typeof id !== 'string') {
    return { ok: false, reason: 'no-instrument',
      detail: 'the receipt names no `instrument`. A receipt must say which instrument wrote it;\n' +
        'an absent name is not "the usual one". Declared: ' + (names.join(', ') || '(none)') };
  }
  const entry = declared.find(i => i && i.id === id);
  if (!entry) {
    return { ok: false, reason: 'undeclared',
      detail: 'instrument "' + id + '" is not declared in verification.instruments[].\n' +
        'Declared: ' + (names.join(', ') || '(none)') + '.\n' +
        'Declare it (id / kind / driver / launch / receipt / enabled) before any run of it counts.' };
  }
  if (entry.enabled !== true) {
    return { ok: false, reason: 'disabled',
      detail: 'instrument "' + id + '" is declared but enabled:false — a disabled instrument may not vouch.' };
  }
  if (!Array.isArray(receipt.autoReds)) {
    return { ok: false, reason: 'no-findings',
      detail: 'the receipt carries no `autoReds` array. A receipt with no findings field is not a clean\n' +
        'run — it is a run whose findings were never recorded. Write [] when there are none.' };
  }
  return { ok: true, instrument: id, kind: entry.kind || '', entry };
}

// CLI: --receipt <path>. Returns before any stdin handling is wired.
function receiptMain(argv) {
  const at = argv.indexOf('--receipt');
  if (at === -1) return false;
  const file = argv[at + 1] || '';
  const cfg = CFG.load(process.cwd());
  if (!cfg || !cfg.verification || !cfg.verification.enabled) { process.exit(0); return true; }
  let obj = null;
  try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { obj = null; }
  const r = readReceipt(cfg, obj);
  if (r.ok) {
    CFG.logGate(cfg, 'verification-first', 'PASS', file, 'receipt:' + r.instrument);
    process.exit(0); return true;
  }
  CFG.logGate(cfg, 'verification-first', 'BLOCK', file, 'receipt:' + r.reason);
  process.stderr.write(
'VERIFICATION-FIRST HARD-BLOCK — this receipt cannot vouch for anything.\n\n' +
'  receipt : ' + (file || '(none given)') + '\n' +
'  reason  : ' + r.reason + '\n\n' + r.detail + '\n\n' +
'An instrument is DECLARED, never assumed. Add it to verification.instruments[] in\n' +
'stack.config.json, wire its driver, and re-run — then the receipt it writes counts.\n');
  process.exit(2);
  return true;
}

if (require.main === module && receiptMain(process.argv.slice(2))) { /* exited */ }

module.exports = { readReceipt };

// The PreToolUse path. Wired only when INVOKED — a require() of this file (the
// fixture, or a project's commit gate reusing readReceipt) must not hold stdin open.
let input = '';
if (require.main === module) {
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch (e) { process.exit(0); return; }

  const cwd = (data && data.cwd) || process.cwd();
  const cfg = CFG.load(cwd);
  if (!cfg || !cfg.verification || !cfg.verification.enabled) { process.exit(0); return; }
  const v = cfg.verification;

  const body = JSON.stringify((data && data.tool_input) || {});
  const allowed = v.allowedCalls || [];
  if (allowed.length) {
    const alt = allowed.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    if (new RegExp('\\b(' + alt + ')\\s*\\(').test(body)) {
      CFG.logGate(cfg, 'verification-first', 'PASS', 'browser-tool', 'scripted-api'); process.exit(0); return;
    }
  }

  CFG.logGate(cfg, 'verification-first', 'BLOCK', 'browser-tool', data.tool_name || '');
  process.stderr.write(
'VERIFICATION-FIRST HARD-BLOCK — app interaction must route through the scripted test API.\n\n' +
'You cannot touch the app through a browser tool except via the ' + v.testApiPrefix + '* API.\n' +
'This call is not one of: ' + (allowed.join(', ') || '(none configured)') + ' → BLOCKED.\n\n' +
'Do this instead:\n' +
'  1) load the scripted-flow library once, then run the flow through it.\n' +
'  2) the call\'s return value carries the state you need — read THAT, not a raw evaluate.\n\n' +
'If NO scripted flow covers your need (a new element / path): STOP and AUTHOR ONE FIRST\n' +
'(handles from the CODE + the code registry, not from poking the live DOM), then drive through it.\n\n' +
'Observation stays open WITHOUT a scripted flow: navigate (load ' + (cfg.devServer.url || 'the dev server') + '),\n' +
'snapshot, screenshot, console messages — those are not routed here.\n');
  process.exit(2);
});
}
