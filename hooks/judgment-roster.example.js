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

module.exports = {
  rosterVersion: 'example-roster-1',
  stateMaxChars: STATE_MAX_CHARS,
  seams: { briefAudit: briefAudit, proofTier: proofTier },
  filterState: filterState
};
