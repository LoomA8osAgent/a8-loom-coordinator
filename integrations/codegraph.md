<!-- A8 Coordinator Stack — MIT License. (c) 2026 contributors. -->

# codegraph — code intelligence over an indexed knowledge graph

**Why: one call returns the verbatim source PLUS who calls it and what it
affects — so you edit with the blast radius in view, in far fewer tokens and
round-trips than a grep/read loop.** codegraph is a SQLite knowledge graph of
every symbol, edge, and file in the workspace: pre-computed structure you'd
otherwise re-derive by reading files. Reads are sub-millisecond; the index lags
writes by ~1s through a file watcher.

This is an integration doc — codegraph is a separate tool with its own repo.
This package documents the doctrine, the sync hooks (`codegraph-sync-postedit`,
`codegraph-sync-stale`), and the install.

## The explore-before-grep doctrine
Put this in your `CLAUDE.md`:

```md
## CodeGraph
In repos with a `.codegraph/` directory, reach for codegraph BEFORE grep/find or
reading files when you need to understand or locate code:
- MCP tool `codegraph_explore` answers most code questions in ONE call — the
  relevant symbols' verbatim source plus the call paths between them (including
  dynamic-dispatch hops grep can't follow). Name a file/symbol to read its
  current line-numbered source.
- Shell `codegraph explore "<symbols or question>"` prints the same.
If there is NO `.codegraph/` directory, skip codegraph entirely — indexing is the
user's decision.
```

Reach for it BEFORE *and* while writing/editing, not just for questions: naming
the symbols you're about to change surfaces their callers + dependents so a
change lands with its impact known. A direct codegraph answer is one to a few
calls; the equivalent grep/read exploration is dozens.

## The sync hooks (in this package)
| hook | event | does |
|---|---|---|
| `codegraph-sync-postedit.js` | PostToolUse Edit/Write | detached `codegraph sync` after each code edit → subsequent queries see fresh edges |
| `codegraph-sync-stale.js` | UserPromptSubmit | detached `codegraph sync` when the index DB is > `codegraph.staleThresholdMinutes` old (catches external edits / other sessions / `git pull`) |

Both are **belt-and-suspenders** — codegraph's own daemon auto-syncs after
`init`; the hooks guarantee freshness even if the daemon is down. They resolve
the binary across `codegraph.binaryCandidates` (migration-proof — a hardcoded
`/opt/homebrew` path breaks when the binary moves) and **no-op silently** if the
binary is absent or there is no `.codegraph/` — so a clone without codegraph runs
fine.

## Install
```bash
# per the codegraph project's install instructions, typically:
curl -fsSL <codegraph-install-url> | sh
codegraph install --target claude --yes   # wire the MCP server into Claude Code
codegraph init                            # build this repo's graph (.codegraph/, self-gitignored)
```
Set `codegraph.binaryCandidates` in `stack.config.json` to the install
locations you use (defaults: `~/.local/bin`, `/opt/homebrew/bin`,
`/usr/local/bin`).

## Relationship to the code-registry §6 orphan check
`tools/gen-code-registry.js` §6 (exports with zero live callers) is a grep-based
*stopgap* for the reachability question codegraph answers properly. With
codegraph indexed, a caller/orphan/duplication query is a single
`codegraph_explore` call.
