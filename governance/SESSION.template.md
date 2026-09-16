<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the session protocol — the mandatory ordered steps before ANY edit, the
  pre-edit checklist, and the syntax-check / delivery discipline. The operator contract
  (OPERATOR.md) governs the human side; this governs the mechanical session flow.

  WHEN IT LOADS: always-on (@-imported by CLAUDE.template.md).

  HOW TO FILL: replace {{...}}. The six-step session-start protocol + the pre-edit checklist
  are the generalizable core — keep them; adjust the tool names / commands to your project.
-->

# SESSION.md — session protocol

## Session-start protocol (mandatory, no exceptions)

Before writing ANY code or making ANY edit, show these six steps:

1. **Read `CLAUDE.md` → `OPERATOR.md` → `{{spec.fileManifest}}`** in that order.
2. **Check the skills directory** (`{{skills.dir}}`) for a domain-specific skill covering
   the task. Load it if found.
3. **Consult `{{spec.fileManifest}}`** — identify exactly which files are relevant.
4. **List the functions / components to be touched — by name, not description.**
5. **View source at exact line numbers** — never edit from memory.
6. **Name the relevant failure pattern** from `FAILURE-PATTERNS.md` before proceeding.

Do NOT begin editing until all six steps are shown.

## Library-first protocol (before any non-trivial capability)

1. Read `ACKNOWLEDGEMENTS.md` first — the canonical, operator-vetted shortlist. If the need
   matches a bundled or planned library, use it; no alternatives search.
2. Only if nothing there covers the need: search the ecosystem, evaluate 2–3 candidates
   (maintenance, license — no GPL, API quality), present findings before writing code.
3. If no library exists, state that explicitly with evidence, then proceed with custom.
> WHY: multiple sessions built fragile custom solutions when battle-tested libraries existed
> because the search was never done.

## Editing rules

1. Syntax-check after every edit (`{{syntaxCheck.command}}`). Dynamic code-gen (`eval` /
   `new Function`) is forbidden.
2. Include enough context in the match target that no adjacent code is orphaned.
3. Audit all parallel paths before declaring a change complete. List them explicitly.
4. Never approximate or reimplement a component that already exists.
5. View source at exact line numbers before every edit, every session.

## Pre-edit checklist

Before any edit:
- [ ] Viewed source at the exact location THIS session (not from memory).
- [ ] Match target includes enough context — adjacent functions not orphaned.
- [ ] Touching a callback / closure? The match includes its closing delimiter.
- [ ] Syntax-check planned immediately after.

Before adding any new persistable parameter / state:
- [ ] Follows the canonical state-key convention.
- [ ] Added to the schema.
- [ ] Appears in the persistence / preset walk (save AND recall).
- [ ] Diagnostic / observability row added or updated.

Before adding any new module:
- [ ] Prefix not colliding with the module prefix table.
- [ ] Diagnostic export + rows planned.
- [ ] Persistence integration planned (if it handles content/state).
- [ ] Test-harness extension planned.

## Delivery rules

Delivery = a commit on `{{project.defaultBranch}}` (the coordinator runs git; subagents never
touch it).
1. **Commit as you build.** The gate stack fires on `git commit`, so uncommitted work is
   un-gated work: commit each audited unit BEFORE advancing. A checkpoint (`WIP: <reason>`) is
   free and clears the heavy gates; the full stack runs on the non-checkpoint arc-close commit.
   The operator's word gates a RELEASE, not a checkpoint. "p" means proceed, not publish.
2. **"Ready / done / works" cites a hash** — a non-checkpoint, gate-green commit. A partial
   (a red, a deferral, a remainder) is not a result and does not get a completion word.
3. Run the test harness ({{testApi.command}}) before the arc-close commit — zero failures, and
   scoped to what the diff can reach. ONE proof instrument per unit of work; a known-good path
   is not re-proven because a change rode it.
4. Syntax-check every modified file.
5. Grep for stale/retired reference terms — zero occurrences, across docs AND code, not only
   the retired surface's own files.
6. Commit by explicit path list, not a whole-index sweep, so one cluster can be reverted alone.
7. Be aware of the FULL project, not just changed files.
