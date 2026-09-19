<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# spec-catalog — PATCHES for the shared files

The spec-catalog layer ships as new files (`tools/gen-catalog.js`,
`tools/spec-catalog/**`, `hooks/spec-gate.js` + its red-fixture,
`integrations/spec-catalog.md`). Everything it needs from a file **someone else owns**
is collected here, verbatim, with the anchor line it goes after.

**How to apply:** each patch names an ANCHOR (an existing line, quoted exactly) and a
PATCH (the text to insert immediately after it, unless the patch says REPLACE). Apply
byte-for-byte. Nothing here is a suggestion to paraphrase.

**One file needs no patch and it is worth stating why.** `hooks/new-surface-consent.js`
is untouched: its detector and its consent read do not live in that file, they live in
`hooks/lib/detect.js` (`detectSignals` · `newCssClasses` · `hasConsent` · `isExemptFile`
· `newContentOf` · `loadRegistry`, all already exported). `hooks/spec-gate.js` requires
that shared lib directly, so the two gates cannot drift about what counts as a new
surface — which is the whole reason the lib exists. Duplicating the detector into the
new gate would have been `PATCH-NOT-ESCALATED-TO-SHARED` in the act of adding a gate
against it.

---

## 1. `tools/gen-code-registry.js` — the export block (REQUIRED)

Without this the catalog generator refuses to run, loudly, because its alternative is
to scan the codebase a second time — and two scanners drift.

**ANCHOR** (the last line of the file):

```js
main();
```

**PATCH — REPLACE that single line with:**

```js
// ---- module surface (one scan, N projections) -------------------------------
// tools/gen-catalog.js projects this SAME scan into the spec catalog. It must never
// re-scan: a second scanner drifts from this one and then two generated indexes
// disagree about the same codebase. So the scanners are exported and main() runs
// only when this file is the entry point.
module.exports = { scanCode, scanClasses, scanCallers, allCodeFiles, walk, rel,
  CFG, ROOT, OUT, SCAN, CHROME_RE, CHROME_PREFIXES, TASK_MAP, main };

if (require.main === module) main();
```

No scan logic moves. `node tools/gen-code-registry.js` behaves identically.

---

## 2. `stack.config.json` — the `specCatalog` block

Every key carries its default, so this block and §3's row table stay in sync by
construction.

**ANCHOR:**

```json
  "canonBlock": {
    "rules": [],
    "fileTypes": []
  },
```

**PATCH — insert after it:**

```json
  "specCatalog": {
    "_readme": "CONSTRAINT-BEFORE instead of refusal-AFTER (integrations/spec-catalog.md). The code registry is projected into a catalog + a byte-capped prompt; a builder emits a {helper, props, children} spec that can only name catalog entries; compile.js emits real calls + an HMAC receipt; hooks/spec-gate.js refuses a new surface no receipt covers. enabled:false => every piece of this is inert.",
    "enabled": false,
    "catalogDir": "tools/spec-catalog",
    "specDir": "specs/ui-specs",
    "annotationTag": "@catalog",
    "propReadRe": "\\b(?:opts|options|config|props)\\.([A-Za-z_]\\w*)",
    "types": ["element", "string", "number", "bool", "fn", "object", "element[]", "any"],
    "exampleSpec": "",
    "keyFile": "~/.claude/spec-catalog.key",
    "signalEntry": {},
    "sealedShells": [],
    "classPropRe": "(^|[a-z])class(es)?$|^cls|Class(es)?$",
    "emit": { "callPrefix": "", "decl": "var", "fnKeyword": "function", "end": ";", "appendMethod": "appendChild", "quotes": "single", "maxLine": 94 },
    "emitBans": [],
    "appScopeRe": "",
    "gateScopeGlobs": [],
    "taskMap": null,
    "promptTargetBytes": 24576,
    "promptCeilingBytes": 32768,
    "promptPruning": { "enabled": false, "maxSections": 6 },
    "autofixSelector": "distance"
  },
```

