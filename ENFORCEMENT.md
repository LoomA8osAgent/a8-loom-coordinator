<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# ENFORCEMENT — the architecture of a floor that holds

> **The one idea.** Every standing rule that *can* be mechanical *is* mechanical.
> A rule that lives only in prose survives exactly as long as the model reading it
> remembers to obey — which is to say, not across a model swap and not across a long
> session. So the discipline is a graduation ladder: a lesson starts as a
> failure-pattern row, and the moment it becomes mechanically detectable it becomes a
> hook. When a new failure class appears, the response is never "the governance
> broke." It is *surface a new gate into a hook,* then move on.

This document is the map of that floor: the moments a gate can fire, the meta-layer
that keeps the gates honest, and the graduation rule that grows the whole thing. It
was distilled from a production stack (the `hooks/` directory here is the
config-driven, language-agnostic subset of it) after a session-long hardening arc
whose lesson was blunt: the gates policed *edits, commits, and spawns,* and the seat
still walked straight through the one space nobody had gated. This is what closing
that space looks like.

Names below are the mechanism, not the filename. Where this repo already ships a gate
as a config-driven hook it is marked **[shipped]**; where the mechanism is documented
as the production pattern for you to wire to your own workflow it is marked
**[pattern]**. All of it is stealable; none of it is exotic.

---

## The four moments a gate can fire

A gate is only as good as its timing. Four boundaries exist in an agent session, and
each has a class of failure that only a gate firing *at that boundary* can catch.

### 1. Edit-time — PreToolUse on Edit/Write

The oldest floor: refuse the edit until canon was actually retrieved this turn.

- **canon-search-required [shipped]** — an edit to a governed file is blocked unless a
  canon grep ran this turn (and, for UI-machinery edits, the generated registry was
  consulted). Kills editing-from-memory.
- **canon hard-block [shipped]** — string-pattern bans: inline event handlers, native
  form controls, retired APIs, banned glyphs, reserved global names. The rules are a
  config array; an empty array is inert.
- **discover-then-reuse consent [shipped]** — a hand-rolled host, mount-CSS, or new
  design-vocabulary token is blocked unless the turn carries explicit consent.
- **helper-home [shipped]** — a raw builder in a non-helper file is blocked unless it
  is exported, composes an existing helper, or is a consented one-off.

Edit-time gates have a hard ceiling, stated honestly: they see **one edit at a time**
and cannot judge reachability. The reachability check lives in the registry generator
(zero-caller orphan report), not here.

### 2. Spawn-time — PreToolUse on Agent/Task

The moment a worker is dispatched is the moment to enforce the economy.

- **spawn-budget [pattern]** — an agent spawn is **denied** unless its prompt carries
  an explicit token estimate and an explicit model field, and the stated cost tier
  agrees with the model family. This is *visibility, not permission* — the operator
  sees the cost before it is spent; no cap is imposed. It closes the word-not-config
  hole where a spawn inherited the wrong tier from a loose sentence.
- **subagent allowlist [pattern]** — only the project's own canon-inheriting agents may
  be spawned for domain work; built-in general-purpose agents (which skip the
  governance) are denied.
- **commit-cadence [pattern]** — the load-bearing one. The entire gate stack fires on
  `git commit`; a session that never commits until arc-end therefore lives *entirely
  in un-gated space* — spawn a builder, relay "it's ready" on unverified output,
  repeat, zero gates ever run. This gate **denies the next spawn while any build-surface
  file is uncommitted.** It forces the rhythm: builder returns → commit (which fires the
  whole stack) → *then* the next spawn. A wrong commit is free; not committing is the
  single act that bypasses every gate.

Because real coordination runs concurrent agents and pivots mid-session, the cadence
gate is **dual-scoped**: it governs build-file edits and spawns *only* (never blocks a
doc or spec edit), and it **defers while a background agent is running** — a running
agent's dirty files are live WIP — enforcing only at *quiescence*, when a build file
is finished and un-gated work is about to advance on it. A stuck agent counter fails
*toward* enforcement after a timeout, so the cadence can never silently disable itself.

### 3. Commit-time — PreToolUse on the commit command

The commit is where a change becomes real, so it is where the completeness gates live.
Every one of these reads a **receipt, not a word** — a machine artifact written by the
test/coverage run, never the trailer sentence's claim.

- **doc-sync trailer [shipped]** — a feature commit is denied without its per-pillar
  `Docs:` trailer (spec + user-doc + acceptance test, or an explicit `n/a` per pillar).
- **state-persistence trailer [shipped]** — a commit adding a user-selectable variable is
  denied without proof it was wired into the save/recall walk.
- **coverage-batch trailer [pattern]** — a commit touching persistence-core files is
  denied unless the regression batch wrote a *full-green* receipt this run; the gate
  reads the receipt file, so a hand-typed "GREEN" cannot pass.
- **satellite-parity trailer [shipped]** — a standalone-surface commit is denied without a
  measured-parity trailer.
- **pattern→hook growth gate [pattern]** — the self-extending rule: a commit that adds a
  new failure-pattern row is **denied unless it also stages an enforcing hook** or
  carries `Pattern-hook: <hook> | un-gateable (<reason>)`. Prose-only patterns can no
  longer ship. This is the graduation ladder made mechanical.
