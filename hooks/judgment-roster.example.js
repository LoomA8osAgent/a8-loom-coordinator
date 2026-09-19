#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// judgment-roster.example.js — THE VERSIONED UNIT of the judgment layer.
//
// COPY THIS TO `hooks/judgment-roster.js` (or wherever `judgment.roster` points) AND
// MAKE IT YOURS. It ships as `.example` on purpose: the two seams below are EXAMPLES of
// the shape, drawn from a production stack, and their question text is about THIS
// package's own vocabulary. Your seams will read your briefs, your diffs, your commit
// messages. Nothing here is a default anyone should inherit unread.
//
// WHY A ROSTER FILE AT ALL. A question inlined in a hook is a canon value living in
// prose one layer down — unversioned, undiffable, and impossible to replay. Everything
// that decides a verdict lives here as CODE: the question text, the primitive, the
// ladder, the band, the state filter, the engagement rule. The gate contains none of it.
//
// EVERY CHANGE TO ANY VALUE BELOW BUMPS `rosterVersion`, and re-runs whatever labeled
// set the band was measured on. A changed prompt that does not move the version is an
// invisible change — and an invisible change to a question is an invisible change to
// every verdict downstream.
//
// WHERE THE ANSWERS COME FROM. The gate is a client of a `/v1/systemone` server named by
// `judgment.provider.baseUrl`. Three shapes, all real:
//   local   — "http://127.0.0.1:8493", modelId "laya": Laya 421M (Apache-2.0) served by
//             von (Apache-2.0). The only shape a GATE may use — the client refuses a
//             non-loopback base URL outright. Commands: integrations/judgment.md.
//   remote  — "https://api.typesafe.ai", modelId "jev-1.13.0": Jev, by TypeSafe AI.
//             A key and a round trip, so it is app-side / author-time work, never a repo
//             gate. $0.042 per million input tokens, output free.
//   fixture — the deterministic stub, for every selftest, always.
//
// THE THREE PRIMITIVES (wire shapes in `hooks/lib/decision-provider.js`):
//   noul   — { type:'noul',   instructions }                      -> a probability
//   choice — { type:'choice', instructions, criteria:{k:desc} }   -> one named key
//   score  — { type:'score',  instructions, criteria:[lvl0,lvl1] } -> an ORDINAL rung
//
// PHRASING RULES, both learned the hard way:
//   · HIGH = YES, and no double negatives. A mid probability means UNCERTAIN, not
//     "medium" — and a negated question makes the uncertain band unreadable, because
//     the reader cannot tell which side is the good one.
//   · A Score's levels are NAMED SITUATIONS, never units and never a rating. Turning a
//     ladder into a cascade of yes/no questions is refused: it manufactures an ordering
//     the model never expressed, and costs one forward pass per rung.

'use strict';

// ── EXAMPLE SEAM 1 — brief audit (four Nouls at the spawn moment) ────────────
//
// WHAT NO MATCHER REACHES. The spawn gate's other checks read the SHAPE of a brief: a
// budget line, a model pin, an allowlisted agent, a proof label. Every one of them is a
// regex and every one of them is correct. What none of them reaches is the brief's
// CONTRACT WITH ITS WORKER — "does this brief require the worker to report the
// retrievals behind its factual claims" can be written a dozen ways and omitted a dozen
// more, and the only signal is MEANING. That is the input class a decision model takes.
//
// ADVISORY, AND THAT IS A GRADE RATHER THAN A SOFT START. Reading a paragraph for a
// clause is the fact-check / inference family, whose accuracy ceiling is materially
// below the routing family's. Refusing a spawn on an ~88%-accurate reading of prose
// would block correct work about one time in eight, and a gate that cries wolf gets
// switched off — which is how a real hole ships. So a low answer PRINTS and the spawn
// proceeds. Arming `mode: 'refuse'` here is a separate, evidenced decision that needs a
// labeled set AND a hostile-input fixture leg (see `governance/LOCAL-MODELS.md`).
const briefAudit = {
  moment: 'spawn',
  mode: 'advisory',
  grade: 'ADVISORY-FIRST (fact-check family)',
  templateVersion: 'briefAudit-1',
  // A PLACEHOLDER, and honest about being one: 0.5 is the neutral cut. Above it the
  // seam reports the clause as present, below it as MISSING, and nothing is refused
  // either way. A real cut comes from a labeled set, per provider AND per arity.
  band: { advise: 0.5 },
  // A coverage curve, never a single line — and no curve exists before the labeled set.
  // Recorded as null so the hole is VISIBLE rather than implied.
  coverageTarget: null,
  questions: {
    requires_evidence_list: {
      type: 'noul',
      instructions: 'Does this worker brief require the worker to report the list of searches, ' +
        'greps or retrievals it actually ran? Answer yes if the brief asks for the retrievals, ' +
        'the searches performed, or the evidence behind its factual claims to be listed in what ' +
        'it returns.'
    },
    has_return_shape: {
      type: 'noul',
      instructions: 'Does this worker brief specify the shape or the length of what the worker ' +
        'must return? Answer yes if it states what the return must contain, how it must be ' +
        'structured, or a size limit for it.'
    },
    names_executable_sources: {
      type: 'noul',
      instructions: 'Does this worker brief point the worker at specific files or paths that it ' +
        'must read in full, rather than describing or summarising the contents of those files ' +
        'for it? Answer yes if the brief names files to read and no if it mainly restates what ' +
        'those files say.'
    },
    proof_tier_stated: {
      type: 'noul',
      instructions: 'Does this worker brief state how much verification the work will get — the ' +
        'proof tier, or which specific checks the worker must run? Answer yes if the amount of ' +
        'proving expected is stated somewhere in the brief.'
    }
  }
};

