#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// judgment-gate — a PreToolUse gate that asks a DECISION MODEL about the thing being
// done, at the moment it is done. Fires on Agent/Task (spawn), Bash (commit) and
// Edit/Write/MultiEdit (edit), according to which moment each seam in the roster claims.
//
// IT IS A HOOK. This file is deployed by hooks/install-hooks.sh and registered at the
// Edit|Write|MultiEdit, Bash and Agent|Task matchers of hooks/settings.template.json,
// exactly like every other gate here. "A fourth executor class" is the FAILURE-PATTERNS
// ledger's word for what KIND OF EVIDENCE an executor can read — meaning rather than
// tokens — and never a claim about a different mechanism.
//
// WHY A FOURTH EXECUTOR CLASS. Every other gate in this package is a MATCHER: a regex,
// a path set, a registry lookup, a trailer check. Each is correct and none is replaced
// here. What no matcher reaches is MEANING — "does this brief require its worker to
// report the retrievals behind its claims", "does this paragraph still describe what the
// code does", "does this body describe a whole suite under a light label". Those can be
// written a dozen ways and omitted a dozen more, and the only signal is what the words
// mean. That is the input class a decision model takes, and it is the only thing this
// gate is for.
//
// ⛔ IT NEVER REPLACES A VERDICT A MATCHER ALREADY REACHES CORRECTLY. Every seam is
// ADDITIVE to its host gate. If a word list already refuses a body, that body was denied
// before this gate ran and never reaches it.
//
// THE THREE ENGAGEMENT STATES, and this is the one place a reader will reasonably ask
// whether the gate can fail open. The state is PRINTED, never inferred from silence:
//
//   NOT ADOPTED  `judgment.enabled:false` — NOT the default, and the only way to silence
//                this layer. It switches OFF an executor class; silent no-op, exit 0.
//   NO SEAMS     enabled (the default) with no roster file ⇒ ONE LINE saying nothing is
//                declared, exit 0. A roster that EXISTS and will not load still DENIES.
//   NOT ENGAGED  enabled + seams declared, but no provider ⇒ ONE LINE saying exactly that,
//                exit 0. This is NOT failing open: no question was asked and none was
//                promised. The state exists on purpose — every seam ships logging-only
//                before any band arms.
//   ENGAGED      a provider is configured ⇒ the seam ASKS. An engaged seam that cannot
//                reach its provider DENIES, with the typed error printed verbatim.
//
// The difference that matters: *failing open* is asking, failing, and approving anyway.
// That never happens here. The property that makes it auditable is that a reader of this
// gate's own output can always tell which state they are in — a gate that passed
// SILENTLY would be indistinguishable from one that failed open.
//
// ADVISORY IS A GRADE, NOT A SOFT START. A seam in `advisory` mode prints its answer,
// including the answers that pass, and exits 0. `refuse` mode is armed per seam, in
// config, and only ever after a labeled set measured the band — AND only against a
// provider whose class is TRAINED, because a refusal band is a cut on a confidence
// number and an untrained scorer's number is not that quantity. A refuse band configured
// against any other provider class is NOT ARMED, and the gate says so out loud rather
// than quietly refusing or quietly passing.
//
// SYNCHRONOUS BY SUBPROCESS. A PreToolUse hook is straight-line code ending in
// process.exit and cannot await, so the client runs as a CLI child (spawnSync) and its
// one JSON line is read back. That is also why the provider must be RESIDENT: a model
// loaded per fire pays its cold start on every single tool call, which is how a gate
// gets switched off. See `hooks/judgment-server.example.sh`.
//
// FIVE MOMENTS, AND TWO OF THEM CANNOT REFUSE — WHICH IS STATED, NEVER PAPERED OVER.
// `spawn` · `edit` · `commit` · `doc` are PRE-hoc: the tool call has not happened, so an
// engaged seam that cannot ask DENIES (exit 2). `result` (a worker has returned) and
// `compaction` (a session resumed on a rewritten summary) are POST-HOC: the work has
// already happened, a non-zero exit cannot un-spend it, and at `compaction` an exit 2
// would abort a session over an ADVISORY reading of a summary. At those two the gate
// PRINTS the typed code, LEDGERS the verdict as denied, and exits 0 — and says in the
// print that the moment is post-hoc. The ledger therefore reads `denied` for an event
// where nothing was denied; that is the closest honest account available at a boundary
// with no verdict to give, and an unstated inability to refuse is how failing open
// becomes the habit nobody notices.
//
// THE SUPERVISOR IS SEPARATE, OPT-IN, AND OFF BY DEFAULT (`judgment.supervisor.enabled`).
// It is the only thing in this package that SPAWNS A PROCESS, and a package must never
// do that silently. When it is on, this gate launches `hooks/judgment-supervisor.js`
// detached at the spawn moment and writes its sentinel at the result moment; the monitor
// itself never acts on anything.
//
// Config-driven and project-agnostic like every hook here: no config, or
// `judgment.enabled:false`, ⇒ no-op (exit 0). Exit 2 ⇒ rejected. `judgment.enabled`
// DEFAULTS TO TRUE — the executor class is always on; the PROVIDER is what may be absent.

