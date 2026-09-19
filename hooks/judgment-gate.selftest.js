#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// judgment-gate.selftest.js — the RED-FIXTURE for hooks/judgment-gate.js.
//
//   node hooks/judgment-gate.selftest.js
//
// A red-fixture proves its gate can FAIL: it hands the gate the input the gate exists to
// reject and asserts a non-zero exit. A gate that exits 0 on its own known-bad input is
// FAILING OPEN — silence scoring as a pass is the disease, and this is the antibody.
// `hooks/README.md`: *every gate ships with a red-fixture proven to block on known-bad
// input and to pass on good input; a gate nobody has watched fail is a decoration.*
//
// EVERY LEG RUNS THE `fixture` PROVIDER OR A DEAD PORT — zero network, zero weights, zero
// model. That is not a convenience, it is what makes the legs mean anything: the fixture
// is TOLD what to answer, so a planted answer produces a planted verdict and THE GATE'S
// OWN LOGIC (the band, the argmax, the scope rule, the fail-closed path, the trained-only
// rule) is what is under test. A leg cannot pass because a server was up and cannot fail
// because one was slow.
//
// WHAT A PLANTED ANSWER DOES *NOT* PROVE, stated rather than implied: nothing here
// measures whether real weights would return that answer on that input. That is an
// ACCURACY question, it is measured nowhere in this package, and it is why no band in the
// shipped example roster is armed.
//
// OVER-BLOCKING IS HOW A GATE GETS SWITCHED OFF, so the GREEN legs (advisory-not-refusal,
// out-of-scope, not-engaged, not-adopted, a non-commit Bash call) are as load-bearing as
// the red ones. Without a scope leg, "it denies" is satisfiable by taxing everything.
//
// FALSIFY IT (the meta-proof — a fixture that cannot fail proves nothing):
//   JUDGMENT_GATE_SELFTEST_NEUTER=1 node hooks/judgment-gate.selftest.js
// neuters the provider-failure `process.exit(2)` inside a throwaway copy of the gate;
// legs (c) and (g) must then go RED with "expected exit 2, got exit 0" — the deny path IS
// the gate.
//
// MEASURED 2026-09-20: the suite is 21/21 against the real gate and **18 ok / 3 failed**
// against the neutered copy, with (c), (g) and (j3) reporting exactly "exit 0, expected 2"
// while every GREEN leg stays green (a neuter that reddened everything would prove only
// that the copy was broken). The refusals still PRINT under the neuter — which is the
// point of the leg: printing is not refusing, and only the exit code is the gate.

'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const PKG = path.resolve(__dirname, '..');
const ROSTER_SRC = path.join(__dirname, 'judgment-roster.example.js');
const NEUTER = process.env.JUDGMENT_GATE_SELFTEST_NEUTER === '1';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'judgment-gate-fixture-'));
let GATE = path.join(__dirname, 'judgment-gate.js');
let failed = 0, passed = 0;

function cleanup() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
function die(m) { cleanup(); console.log('FAIL  judgment-gate — ' + m); process.exit(1); }

// The NEUTERED gate: the provider-failure refusal becomes a pass. This is the
// falsification channel — if the fixture stays green against a gate that cannot refuse,
// the fixture is proving nothing.
if (NEUTER) {
  let src = fs.readFileSync(GATE, 'utf8');
  const i = src.indexOf('could not reach its provider');
  const j = src.indexOf('process.exit(2);', i);
  if (i === -1 || j === -1) die('neuter patch did not apply — the anchor moved');
  src = src.slice(0, j) + 'process.exit(0);' + src.slice(j + 'process.exit(2);'.length);
  GATE = path.join(tmp, 'judgment-gate.js');
  fs.writeFileSync(GATE, src);
  fs.cpSync(path.join(__dirname, 'lib'), path.join(tmp, 'lib'), { recursive: true });
}

// ---- the fixture project ----------------------------------------------------
// A real config + a real roster on disk, because the gate resolves both at runtime the
// way it will in a project. The roster is the SHIPPED EXAMPLE, copied verbatim — a
// fixture that tested a roster nobody ships would be testing a file that does not exist.
fs.copyFileSync(ROSTER_SRC, path.join(tmp, 'judgment-roster.js'));

