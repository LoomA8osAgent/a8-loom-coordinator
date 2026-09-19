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
| `spec-gate.js` | PreToolUse Edit/Write | R1 build tooling stays out of the app scope · R2 a NEW surface must be byte-contained in a valid compile receipt | `specCatalog.*` | `enabled:false` ⇒ inert |
| `lib/decision-provider.js` | (lib) | the ONE decision-model client — `systemone` (any loopback `/v1/systemone`) + `fixture`; strict validation, typed errors, loopback ENFORCED, fail-closed, never a silent fallback | `judgment.provider` | only when adopted |
| `judgment-gate.js` | PreToolUse Edit/Write · Bash · Agent/Task | asks the roster's seams at whichever moment each one claims (`edit` \| `commit` \| `spawn`); PRINTS its engagement state, advises by default, and DENIES when engaged and unable to ask | `judgment.*` | `enabled:false` ⇒ SILENT no-op |
| `judgment-roster.example.js` | (template) | the versioned unit — questions, ladders, bands, the state filter. COPY it to `judgment.roster`; never deployed as a hook | `judgment.roster` | template |
| `judgment-server.example.sh` | (docs) | how to run a RESIDENT loopback provider, the two supply-chain / exposure hazards, and the telemetry MUSTs. Documentation that happens to be executable; nothing here runs it | — | docs |
| `docsync-commit.js` | PreToolUse Bash | feature commit ⇒ per-pillar `Docs:` trailer | `docSync.*` | `enabled:false` ⇒ off |
| `state-persistence-commit.js` | PreToolUse Bash | new user-selectable ⇒ `State:` trailer (save-walk coverage) | `statePersistence.*` | `enabled:false` ⇒ off |
| `verification-first.js` | PreToolUse browser tools · `--receipt <path>` | app interaction must route through the scripted test API · a run's receipt is accepted only from a DECLARED, enabled instrument (`instrument` field; undeclared / disabled / shapeless ⇒ refused, fail closed) | `verification.*`, `verification.instruments[]` | `enabled:false` ⇒ off (default) |
| `native-instrument.example.sh` | (docs) | how a DESKTOP instrument drives a built app bundle and writes the one receipt shape — launch → window → screenshot → non-black luma probe → receipt — with the install audit an OS-automation CLI earns (checksum **and** signature, both outbound channels pinned off and read back, foregrounding takes the operator's pointer). Documentation that happens to be executable; nothing here runs it | `verification.instruments[]` | docs |
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

**Deliver the canon inside the refusal, don't make it resident.** The rules a gate
enforces belong in the gate's *block message*, resolved for the file being edited — not
`@`-imported into every turn. Measured in the production stack: 107 KB of always-on
invariants, of which the worst-case file was governed by ~21 KB and the typical one by
under 2 KB, and a fully-resident anti-hand-roll rule still failed to stop a hand-rolled
duplicate that `canon-block` then refused. A router (`--for <path>` / `--prompt "<text>"`)
is the cheap form. Three honesty rules make it safe: print the rules when there are some;
print *why, naming what was looked for,* when there are none (silence reads as "no rule
governs this file"); trim an over-budget payload with an "N more" tail instead of dropping
it whole (a silently discarded injection while the hook reports success is the same
failure wearing a success message).

## The newer gate classes (spawn / turn-boundary / instrument / meta)

The table above is edit-time and commit-time — the floor a codebase needs on day one.
Successive hardening arcs in the production stack added four more gate *classes* that a
mature multi-agent workflow grows into. They are documented in full — timing, what they
block, the holes they close — in [`../ENFORCEMENT.md`](../ENFORCEMENT.md), and summarized
here so you know they exist before you need them:

- **spawn-time** (PreToolUse Agent/Task): one gate, five refusals. A spawn is denied
  without an explicit **token estimate** (`BUDGET: ~350K opus` — visibility, not
  permission), without an explicit **model field** whose family matches the declared tier
  (the *word ≠ config* hole), unless its **agent is on the project's allowlist** (built-in
  agents skip the governance), without a **proof tier** (`PROOF: light` by default;
  `PROOF: heavy (<reason>)` needs the reason written), and — the newest — unless the
  **body matches that label**: under `light` the brief may name at most ONE proof
  instrument, because a tier gate that reads only the label is a formality (ten lanes once
  passed it with the whole suite written underneath, at the cost of three hours and a
  week's budget). A **commit-cadence** gate then denies the next spawn while any build file
  is uncommitted — closing the hole where a session that never commits until arc-end lives
  entirely in un-gated space. Both are agent-count-aware (they defer while a background
  agent runs, enforcing only at quiescence) and seat-aware where two coordinators share a
  repo, with attribution that **fails closed**.
- **turn-boundary** (Stop hook): a **clean-tree-on-stop** gate blocks turn-end on a dirty
  build tree, so the operator never receives an un-gated tree to test; a **seat-discipline**
  gate caps the coordinator's own inline Bash volume (the seat's rule — *reason · spawn ·
  audit · commit* — made mechanical after prose failed to hold it).
- **instrument-time** (PreToolUse on the verification tools): a **no-synthetic-input** gate
  denies event-dispatch / programmatic-activation inside any browser-eval call — a dead
  input path still answers a scripted click, so that instrument can only ever produce a
  false green; real input through the automation framework, or nothing. Alongside it, the
  **route ban** (PreToolUse Bash) refuses a shell command whose write target is a governed
  path and redirects it to Edit/Write, because every edit gate fires on the edit tools only
  and a heredoc walks past all of them at once.
- **meta** (the gates that gate the gates): a **self-test corpus** proves every gate can
  actually *fail* (a gate that accepts its own known-bad input is failing open — silence
  scored as a pass), and each fixture is itself falsified against a pre-change copy of its
  gate; a **new-gate-lock** refuses a new gate without its red-fixture; a **coverage
  report** maps every failure-pattern code to its live executor at session start and prints
  the hole count; a **hook-drift** check diffs canonical registrations against what is
  actually deployed.

Two rules apply to every gate in every class. **Fail closed on an unreadable payload** — a
gate that cannot parse plausibly-in-scope input refuses, because "I couldn't read it, so I
allowed it" is the purest silence-as-a-pass. And **beware the enumeration**: a gate that
lists *instruments* silently exempts every instrument added after it (measured three times
in one stack), so where a list is unavoidable, enumerate the EXEMPT set and let anything
new be taxed by default.

These ship in the production project as first-class hooks; in this repo they are the
documented pattern (each project wires the commit/spawn cadence to its own branch and
build-surface conventions). The `pattern→hook` growth gate — a new failure-pattern row
is refused unless it also ships an enforcing hook — is what keeps this list from ever
drifting back into prose. And every gate ships with a red-fixture proven to block on
known-bad input and to pass on good input; a gate nobody has watched fail is a decoration.

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

Four other gaps were closed by the newer classes above rather than by an edit-time
hook: the *never-commits-until-arc-end* gap (a session can bypass every commit gate by
simply not committing) is closed by **commit-cadence** + **clean-tree-on-stop**, which
force a commit at every spawn and turn boundary; the *silent pass* gap (a gate that
accepts bad input scores as green) is closed by the **self-test corpus**; the *other door*
gap (an edit written through a shell bypasses every Edit/Write gate at once) is closed by
the **route ban**; and the *false green* gap (a scripted click proving nothing about a dead
input path) is closed by the **no-synthetic-input** gate. A hook that cannot fail is not a
floor — it is a decoration.

One gap stays open by construction, and is worth naming rather than hiding: **no hook
gates a sentence.** A coordinator can type "it's ready" about anything. The stack makes
the lie pointless (you cannot advance or end a turn on uncommitted work, and the heavy
gates run on the arc-close commit) but the *word* is closed only behaviorally — "ready /
done / works" is reserved for a non-WIP, gate-green commit cited by its hash.