// ── EXAMPLE SEAM 2 — proof tier (ONE Score at the spawn moment) ──────────────
//
// THE JUDGMENT HALF OF A WORD LIST, NEVER ITS REPLACEMENT. A matcher already refuses a
// brief that names two proof instruments under a light label, and that matcher keeps
// every verdict it already reaches. What it cannot reach is its own enumeration: a gate
// that lists INSTRUMENTS silently exempts every instrument added after it, so a brief
// describing a sweep in words the list does not carry passes it. That residue is what
// this Score reads, and it is the only thing it reads.
//
// ONE SCORE, AND THE LADDER IS THE PRIMITIVE. The three levels are ORDERED SITUATIONS.
// The gate computes the level as an ARGMAX over `probabilities` in code — never from the
// returned `score`, which is a probability-weighted expectation, and cutting a weighted
// number at a rung is arithmetic on an ordinal.
//
// ⚠ A LADDER IS NOT UNIVERSALLY ANSWERABLE. Some published exports of otherwise capable
// models freeze their option slot at 2, which makes every Score and every 3+-way Choice
// unanswerable on them. An ENGAGED seam whose provider cannot answer DENIES — the honest
// state, printed — rather than silently skipping. Check the runtime before arming a
// Score seam (`governance/LOCAL-MODELS.md` §What a provider must be able to answer).
const proofTier = {
  moment: 'spawn',
  mode: 'advisory',
  grade: 'ADVISORY-FIRST (instruction-following family)',
  templateVersion: 'proofTier-1',
  // adviseAtLevel 2 = the ladder's THIRD rung. `refuseAtLevel: null` records an UNARMED
  // band rather than leaving it implied.
  band: { adviseAtLevel: 2, refuseAtLevel: null },
  coverageTarget: null,
  // Only fire this seam when the brief declares the light tier — under an explicit heavy
  // tier the written reason IS the argument for the extra steps and a reader can
  // challenge it; body-checking heavy makes the reason unspendable and pushes authors
  // back to lying with the label. A seam may declare `appliesRe` to scope itself to the
  // states it is about; absent, it fires at every occurrence of its moment.
  appliesRe: 'PROOF:\\s*light\\b',
  questions: {
    proof_tier_body: {
      type: 'score',
      instructions: 'How much verification does this brief ask the worker to perform?',
      criteria: [
        'one run of the thing that was changed, and nothing else',
        'one comparison at a single seam',
        'a suite — multiple instruments, or a sweep across a set'
      ]
    }
  }
};

// ── state assembly ───────────────────────────────────────────────────────────
//
// ASSEMBLED AND FILTERED IN CODE. The hook does the parsing, the grepping, the counting
// and the date ordering; the model sees only the minimum needed for the judgment. This
// is not a nicety in either direction: accuracy FALLS with irrelevant state, and on a
// local provider the state is re-encoded into every question's row, so every byte kept
// is paid once per question.
//
// Code blocks are stripped here because these seams ask about a brief's PROSE CONTRACT
// (does it ask for evidence, does it name files, does it state a tier), and a pasted
// diff or JSON payload is pure noise against all of them. Paths and ids survive — they
// live in the prose, and `names_executable_sources` needs to see them.
const STATE_MAX_CHARS = 2000;

function filterState(text, maxChars) {
  const cap = maxChars || STATE_MAX_CHARS;
  let s = String(text == null ? '' : text);
  s = s.replace(/```[\s\S]*?```/g, ' ');        // fenced code / JSON payloads
  s = s.replace(/^\s{4,}\S[^\n]*$/gm, ' ');     // indented code blocks
  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  if (s.length > cap) {
    // TRUNCATED, and it SAYS SO inside the state itself. A silently cut input is a
    // different question asked without anyone knowing. Here the cut is legitimate — the
    // tail of a long brief is detail and these questions are answered by its contract —
    // but it is never silent.
    s = s.slice(0, cap) + '\n[state truncated at ' + cap + ' characters]';
  }
  return s;
}

