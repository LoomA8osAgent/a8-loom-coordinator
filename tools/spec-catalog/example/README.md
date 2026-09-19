<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# example/ — the spec-catalog's own corpus

A red-fixture needs a catalog, and a catalog needs code. This directory is a
deliberately tiny stand-in codebase so the whole layer — generator, validator,
compiler, receipt, gate — is **runnable and falsifiable on a fresh clone**, with no
host project required.

```
stack.config.json          governs THIS directory only (repoRoot "", catalogDir "..")
src/chrome.js              3 units: 2 annotated (declared tier), 1 not (derived tier)
src/panel.js               a CONSUMER, so the zero-caller orphan report says something true
src/app.css                7 classes, so `owns` has something to resolve against
specs/ui-specs/panel-rows.json   the worked spec (also the payload's compiled example)
CODE-REGISTRY.md           generated
```

## Run it

```bash
node tools/gen-code-registry.js --config tools/spec-catalog/example/stack.config.json
node tools/gen-catalog.js       --config tools/spec-catalog/example/stack.config.json
node tools/spec-catalog/validate.js tools/spec-catalog/example/specs/ui-specs/panel-rows.json
node tools/spec-catalog/compile.js  tools/spec-catalog/example/specs/ui-specs/panel-rows.json
node hooks/spec-gate.selftest.js
```

The generators write `tools/spec-catalog/catalog.json` + `catalog.prompt.md` (the
`catalogDir: ".."` in the config), which is why the package ships a catalog at all: it
is **this example's**, and a real project overwrites it on its first `gen-catalog` run.

## What each piece is demonstrating

- **Two tiers in one corpus.** `buildSection` and `buildRowHostFromItems` carry
  `@catalog` blocks, so their prop TYPES, requiredness and SLOTS are enforced;
  `buildDotsPair` carries none, so only its name and its option names are. Both code
  paths are live, which is the point — a project adopts the layer without annotating
  anything first.
- **A declared slot that is `none`.** `buildRowHostFromItems` takes its rows from
  `items`, never from children, and says so. A child trying to mount into it is
  refused by name rather than discovered at runtime.
- **`owns`.** `.ex-param-row` and `.is-readonly` are written by the unit, so the
  compiler emits them and a spec may never name them — which is why the gate's
  refusal can say *"the compiler writes these; you never do"* instead of *"unknown
  class"*.
- **A signal that names its entry.** `machinery.signals` declares the row-host
  hand-roll shape and `specCatalog.signalEntry` maps it to the ONE unit that answers
  it, so the refusal prints one answer instead of four candidates. A refusal is read
  once, under pressure; burying the answer in candidates is how a wall becomes
  wallpaper.
- **`emitBans`.** The example's substrate is ES5-with-no-DOM-assembly, so the compiler
  refuses to emit `createElement`, `document.*`, `className`, arrows or `const`/`let`.
  A compiler able to emit the very shape the gates exist to refuse would be the back
  door with a receipt stapled to it.

## It is a fixture, not a library

Nothing here is meant to be used. `src/chrome.js` builds DOM by hand on purpose: it is
standing in for the units your project already has, and those are what the catalog
indexes. Point `stack.config.json` at your own code and the layer indexes that instead.