'use strict';
const path = require('path');
const CFG = require('./lib/config.js');
const D = require('./lib/detect.js');
const DP = require('./lib/decision-provider.js');

const CLIENT = path.join(__dirname, 'lib', 'decision-provider.js');

function rx(src, flags) { try { return src ? new RegExp(src, flags || '') : null; } catch (e) { return null; } }

const POST_HOC = { result: 1, compaction: 1 };

// ---- the moment ------------------------------------------------------------
//
// Which boundary is this call? Decided from the PAYLOAD, before the roster is read, so a
// roster problem can never be mistaken for "no seam here".
function momentOf(cfg, data) {
  const tool = data.tool_name;
  const input = data.tool_input || {};
  const ev = data.hook_event_name || '';

  // A SESSION RESUMED ON A COMPACTION SUMMARY. The summary REPLACES the session's account
  // of itself and nothing reads the two back against each other; this is the one moment
  // no other hook in the stack claims. `source` is the client's own field — anything
  // other than a compaction (a fresh start, a resume) is not this moment.
  if (ev === 'SessionStart') {
    if (String(data.source || '') !== 'compact') return null;
    return { moment: 'compaction', state: '', subject: 'session-start:compact' };
  }

  if (tool === 'Agent' || tool === 'Task') {
    // The SAME tool at two ends of one span. PostToolUse carries the result, so it is the
    // `result` moment; everything else is the spawn.
    if (ev === 'PostToolUse' || data.tool_response !== undefined) {
      return { moment: 'result', state: resultText(data), subject: String(input.subagent_type || 'agent') };
    }
    return { moment: 'spawn', state: String(input.prompt || ''), subject: String(input.subagent_type || 'agent') };
  }

  if (tool === 'Bash') {
    const cmd = String(input.command || '');
    const commitRe = rx((cfg.judgment && cfg.judgment.commitRe) || '\\bgit\\b[^|;&]*\\bcommit\\b');
    if (!commitRe || !commitRe.test(cmd)) return null;
    // The commit MESSAGE is the state, not the whole command line: the flags are noise
    // against every question a commit seam asks. `-F <file>` is read from disk; a
    // message that cannot be extracted falls back to the command, which is honest
    // (something is better than a silently empty state) and is reported as such.
    return { moment: 'commit', state: commitMessage(cmd) || cmd, subject: 'commit' };
  }

  if (tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') {
    const fp = input.file_path || '';
    if (!fp) return null;
    const nc = D.newContentOf(tool, input);
    if (!nc) return null;
    // A DOC IS ITS OWN MOMENT, and it has to be, because a doc is EXEMPT from the edit
    // moment by default (`source.exemptExtensions`) — so a seam about prose-vs-code drift
    // would never fire if it rode `edit`. Scoped to prose that actually CITES code: a doc
    // with no `path:line` in it has nothing for this moment to be about.
    if (/\.(md|markdown|rst|adoc|txt)$/i.test(fp)) {
      return /[A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,6}:\d+/.test(nc)
        ? { moment: 'doc', state: nc, subject: fp } : null;
    }
    if (D.isExemptFile(cfg, fp)) return null;
    return { moment: 'edit', state: nc, subject: fp };
  }

  return null;
}