// ── EXAMPLE SEAM 3 — drift (five Nouls, one question, five boundaries) ───────
//
// ONE SEAM, FIVE NOULS, ONE QUESTION: **DOES A STILL DESCRIBE B.** Every member of this
// family is the same shape — two texts that are supposed to say the same thing, at a
// moment where one of them has just been re-authored from the other and nothing reads
// the two back against each other. Five seams would mean five state assemblies, five
// engagement blocks and five ledger vocabularies for one question, which is the
// duplication this package's own rules name.
//
//   A                                   B                              moment
//   the brief sent to a worker          the report that came back      result
//   the work item a commit cites        the subject + the staged files commit
//   the commit message body             the staged change              commit
//   a sentence carrying a file:line     the lines it cites             doc
//   an operator ruling in the session   the compaction summary         compaction
//
// ⚠ THE BAND READS THE OTHER WAY UP FROM THE TWO SEAMS ABOVE. briefAudit asks a
// question whose YES is the thing being looked for (a clause is PRESENT). Here
// high = yes = "B still matches A" = NOTHING IS WRONG, **so the finding is the LOW
// answer.** Phrasing it as "has this drifted" was refused: that is the double negative
// the phrasing rule above forbids, and with a negated question a reader cannot tell
// which side of an UNCERTAIN 0.5 is the good one. So the questions stay in situation
// form and the direction is DECLARED per question (`findingAt`) and compared in ONE
// place (`bandVerdict`), where five hosts read it the same way up.
//
// ADVISORY, BY FAMILY. Reading two texts for agreement is the fact-check family. No
// question here carries an `armable` field: none may ever refuse on its ANSWER. The
// gate still DENIES when it cannot ASK, which is a different thing entirely — except
// at the two POST-HOC moments (`result`, `compaction`), where the work has already
// happened, a refusal cannot un-spend it, and the gate reports instead and says so.
//
// ── NEVER ASK A MODEL A QUESTION A REGEX ANSWERS ────────────────────────────────
// The rule bites harder here than anywhere else, because "does A still describe B" has
// a whole CLASS of instances where **A is literally inside B** — a summary that quotes
// the ruling it compacts, a return that restates the task, a subject carrying the
// item's own title. Every one of those is answerable by string comparison, at zero
// cost, with no probability attached and nothing to calibrate. **The model is for
// PARAPHRASE:** B saying the same thing in different words, which is the only case a
// matcher genuinely cannot reach. So `codeMatch` runs FIRST, the Noul is asked only
// about the remainder, and every host PRINTS THE SPLIT — without it, a seam that found
// everything already covered and a seam that asked nothing because it was broken look
// identical.
const drift = {
  // A MULTI-MOMENT SEAM: each question declares its own moment, and the gate asks only
  // the ones whose moment is the one it is standing at.
  moments: ['result', 'commit', 'doc', 'compaction'],
  mode: 'advisory',
  grade: 'ADVISORY-FIRST (fact-check family)',
  templateVersion: 'drift-1',
  // A NEUTRAL PLACEHOLDER THAT SAYS IT IS ONE. At or above it the pair reads as still
  // matching; below it the host names the pair as DRIFT. Nothing is refused either way.
  band: { advise: 0.5 },
  coverageTarget: null,
  // Binds the two questions that can have MORE THAN ONE PAIR (one per changed cite,
  // one per mined ruling). More pairs than this ⇒ rank in code, take the top N, and
  // print the remainder BY NAME as unexamined — an unexamined candidate is listed,
  // never silently dropped.
  maxBundle: 8,
  // A SEPARATE, SMALLER CAP THAN THE ROSTER'S, and it is not a rounder number by
  // accident: three of these five questions read CODE (a diff, cited source lines, a
  // staged file list) and code is denser per token than brief prose, so the same
  // character budget buys fewer characters of headroom. Derive yours against YOUR
  // provider's encoder; copying a neighbour's number is how one of them ends up wrong.
  stateMaxChars: 800,
  // THE CODE-FIRST CUT. It decides which questions are ASKED AT ALL, which is exactly
  // what `rosterVersion` versions. ⚠ A PLACEHOLDER THAT SAYS SO: 0.6 is a neutral
  // high-overlap cut, deliberately HIGH — a pair wrongly short-circuited is a finding
  // NEVER MADE (silence scoring as coverage), while a pair wrongly asked about costs
  // one forward pass. When in doubt, ASK.
  shortCircuit: { tokenOverlap: 0.6 },
  // The compaction question's miner, as DATA: which operator turns count as a ruling.
  // It over-mines on purpose, and the short words are in the list on purpose — an
  // operator rules in single words, and a list tuned for prose would mine none of them.
  mine: {
    decisionWords: ['ratified', 'ratify', 'accepted', 'approved', 'adopt', 'adopted',
      'go ahead', 'proceed', 'ship it', 'do it', 'yes', 'no', 'stop', 'drop it'],
    maxRulings: 8
  },
  questions: {
    // A = the brief sent to a worker, B = its return. A spawn gate can read whether a
    // brief STATES its contract; nothing reads whether the thing that came BACK is
    // about the thing that was sent. POST-HOC: reported, never refused.
    lane_return_matches_brief: {
      type: 'noul', moment: 'result', findingAt: 'low', words: ['matches', 'DRIFT'],
      pair: { a: 'THE BRIEF THAT WAS SENT', b: 'THE REPORT THAT CAME BACK' },
      instructions: 'Does the returned work report still describe the task it was given? ' +
        'Answer yes if what the worker reports doing matches the task, the files and the ' +
        'deliverables the brief asked for.'
    },
    // A = the work item the commit cites, B = the subject + the staged file list. A work
    // list can refuse a row leaving on a fake or checkpoint hash; it cannot read whether
    // the commit is ABOUT the row.
    commit_matches_cited_work: {
      type: 'noul', moment: 'commit', findingAt: 'low', words: ['matches', 'DRIFT'],
      pair: { a: 'THE WORK ITEM THE COMMIT CITES', b: 'THE COMMIT SUBJECT AND ITS FILES' },
      instructions: 'Does this commit still match the work item it cites? Answer yes if the ' +
        'subject and the changed files describe the same piece of work the cited item asks for.'
    },
    // A = the commit message body, B = the staged hunks. A commit-msg check can refuse a
    // message with NO body; a body describing a DIFFERENT change than the one beneath it
    // satisfies that check completely.
    message_matches_diff: {
      type: 'noul', moment: 'commit', findingAt: 'low', words: ['matches', 'DRIFT'],
      pair: { a: 'THE COMMIT MESSAGE BODY', b: 'THE STAGED CHANGE' },
      instructions: 'Does this commit message still describe the change staged beneath it? ' +
        'Answer yes if the message account of what changed matches the added and removed ' +
        'lines shown.'
    },
    // A = the sentence around a `file:line` citation in a doc being written, B = the
    // lines it cites. A citation linter proves the file exists and the line is in range —
    // the two things a matcher CAN prove — and says nothing about whether the sentence is
    // true of what is there. MULTI-PAIR.
    cite_sentence_matches_lines: {
      type: 'noul', moment: 'doc', findingAt: 'low', words: ['matches', 'DRIFT'],
      perPair: true,
      pair: { a: 'THE SENTENCE', b: 'THE LINES IT CITES' },
      instructions: 'Does this sentence still describe the code it cites? Answer yes if the ' +
        'claim the sentence makes about the cited file is borne out by the lines shown from it.'
    },
    // A = one operator ruling mined from the session, B = the best-matching section of
    // the compaction summary. A compaction REPLACES the session's account of itself with
    // a rewrite nothing reads back — and the summary carries the current task while the
    // session carried every ruling, budget and deferral. MULTI-PAIR, POST-HOC.
    summary_carries_ruling: {
      type: 'noul', moment: 'compaction', findingAt: 'low', words: ['carried', 'MISSING'],
      perPair: true,
      pair: { a: 'THE RULING', b: 'THE SUMMARY SECTION' },
      instructions: 'Does this summary still carry the ruling shown? Answer yes if the ' +
        'summary records the same decision, in substance, as the ruling shown beside it.'
    }
  }
};

