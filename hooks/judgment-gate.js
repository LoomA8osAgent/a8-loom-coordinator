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

// ---- the moment ------------------------------------------------------------
//
// Which of the three boundaries is this tool call? Decided from the PAYLOAD, before the
// roster is read, so a roster problem can never be mistaken for "no seam here".
function momentOf(cfg, data) {
  const tool = data.tool_name;
  const input = data.tool_input || {};

  if (tool === 'Agent' || tool === 'Task') {
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
    if (D.isExemptFile(cfg, fp)) return null;
    const nc = D.newContentOf(tool, input);
    if (!nc) return null;
    return { moment: 'edit', state: nc, subject: fp };
  }

  return null;
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
// Config first, environment second — the environment override exists so a red-fixture
// can point the gate at the deterministic stub without editing the project's config,
// which is the only way a selftest can be both honest and side-effect free.
function resolveProvider(cfg) {
  const j = cfg.judgment || {};
  const p = j.provider || {};
  const kind = String(process.env.A8_DECISION_PROVIDER || p.kind || '').trim().toLowerCase();
  if (!kind) return { engaged: false, why: 'no judgment.provider.kind configured and no A8_DECISION_PROVIDER' };
  if (kind !== 'systemone' && kind !== 'fixture') {
    return { engaged: false, why: 'provider kind "' + kind + '" is not one this client speaks (systemone | fixture)' };
  }
  return {
    engaged: true,
    why: (process.env.A8_DECISION_PROVIDER ? 'A8_DECISION_PROVIDER=' : 'judgment.provider.kind=') + kind,
    provider: {
      kind: kind,
      baseUrl: process.env.A8_DECISION_BASE_URL || p.baseUrl || 'http://127.0.0.1:8497',
      modelId: process.env.A8_DECISION_MODEL || p.modelId || '',
      fixturePath: process.env.A8_DECISION_FIXTURE || p.fixturePath || '',
      // The CLASS gates what the provider may DO. Undeclared is not TRAINED, so an
      // undeclared provider can never arm a refusal — the safe direction, and the
      // honest one for a value nobody measured.
      providerClass: (process.env.A8_DECISION_CLASS || p.providerClass || '').toUpperCase()
    }
  };
}

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
    return seam.moment === M.moment;
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

  let denied = false;

  seamIds.forEach(id => {
    if (denied) return;
    const seam = seamFor(roster, j, id);

    // A seam may scope itself to the states it is about. Out of scope is not a verdict —
    // the seam is simply not this state's business, and it says so.
    const applies = rx(seam.appliesRe);
    if (applies && !applies.test(M.state)) {
      console.log('JUDGMENT seam (' + id + '): out of scope at this ' + M.moment +
        ' (appliesRe did not match) — not asked');
      return;
    }

    const payload = JSON.stringify({
      state: filter(M.state, maxChars),
      questions: seam.questions,
      provider: res.provider,
      timeoutMs: timeoutMs
    });

    const t0 = Date.now();
    const r = require('child_process').spawnSync(process.execPath, [CLIENT], {
      input: payload, encoding: 'utf8'
    });
    const ms = Date.now() - t0;
    let out = null;
    try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop() || ''); } catch (e) { out = null; }

    if (!out || out.ok !== true) {
      // THE FAIL-CLOSED LEG. The typed code and the provider's own message are printed
      // verbatim — a refusal that says only "could not decide" is the
      // ERROR-REPORTED-AS-NOT-READY failure wearing a hook's clothes.
      denied = true;
      CFG.logGate(cfg, 'judgment-gate', 'BLOCK', M.subject, 'provider-unreachable:' + id);
      process.stderr.write([
        'JUDGMENT GATE — ' + data.tool_name + ' DENIED: seam "' + id +
          '" could not reach its provider.',
        '[a gate that cannot ask does not get to approve]',
        '',
        '  moment   : ' + M.moment,
        '  provider : ' + res.provider.kind + ' (' + res.why + ')' +
          (res.provider.kind === 'systemone' ? ' · ' + res.provider.baseUrl : ''),
        '  error    : ' + ((out && (out.code + ': ' + out.error)) ||
          ('no parseable answer from the client' +
            (r.stderr ? ' · ' + String(r.stderr).split('\n')[0] : ''))),
        (out && out.validationProblems ? '  problems : ' + out.validationProblems.join(' | ') : ''),
        '',
        'The seam is ENGAGED, so an answer is OWED and its absence is a refusal — this is NOT',
        'the same state as an unconfigured seam, which asks nothing and says so.',
        '',
        'Remedies, in order:',
        '  · start the resident loopback provider (see hooks/judgment-server.example.sh)',
        '  · or run the seam on the deterministic stub:',
        '        A8_DECISION_PROVIDER=fixture A8_DECISION_FIXTURE=<map.json>',
        '  · or disengage honestly: set judgment.enabled:false in stack.config.json'
      ].filter(Boolean).join('\n') + '\n');
      process.exit(2);
    }

    // ---- the answers -------------------------------------------------------
    const qids = Object.keys(seam.questions);
    const lines = [];
    const complaints = [];
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

    // TRAINED-ONLY REFUSAL. A refusal band is a cut on a confidence number; a provider
    // whose class is not TRAINED does not produce that quantity, so the band is NOT
    // ARMED and this seam degrades to advisory FOR THIS RUN, loudly. Degrading silently
    // in either direction would be the fail-open shape: pass-by-silence one way,
    // refuse-on-a-thermometer-that-only-knows-hotter the other.
    const wantsRefuse = seam.mode === 'refuse';
    const classOk = (out.providerClass || res.provider.providerClass || '') === 'TRAINED';
    const armed = wantsRefuse && classOk;

    console.log('JUDGMENT seam (' + id + ') · ' + M.moment + ' · ' + res.provider.kind + '/' +
      (out.model || '?') + ' · roster ' + (roster.rosterVersion || '?') + '/' +
      (seam.templateVersion || '?') + ' · ' + ms + ' ms · ' +
      (armed ? 'REFUSE-ARMED' : 'ADVISORY') + (seam.grade ? ' (' + seam.grade + ')' : '') +
      '\n' + lines.join('\n') +
      (wantsRefuse && !classOk
        ? '\n  BAND NOT ARMED: mode is `refuse` but the provider class is "' +
          (out.providerClass || res.provider.providerClass || 'undeclared') +
          '", not TRAINED. A refusal band is a cut on a calibrated confidence; this run is advisory.'
        : '') +
      (breach
        ? '\n  ' + (armed ? 'REFUSED' : 'ADVISORY') + ': ' + complaints.join(', ')
        : '\n  ADVISORY: every question answered inside its band.'));

    if (breach && armed) {
      denied = true;
      CFG.logGate(cfg, 'judgment-gate', 'BLOCK', M.subject, 'band-breach:' + id);
      process.stderr.write([
        'JUDGMENT GATE — ' + data.tool_name + ' rejected by seam "' + id + '" (' + M.moment + ').',
        '',
        '  breached : ' + complaints.join(', '),
        '  provider : ' + res.provider.kind + '/' + (out.model || '?') +
          ' · class ' + (out.providerClass || res.provider.providerClass),
        '  roster   : ' + (roster.rosterVersion || '?') + '/' + (seam.templateVersion || '?'),
        '',
        'The full answer is printed above. If the seam is wrong here, the remedy is the band',
        'and its labeled set — not an escape marker: a marker is forged as easily as the thing',
        'it excuses.'
      ].join('\n') + '\n');
      process.exit(2);
    }
  });

  CFG.logGate(cfg, 'judgment-gate', 'PASS', M.subject, seamIds.length + ' seam(s)@' + M.moment);
  process.exit(0);
})();

// A seam is the ROSTER's definition with the project's config overlaid: the questions,
// the ladder and the state filter are the roster's (they are the versioned unit); the
// moment, the mode and the band are things a project may legitimately tune without
// forking the questions.
function seamFor(roster, j, id) {
  const base = (roster.seams || {})[id] || {};
  const over = ((j.seams || {})[id]) || {};
  return {
    moment: over.moment || base.moment || 'spawn',
    mode: over.mode || base.mode || 'advisory',
    band: Object.assign({}, base.band, over.band),
    appliesRe: over.appliesRe !== undefined ? over.appliesRe : base.appliesRe,
    grade: base.grade,
    templateVersion: base.templateVersion,
    questions: base.questions || {}
  };
}
