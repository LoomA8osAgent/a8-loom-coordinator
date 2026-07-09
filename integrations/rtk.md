<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# rtk — Rust Token Killer (token-optimized CLI proxy)

**Why: 60–90% token savings on routine dev operations.** rtk is an external
CLI that intercepts common dev commands (git, grep, file reads, directory
listings, test runners) and returns a *compact, relevance-filtered* projection
instead of the raw firehose. A `git status` with 200 changed files, a `grep`
across a whole repo, a `cat` of a 3,000-line file — each normally dumps
thousands of tokens the model mostly discards. rtk strips comments, truncates
noise, groups by file, and shows failures-only, so the same information costs a
fraction of the context.

This is an integration doc — rtk is a separate tool with its own repo. This
package does not vendor the binary; it documents the install, the Bash-hook
auto-rewrite, and the big-read discipline that makes it pay off.

## Install
```bash
brew install rtk        # or per the rtk project's install instructions
rtk --version           # sanity
rtk gain                # analytics command — should work (not "command not found")
```
> Name collision: a different `rtk` (Rust Type Kit) exists. If `rtk gain` fails,
> `which rtk` and confirm you have the token-killer, not the type kit.

## The Bash-hook auto-rewrite
The highest-leverage wiring is a Bash PreToolUse hook that transparently
rewrites eligible commands to their rtk equivalent — `git status` →
`rtk git status`, etc. — at **zero token overhead** (the model writes normal
commands; the hook swaps them). Meta commands (`rtk gain`, `rtk discover`,
`rtk proxy <cmd>`) are always invoked as `rtk` directly.

## Big-read discipline (the rules that make it pay)
Native `Read` / `Grep` / `Glob` bypass the Bash hook, so for *large* targets,
prefer rtk explicitly via Bash. Put this in your `CLAUDE.md`:

```md
## Big-read rule (rtk)
- File > 500 lines, or unknown size + likely large — use `rtk read {path}`.
- Grep with > 100 expected matches, or a whole-repo scan — use `rtk grep {pattern} {path}`.
- Directory listing of > 50 entries — use `rtk ls {path}` / `rtk tree {path}`.
Small/targeted reads (known line range, single-file grep, < 50 files) stay on the
native tools — no point adding Bash overhead when the read is already small.
```

## Commands to know
| command | does |
|---|---|
| `rtk read PATH` | intelligent file filtering (strips comments, truncates, keeps relevant) |
| `rtk grep PATTERN PATH` | grouped-by-file compact grep |
| `rtk tree` / `rtk ls` / `rtk find` | compact directory views |
| `rtk git STATUS\|DIFF\|LOG\|…` | compact git (auto-rewritten by the Bash hook) |
| `rtk test` / `rtk jest` / `rtk vitest` / `rtk tsc` / `rtk lint` | failures-only test output |
| `rtk gain [--history]` | cumulative token savings analytics |
| `rtk discover` | analyze session history for missed rtk opportunities |
| `rtk proxy <cmd>` | run the raw command unfiltered (debugging) |

## Relationship to this stack
rtk is a **personal/global productivity tool** (a global Bash-rewrite hook), not
project governance — it lives in your global `~/.claude` config, independent of
`stack.config.json`. It pairs naturally with the stack: the gates keep the model
honest, rtk keeps the model cheap.
