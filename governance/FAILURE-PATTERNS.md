<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the enforced failure-pattern table — the hard-won catalogue of ways an agent
  breaks a codebase, each with the prevention that kills it. These are the rules the agent
  must ACTIVELY prevent, not merely know. Generalized from a real project's 74-session
  project-memory; every one is domain-agnostic.

  WHEN IT LOADS: always-on (@-imported by CLAUDE.template.md). The §Invariants §Never bucket
  references these codes.

  HOW TO FILL: this ships usable as-is. Add YOUR project's own patterns via the harvest
  discipline at the bottom. Keep the code names — they become shared vocabulary in commit
  messages, hooks, and reviews.
-->

# FAILURE-PATTERNS — the enforced catalogue

Patterns the agent must ACTIVELY prevent. Cite the code in commit messages and reviews; the
codes are shared vocabulary. Each row: the CODE, what happens if unchecked, and the prevention.

| Code | What happens | Prevention |
|------|--------------|-----------|
| **CACHE-LIE** | The agent claims a fix works by reading the file on disk, but the running system serves a cached/stale build — the change never took effect where it matters. | Verify the RUNNING system, never just the file. Reload the live process/page; confirm the new code path executed (a log line, a measured value, a behavior change) before claiming done. |
| **VERIFY-DISPLAY-NOT-EFFECT** | The agent verifies a control by reading its DISPLAYED value ("it shows 30") instead of the underlying EFFECT ("the variable is 30 / the pixel changed"). Display ≠ effect — a value can show but not apply. | Verify against the actual state variable or the observable effect, not the label text. "Shows the number" is not "applied." |
| **LAYOUT-DERIVED-NOT-MEASURED** | A geometry / alignment / measured value (a coordinate, a size, a cumulative offset) is COMPUTED by reading source and doing arithmetic in-head. The real value is a SUM across the whole system that no source read yields; it ships wrong. | MEASURE the value on the running system (the real rendered box / the real emitted number), derive from the measurement, apply, then RE-measure to confirm. Never compute a cumulative/observed value from source. |
| **PATCH-NOT-ESCALATED-TO-SHARED** | A bug is fixed in ONE module's copy of behavior that ≥2 modules share. The fix "works" for the patched module but leaves every sibling — and every future module — carrying the same latent bug. | Identify the SHARED home the behavior belongs to; grep EVERY sibling for the same shape FIRST. If ≥2 share it, the fix lives in the ONE shared home and the per-module copies are DELETED. The fix is at the highest shared level or it is not done. |
| **HELPER-HAND-ROLL** | The agent builds a widget / util / builder that a canonical helper already provides, forking the canon and losing everything the helper gives free. | Before writing ANY builder/util, grep the helper source + scan the generated registry. Reuse or derive from what exists. Assembling primitives into a whole-task unit a helper already builds is the violation. |
| **NEW-CLASS-WITHOUT-CONSENT** | The agent invents a new styling class / token / vocabulary when an existing one would do, forking the design canon module by module. | Every class/token already exists in the canon and is REUSED or DERIVED. A genuinely-new item requires BOTH that it is truly new AND explicit operator consent — then it is written into the canon (registry + spec) in the SAME change. Absent → STOP and ask. |
| **SPEC-DRIFT-APPEND-NOT-RECONCILE** | A session appends its harvest to the bottom of a spec WITHOUT reconciling the spec's existing body to the current code — the spec accretes truth at the bottom while stale claims stand above it. | Touching a module = verify its spec still describes what the code does; fix drift the same session. Retiring/renaming any surface triggers a same-commit corpus grep of the retired token across all docs + code comments; each hit triaged (purge / historical-keep / resolve-live). |
| **LIVE-FEATURE-UNDOCUMENTED** | A user-touchable feature ships with no spec section, no registry presence, no user-doc, no acceptance test. It exists only in the session that built it — the next session reinvents or collides with it. | Same commit as the feature: spec section + user-doc at full depth + acceptance test (run GREEN) + registry entry. A design input that shapes a decision but appears nowhere afterward is the same failure. |
| **STATE-NOT-PERSISTED** | A new user-selectable / persistable variable (enum, toggle, mode, menu pick, numeric control) is added but NOT wired into the save/recall walk — a project/preset recall silently loses the user's choice. A control the user can change but a save can't restore is broken. | Every new persistable state is captured AND restored in the persistence walk IN THE SAME COMMIT (save side + recall side), via a dedicated named field (not buried in a bag). For shared capabilities capture generically via the capability getter/setter so every consumer inherits it. Verify the round-trip: set → save → change → recall → restored. |
| **SPEC-WIRED-IN-NAME-ONLY** | A feature/API is specced in docs and shipped in code but has ZERO callers — invisible dead debt that looks done. | At session close, audit every newly-added API and assert at least one consumer exists. An empty caller graph = unwired = not done. |
| **DEAD-CODE-SUPERSEDED-NOT-DELETED** | When a shared module supersedes N hand-rolled surfaces, the originals become orphaned dead code that a dedup audit mis-flags as "duplication to extract." Building a shared helper for a zero-caller surface is a fresh SPEC-WIRED-IN-NAME-ONLY violation. | For any "this is built N times" finding: grep for live callers FIRST (exclude the definition, exports, comments). Zero callers ⇒ DELETE, do not extract. A dedup finding is untrusted until grep-confirmed live. |
| **BREAK-WORKING** | The agent modifies working code that wasn't part of the task and breaks it. | Never modify working code unless specifically asked. Anything operator-verified-working is untouchable except through its owning shared path, with test proof before commit. |
| **NO-GREP-PROOF** | A change is declared complete without a grep audit; a missed reference or parallel path ships broken. | Never ship a spec/code change without the grep audit shown. Audit all parallel paths and list them explicitly. |
| **EDIT-FAILED-BUT-SILENT** | A multi-part refactor (new function + renamed call sites in separate edits) succeeds on one edit and silently no-ops another, leaving call sites pointing at undefined symbols. | After a refactor that spans multiple edits, grep for the new symbol on BOTH sides and smoke-test the path. Never assume both edits landed. |
| **TROUBLESHOOT-WITHOUT-AUDIT** | The agent debugs a symptom without first checking whether the API/path even has callers — burning a long arc on a feature that was never wired. | Before debugging: grep the caller graph. If only the definition file matches, the API is unwired — that IS the bug. A ten-second grep can answer the whole arc. |
| **SCOPE-CREEP-SILENT** | One task quietly becomes another; end-state cleanup is compressed and cost is hidden. | Declare scope changes explicitly ("scope change — [list]. Confirm?") and wait. Ripples across files within one focus are fine if declared; a new tangential goal is a scope change. |

## How to add your own patterns (harvest discipline)

A failure pattern earns a row when it (a) is cross-cutting — it can recur in any module — and
(b) has a mechanical prevention. To add one:

1. **Name it in SCREAMING-KEBAB.** The code becomes shared vocabulary in commits, hooks, and
   the §Invariants §Never bucket. Make it self-evident.
2. **Write the row in three parts:** what happens (the failure, generalized — strip project
   specifics), and the prevention (the mechanical rule that kills it).
3. **Wire it into the §Never bucket** of `CLAUDE.md` in one line, and into a hook if it is
   mechanically detectable at edit/commit time.
4. **Harvest at session end.** Any session that surfaces a new cross-cutting failure appends
   the row here AND a one-line note to the project memory — the `@`-import does not
   auto-elevate a buried lesson; only this table does.

A pattern that lives only in a session's memory is a story; a pattern in this table is a rail.
