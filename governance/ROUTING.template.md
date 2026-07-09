<!-- A8 Coordinator Stack — MIT License -->
<!--
  WHAT THIS IS: the on-demand spec map. The big specs are NOT auto-loaded; this file tells the
  agent (and the canon-check hooks) which file to Read/grep for a given task keyword, and
  encodes the retrieve-first doctrine.

  WHEN IT LOADS: always-on (@-imported). The specs it points at are pulled on demand.

  HOW TO FILL: replace {{...}} and rewrite the keyword→spec table for YOUR project's spec set.
  Keep the retrieve-first doctrine + the "scan the UI registry first" gate as-is — they are
  the generalizable core.
-->

# ROUTING — on-demand spec map (always-on; the specs are NOT)

> The big specs are Read/grep on demand — they are not `@`-imported into every turn (that
> cost ~580K tokens/turn in the ancestor project and buried the relevant rule; "loaded ≠
> used"). This map routes a task keyword to its file. The §Invariants buckets (root
> `CLAUDE.md`) + §Enforced Failure Patterns (`FAILURE-PATTERNS.md`) stay always-on — that is
> the anti-handroll core.

## ⛔ BEFORE BUILDING ANY UI / REUSABLE UNIT — scan `{{registry.uiIndex}}` (MANDATORY)

`{{registry.uiIndex}}` is the generated, always-current index of EVERY helper, class,
component, and reusable unit already built (rebuilt by `{{registry.genCommand}}`; refreshed
each session). Building a new module, or adding a control/chrome/widget/class used elsewhere
→ SCAN IT FIRST and USE what exists. Start at its task → canonical-helper map, then the
helper + component + class sections. Reinventing anything listed there is the
`HELPER-HAND-ROLL` / `NEW-CLASS-WITHOUT-CONSENT` failure. **If the capability is genuinely
NOT in the registry, it is new — STOP and get the operator's express consent before writing
it.** Never assemble primitives into a whole-task widget a helper already provides.

## Reason from the codebase, not from memory (the retrieve-first doctrine)

For any non-trivial reasoning, design, or "how does X work" question: do not reason from
training prior or buried context — **retrieve first, at the moment of the claim.** Three tiers:

- **Trivial claim** ("is there a helper for X", "what's the rule on Y") → it's in the
  always-on §Invariants buckets or §Enforced Failure Patterns. Check there.
- **Specific fact** (a name, an exact signature, a `file:line`) → grep the **code** —
  **code is canon; specs drift.** Then the matching spec section below for the WHY.
- **Deep subsystem design** (multi-file, "how should A interact with B", planning an
  implementation) → **fire an investigation agent** (see the agent registry). It reads the
  relevant specs + code in ITS OWN window and returns a tight grounded brief; you reason over
  the brief, not the haystack. DEFAULT for anything spanning >1 file or needing architectural
  judgement — a just-retrieved 12-line answer beats a spec loaded 400K tokens ago.

Never declare a design or write an edit from paraphrased memory. Retrieve at the moment of
the claim.

## Keyword → spec (Read/grep these on demand)

| Task touches… | Read |
|---|---|
| {{keyword.ui}} (class, token, style, control, chrome, accordion, slider host) | `{{spec.ui}}` + `{{registry.uiIndex}}` |
| {{keyword.core}} (the core pipeline / render / compositing / data flow) | `{{spec.pipeline}}` |
| {{keyword.dataModel}} (schema, state, persistence walk, presets/projects) | `{{spec.dataModel}}` + `{{spec.persistence}}` |
| {{keyword.moduleA}} | `{{spec.moduleA}}` |
| {{keyword.moduleB}} | `{{spec.moduleB}}` |
| diagnostic / observability / state-for-diag | `{{spec.diagnostic}}` |
| security / privacy / credentials / network | `{{spec.security}}` |
| roadmap / phases / what's next | `{{spec.roadmap}}` |
| failure history / "why did X break before" | `{{spec.projectMemory}}` (grep the pattern code) |
| full file inventory / agent read-order | `{{spec.fileManifest}}` |
| acceptance test / demo path / macro id | `{{spec.acceptanceTests}}` |

> Fill this table with YOUR project's real specs. Delete rows you don't have; add rows for
> every module with enough domain rules to warrant its own file.

## Skills — load the relevant one on demand (only coordinator is always-on)

`{{skills.dir}}/*` — invoke the one matching the task; do not blanket-load all of them.

## Canon-check before any edit (hook-enforced)

Before Edit/Write: grep the relevant spec above for the symbol/class/token in play, cite
`<file>:<line>`, then edit. The grep-required + canon-block PreToolUse hooks enforce this
whether or not this file is loaded.
