#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// judgment-supervisor.js — THE OPTIONAL MONITOR: the one seam that judges a lane while
// it is STILL RUNNING.
//
// Started DETACHED by hooks/judgment-gate.js at the spawn moment, but ONLY when the
// project set `judgment.supervisor.enabled: true`. OFF BY DEFAULT, and that is not
// timidity: everything else in this package reads a file and exits, while this outlives
// the tool call — a package that spawned a background process silently would deserve to
// be uninstalled.
//
// ⛔ IT CANNOT ACT ON THE LANE IT WATCHES, AND THAT IS THE SEAM'S BOUNDARY, NOT A GAP.
//   · IT CANNOT MESSAGE A WORKER. A detached process has no channel to a running agent.
//     When the policy says STEER, this file writes the steer TEXT to a pending file and
//     the COORDINATOR relays it at its next tool boundary — or declines to, which is the
//     coordinator's call.
//   · IT CANNOT STOP A LANE. A stop verdict is WRITTEN and NEVER executed. Stopping a
//     lane on an ~88%-ceiling reading of a PARTIAL log would be a refusal band armed on
//     nothing, which the grading rules forbid twice over.
//   · IT BINDS NO PORT. It is a CLIENT of the resident loopback provider and a reader of
//     files.
//   · IT KILLS NOTHING — including itself by signal: it exits by returning. No `pkill`,
//     no pattern-kill, no pid resolved after the fact. A pattern-kill on a shared machine
//     is a broadcast and every other job pays for it.
//
// WHY IT EXISTS. Every other seam judges at a BOUNDARY, and for a lane a boundary is
// always either too early or too late: the brief audit reads a brief before a single
// token is spent, and the lane-return seam reads the report after every one of them has
// been — at which point a non-zero exit cannot un-spend it. This asks the same family of
// question in the ONE window where the answer can still change what is spent.
//
// WHAT IT OBSERVES, and this is the ONE thing a project must wire. This package cannot
// know your agent runtime's transcript layout, so it does not guess one: the monitor
// reads an APPEND-ONLY STEP LOG at `<dir>/<key>.observe` (override with --observe-file),
// one step per line — either `{"name":"<tool>","args":"<arguments>"}` JSON or a plain
// `tool arguments` line — plus `git status --porcelain` in the lane's cwd. Whatever in
// your stack can see a worker's steps writes that file; if nothing does, the monitor says
// SO in its log and keeps reporting on the tree alone. **Silence is the one answer it may
// not give.**
//
// NEVER ASK A MODEL A QUESTION A REGEX ANSWERS. Three code-level checks run first and the
// model is asked only about the remainder — and the short-circuit points BOTH ways here:
// a code hit on `lane_stuck` / `lane_over_proof` means the FINDING IS ALREADY MADE, while
// a code hit on `lane_on_brief` means nothing is wrong. Each is labelled with which it
// was, and the split is printed on EVERY poll, because a monitor that found everything
// already answered and a monitor that asked nothing because it was broken must never look
// alike.
//
// BACK OFF, NEVER DISENGAGE. On a provider error the monitor prints the typed code,
// ledgers the poll as denied, DOUBLES its interval to a ceiling and KEEPS ASKING. The
// remedies printed for a DEAD provider do not apply to a BUSY one, and switching to the
// fixture to get past it disengages a seam that is working.
//
// USAGE
//   node hooks/judgment-supervisor.js --dir <state dir> --key <brief sha head>
//        --brief-file <path> [--cwd <lane cwd>] [--agent <type>]
//        [--observe-file <path>] [--once] [--now <ms>]
// FILES IT OWNS, all under <dir>, all keyed by the brief's hash — the same key the gate
// wrote at the spawn moment, so a proposal can be paired with the brief that caused it:
//   <key>.brief     the brief, written by the gate
//   <key>.observe   the lane's step log, written by whatever can see it (read-only here)
//   <key>.log       every poll's verdict line — a detached process has no terminal
//   <key>.pending   the ACTIONS the coordinator must read: steers and stop verdicts
//   <key>.done      the sentinel, written by the gate at the result moment. Its
//                   appearance is the primary exit; `policy.quietMs` is the backstop.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const CFG = require('./lib/config.js');
const DP = require('./lib/decision-provider.js');

