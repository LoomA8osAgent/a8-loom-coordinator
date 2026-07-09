<!-- A8 Coordinator Stack — MIT License -->
<!--
  WHAT THIS IS: the adoption skill. It interviews the operator, writes stack.config.json, fills
  every {{...}} token across the templates, and ends by installing the hook stack. This is how
  a new project ADOPTS the A8 Coordinator Stack. It is the one skill an operator loads FIRST.

  WHEN IT LOADS: on first adoption — "set up the coordinator stack", "adopt A8 stack",
  "initialize governance".

  HOW TO FILL: this skill ships ready-to-run. The {{...}} it references are the KEYS it will
  populate (it is the writer, not a consumer). stack.config.json is authored by the config
  worker; this skill reads its key list and drives the interview from it.
-->
---
name: init-interview
description: >
  Use this skill to ADOPT the A8 Coordinator Stack into a new project. It interviews the
  operator for the project's real values, writes stack.config.json, fills every {{...}} token
  across the governance templates + skills + agents, and installs the hook stack. Trigger on:
  "set up the coordinator stack", "adopt the A8 stack", "initialize governance", "onboard this
  project to the stack", "fill the templates".

  Reference files: stack.config.json (the key schema), governance/*.template.md, skills/*,
  agents/*.template.md
---

# Init-Interview — adopt the stack into a project

You are onboarding a NEW project onto the A8 Coordinator Stack. Work through the interview,
write the config, materialize the templates, install the gates. Do not skip a section — an
unfilled token ships a broken governance file.

## 1. Interview (ask; do not assume)

Collect every value `stack.config.json` declares. Group the questions:

- **Project identity** — name; one-line tagline; build description (what kind of app / how
  it's built); repo absolute path; canonical branch; main entry file(s); global identifier
  prefix; the frozen-until-RC naming note.
- **Operator** — the operator's name (used in the operator contract).
- **Dev server** — the ONE command that launches it; its URL + port; the file that defines it.
- **Test / acceptance** — the test-harness command; the acceptance-test mechanism's name +
  how one is authored and run (this generalizes as `{{acceptanceTest.*}}`).
- **Persistence walk** — the name of the save/recall mechanism (presets / projects /
  snapshots) that new state must be wired into.
- **Docs** — the spec directory; the user-doc directory; the always-on doc set (which files
  are `@`-imported every turn).
- **Registry + hooks** — the generated registry file + its generator command; the canonical
  helper source files; the hook install command.
- **Modules** — the module prefix table (CSS / storage / log / code prefix per module), so
  prefixes never collide.

Confirm the full set back to the operator before writing anything (OPERATOR.md rule 12 —
surface the scope).

## 2. Write stack.config.json

Populate every key from the interview. Keep keys self-evident and centralized — every template
token resolves through this one file. If the operator can't answer a key yet, record a
`TODO:` sentinel and list it in the completion summary rather than inventing a value.

## 3. Materialize the templates

For each `governance/*.template.md` → write the concrete file (drop the `.template` suffix)
with every `{{...}}` replaced from the config. Same for `agents/*.template.md`. Verify ZERO
`{{` remain in any materialized file (grep proof — `NO-GREP-PROOF`). Wire the always-on set
(`@`-imports in the materialized CLAUDE.md) to the operator's chosen doc set.

## 4. Install the gate stack

Run the hook install step (`{{hooks.installCommand}}` — authored by the hooks worker). Verify
the gates are live (the install script's `--verify` mode, or a deliberate canon violation that
the gate should block). Regenerate the registry (`{{registry.genCommand}}`) and confirm its
counts are non-zero (`CACHE-LIE` / empty-index guard).

## 5. Completion summary

Report: the config keys populated, any `TODO:` sentinels left for the operator, the files
materialized (with a grep proof of zero remaining tokens), and confirmation the gates + the
registry are live. Hand back a paste-ready first session opener (three elements — OPERATOR.md
rule 3).
