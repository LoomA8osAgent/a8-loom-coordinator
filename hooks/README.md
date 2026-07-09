<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# hooks — the enforcement floor

**Hooks are the floor: they fire regardless of which model reasons, whether it
read the governance docs, or whether it "remembered" the rule.** A prompt is
advice; a PreToolUse hook that exits 2 is a wall. This directory is the wall.

Every hook is **project-agnostic** — it resolves `stack.config.json` at runtime
by walking up from the edited file (or the session `cwd`). A repo with no config
at or above it is simply not governed (the hook no-ops). One install serves any
number of repos; each carries its own config. **There are no hardcoded paths.**

## Install
```bash
bash hooks/install-hooks.sh            # copy → install.hooksDir + wire install.settingsTarget
bash hooks/install-hooks.sh --verify   # drift check, no writes
```
The installer reads `install.hooksDir` / `install.settingsTarget` / `maxBackups`
from `stack.config.json`, deploys every hook + `lib/` + `caveman/`, backs up what
it overwrites, and **prunes backups to `maxBackups`** (cures the ~130-`.bak`
accumulation). Restart the session after install — hooks do not hot-reload.

## The gates
| file | event | gates | config keys | optional? |
|---|---|---|---|---|
| `lib/config.js` | (lib) | runtime config resolution (walk-up) + `logGate` | — | no |
| `lib/detect.js` | (lib) | payload/consent extraction · registry parse · UI-machinery detector | `canon`, `consent`, `source` | no |
| `grep-required.js` | PreToolUse Edit/Write | canon-search this turn + (UI-machinery ⇒ registry consulted) | `canon.hints`, `canon.registryFile` | no |
| `canon-block.js` | PreToolUse Edit/Write | string-pattern bans (inline handlers, native inputs, retired APIs) | `canonBlock.rules` | rules empty ⇒ inert |
| `new-surface-consent.js` | PreToolUse Edit/Write | hand-rolled host / mount-CSS / NEW CSS class ⇒ block unless consent | `consent.tokens`, `canon.registryFile` | no |
| `helper-home.js` | PreToolUse Edit/Write | raw DOM builder in a non-helper file ⇒ block unless exported / composes-a-helper / one-off+consent | `canon.helperHomes` | no |
| `docsync-commit.js` | PreToolUse Bash | feature commit ⇒ per-pillar `Docs:` trailer | `docSync.*` | `enabled:false` ⇒ off |
| `state-persistence-commit.js` | PreToolUse Bash | new user-selectable ⇒ `State:` trailer (save-walk coverage) | `statePersistence.*` | `enabled:false` ⇒ off |
| `verification-first.js` | PreToolUse browser tools | app interaction must route through the scripted test API | `verification.*` | `enabled:false` ⇒ off (default) |
| `session-regenerate.js` | SessionStart | run generators + deploy skills/agents + surface the registry rule | `session.*` | generators empty ⇒ inert |
| `clean-session-artifacts.js` | SessionStart | sweep repo-root session artifacts | `artifacts.*` | `enabled:false` ⇒ off |
| `no-worktree.js` | SessionStart | abort if cwd under a worktree dir | `worktree.*` | `guardEnabled:false` ⇒ off (default) |
| `codegraph-sync-stale.js` | UserPromptSubmit | sync codegraph if index > N min stale | `codegraph.*` | no codegraph ⇒ no-op |
| `codegraph-sync-postedit.js` | PostToolUse Edit/Write | sync codegraph after each code edit | `codegraph.*` | no codegraph ⇒ no-op |
| `service-recovery.sh` | StopFailure | log/notify + opt-in auto-resume on overload | `serviceRecovery.*` | global settings |
| `caveman/*` | Session/Prompt | terse output mode (see `caveman/README.md`) | env / caveman config | global, personal |

`service-recovery.sh` + `caveman/*` are personal/global (wire them in the GLOBAL
`~/.claude/settings.json`, not a project's) — they are operator preferences, not
project governance.

## Observability
Every adjudicated edit appends a line to `install.gateLog`:
```
2026-07-09T… | grep-required | PASS  | js/editors/foo.js | ui-machinery+registry
2026-07-09T… | new-surface-consent | BLOCK | index.html    | 1 flag(s)
2026-07-09T… | helper-home   | PASS  | js/components.js  | exported-helper
```
`tail` it to prove the gates are live (they are silent on pass otherwise).
Self-bounds at ~256 KB.

## The gap hooks can't close
PreToolUse hooks see one edit at a time — they cannot judge reachability. The
orphan / dead-code check lives in the **code registry generator** instead
(`tools/gen-code-registry.js` §6: exports with zero live callers). Regenerate at
session start; grep-confirm before deleting.