// A tool result is a string, or a list of blocks each carrying text. Anything else is
// reported EMPTY rather than guessed at — a guessed state is a different question asked
// without anyone knowing.
function resultText(data) {
  const v = data.tool_response;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(b => (b && (b.text || b.content)) || '').join('\n');
  if (v && typeof v === 'object') return String(v.text || v.content || v.output || '');
  return '';
}

function commitMessage(cmd) {
  const m = cmd.match(/-m\s+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/);
  if (m) return (m[1] || m[2] || '').replace(/\\"/g, '"').replace(/\\n/g, '\n');
  const f = cmd.match(/-F\s+(\S+)/);
  if (f) { try { return require('fs').readFileSync(f[1], 'utf8'); } catch (e) { return ''; } }
  return '';
}

// ---- provider resolution ---------------------------------------------------
//
// ONE HOME, in the client lib, because the optional monitor resolves the same thing and a
// second copy of "what is this provider allowed to do" is the last value in this package
// that should have two answers.
function resolveProvider(cfg) { return DP.resolveFromConfig(cfg); }

// ---- reporting -------------------------------------------------------------

function fmt(n, d) { return isFinite(n) ? Number(n).toFixed(d === undefined ? 2 : d) : '?'; }

// Report EVERY question, including the ones that pass. A seam that printed only its
// complaints would teach nothing about its own coverage, and the distribution is the
// only thing a future calibration can be read off.
function reportNoul(qid, a, cut) {
  const v = (a && typeof a.noul === 'number') ? a.noul : NaN;
  const verdict = !isFinite(v) ? 'no answer' : v >= cut ? 'present' : 'MISSING';
  return '  · ' + qid + ' = ' + fmt(v) + '  → ' + verdict;
}

function reportGraded(qid, q, a) {
  const probs = (a && a.probabilities) || {};
  const level = DP.levelOf(a);
  const legend = (a && a.legend) || {};
  const rung = level === null ? '(no level)'
    : (legend[String(level)] || (q.criteria || [])[level] || '(unnamed level)');
  const spreadTxt = Object.keys(probs).sort().map(k => k + '=' + fmt(probs[k])).join(' · ');
  const head = (q.type === 'score')
    ? '  · ' + qid + ' → level ' + (level === null ? '?' : level) + ' — "' + rung + '"'
    : '  · ' + qid + ' → "' + (a && a.choice) + '"';
  return head + '\n    probabilities: ' + (spreadTxt || '(none)') +
    (q.type === 'score' ? '  · weighted score ' + fmt(a && a.score) : '') +
    '  · confidence ' + fmt(a && a.confidence);
}

// ---- main ------------------------------------------------------------------

(function main() {
  let data;
  try { data = JSON.parse(D.readStdin()); } catch (e) {
    // Unreadable envelope: exit 0, like every other hook here. The project's dispatcher
    // owns the fail-closed policy for unparseable stdin; a second one here would make
    // two policies for one question.
    return;
  }

  const anchor = (data.tool_input && data.tool_input.file_path) || data.cwd || process.cwd();
  const cfg = CFG.load(anchor);
  if (!cfg) return;                                   // repo not governed
  const j = cfg.judgment || {};
  if (!j.enabled) return;                             // layer not adopted ⇒ inert

  const M = momentOf(cfg, data);
  if (!M) return;                                     // no moment here

  // THE OPTIONAL MONITOR, AT THE TWO ENDS OF A SPAN THIS GATE ALREADY SEES. Off unless
  // the project turned it on. It runs BEFORE the seams and never blocks: a launcher
  // inside an adjudication would start a monitor for a spawn that is then refused.
  if (M.moment === 'spawn') supervisorLaunch(cfg, data);
  if (M.moment === 'result') supervisorReport(cfg, data);

  // THE LAYER MUST BE READABLE OR THE GATE REFUSES. A gate that cannot load its own
  // roster has not found "no seam applies" — it has found NOTHING, and reporting that as
  // a pass is the fail-open shape by construction. This fires only once the moment
  // matched, so the blast radius is the tool calls the layer actually claims.
  //
  // ONE EXCEPTION, and it is what makes ON-BY-DEFAULT safe: a roster file that was never
  // written is NOT an unreadable roster. Nothing was declared, so nothing is owed — the
  // gate says exactly that and passes. A roster that EXISTS and cannot be loaded is the
  // original case and still denies: something was declared and the gate cannot read it.
  let roster;
  const rosterPath = path.resolve(cfg.__repoRoot, j.roster || 'hooks/judgment-roster.js');
  if (!require('fs').existsSync(rosterPath)) {
    console.log('JUDGMENT layer at the ' + M.moment + ' moment: no seams declared — ' +
      (j.roster || 'hooks/judgment-roster.js') + ' does not exist ' +
      '(copy hooks/judgment-roster.example.js to declare some; see integrations/judgment.md). ' +
      'Nothing was asked and nothing was promised.');
    CFG.logGate(cfg, 'judgment-gate', 'PASS', M.subject, 'no-roster');
    return;
  }
  try { roster = require(rosterPath); }
  catch (e) {
    CFG.logGate(cfg, 'judgment-gate', 'BLOCK', M.subject, 'roster-unreadable');
    process.stderr.write([
      'JUDGMENT GATE — ' + data.tool_name + ' rejected: the judgment roster is unreadable.',
      '',
      '  roster : ' + rosterPath,
      '  error  : ' + (e && e.message),
      '',
      '`judgment.enabled` is true, so this layer promised to ask — and a gate that cannot',
      'check may not pass. Do ONE of:',
      '  · copy hooks/judgment-roster.example.js to ' + (j.roster || 'hooks/judgment-roster.js') +
        ' and make the seams yours',
      '  · or set judgment.enabled:false in stack.config.json to disengage honestly'
    ].join('\n') + '\n');
    process.exit(2);
  }

  const seamIds = Object.keys((roster.seams) || {}).filter(id => {
    const seam = seamFor(roster, j, id);
    return momentsOf(seam).indexOf(M.moment) !== -1 && questionsAt(seam, M.moment).length;
  });
  if (!seamIds.length) { CFG.logGate(cfg, 'judgment-gate', 'PASS', M.subject, 'no-seam@' + M.moment); return; }

  const res = resolveProvider(cfg);
  if (!res.engaged) {
    // Printed, never silent. A reader of this line always knows which of the two states
    // they are in, which is the property that keeps not-engaged from decaying into
    // fail-open by habit.
    console.log('JUDGMENT seam(s) [' + seamIds.join(', ') + '] at the ' + M.moment +
      ' moment: not engaged — ' + res.why + ' · roster ' + (roster.rosterVersion || '?') +
      ' (shadow-mode-first; nothing was asked and nothing was promised)');
    CFG.logGate(cfg, 'judgment-gate', 'PASS', M.subject, 'not-engaged');
    return;
  }

  const timeoutMs = parseInt(process.env.A8_DECISION_TIMEOUT_MS || j.timeoutMs || 8000, 10);
  const maxChars = j.stateMaxChars || roster.stateMaxChars || 2000;
  const filter = (typeof roster.filterState === 'function')
    ? roster.filterState : (s) => String(s || '').slice(0, maxChars);

  const ctx = { moment: M.moment, payload: data, repoRoot: cfg.__repoRoot, state: M.state };

  seamIds.forEach(id => {
    const seam = seamFor(roster, j, id);

    // A seam may scope itself to the states it is about. Out of scope is not a verdict —
    // the seam is simply not this state's business, and it says so.
    const applies = rx(seam.appliesRe);
    if (applies && !applies.test(M.state)) {
      console.log('JUDGMENT seam (' + id + '): out of scope at this ' + M.moment +
        ' (appliesRe did not match) — not asked');
      return;
    }

    const qids = questionsAt(seam, M.moment);
    const paired = qids.filter(q => isPaired(seam.questions[q]));
    const plain = qids.filter(q => !isPaired(seam.questions[q]));

    if (plain.length) runPlain({ cfg, data, M, roster, seam, id, res, timeoutMs, filter, maxChars, qids: plain });
    paired.forEach(qid => runPaired({ cfg, data, M, roster, seam, id, res, timeoutMs, qid, ctx }));
  });

  CFG.logGate(cfg, 'judgment-gate', 'PASS', M.subject, seamIds.length + ' seam(s)@' + M.moment);
  process.exit(0);
})();

// ---- asking ----------------------------------------------------------------
//
// ONE call, synchronous by subprocess: a PreToolUse hook is straight-line code ending in
// process.exit and cannot await, so the client runs as a CLI child and its one JSON line
// is read back.
function callProvider(payload) {
  const t0 = Date.now();
  const r = require('child_process').spawnSync(process.execPath, [CLIENT], {
    input: JSON.stringify(payload), encoding: 'utf8'
  });
  let out = null;
  try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop() || ''); } catch (e) { out = null; }
  return { out, ms: Date.now() - t0, stderr: String(r.stderr || '') };
}

