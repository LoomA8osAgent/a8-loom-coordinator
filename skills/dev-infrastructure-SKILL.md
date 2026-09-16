<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the dev-infrastructure skill — the operating canon for the tooling that runs
  and polices the build: ONE canonical dev server, verify-the-running-system (not disk),
  verify-the-effect (not the display), measure-don't-derive, the gate stack, and the
  generated registry. Generalized from a real single-server / no-worktree / disk-only
  toolchain.

  WHEN IT LOADS: on dev-server / endpoint work, hook/gate work, registry regeneration,
  "why didn't the hook fire", "the dev server", "the gates".

  HOW TO FILL: replace {{...}} with your server command/port, registry generator, and hook
  install script. Drop subsections your project lacks (e.g. a code-graph index) but keep the
  three verification laws — they are the generalizable core.
-->
---
name: dev-infrastructure
description: >
  Use for the DEVELOPMENT infrastructure that runs the live app + enforces governance: the
  ONE canonical dev-server, the anti-handroll gate stack (PreToolUse hooks + install script),
  the generated UI/helper registry + its generator, and the single-server / no-worktree /
  verify-the-running-system operating canon. Trigger on: dev-server / endpoint work, hooks /
  gates / install-hooks, registry regeneration, hook config, "the gates", "the dev server",
  "why didn't the hook fire".

  Reference files: {{devServer.file}}, {{hooks.readme}}, {{registry.index}}
---

# Dev-Infrastructure

The tooling that runs + polices the build. Three verification laws govern everything.

## The three verification laws (absolute)

1. **Verify the RUNNING system, never the file on disk (`CACHE-LIE`).** A change on disk is
   not a change in the running process until it is reloaded and its code path executes.
   Reload the live system; confirm the new path ran.
2. **Verify the EFFECT, never the display (`VERIFY-DISPLAY-NOT-EFFECT`).** Read the actual
   state variable / observable behavior, not the label. A value can show without applying.
3. **MEASURE, don't derive (`LAYOUT-DERIVED-NOT-MEASURED`).** Any measured/geometry/emitted
   value comes from the running system, never from arithmetic on source. Measure, apply,
   re-measure to confirm.

## 1. The one dev-server — and the one exception

`{{devServer.command}}` on `{{devServer.url}}` is the CANONICAL server: the operator and the
coordinator look at the SAME running system, same port, same state, same bug. **The intent is
shared sight, not server scarcity.** The coordinator starts no second server and never
redirects that one; any preview tool is pointed AT it, never run as a parallel canonical.

The exception, and its rules: **a WORKER may start its own isolated server on its own port**
for verification work — that is what makes falsification possible (serve a pre-change copy,
prove the new test goes RED there) without touching the tree the operator is watching.

- Take the port **from the kernel**, do not guess: probe it first, or bind 0 and read back what
  you got. If a launch loses the race and reports `EADDRINUSE`, pick another port and **leave
  that one alone, including at teardown** — a port that refused you is someone else's.
- Tear down **by the PID you started** (keep the child handle). Never `pkill` a process NAME:
  one lane's pattern-kill killed the operator's server, the coordinator's audit copy, and four
  sibling lanes' copies at once. Never resolve "your" pid from a port either — on a shared box
  the command line, the cwd and the port all collide between lanes.
- Name scratch copies after the LANE. A shared scratch path with a canonical name gets reset
  under a running lane, which produces whole runs of false reds before anyone notices.

**Pre-flight belongs IN the runner, not in a document.** Before any run opens a browser, the
runner itself refuses unless: the server name resolves to ONE setting and a known asset fetches
200 · the store/data root is the tree that server actually serves (proved by a nonce — identity,
not equality) · no other runner is driving that server · the ids were passed as separate
arguments. A learnings doc whose findings are not built into the testing is worthless; every new
harness failure earns a pre-flight check first and a written note second.

## 2. Storage = disk only

Treat the app as a real application, not a website. Every persist = a POST to a disk endpoint;
every read = a GET. Browser cache (localStorage / IndexedDB / sessionStorage) is NOT a
feature, NOT a fallback, NOT in the design space — the storage shim shadows it so it is
canon-impossible. Adding persistent state = add/extend a disk endpoint, never a cache write.

## 3. No worktree

The agent operates against absolute paths to the MAIN repo. No worktree sessions — code
authored in a long-branched worktree imports stale canon with no audit. A SessionStart hook
aborts if the cwd is under a worktree path.

## 4. The gate stack

The anti-handroll enforcement: version-controlled hook source in the repo, RUN from the
machine-local hooks dir, wired by the agent settings. **Edit the gate in the repo source, then
run `{{hooks.installCommand}}` to sync + restart the session** — hooks do NOT hot-reload.
PreToolUse Edit/Write gates enforce canon-grep-before-edit, no-hand-rolled-helper,
no-new-class-without-consent, and the string-pattern bans. SessionStart hooks enforce
no-worktree + registry refresh. Every adjudicated edit logs to the gate log (gates are silent
on pass — tail the log to see why one fired).

Three rules for anyone TOUCHING the stack (full architecture: `ENFORCEMENT.md`):

- **Writes go through the edit tools.** Every gate above fires on Edit/Write/MultiEdit only, so
  a shell redirect walks past all of them at once. The route ban refuses that and redirects; it
  has no inline escape, because a comment marker is forged as easily as the write it excuses.
- **A new gate ships with its red-fixture** — hand it the input it must reject and watch it
  block, then confirm the fixture goes RED against a pre-change copy of the gate. A gate nobody
  has watched fail is a decoration, and a gate that accepts its own known-bad input cannot
  report that itself (`GATE-FAILS-OPEN`).
- **The canon arrives inside the refusal.** The rules a gate enforces are resolved for the file
  being edited and printed IN the block message — not `@`-imported into every turn. When the
  lookup has nothing for a file, it must SAY SO and name what it looked for; silence reads as
  "no rule governs this file".

## 5. The generated registry

`{{registry.index}}` is the generated index of every helper / class / component / reusable
unit — **scan it before building anything reusable.** A SessionStart hook regenerates it;
`{{registry.genCommand}}` rebuilds it manually. Its orphan section lists zero-caller exports
(the dead-code check the hooks can't do). If the generator reads EMPTY (wrong scan target),
that is worse than no registry — it gives false confidence and blinds every agent; verify the
generated counts didn't collapse after any refactor that moves source around.

## 6. Commit discipline

Work on `{{project.defaultBranch}}`; the protected branch is deny-gated at the harness level.
**Commit as you build** — the gate stack fires on `git commit`, so uncommitted work is un-gated
work; a checkpoint (`WIP: <reason>`) is free and clears the heavy gates, and the full stack runs
on the non-checkpoint arc-close commit. The operator's word gates a RELEASE, not a checkpoint.
"Ready / done / works" is reserved for a non-checkpoint, gate-green commit cited by its hash.
The dev-server is loopback-only — privacy intact, zero telemetry.