The last two are the seams a judgment layer plugs into, and both are **off by
default**. `promptPruning` declares whether a caller may build a SUBSET of the payload
(`gen-catalog.js --sections a,b,c`, or `buildPrompt(catalog, sections)` via the module
API); `autofixSelector` names which selector resolves a name that is outside the
catalog. **The mechanics here are plain parameters** — a section allow-list, and an
injectable `(name, candidates) => chosen|null` — and **no code in this package consults
a judgment layer.** When `autofixSelector` is `judgment`, the selector function is
supplied by the owner of the separate `judgment` block; this layer still enumerates the
candidates, still refuses a pick that is not one of them, and still refuses on a null.
That boundary is the point: code owns what is POSSIBLE, a selector owns only WHICH of
those.

---

## 3. `stack.config.README.md` — the annotated rows

**ANCHOR:**

```md
### `session` — SessionStart regeneration (`session-regenerate.js`)
```

**PATCH — insert BEFORE that line** (i.e. the new section sits between `canonBlock`
and `session`):

```md
### `specCatalog` — constraint-BEFORE (`tools/gen-catalog.js` + `hooks/spec-gate.js`)
Off by default. Turns the code registry into a **catalog** a builder may name from,
plus a byte-capped prompt payload it preloads instead of a raw ruleset. The builder
emits a `{helper, props, children}` spec → `validate.js` → `compile.js` (real calls +
an HMAC'd receipt) → paste. `spec-gate.js` then refuses a new surface no receipt
covers. Full method: `integrations/spec-catalog.md`.
| key | default | meaning |
|---|---|---|
| `enabled` | `false` | Master switch. `false` ⇒ the generator no-ops and the gate exits 0. |
| `catalogDir` | `tools/spec-catalog` | Where `catalog.json`, `catalog.prompt.md`, `out/` and the layer's scripts live. |
| `specDir` | `specs/ui-specs` | Where authored specs live (named in the gate's refusal). |
| `annotationTag` | `@catalog` | The tag that promotes an entry from the *derived* tier to *declared* (prop types, requiredness, slots, desc). |
| `propReadRe` | `\b(?:opts\|options\|config\|props)\.([A-Za-z_]\w*)` | How a unit reads its options IN YOUR LANGUAGE — this is what yields a catalog entry's prop names. |
| `types` | `element,string,number,bool,fn,object,element[],any` | The CLOSED type vocabulary (plus `enum(a\|b\|c)`). A declared type outside it is a BUILD FAILURE, not a warning — an unchecked type token is a prop the gate believes it validated and did not. |
| `exampleSpec` | `""` | A tracked, compiling spec. The payload COMPILES it in (never transcribes it), so the model's picture of the output cannot drift from the emitter. |
| `keyFile` | `~/.claude/spec-catalog.key` | The machine-local HMAC key. Minted by `compile.js`; the gate never mints it — a gate that can create the secret that satisfies it is not a gate. |
| `signalEntry` | `{}` | `{ "<machinery.signals name>": "<the ONE unit that answers it>" }`. When the covering unit is not in doubt, the refusal prints one answer instead of four candidates. |
| `sealedShells` | `[]` | Units that may legitimately be the root of a `mount.kind:"component"` spec. Empty ⇒ that root is UNCHECKED and the validator says so rather than staying silent. |
| `classPropRe` | `(^\|[a-z])class(es)?$\|^cls\|Class(es)?$` | WHICH prop names carry a class. Decided by NAME — a value-shape heuristic would flag every label string you own. |
| `emit` | `{callPrefix,decl,fnKeyword,end,appendMethod,quotes,maxLine}` | How a call is written in your dialect. |
| `emitBans` | `[]` | `[{re, flags, why}]` the compiler may never emit. Checked BEFORE the bytes are written — a compiler able to emit the shape the gates exist to refuse is the back door with a receipt stapled to it. Empty ⇒ reported in the compile summary, because "nothing banned" and "nothing checked" must not look the same. |
| `appScopeRe` | `""` | Application scope for gate rule R1 (build tooling may not be imported there). Empty ⇒ inert. |
| `gateScopeGlobs` | `[]` | R2's scope. Empty ⇒ `source.codeGlobs` + `source.styleFiles`. |
| `taskMap` | `null` | Overrides `codeRegistry.taskMap` for the catalog payload. |
| `promptTargetBytes` / `promptCeilingBytes` | `24576` / `32768` | Over the CEILING is a BUILD FAILURE: an oversized payload is filed away undelivered while the tooling reports success. |
| `promptPruning` | `{"enabled": false, "maxSections": 6}` | Whether a caller may build a SUBSET of the payload. The payload has six sections — `head` · `rules` · `taskmap` · `entries` · `format` · `workflow` — selected with `gen-catalog.js --sections a,b,c` or `buildPrompt(catalog, sections)`. Default builds all six. WHICH slices a task needs is the caller's decision; `gen-catalog.js` has no opinion about it and an unknown id is refused rather than skipped. The summary line always reports the sections actually built — a pruned payload and a broken renderer look identical from a byte count alone. |
| `autofixSelector` | `"distance"` | `distance \| judgment`. Which selector resolves a name outside the catalog. `distance` is the built-in uniqueness gate (one candidate ⇒ that one, else refuse). `judgment` means the selector is supplied by the owner of the separate `judgment` block — `validate.js` calls whatever is injected via `autoFix(spec, {selector})`. Either way the candidates are ENUMERATED BY CODE and exposed as `choices` before anything is chosen, a pick outside that list is REFUSED, a null leaves the ambiguity refusal intact, and an invented name (zero candidates) never reaches a selector at all. |

```

