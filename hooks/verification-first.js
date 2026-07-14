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

'use strict';
const CFG = require('./lib/config.js');

let input = '';
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
