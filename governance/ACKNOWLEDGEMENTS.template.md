<!-- A8 Loom Coordinator — MIT License -->
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

## Build Tooling (never shipped in the product)

Dependencies of the toolchain, not of the thing you ship. They are vendored rather
than installed so a fresh clone works with no install step, and a gate keeps them out
of the application scope — what crosses into the app is the compiler's OUTPUT, never
its dependencies.

| Library | License |
|---------|---------|
| [json-render](https://github.com/vercel-labs/json-render) — catalog-constrained specification + codegen by Vercel Labs. **`@json-render/core` 0.21.0 + `@json-render/codegen` 0.21.0 vendored** at `tools/spec-catalog/vendor/` (dist + licence; the React / react-native / react-pdf renderers and adapters dropped). This project uses the METHOD — catalog → constrained spec → `validateSpec`/`autoFixSpec` → compile — as the builder-agent constraint layer: an agent emits a `{helper, props, children}` spec that can only name entries derived from the code registry, and `tools/spec-catalog/compile.js` emits real calls into this project's own helpers. Zero json-render code reaches the running product (enforced: `spec-gate` R1). Method of record: `integrations/spec-catalog.md`. | [Apache-2.0](https://github.com/vercel-labs/json-render/blob/main/LICENSE) |
| [zod](https://github.com/colinhacks/zod) — TypeScript-first schema validation by Colin McDonnell. Vendored at `tools/spec-catalog/vendor/zod/` as the required peer of `@json-render/core` (the catalog's prop schemas). Build-tooling only. | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) |
