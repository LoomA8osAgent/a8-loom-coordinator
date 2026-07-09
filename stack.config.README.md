<!--
  A8 Coordinator Stack — MIT License.
  Copyright (c) 2026 A8 Coordinator Stack contributors.
-->

# stack.config.json — the one knob

Every hook and tool in this package reads **one** config file. JSON has no
comments, so this document IS the annotated schema. There are **no hardcoded
paths anywhere in the hooks** — the disease this package cures is the Anim8
originals baking `/Users/.../Anim8` into 15 files. Instead:

- Every hook resolves `stack.config.json` by **walking up** from the edited
  file (or the session `cwd`) until it finds one. A repo with no
  `stack.config.json` at or above it is simply **not governed** — the hook
  no-ops (exit 0) and the tool call proceeds. This makes the stack safe to
  install globally and serve many projects at once: each repo carries its own
  config, and the walk-up picks the right one.
- Override the search with the `A8_STACK_CONFIG` environment variable (absolute
  path to a config file) when you want to pin one.

`project.repoRoot` may be left `""` — it then defaults to the **directory
containing `stack.config.json`**, which is what you want in 99% of cases. Set it
only if the config lives somewhere other than the repo root.

## Key reference

### `project`
| key | meaning |
|---|---|
| `name` | Display name used in hook messages. |
| `repoRoot` | Absolute repo root. `""` ⇒ derived from the config file's directory. |
| `rootMarkers` | Files that must exist for a dir to count as "the project root" (guards the artifact sweep + worktree check). |

### `source` — what counts as editable code
| key | meaning |
|---|---|
| `codeGlobs` | Source files the gates adjudicate (glob suffixes, e.g. `js/**/*.js`). |
| `styleFiles` / `markupFiles` | CSS + HTML files the new-class detector scans. |
| `exemptDirSegments` | Path segments that exempt a file from all edit gates (`/tools/`, `/tests/`). |
| `exemptExtensions` | Extensions never gated (`.md` — you author canon in markdown). |

### `canon` — the anti-drift knowledge base
| key | meaning |
|---|---|
| `files` | Always-on governance docs (used by messages + the manifest tool). |
| `specGlobs` | Where deep specs live (citation lint + routing). |
| `registryFile` | The generated code index (`UI-REGISTRY.md`) — the file `grep-required` GATE 2 requires you to consult before UI-machinery edits. |
| `hints` | Substrings that make a grep/read "canon-relevant" (GATE 1). |
| `helperHomes` | Files where shared/exported builders legitimately live (`helper-home` never blocks here). |

### `consent`
| key | meaning |
|---|---|
| `tokens` | Words in the **operator's own message** that grant new-UI consent (unforgeable — read from the transcript). |
| `oneOffMarker` | Comment marker (`one-off-ok`) that, WITH operator consent, sanctions a one-off builder. |

### `devServer`
The single canonical dev server. `command`, `port`, `url` — surfaced in hook
messages so verification runs against the one server.

### `verification` — the "scripted-test-API-only" gate (`verification-first.js`)
Off by default. When `enabled`, browser/app tool calls in `browserTools` are
DENIED unless they invoke a call in `allowedCalls` (functions beginning with
`testApiPrefix`). This is the generalized macro-first gate: it forces app
interaction through your project's scripted, replayable test API instead of
ad-hoc clicks.

### `statePersistence` — the save-walk gate (`state-persistence-commit.js`)
A commit that adds a new user-selectable/persistable control (matched by
`signals` regexes in the added diff of `stateFileGlobs`) must carry a
`<trailerName>:` trailer (`covered` / `n/a (<why>)`), so a control the user can
change but a preset can't restore never ships silently.

### `docSync` — the doc-companion gate (`docsync-commit.js`)
A commit touching `featureGlobs` (minus `featureExemptPrefixes`) must carry a
`<trailerName>:` trailer naming, per `pillars`, which doc pillar moved or why
not. Each pillar names its `stagedPrefixes` — a pillar claimed as moved must
have a matching staged file. `citationLint` optionally runs a `path:line`
checker on staged spec markdown at the commit boundary.

### `canonBlock` — string-pattern bans (`canon-block.js`)
`rules[]`: `{ pattern (string → RegExp), flags, allow (path suffixes),
code, msg }`. Each rule blocks its pattern in new content outside its `allow`
list. Ships with two generic examples (inline handlers, native color input);
add your project's known failure strings.

### `session` — SessionStart regeneration (`session-regenerate.js`)
`generators[]` shell commands run at session start (registry, manifest,
changelog). `deploySkillsAgents` deploys tracked skills/agents into `.claude/`.
`delegationHint` is appended to the session context.

### `worktree` (`no-worktree.js`) — off by default
When `guardEnabled`, aborts if `cwd` contains `dirSegment`.

### `artifacts` (`clean-session-artifacts.js`)
Sweeps the repo root of session leftovers at session start: depth-1 images
(`imageExtensions`) + `scratchPatterns` files + `scratchDirs` contents, never
touching `keepFiles` or recursing into project subdirs.

### `install`
| key | meaning |
|---|---|
| `hooksDir` | Where `install-hooks.sh` deploys the hooks (`~` expands). |
| `gateLog` | Append-only pass/block log (`tail` it to prove gates fire). |
| `settingsTarget` | Project settings file the wiring is merged into. |
| `maxBackups` | Backups kept per file (cures the ~130-`.bak` accumulation). |

### `serviceRecovery` (`service-recovery.sh`)
`notifyCommand` — `{msg}`/`{title}` placeholders; macOS `osascript` default.
`autoResume` — arm the detached backoff resume loop (opt-in).

### `codegraph`
`syncEnabled`, `staleThresholdMinutes`, `binaryCandidates` — the codegraph sync
hooks (see `integrations/codegraph.md`). No-op if the binary is absent.

`commitTrailers`, `alwaysOnDocs`, `modulePrefixes` are declarative metadata the
tools + your governance docs reference.