const CLIENT = path.join(__dirname, 'lib', 'decision-provider.js');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return (i >= 0 && process.argv[i + 1] != null) ? process.argv[i + 1] : dflt;
}
const ONCE = process.argv.indexOf('--once') !== -1;
const DIR = String(arg('dir', path.join(os.tmpdir(), 'a8-loom-supervisor')));
const KEY = String(arg('key', 'nokey'));
const LANE_CWD = String(arg('cwd', process.cwd()));
const AGENT = String(arg('agent', ''));
const BRIEF_FILE = String(arg('brief-file', path.join(DIR, KEY + '.brief')));
const CLOCK0 = parseInt(arg('now', ''), 10);
function now() { return isFinite(CLOCK0) ? CLOCK0 : Date.now(); }

let BRIEF = '';
try { BRIEF = fs.readFileSync(BRIEF_FILE, 'utf8'); } catch (e) { BRIEF = ''; }

const F = {
  log: path.join(DIR, KEY + '.log'),
  pending: path.join(DIR, KEY + '.pending'),
  done: path.join(DIR, KEY + '.done'),
  observe: String(arg('observe-file', path.join(DIR, KEY + '.observe')))
};

const cfg = CFG.load(LANE_CWD) || {};
const SUP = (cfg.judgment && cfg.judgment.supervisor) || {};
let roster = null;
try {
  roster = require(path.resolve(cfg.__repoRoot || LANE_CWD,
    (cfg.judgment && cfg.judgment.roster) || 'hooks/judgment-roster.js'));
} catch (e) { roster = null; }
const SEAM = roster && roster.seams && roster.seams.supervisor;
const POL = (SEAM && SEAM.policy) || {};

function say(line) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(F.log, '[' + new Date(now()).toISOString() + '] ' + line + '\n');
  } catch (e) {}
}

// The pending file is APPEND-ONLY JSONL: the coordinator reads it, acts or declines, and
// the record of what was proposed survives either way. A file the monitor REWROTE would
// let a later poll erase a steer nobody had read yet.
function propose(rec) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    fs.appendFileSync(F.pending, JSON.stringify(Object.assign({
      ts: new Date(now()).toISOString(), briefKey: KEY, agent: AGENT || undefined
    }, rec)) + '\n');
  } catch (e) {}
}

