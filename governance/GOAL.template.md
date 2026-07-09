<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the autonomy charter — the dispatch layer for autonomous /goal + /loop
  operation. The coordinator works this file top-down with only operator spot-checks. It
  stays LEAN: a goal tree + loop recipes + rails + a live evidence ledger. All detail lives
  in the owning specs; this file only points and tracks.

  WHEN IT LOADS: always-on (@-imported), and it is the FIRST read of the /goal-/loop path.

  HOW TO FILL: replace {{...}}, then author YOUR goal tree (§1) — one goal per top-line
  outcome, each with an OWNER spec and an ACCEPTANCE test. The loop updates §5 as work lands.
-->

# GOAL.md — the autonomous execution charter (always-on)

> **What this is.** The dispatch layer for `/goal` + `/loop` autonomous operation. The
> coordinator works this file top-down with only operator SPOT-CHECKS. It stays LEAN — goal
> tree + loop recipes + rails + live ledger; all detail lives in the owning specs. The loop
> UPDATES the §5 ledger as work completes (checkboxes + one-line evidence).

## 0. The autonomy contract

- **Autonomous (no ask):** everything inside a goal's defined scope — investigation,
  delegation to the custom agents, builds, verification via acceptance tests, commits per
  goal increment (a commit = the ledger tick), doc/spec sync, authoring tests, restarting
  stalled workers.
- **Operator-gated (STOP and queue):** ratifying a NEW decision not already marked RATIFIED
  in a decision queue · anything user-visible-DESIGN-new (`NEW-CLASS` / new-UI consent) ·
  external publication · deleting operator-authored content · scope changes to THIS file's
  goal tree · anything touching money/accounts.
- **Spot-check protocol:** each completed goal leaves (a) a ledger tick with evidence (commit
  hash + a GREEN acceptance-test / harness id), (b) a ≤5-line summary in the handoff. The
  operator samples; silence = proceed. A blocker older than one session surfaces at the TOP
  of the next reply — never silently stall.
- **Budget:** the model grid (coordinator skill) is BINDING — cheaper tier for mechanical
  volume, stronger tier for builds/investigations, the coordinator's own output spent on
  audit + integration only. Prefer many small gated increments over one large run.

## 1. Goal tree (work top-down; a goal is DONE when its acceptance holds)

> Author YOUR goals here. One goal per top-line outcome. Each carries an OWNER (the spec that
> defines "done") and an ACCEPTANCE test (a GREEN harness / acceptance-test id). Sub-items are
> the loop's work queue. Example scaffolding:

### G0 — {{goal0.name}}
Owner: `{{goal0.ownerSpec}}`. Acceptance: {{goal0.acceptance}}.
- G0.1 {{goal0.item1}}
- G0.2 {{goal0.item2}}

### G1 — {{goal1.name}}
Owner: `{{goal1.ownerSpec}}`. Acceptance: {{goal1.acceptance}}.
- G1.1 {{goal1.item1}}

## 2. Loop recipes (how /loop runs a goal)

- **WORK loop (default):** pick the topmost unticked item in the lowest-numbered open goal →
  route per the delegation table (coordinator skill + agent registry) → audit-gate the diff
  (live-caller grep + citation spot-check) → verify the EFFECT via an acceptance test on the
  running system → commit with trailers → tick the §5 ledger + write the handoff block →
  next. One increment per iteration; self-pace; stop when the goal's acceptance holds or an
  operator-gate is hit.
- **BATCH loop (bulk transform — many files, same operation):** batch N items → gate each
  candidate → apply → harness-verify the batch → commit the batch (with a batch trailer) →
  ledger tick with running count → resume. A failing item goes to a quarantine list (never
  blocks the batch); quarantine triaged every few batches. NEVER mutate the batch corpus
  outside this loop.
- **SWEEP loop (renames, lint, doc-sync):** cheap-tier workers with a coordinator-written
  rubric → grep-verified zero-stray acceptance → single commit per sweep.
- **Failure handling:** worker stalls → restart the same brief once, then escalate one model
  tier; two consecutive failed audit gates on one item → STOP that item, write a blocker
  note, move to the next independent item.

## 3. Rails (absolute, loop-enforced)

`BREAK-WORKING` is the prime rail: anything operator-verified-working is untouchable except
through its owning SHARED path, with acceptance-test proof BEFORE commit. The hook stack is
the floor (grep-required, canon-block, ui-consent, doc-sync, persistence-walk, and any
project gate) — never bypassed; the loops rely on them. One dev-server, no worktrees, local
`{{project.defaultBranch}}` is delivery. Every increment ships its doc / test / persistence
duties or declares them `n/a` consciously. When in doubt between speed and the rails: rails
win; queue the question.

## 4. Always-on wiring

This file is `@`-imported by root `CLAUDE.md` and is the FIRST read of the `/goal`-`/loop`
path. The session ritual reads this §5 ledger before the handoff. At a fork/RC, this file
migrates to the new repo root and completed goals collapse into the ledger history.

## 5. Live ledger (the loop updates this — evidence per tick)

> Checkboxes + a one-line evidence per item (commit hash + GREEN test id). The loop edits
> this section as work lands; the operator reads it first at session start.
- [ ] G0.1 · [ ] G0.2
- [ ] G1.1
- Blockers: (none)
