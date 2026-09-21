<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# spec-catalog — constraint BEFORE, instead of refusal AFTER

**Why: every other gate in this stack adjudicates code the model has already
written.** The refusal arrives after the work, costs a retry, and — when the invented
shape passes a NAME check — does not arrive at all. This layer inverts the order: the
builder emits a **constrained spec that can only name things the codebase already
has**, a compiler turns that spec into real calls, and the gate refuses any new
surface no compile receipt covers. The freehand path stops being something the agent
can express.

That is the same idea as the rest of the stack (`discover-then-reuse`), moved one step
earlier — from *judging the output* to *bounding the input*. It is the one place where
"deterministic building against an existing codebase" becomes literal: the set of
expressible programs is the set of things the registry found.

The method is [vercel-labs/json-render](https://github.com/vercel-labs/json-render)'s
— catalog → constrained spec → `validateSpec` / `autoFixSpec` → codegen. This package
takes the **method and the validators**, never a renderer. The two packages plus `zod`
are vendored (this package has zero runtime dependencies); see
[`tools/spec-catalog/VENDORED.md`](../tools/spec-catalog/VENDORED.md).

## The pipeline

```
tools/gen-code-registry.js        ── the ONE scan ──┐
                                                    │
        ├── CODE-REGISTRY.md   (the human/agent index, unchanged)
        └── tools/gen-catalog.js
                 ├── tools/spec-catalog/catalog.json        the machine table
                 └── tools/spec-catalog/catalog.prompt.md   the byte-capped payload
                                                             the builder preloads

        author  ─→  specs/ui-specs/<name>.json      the constrained spec
                 ─→  validate.js                    2 passes + lossless-only autofix
                 ─→  compile.js                     real calls + an HMAC'd receipt
                 ─→  paste the block                hooks/spec-gate.js checks the receipt
```

**THE ONE SCAN RULE.** `gen-catalog.js` does not scan. It requires
`gen-code-registry.js` and projects the SAME result. A parallel scanner drifts, and
then two generated indexes disagree about one codebase — the duplication this stack
names `PATCH-NOT-ESCALATED-TO-SHARED`, wearing a generator's clothes. If a count in
the catalog disagrees with the registry's own stdout line, the catalog is wrong.

## The catalog — derived, never hand-listed

Everything except two fields is a field of the registry scan, renamed. The two that
are new work:

- **`props`** — the unit's option NAMES, read out of its body with
  `specCatalog.propReadRe` (which is language-specific, so it is config). A name
  absent from the row is an option the unit does not read, and the validator says so.
- **`owns`** (frontend only) — the classes the unit WRITES. A class in `owns` is one
  the **compiler emits for the agent**, so an agent never authors it, and the
  new-class detector can never see it in agent-authored content.

Locating a unit's DEFINITION is also done here, and it matters: the registry fills its
map with the first line matching an export/def regex, and those regexes match a CALL
as readily as a definition. Reading props out of a call site yields data that is not
merely missing but WRONG — and a catalog that under-reports a prop **refuses the spec
that names it.** So definitions are resolved for names the scan already found (a
lookup, never a second inventory), and the registry's own `file:line` is carried
alongside so a discrepancy is visible rather than silently corrected.

### Two tiers, so it is usable on day one

| tier | condition | what is enforced |
|---|---|---|
| `declared` | an annotation block above the definition | prop types + requiredness, slot names, the `desc` |
| `derived` | no block yet | the unit NAME and its prop NAMES; types unchecked, and a note carried into the compile receipt |

Annotating everything is not a precondition. **A derived entry is still catalog-only,
which is the whole constraint: an agent cannot name a unit that does not exist.**

The annotation is a comment block immediately above the definition (the reader strips
`/*`, `*`, `//` and `#`, so it works in most languages), tagged
`specCatalog.annotationTag` (default `@catalog`):

```js
/** @catalog
 *  desc:  param rows for any section or panel (the ONE row host)
 *  prop   host: element!        host element the rows mount into
 *  prop   items: any!           row descriptors
 *  prop   mode: enum(edit|view) which affordances are wired
 *  prop   onChange: fn          rebuild callback
 *  slots: none                  (rows come from `items`, never from children)
 */
```

`!` = required. The type vocabulary is **CLOSED** (`specCatalog.types`): a declared
prop whose type is outside it is a BUILD FAILURE of the generator, not a warning — an
unchecked type token is a prop the gate believes it validated and did not
(`GATE-FAILS-OPEN`).

## The spec an agent emits

Flat, and deliberately byte-compatible with json-render's `Spec` shape so the vendored
`validateSpec` / `autoFixSpec` / `traverseSpec` run unmodified.

```json
{
  "mount":  { "kind": "host", "arg": "body", "slot": "section" },
  "root":   "grp",
  "elements": {
    "grp":  { "type": "buildSection",
              "props": { "prefix": "ex", "label": "parameters" },
              "children": ["rows"] },
    "rows": { "type": "buildRowHostFromItems",
              "props": { "host":  { "$slot": "grp.body" },
                         "items": { "$arg": "items" },
                         "mode":  "edit",
                         "onChange": { "$fn": "rebuild" } } }
  }
}
```

### The expression subset — four forms, reduced on purpose

| form | meaning | why |
|---|---|---|
| literal | a string / number / bool / array prop | — |
| `{"$arg":"name"}` | a parameter of the emitted function | the caller owns the value |
| `{"$fn":"name"}` | a named callback parameter | handlers are the caller's, never the spec's |
| `{"$slot":"key.slotName"}` | the element another node returns | how a child mounts into a parent |

**Excluded absolutely — REFUSED, never fixed:** `$state` · `$bindState` · `$bindItem`
· `$computed` · `repeat` · `watch` · `visible` · `on`. Those are json-render RUNTIME
features, and this layer has no json-render runtime: application state lives in the
project's own store and its persistence walk, and a second state model beside it is a
duplication failure by construction (`STATE-NOT-PERSISTED`, `PERSISTENCE-HOLE`). The
vendored `collectStatePaths` / `collectActions` are used as **refusal detectors** —
a non-empty set means an excluded form was used.

### A child mounts itself

Units take their host as an OPTION, so an append emitted beside that option would
either duplicate the mount or fight it — and WHICH return key to append is information
the derived tier does not carry. So a child declares its own attachment as a `$slot`
prop naming its parent, and **a child that names no slot of its parent is REFUSED with
its own prop list attached**, so the author picks rather than the compiler guessing —
`LAYOUT-DERIVED-NOT-MEASURED`, applied to the emitter. `children` keeps two real jobs:
it fixes emission order (parent before any child that references it), and it is what
`validateSpec` reads to find dangling references.

The same rule governs the mount: `mount.slot` names which key of the root's return is
appended into `mount.arg`; it is optional only when the root takes the host as a prop
and so mounts itself. **Neither ⇒ refused**, never guessed.

## Validate — two passes, and a lossless-only fixer

1. **`validateSpec`** (vendored) — dangling children, dangling slot refs, malformed
   forms — plus the refusal detectors above.
2. **`validateAgainstCatalog`** (ours) — every `type` is a catalog entry; every prop
   key is one the unit reads; (declared tier) types + requiredness; every `$slot`
   names a node that exists and a slot that unit declares; every class-valued string
   is a class the scan knows **or one the RECEIVING unit owns** — the unit handed a
   class is the one that writes it, and the parent may not even be in the same
   subtree. Which props are class-valued is decided by prop NAME
   (`specCatalog.classPropRe`), never by guessing at a value's shape, which would flag
   every label string in the project.

**Every issue names the entry that COVERS the need** (`cover.js`, shared with the
gate's refusal). *"That unit does not exist"* is a true and useless answer.

`autoFixSpec(spec, {lossy:false})` runs first — lossy fixes are never applied, because
pruning a dangling child silently deletes work the agent meant to build. On top of it
one fixer: **the near-miss name repair, applied only when exactly one candidate
resolves.** It has three arms, each requiring uniqueness, tried tightest first:

| arm | rule | example |
|---|---|---|
| A typo | Levenshtein ≤ 2 | `buldRows` → `buildRows` |
| B prefix | a proper prefix of exactly one entry | `buildRowHost` → `buildRowHostFromItems` |
| C tokens | camel tokens, in order, in exactly one entry | `buildHostItems` → `buildRowHostFromItems` |

A looser arm **never** runs after a tighter one found ≥2 candidates: resolving with a
looser rule an ambiguity a tighter rule already saw is precisely how a lossy fix gets
mislabelled lossless. Two candidates ⇒ REFUSE with both named. Zero candidates ⇒ the
name was INVENTED and there is nothing to fix it to — inventing a target is how a
lossy fix gets called lossless. The same arms run over class names, and **an invented
class is refused outright even when the fixer could guess**: minting vocabulary is
`NEW-CLASS-WITHOUT-CONSENT` and no fixer may launder it.

### The candidates are enumerated by code; the pick is a separate, injectable step

`autoFix(spec, { selector })` returns a **`choices`** array — `{kind, at, name, arm,
candidates}` per unresolved name — built **before** anything is chosen, and a selector
`(name, candidates) => chosen|null` picks among exactly that list.
`specCatalog.autofixSelector` names which one is in force: `distance` (the default —
the uniqueness gate above) or any other name, for a selector the project injects
itself; nothing in this layer consults it, the function is simply injected.

**Three properties hold for ANY selector, and they are enforced here rather than
trusted to it:**

- a pick **outside the enumerated list is REFUSED**. Code owns what is *possible*; a
  selector owns only *which of those*. That is the entire difference between choosing
  and inventing, and it is the reason a different selector cannot widen what a spec may
  name.
- a name with **zero candidates never reaches a selector**. It was invented, there is
  nothing to fix it to, and asking anything to pick from an empty list is how a lossy
  fix gets called lossless.
- a selector returning **null leaves the ambiguity refusal exactly as it was**, with
  every candidate named.

One measured wrinkle, handled rather than worked around: `core.autoFixSpec`
reconstructs the spec off the json-render `Spec` shape, so it DROPS `mount` (not a
json-render field) and SEEDS an empty `state` model. Left alone, the *lossless* fixer
emits a spec that fails this layer's own schema. The extra fields are carried across
the call and the seeded runtime field is dropped.

## Compile — and the receipt

`compile.js` emits one declaration per node that needs a name, one call per node, the
mount append, and a return. The call dialect is the project's (`specCatalog.emit`:
call prefix, declaration keyword, statement terminator, append method). **Key order is
CATALOG order** — declared entries in their annotation's declaration order, derived
ones alphabetically — because the receipt pins a sha of the emitted bytes, so emission
must be a function of the SPEC and the CATALOG, never of the key order the agent
happened to type.

**The emitted text is checked against `specCatalog.emitBans` BEFORE it is written.** A
compiler able to emit the very shape the gates exist to refuse would be the back door
with a receipt stapled to it. Each ban carries its `why`: a guard whose entries are
unexplained gets loosened by the next author who trips one. An EMPTY ban list is
reported in the compile summary rather than passing silently — "nothing banned" and
"nothing checked" must not look the same.

**Nothing is emitted for a spec that does not validate.** A compiler that emits from
an invalid spec hands the gate a receipt for content the validator would have refused,
which is the layer inverted.

The receipt is machine-written and HMAC'd over `emittedSha + catalogSha` with a
machine-local key. It carries **the emitted bytes themselves**, because the test the
gate performs — *is this added content byte-contained in a compile receipt* — cannot
be performed against a sha of something the gate has not got: `out/*.js` is build
output and may be long gone by the time an Edit arrives.

Write and verify live in ONE home (`receipt.js`), required by both the compiler and
the gate. Two implementations of "is this receipt valid" is exactly where a gate and
its producer drift and the gate quietly starts accepting everything. Three checks,
each closing a specific forgery:

| # | check | what it closes |
|---|---|---|
| 1 | `emittedSha === sha256(emitted)` | editing the bytes and keeping the HMAC |
| 2 | `hmac === HMAC(emittedSha + catalogSha)` | a hand-authored receipt asserting its own validity |
| 3 | `catalogSha === the live catalog` | a receipt compiled against a catalog the code has moved past |

The receipt also carries **`promptBytes`** — the size of the payload in force at
compile time. It is **provenance, not a check**: the payload can be pruned per spawn,
so two receipts against one catalog may legitimately differ, and a compile is never
refused over it. `verify()` ignores the field, so receipts written before it existed
still verify — the three checks are over the bytes, the key and the catalog, and
widening them to a value that decides nothing would invalidate every receipt on disk
for no gain.

**A missing key file fails all three**, which is the correct direction: no key ⇒ no
receipt verifies ⇒ the gate refuses. The gate NEVER mints the key (only the compiler
does) — a gate that can create the secret that satisfies it is not a gate.

## The gate — `hooks/spec-gate.js`

PreToolUse on Edit / Write / MultiEdit. Two rules:

- **R1 `BUILD-TOOLING-STAYS-OUT-OF-THE-APP`** (`specCatalog.appScopeRe`) — a
  `require`/`import` of the vendored packages inside the application scope is refused.
  What crosses into the app is the compiler's OUTPUT, never its dependencies. Empty
  `appScopeRe` ⇒ inert by design; a project with no such boundary is not made to
  invent one.
- **R2 the receipt test** — an in-scope edit that ADDS a new surface (detected by the
  **shared** detector — `machinery.signals`, the new-class shapes — never a second
  one) must be byte-contained in a fresh, HMAC-valid receipt.

**What R2 cannot see, stated rather than implied:** a logic-only edit, and a block of
pure catalog calls. Neither adds new-surface machinery, so neither trips the detector.
That is the layer's THESIS — the backstop finds nothing because there is nothing to
find — not a hole, and the red-fixture proves the receipt is nonetheless DECISIVE by
giving four verdicts to IDENTICAL bytes: no receipt → DENY, forged HMAC → DENY, stale
catalog → DENY, fresh valid receipt → PASS.

If the layer cannot be loaded, **the gate refuses.** A verifier that cannot read its
own receipt library has not found "no violation" — it has found nothing, and reporting
that as a pass is `GATE-FAILS-OPEN` by construction.

The one escape is the operator's own consent token, read from the transcript by the
same `D.hasConsent` every other gate uses, and checked AFTER coverage — so the token
is never the thing that cleared a compiled block. No second escape is minted.

**Order:** register it BEFORE `new-surface-consent` in the Edit/Write chain. Its
refusal names the covering entry, which is the more useful answer; the consent shapes
then adjudicate whatever the operator's token let through.

## The payload — what actually arrives in the builder

`catalog.prompt.md` is rendered from `catalog.json` and preloaded by the builder agent
**instead of a raw ruleset**. That swap is the measured half of this arc: residency as
a cure fails twice over — an oversized injection is filed away undelivered while the
tooling reports success (`GATE-FAILS-OPEN` wearing a success message), and duplicates
accrue anyway during the months a rule is nominally always-on. *Loaded ≠ used.* A rule
in a refusal is a wall; a rule in context is advice.

So the payload is **byte-capped**: `promptTargetBytes` (default 24 KB) and
`promptCeilingBytes` (32 KB). **Over the ceiling is a BUILD FAILURE of the generator**,
not a warning — the whole point is that it arrives.

It is our own renderer, not the vendored `catalog.prompt()`, and that is deliberate:
core's prompt documents the json-render RUNTIME structure — edit modes, actions,
directives, state bindings — i.e. exactly the forms this layer refuses. A payload
teaching them would *manufacture* the refusals the layer exists to remove, and pay
bytes to do it.

### The payload is sectioned, and a caller may prune it

Six section ids, and the default builds all six:

| id | carries |
|---|---|
| `head` | what this payload is + why a spec replaces freehand assembly |
| `rules` | the hard rules the builder is gated on |
| `taskmap` | task → canonical unit (absent when the project declared no task map) |
| `entries` | **the catalog** — every unit a spec may name, with props/tier/owns |
| `format` | the spec shape, the four-form expression subset, "a child mounts itself" |
| `workflow` | the commands, and the compiled worked example |

`node tools/gen-catalog.js --sections entries,format` builds a subset; so does
`require('./tools/gen-catalog.js').buildPrompt(catalog, ['entries', 'format'])`, which
exists so a caller wanting a pruned payload builds one rather than re-implementing the
renderer. `specCatalog.promptPruning` declares whether pruning is allowed at all.

**Which slices a task needs is the caller's decision and is never made here.** Two
rules keep that honest: an **unknown id is a loud failure, not a skip** (a payload
quietly smaller than the one asked for is `GATE-FAILS-OPEN` in payload form), and the
summary line **always reports the sections actually built** — because a pruned payload
and a broken renderer look identical from a byte count alone.

The worked example inside the payload is **COMPILED, never transcribed**
(`specCatalog.exampleSpec`). A transcription cannot be kept true by care; it drifts the
moment the emitter moves, and this is the model's only picture of the output. An
example that fails to validate or compile is a build failure of the payload, never a
silently-omitted section.

## EVERY ARC SHEDS

Adding this layer states what it retires. It retires **the raw-ruleset preload** on
the builder agent (a payload measured in hundreds of kilobytes, replaced by one under
24 KB) and it shrinks the registry's hand-typed task map into a projection of each
entry's `desc`.

It retires **nothing else**. `new-surface-consent`, `grep-required`, `helper-home` and
`canon-block` all STAY, registered after it: they adjudicate what a spec layer
structurally cannot see — the stylesheet itself, the inline-style bypass that carries
no class at all, and any edit the operator's consent token deliberately let through. A
gate whose input class still exists is not retired because a better gate sits in front
of it.

## Adopting it

1. Apply the patches in
   [`spec-catalog.PATCHES.md`](spec-catalog.PATCHES.md) — the `specCatalog` config
   block, the hook registration, the generator wiring, the failure-pattern row, the
   builder brief, and the `module.exports` + `require.main` guard on
   `gen-code-registry.js` (the export that makes the one-scan rule possible).
2. Fill `specCatalog` for your project: `propReadRe` (how your units read options),
   `emit` (how a call is written), `emitBans` (what the compiler may never emit),
   `signalEntry` (which declared hand-roll signal is answered by which unit),
   `gateScopeGlobs` and — if you have one — `appScopeRe`.
3. `node tools/gen-code-registry.js && node tools/gen-catalog.js`, then check the
   counts. **A catalog that reads empty is worse than none** (false confidence); the
   generator says so loudly.
4. Write one spec, validate it, compile it, and set it as `specCatalog.exampleSpec` so
   the payload carries real emitted bytes.
5. Run `node hooks/spec-gate.selftest.js` — and then run it with
   `SPEC_GATE_SELFTEST_NEUTER=1` and watch the red legs go RED. **A gate is known to
   work only once you have built the input it cannot understand and watched it fail.**
6. Annotate units as you touch them. The derived tier is the day-one state, not a
   defect.

Everything is inert until `specCatalog.enabled` — an unadopted project sees exactly
nothing, which is how every gate in this package behaves.
