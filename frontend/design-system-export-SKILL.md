# Design System Export Skill — building satellite products from a composed design system

---
name: design-system-export
description: >
  Use this skill whenever a STANDALONE product surface is built from an existing
  project's design system — an embeddable player/widget, a docs or blog page, a
  static site, a portal, a share card: anything that ships the project's look
  OUTSIDE the main app shell. Triggers: "reuse our components in", "extract the
  CSS for", "standalone page", "embed", "make it match the app". It exists
  because the naive approach — copy the classes you think you need into a
  hand-rolled page — reliably fails in a specific, expensive way.
---

## The failure this prevents (lived, twice-priced)

A mature design system's CSS is **composed, not atomic**. Classes assume their
ancestor context: surface-tier backgrounds set on parents, generic flow rules
keyed to a host wrapper (`.panel > *`-style), cumulative gutter/inset sums,
root-derived scale variables. Copy a class without its host chain and it
renders wrong — and because ONE structural mismatch surfaces as dozens of
visual symptoms, the builder "fixes" them one by one as styling patches. Hours
later the surface is a fork of the design system that still doesn't match.

Failure pattern: **STRIPPED-SHELL-HOST-MISMATCH** (see FAILURE-PATTERNS.md).
The mismatch count is the DOM distance from the real host. Patching styles
treats the symptom N times; fixing the host treats the cause once.

## The three laws

### 1. HOST-FIRST — the unit of reuse is HOST CHAIN + HELPERS + CLASSES

Never classes alone. A satellite mounts its components inside a REAL host
structure from the app — the same wrapper DOM the app builds, constructed by
the SAME JS builder functions. If the satellite shows a slider, it ships the
app's slider module and calls its factory; a hand-built lookalike is a
hand-roll across a repo boundary (HELPER-HAND-ROLL). If no real host fits the
satellite's shape, that is a DESIGN decision for the operator — not a license
to approximate.

Corollary — patches go UPSTREAM: a defect found in a satellite is fixed in the
app source, then the satellite regenerates. A satellite never patches its
copied CSS/JS (a patched copy is a fork that rots — the curated-copy failure).

### 2. Extraction is GENERATED, never hand-curated

The satellite's CSS/JS subset is produced by an extractor script that:

1. walks the satellite's **rendered DOM** on the live dev environment and
   collects every class actually in use;
2. pulls each class's rules **plus every ancestor-context rule that can match
   it** (descendant/child selectors whose right side matches — the part
   hand-curation always misses);
3. ships the **full design-token block verbatim** — tokens are never subsetted
   or forked; skinning = swapping token VALUES (a theme file), never editing
   extracted rules;
4. emits an extraction manifest (classes, rules, source hashes) so the next
   regenerate is a reviewable diff.

### 3. Acceptance = MEASURED PARITY (the two-mismatch tripwire)

Before ANY styling patch on a satellite:

- Render the same component in the APP and in the SATELLITE;
  `getBoundingClientRect()` both; compare per element. Geometry is measured on
  the live render, never derived from CSS source (LAYOUT-DERIVED-NOT-MEASURED).
- **Two-mismatch rule:** ≥2 geometry mismatches on ONE component = a HOST
  problem. STOP patching styles. Fix the host chain, re-measure. This is the
  tripwire that converts a 3-hour grind into a 10-minute host fix.
- End every satellite verification with a screenshot a human (or the
  coordinator) actually looks at.

## Mechanics

- **`design/satellite-manifest.json`** (path configurable) registers every
  satellite surface file. It is the isolation boundary: app code never imports
  satellite files; satellites consume app files read-only.
- **`satellite-gate.js` hook** (this stack): any commit staging a
  manifest-listed file requires a `Satellite:` trailer —
  `parity-measured (<what/how>)` or `n/a (<why>)`. Enable via the
  `satellite` block in `stack.config.json`.
- **Governance parity:** satellite surfaces obey the full design canon of the
  parent project (no new classes, tokens only, no native UI leaks — whatever
  the project's rules are, they apply unreduced).
- **State + privacy:** a satellite embedded on third-party pages runs
  stateless by default (no localStorage, no telemetry) unless the project's
  privacy policy explicitly says otherwise.

## Lifecycle

1. **Charter** — one paragraph in an owning spec: what it is, who embeds it,
   which app components it mounts.
2. **Host build** — real host + real helpers, inside the main repo, verified
   at measured parity against the app.
3. **Extract** — the generator produces the standalone bundle.
4. **Publish** — bundle to the satellite's home (repo/CDN/pages), provenance
   and license carried; the main repo stays the single source of truth.
5. **Regenerate on drift** — upstream changes to consumed classes/helpers
   re-run the extractor; the extraction-manifest diff is the review surface.

## Why satellites at all (the strategy note)

A satellite is the cheapest honest marketing a tool project has: a free,
useful, embeddable piece of the real product that trains its future users on
the real interface before the product ships. It only works if it IS the real
interface — which is exactly what the three laws guarantee.
