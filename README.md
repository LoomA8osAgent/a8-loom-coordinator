# A8 Loom Coordinator

**A complete governance, skills, and hooks stack for running Claude (or any capable
LLM coordinator) as the autonomous senior engineer on a real software project — with
the human as operator, ratifier, and spot-checker instead of babysitter.**

MIT licensed. Extracted from production use, not designed on a whiteboard.

> **TL;DR (llms.txt blurb).** `a8-loom-coordinator` is a config-driven governance +
> skills + hooks stack that makes an LLM build *deterministically* against an existing
> codebase — any language, any framework, frontend or backend. Its one enforced idea:
> **discover-then-reuse** — retrieve what the codebase already provides and reuse it,
> never hand-roll a fresh version. A reusable, model-portable coordinator seat (the
> "Loom" seat). First of the `a8-loom-*` line. By
> [exiledsurfer](https://github.com/exiledsurfer). MIT.

**Install** — pick one:

```bash
# Claude Code plugin (native):
/plugin marketplace add LoomA8osAgent/a8-loom-coordinator
/plugin install a8-loom-coordinator@a8-loom

# npx (any repo):
npx a8-loom-coordinator init      # scaffold stack.config.json
npx a8-loom-coordinator install   # wire the hooks

# manual: clone, run hooks/install-hooks.sh, fill stack.config.json
```

Cross-model: this repo ships an [AGENTS.md](AGENTS.md) (the open agent standard used
by Codex CLI, Gemini CLI, Cursor, Cline, Devin, and 30+ tools) and an
[llms.txt](llms.txt), so agents and crawlers discover it directly.

**Works for any software project — frontend or backend, any language or framework.**
Every gate is config-driven: you declare your own canon surfaces (helper modules,
registry, hand-roll shapes) and the stack enforces *discover-then-reuse* against
them. The CSS/DOM pieces are an opt-in [`frontend/`](frontend/README.md) module —
the specialized subset for adding **new features inside an existing frontend
codebase** without forking its design system (host-first reuse, generated
extraction, measured parity). It is one *instance* of the universal
discover-then-reuse core; backend projects never load it.

---

## Where this came from

Condensed out of three months of daily production sessions building a real,
shipping application, by exiledsurfer as operator
and Claude as coordinator. Every file exists because something went wrong without it,
twice. The origin project was a composed web frontend, but the stack is
domain-agnostic — the lessons below recur in any codebase:

The honest reasons it exists:

- **Models edit from memory and memory lies.** Sessions shipped fixes against files
  that had changed, verified files on disk while the browser ran cached code, and
  computed pixel geometry from CSS source instead of measuring the render. The
  answer wasn't "try harder" — it was *hooks that refuse the edit* until the canon
  was actually retrieved, and failure-pattern ledgers that make each lesson
  permanent instead of conversational.
- **Auto-loading everything taught nothing.** At one point the always-on context
  cost ~580K tokens per turn and the relevant rule was buried every time. The
  redesign — a lean always-on core plus keyword-routed on-demand retrieval — is the
  `CLAUDE.template.md` + `ROUTING.template.md` architecture here ("loaded ≠ used").
- **Agents hallucinate confidence.** Subagent audits fabricated file contents and
  mislabeled dead code as refactoring targets. The answer is the **audit-agent
  contract**: no finding is trusted until a live-caller grep confirms it, and every
  worker's product passes a gate sized to how cheap the worker was.
- **The seat had to become replaceable.** This stack was authored primarily by
  **Claude Fable 5** working as the project's coordinator. Fable's subscription
  availability was ending (July 12, 2026), API tokens were unaffordable at project
  volume, and the succession question — *can Opus, or Sonnet, or whatever comes
  next, sit in this seat tomorrow?* — forced the final distillation: write down not
  just the rules but the **reasoning practice**, as an outgoing senior engineer
  briefs an incoming one. That letter, generalized, is `skills/model-succession-SKILL.md`.
  The stack is the answer to "what survives the model?" — the hooks fire and the
  ledgers hold no matter who reasons above them.

## The key lever: the cost / competency grid

The single highest-leverage idea in this stack is in `skills/coordinator-SKILL.md`
§Model grid: **the coordinator's scarce resource is its own output and context
budget, so judgement stays in the seat and volume goes down-tier.**

| Seat | Work | Why |
|---|---|---|
| Coordinator (best available model) | diff audits, architecture, operator dialogue, commits, synthesis | judgement-dense, low volume, highest error cost |
| Strong worker (Opus-class) | builds, deep multi-file investigation briefs | real reasoning over unfamiliar code |
| Mid tier (Sonnet-class) | mechanical sweeps, rubric-driven classification, lint, batch runs, rename sweeps | high volume, low ambiguity, grep-verifiable |
| Cheap tier (Haiku-class) | lookups, directory walks, existence checks | cheapest correct answer wins |

With the safety rules that make it work: audit gates **harden** as workers get
cheaper · a failing worker escalates **one** tier, never straight to the top ·
the coordinator writes the **rubric before delegating**, so the intelligence is in
the prompt · operator-facing judgement is **never** delegated. On subscription
plans the binding constraint is rate limits, not per-token price — the grid is how
a hundred-session project stays inside them.

## What's in the box

```
governance/    CLAUDE / OPERATOR / ROUTING / GOAL / SESSION / HANDOFF templates,
               FAILURE-PATTERNS ledger (universal core + opt-in frontend appendix),
               ACKNOWLEDGEMENTS
skills/        coordinator (delegation + audit contract + the model grid),
               model-succession (the seat-handoff letter), doc-sync,
               dev-infrastructure, init-interview, skill-creator
hooks/         the enforcement floor (all config-driven, language-agnostic):
               canon-before-edit, anti-hand-roll, discover-then-reuse consent,
               doc-sync + state-persistence commit gates, verification-first,
               session regenerators, caveman mode, service recovery, install script
tools/         the anti-drift generators: code registry (+ zero-caller orphan
               report), skills/agents deploy, manifest, changelog, citation linter
agents/        planner / builder / auditor archetypes with preloaded-canon pattern
frontend/      OPT-IN CSS/DOM module (backend projects ignore it): the
               design-system-export skill (satellite/standalone-product method)
integrations/  rtk (60-90% token savings on dev ops), CodeGraph (call-path-aware
               code retrieval), caveman mode (terse-output contract)
```

Root also ships `stack.config.json` (neutral template) plus two worked configs —
`stack.config.example.backend.json` and `stack.config.example.frontend.json` — so
you start from the one nearest your project.

Three design principles run through all of it:

1. **Hooks are the floor, skills are the ceiling.** Hooks enforce canon
   deterministically, regardless of which model is reasoning. Skills teach the
   practice that makes the work excellent. A weaker model on this stack outperforms
   a stronger model without it.
2. **Generated indexes beat memory.** The code registry, manifest, and routing map
   are regenerated every session start. The model never has to remember what
   exists — and the orphan report catches dead code no reviewer will.
3. **The operator is a role, not a bottleneck.** `GOAL.template.md` defines an
   autonomy contract: what runs without asking, what stops and queues, and a live
   evidence ledger so a spot-check takes ten seconds.

## Quickstart

1. Install (plugin / npx / manual — see the **Install** block at the top). `npx
   a8-loom-coordinator init` drops a neutral `stack.config.json`; start from the
   nearest example (`stack.config.example.backend.json` or `.frontend.json`).
2. Or run the **init interview** (`skills/init-interview-SKILL.md`) — it asks for your
   project name, prefixes, dev server, test API, and persistence mechanism, then
   writes `stack.config.json` and fills every `{{placeholder}}`.
3. `hooks/install-hooks.sh` (or `npx a8-loom-coordinator install`) — deploys the hook
   stack and settings.
4. Fill the §Invariants buckets in your generated `CLAUDE.md` as your project
   teaches you its rules — and obey the harvest discipline: every session that
   surfaces a cross-cutting rule writes it down before it closes.
5. Optional but recommended: install [rtk](integrations/rtk.md) and
   [CodeGraph](integrations/codegraph.md); enable [caveman mode](integrations/caveman.md).

## Authors

- **Michael Parenti** ([exiledsurfer](https://github.com/exiledsurfer)) — operator,
  method, three months of corrections that became the rules.
- **Loom** — the A8os coordinator seat (Claude); authored this stack from the seat it
  describes, for whoever sits in it next. Model-portable by design.

MIT License — see [LICENSE](LICENSE).