// THE FAIL-CLOSED LEG, and the ONE place the pre-hoc / post-hoc split is decided. The
// typed code and the provider's own message are printed verbatim either way — a refusal
// that says only "could not decide" is an error reported as a readiness state wearing a
// hook's clothes.
function providerFailed(o) {
  const { cfg, data, M, id, res, call } = o;
  const posthoc = !!POST_HOC[M.moment];
  const block = [
    'JUDGMENT GATE — ' + (data.tool_name || M.moment) + (posthoc ? ' REPORTED' : ' DENIED') +
      ': seam "' + id + '" could not reach its provider.',
    posthoc
      ? '[post-hoc moment: the work has already happened and a refusal cannot un-spend it — ' +
        'this is REPORTED and ledgered as denied, not refused]'
      : '[a gate that cannot ask does not get to approve]',
    '',
    '  moment   : ' + M.moment,
    '  provider : ' + res.provider.kind + ' (' + res.why + ')' +
      (res.provider.kind === 'systemone' ? ' · ' + res.provider.baseUrl : ''),
    '  error    : ' + ((call.out && (call.out.code + ': ' + call.out.error)) ||
      ('no parseable answer from the client' +
        (call.stderr ? ' · ' + call.stderr.split('\n')[0] : ''))),
    (call.out && call.out.validationProblems ? '  problems : ' + call.out.validationProblems.join(' | ') : ''),
    '',
    'The seam is ENGAGED, so an answer is OWED and its absence is a finding — this is NOT',
    'the same state as an unconfigured seam, which asks nothing and says so.',
    '',
    'Remedies, in order:',
    '  · start the resident loopback provider (see hooks/judgment-server.example.sh)',
    '  · or run the seam on the deterministic stub:',
    '        A8_DECISION_PROVIDER=fixture A8_DECISION_FIXTURE=<map.json>',
    '  · or disengage honestly: set judgment.enabled:false in stack.config.json'
  ].filter(Boolean).join('\n') + '\n';

  CFG.logGate(cfg, 'judgment-gate', 'BLOCK', M.subject, 'provider-unreachable:' + id);
  if (posthoc) { console.log(block); return; }
  process.stderr.write(block);
  process.exit(2);
}

