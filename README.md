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

## What's new in 0.4 — two seam families, and the first measured chapter

### A. Drift — *does A still describe B*, at five boundaries

One seam, five Nouls, one question, asked wherever B has just been re-authored from A and
nothing reads the two back against each other: a worker's **return** against the brief it
was sent · a **commit** against the work item it cites · a commit **message** against the
change staged beneath it · a **sentence** against the `file:line` it cites · an operator
**ruling** against the compaction summary that replaced the session's account of itself.
Five seams would have meant five state assemblies and five ledger vocabularies for one
question.

Two rules make it cheap and make it honest. **Never ask a model a question a regex
answers** — a summary that quotes its ruling, a return that restates its task and a
subject carrying the item's own title are all answered by string comparison at zero cost,
so `codeMatch` runs first and the model is asked only about PARAPHRASE, with the split
printed every time (*n present by code match · n asked · n reading as DRIFT*). And **the
band reads the other way up**: high = yes = nothing is wrong, so the finding is the LOW
answer — never phrased as *"has this drifted"*, because with a negated question you cannot
tell which side of an uncertain 0.5 is the good one. Two of its five moments — a returned
worker, a resumed session — are POST-HOC and CANNOT refuse; they print the finding,
ledger it, and say so in their own header.

### B. Supervisor — the seam that judges a lane while it is still running