// ── EXAMPLE SEAM 4 — supervisor (three Nouls, judged WHILE the lane runs) ────
//
// EVERY OTHER SEAM HERE JUDGES AT A BOUNDARY, AND FOR A LANE A BOUNDARY IS ALWAYS
// EITHER TOO EARLY OR TOO LATE. briefAudit reads a brief before a single token is
// spent; drift's `lane_return_matches_brief` reads the return after every one of them
// has been. This seam asks the same family of question in the ONE window where the
// answer can still change what is spent — concurrently, from a bounded view of what the
// lane has produced so far.
//
// SHAPE FROM `thruwire/foreman` (prior art; nothing imported — it is Python, single-
// vendor and single-CLI, and it ships observations to a cloud provider): BOUNDED
// OBSERVATIONS · PARALLEL QUESTIONS over ONE rendering of them · a DETERMINISTIC POLICY
// with named thresholds · STEER-ONCE behind a GRACE PERIOD. Refused from it: the
// transport, and any notion of the monitor ACTING.
//
// ⛔ THE MONITOR CANNOT ACT, AND THAT IS THE SEAM'S BOUNDARY. A detached process has no
// channel to a running worker: it cannot message it, it cannot stop it, and it is given
// no verdict to execute. **Every action is a FILE the coordinator reads at its next tool
// boundary.** This is not a limitation to route around — a supervisor that could stop a
// lane on an ~88%-ceiling reading of a PARTIAL log would be a refusal band armed on
// nothing. The monitor writes; a seat acts.
//
// ⚠ THE THREE QUESTIONS DO NOT ALL READ THE SAME WAY UP, which is why the direction is a
// FIELD and not a convention: for `lane_on_brief` the finding is the LOW answer, for
// `lane_stuck` and `lane_over_proof` it is the HIGH one. A host that re-derived the
// comparison would eventually get one of the three backwards, and a supervisor reporting
// healthy on a stuck lane is a gate failing open with a confident voice.
//
// AND THE SHORT-CIRCUIT'S SIGN DIFFERS FROM `drift`'s. There, a code match means NOTHING
// IS WRONG. Here a code hit on `lane_stuck` / `lane_over_proof` means **THE FINDING IS
// ALREADY MADE**. Both are "the code answered it"; each is labelled with which it was.
// A code answer is a CERTAINTY and is NOT banded — `byCode` verdicts carry `value: NaN`
// on purpose, and `supervisorAction` treats them as crossing both cuts by construction.
// (Without that, every NaN comparison is false, the code-answered finding crosses
// nothing, and the policy reports `continue` on a visibly stuck lane — the finding made,
// then discarded by the thing meant to act on it.)
const supervisor = {
  moment: 'monitor',                 // not a gate moment: the monitor polls, it never fires
  mode: 'advisory',
  grade: 'ADVISORY-FIRST (partial-log reading)',
  templateVersion: 'supervisor-1',
  band: { advise: 0.5 },             // the REPORTING cut only — the ACTION cuts are below
  coverageTarget: null,
  maxBundle: 3,
  stateMaxChars: 850,
  // The pair labels sit at SEAM level, not per question, because all three questions
  // read ONE state: the wire carries one state for N questions, so three per-question
  // pairs would be three renderings of one observation — and two renderings of one
  // object are two different questions.
  pair: { a: 'WHAT THE BRIEF ASKED FOR', b: 'WHAT THE LANE HAS DONE SO FAR' },
  // `repeatRun` is the number of IDENTICAL consecutive steps that is a repeat rather
  // than a rhythm — 3, because two identical reads in a row is ordinary (read, edit,
  // re-read) and three is not. A PLACEHOLDER, like every number in this seam.
  shortCircuit: { tokenOverlap: 0.6, repeatRun: 3 },
  // ── THE POLICY TABLE, AS DATA ────────────────────────────────────────────────
  // It lives in the ROSTER and not in the monitor because it is exactly the class of
  // value `rosterVersion` versions: change a threshold and every verdict downstream
  // changes with no diff anyone reads. The monitor owns the LOOP; the roster owns what
  // the loop DECIDES, and `supervisorAction` below is the ONE resolver both the monitor
  // and its selftest read — so a leg cannot pass against a policy the monitor does not
  // run.
  //
  // ⚠ EVERY NUMBER BELOW IS A PLACEHOLDER AND IS LABELLED ONE. No coverage curve exists
  // for this seam, so the action cuts sit where an ADVISORY is cheap and a STEER is not.
  // They are not a measurement and must not be cited as one.
  policy: {
    // THE CADENCE — a placeholder. A lane's step takes seconds and its findings take
    // minutes: faster buys nothing, slower arrives after the money is spent.
    cadenceMs: 60000,
    // THE BACK-OFF. Measured elsewhere and encoded here as policy: while a training run
    // or another load holds the accelerator, a resident provider still answers /health
    // in milliseconds but a real question outruns the window. **The remedies printed for
    // a DEAD provider do not apply to a BUSY one**, and switching to the fixture to get
    // past it disengages a seam that is working. So the monitor doubles its interval to
    // a ceiling and KEEPS ASKING. Every value is a placeholder.
    backoff: {
      factor: 2,
      maxMs: 480000,                 // the ceiling a doubling walk stops at
      slowAnswerMs: 2000,            // an answer slower than this ⇒ the runtime is loaded
      busyProcessRe: ''              // a process name whose presence means "loaded"; '' = off
    },
    // STEER-ONCE + GRACE, both placeholders. A steer is written AT MOST ONCE per lane,
    // and for `graceMs` after it NOTHING else is written — including for a different
    // question. That is the point: a lane that has just been steered is a lane whose
    // next minute is not evidence of anything, and a monitor that wrote one file per
    // poll would be noise. Noise is how an advisory gets ignored.
    maxSteers: 1,
    graceMs: 300000,
    // THE QUIET BACKSTOP — when the monitor exits on its own. The sentinel written at
    // the result moment is the primary stop; this covers a lane whose result never
    // arrives, so a monitor can never outlive every lane and become a process nobody
    // owns. A placeholder.
    quietMs: 1800000,
    actions: ['continue', 'steer-once', 'stop-verdict'],
    // PER QUESTION, read against `findingAt`: a LOW-finding question crosses DOWNWARD
    // through its cut, a HIGH one upward. All placeholders.
    thresholds: {
      lane_on_brief:   { advise: 0.40, steer: 0.20 },
      lane_stuck:      { advise: 0.70, steer: 0.88 },
      lane_over_proof: { advise: 0.70, steer: 0.88 }
    },
    // ⚠ `lane_on_brief` IS DELIBERATELY ABSENT. A lane reading off-brief may be doing
    // the right thing by a route the brief did not name; proposing a stop on that
    // reading is the cries-wolf failure that gets a gate switched off. It may be
    // steered. It may never be proposed for a stop.
    stopVerdictFor: ['lane_stuck', 'lane_over_proof']
  },
  questions: {
    // A = the brief's deliverables and declared write set, B = what the lane has written
    // plus its recent steps. A spawn gate reads whether a brief STATES its contract;
    // nothing reads whether the lane is honouring it while there is still budget left to
    // redirect. FINDING IS THE LOW ANSWER.
    lane_on_brief: {
      type: 'noul', findingAt: 'low', words: ['on brief', 'OFF BRIEF'],
      instructions: 'Is the work this lane has done so far the work its brief asked for? ' +
        'Answer yes if the files it has written and the steps it has taken fall inside the ' +
        'deliverables and the paths the brief names.'
    },
    // B alone: the recent step window. The code-level half catches an identical repeat;
    // this reads the case a string comparison cannot — different commands, the same wall,
    // no movement. FINDING IS THE HIGH ANSWER.
    lane_stuck: {
      type: 'noul', findingAt: 'high', words: ['moving', 'STUCK'],
      instructions: 'Is this lane repeating itself without making progress? Answer yes if ' +
        'the recent steps shown repeat the same command, or hit the same error again, ' +
        'without the work moving forward.'
    },
    // A = the brief's proof line, B = the proving the lane is visibly doing. The spawn
    // gate reads the brief's BODY against a word list BEFORE the lane runs; a lane can
    // pass that and then run a suite anyway, and until this seam nothing looked.
    // FINDING IS THE HIGH ANSWER.
    lane_over_proof: {
      type: 'noul', findingAt: 'high', words: ['within tier', 'OVER-PROOF'],
      instructions: 'Is this lane running more verification than its brief allows? Answer ' +
        'yes if the steps shown run proving instruments or sweeps beyond the amount of ' +
        'verification the brief states.'
    }
  }
};

