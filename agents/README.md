<!-- A8 Loom Coordinator — MIT License -->

# Agents — the custom subagent registry

The three archetypes in this directory (`planner` · `builder` · `auditor`) are the custom,
governance-aware subagents the coordinator delegates to. Use ONLY these custom agents for
project work — a built-in general/Explore/Plan agent SKIPS the project governance (CLAUDE.md)
and therefore invents and duplicates. If a task is not covered by an extant custom agent, STOP
and ask the operator before spawning anything (or handle it inline if trivial).

## Why custom agents

A custom agent INHERITS the full governance hierarchy, PRELOADS the domain canon via its
`skills:` frontmatter, and fires the SAME PreToolUse gates (grep-required / canon-block /
consent) as the main agent. That is what makes delegated work unable to invent or duplicate —
the preloaded canon + the gates travel with the subagent.

## The three lanes

| Agent | Lane | Never |
|-------|------|-------|
| `planner` | Investigates + designs + authors specs/roadmap. Returns a grounded plan. | Does NOT write application code. Never git. |
| `builder` | Edits its ASSIGNED files; extends shared homes, never re-rolls per-module copies. | NEVER touches git — returns its diff + summary; the coordinator commits. |
| `auditor` | Sweeps for duplication/orphans/dead-code + audits deliverables. Findings untrusted until grep-confirmed. | Does NOT apply findings blind; never git. |

Clone `builder.template.md` per specialized lane if the project needs it (e.g. a UI/style
builder and a logic/engine builder) — vary the `skills:` preload and the lane note; the
shared-level fix rule and the no-git rule are invariant across clones.

## How the registry deploys

These files are the SOURCE OF TRUTH in the repo. A generator/deploy step copies them into the
agent runtime directory (the machine-local `.claude/agents/` or equivalent), materializing the
`{{...}}` tokens from `stack.config.json`. **A newly-added or edited agent is discovered at the
NEXT session start** — edit the source here, run the deploy step, restart the session, then the
agent is invocable. Never edit the deployed copy as the primary — it is regenerated and your
edit is lost.

## The brief contract (what every spawn prompt must carry)

A spawn-time gate enforces the first three mechanically; the rest are the coordinator's own
discipline, audited before the brief fires.

```
BUDGET: ~350K opus          # token estimate + the tier — visibility, not permission
PROOF: light                # or: PROOF: heavy (<one of the four reasons, written out>)
model: opus                 # explicit, and its family must match the BUDGET tier word
```

1. **BUDGET in TOKENS.** Estimate the lane's tokens; never convert to a plan-meter
   percentage (metered plans do not track token volume linearly — a measured 5× spread
   between two same-day windows). The operator sees the cost in the turn that spends it.
2. **PROOF tier, and the body must match the label.** `light` is the default and means ONE
   comparison that answers *"did I break what already worked"* — so the body may name AT MOST
   ONE proof instrument and one acceptance-test id. Adding CONTENT to a proven path ships
   with the generator/converter run and ONE user-path acceptance test; that is the whole
   obligation. A known-good path is NOT re-proven. `heavy` requires its reason written in the
   brief, and only four things earn it (the claim *is* byte-identity across a corpus · the
   change touches a shared seam where one case cannot represent the others · a genuine
   one-off whose assertion is unlike its siblings · a gate whose own falsification is the
   deliverable).
3. **PATHS, not prose.** A build-executing brief carries PATHS to the executable sources of
   truth the worker must read IN FULL (the mockup, the schema, the roster file, the oracle),
   the task as **diff-and-implement** against them, and MECHANICAL acceptance (commands, test
   ids). Never the coordinator's summary of any of those, and never prose acceptance
   criteria — the builder implements the summary's distillation loss and no checker can catch
   it, because the checker was pointed at the same summary (`PROSE-BRIEF-TO-A-BUILDER`).
4. **The exact file list the worker owns**, and the statement that it writes nothing outside
   it.
5. **The return-brief shape** (below), including that the greps are mandatory.
6. **"Write each file immediately after composing it"** — one write per file, tool calls
   flowing. Workers that compose several files before writing anything trip stream watchdogs
   and lose the whole run.

## Worker mechanics (binding on every delegation)

1. **Disjoint file ownership** — each parallel worker owns a DISJOINT file set; two workers
   never touch the same file. Shared/governance files are written ONLY by the coordinator.
   Prove disjointness BEFORE spawning in parallel; the perennial colliders are the shared
   entry file, the shared helper module, and any assembled/generated doc.
2. **Return = audit brief, not content** — a worker returns its verdict table, `file:line`
   evidence for risky claims, **the greps it actually ran**, and the files it wrote. Content
   stays on disk. The greps list is MANDATORY: a brief that omits the retrievals grounding its
   claims about existing code is rejected unread and re-prompted for them — the coordinator's
   only defense against a hallucinated claim is seeing the retrieval behind it.
3. **Audit-gate EVERY worker before its work lands** — the coordinator runs the live-caller
   grep (code) or the citation + retired-token check (docs), reviews the diff, then commits per
   cluster (file-granular revert).
4. **Self-contained prompts** — exact paths, the handle/return-brief shape, and the grounding
   mandate (retrieve first; never present a partial list as complete).
5. **Isolation hygiene** — a worker that needs a running system for verification takes its
   OWN port (never the shared canonical one, which the operator is watching) and tears it down
   **by the PID it started** — never by process name, never by a pid resolved from a port. A
   pattern-kill on a shared machine is a broadcast, and every lane pays. Scratch directories
   carry the lane's own name; a shared scratch path gets reset under a running lane.
6. **Stall handling** — a silent worker is restarted once with the same brief, then escalated
   one model tier. Independent workers spawn in ONE message so they run concurrently; serial is
   the default and parallel is a deliberate call, under proven-disjoint ownership.
7. **A mechanical refusal is the COORDINATOR's queue entry, not a report.** When a worker
   correctly refuses because a sibling holds its file, because the unit is atomic and did not
   fit its budget, or because a prerequisite is unbuilt — record the refusal WITH ITS UNBLOCK
   CONDITION, then watch for that condition and RE-FIRE the lane in the same run. Only a
   refusal needing an operator RULING actually waits. A refusal reported without a retry is a
   deferral wearing a justification.
