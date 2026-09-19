#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// judgment-supervisor.selftest.js — the RED-FIXTURE for hooks/judgment-supervisor.js.
//
//   node hooks/judgment-supervisor.selftest.js
//
// ⚠ ITS ASSERTIONS ARE ABOUT WHAT WAS WRITTEN, NOT ABOUT AN EXIT CODE, and that follows
// directly from the seam's boundary: the monitor has no verdict to enforce, so "it exits
// 0" is true of every leg and proves nothing on its own. What can be wrong here is the
// FILE it wrote — a steer that should not exist, a steer written twice, a finding the
// policy discarded, a provider silently swapped for a stub.
//
// EVERY LEG RUNS THE `fixture` PROVIDER OR A DEAD PORT — zero network, zero weights, zero
// model. The fixture is TOLD what to answer, so a planted answer produces a planted
// verdict and THE POLICY'S OWN LOGIC (the direction of each question, the code-first
// short-circuit, steer-once, the grace period, the never-disengage rule) is what is under
// test. A leg cannot pass because a server was up and cannot fail because one was slow.
//
// WHAT A PLANTED ANSWER DOES *NOT* PROVE, stated rather than implied: nothing here
// measures whether real weights would return that answer on that observation. That is an
// ACCURACY question, it is measured nowhere in this package, and it is why no band in
// this seam is armed and why the seam may never refuse anything.
//
// OVER-PROPOSING IS HOW A MONITOR GETS IGNORED, so the quiet legs (a healthy lane writes
// NOTHING; a second poll inside the grace writes nothing and says why) are as
// load-bearing as the noisy ones. Without the healthy leg, "it steers" is satisfiable by
// steering always.
//
// FALSIFY IT (the meta-proof — a fixture that cannot fail proves nothing). Each of these
// is a one-line edit to hooks/judgment-roster.example.js, re-run, and WATCH it go red:
//   · `supervisorAction`'s 'steer-once' → 'continue'            ⇒ (s2) RED
//   · `lane_stuck`'s findingAt 'high' → 'low'                   ⇒ (s1) AND (s2) RED
//   · in `supervisorAction`, `inGrace` forced false             ⇒ (s2b) RED
//   · the `verdict.byCode` branch removed                       ⇒ (s2) RED — every NaN
//     comparison is false, so a code-answered finding crosses nothing and the policy
//     reports `continue` on a visibly stuck lane
// MEASURED 2026-09-20: 8 ok, 0 failed against the shipped roster; and with
// `supervisorAction`'s 'steer-once' replaced by 'continue', (s2), (s2b) and (s3) go RED — the steer
// IS the policy, and a fixture that stayed green against a policy that cannot steer
// would be proving nothing.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const MON = path.join(__dirname, 'judgment-supervisor.js');
const ROSTER_SRC = path.join(__dirname, 'judgment-roster.example.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'judgment-supervisor-fixture-'));
const T0 = 1700000000000;                 // the clock is PINNED so every leg is replayable
let passed = 0, failed = 0;

function cleanup() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
function die(m) { cleanup(); console.log('FAIL  judgment-supervisor — ' + m); process.exit(1); }
function ok(label) { passed++; console.log('  ok   ' + label); }
function bad(label, detail) { failed++; console.log('  FAIL ' + label + '\n       ' + detail); }

// ---- the fixture project ----------------------------------------------------
// A real config + the SHIPPED roster on disk, because the monitor resolves both at
// runtime the way it will in a project. A fixture that tested a roster nobody ships
// would be testing a file that does not exist.
fs.copyFileSync(ROSTER_SRC, path.join(tmp, 'judgment-roster.js'));

function writeConfig(name, judgment) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify({
    project: { name: 'fixture', repoRoot: tmp, rootMarkers: ['stack.config.json'] },
    source: { codeGlobs: ['src/**/*.js'], styleFiles: [], markupFiles: [] },
    canon: { registryFile: 'CODE-REGISTRY.md' },
    judgment: judgment
  }, null, 2));
  return p;
}
const baseJudgment = (extra) => Object.assign({
  enabled: true, roster: 'judgment-roster.js', timeoutMs: 4000,
  provider: { kind: '', baseUrl: '', modelId: '', fixturePath: '' },
  // THE INSTRUMENT WORDS ARE THE PROJECT'S, DECLARED ONCE, HERE. This package ships no
  // list of its own: a second list would silently exempt every instrument added to the
  // first.
  supervisor: { enabled: true, dir: tmp, instrumentWords: ['full-suite', 'coverage-sweep'] }
}, extra || {});
const CFG_ON = writeConfig('stack.config.json', baseJudgment());
const CFG_NOWORDS = writeConfig('stack.nowords.json',
  baseJudgment({ supervisor: { enabled: true, dir: tmp, instrumentWords: [] } }));