// ---- the plain path (one state, N questions) --------------------------------
function runPlain(o) {
  const { cfg, data, M, roster, seam, id, res, timeoutMs, filter, maxChars, qids } = o;
  const questions = {};
  qids.forEach(q => { questions[q] = seam.questions[q]; });

  const call = callProvider({
    state: filter(M.state, maxChars), questions, provider: res.provider, timeoutMs
  });
  if (!call.out || call.out.ok !== true) return providerFailed({ cfg, data, M, id, res, call });
  const out = call.out;

  const lines = [], complaints = [];
  let breach = false;
  qids.forEach(qid => {
    const q = seam.questions[qid];
    const a = (out.answers || {})[qid] || {};
    if (q.type === 'noul') {
      const cut = (seam.band && typeof seam.band.advise === 'number') ? seam.band.advise : 0.5;
      lines.push(reportNoul(qid, a, cut));
      if (!(typeof a.noul === 'number' && a.noul >= cut)) { complaints.push(qid); breach = true; }
    } else {
      lines.push(reportGraded(qid, q, a));
      const level = DP.levelOf(a);
      const adviseAt = seam.band && seam.band.adviseAtLevel;
      if (typeof adviseAt === 'number' && level !== null && level >= adviseAt) {
        complaints.push(qid + ' at level ' + level);
        breach = true;
      }
    }
  });
  emit({ cfg, data, M, roster, seam, id, res, out, ms: call.ms, lines, complaints, breach });
}