Every other seam judges at a boundary, and for a lane a boundary is always either too
early or too late. This one asks three questions — *on brief · stuck · proving past its
tier* — from a bounded observation, in the one window where the answer can still change
what is spent. Shape from [`thruwire/foreman`](https://github.com/thruwire/foreman)
(bounded observations, parallel questions over one rendering, a policy table with named
thresholds, steer-once behind a grace period); its cloud transport and its acting are
refused, and nothing is imported as code. ⛔ **The monitor cannot act, and that is the
seam's boundary, not a gap** — it has no channel to a running worker, so every action is
a FILE the coordinator reads at its next tool boundary and relays, or declines to. It is
**OFF by default** (`judgment.supervisor.enabled`): it spawns a detached process, and a
package must never do that silently. Every number in its policy table is a placeholder
that says it is one.

### C. The first public calibration run of a local decision model — and the prior art

`governance/LOCAL-MODELS.md` §7 is the measured chapter: a labeled 16-way seam over this
stack's own content, 5-fold CV, a coverage curve at seven thresholds, top-label ECE, and
the band rule. Laya 421M via von reads **34.5% accuracy / ECE 0.60 / 156 ms**, anti-
calibrated. Retraining its own head on receipts and labeled rows moves **ECE 0.60 → 0.11
with accuracy essentially flat** — a trained local head at a few hundred rows learns
CALIBRATION, not the mapping, and 116 added rows bought the four weakest roles zero
accuracy. The conclusion is a seam-shape rule, not a model verdict: a wide closed-
vocabulary classification over domain jargon is the wrong seam for a 421M-class model; a
yes/no fact-check over prose is the fit — which is exactly what both seams above are.
§8 records the prior art, one row each, with what was adopted as a SHAPE and what was
refused and why (`coldteadotai/abide` · `thruwire/foreman` · `jaredpalmer/kev` ·
`featherless-ai/simple-jev` · `cocktailpeanut/jevthoven` · `convaiinnovations/laya` +
`wfzyx/von`). `integrations/judgment.md` §9 carries the calibrate-and-retrain quickstart:
the shape of a labeled row, the calibrate tool's output, and the trainer's flags — marked
PROPOSED, because this package vends no labeled data, no trainer and no calibration tool.

---

## What's new in 0.3 — two new layers

### A. Constraint BEFORE, not refusal after — the spec catalog

Every other gate here adjudicates code the model has already written: the refusal arrives
after the work, costs a retry, and — when an invented shape passes a NAME check — does not
arrive at all. This layer inverts the order. `tools/gen-code-registry.js`'s single scan is
projected by [`tools/gen-catalog.js`](tools/gen-catalog.js) into a machine catalog **plus a
byte-capped catalog prompt the builder preloads instead of the raw ruleset**. The builder
then emits a constrained `{helper, props, children}` spec that **can only name catalog
entries**; `validate.js` runs json-render's own validator plus a catalog check, with a
**lossless-only** autofix (near-miss name repair, applied only when exactly one candidate
resolves — two candidates refuse, zero candidates means the name was invented and nothing
may launder it); `compile.js` emits the real helper calls and an **HMAC'd receipt**; and
[`hooks/spec-gate.js`](hooks/spec-gate.js) refuses a freehand new surface no receipt
covers, reusing the new-surface detector that already exists. json-render's core + codegen
and `zod` are **vendored, node-side only**, so the package keeps zero runtime dependencies.
Opt-in via `specCatalog.enabled`. Full method:
[`integrations/spec-catalog.md`](integrations/spec-catalog.md).

### B. Judgment — a decision model as a fourth executor class

A standing rule whose signal is MEANING — *"does this brief require its worker to report
the retrievals behind its claims"* — could never have a matcher, so it lived in prose and
held only while somebody remembered. It becomes a gate here.
[`hooks/judgment-gate.js`](hooks/judgment-gate.js) is a HOOK like every other, registered
at the edit / commit / spawn matchers; it asks **Jev** (TypeSafe AI) **or an open decision
model on your own machine** ([Laya 421M](https://huggingface.co/convaiinnovations/laya) served by [von](https://github.com/wfzyx/von)) over **one loopback
`/v1/systemone` wire**, with a **fixture provider for every test**. Code enumerates, the
model picks one of the enumerated things, code renders. It **fails closed** — an engaged
seam that cannot reach its provider DENIES — it is **additive** (a verdict a regex already
reaches correctly is never delegated), it ships **advisory**, and a `refuse` band arms only
from a measured coverage curve on labeled data, against a TRAINED provider, after a
hostile-input leg. Quickstart: [`integrations/judgment.md`](integrations/judgment.md).
Practice: [`skills/judgment-SKILL.md`](skills/judgment-SKILL.md). Providers + measured
costs: [`governance/LOCAL-MODELS.md`](governance/LOCAL-MODELS.md).

**The one seam between them:** `specCatalog.autofixSelector` accepts `"judgment"` — the
catalog layer enumerates the candidate names in code and exposes them as `choices`, and a
selector supplied by the judgment layer picks among exactly that list. A pick outside it is
refused, a zero-candidate name never reaches a selector at all, and a null leaves the
ambiguity refusal intact — so a decision model can resolve an ambiguity but can never widen
what a spec is allowed to name.

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
               seat-handoff letter), judgment (the decision-model seam:
               questions, providers, bands, the red proof), doc-sync,
               dev-infrastructure, init-interview, skill-creator
hooks/         the enforcement floor (all config-driven, language-agnostic):
               canon-before-edit, anti-hand-roll, discover-then-reuse consent,
               doc-sync + state-persistence commit gates, verification-first
               (incl. the instrument roster: a receipt vouches only if it names a
               DECLARED instrument — browser or native-desktop, one receipt shape,
               plus a documented example desktop driver),
               session regenerators, caveman mode, service recovery, install script
               — plus the OPT-IN judgment layer: judgment-gate + the one
               decision-model client (loopback-only, fail-closed, typed errors)
               + a roster template + a red-fixture proven red
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

**And a fourth executor class, for the rules a matcher cannot read.** Some standing rules
live in prose *because their signal is meaning rather than shape* — "this brief must
require its worker to report the retrievals behind its claims", "this body must not
describe a whole suite under a light label". Each is satisfiable a dozen ways, so no regex
reaches it and the row sits in the ledger marked *judgment*, enforced only while somebody
remembers. The **judgment layer is a HOOK** — `hooks/judgment-gate.js`, registered at the
edit / commit / spawn matchers in `hooks/settings.template.json` and deployed by
`hooks/install-hooks.sh` like every other gate; *"fourth executor class"* is the
[`FAILURE-PATTERNS`](governance/FAILURE-PATTERNS.md) ledger's word for WHAT enforces a row
(hook · generator · human judgment · and now a hook that consults a decision model), which
is about the kind of evidence an executor can read, not a different mechanism. It is
**installed and ON by default**; the gate speaks on every fire, and declaring a provider is
what makes it judge. Quickstart with commands:
[`integrations/judgment.md`](integrations/judgment.md). A small **decision model** — not a
generator — answers ONE closed question at a gate boundary, where code enumerates the
options and code renders the outcome. It is
strictly ADDITIVE (a verdict a regex already reaches correctly is never delegated), it
ships **advisory**, it **prints its engagement state on every pass** so "nothing was asked"
is never confusable with "asked, failed, approved anyway" — and an engaged seam that cannot
reach its provider **denies**. The provider is loopback-only and enforced as such; the
package ships no model, no weights and no inference dependency, only the wire.
[`governance/LOCAL-MODELS.md`](governance/LOCAL-MODELS.md) carries the dated
recommendation, the measured costs, and the rule that no band arms before a labeled set
measures it.

Who answers, concretely — **Jev** (TypeSafe AI, `https://api.typesafe.ai/v1/systemone`,
pin `jev-1.13.0`, $0.042 per million input tokens and output free) **or an open decision
model on your own machine**, e.g. **Laya 421M** (`convaiinnovations/laya`, Apache-2.0)
served by **von** (`github.com/wfzyx/von`, Apache-2.0) at
`von serve --host 127.0.0.1 --port 8493 --backend laya --device auto`. The remote one
cannot serve a gate here — the client refuses a non-loopback base URL by construction.

- 🔭 **Watch for new open candidates:**
  <https://huggingface.co/spaces/multimodalart/jev-reproductions-tracker> — 45 entries,
  sorted by how they work (decoding · diffusion · trained · prior art · explainers). Its
  own ceiling note: *no open model yet matches Jev's calibration claims.* **Only the
  TRAINED class may arm a band.**

**Vendor-claimed and dated 2026-09-19, not a same-set comparison** (Laya's own eval,
23,024 questions, beside Jev's published figures): ~38 ms per question on their hardware
vs ~150–400 ms for an API round trip; intent/routing **99.1** · moderation **96.7** ·
topic classification **93.9** · fact-check **88.3** · search relevance **62.8** · response
quality **58.1**; selective automation **92.2% at 50% coverage vs 83.8% at 100%**. *So:
routing and classification seams may refuse-grade, fact-check seams advise first, quality
and relevance seams are never built.*

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
6. **Judgment quickstart** — [`integrations/judgment.md`](integrations/judgment.md): the
   layer is already ON and already speaking; that page is how you give it a provider (Jev,
   or an open decision model such as Laya on your own machine), declare a seam, read what
   it prints, and earn a band from labeled data before it refuses anything.
7. Optional but recommended: install [rtk](integrations/rtk.md) and
   [CodeGraph](integrations/codegraph.md); enable [caveman mode](integrations/caveman.md).

## Changelog

- **0.4.0** — Two new seam families for the judgment layer, plus the measured chapter
  behind them. **`drift`** (five Nouls, one question — *does A still describe B*) fires at
  the result / commit / doc / compaction moments, runs a string comparison BEFORE the model
  and prints the split, reads its band the other way up (the finding is the LOW answer), and
  REPORTS rather than refuses at the two post-hoc moments. **`supervisor`**
  (`hooks/judgment-supervisor.js`, OFF by default — it spawns a process) judges a lane while
  it runs and writes proposals it has no channel to deliver; its policy table is data in the
  roster and every number in it is a labelled placeholder. New moments registered:
  `PostToolUse Agent|Task` and `SessionStart`. Provider resolution moved to
  `hooks/lib/decision-provider.js` so the gate and the monitor read ONE answer. Selftests:
  `judgment-gate` 21 legs, `judgment-supervisor` 8. Measured + prior art:
  `governance/LOCAL-MODELS.md` §7–§8; calibrate/retrain quickstart `integrations/judgment.md` §9;
  the seam-fit finding `skills/judgment-SKILL.md` §8.

- **0.3.2** — Judgment goes ON by default (`judgment.enabled: true`, `provider.kind: null`):
  the executor class is always on, the provider is what may be absent, and the gate prints
  its state on every fire instead of being inert until adopted
  (`hooks/lib/config.js`, `hooks/judgment-gate.js`, `stack.config.json` + both examples).
  New operator quickstart [`integrations/judgment.md`](integrations/judgment.md); providers
  named as facts throughout (Jev / TypeSafe AI · Laya 421M via von · Verdict 151M ·
  `jev-benchmarks` · the reproductions tracker) in
  [`governance/LOCAL-MODELS.md`](governance/LOCAL-MODELS.md),
  [`skills/judgment-SKILL.md`](skills/judgment-SKILL.md) and
  `hooks/judgment-server.example.sh`, which now carries the real install + launch + smoke
  commands.
- **0.3.1** — `verification.instruments[]`: an instrument allowed to vouch for a run is
  DECLARED, never assumed; one receipt shape for all of them; a receipt naming an
  undeclared or disabled instrument is refused. Example desktop driver with its install
  audit: `hooks/native-instrument.example.sh` (`hooks/verification-first.js`).
- **0.3.0** — The two new layers: the **judgment** layer (`hooks/judgment-gate.js` +
  `hooks/lib/decision-provider.js` + `hooks/judgment-roster.example.js`, with its
  red-fixture selftest) and the **spec-catalog** layer (`tools/gen-catalog.js` +
  `tools/spec-catalog/` + `hooks/spec-gate.js`) — constraint BEFORE replacing refusal
  AFTER.

## Authors

- **Michael Parenti** ([exiledsurfer](https://github.com/exiledsurfer)) — operator,
  method, six months of corrections that became the rules.
- **Loom** — the A8os coordinator seat (Claude); authored this stack from the seat it
  describes, for whoever sits in it next. Model-portable by design.

MIT License — see [LICENSE](LICENSE).