- **experience-grade sentinel [pattern]** — an app commit runs a perf-floor / effect-grade
  acceptance macro; a whole-frame-stall or a surface that renders unlike its sibling is
  commit-blocking, not a courtesy.

The **WIP escape** keeps the cadence honest: a mid-arc checkpoint (`git commit -m "WIP:
<reason>"`) is *free* — one trailer clears every heavy commit gate, leaving a
revertible, in-history, operator-visible checkpoint. The full stack still runs on the
non-WIP arc-close commit. The pinned rule that no hook can gate: **"ready / done /
works" is reserved for a non-WIP, full-gate-green commit cited by its hash** — a
checkpoint is never a claim.

### 4. Turn-boundary — the Stop hook

The gap the commit gates *cannot* close: a coordinator can finish, type "it's ready,"
and **end its turn** — handing the operator an un-gated tree to test — without ever
running a commit for a gate to fire on. Only a hook at turn-end catches this.

- **clean-tree-on-stop [pattern]** — blocks turn-end while any build-surface file is
  dirty. Combined with commit-cadence (no mid-turn advance on a dirty tree), the
  operator *never* receives control on an uncommitted build tree: every boundary is
  either committed (the whole stack fired) or clean. A re-entry valve allows the stop
  with a loud warning rather than looping forever.
- **session-close harvest [pattern]** — on a governed-change turn-end, prints the
  session-end checklist (harvest new invariants, run the reconcile question, mirror the
  memory store). The most-repeated ritual in governance gets a mechanical trigger.
- **seat-discipline [pattern]** — the one the arc was named for. Every gate above polices
  edits, commits, and spawns; *nothing* policed the coordinator seat's own inline work
  volume. The seat's rule — *reason · spawn · audit · commit, nothing else* — lived in
  skill prose, and prose degrades per session (a single session burned a week's budget
  on inline forensics while every hook-backed rule held perfectly). Now a Bash gate
  whitelists the seat's legitimate jobs (git, the standing gate commands, generators,
  citation lint, single canon greps) and counts everything else against a rolling
  budget: warn, then hard-deny with the delegation order — *spawn a worker with the
  symptom.*

---

## The meta-layer — gates that keep the gates honest

A floor you cannot inspect is a floor you cannot trust. These do not gate the work;
they gate the *enforcement suite itself.*

- **GATE-FAILS-OPEN self-test [pattern].** The subtlest failure a gate can have is to
  *accept its own known-bad input* — silence scoring as a pass. Every adjudicating gate
  ships a red-fixture: an input it is supposed to reject, asserting it exits with a
  block. A gate that passes its own fixture is failing open, and the meta-harness turns
  that into a loud red. Missing fixtures are listed **UNCOVERED** — never scored as
  fine, because scoring a missing check as a pass would itself fail open.
- **new-gate-lock [pattern].** A commit that adds a new gate is refused unless it ships
  that gate's red-fixture in the same commit. The self-test set can never shrink in
  coverage as it grows.
- **coverage report [pattern].** At session start, every failure-pattern code is mapped
  to its live executor by *scanning the actual gate stack* — no human re-classification.
  Each code resolves to COVERED, HISTORICAL (a past bug fixed in code + guarded by a
  regression test), JUDGMENT (inherently un-gateable — content, geometry, authoring),
  or a **HOLE** (a standing rule a gate could read but none does). A code that is
  neither covered nor curated defaults to *unclassified* and surfaces as a hole
  candidate, so a new pattern cannot hide. The headline hole count is printed loud.
- **hook-drift check [pattern].** At session start, the canonical hook registrations are
  diffed against what is actually deployed (list + content hash + the push-deny
  entries). A hook authored but never registered, or a registration that drifted from
  its canonical source, is caught before it can silently no-op.

## The evaluators the gates stand on

Gates enforce; **evaluators ground.** In order of preference:

1. **greps** — an agent's claim about existing code is untrusted until the retrieval
   behind it is shown; a "duplicated N times" finding gets a live-caller grep before
   anyone acts.
2. **linters** — every citation (`file:line`) is mechanically verified to exist and be
   in range.
3. **acceptance tests** — every fix ships a scripted, effect-grade test that drives the
   running system and asserts the *behavior,* not the surface. A green run writes to a
   **proven-runs ledger**; the assembler flags any test that was authored but never run,
   because a green name with no run behind it is an unproven claim.

A compiler, a grep, and a pixel probe do not hallucinate and they do not bill. Reach
for a voting jury of model agents only where no deterministic evaluator can exist.

---

## The graduation rule (how this grows)

1. A cross-cutting failure earns a **FAILURE-PATTERNS row** — named in SCREAMING-KEBAB,
   the code becomes shared vocabulary in commits and reviews.
2. If it is **mechanically detectable at edit or commit time, it becomes a hook** — and
   the pattern→hook growth gate *refuses the row without one* (or an explicit
   `un-gateable` reason).
3. The hook ships with its **red-fixture** (the new-gate-lock refuses it otherwise), so
   the day it lands we know it can fail.
4. The **coverage report** proves the code now resolves to COVERED; the hole count is
   the honest scorecard.

Prose is nice. Hooks are authoritative. The distance between the two is exactly the
work this document describes — and it is never finished, only current.