// ---- the paired path (A vs B, one question, N pairs) ------------------------
//
// THE CODE-LEVEL CHECK RUNS FIRST AND THE MODEL ONLY ON THE REMAINDER, and the SPLIT is
// printed whatever happens: a seam that found everything already covered and a seam that
// asked nothing because it was broken must never look alike.
function runPaired(o) {
  const { cfg, data, M, roster, seam, id, res, timeoutMs, qid, ctx } = o;
  const q = seam.questions[qid];
  const R = roster;

  let pairs = [];
  try { pairs = (typeof R.pairsFor === 'function') ? (R.pairsFor(qid, ctx) || []) : []; }
  catch (e) { pairs = []; }
  if (!pairs.length) {
    console.log('JUDGMENT seam (' + id + '/' + qid + '): nothing to compare at this ' +
      M.moment + ' — not asked');
    return;
  }

  const matched = [], ask = [];
  pairs.forEach(p => {
    const cm = (typeof R.codeMatch === 'function') ? R.codeMatch(seam, p.a, p.b)
      : { matched: false, why: 'no codeMatch in the roster' };
    (cm.matched ? matched : ask).push(Object.assign({}, p, { why: cm.why }));
  });

  // RANKED IN CODE, and the remainder is PRINTED BY NAME rather than silently dropped —
  // an unexamined candidate a reader cannot see is coverage nobody has.
  const cap = seam.maxBundle || 8;
  const asked = ask.slice(0, cap);
  const unexamined = ask.slice(cap);

  const lines = [], complaints = [];
  let breach = false, out = null, ms = 0;

  matched.forEach(p => {
    lines.push('  · ' + qid + (p.label != null ? ' [' + p.label + ']' : '') +
      ' → present by code match (no model call) — ' + p.why);
  });

  if (asked.length) {
    const call = callProvider({
      state: R.buildPairState(seam, q, asked),
      questions: R.wirePairQuestions(seam, qid, asked),
      provider: res.provider, timeoutMs
    });
    if (!call.out || call.out.ok !== true) return providerFailed({ cfg, data, M, id, res, call });
    out = call.out; ms = call.ms;
    asked.forEach(p => {
      const wireId = q.perPair ? (qid + '__' + p.label) : qid;
      const v = R.bandVerdict(seam, qid, (out.answers || {})[wireId] || {});
      lines.push('  · ' + qid + (p.label != null ? ' [' + p.label + ']' : '') +
        ' = ' + fmt(v.value) + '  → ' + v.word);
      if (v.flagged) { complaints.push(qid + (p.label != null ? ' [' + p.label + ']' : '')); breach = true; }
    });
  }
  unexamined.forEach(p => {
    lines.push('  · ' + qid + ' [' + (p.label == null ? '?' : p.label) +
      '] → UNEXAMINED (over the seam\'s bundle of ' + cap + ') — listed, never dropped');
  });

  const word = (q.words && q.words[1]) || 'FLAGGED';
  // THE FINDING PRINTS FIRST AT A POST-HOC MOMENT. This output is injected at the head of
  // a resumed context or a returned result, and a finding printed UNDERNEATH a report
  // arrives after the belief it was meant to correct.
  if (breach && POST_HOC[M.moment]) {
    console.log('JUDGMENT FINDING (' + id + '/' + qid + ') — ' + word + ': ' + complaints.join(', '));
  }
  lines.push(R.splitLine(matched.length, asked.length, complaints.length, word));
  emit({ cfg, data, M, roster, seam, id, res, out, ms, lines, complaints, breach });
}

