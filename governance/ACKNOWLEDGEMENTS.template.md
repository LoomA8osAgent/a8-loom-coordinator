<!-- A8 Coordinator Stack — MIT License -->
<!--
  WHAT THIS IS: the library-first canon — the operator-vetted, license-cleared shortlist of
  dependencies. It is the FIRST thing read before any non-trivial capability, so the agent
  never re-runs research already done and never writes custom for something already chosen.

  WHEN IT LOADS: on demand (before any library/dependency decision — see SESSION.md
  §Library-first protocol).

  HOW TO FILL: replace {{...}} and populate the tables with YOUR vetted set. Every entry is a
  deliberate, license-checked choice. Keep the two-step protocol as-is.
-->

# ACKNOWLEDGEMENTS — the library-first canon for {{project.name}}

## The two-step protocol (mandatory before any non-trivial capability)

**Step 1 — Read THIS file first.** This is the canonical shortlist: Currently Bundled +
Planned Integration. Every entry is operator-vetted and license-cleared. If the need matches
a bundled or planned entry, use it — no alternatives search. **Never write custom for
something on the Planned Integration table.**

**Step 2 — Only if nothing here covers the need:** search the ecosystem (package registries,
source hosts). Evaluate 2–3 candidates on maintenance, license, API quality, and platform
fit. Present findings with links BEFORE writing code. If no library exists, state that
explicitly with evidence — only then proceed with custom.

**Never** substitute a different library for an entry already on the list without the
operator's explicit approval — doing so re-runs completed research and breaks the license
audit.

## License policy

{{license.policy}} — e.g. permissive only (MIT / BSD / Apache / CC); no GPL/copyleft in the
shipped product. Every entry below records its license.

## Currently Bundled

| Library | Purpose | License | Notes |
|---------|---------|---------|-------|
| {{lib.name}} | {{lib.purpose}} | {{lib.license}} | {{lib.notes}} |

## Planned Integration (do NOT write custom for these)

| Library | Purpose | License | Status |
|---------|---------|---------|--------|
| {{planned.name}} | {{planned.purpose}} | {{planned.license}} | {{planned.status}} |
