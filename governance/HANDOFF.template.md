<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the session-handoff convention. HANDOFF.md is a THIN, FORWARD-ONLY BATON —
  what to do next and what a fresh session inherits. It is REPLACED each session, not merged:
  the backlog lives in WORK.tsv and the record lives in git.

  WHEN IT LOADS: read at session start, right after the work list; replaced at session end.

  HOW TO FILL: replace {{...}}. Keep it under ~250 lines — an anti-creep guard is worth
  wiring, because this file's failure mode is becoming a second work list.
-->

# HANDOFF — {{date}} close

> **A THIN BATON, REPLACED — NOT A ROLLING BACKLOG.** Earlier versions of this stack told you
> to MERGE this file forward, because it carried the open work. It no longer does: the open
> work is `WORK.tsv` (one row per item, `node tools/work.js`) and what happened is
> `git log`. A handoff that also carries the backlog becomes a second work list, the two
> disagree within a week, and the one people read is the stale one. So: **four sections, and
> anything that belongs on the list goes on the list before this file is written.**
>
> Sections: NOW · NEXT · OPERATOR-PENDING · POINTERS. Nothing else.

**Start directory:** `{{project.repoPath}}` — this is what keys the agent harness's memory
store (`{{memory.storePath}}`), which lives OUTSIDE the repo and outside every hook.
**Precedence, every session: operator > repo canon > hook context > memory.** Memory that
conflicts with repo canon is wrong by definition and is fixed the same turn
(`STALE-MEMORY-AS-CANON`). Enumerate what a fresh session INHERITS, not only what this one
created: the memory store, user-global instruction files, and any deployed copies of the
project's config.

## NOW

```
node tools/work.js
```

Take the topmost row (`show <id>` for the body), confirm it if it is operator-gated, fix it,
commit, `done <id> <hash>`, next. **Order is the only priority signal.** State of the tree and
the dev server in one line — e.g. *"tree clean, server up on {{devServer.url}}."*

## NEXT

The two or three rows after the top one, by id, with their rough size. No plans, no lanes, no
tree — if it needs more than a line here, its body on the list is where it belongs.

## OPERATOR-PENDING

Rows that cannot move without a ruling, by id, each with the one question — asked once, short,
and only after the owning doc was searched (`ESCALATED-A-QUESTION-THE-DOCS-ANSWER`).

## POINTERS

The two or three commands and documents the next session will otherwise re-derive: the gate
pre-flight, the canon lookup, whatever this session learned the hard way.

---

> **Writing this file after a context compaction?** Source it from a sweep of the SESSION, not
> from the compaction summary. The summary carries the current task; the session carried every
> ratified plan, budget, ruling and deferral. Handoff completeness is session-scope, never
> summary-scope.
>
> **"Done" means a non-checkpoint, gate-green commit cited by its hash.** Anything else that
> still needs doing is a row on the list, not a paragraph here.