---

## 4. `stack.config.example.frontend.json` — a filled block

**ANCHOR** (the closing of that file's `canonBlock`):

```json
    ]
  },
  "session": {
```

**PATCH — REPLACE those three lines with:**

```json
    ]
  },
  "specCatalog": {
    "enabled": true,
    "catalogDir": "tools/spec-catalog",
    "specDir": "specs/ui-specs",
    "annotationTag": "@catalog",
    "propReadRe": "\\b(?:opts|options|config|props)\\.([A-Za-z_]\\w*)",
    "types": ["element", "string", "number", "bool", "fn", "object", "element[]", "any"],
    "exampleSpec": "specs/ui-specs/panel-rows.json",
    "keyFile": "~/.claude/spec-catalog.key",
    "signalEntry": { "slider-host-hand-roll": "panelBuildSliderHostFromInputs" },
    "sealedShells": ["floatingModuleSkeleton"],
    "classPropRe": "(^|[a-z])class(es)?$|^cls|Class(es)?$|^prefixClasses$",
    "emit": { "callPrefix": "window.", "decl": "var", "fnKeyword": "function", "end": ";", "appendMethod": "appendChild", "quotes": "single", "maxLine": 94 },
    "emitBans": [
      { "re": "createElement\\s*\\(", "why": "createElement — raw DOM assembly is the hand-roll this layer makes inexpressible (HELPER-HAND-ROLL)" },
      { "re": "\\bdocument\\s*\\.", "why": "document.* — the emitted function receives its host and never queries the document" },
      { "re": "innerHTML|outerHTML|insertAdjacentHTML", "why": "innerHTML family — markup by string" },
      { "re": "\\.className\\s*=|classList\\s*\\.", "why": "class writing — a class belongs to the unit that OWNS it, never to emitted glue (NEW-CLASS-WITHOUT-CONSENT)" },
      { "re": "\\bnew\\s+Function\\b", "why": "new Function is forbidden" }
    ],
    "appScopeRe": "/js/",
    "gateScopeGlobs": ["js/**/*.js", "css/app.css"],
    "promptTargetBytes": 24576,
    "promptCeilingBytes": 32768,
    "promptPruning": { "enabled": false, "maxSections": 6 },
    "autofixSelector": "distance"
  },
  "session": {
```

**AND** in the same file's `session.generators`, the catalog must regenerate beside the
registry — a stale catalog makes every fresh receipt read STALE.

**ANCHOR:**

```json
      "node tools/gen-code-registry.js",
```

**PATCH — insert after it:**

```json
      "node tools/gen-catalog.js",
```

---

## 5. `stack.config.example.backend.json` — off, and why

A backend project can adopt the layer (nothing in it is frontend-specific: the class
half is gated on `frontend.enabled`), but the example ships it off so the file keeps
demonstrating the minimum.

**ANCHOR:**

```json
  "session": {
    "generators": ["python tools/gen_code_registry.py", "python tools/gen_changelog.py"],
```

**PATCH — insert BEFORE that block:**

```json
  "specCatalog": {
    "_readme": "OFF here, but adoptable: nothing in this layer is frontend-specific (the class/`owns` half is gated on frontend.enabled). A Python project sets propReadRe to its own options shape (e.g. \\b(?:opts|kwargs|cfg)\\.([A-Za-z_]\\w*)), emit to {callPrefix:'', decl:'', fnKeyword:'def', end:'', appendMethod:'append'}, and emitBans to the raw-assembly shapes its helpers exist to replace. See integrations/spec-catalog.md.",
    "enabled": false
  },
```

---

## 6. `hooks/settings.template.json` — register the gate FIRST

Order matters: the spec-gate's refusal names the covering catalog entry, which is the
more useful answer; the consent shapes then adjudicate whatever the operator's token
let through.

**ANCHOR:**

```json
          { "type": "command", "command": "node \"__HOOKS_DIR__/canon-block.js\"", "timeout": 5, "statusMessage": "canon hard-block..." },
```

**PATCH — insert after it:**

```json
          { "type": "command", "command": "node \"__HOOKS_DIR__/spec-gate.js\"", "timeout": 6, "statusMessage": "spec-catalog gate..." },
```

---

## 7. `hooks/install-hooks.sh` — do not deploy a red-fixture as a hook

`copy_list` takes every `hooks/*.js`, so `spec-gate.selftest.js` would be installed
into the hooks dir and — being a plain script, not a hook — would do nothing while
*looking* deployed. Fixtures stay in the repo and are run from it.

**ANCHOR:**

```sh
  find "$SCRIPT_DIR" -maxdepth 1 -type f \( -name '*.js' -o -name '*.sh' \) ! -name 'install-hooks.sh'
```

**PATCH — REPLACE that line with:**

```sh
  # *.selftest.js are RED-FIXTURES: run from the repo (`node hooks/<gate>.selftest.js`),
  # never deployed. A fixture in the hooks dir is inert but looks installed.
  find "$SCRIPT_DIR" -maxdepth 1 -type f \( -name '*.js' -o -name '*.sh' \) ! -name 'install-hooks.sh' ! -name '*.selftest.js'
```

---

## 8. `hooks/session-regenerate.js` — say the constraint, not just the index

**ANCHOR:**

```js
  if (sess.delegationHint) msg += '\n' + sess.delegationHint;
```

**PATCH — insert BEFORE that line:**

```js
  // spec-catalog (integrations/spec-catalog.md): when the layer is adopted the session
  // is told the CONSTRAINT, not just the index — a builder emits a spec and pastes the
  // compiled block, and an edit adding a new surface with no receipt is REFUSED. Silent
  // when specCatalog.enabled is false, like every other optional piece here.
  const specCat = cfg.specCatalog || {};
  if (specCat.enabled) {
    const cd = specCat.catalogDir || 'tools/spec-catalog';
    msg += '\nSPEC-CATALOG IS ON — do not hand-assemble a new surface. Write ' +
      (specCat.specDir || 'specs/ui-specs') + '/<name>.json, run `node ' + cd +
      '/validate.js` then `node ' + cd + '/compile.js`, and paste the emitted block. An ' +
      'edit that adds a new surface with no compile receipt is REFUSED by spec-gate. The ' +
      'catalog payload (what you may name) is ' + cd + '/catalog.prompt.md.';
  }
