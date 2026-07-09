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

  Reference files: {{devServer.file}}, {{hooks.readme}}, {{registry.uiIndex}}
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

## 1. The one dev-server

`{{devServer.command}}` on `{{devServer.url}}` is the ONLY server the agent runs. It serves
the app + the disk-backed persistence endpoints. The agent NEVER starts a second http server
(no alternate static server, no mock API, no preview-tool server run as a parallel canonical
server — point any preview tool AT `{{devServer.url}}`). The agent may restart the one server
(it is the dev) but never spawns a second.

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

## 5. The generated registry

`{{registry.uiIndex}}` is the generated index of every helper / class / component / reusable
unit — **scan it before building anything reusable.** A SessionStart hook regenerates it;
`{{registry.genCommand}}` rebuilds it manually. Its orphan section lists zero-caller exports
(the dead-code check the hooks can't do). If the generator reads EMPTY (wrong scan target),
that is worse than no registry — it gives false confidence and blinds every agent; verify the
generated counts didn't collapse after any refactor that moves source around.

## 6. Commit discipline

Commit ONLY when the operator asks; work on `{{project.defaultBranch}}`; the protected branch
is deny-gated at the harness level. The dev-server is loopback-only — privacy intact, zero
telemetry.