// ---- A: what the brief asked for -------------------------------------------
//
// Assembled IN CODE rather than handed whole: the model sees the CONTRACT — proof line,
// budget line, deliverables, the paths named — and not the brief's routing prose or its
// canon citations, none of which any of the three questions is about. Every line is the
// brief's OWN WORDS; nothing is summarised, because a distillation must never stand in
// for a source, and that binds a state assembly exactly as it binds a brief.
function briefContract(text) {
  const t = String(text || '');
  const out = [];
  const proof = /^\s*PROOF:.*$/m.exec(t);
  if (proof) out.push(proof[0].trim());
  const budget = /^\s*BUDGET:.*$/m.exec(t);
  if (budget) out.push(budget[0].trim());
  const dm = /^[^\n]*\bDELIVERABLES?\b[^\n]*:?\s*\n([\s\S]*?)(?=\n\s*(?:[A-Z][A-Z \-]{4,}:|$))/m.exec(t);
  if (dm) out.push('DELIVERABLES:\n' + dm[1].trim());
  const uniq = [];
  (t.match(/\b[A-Za-z0-9_-]+\/[A-Za-z0-9_./*-]+/g) || []).forEach(p => {
    if (uniq.indexOf(p) === -1) uniq.push(p);
  });
  if (uniq.length) out.push('PATHS NAMED: ' + uniq.slice(0, 40).join(' '));
  // A brief with none of these shapes is not a contract anything can be measured
  // against, and saying so is different from producing an EMPTY A side — which would
  // make every pair "match" for free, the exact failure the split budget exists to stop.
  return out.length ? out.join('\n') : '';
}

// The DECLARED WRITE SET, when the brief names one. ⚠ `null` is NOT an empty set: with
// no declared set every path is inside it, and treating "undeclared" as "nothing
// allowed" would flag every healthy lane on its first write.
function declaredWriteSet(text) {
  const t = String(text || '');
  if (!/\b(write (?:here|set)|you write|files? to write|write ONLY|writes? under)\b/i.test(t)) return null;
  const uniq = [];
  (t.match(/\b[A-Za-z0-9_-]+\/[A-Za-z0-9_./*-]+/g) || []).forEach(p => {
    if (uniq.indexOf(p) === -1) uniq.push(p);
  });
  return uniq.length ? uniq : null;
}

// ---- B: what the lane has done so far --------------------------------------
//
// BOUNDED, as the prior art's own word for it: a fixed window of what the lane has
// produced, never the whole run. A TORN FINAL LINE is normal rather than corruption —
// the file is being appended to while it is read.
const WINDOW = 24;
function observe() {
  let raw = null;
  try { raw = fs.readFileSync(F.observe, 'utf8'); } catch (e) { raw = null; }
  const calls = [];
  const errors = [];
  if (raw != null) {
    raw.split('\n').filter(Boolean).forEach(l => {
      let d = null;
      try { d = JSON.parse(l); } catch (e) { d = null; }
      if (d && typeof d === 'object') {
        if (d.error || d.is_error) errors.push(String(d.error || d.text || '').split('\n')[0].slice(0, 160));
        if (d.name) calls.push({ name: String(d.name), args: String(d.args == null ? '' : d.args), input: d.input || {} });
        return;
      }
      const m = l.match(/^\s*(\S+)\s*(.*)$/);
      if (m) calls.push({ name: m[1], args: m[2], input: {} });
    });
  }
  let lastMs = 0;
  try { lastMs = fs.statSync(F.observe).mtimeMs; } catch (e) { lastMs = 0; }
  return {
    present: raw != null,
    calls: calls.slice(-WINDOW),
    totalCalls: calls.length,
    errors: errors.slice(-6),
    lastMs,
    // Paths the lane's own steps named. UNIONED with the tree below: porcelain is the
    // truth about the tree and the step log is the truth about intent, and a lane that
    // wrote outside its set shows in whichever arrives first.
    wrote: calls.reduce((acc, c) => {
      const p = c.input && (c.input.file_path || c.input.path);
      if (typeof p === 'string' && acc.indexOf(p) === -1) acc.push(p);
      return acc;
    }, [])
  };
}

function porcelain() {
  try {
    return cp.execFileSync('git', ['-C', LANE_CWD, 'status', '--porcelain'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean).map(l => l.slice(3).trim());
  } catch (e) { return []; }
}

function renderB(obs, files) {
  const lines = [];
  lines.push('files changed in the tree: ' + (files.length ? files.slice(0, 20).join(' ') : '(none)'));
  if (obs.errors.length) lines.push('recent errors: ' + obs.errors.join(' | '));
  if (!obs.present) {
    lines.push('recent steps: (no step log at ' + F.observe + ' — nothing in this stack writes one)');
  } else {
    lines.push('recent steps (' + obs.calls.length + ' of ' + obs.totalCalls + '):');
    obs.calls.forEach(c => lines.push('  ' + c.name + ' ' + String(c.args).slice(0, 120)));
  }
  return lines.join('\n');
}

// ---- the code-level answers, tried before the model ------------------------

// IDENTICAL CONSECUTIVE STEPS are a loop, not a rhythm. One-directional: it can only say
// STUCK. Absence of a run is never a finding — it is a question.
function codeStuck(obs) {
  const cut = (SEAM.shortCircuit && SEAM.shortCircuit.repeatRun) || 3;
  let run = 1, best = 1, what = '';
  for (let i = 1; i < obs.calls.length; i++) {
    const a = obs.calls[i], b = obs.calls[i - 1];
    if (a.name === b.name && a.args === b.args) {
      run++;
      if (run > best) { best = run; what = a.name + ' ' + String(a.args).slice(0, 80); }
    } else run = 1;
  }
  if (best >= cut) {
    return { hit: true, finding: true, why: best + ' identical consecutive steps (>= ' + cut + '): ' + what };
  }
  return { hit: false, why: 'longest identical run ' + best + ' < ' + cut };
}

// THE INSTRUMENT WORDS ARE THE PROJECT'S, DECLARED ONCE, IN CONFIG. This package ships no
// list of its own: a second list would silently exempt every instrument added to the
// first, which is the duplication this whole stack exists to stop. ⚠ AND IT FAILS
// LOUDLY: with no list declared the question goes to the MODEL and the log says why.
// Silence is the one answer it may not give.
function codeOverProof(obs) {
  const words = SUP.instrumentWords || [];
  if (!words.length) {
    return { hit: false, unreadable: true,
      why: 'no judgment.supervisor.instrumentWords declared — asking the model instead of ' +
        'guessing a list (a list nobody declared would exempt everything not on it)' };
  }
  const hay = obs.calls.map(c => c.name + ' ' + c.args).join(' ').toLowerCase();
  const hits = words.filter(w => hay.indexOf(String(w).toLowerCase()) !== -1);
  const light = /PROOF:\s*light\b/i.test(BRIEF);
  if (light && hits.length) {
    return { hit: true, finding: true,
      why: 'the brief declares the light tier and the lane is running: ' + hits.join(', ') };
  }
  return { hit: false, why: light ? 'no declared instrument word in the recent steps'
    : 'the brief does not declare the light tier — nothing for the word list to decide' };
}

// FILES WRITTEN OUTSIDE A DECLARED WRITE SET ARE A SET OPERATION, not a judgment. The
// restating case — B saying back what A asked for — is `codeMatch`'s, and it answers the
// OTHER way: a match here means nothing is wrong.
function codeOnBrief(obs, files, set, A, B) {
  if (set) {
    const outside = files.filter(f => !set.some(s => f.indexOf(s.replace(/\*+$/, '')) === 0));
    if (outside.length) {
      return { hit: true, finding: true,
        why: 'files written outside the brief\'s declared write set: ' + outside.slice(0, 6).join(' ') };
    }
  }
  const cm = roster.codeMatch(SEAM, A, B);
  if (cm.matched) return { hit: true, finding: false, why: 'the lane\'s work restates the brief — ' + cm.why };
  return { hit: false, why: cm.why };
}

// ---- the busy probe --------------------------------------------------------
// READS ONLY. `pgrep` NAMES a process; its output is never piped to anything, here or
// anywhere in this file.
function runtimeBusy() {
  const re = (POL.backoff && POL.backoff.busyProcessRe) || '';
  if (!re) return false;
  try {
    return String(cp.execFileSync('pgrep', ['-f', re],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })).trim().length > 0;
  } catch (e) { return false; }
}

// ---- state, rehydrated rather than held ------------------------------------
//
// In one long-lived run these could be plain variables. They are not, because a monitor
// that is RESTARTED — a crash, a sleep, a second spawn on the same brief — would come
// back with `steersWritten = 0` and re-steer a lane that has already been steered.
// Steer-ONCE is a policy, and a policy a restart resets is an aspiration.
function rehydrate() {
  let rows = [];
  try {
    rows = fs.readFileSync(F.pending, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  } catch (e) { rows = []; }
  const last = rows.length ? Date.parse(rows[rows.length - 1].ts) : NaN;
  return { steers: rows.filter(r => r.action === 'steer-once').length,
    last: isFinite(last) ? last : null };
}
const _rh = rehydrate();
let steersWritten = _rh.steers;
let lastActionMs = _rh.last;
let interval = POL.cadenceMs || 60000;

function ask(state, qids, provider) {
  const questions = {};
  qids.forEach(q => { questions[q] = { type: SEAM.questions[q].type, instructions: SEAM.questions[q].instructions }; });
  // The clock may be PINNED (--now) so a selftest is deterministic; a pinned clock
  // reports 0 ms rather than a number that would change between runs.
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [CLIENT], {
    input: JSON.stringify({ state, questions, provider,
      timeoutMs: parseInt(process.env.A8_DECISION_TIMEOUT_MS || (cfg.judgment && cfg.judgment.timeoutMs) || 8000, 10) }),
    encoding: 'utf8'
  });
  let out = null;
  try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop() || ''); } catch (e) { out = null; }
  return { out, ms: isFinite(CLOCK0) ? 0 : (Date.now() - t0) };
}

// ---- one poll --------------------------------------------------------------
function poll(eng) {
  const obs = observe();
  if (!obs.present && !porcelain().length) {
    say('nothing observable yet (no step log at ' + F.observe + ', clean tree) — polling');
    return { exit: false };
  }
  // THE QUIET BACKSTOP. The sentinel is the primary exit; this covers a lane whose result
  // never arrives, so a monitor can never outlive every lane and become a process nobody
  // owns.
  if (obs.lastMs && (now() - obs.lastMs) > (POL.quietMs || 1800000)) {
    say('the lane has been quiet for > ' + Math.round((POL.quietMs || 0) / 60000) + ' min — exiting');
    return { exit: true };
  }

  const files = porcelain().concat(obs.wrote).filter((v, i, a) => a.indexOf(v) === i);
  const A = briefContract(BRIEF);
  const B = renderB(obs, files);
  const set = declaredWriteSet(BRIEF);

  const code = {
    lane_stuck: codeStuck(obs),
    lane_over_proof: codeOverProof(obs),
    lane_on_brief: codeOnBrief(obs, files, set, A, B)
  };
  const answered = {};
  const asking = [];
  Object.keys(SEAM.questions).forEach(qid => {
    const c = code[qid];
    if (c && c.hit) {
      const qd = SEAM.questions[qid];
      const flagged = (c.finding !== undefined) ? !!c.finding : (qd.findingAt === 'high');
      answered[qid] = { value: NaN, flagged, answered: true, byCode: true,
        findingAt: qd.findingAt || 'low',
        word: flagged ? (qd.words || ['ok', 'FLAGGED'])[1] : (qd.words || ['ok', 'FLAGGED'])[0],
        why: c.why };
    } else {
      asking.push(qid);
      if (c && c.unreadable) say('  ' + qid + ': ' + c.why);
    }
  });

  let providerMs = 0;
  if (asking.length) {
    const state = roster.buildPairState(SEAM, { pair: SEAM.pair }, [{ a: A, b: B }]);
    const r = ask(state, asking, eng.provider);
    providerMs = r.ms || 0;
    if (!r.out || r.out.ok !== true) {
      // ENGAGED AND UNREACHABLE. Printed with its typed code, ledgered as denied — and
      // then it BACKS OFF AND KEEPS ASKING. There is nothing to refuse at this moment
      // anyway: no verdict of this monitor was ever going to stop anything.
      say('ENGAGED and could not reach the provider — ' +
        ((r.out && (r.out.code + ': ' + r.out.error)) || 'no parseable answer from the client') +
        ' · provider ' + eng.provider.kind + ' (' + eng.why + ')' +
        ' · backing off, NOT disengaging (the remedies for a DEAD provider do not apply to a BUSY one)');
      return { exit: false, slow: true };
    }
    asking.forEach(qid => {
      const v = roster.bandVerdict(SEAM, qid, (r.out.answers || {})[qid] || {});
      answered[qid] = Object.assign(v, { byCode: false, why: 'asked' });
    });
  }

  const byCode = Object.keys(answered).filter(q => answered[q].byCode).length;
  const flagged = Object.keys(answered).filter(q => answered[q].flagged);
  say('poll · ' + (asking.length ? eng.provider.kind : 'no model call') +
    ' · roster ' + (roster.rosterVersion || '?') + '/' + (SEAM.templateVersion || '?') +
    (providerMs ? ' · ' + providerMs + ' ms' : '') + ' · ADVISORY (' + SEAM.grade + ')');
  Object.keys(SEAM.questions).forEach(qid => {
    const v = answered[qid];
    if (!v) return;
    say('  · ' + qid + ' = ' + (isFinite(v.value) ? v.value.toFixed(2) : 'by code') +
      '  → ' + v.word + '   [' + v.why + ']');
  });
  say('  questions: ' + byCode + ' answered by code (no model call) · ' + asking.length +
    ' asked · ' + flagged.length + ' reading as a finding');

  let acted = false;
  Object.keys(SEAM.questions).forEach(qid => {
    const v = answered[qid];
    if (!v || !v.flagged || acted) return;
    const act = roster.supervisorAction(SEAM, qid, v,
      { steersWritten, lastActionMs, now: now() });
    if (act.action === 'continue') { say('  policy: continue — ' + act.why); return; }
    acted = true;
    lastActionMs = now();
    if (act.action === 'steer-once') {
      steersWritten++;
      propose({ action: 'steer-once', question: qid, value: isFinite(v.value) ? v.value : null,
        byCode: v.byCode, why: act.why, evidence: v.why, steer: steerText(qid, v),
        note: 'THE MONITOR CANNOT RELAY THIS. It has no channel to a running worker — the ' +
          'coordinator relays it, or declines to.' });
      say('  policy: STEER-ONCE written to ' + F.pending + ' — ' + act.why);
    } else {
      propose({ action: 'stop-verdict', question: qid, value: isFinite(v.value) ? v.value : null,
        byCode: v.byCode, why: act.why, evidence: v.why,
        note: 'PROPOSED, NEVER EXECUTED. This monitor cannot stop a lane and must not: a stop ' +
          'on a partial log read at an ~88% ceiling is a refusal band armed on nothing.' });
      say('  policy: STOP VERDICT proposed in ' + F.pending + ' — ' + act.why);
    }
  });

  return { exit: false, slow: providerMs > ((POL.backoff && POL.backoff.slowAnswerMs) || 2000) };
}

// The steer TEXT is composed HERE, from the roster's own question and the evidence the
// monitor holds — never from the model's words, which are a number and nothing else.
// There is no string in this file a model wrote.
function steerText(qid, v) {
  const head = 'SUPERVISOR ADVISORY — advisory, not an instruction. Written by a monitor that ' +
    'cannot act; relay it or drop it.';
  if (qid === 'lane_stuck') {
    return head + '\nThis lane reads as repeating itself without progress: ' + v.why +
      '\nIf that is right, say what it is blocked on rather than retrying; if it is wrong, carry on.';
  }
  if (qid === 'lane_over_proof') {
    return head + '\nThis lane reads as running more verification than its brief allows: ' + v.why +
      '\nA known-good path is not re-proven, and a seam is tested ONCE, at the seam.';
  }
  return head + '\nThis lane\'s work so far does not read as the work its brief asked for: ' + v.why +
    '\nIf the route changed for a reason, say so; if a path was written by mistake, stop and report it.';
}

// ---- the loop --------------------------------------------------------------
function main() {
  if (!SEAM) {
    say('no `supervisor` seam in the roster — nothing to watch with. Exiting.');
    return;
  }
  const eng = DP.resolveFromConfig(cfg);
  if (!eng.engaged) {
    // NOT ENGAGED IS NOT FAILING OPEN, and the state is PRINTED rather than inferred from
    // silence. Nothing was asked and nothing was promised.
    say('not engaged — ' + eng.why + ' · roster ' + (roster && roster.rosterVersion) +
      ' (shadow-mode-first; nothing was asked and nothing was promised)');
    return;
  }
  say('watching lane [' + (AGENT || 'unknown agent') + ', brief ' + KEY + '] · provider ' +
    eng.provider.kind + ' (' + eng.why + ') · cadence ' +
    Math.round((POL.cadenceMs || 0) / 1000) + 's · THE MONITOR ADVISES AND CANNOT ACT');

  // ONE recursive timer, never setInterval: the interval is DYNAMIC (the back-off) and a
  // fixed period cannot express that. It also means a poll that runs long can never
  // overlap its successor, which on a loaded runtime is exactly when two concurrent polls
  // would be worst.
  function step() {
    // THE SENTINEL IS THE PRIMARY EXIT. It is written at the result moment, which knows
    // the lane is over; nothing this process can observe knows that as well.
    if (fs.existsSync(F.done)) { say('result sentinel seen — exiting'); return; }
    let r = { exit: false };
    try { r = poll(eng) || r; }
    catch (e) { say('poll threw (' + (e && e.message) + ') — continuing'); }
    if (r.exit || ONCE) return;

    const bo = POL.backoff || {};
    if (r.slow || runtimeBusy()) {
      const next = Math.min(interval * (bo.factor || 2), bo.maxMs || interval);
      if (next !== interval) {
        say('  backing off ' + Math.round(interval / 1000) + 's → ' + Math.round(next / 1000) +
          's (the runtime is loaded; waiting, never disengaging)');
        interval = next;
      }
    } else if (interval !== POL.cadenceMs) {
      say('  the runtime is answering again — back to the ' +
        Math.round((POL.cadenceMs || 0) / 1000) + 's cadence');
      interval = POL.cadenceMs;
    }
    setTimeout(step, interval);
    return undefined;
  }

  // The first poll is immediate: a lane that goes wrong in its first minute is exactly the
  // one worth catching, and the cadence starts after it.
  step();
}

main();