```

---

## 9. `agents/builder.template.md` — the spec-first workflow

Ten lines, and they replace a raw-ruleset preload rather than adding to one.

**ANCHOR:**

```md
  Never theorize a measured value — measure it on the running system (`LAYOUT-DERIVED-NOT-MEASURED`).
```

**PATCH — insert after it:**

```md
- **If `specCatalog` is on, you emit a SPEC — you do not assemble a new surface.** Your
  preloaded payload is `{{specCatalog.catalogDir}}/catalog.prompt.md` (the catalog +
  the spec format + the workflow), NOT a raw ruleset: a rule in context is advice, a
  rule in a refusal is a wall, and an oversized preload is filed away undelivered while
  the tooling reports success. The loop is: write `{{specCatalog.specDir}}/<name>.json
  naming only catalog entries → `validate.js` (0 issues; `--fix` is lossless-only) →
  `compile.js` → paste the emitted block verbatim and syntax-check it. A new surface
  with no compile receipt is REFUSED by `spec-gate`. If the capability is genuinely
  absent from the catalog it is NEW — STOP and get express consent; never widen the
  spec by hand-writing the part the catalog would not let you name.
```

The `skills:` preload for a spec-catalog builder is the payload itself — point the
generator that renders it at `{{specCatalog.catalogDir}}/catalog.prompt.md`, and
**delete any raw-ruleset skill it replaces in the same change** (every arc sheds).

