<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# tools — the anti-drift generators

**A generated index beats memory.** Institutional knowledge that lives only in a
model's context is lost at compaction and reinvented next session. These tools
project the codebase into always-current markdown indexes that the gates + the
model read instead of guessing. Wire them into `session.generators` so they
**regenerate at every session start** — a stale index is a lie the model trusts.

> **Verify counts didn't collapse.** A generated index that reads EMPTY is worse
> than none — it grants false confidence. Every generator prints a one-line
> summary with its counts; `gen-code-registry` warns loudly if the registry
> reads empty. If a count cratered, the scan target moved (e.g. CSS extracted to
> a new file) — fix `source.*` globs, don't ship the empty index.

| tool | produces | why |
|---|---|---|
| `gen-code-registry.js` | `UI-REGISTRY.md` (helpers · exports · classes · components · engines · §6 orphans) | the index to SCAN before building any UI; §6 is the dead-code check the per-edit hooks cannot do (reachability needs the whole tree) |
| `gen-manifest.js` | `FILE-MANIFEST.md` (per-dir inventory, line counts, stub flags) between GEN markers | keeps the inventory from drifting from reality; hand prose outside the markers is preserved |
| `gen-changelog.js` | `CHANGELOG.md` (feature commits, session-grouped, newest first) | git is the authoritative version log; this is a projection — no hand-curation, no doc-sync burden |
| `gen-skills-agents.js` | deploys tracked `skills/` + `agents/` → gitignored `.claude/` | makes a machine-local `.claude/` reproducible from tracked sources every session |
| `lint-citations.js` | exit code (bad `path:line` cites listed) | kills fabricated / stale citations mechanically — the rot a hand-written spec accretes when it cites code that has moved |
| `work.js` | `WORK.tsv` — THE work list (one row per item: `id · title · body`) | the list a tool can actually parse; `done <id> <hash>` resolves the hash against git and refuses a checkpoint, so "done" is a commit that exists rather than a sentence anyone can write |

Every tool is config-driven (walks up to `stack.config.json`), takes `--help`,
and is idempotent (a clean re-run is byte-identical — no timestamps). Run one
directly any time, or let the SessionStart hook run the whole set.

```bash
node tools/gen-code-registry.js
node tools/gen-manifest.js
node tools/gen-changelog.js
node tools/gen-skills-agents.js
node tools/lint-citations.js --changed
node tools/work.js                 # the list; --check is the pre-commit gate
```

## The work list (why it is a tool and not a document)

`work.js` is the odd one out here: it does not project the codebase, it holds the
open work. It earns its place for the same reason — **a generated/parsed artifact
beats prose.** Its ancestor was a goal tree plus a backlog file: 185 KB of prose with
checkboxes buried in it, where every tool that had to FIND work was a regex over
English, so every hole was a parser hole (one heading-word test hid 20 goals and 43
open items). Both files were deleted along with the ~28 tools that parsed them.

The rules are in `governance/WORK.template.md` and they are the whole mechanism: ONE
file, one row per item, no nesting (not representable), no status column (on the list
= needs doing), zero prose in the file, and a row leaves only against a real
non-checkpoint commit. `--check` is the gate — wire it into your pre-commit hook, and
prove it can fail by handing it a row with no body.

## The orphan check (dead-code, the gap hooks leave)
PreToolUse hooks see one edit at a time — they cannot judge reachability, so a
superseded surface (a helper N callers dropped) slips past them. `gen-code-
registry` §6 lists every export with **zero live callers**. A NEW feature-surface
orphan after your change = you shipped a zero-caller helper; an EXISTING one
superseded by a shared module = dead code to DELETE, not refactor. Grep-confirm
before deleting (a candidate may be reached dynamically or string-registered).