// ---- the shared report + the armed-band decision ----------------------------
function emit(o) {
  const { cfg, data, M, roster, seam, id, res, out, ms, lines, complaints, breach } = o;

  // TRAINED-ONLY REFUSAL. A refusal band is a cut on a confidence number; a provider
  // whose class is not TRAINED does not produce that quantity, so the band is NOT ARMED
  // and this seam degrades to advisory FOR THIS RUN, loudly. Degrading silently in either
  // direction would be the fail-open shape: pass-by-silence one way, refuse-on-a-
  // thermometer-that-only-knows-hotter the other. A POST-HOC moment can never arm.
  const wantsRefuse = seam.mode === 'refuse';
  const classOk = ((out && out.providerClass) || res.provider.providerClass || '') === 'TRAINED';
  const posthoc = !!POST_HOC[M.moment];
  const armed = wantsRefuse && classOk && !posthoc;

  console.log('JUDGMENT seam (' + id + ') · ' + M.moment + ' · ' + res.provider.kind + '/' +
    ((out && out.model) || 'no model call') + ' · roster ' + (roster.rosterVersion || '?') + '/' +
    (seam.templateVersion || '?') + ' · ' + (ms || 0) + ' ms · ' +
    (armed ? 'REFUSE-ARMED' : 'ADVISORY') + (seam.grade ? ' (' + seam.grade + ')' : '') +
    (posthoc ? ' · POST-HOC (reported, never refused)' : '') +
    '\n' + lines.join('\n') +
    (wantsRefuse && !classOk
      ? '\n  BAND NOT ARMED: mode is `refuse` but the provider class is "' +
        ((out && out.providerClass) || res.provider.providerClass || 'undeclared') +
        '", not TRAINED. A refusal band is a cut on a calibrated confidence; this run is advisory.'
      : '') +
    (wantsRefuse && classOk && posthoc
      ? '\n  BAND NOT ARMED: this is a post-hoc moment — the work has already happened and a ' +
        'refusal cannot un-spend it.'
      : '') +
    (breach
      ? '\n  ' + (armed ? 'REFUSED' : 'ADVISORY') + ': ' + complaints.join(', ')
      : '\n  ADVISORY: every question answered inside its band.'));

  CFG.logGate(cfg, 'judgment-gate', breach ? 'BLOCK' : 'PASS', M.subject,
    (breach ? (armed ? 'band-breach:' : 'advised:') : 'reported:') + id + '@' + M.moment);

  if (breach && armed) {
    process.stderr.write([
      'JUDGMENT GATE — ' + data.tool_name + ' rejected by seam "' + id + '" (' + M.moment + ').',
      '',
      '  breached : ' + complaints.join(', '),
      '  provider : ' + res.provider.kind + '/' + ((out && out.model) || '?') +
        ' · class ' + ((out && out.providerClass) || res.provider.providerClass),
      '  roster   : ' + (roster.rosterVersion || '?') + '/' + (seam.templateVersion || '?'),
      '',
      'The full answer is printed above. If the seam is wrong here, the remedy is the band',
      'and its labeled set — not an escape marker: a marker is forged as easily as the thing',
      'it excuses.'
    ].join('\n') + '\n');
    process.exit(2);
  }
}

// ---- seam shape ------------------------------------------------------------

// A seam is the ROSTER's definition with the project's config overlaid: the questions,
// the ladder and the state filter are the roster's (they are the versioned unit); the
// moment, the mode and the band are things a project may legitimately tune without
// forking the questions.
function seamFor(roster, j, id) {
  const base = (roster.seams || {})[id] || {};
  const over = ((j.seams || {})[id]) || {};
  return {
    moment: over.moment || base.moment || 'spawn',
    moments: over.moments || base.moments || null,
    mode: over.mode || base.mode || 'advisory',
    band: Object.assign({}, base.band, over.band),
    appliesRe: over.appliesRe !== undefined ? over.appliesRe : base.appliesRe,
    grade: base.grade,
    templateVersion: base.templateVersion,
    maxBundle: base.maxBundle,
    stateMaxChars: base.stateMaxChars,
    shortCircuit: base.shortCircuit,
    mine: base.mine,
    pair: base.pair,
    policy: base.policy,
    questions: base.questions || {}
  };
}

// A seam may claim ONE moment (the simple case) or SEVERAL, with each question declaring
// its own — one question asked at five boundaries is still one question, and splitting it
// into five seams would mean five state assemblies and five ledger vocabularies for it.
function momentsOf(seam) {
  const out = (seam.moments || [seam.moment]).slice();
  Object.keys(seam.questions || {}).forEach(q => {
    const m = seam.questions[q].moment;
    if (m && out.indexOf(m) === -1) out.push(m);
  });
  return out;
}