---

## 10. `governance/FAILURE-PATTERNS.md` — the row

**ANCHOR** (the end of the `NEW-VOCABULARY-WITHOUT-CONSENT` row — match on its opening
cell, the row is one long line):

```md
| **NEW-VOCABULARY-WITHOUT-CONSENT** |
```

**PATCH — insert the following row immediately after that row's line:**

```md
| **CONSTRAINT-ARRIVES-AFTER-THE-WRITE** | Every anti-hand-roll gate adjudicates code the model has ALREADY produced. The cost is paid three ways: a refusal plus a retry on the honest cases; nothing at all on the case that matters, because an invented unit with a name nobody has used passes a NAME check every time; and an ever-growing ruleset preloaded to prevent what the gate will catch anyway — which, past the harness's output cap, is filed away undelivered while the tooling reports success. Judging output cannot make building deterministic; only bounding the input can. | Project the code registry into a CATALOG and constrain the builder to it: the agent emits a `{helper, props, children}` spec that can only name catalog entries, a validator checks it (lossless-only autofix — a fix applies only when exactly ONE candidate resolves; an invented name is never "fixed"), and a compiler emits the real calls plus an HMAC'd receipt. An edit that ADDS a new surface must be byte-contained in a fresh valid receipt. The freehand path stops being expressible, and the preloaded ruleset is replaced by a byte-capped catalog payload whose ceiling is a build failure, not a warning. | hook (spec-gate, R1 + R2) + generator (gen-catalog) |
```

**AND** — the graduation rule says every arc that adds a gate states what it RETIRES.
This one retires **the raw-ruleset preload on the builder agent** (replaced by a
payload under 24 KB) and shrinks the registry's hand-typed task map into a projection
of each catalog entry's `desc`. It retires **nothing else**: `new-surface-consent`,
`grep-required`, `helper-home` and `canon-block` all stay, registered after it, because
they adjudicate what a spec layer structurally cannot see — the stylesheet itself, the
inline-style bypass that carries no class at all, and any edit the operator's consent
token deliberately let through. *A gate whose input class still exists is not retired
because a better gate sits in front of it.*

---

## 11. `governance/CLAUDE.template.md` — the §Never bullet

**ANCHOR:**

```md
  needs explicit operator consent (`HELPER-HAND-ROLL` / `NEW-VOCABULARY-WITHOUT-CONSENT`).
```

**PATCH — insert after it:**

```md
- Never hand-assemble a new surface when the spec-catalog layer is on — emit a spec, compile
  it, paste the block. A new surface with no compile receipt is refused, and a spec that
  names something the catalog does not contain is the thing you were about to invent
  (`CONSTRAINT-ARRIVES-AFTER-THE-WRITE`).
```

---

## 12. `governance/ROUTING.template.md` — the routing row

**ANCHOR:**

```md
| {{keyword.ui}} (class, token, style, control, chrome, accordion, slider host) | `{{spec.ui}}` + `{{registry.index}}` |
```

**PATCH — insert after it:**

```md
| building a new surface / "which helper do I use" / a spec, catalog, compile receipt, `spec-gate` refusal | `{{specCatalog.catalogDir}}/catalog.prompt.md` (what you may name) + `integrations/spec-catalog.md` (the method) |
```

---

## 13. `governance/ACKNOWLEDGEMENTS.template.md` — the Build Tooling section

A new section, because none of the existing tables is true of it: it is not bundled,
not shipped in the product, and not merely planned.

**ANCHOR** (the last row of the Planned Integration table):

```md
| {{planned.name}} | {{planned.purpose}} | {{planned.license}} | {{planned.status}} |
```

**PATCH — insert after it:**

