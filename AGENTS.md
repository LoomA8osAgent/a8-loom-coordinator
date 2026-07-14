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
  effect, not the display (`VERIFY-DISPLAY-NOT-EFFECT`).
- **Config-driven, always.** Nothing in `hooks/` assumes a language or framework —
  new behavior is a config key, not a hardcoded idiom. Keep it that way.
- **Syntax-check** every hook edit (`node --check`); validate JSON.
- **Never invent** a language/framework assumption into the core. The CSS/DOM pieces
  live only in `frontend/` and run only when `frontend.enabled`.

## Key files

- `README.md` — what/why/install (the launch narrative).
- `governance/FAILURE-PATTERNS.md` — the enforced catalogue (universal core + opt-in
  frontend appendix). The shared vocabulary; cite the codes in commits.
- `skills/coordinator-SKILL.md` — the model grid + delegation + audit contract.
- `skills/model-succession-SKILL.md` — the seat-handoff letter (how the seat survives
  a model change).
- `stack.config.README.md` — every config key, annotated.

License: MIT. Author: [exiledsurfer](https://github.com/exiledsurfer). Coordinator
seat: Loom (Claude).