// ── paired state — ONE rendering of a pair, shared by every host ─────────────
//
// FIVE BOUNDARIES, FIVE DIFFERENT PLACES TO GET A AND B FROM, **ONE RENDERING OF A
// PAIR.** The hosts differ only in the readers. What they must NOT differ in is how a
// pair is PUT TO THE MODEL: two renderings of one pair are two different questions.
//
// THE BUDGET IS SPLIT BETWEEN THE SIDES, AND THAT IS THE WHOLE TRICK. A single-text
// question can spend its whole cap on one head; a COMPARISON cannot, because **the
// cheapest way to make every pair "match" is to cut the B side off the end.** So the cap
// is divided evenly across the sides present, each side is cut to its own share, and
// every cut is DECLARED inside the state — the same discipline `filterState` applies to
// a brief, applied to each half of a pair.
//
// pairs = [{ a, b, label }]. `label` is what a per-pair question refers to; it is the
// pair's index for a multi-pair question and absent for a single-pair one.
function buildPairState(seam, qdef, pairs) {
  const cap = (seam && seam.stateMaxChars) || STATE_MAX_CHARS;
  const la = (qdef && qdef.pair && qdef.pair.a) || (seam && seam.pair && seam.pair.a) || 'A';
  const lb = (qdef && qdef.pair && qdef.pair.b) || (seam && seam.pair && seam.pair.b) || 'B';
  const n = Math.max(1, pairs.length);
  const share = Math.max(80, Math.floor((cap - 40 * n) / (2 * n)));
  const side = (label, text) => {
    let s = String(text == null ? '' : text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (s.length > share) s = s.slice(0, share) + ' […cut to ' + share + ' chars]';
    return label + ':\n' + s;
  };
  // NO PROSE STRIPPING HERE. The two rules in `filterState` exist for a BRIEF and are
  // actively wrong for three of these five questions: a diff body is code by
  // construction, and the indented-block rule matches any hunk line whose source happens
  // to be indented. Bounding by the cap alone is the honest choice for a pair.
  const blocks = pairs.map(p => ((p.label != null) ? ('[' + p.label + ']\n') : '') +
    side(la, p.a) + '\n' + side(lb, p.b));
  let s = blocks.join('\n\n');
  if (s.length > cap) s = s.slice(0, cap) + '\n[state truncated at ' + cap + ' characters]';
  return s;
}

// The wire shape for a MULTI-PAIR question: one question id per pair, each instruction
// carrying the pair's own label so an answer is attributable. The base instruction is
// the ROSTER's — a host never composes question text — and the appended clause is the
// only thing that varies.
function wirePairQuestions(seam, qid, pairs) {
  const def = seam.questions[qid];
  const out = {};
  if (!def.perPair) {
    out[qid] = { type: def.type, instructions: def.instructions };
    return out;
  }
  pairs.forEach(p => {
    out[qid + '__' + p.label] = {
      type: def.type,
      instructions: def.instructions +
        ' Answer only about the pair labelled [' + p.label + '] in the text shown.'
    };
  });
  return out;
}

// ── THE CODE-LEVEL ANSWER, TRIED BEFORE THE MODEL ───────────────────────────
//
// "Never ask a model a question a regex answers; the model reads PARAPHRASE."
//
// Returns { matched, why, overlap } — `matched` true when A is present in B by STRING
// rather than by judgment, in which case the pair is reported PRESENT-BY-MATCH and no
// forward pass is spent on it. Two tests, both cheap and both ONE-DIRECTIONAL (they can
// only ever say PRESENT; absence of a match is never a finding, it is a question):
//
//   1. NORMALISED CONTAINMENT — A, whitespace- and case-normalised, appears inside B.
//   2. TOKEN OVERLAP ≥ the roster cut — the fraction of A's distinct ≥4-char tokens
//      present in B. Catches the reordered / lightly reworded case.
//
// ⚠ BOTH ARE DELIBERATELY CONSERVATIVE, and the asymmetry IS the design: a pair wrongly
// short-circuited is a finding never made, while a pair wrongly asked about costs one
// forward pass.
function codeMatch(seam, a, b) {
  const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  const na = norm(a), nb = norm(b);
  if (!na) return { matched: false, why: 'A is empty', overlap: 0 };
  if (na.length >= 12 && nb.indexOf(na) !== -1) {
    return { matched: true, why: 'A appears verbatim in B', overlap: 1 };
  }
  const toks = s => {
    const m = String(s).toLowerCase().match(/[a-z0-9_./-]{4,}/g) || [];
    const seen = {}, out = [];
    m.forEach(w => { if (!seen[w]) { seen[w] = 1; out.push(w); } });
    return out;
  };
  const ta = toks(na);
  if (!ta.length) return { matched: false, why: 'A carries no comparable tokens', overlap: 0 };
  const tb = {};
  toks(nb).forEach(w => { tb[w] = 1; });
  let hit = 0;
  ta.forEach(w => { if (tb[w]) hit++; });
  const overlap = hit / ta.length;
  const cut = seam && seam.shortCircuit && seam.shortCircuit.tokenOverlap;
  if (typeof cut !== 'number') return { matched: false, why: 'no short-circuit cut', overlap };
  if (overlap >= cut) {
    return { matched: true, why: 'token overlap ' + overlap.toFixed(2) + ' >= ' + cut, overlap };
  }
  return { matched: false, why: 'token overlap ' + overlap.toFixed(2) + ' < ' + cut, overlap };
}

// The one-line account of what a host did with its pairs, PRINTED every time. A seam
// that found everything already covered and a seam that asked nothing because it was
// broken must never look alike.
function splitLine(nMatched, nAsked, nFlagged, word) {
  return '  pairs: ' + nMatched + ' present by code match (no model call) · ' +
    nAsked + ' asked · ' + nFlagged + ' reading as ' + (word || 'DRIFT');
}

// THE BAND, READ ONCE FOR EVERY HOST. `findingAt` declares which side of the cut the
// finding is on ('low' by default — high = yes = nothing is wrong); `words` are the
// question's own vocabulary for its two sides, so a host never composes a verdict word.
function bandVerdict(seam, qid, answer) {
  const qdef = (seam.questions && seam.questions[qid]) || {};
  const words = qdef.words || ['ok', 'FLAGGED'];
  const v = (answer && typeof answer.noul === 'number') ? answer.noul : NaN;
  const high = qdef.findingAt === 'high';
  if (!isFinite(v)) {
    return { value: NaN, flagged: false, answered: false, findingAt: high ? 'high' : 'low',
      word: 'no answer', words };
  }
  const cut = (seam.band && typeof seam.band.advise === 'number') ? seam.band.advise : 0.5;
  const flagged = high ? (v >= cut) : (v < cut);
  return { value: v, flagged, answered: true, findingAt: high ? 'high' : 'low',
    word: flagged ? words[1] : words[0], words };
}

// ── THE POLICY RESOLVER — the ONE reader of `supervisor.policy.thresholds` ───
//
// The monitor owns the LOOP; the roster owns what the loop DECIDES. Both the monitor and
// its selftest call this, so a leg cannot go green against a policy the monitor does not
// run.
//
// ctx: { steersWritten, lastActionMs, now } — the monitor's own bookkeeping, passed in
// rather than held here, because this file is required by a hook and must stay stateless.
//
// Returns { action, why }, action ∈ policy.actions:
//   continue     nothing crossed, or the grace period is still running
//   steer-once   the answer crossed the STEER cut and no steer has been written yet
//   stop-verdict still crossing after a steer and the grace, on a question the policy
//                allows one for — WRITTEN, NEVER EXECUTED
function supervisorAction(seam, qid, verdict, ctx) {
  ctx = ctx || {};
  const pol = seam.policy || {};
  const th = (pol.thresholds && pol.thresholds[qid]) || null;
  if (!verdict || !verdict.answered || !th) {
    return { action: 'continue', why: 'no answer to act on' };
  }
  const high = verdict.findingAt === 'high';
  // ⚠ A CODE-ANSWERED FINDING HAS NO PROBABILITY AND IS NOT BANDED. `byCode` verdicts
  // carry `value: NaN` on purpose: there is no distribution behind "three identical
  // consecutive steps", and running a certainty through a probability cut is arithmetic
  // on something that is not a number. Every NaN comparison is false, so without this a
  // code-answered finding would cross nothing and the policy would report `continue` on
  // a visibly stuck lane — the finding made, then discarded by the thing meant to act on
  // it. A code answer crosses both cuts by construction.
  let crossedAdvise, crossedSteer;
  if (verdict.byCode) {
    crossedAdvise = crossedSteer = !!verdict.flagged;
  } else {
    crossedAdvise = high ? (verdict.value >= th.advise) : (verdict.value <= th.advise);
    crossedSteer = high ? (verdict.value >= th.steer) : (verdict.value <= th.steer);
  }
  if (!crossedAdvise) {
    return { action: 'continue', why: verdict.byCode
      ? qid + ' was answered by code and is not a finding'
      : qid + ' is inside its advise cut (' + th.advise + ')' };
  }
  const now = (typeof ctx.now === 'number') ? ctx.now : Date.now();
  const inGrace = (typeof ctx.lastActionMs === 'number') &&
    (now - ctx.lastActionMs) < (pol.graceMs || 0);
  if (inGrace) {
    return { action: 'continue', why: 'inside the ' + Math.round((pol.graceMs || 0) / 1000) +
      's grace period after the last action — a just-steered lane is not evidence' };
  }
  if (!crossedSteer) {
    return { action: 'continue', why: qid + ' crossed its advise cut but not its steer cut (' +
      th.steer + ') — reported, not acted on' };
  }
  if ((ctx.steersWritten || 0) < (pol.maxSteers == null ? 1 : pol.maxSteers)) {
    return { action: 'steer-once', why: verdict.byCode
      ? qid + ' was answered by code — a certainty, not a banded probability'
      : qid + ' crossed its steer cut (' + th.steer + ')' };
  }
  if ((pol.stopVerdictFor || []).indexOf(qid) !== -1) {
    return { action: 'stop-verdict',
      why: qid + ' is still crossing its steer cut after a steer and the grace period' };
  }
  return { action: 'continue',
    why: qid + ' is still crossing, but the policy allows no stop verdict for it' };
}

// ── THE PAIR READERS — one per drift question, and they are YOURS to change ──
//
// The gate hands each reader the raw moment (`ctx = { moment, payload, repoRoot,
// state }`) and takes back `[{ a, b, label }]`. An empty array means the question has
// nothing to ask about HERE, which is not a verdict — it is the seam saying this moment
// is not its business, and the gate prints exactly that.
//
// ⚠ THE CONVENTIONS BELOW ARE THIS PACKAGE'S EXAMPLES, NOT LAWS: a work list at
// `WORK.tsv`, an id cited in a commit subject, `path:line` citations in docs. Point them
// at your own conventions; that is what copying this file is for.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function sh(repoRoot, args, max) {
  try {
    const out = cp.execFileSync('git', ['-C', repoRoot].concat(args),
      { encoding: 'utf8', timeout: 5000, maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'] });
    return max ? String(out).slice(0, max) : String(out);
  } catch (e) { return ''; }
}

// A tool result is a string, or a list of blocks each carrying text. Anything else is
// reported as empty rather than guessed at.
function textOf(v) {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(b => (b && (b.text || b.content)) || '').join('\n');
  if (v && typeof v === 'object') return String(v.text || v.content || v.output || '');
  return '';
}

function pairsFor(qid, ctx) {
  const root = ctx.repoRoot || process.cwd();
  const seam = drift;

  if (qid === 'lane_return_matches_brief') {
    const brief = String((ctx.payload.tool_input || {}).prompt || '');
    const ret = textOf(ctx.payload.tool_response);
    if (!brief || !ret) return [];
    return [{ a: brief, b: ret }];
  }

  if (qid === 'commit_matches_cited_work') {
    const msg = String(ctx.state || '');
    // THE TRIVIAL IDENTITIES, SHORT-CIRCUITED IN CODE AND SAID OUT LOUD: a checkpoint
    // commit cites nothing by design, and a message citing no id has no A side.
    if (/^\s*(WIP|wip|fixup!|squash!)\b/.test(msg)) return [];
    const m = msg.match(/\b([A-Z][A-Z0-9]*-\d+|#\d+)\b/);
    if (!m) return [];
    const wf = path.join(root, 'WORK.tsv');
    let row = '';
    try {
      row = fs.readFileSync(wf, 'utf8').split('\n')
        .filter(Boolean).find(l => l.split('\t')[0] === m[1].replace(/^#/, '')) || '';
    } catch (e) { row = ''; }
    if (!row) return [];
    const files = sh(root, ['diff', '--cached', '--name-only'], 2000);
    return [{ a: row, b: msg.split('\n')[0] + '\n' + files }];
  }

  if (qid === 'message_matches_diff') {
    const msg = String(ctx.state || '');
    if (/^\s*(WIP|wip|fixup!|squash!)\b/.test(msg)) return [];
    const body = msg.split('\n').slice(1).join('\n').trim();
    if (!body) return [];
    const diff = sh(root, ['diff', '--cached', '-U0'], 20000);
    if (!diff.trim()) return [];
    return [{ a: body, b: diff }];
  }

  if (qid === 'cite_sentence_matches_lines') {
    // A = the sentence carrying a `path:line` citation in the doc being written,
    // B = the lines it cites, read from disk.
    const doc = String(ctx.state || '');
    const out = [];
    const re = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,6}):(\d+)/g;
    let m;
    while ((m = re.exec(doc)) && out.length < (seam.maxBundle || 8)) {
      const file = path.resolve(root, m[1]);
      let lines = '';
      try {
        const all = fs.readFileSync(file, 'utf8').split('\n');
        const n = parseInt(m[2], 10);
        lines = all.slice(Math.max(0, n - 2), n + 3)
          .map((l, i) => (Math.max(1, n - 1) + i) + ': ' + l).join('\n');
      } catch (e) { lines = ''; }
      if (!lines) continue;                      // an unreadable cite is a lint's job
      // ⚠ THE SENTENCE BOUNDS ARE TAKEN AROUND THE CITE, NEVER THROUGH IT: a citation
      // carries dots of its own (`app.js:12`), so a naive full-stop search ENDS THE
      // SENTENCE INSIDE THE PATH and the model is handed half a claim — a different
      // question, asked silently.
      const after = m.index + m[0].length;
      const start = Math.max(doc.lastIndexOf('. ', Math.max(0, m.index - 1)) + 2,
        doc.lastIndexOf('\n', Math.max(0, m.index - 1)) + 1, 0);
      const endRel = doc.slice(after).search(/[.\n]/);
      const sentence = doc.slice(start, endRel < 0 ? Math.min(doc.length, after + 200)
        : after + endRel + 1).trim();
      out.push({ a: sentence, b: lines, label: m[1] + ':' + m[2] });
    }
    return out;
  }

  if (qid === 'summary_carries_ruling') {
    return compactionPairs(ctx, seam);
  }
  return [];
}

// ── THE COMPACTION MINER ─────────────────────────────────────────────────────
//
// A compaction REPLACES the session's account of itself with a rewrite that nothing
// reads back. The remedy written everywhere for this is a DISCIPLINE — sweep the
// transcript before you write anything — and **a discipline is what a fresh seat has
// least of, because the compaction is precisely the moment it stops remembering.**
//
// The mining is CODE end to end: the model is asked exactly one thing per pair, and it
// is asked it only about what a string comparison could not already answer.
//
// ⚠ A TYPED OPERATOR TURN IS `content: <string>`; a TOOL RESULT is the same record type
// with content as an ARRAY, and it is EXCLUDED — otherwise the seam puts words in the
// operator's mouth and reports a "ruling" the operator never made.
//
// It OVER-MINES on purpose: a ruling wrongly asked about costs one forward pass; a
// ruling wrongly dropped costs what the lost-ruling failure costs.
function compactionPairs(ctx, seam) {
  const tp = ctx.payload.transcript_path || ctx.payload.transcriptPath || '';
  if (!tp) return [];
  let recs = [];
  try {
    recs = fs.readFileSync(tp, 'utf8').split('\n').filter(Boolean).map(l => {
      // A TORN FINAL LINE IS NORMAL, NOT CORRUPTION: the file is appended to while it
      // is read.
      try { return JSON.parse(l); } catch (e) { return null; }
    }).filter(Boolean);
  } catch (e) { return []; }

  let from = 0, summary = '';
  recs.forEach((r, i) => {
    if (r.subtype === 'compact_boundary' || r.type === 'compact_boundary') from = i;
    if (r.isCompactSummary === true || r.type === 'summary') {
      summary = textOf((r.message && r.message.content) || r.summary || r.content);
    }
  });
  if (!summary) return [];

  const words = (seam.mine && seam.mine.decisionWords) || [];
  const rulings = [];
  recs.slice(0, from).forEach(r => {
    const role = (r.message && r.message.role) || r.role;
    const c = r.message ? r.message.content : r.content;
    if (role !== 'user' || typeof c !== 'string') return;     // arrays are tool results
    const low = c.toLowerCase();
    if (!words.some(w => low.indexOf(w) !== -1)) return;
    rulings.push(c.trim());
  });
  if (!rulings.length) return [];

  // The summary is split on headings and blank-line blocks, and the best-matching
  // section is chosen IN CODE by token overlap — the model is never asked to search.
  const sections = summary.split(/\n(?=#{1,6}\s|\d+\.\s|[-*]\s)/).filter(s => s.trim());
  const best = (text) => {
    let bs = '', bv = -1;
    sections.forEach(s => {
      const o = codeMatch(seam, text, s).overlap;
      if (o > bv) { bv = o; bs = s; }
    });
    return bs || summary;
  };
  // RANKED IN CODE, lowest overlap first: spend the budget on the rulings that look
  // LEAST covered. The remainder is printed by name as unexamined, never dropped.
  return rulings
    .map((t, i) => ({ a: t, b: best(t), label: String(i + 1),
      _rank: codeMatch(seam, t, summary).overlap }))
    .sort((x, y) => x._rank - y._rank)
    .slice(0, (seam.mine && seam.mine.maxRulings) || seam.maxBundle || 8);
}

module.exports = {
  rosterVersion: 'example-roster-2',
  stateMaxChars: STATE_MAX_CHARS,
  seams: { briefAudit, proofTier, drift, supervisor },
  filterState,
  // The shared resolvers. They live HERE and not in the gate or the monitor because
  // every one of them decides a VERDICT or which questions are ASKED, which is exactly
  // what `rosterVersion` versions — and because a selftest that read a different copy
  // could go green against a policy the gate does not run.
  buildPairState, wirePairQuestions, pairsFor,
  codeMatch, splitLine, bandVerdict, supervisorAction
};