```md

## Build Tooling (never shipped in the product)

Dependencies of the toolchain, not of the thing you ship. They are vendored rather
than installed so a fresh clone works with no install step, and a gate keeps them out
of the application scope — what crosses into the app is the compiler's OUTPUT, never
its dependencies.

| Library | License |
|---------|---------|
| [json-render](https://github.com/vercel-labs/json-render) — catalog-constrained specification + codegen by Vercel Labs. **`@json-render/core` 0.21.0 + `@json-render/codegen` 0.21.0 vendored** at `tools/spec-catalog/vendor/` (dist + licence; the React / react-native / react-pdf renderers and adapters dropped). This project uses the METHOD — catalog → constrained spec → `validateSpec`/`autoFixSpec` → compile — as the builder-agent constraint layer: an agent emits a `{helper, props, children}` spec that can only name entries derived from the code registry, and `tools/spec-catalog/compile.js` emits real calls into this project's own helpers. Zero json-render code reaches the running product (enforced: `spec-gate` R1). Method of record: `integrations/spec-catalog.md`. | [Apache-2.0](https://github.com/vercel-labs/json-render/blob/main/LICENSE) |
| [zod](https://github.com/colinhacks/zod) — TypeScript-first schema validation by Colin McDonnell. Vendored at `tools/spec-catalog/vendor/zod/` as the required peer of `@json-render/core` (the catalog's prop schemas). Build-tooling only. | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) |
```

---

## 14. `README.md` — the box

**ANCHOR:**

```
tools/         the anti-drift generators: code registry (+ zero-caller orphan
               report), skills/agents deploy, manifest, changelog, citation
               linter — plus work.js, the one flat work list
```

**PATCH — insert after it (inside the same code fence):**

```
               gen-catalog + tools/spec-catalog/: the OPT-IN constraint layer —
               the registry projected into a catalog + a byte-capped builder
               payload, a constrained spec, a compiler, an HMAC'd receipt, and
               the gate that refuses a new surface no receipt covers
```

---

## 15. `AGENTS.md` — the bullet

**ANCHOR:**

```md
- **A new gate ships with its red-fixture** — prove it blocks the input it exists to
  reject, or it is failing open (`GATE-FAILS-OPEN`).
```

**PATCH — insert after it:**

```md
- **Constrain before, don't only refuse after.** Where a surface can be expressed as a
  spec over things the codebase already has, make that the only expressible form: the
  agent names catalog entries, a compiler emits the real calls, and a receipt is what
  the gate checks. See `integrations/spec-catalog.md` (opt-in, `specCatalog.enabled`).
```

---

## 16. `llms.txt` — the line

**ANCHOR:**

```
- [frontend/](https://github.com/LoomA8osAgent/a8-loom-coordinator/blob/master/frontend/README.md): opt-in CSS/DOM module — the design-system-export / satellite-product method (host-first, generated extraction, measured parity). Backend projects ignore it.
```

**PATCH — insert after it:**

```
- [integrations/spec-catalog.md](https://github.com/LoomA8osAgent/a8-loom-coordinator/blob/master/integrations/spec-catalog.md): opt-in constraint layer — constraint BEFORE replaces refusal AFTER. The code registry is projected into a catalog plus a byte-capped prompt the builder preloads instead of a raw ruleset; the builder emits a `{helper, props, children}` spec that can only name catalog entries; a compiler emits the real calls and an HMAC'd receipt; a gate refuses any new surface no receipt covers. Vendored (json-render + zod), so the package keeps zero runtime dependencies.
```

---

## 17. `ENFORCEMENT.md` — the edit-time bullet

**ANCHOR:**

```md
- **helper-home [shipped]** — a raw builder in a non-helper file is blocked unless it
  is exported, composes an existing helper, or is a consented one-off.
```

**PATCH — insert after it:**

```md
- **constraint-before [shipped, opt-in]** — the inversion. Every gate above adjudicates
  code that has already been written; this one makes the freehand path *inexpressible*.
  The code registry is projected into a CATALOG, the builder emits a
  `{helper, props, children}` spec that can only name catalog entries, a compiler emits
  the real calls plus an HMAC'd receipt, and an edit that ADDS a new surface must be
  byte-contained in a fresh valid one. Three details carry the weight: the receipt holds
  the emitted BYTES (a sha of an untracked build artefact is not something the gate can
  check later); write and verify live in ONE file required by both the compiler and the
  gate (two implementations of "is this receipt valid" is where a gate and its producer
  drift apart); and a missing key fails every check, so **no key ⇒ nothing verifies ⇒ the
  gate refuses**, which is the only safe direction. The gate never mints the key — a gate
  that can create the secret that satisfies it is not a gate. It also states what it
  cannot see: a logic-only edit, and a block of pure catalog calls. That is the thesis,
  not a hole — the backstop finds nothing because there is nothing to find — and the
  red-fixture proves the receipt is decisive anyway by giving four verdicts to IDENTICAL
  bytes (absent / forged / stale / valid). See `integrations/spec-catalog.md`.
```

