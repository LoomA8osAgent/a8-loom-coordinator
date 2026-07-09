<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the doc-sync skill — the discipline that a user-visible change ships WITH its
  spec, its user-doc, and its acceptance test in the SAME commit. Kills LIVE-FEATURE-
  UNDOCUMENTED + SPEC-DRIFT-APPEND-NOT-RECONCILE.

  WHEN IT LOADS: on any commit that touches a user-visible surface; on any spec edit.

  HOW TO FILL: replace {{...}}. If your project has no user-doc pillar yet, drop that column
  but keep the spec + acceptance-test pillars — the two-way binding is the point.
-->
---
name: doc-sync
description: >
  Use this skill whenever a change touches a user-visible surface, adds/renames/retires a
  feature, or edits a spec. Triggers: "add feature X", "ship", "document", "the spec is
  stale", "user manual", "acceptance test / macro for X", any commit staging feature files.
  Enforces: a user-visible change ships WITH its owning spec section, its user-doc entry, and
  its acceptance test IN THE SAME COMMIT — and specs reconcile to code, never just accrete.

  Reference files: {{spec.userDocRoot}}, {{spec.acceptanceTests}}, FAILURE-PATTERNS.md
---

# Doc-Sync

A feature is not shipped until its documentation ships with it. Three pillars, one commit.

## The three pillars (per user-visible change)

1. **Spec** — the owning spec section (`{{spec.specRoot}}/…`) describes what the code NOW
   does. Reconcile the existing body to the code; do NOT append a harvest below stale claims
   (`SPEC-DRIFT-APPEND-NOT-RECONCILE`).
2. **User-doc** — the user-facing documentation (`{{spec.userDocRoot}}/…`) at full depth: the
   highest technical tier, 100% coverage of the changed surface in the smallest detail, plain
   language (never spec language) — every control behavior, state, menu entry, and semantic
   the change adds or alters. A bare recipe does not satisfy the pillar.
3. **Acceptance test** — the feature's executable acceptance test
   (`{{spec.acceptanceTests}}`), authored and run GREEN on the running system BEFORE commit.
   The test IS the feature's proof-of-done.

## The commit gate

A commit that stages feature files carries a per-pillar `Docs:` trailer — `spec+userdoc+test`,
or a subset with per-pillar `n/a (<why>)`, or `none (<why>)`. Every pillar is a conscious,
audited call — never a silent skip. A pillar claimed as covered must have matching staged
files. (Enforce mechanically via the doc-sync commit hook.)

## The reconcile question (asked every session that touches a module)

Did this session change behavior a spec describes, retire/rename a surface, or add a
user-visible feature? If yes:
- Reconcile the owning spec to the code (not append below stale claims).
- Run the retired-token corpus grep across all docs + code comments; triage each hit
  (purge / historical-keep / resolve-live).
- Ship the doc companions THIS session.

## The two-way binding

The user-doc entry and its acceptance test reference each other (the doc's task recipe ends at
its acceptance-test id; the test's name maps back to the doc surface). A doc surface with no
test, or a test with no doc surface, is a broken binding — the assembler/lint should flag both
directions.