function writeConfig(name, judgment) {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, JSON.stringify({
    project: { name: 'fixture', repoRoot: '', rootMarkers: ['stack.config.json'] },
    source: { codeGlobs: ['src/**/*.js'], styleFiles: [], markupFiles: [] },
    canon: { registryFile: 'CODE-REGISTRY.md' },
    judgment: judgment
  }, null, 2));
  return p;
}
const CFG_ON = writeConfig('stack.config.json', {
  enabled: true, roster: 'judgment-roster.js', stateMaxChars: 2000, timeoutMs: 4000,
  provider: { kind: '', baseUrl: '', modelId: '', fixturePath: '' }, seams: {}
});
// The SAME roster with the proofTier seam configured to REFUSE. Nothing about the
// questions changes — the band and the mode are the project's to tune, the questions are
// the roster's to own.
const CFG_REFUSE = writeConfig('stack.refuse.json', {
  enabled: true, roster: 'judgment-roster.js', stateMaxChars: 2000, timeoutMs: 4000,
  provider: { kind: '', baseUrl: '', modelId: '', fixturePath: '' },
  seams: { proofTier: { moment: 'spawn', mode: 'refuse', band: { adviseAtLevel: 2, refuseAtLevel: 2 } } }
});
const CFG_OFF = writeConfig('stack.off.json', { enabled: false });

function mkFix(name, answers, dflt) {
  const p = path.join(tmp, name + '.json');
  fs.writeFileSync(p, JSON.stringify({ default: dflt === undefined ? 0.9 : dflt, answers: answers }, null, 2));
  return p;
}
const ALL_PRESENT = mkFix('all-present', {
  requires_evidence_list: 0.97, has_return_shape: 0.95,
  names_executable_sources: 0.93, proof_tier_stated: 0.99, proof_tier_body: 0
});
const NO_EVIDENCE = mkFix('no-evidence', {
  requires_evidence_list: 0.04, has_return_shape: 0.95,
  names_executable_sources: 0.93, proof_tier_stated: 0.99, proof_tier_body: 0
});
const RUNG2 = mkFix('rung2', { proof_tier_body: 2 });
// A planted level OUTSIDE the submitted ladder is how an ENGAGED provider is made to FAIL
// while it is still reachable — the fixture refuses its own planted answer. ⚠ Stated
// plainly: a wholly UNREACHABLE provider can never exercise the SECOND seam's deny path,
// because the first seam denies on the same provider and exits. This is also the LIVE
// shape of the hole — a runtime whose export freezes the option slot at 2 answers every
// Noul and cannot answer a 3-level Score at all.
const BADLEVEL = mkFix('badlevel', { proof_tier_body: 5 });

function fixEnv(map) {
  return { A8_DECISION_PROVIDER: 'fixture', A8_DECISION_FIXTURE: map, A8_DECISION_CLASS: '' };
}