---

## 18. `package.json` — scripts + keywords

**ANCHOR:**

```json
  "scripts": {
```

**PATCH — insert after it:**

```json
    "catalog": "node tools/gen-catalog.js",
    "selftest:spec-gate": "node hooks/spec-gate.selftest.js",
```

**ANCHOR:**

```json
    "deterministic-ai"
```

**PATCH — REPLACE that line with:**

```json
    "deterministic-ai",
    "json-render",
    "constrained-generation",
    "codegen"
```

**AND a packaging note, not a patch.** `files` already covers `tools/`, `hooks/` and
`integrations/`, so the new tree ships as-is. Two things to check on the first `npm
pack` after this lands: (a) npm renames a packed `.gitignore` to `.npmignore`, so
`tools/spec-catalog/out/.gitignore` may not survive — if the published tarball has no
`out/`, the gate reads "no receipts", which is the right answer for the wrong reason;
add `tools/spec-catalog/out/` to `files` or ship a `.keep` instead. (b) the vendored
`zod` tree is ~3.3 MB — deliberate (zero runtime dependencies is the trade), but it
should be a decision someone made rather than one they discovered.

### §18 RESOLVED (2026-09-19) — both answered conservatively, by the judgment lane

Both were left open as *decisions someone should make rather than discover*. Made, and
recorded here beside the question rather than in a commit message:

**(a) `tools/spec-catalog/out/.gitignore` STAYS WHERE IT IS.** No restructure, no
`.keep`, no new `files` entry. The reasoning is the note's own: if npm's `.gitignore` →
`.npmignore` rename means a published tarball carries no `out/`, the installed gate finds
**no receipts** — and *no receipts* is a correct, FAIL-CLOSED verdict that refuses a new
surface. Right answer, wrong reason, and the wrong reason is cheap to fix the day someone
publishes and looks. The expensive direction is the opposite one: a packaging change that
made an empty or stale receipt dir read as coverage. So nothing changes, and the note
stands as the check to run at first `npm pack`. ⚠ **Unmeasured, and stated as such: this
lane ran no `npm pack`.**

**(b) THE ~3.3 MB VENDORED `zod` TREE STAYS AS DELIVERED.** Zero runtime dependencies is
the trade this package already makes everywhere else — a fresh clone works with no install
step, and a gate must never depend on an install having succeeded. Trimming the tree would
fork a dependency for size alone, which is the maintenance debt the library-first rule
exists to avoid. It is recorded with its licence in
`governance/ACKNOWLEDGEMENTS.template.md` §Build Tooling, so it ships as a listed decision
rather than a surprise in a tarball.

---

## APPLICATION STATUS — all 18 applied 2026-09-19

Every patch above is applied byte-for-byte to the shared files. Two of them were applied
WITH an addition by the judgment lane, which owns the sibling `judgment` block, and both
additions sit beside the spec-catalog text rather than modifying it:

- **§2 / §3 / §4 / §5** — the `judgment` config block + its annotated row table + the
  two example-config entries were added alongside `specCatalog`, in the same positions.
- **§6** — `spec-gate.js` registered exactly as specified; `judgment-gate.js` registered
  at three matchers (Edit/Write/MultiEdit, Bash, and a new `Agent|Task` block) AFTER it.
- **§7** — the installer exclusion was widened from `! -name '*.selftest.js'` to also
  exclude `*.example.js` / `*.example.sh`, for the same stated reason: the judgment layer
  ships a roster TEMPLATE and a server launch RECIPE, and a template deployed into the
  hooks dir is inert while looking wired.
- **§10** — the `CONSTRAINT-ARRIVES-AFTER-THE-WRITE` row landed exactly as written; the
  judgment lane added `RULE-LIVES-IN-PROSE-BECAUSE-NO-MATCHER-READS-MEANING` at the end of
  the same table and gave two existing *judgment*-executor rows their new seam ids.
- **§11 / §12 / §13 / §14 / §15 / §16 / §17 / §18** — applied as written, with a judgment
  sibling entry added immediately after each.
