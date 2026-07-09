<!-- A8 Coordinator Stack — MIT License -->
<!--
  WHAT THIS IS: the session-handoff convention. HANDOFF.md is a ROLLING BACKLOG, not a
  per-session snapshot. A fresh session has ZERO context beyond what is committed + written
  here — so this file is the memory bridge between sessions.

  WHEN IT LOADS: read at session start (part of the read-order); rewritten at session end.

  HOW TO FILL: replace {{...}}. The critical rule is MERGE-NEVER-OVERWRITE (below). Copy the
  opener block format into the top of each new handoff.
-->

# HANDOFF — rolling backlog + next-session opener

> **MERGE, NEVER OVERWRITE.** This file is a rolling backlog. At session end you UPDATE it:
> tick what's done, carry forward every still-open task, add what's new. A blind overwrite
> DROPS untouched work — that is a trust break. If you must regenerate it, first recover the
> prior version (`git show HEAD:HANDOFF.md`) and merge its open items forward.

## Next-session opener (paste-ready — three elements per OPERATOR.md rule 3)

```
Load {{skill.default}}. [task]. [mode] mode.
Read order: CLAUDE.md → OPERATOR.md → {{spec.fileManifest}} → [spec1] → [spec2]
```

## What was done (this session)
- [list of completed tasks + files modified, with evidence — commit hash / GREEN test id]

## Open tasks (carry forward until DONE — do not drop)
- [ ] [task — owner spec — acceptance test]
- [ ] [task …]

## Blockers
- [anything that blocked or needs an operator decision — surface at the top of the next reply
  if older than one session]

## Notes appended to project memory
- [any new failure-pattern / NOTE entries added this session]