function runGate(input, env, cfgFile) {
  const r = cp.spawnSync(process.execPath, [GATE], {
    input: JSON.stringify(input), encoding: 'utf8',
    env: Object.assign({}, process.env, {
      A8_STACK_CONFIG: cfgFile || CFG_ON,
      A8_DECISION_PROVIDER: undefined, A8_DECISION_FIXTURE: undefined,
      A8_DECISION_BASE_URL: undefined, A8_DECISION_CLASS: undefined,
      A8_DECISION_TIMEOUT_MS: undefined
    }, env || {})
  });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function expect(label, res, code) {
  if (res.code === code) { passed++; console.log('  ok   ' + label); return res; }
  failed++;
  console.log('  FAIL ' + label + '  (exit ' + res.code + ', expected ' + code + ')');
  if (res.stderr) console.log('       ' + res.stderr.split('\n').slice(0, 6).join('\n       '));
  if (res.stdout) console.log('       ' + res.stdout.split('\n').slice(0, 6).join('\n       '));
  return res;
}
function mustSay(leg, res, needles) {
  if (NEUTER) return;
  const all = res.stdout + '\n' + res.stderr;
  needles.forEach(n => {
    if (all.indexOf(n) === -1) die(leg + ' output did not contain ' + JSON.stringify(n) + '\n' + all);
  });
}

const spawnOf = (prompt, agent) => ({
  tool_name: 'Agent',
  tool_input: { prompt: prompt, subagent_type: agent || 'builder', model: 'opus' }
});

const LIGHT_BRIEF = [
  'BUDGET: ~150K opus', 'PROOF: light', '',
  'Read hooks/lib/detect.js in full and move the signal detector to its shared home.',
  'RETURN BRIEF (<=2K): files written, the retrievals you actually ran (mandatory).'
].join('\n');

const HEAVY_BRIEF = [
  'BUDGET: ~400K opus', 'PROOF: heavy (the claim IS byte-identity across a corpus)', '',
  'Read the emitter in full and prove the output is unchanged.'
].join('\n');

try {
  console.log('judgment-gate red-fixture' + (NEUTER ? '  [NEUTERED — legs (c) and (g) must go RED]' : ''));

  // (a) GREEN — a conformant brief. Every Noul is REPORTED with its value, including the
  // ones that pass: a seam that printed only its complaints would teach nothing about its
  // own coverage, and the distribution is the only thing a future calibration reads off.
  const a = expect('GREEN (a) conformant brief passes with advisories',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(ALL_PRESENT)), 0);
  mustSay('(a)', a, ['requires_evidence_list', 'has_return_shape', 'names_executable_sources',
    'proof_tier_stated', 'ADVISORY', 'every question answered inside its band']);

  // (b) GREEN — a LOW answer. THE LOAD-BEARING SCOPE LEG: exit 0 is the ASSERTION here,
  // not a concession. The seam is graded ADVISORY-FIRST because reading a paragraph for a
  // clause is the fact-check family, whose ceiling is well below a refusing one; a seam
  // that blocked on this answer would be armed above its measured accuracy. The missing
  // clause must be NAMED — "something is off" is not actionable.
  const b = expect('GREEN (b) a low answer ADVISES, it does not refuse',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(NO_EVIDENCE)), 0);
  mustSay('(b)', b, ['requires_evidence_list = 0.04', 'MISSING', 'ADVISORY: requires_evidence_list']);

  // (c) RED — THE FAIL-CLOSED LEG. The seam is ENGAGED (a `systemone` provider is
  // configured) and nothing is listening. A gate that cannot ask does not get to approve;
  // an engaged seam that passed here would be fail-open in its purest form. The refusal
  // must carry the TYPED code (a refusal that says only "could not decide" is the
  // ERROR-REPORTED-AS-NOT-READY failure wearing a hook's clothes) AND a runnable remedy.
  const c = expect('RED (c) an engaged but unreachable provider DENIES',
    runGate(spawnOf(LIGHT_BRIEF), {
      A8_DECISION_PROVIDER: 'systemone',
      A8_DECISION_BASE_URL: 'http://127.0.0.1:1',
      A8_DECISION_TIMEOUT_MS: '2000'
    }), 2);
  mustSay('(c)', c, ['EDECISIONNOSERVER', 'judgment-server.example.sh', 'A8_DECISION_PROVIDER=fixture']);

  // (d) GREEN — SHADOW STATE. Adopted, but no provider configured: the gate PRINTS that it
  // is not engaged and passes. This is NOT failing open — fail-open is asking, failing and
  // approving anyway, which is leg (c), and it denies. The property that makes the
  // distinction auditable is that the state is printed rather than inferred from silence.
  const d = expect('GREEN (d) an adopted but unconfigured seam passes, LOUDLY',
    runGate(spawnOf(LIGHT_BRIEF), { A8_DECISION_PROVIDER: '' }), 0);
  mustSay('(d)', d, ['not engaged', 'nothing was asked and nothing was promised']);
  if (!NEUTER && /JUDGMENT seam \(briefAudit\) ·/.test(d.stdout)) {
    die('(d) an unengaged seam asked anyway');
  }

  // (e) GREEN — the Score at rung 0. The seam reports the LEVEL, the rung's own text, the
  // full distribution and the weighted score even with no complaint.
  const e = expect('GREEN (e) a light brief scoring at rung 0 is REPORTED and passes',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(mkFix('rung0', { proof_tier_body: 0 }))), 0);
  mustSay('(e)', e, ['JUDGMENT seam (proofTier)', 'level 0 — "one run of the thing that was changed',
    'probabilities: 0=', 'weighted score', 'every question answered inside its band']);

  // (f) GREEN — the TOP rung under a light label ADVISES. Same assertion as (b): the band
  // is unarmed, so a breach is printed and the spawn proceeds. The advisory must QUOTE THE
  // RUNG'S OWN WORDS — a bare level index is a number nobody can act on.
  const f = expect('GREEN (f) the top rung ADVISES with the rung\'s own words',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(RUNG2)), 0);
  mustSay('(f)', f, ['level 2 — "a suite — multiple instruments, or a sweep across a set"',
    'ADVISORY: proof_tier_body at level 2']);

  // (g) RED — a REACHABLE provider that CANNOT ANSWER. It is engaged, it responds, and its
  // answer is impossible (a rung outside the submitted ladder), so the client refuses it
  // and the gate denies. The refusal must be the SECOND seam's, or this leg is a duplicate
  // of (c) and the second seam's deny path is untested.
  const g = expect('RED (g) a provider that cannot answer DENIES',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(BADLEVEL)), 2);
  mustSay('(g)', g, ['EDECISIONFIXTURE', 'seam "proofTier" could not reach its provider']);
  if (!NEUTER && g.stderr.indexOf('seam "briefAudit" could not') !== -1) {
    die('(g) the first seam denied; the second seam\'s own deny path was never reached');
  }

  // (h) GREEN — REFUSE MODE ON A NON-TRAINED PROVIDER IS *NOT ARMED*. A refusal band is a
  // cut on a calibrated confidence number; a stub (or any provider whose class is not
  // declared TRAINED) does not produce that quantity, so the band does not arm and the
  // seam degrades to advisory FOR THIS RUN — loudly. Degrading silently in either
  // direction is the fail-open shape: pass-by-silence one way, refuse-on-a-thermometer
  // that-only-knows-hotter the other.
  const h = expect('GREEN (h) refuse mode on a non-TRAINED provider is NOT ARMED (and says so)',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(RUNG2), CFG_REFUSE), 0);
  mustSay('(h)', h, ['BAND NOT ARMED', 'not TRAINED']);

  // (h2) RED — the SAME configuration, the SAME planted answer, with the provider's class
  // DECLARED TRAINED. One variable, two verdicts: the class is what decides, rather than
  // being assumed to.
  const h2 = expect('RED (h2) the same band armed against a TRAINED-declared provider refuses',
    runGate(spawnOf(LIGHT_BRIEF),
      Object.assign(fixEnv(RUNG2), { A8_DECISION_CLASS: 'TRAINED' }), CFG_REFUSE), 2);
  if (!NEUTER && h2.stderr.indexOf('rejected by seam "proofTier"') === -1) {
    die('(h2) refused, but not by the band — the leg is measuring something else\n' + h2.stderr);
  }

  // ---- scope legs — over-blocking is how a gate gets switched off -----------

  // A seam may scope itself to the states it is about. Out of scope is NOT a verdict, and
  // the seam says so rather than staying silent about not having looked.
  const s1 = expect('GREEN (scope) a heavy brief is not body-scored',
    runGate(spawnOf(HEAVY_BRIEF), fixEnv(RUNG2)), 0);
  mustSay('(scope)', s1, ['JUDGMENT seam (proofTier): out of scope']);
  if (!NEUTER && /JUDGMENT seam \(proofTier\) · spawn/.test(s1.stdout)) {
    die('(scope) the Score ran under a heavy label');
  }

  expect('GREEN (scope) a non-commit Bash call claims no moment',
    runGate({ tool_name: 'Bash', tool_input: { command: 'grep -rn judgment hooks' } }, fixEnv(ALL_PRESENT)), 0);

  const off = expect('GREEN (scope) judgment.enabled:false is a SILENT no-op',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(ALL_PRESENT), CFG_OFF), 0);
  if (!NEUTER && (off.stdout + off.stderr).indexOf('JUDGMENT') !== -1) {
    die('(scope) an unadopted layer printed — an inert block must say nothing at all');
  }

  expect('GREEN (scope) an unreadable stdin envelope is not this gate\'s business',
    (function () {
      const r = cp.spawnSync(process.execPath, [GATE], { input: 'not json', encoding: 'utf8',
        env: Object.assign({}, process.env, { A8_STACK_CONFIG: CFG_ON }) });
      return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
    })(), 0);

  // (i) RED — the layer is ON and its roster EXISTS but will not load. A gate that cannot
  // load a roster somebody DECLARED has not found "no seam applies", it has found NOTHING,
  // and reporting that as a pass is fail-open by construction.
  fs.writeFileSync(path.join(tmp, 'broken-roster.js'), 'module.exports = {  // unterminated\n');
  const badRoster = writeConfig('stack.badroster.json', {
    enabled: true, roster: 'broken-roster.js',
    provider: { kind: 'fixture', fixturePath: ALL_PRESENT }
  });
  const i2 = expect('RED (i) an ON layer with an unreadable roster DENIES',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(ALL_PRESENT), badRoster), 2);
  mustSay('(i)', i2, ['judgment roster is unreadable', 'judgment-roster.example.js']);

  // (i2) GREEN — the layer is ON (the default) and NO roster file was ever written. That
  // is "nothing declared", which is a different state from "cannot read what was
  // declared": one printed line, exit 0. This leg is what makes ON-BY-DEFAULT safe —
  // without it, installing the stack would DENY every spawn in a project that has not yet
  // written a seam, which is how a gate gets switched off in week one.
  const noRoster = writeConfig('stack.noroster.json', {
    enabled: true, roster: 'nope/never-written.js',
    provider: { kind: 'fixture', fixturePath: ALL_PRESENT }
  });
  const i3 = expect('GREEN (i2) ON with NO roster file prints one line and passes',
    runGate(spawnOf(LIGHT_BRIEF), fixEnv(ALL_PRESENT), noRoster), 0);
  mustSay('(i2)', i3, ['no seams declared', 'Nothing was asked and nothing was promised']);

  // ---- the drift seam — pairs, the code-first short-circuit, and post-hoc ----
  //
  // THE PAIRED PATH IS A DIFFERENT PATH AND IS FIXTURED SEPARATELY. A pair question
  // builds its OWN state (A and B under labelled heads, the budget split between them),
  // runs a STRING comparison before it asks anything, and prints a split line. None of
  // that is exercised by the two single-text seams above.

  // A cited source file for the `doc` moment to read. Real bytes on disk: the reader
  // resolves the citation and reads the lines, and a fixture that stubbed that would be
  // testing its own stub.
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'src', 'app.js'),
    ['// panel',
     'function buildPanel(rows) {',
     '  returns rows unchanged;',
     '}'].join('\n'));

  const docOf = (body) => ({
    tool_name: 'Write',
    tool_input: { file_path: path.join(tmp, 'notes.md'), content: body }
  });
  // A claim whose words are NOT the code's words ⇒ the string comparison cannot answer
  // it, so the model is asked. That is the ONLY case a decision model is for.
  const DOC_ASK = 'The panel helper hands every caller a defensive copy of its input ' +
    '(src/app.js:3). Nothing else in the module allocates.';
  // A claim built from the cited line's OWN tokens ⇒ answerable by string comparison at
  // zero cost, and the model must never see it.
  const DOC_MATCH = 'function buildPanel returns rows unchanged, src/app.js:3.';

  // (j1) GREEN — a faithful pair is REPORTED with its value and its verdict word, and
  // the SPLIT LINE is printed whatever happens: a seam that found everything already
  // covered and a seam that asked nothing because it was broken must never look alike.
  const j1 = expect('GREEN (j1) a faithful pair is REPORTED with the split line',
    // ⚠ A PER-PAIR QUESTION'S FIXTURE KEY IS ITS WIRE ID (`<qid>__<label>`), not the
    // question id: one question over N pairs goes on the wire as N ids. Planting the
    // bare id here would answer NOTHING and the map's `default` would decide the leg —
    // which is exactly how a fixture ends up testing itself.
    runGate(docOf(DOC_ASK), fixEnv(mkFix('cite-ok', {}, 0.93))), 0);
  mustSay('(j1)', j1, ['JUDGMENT seam (drift)', 'cite_sentence_matches_lines [src/app.js:3]',
    '→ matches', '0 present by code match', '1 asked', 'every question answered inside its band']);

  // (j2) GREEN — a LOW answer is the FINDING for this seam, because the band reads the
  // other way up: high = yes = B still matches A = nothing is wrong. It ADVISES and the
  // pair is NAMED; exit 0 is the assertion, not a concession — no question in this seam
  // may ever refuse on its answer.
  const j2 = expect('GREEN (j2) planted drift ADVISES and NAMES the pair',
    runGate(docOf(DOC_ASK), fixEnv(mkFix('cite-drift', {}, 0.06))), 0);
  mustSay('(j2)', j2, ['→ DRIFT', '1 reading as DRIFT',
    'ADVISORY: cite_sentence_matches_lines [src/app.js:3]']);

  // (j3) RED — the same seam at the same PRE-HOC moment with nothing listening. A gate
  // that cannot ask does not get to approve, and the typed code is printed verbatim.
  const j3 = expect('RED (j3) an engaged but unreachable provider DENIES at a pre-hoc moment',
    runGate(docOf(DOC_ASK), {
      A8_DECISION_PROVIDER: 'systemone', A8_DECISION_BASE_URL: 'http://127.0.0.1:1',
      A8_DECISION_TIMEOUT_MS: '2000'
    }), 2);
  mustSay('(j3)', j3, ['EDECISIONNOSERVER', 'DENIED: seam "drift"']);

  // (j4) GREEN — THE CODE-FIRST LEG, and its proof is the UNREACHABLE PROVIDER. If the
  // seam asked anything at all it would print its typed error and (j3) shows it exits 2
  // when it does — so exit 0 with a `present by code match` line and no typed code is the
  // proof that ZERO forward passes were spent. Reading the printed line alone would not
  // be: a seam could print that line and ask anyway.
  const j4 = expect('GREEN (j4) a pair a string comparison answers costs no model call',
    runGate(docOf(DOC_MATCH), {
      A8_DECISION_PROVIDER: 'systemone', A8_DECISION_BASE_URL: 'http://127.0.0.1:1',
      A8_DECISION_TIMEOUT_MS: '2000'
    }), 0);
  mustSay('(j4)', j4, ['present by code match (no model call)', '1 present by code match', '0 asked']);
  if (!NEUTER && (j4.stdout + j4.stderr).indexOf('EDECISION') !== -1) {
    die('(j4) the seam reached for a provider it should never have needed\n' + j4.stdout + j4.stderr);
  }

  // (j5) GREEN — A POST-HOC MOMENT CANNOT REFUSE, AND SAYS SO. The worker has already
  // returned; a non-zero exit cannot un-spend it. The typed code is still printed and the
  // verdict is still ledgered as denied — the closest honest account available at a
  // boundary with no verdict to give. Exit 0 is the assertion.
  const j5 = expect('GREEN (j5) a provider error at a POST-HOC moment is reported, not refused',
    runGate({
      tool_name: 'Agent', hook_event_name: 'PostToolUse',
      tool_input: { prompt: LIGHT_BRIEF, subagent_type: 'builder' },
      tool_response: 'I read three unrelated files and rewrote the colour palette.'
    }, {
      A8_DECISION_PROVIDER: 'systemone', A8_DECISION_BASE_URL: 'http://127.0.0.1:1',
      A8_DECISION_TIMEOUT_MS: '2000'
    }), 0);
  mustSay('(j5)', j5, ['EDECISIONNOSERVER', 'REPORTED', 'post-hoc moment']);

  // (j6) GREEN — THE COMPACTION LEG, the headline: three operator rulings, a summary
  // carrying two of them verbatim, the third printed as MISSING. The two quoted rulings
  // are answered by STRING COMPARISON and cost nothing; only the paraphrase-or-absent one
  // reaches the model. And the finding prints ABOVE the report, because this output is
  // injected at the head of a resumed context and a finding printed underneath a report
  // arrives after the belief it was meant to correct.
  const R1 = 'ratified: the export adapter ships behind a flag';
  const R2 = 'yes, adopt the vendored parser';
  const R3 = 'no more per-record suites — accepted';
  const transcript = path.join(tmp, 'session.jsonl');
  fs.writeFileSync(transcript, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: R1 } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: R2 } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: R3 } }),
    // A TOOL RESULT is the same record type with an ARRAY content, and it is EXCLUDED —
    // otherwise the seam puts words in the operator's mouth and reports a "ruling" that
    // was never made.
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'yes it compiled' }] } }),
    JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
    JSON.stringify({ type: 'user', isCompactSummary: true, message: { role: 'user', content:
      '## Decisions\n- ' + R1 + '\n\n## Also\n- ' + R2 + '\n' } }),
    ''
  ].join('\n'));
  const j6 = expect('GREEN (j6) a compaction summary missing a ruling PRINTS the ruling',
    runGate({
      hook_event_name: 'SessionStart', source: 'compact',
      cwd: tmp, transcript_path: transcript
    }, fixEnv(mkFix('compaction', { summary_carries_ruling__3: 0.04 }))), 0);
  mustSay('(j6)', j6, ['JUDGMENT FINDING (drift/summary_carries_ruling) — MISSING',
    'summary_carries_ruling [3]', '2 present by code match (no model call)', '1 asked',
    'POST-HOC (reported, never refused)']);
  if (!NEUTER && (j6.stdout + j6.stderr).indexOf('yes it compiled') !== -1) {
    die('(j6) a tool result was mined as an operator ruling');
  }

  console.log('\n' + (failed ? 'FAIL' : 'PASS') + '  judgment-gate — ' + passed + ' ok, ' + failed + ' failed');
} finally {
  cleanup();
}
process.exit(failed ? 1 : 0);