function questionsAt(seam, moment) {
  return Object.keys(seam.questions || {})
    .filter(q => (seam.questions[q].moment || seam.moment) === moment);
}

function isPaired(q) { return !!(q && (q.pair || q.perPair)); }

// ---- the optional supervisor -----------------------------------------------
//
// OFF BY DEFAULT, AND THAT IS NOT TIMIDITY. Everything else in this package reads files
// and exits; this launches a DETACHED PROCESS that outlives the tool call. A package that
// did that on install, silently, would deserve to be uninstalled. `judgment.supervisor.
// enabled: true` is the whole switch, and the launch PRINTS the log path it wrote to.
function supervisorCfg(cfg) {
  const s = (cfg.judgment && cfg.judgment.supervisor) || {};
  if (!s.enabled) return null;
  if (String(process.env.A8_JUDGMENT_SUPERVISOR || '') === '0') return null;
  const os = require('os');
  return {
    dir: CFG.expandTilde(s.dir || path.join(os.tmpdir(), 'a8-loom-supervisor')),
    agentRe: s.agentRe || '',
    monitor: path.join(__dirname, 'judgment-supervisor.js')
  };
}

// The lane is keyed by its BRIEF, because a spawn payload carries no worker id: at the
// moment the monitor starts, the lane it will watch does not exist and has no name. The
// brief's hash is the one thing both ends of the span hold.
function briefKey(prompt) {
  return require('crypto').createHash('sha256').update(String(prompt || '')).digest('hex').slice(0, 16);
}

function supervisorLaunch(cfg, data) {
  const S = supervisorCfg(cfg);
  if (!S) return;
  const fs = require('fs');
  const prompt = String((data.tool_input || {}).prompt || '');
  if (!prompt) return;
  const agent = String((data.tool_input || {}).subagent_type || '');
  const scope = rx(S.agentRe);
  if (scope && !scope.test(agent)) return;            // out of scope is not a verdict
  const key = briefKey(prompt);
  try {
    fs.mkdirSync(S.dir, { recursive: true });
    fs.writeFileSync(path.join(S.dir, key + '.brief'), prompt);
    try { fs.unlinkSync(path.join(S.dir, key + '.done')); } catch (e) {}   // a stale sentinel
    const child = require('child_process').spawn(process.execPath, [
      S.monitor, '--dir', S.dir, '--key', key,
      '--brief-file', path.join(S.dir, key + '.brief'),
      '--cwd', String(data.cwd || cfg.__repoRoot || process.cwd()),
      '--agent', agent
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('JUDGMENT supervisor: watching this lane (brief ' + key + ') · log ' +
      path.join(S.dir, key + '.log') + ' · IT ADVISES AND CANNOT ACT — its proposals are ' +
      'printed back into the result and at the turn boundary.');
  } catch (e) {
    console.log('JUDGMENT supervisor: could not start (' + (e && e.message) + ') — the lane runs unwatched.');
  }
}

// The sentinel is a FILE and not a signal: the process that spawned the monitor detached
// left no handle, and a pid resolved after the fact is not necessarily your pid.
function supervisorReport(cfg, data) {
  const S = supervisorCfg(cfg);
  if (!S) return;
  const fs = require('fs');
  const prompt = String((data.tool_input || {}).prompt || '');
  if (!prompt) return;
  const key = briefKey(prompt);
  try { fs.writeFileSync(path.join(S.dir, key + '.done'), String(Date.now())); } catch (e) {}
  let rows = [];
  try {
    rows = fs.readFileSync(path.join(S.dir, key + '.pending'), 'utf8').split('\n')
      .filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(Boolean);
  } catch (e) { rows = []; }
  if (!rows.length) return;
  console.log('JUDGMENT supervisor — ' + rows.length + ' proposal(s) for the lane that just ' +
    'returned (brief ' + key + '). ADVISORY: the monitor has no channel to a worker and ' +
    'executed nothing.\n' +
    rows.map(r => '  · ' + r.action + ' · ' + r.question + ' — ' + r.why +
      (r.evidence ? '\n    evidence: ' + r.evidence : '')).join('\n'));
}