function mkFix(name, answers, dflt) {
  const p = path.join(tmp, name + '.json');
  fs.writeFileSync(p, JSON.stringify({ default: dflt === undefined ? 0.5 : dflt, answers }, null, 2));
  return p;
}
// A HEALTHY triple, planted per question because the three do not read the same way up:
// `lane_on_brief` is healthy HIGH, the other two are healthy LOW. A single `default`
// would make one of them a finding by accident — which is the bug this seam exists to
// not have.
const HEALTHY = mkFix('healthy', { lane_on_brief: 0.95, lane_stuck: 0.05, lane_over_proof: 0.05 });

const BRIEF = [
  'BUDGET: ~150K', 'PROOF: light', '',
  'DELIVERABLES:',
  '1. move the signal detector into src/detect.js',
  '2. one comparison at the seam',
  '',
  'RETURN BRIEF (<=2K): files written, the retrievals you actually ran.'
].join('\n');

function lane(key, steps, cfgFile, fixture, atMs) {
  fs.writeFileSync(path.join(tmp, key + '.brief'), BRIEF);
  fs.writeFileSync(path.join(tmp, key + '.observe'),
    steps.map(s => JSON.stringify(s)).join('\n') + '\n');
  const r = cp.spawnSync(process.execPath, [MON,
    '--dir', tmp, '--key', key, '--brief-file', path.join(tmp, key + '.brief'),
    '--cwd', tmp, '--agent', 'builder', '--once', '--now', String(atMs || T0)
  ], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      A8_STACK_CONFIG: cfgFile || CFG_ON,
      A8_DECISION_PROVIDER: fixture === null ? 'systemone' : 'fixture',
      A8_DECISION_FIXTURE: fixture === null ? '' : (fixture || HEALTHY),
      A8_DECISION_BASE_URL: fixture === null ? 'http://127.0.0.1:1' : '',
      A8_DECISION_TIMEOUT_MS: '2000',
      A8_DECISION_CLASS: ''
    })
  });
  const read = (ext) => { try { return fs.readFileSync(path.join(tmp, key + ext), 'utf8'); } catch (e) { return ''; } };
  return { code: r.status, log: read('.log'), pending: read('.pending'), stderr: r.stderr || '' };
}
function rows(res) {
  return res.pending.split('\n').filter(Boolean).map(l => JSON.parse(l));
}
function must(leg, res, needles) {
  const miss = needles.filter(n => res.log.indexOf(n) === -1);
  if (miss.length) { bad(leg, 'the log did not contain ' + JSON.stringify(miss) + '\n       ' + res.log); return false; }
  return true;
}

const STEP = (n, a) => ({ name: n, args: a });
const NORMAL = [STEP('Read', 'src/detect.js'), STEP('Edit', 'src/detect.js'),
  STEP('Bash', 'node --check src/detect.js'), STEP('Read', 'src/index.js')];

