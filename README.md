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

---

## Features

The core is discover-then-reuse: hooks that force retrieval before an edit, generated
registries of what the codebase already has, and a coordinator seat that survives model
changes. On top of that:

- **Spec catalog** — opt-in: builders emit a spec naming only helpers scanned from your
  codebase; it compiles to real calls with a signed receipt, and a hook refuses any
  hand-written surface the receipt does not cover. `specCatalog.enabled`; method in
  [`integrations/spec-catalog.md`](integrations/spec-catalog.md).
- **Verification instruments** — an instrument allowed to vouch for a run is DECLARED,
  never assumed (`verification.instruments[]`); one receipt shape for browser and native
  desktop alike, and a receipt naming an undeclared instrument is refused.

---

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

Condensed out of six months of daily production sessions building a real,
shipping application, by [exiledsurfer](https://github.com/exiledsurfer) as operator
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
  The same move later ate the *invariant set* itself: 107 KB of anti-hand-roll rules,
  resident on every turn, failed to stop a hand-rolled duplicate that a hook then
  refused. Measured per file actually edited, the typical edit was governed by under
  2 KB of it. So the rules moved to **where the refusal happens** — a router resolves
  the bullets for the file in hand and prints them *inside* the block message. **A
  rule in context is advice; a rule in a refusal is a wall.**
- **Agents hallucinate confidence.** Subagent audits fabricated file contents and
  mislabeled dead code as refactoring targets. The answer is the **audit-agent
  contract**: no finding is trusted until a live-caller grep confirms it, every
  worker's brief must list the greps it actually ran, and every product passes a gate
  sized to how cheap the worker was.
- **Verification grew until nobody could pay for it.** Every lesson added a check, and
  a change to one file ended up paying for every lesson ever learned — three hours and
  a week's budget in one measured session, on work that needed one comparison. So the
  economy became mechanical too: every worker brief declares a **proof tier**, the
  default is ONE comparison that answers "did I break what already worked", a known-good
  path is never re-proven, and a gate reads the brief's BODY so the light label cannot
  lie about what it is going to run.
- **The work list had to become a list.** A goal tree plus a backlog file grew to 185 KB
  of prose with checkboxes buried in it; every tool that had to find work was a regex
  over English, so every hole was a parser hole. Both are gone, replaced by one flat
  `WORK.tsv` — one row per item, no nesting, no status column, and an item leaves only
  against a real non-checkpoint commit (`tools/work.js`, `governance/WORK.template.md`).
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
governance/    CLAUDE / OPERATOR / ROUTING / WORK / SESSION / HANDOFF templates,
               FAILURE-PATTERNS ledger (universal core + opt-in frontend appendix),
               ACKNOWLEDGEMENTS
skills/        coordinator (delegation + brief contract + audit contract + the
               model grid + the git work method), model-succession (the
               seat-handoff letter), doc-sync, dev-infrastructure,
               init-interview, skill-creator
hooks/         the enforcement floor (all config-driven, language-agnostic):
               canon-before-edit, anti-hand-roll, discover-then-reuse consent,
               doc-sync + state-persistence commit gates, verification-first
               (incl. the instrument roster: a receipt vouches only if it names a
               DECLARED instrument — browser or native-desktop, one receipt shape,
               plus a documented example desktop driver),
               session regenerators, caveman mode, service recovery, install script
ENFORCEMENT.md the architecture of the floor: the four moments a gate fires
               (edit / spawn / commit / turn-boundary), the gates on the
               INSTRUMENTS you verify with, the meta-gates that keep the gates
               honest (self-test / coverage / drift), and the graduation rule —
               every prose rule that CAN be mechanical becomes a hook
tools/         the anti-drift generators: code registry (+ zero-caller orphan
               report), skills/agents deploy, manifest, changelog, citation
               linter — plus work.js, the one flat work list
               gen-catalog + tools/spec-catalog/: the OPT-IN constraint layer —
               the registry projected into a catalog + a byte-capped builder
               payload, a constrained spec, a compiler, an HMAC'd receipt, and
               the gate that refuses a new surface no receipt covers
agents/        planner / builder / auditor archetypes with preloaded-canon pattern
               and the brief contract (BUDGET + PROOF, paths not prose)
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
   a stronger model without it. And the ladder runs one way: any standing rule that
   *can* be mechanical *becomes* a hook — a lesson learned the hard way (a whole
   session's budget burned on inline work while every hook-backed rule held), and now
   itself enforced (a new failure-pattern row is refused unless it ships a gate). See
   [ENFORCEMENT.md](ENFORCEMENT.md) for the full architecture.
2. **Generated indexes beat memory.** The code registry, manifest, and routing map
   are regenerated every session start. The model never has to remember what
   exists — and the orphan report catches dead code no reviewer will. The corollary
   the stack learned late: don't make the rules resident either. Deliver them into
   the refusal, for the file being edited.
3. **The operator is a role, not a bottleneck.** `WORK.template.md` is the work list
   plus the autonomy contract: ONE flat `WORK.tsv` (order is the only priority; a row
   leaves only against a real commit), what runs without asking, what stops and queues,
   and the rails — so a spot-check takes ten seconds and the backlog can't fork into a
   second list.

## Quickstart

1. Install (plugin / npx / manual — see the **Install** block at the top). `npx
   a8-loom-coordinator init` drops a neutral `stack.config.json`; start from the
   nearest example (`stack.config.example.backend.json` or `.frontend.json`).
2. Or run the **init interview** (`skills/init-interview-SKILL.md`) — it asks for your
   project name, prefixes, dev server, test API, and persistence mechanism, then
   writes `stack.config.json` and fills every `{{placeholder}}`.
3. `hooks/install-hooks.sh` (or `npx a8-loom-coordinator install`) — deploys the hook
   stack and settings.
4. Seed `WORK.tsv` with your real open items (`node tools/work.js add "<title>"
   "<body>"`) and wire `node tools/work.js --check` into your pre-commit hook. One
   list, no tree, no status column.
5. Fill the invariant buckets (Identifiers / Helpers / Integrity / Never) in the
   invariants file as your project teaches you its rules — keep it OUT of the
   always-on set and deliver it by subject into the gate's refusal — and obey the
   harvest discipline: every session that surfaces a cross-cutting rule writes it down
   before it closes, along with the executor that will enforce it.
6. Optional but recommended: install [rtk](integrations/rtk.md) and
   [CodeGraph](integrations/codegraph.md); enable [caveman mode](integrations/caveman.md).

## Changelog

- **0.5.0** — The decision-model layer introduced in 0.3.0 and extended in 0.3.2 / 0.4.0
  is REMOVED. Measured on the stack's own content (four calibration runs, 2026-09-19 →
  2026-09-21), every seam answered at base rate; a gate that refuses on a coin flip gets
  switched off, so nothing here consults a model any more. Every gate in the package is
  mechanical. The spec-catalog layer, the verification instruments and the brief contract
  are unchanged.
- **0.3.1** — `verification.instruments[]`: an instrument allowed to vouch for a run is
  DECLARED, never assumed; one receipt shape for all of them; a receipt naming an
  undeclared or disabled instrument is refused. Example desktop driver with its install
  audit: `hooks/native-instrument.example.sh` (`hooks/verification-first.js`).
- **0.3.0** — The **spec-catalog** layer (`tools/gen-catalog.js` + `tools/spec-catalog/` +
  `hooks/spec-gate.js`) — constraint BEFORE replacing refusal AFTER.

## Authors

- **Michael Parenti** ([exiledsurfer](https://github.com/exiledsurfer)) — operator,
  method, six months of corrections that became the rules.
- **Loom** — the A8os coordinator seat (Claude); authored this stack from the seat it
  describes, for whoever sits in it next. Model-portable by design.

MIT License — see [LICENSE](LICENSE).
