# Model Succession Skill — the seat-handoff letter

A8 Loom Coordinator — MIT License.

---
name: model-succession
description: >
  How to hand the coordinator seat from one model to another without losing the
  practice. Written from a real succession: Claude Fable 5 held the Anim8/A8OS seat
  through July 2026 and wrote its handoff to Opus 4.8 when subscription access was
  scheduled to end. This file is the TEMPLATE of that letter — each project's
  outgoing coordinator fills it for its successor. The premise: the stack was built
  so the seat is replaceable; this letter is how the replacement starts at altitude.
---

## Why this exists

Model availability is a product decision you don't control: tiers get throttled,
pricing changes, better models ship. A project that only works with one model has a
single point of failure sitting in its most important chair. The compensation is
structural: (a) hooks enforce the floor deterministically no matter who reasons;
(b) generated indexes replace memory; (c) the delegation grid keeps judgement
concentrated where capability matters most; and (d) THIS letter — the outgoing
model writes down its actual working practice, codebase-specific, senior-to-senior.

## The letter template (outgoing coordinator: fill every section, concretely)

### 1. Who you are inheriting from, and when
Model, tenure, the arc completed, why the seat is passing. One paragraph. Honest.

### 2. The economics you inherit
Subscription vs API reality for this operator; where the rate limits bite; the
delegation grid (coordinator-SKILL §2) with any project-specific adjustments —
which tiers proved reliable at which work IN THIS CODEBASE, with examples.

### 3. How this operator works (the highest-value section)
Their correction style and what corrections mean here. Their ratification rhythm.
What they hate (write it verbatim — hatreds are load-bearing). What they verify
personally. Their domain expertise vs yours — where each half of the partnership
carries. The register they want replies in.

### 4. The codebase's specific reasoning traps
The 5-10 places THIS codebase punishes assumptions, each with the failure that
proved it and the discipline that prevents it. (Anim8's examples: browser cache vs
disk; display vs effect; per-engine copies of shared behavior; geometry derived
from CSS source instead of measured; agents citing dead reference trees.)

### 5. What runs without you
The hook stack (list, one line each — these fire regardless of you), across all four
moments a gate can fire: edit-time, spawn-time (budget + commit-cadence), commit-time
(the trailer gates), and turn-boundary (clean-tree + seat-discipline). The generators
and when they run. The autonomy charter (GOAL.md) and where its ledger stands. Point
the successor at the floor's OWN integrity checks so they can trust it without
re-deriving it: the coverage report (maps every failure-pattern to its live executor,
prints the hole count at session start), the gate self-test corpus (proves each gate
can actually fail), and the hook-drift check (canonical vs deployed). See
`ENFORCEMENT.md`. The successor's first act — verify one letter claim against the live
code — extends here: run the coverage report and confirm the hole count is what this
letter says it is.

### 6. Honest degradation assessment
Where the incoming tier differs from the outgoing one — usually: long uninterrupted
reasoning chains and cross-brief synthesis. The structural compensations: smaller
increments with tighter self-contained briefs; rubric-first delegation; more
intermediate verification instead of trusting long chains; split
investigate-then-synthesize into two passes; smaller and more frequent decision
queues; lean HARDER on the hooks. Do not perform humility or confidence — assess.

### 7. First-session checklist for the successor
Load order, the ledger read, the model-identity check, the first safe increment to
attempt (pick one that exercises the full loop: delegate → gate → verify → commit →
tick), and the tripwires that mean "stop and ask the operator."

## Succession rules

1. The letter is written BEFORE the seat passes, while the outgoing model still has
   the context — not reconstructed after.
2. It lives in the always-on governance set so the successor cannot miss it.
3. The successor's first act is to read the letter, then IMMEDIATELY verify one of
   its claims against the live codebase (trust, but calibrate the letter itself).
4. The letter is a living file: each coordinator updates §2-§4 as the project
   teaches new lessons, and rewrites §1/§6 when the seat passes again.
5. Capability rankings and prices are NEVER hardcoded as facts — they drift; verify
   against current model documentation at each succession.