try {
  console.log('judgment-supervisor red-fixture');

  // (s1) HEALTHY — the leg that makes the other five mean something. Every question is
  // REPORTED with its value (a monitor that printed only its complaints would teach
  // nothing about its own coverage), the SPLIT is printed, and NOTHING is proposed.
  const s1 = lane('healthy', NORMAL);
  if (must('(s1) a healthy lane REPORTS everything and proposes NOTHING', s1,
    ['lane_on_brief = 0.95', 'lane_stuck = 0.05', 'lane_over_proof = 0.05',
      'questions: 0 answered by code', 'ADVISORY'])) {
    if (s1.pending.trim()) bad('(s1) a healthy lane REPORTS everything and proposes NOTHING',
      'it wrote a proposal:\n       ' + s1.pending);
    else ok('(s1) a healthy lane REPORTS everything and proposes NOTHING');
  }

  // (s2) STUCK — three identical consecutive steps. Answered BY CODE (never ask a model a
  // question a regex answers), and a code answer is a CERTAINTY that is NOT banded: it
  // crosses both cuts by construction. Exactly ONE steer, and the proposal must STATE
  // that the monitor cannot relay it — a proposal that read like an instruction would be
  // a monitor claiming an authority it does not have.
  const STUCK = NORMAL.concat([
    STEP('Bash', 'npm test'), STEP('Bash', 'npm test'), STEP('Bash', 'npm test')
  ]);
  const s2 = lane('stuck', STUCK);
  const r2 = rows(s2);
  if (must('(s2) a stuck lane is answered BY CODE and steered ONCE', s2,
    ['lane_stuck = by code', '3 identical consecutive steps', 'STEER-ONCE written',
      'questions: 1 answered by code'])) {
    if (r2.length !== 1) bad('(s2) a stuck lane is answered BY CODE and steered ONCE',
      'expected exactly 1 proposal, got ' + r2.length);
    else if (r2[0].action !== 'steer-once' || r2[0].question !== 'lane_stuck' || r2[0].byCode !== true) {
      bad('(s2) a stuck lane is answered BY CODE and steered ONCE', JSON.stringify(r2[0]));
    } else if (!/CANNOT RELAY/i.test(r2[0].note || '')) {
      bad('(s2) a stuck lane is answered BY CODE and steered ONCE',
        'the proposal does not say the monitor cannot relay it');
    } else ok('(s2) a stuck lane is answered BY CODE and steered ONCE');
  }

  // (s2b) THE GRACE — a second poll on the SAME lane, one minute later, with the lane
  // still visibly stuck. It writes NOTHING and SAYS WHY. A lane that has just been
  // steered is a lane whose next minute is not evidence of anything, and a monitor that
  // wrote one file per poll would be noise — which is how an advisory gets ignored.
  // ⚠ The counter is rehydrated from the pending FILE, not held in memory: this is a
  // second PROCESS, so a monitor that kept it in a variable would re-steer here.
  const s2b = lane('stuck', STUCK, CFG_ON, HEALTHY, T0 + 60000);
  if (must('(s2b) a second poll inside the grace writes nothing and says why', s2b,
    ['grace period', 'policy: continue'])) {
    if (rows(s2b).length !== 1) {
      bad('(s2b) a second poll inside the grace writes nothing and says why',
        'the pending file grew to ' + rows(s2b).length + ' rows');
    } else ok('(s2b) a second poll inside the grace writes nothing and says why');
  }

  // (s3) OVER-PROOF FROM THE DECLARED LIST — the brief declares the light tier and the
  // lane is visibly running an instrument the PROJECT declared. Answered by code, and the
  // word list is the one in config: this package ships none of its own.
  const s3 = lane('overproof', NORMAL.concat([STEP('Bash', 'make coverage-sweep --all')]));
  const r3 = rows(s3);
  if (must('(s3) an instrument from the project\'s own list is a CODE finding', s3,
    ['lane_over_proof = by code', 'coverage-sweep'])) {
    if (!r3.length || r3[0].question !== 'lane_over_proof') {
      bad('(s3) an instrument from the project\'s own list is a CODE finding',
        'expected an over-proof proposal, got ' + (s3.pending || '(nothing)'));
    } else ok('(s3) an instrument from the project\'s own list is a CODE finding');
  }

  // (s3b) NO LIST DECLARED ⇒ THE QUESTION GOES TO THE MODEL, LOUDLY. A gate that quietly
  // answered "no instruments" from an empty list would be reading absence of signal as
  // presence of correctness — silence scoring as a pass. **Silence is the one answer it
  // may not give.**
  const s3b = lane('nowords', NORMAL.concat([STEP('Bash', 'make coverage-sweep --all')]), CFG_NOWORDS);
  if (must('(s3b) with no declared list the question is ASKED, and the log says why', s3b,
    ['no judgment.supervisor.instrumentWords declared', 'lane_over_proof = 0.05',
      'questions: 0 answered by code'])) ok('(s3b) with no declared list the question is ASKED, and the log says why');

  // (s4) PROVIDER ERROR — engaged and nothing listening. The typed code is printed, the
  // monitor BACKS OFF and KEEPS ASKING, and it NEVER SWITCHES PROVIDER: the remedies
  // printed for a DEAD provider do not apply to a BUSY one, and dropping to the fixture
  // to get past it disengages a seam that is working.
  const s4 = lane('provider', NORMAL, CFG_ON, null);
  if (must('(s4) an unreachable provider backs off and NEVER switches', s4,
    ['ENGAGED and could not reach the provider', 'EDECISIONNOSERVER',
      'backing off, NOT disengaging'])) {
    // The assertion is that the PROVIDER LINE never names the stub — not that the word
    // never appears, since the client's own remedy text mentions it.
    if (/provider fixture/.test(s4.log)) {
      bad('(s4) an unreachable provider backs off and NEVER switches',
        'the log mentions the fixture — the monitor switched provider to get past an error');
    } else if (s4.pending.trim()) {
      bad('(s4) an unreachable provider backs off and NEVER switches',
        'it proposed something on an answer it never got');
    } else ok('(s4) an unreachable provider backs off and NEVER switches');
  }

  // (s5) NOT ENGAGED — no provider configured. PRINTED, never inferred from silence:
  // nothing was asked and nothing was promised. This is not failing open; failing open is
  // asking, failing, and proceeding anyway, which is (s4).
  fs.writeFileSync(path.join(tmp, 'unengaged.brief'), BRIEF);
  fs.writeFileSync(path.join(tmp, 'unengaged.observe'), JSON.stringify(STEP('Read', 'x')) + '\n');
  const r5 = cp.spawnSync(process.execPath, [MON, '--dir', tmp, '--key', 'unengaged',
    '--brief-file', path.join(tmp, 'unengaged.brief'), '--cwd', tmp, '--once', '--now', String(T0)], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, { A8_STACK_CONFIG: CFG_ON, A8_DECISION_PROVIDER: '' })
  });
  const log5 = fs.readFileSync(path.join(tmp, 'unengaged.log'), 'utf8');
  if (log5.indexOf('not engaged') === -1) bad('(s5) an unconfigured monitor says so and asks nothing', log5);
  else if (log5.indexOf('poll ·') !== -1) bad('(s5) an unconfigured monitor says so and asks nothing', 'it polled anyway');
  else ok('(s5) an unconfigured monitor says so and asks nothing');

  // (s6) THE SENTINEL IS THE PRIMARY EXIT, and it is a FILE rather than a signal: the
  // process that spawned this one detached left no handle, and a pid resolved after the
  // fact is not necessarily your pid.
  fs.writeFileSync(path.join(tmp, 'done.done'), String(T0));
  const s6 = lane('done', NORMAL);
  if (s6.log.indexOf('result sentinel seen') === -1) {
    bad('(s6) the sentinel is honoured and nothing is asked after it', s6.log);
  } else if (s6.log.indexOf('poll ·') !== -1) {
    bad('(s6) the sentinel is honoured and nothing is asked after it', 'it polled after the sentinel');
  } else ok('(s6) the sentinel is honoured and nothing is asked after it');

  console.log('\n' + (failed ? 'FAIL' : 'PASS') + '  judgment-supervisor — ' +
    passed + ' ok, ' + failed + ' failed');
} finally {
  cleanup();
}

process.exit(failed ? 1 : 0);
