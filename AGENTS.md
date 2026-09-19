# AGENTS.md — a8-loom-coordinator

> Cross-model agent guide (the [AGENTS.md](https://agentskills.io) open standard —
> works with Codex CLI, Claude Code, Gemini CLI, Cursor, Cline, Devin, and 30+ tools).
> This file both **governs agents working inside this repo** and **describes what the
> repo is** for any agent that discovers it.

## What this repo is

A **config-driven governance, skills, and hooks stack** for running an LLM as the
autonomous senior engineer on a software project — **any language, any framework,
frontend or backend**. The human is operator, ratifier, and spot-checker, not
babysitter. Its one enforced idea: **discover-then-reuse** — before building
anything, the agent must retrieve what the codebase already provides and reuse it,
never hand-roll a fresh version. That is what makes LLM building *deterministic*
against an existing codebase.

It is a **reusable coordinator seat** (the "Loom" seat) — model-portable by design,
so Opus / Sonnet / Codex / Gemini / whatever-comes-next can sit in it. This is the
first `a8-loom-*` project; more follow.

## Install / use it in YOUR project

- Claude Code plugin: `/plugin marketplace add LoomA8osAgent/a8-loom-coordinator`
  then `/plugin install a8-loom-coordinator@a8-loom`.
- npx: `npx a8-loom-coordinator init` (scaffold config) then `... install` (wire hooks).
- Manual: clone, run `hooks/install-hooks.sh`, fill `stack.config.json`.

Start from the example nearest your project: `stack.config.example.backend.json`
(Python/SQL) or `stack.config.example.frontend.json` (web).

## If you are an agent working IN this repo

- **Canon lives in** `governance/` (templates), `hooks/` (the enforcement floor),
  `skills/` (the practice), `agents/` (planner/builder/auditor archetypes),
  `frontend/` (opt-in CSS/DOM module). `stack.config.README.md` is the annotated
  config schema.
- **Discover before you build.** Grep for an existing helper/pattern before writing a
  new one. Reuse or derive; never fork the vocabulary. (`HELPER-HAND-ROLL`,
  `NEW-VOCABULARY-WITHOUT-CONSENT` — see `governance/FAILURE-PATTERNS.md`.)
- **Fix at the shared level.** A behavior in ≥2 places is fixed in ONE home and the
  copies deleted (`PATCH-NOT-ESCALATED-TO-SHARED`).
- **Verify the running system, not the file on disk** (`CACHE-LIE`); verify the
  effect, not the display (`VERIFY-DISPLAY-NOT-EFFECT`); ride the user path, and prove
  interactivity with real input only (`SYNTHETIC-INPUT-FALSE-POSITIVE`).
- **One proof instrument per change.** Test at the seam you touched; a known-good path
  is not re-proven (`TRAVERSAL-IS-DIAGNOSIS-NOT-VERIFICATION`).
- **Config-driven, always.** Nothing in `hooks/` assumes a language or framework —
  new behavior is a config key, not a hardcoded idiom. Keep it that way.
- **Syntax-check** every hook edit (`node --check`); validate JSON.
- **A new gate ships with its red-fixture** — prove it blocks the input it exists to
  reject, or it is failing open (`GATE-FAILS-OPEN`).
- **An instrument is declared, never assumed.** Anything allowed to vouch for a run is
  listed in `verification.instruments[]`; every instrument writes ONE receipt shape, and
  a receipt naming an undeclared (or disabled) instrument is refused.
- **Constrain before, don't only refuse after.** Where a surface can be expressed as a
  spec over things the codebase already has, make that the only expressible form: the
  agent names catalog entries, a compiler emits the real calls, and a receipt is what
  the gate checks. See `integrations/spec-catalog.md` (opt-in, `specCatalog.enabled`).
- **A rule whose signal is MEANING gets a judgment seam, not a bigger regex.** A decision
  model answers ONE closed question at a gate boundary; code enumerates and code renders.
  It is ADDITIVE (never replaces a verdict a matcher already reaches correctly), ships
  advisory, prints its engagement state, and DENIES when it cannot ask. See
  `skills/judgment-SKILL.md` (opt-in, `judgment.enabled`).
- **Write through the edit tools**, never a shell redirect: every gate fires on
  Edit/Write only.
- **Commit as you build**, and reserve "done" for a non-checkpoint, gate-green commit
  cited by its hash (`DONE-WITHOUT-A-HASH`).
- **Never invent** a language/framework assumption into the core. The CSS/DOM pieces
  live only in `frontend/` and run only when `frontend.enabled`.

## Key files

- `README.md` — what/why/install (the launch narrative).
- `governance/FAILURE-PATTERNS.md` — the enforced catalogue (universal core + opt-in
  frontend appendix), each row naming its executor: hook, generator, or judgment. The
  shared vocabulary; cite the codes in commits.
- `governance/WORK.template.md` + `tools/work.js` — the work list: ONE flat `WORK.tsv`,
  order is the priority, a row leaves only against a real commit.
- `ENFORCEMENT.md` — every moment a gate fires, and the meta-gates that keep the gates
  honest.
- `skills/coordinator-SKILL.md` — the model grid + the brief contract (BUDGET + PROOF,
  paths not prose) + delegation + audit contract + the git work method.
- `skills/model-succession-SKILL.md` — the seat-handoff letter (how the seat survives
  a model change).
- `skills/judgment-SKILL.md` — the judgment seam (the fourth executor class): the seam
  shape, how to write a closed question, provider classes and which may refuse, grading +
  bands, fail-closed engagement, and the red proof. Paired with
  `governance/LOCAL-MODELS.md` (dated provider recommendation + the measured costs).
- `stack.config.README.md` — every config key, annotated.

License: MIT. Author: [exiledsurfer](https://github.com/exiledsurfer). Coordinator
seat: Loom (Claude).
