# frontend/ — the opt-in frontend module

The core stack (governance + hooks + skills + agents) is **language- and
domain-agnostic** — it governs any codebase, frontend or backend, in any language.
This directory holds the pieces that only make sense for a **composed web
frontend** (CSS/DOM). Backend projects ignore it entirely.

## Turn it on

One flag in `stack.config.json` plus the frontend regexes:

```jsonc
"frontend": {
  "enabled": true,
  "mountClassRe": "\\.(component|[\\w-]+-editor|overlay-panel)\\b[^{}\\n]*\\{",
  "layoutPropRe": "\\b(position|min-height|flex|overflow|display)\\s*:",
  "newClassRe": ""            // optional; default matches `.class`
}
```

See `stack.config.example.frontend.json` at the repo root for a complete worked
config (declares the CSS/DOM hand-roll shapes in `machinery.signals`, a
`classSections` registry mapping, the satellite gate, CSP/color canon-block rules).

## What `frontend.enabled` unlocks

Everything below is INERT when the flag is off — no CSS detection runs, so a
backend project is never touched by any of it:

- **new-surface-consent shapes B + C** (`hooks/new-surface-consent.js`) — mount/scroll
  CSS on framework mount classes, and new CSS classes absent from the registry.
  (Shape A, a project-declared hand-roll signal, is universal and runs regardless.)
- **CSS-class registry parsing** (`hooks/lib/detect.js loadRegistry`) — the `.class`
  index from the registry's class sections.
- **satellite-gate** (`hooks/satellite-gate.js`) — the host-first law for standalone
  surfaces built from a composed design system. Inert without a satellite manifest.

## What lives here

- **`design-system-export-SKILL.md`** — THE method for building a satellite/standalone
  product (embeddable player, docs page, portal, share card) from a composed design
  system without the stripped-shell failure: HOST-FIRST law, generated extraction,
  measured parity, the two-mismatch tripwire. To use it, copy this file into your
  project's `skills/` (or point `session.deploySkillsAgents` at a set that includes it).

## Frontend failure patterns

Two rows in `governance/FAILURE-PATTERNS.md` load only with this module:
`NEW-CLASS-WITHOUT-CONSENT` (the CSS instance of the universal
`NEW-VOCABULARY-WITHOUT-CONSENT`) and `STRIPPED-SHELL-HOST-MISMATCH`. Both are the
domain-specific face of a universal core pattern — the core one governs backend work,
these govern the CSS surface.

## The principle, either way

Frontend or backend, the stack enforces ONE thing: **discover what the codebase
already provides, then reuse it — never hand-roll a fresh version.** The frontend
module just teaches the gates what "already provides" looks like in CSS/DOM.
