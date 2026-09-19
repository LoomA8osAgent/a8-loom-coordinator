<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# json-render + zod — VENDORED (build tooling only)

Method doc: [`integrations/spec-catalog.md`](../../integrations/spec-catalog.md).

- **What:** the spec-catalog layer takes the [json-render](https://github.com/vercel-labs/json-render)
  **method** — catalog → constrained spec → `validateSpec` / `autoFixSpec` → compile —
  and its **validators and spec walk**. It never takes a renderer.
- **Fetched:** 2026-09-19, from the npm registry tarballs (`dist.tarball` off
  `https://registry.npmjs.org/<pkg>/<version>`). No `npm install`, no lockfile, no
  `node_modules` — this package has **zero runtime dependencies** and must keep them,
  so everything the tooling needs is vendored or dependency-free.
- **Where it may be required:** `tools/spec-catalog/**` only. The compiler's OUTPUT is
  plain calls into the host project's own code; no vendored byte reaches a running
  application. When `specCatalog.appScopeRe` is set, `hooks/spec-gate.js` rule R1
  REFUSES a `require`/`import` of these packages inside the application scope, and its
  red-fixture proves the refusal.

## Versions + provenance

| package | version | tarball sha256 | license | upstream |
|---|---|---|---|---|
| `@json-render/core` | 0.21.0 | `0b002467614c0ade41e18ef6b15c116e9cf41fbe44cd49c6d93a49fe5adf73e6` | Apache-2.0 | https://github.com/vercel-labs/json-render (`packages/core`) |
| `@json-render/codegen` | 0.21.0 | `292e7873392ea177800b88d34129c01f58b9d8f2f0da253fe4479b668626ce2f` | Apache-2.0 | https://github.com/vercel-labs/json-render (`packages/codegen`) |
| `zod` | 4.3.6 | `29ee4d2418c0fb6ddc545c28c03ec80b701e345a3f779e50ae23cda0700b1682` | MIT | https://github.com/colinhacks/zod |

Licences vendored verbatim beside the packages: `vendor/LICENSE-json-render`
(Apache-2.0, from the `@json-render/core` tarball root) · `vendor/LICENSE-zod` (MIT).

## The dependency closure — computed, not assumed

Read off each vendored `package.json`, walked to fixpoint:

```
@json-render/core     0.21.0   dependencies { "zod": "^4.3.6" }   peerDependencies { "zod": "^4.0.0" }
@json-render/codegen  0.21.0   dependencies { "@json-render/core": "0.21.0" }
zod                   4.3.6    dependencies { }                  ← closes here
```

Three packages, nothing beyond `core` + `codegen` + `zod`. Measured, not inferred: the
only bare `require()` in either vendored CJS bundle is `require("zod")` in
`json-render-core/dist/index.js`; `json-render-codegen/dist/index.js` carries **no
runtime require at all** (`traverseSpec` / `collectUsedComponents` / `collectStatePaths`
/ `collectActions` / `serializePropValue` / `escapeString` / `serializeProps` are pure
functions over a plain spec object). `zod` 4.3.6 is pinned exactly — it satisfies
core's `^4.3.6` dependency and its `^4.0.0` peer.

## Layout, and what was dropped

```
vendor/
  index.js                 the resolver (package-authored — see below)
  json-render-core/        package.json + dist/
  json-render-codegen/     package.json + dist/
  zod/                     package.json + index.{js,cjs,d.ts,d.cts} + v3/ v4/ mini/ v4-mini/ locales/
  LICENSE-json-render      Apache-2.0, verbatim
  LICENSE-zod              MIT, verbatim
```

Kept bytes are **verbatim upstream** — no vendored file is patched. Dropped:

- **`*.map` source maps** (all three packages) — they reference `src/` trees that are
  not vendored, so they resolve to nothing; ~0.8 MB of dead weight.
- **`README.md`** of each package (docs; the method is specified in
  `integrations/spec-catalog.md`, which is the doc of record).
- **`zod/src/`** (~2.7 MB of TypeScript sources; the published JS under `v3/` `v4/`
  `mini/` `v4-mini/` `locales/` is what `require('zod')` loads).
- The upstream monorepo's **React / react-native / react-pdf renderers, adapters and
  playground** were never in these two tarballs and are not vendored — this layer takes
  the validators and the walk, never a renderer.

Both json-render packages publish dual CJS/ESM (`"require": "./dist/index.js"`), so
plain CJS `require()` from node tooling works with no build step and no loader flags.

## The resolver (`vendor/index.js`) — the one package-authored file here

With a flat `vendor/` layout and no `node_modules`, core's own `require("zod")` has
nothing to resolve against. Two ways out: patch the vendored byte, or map the
specifier. Patching would make "verbatim" false and turn every future re-vendor into a
merge — so `vendor/index.js` installs ONE bare-specifier map on
`Module._resolveFilename` covering exactly the three closure specifiers (plus their
subpath forms) and falls through to node's own resolution for everything else. It also
**throws with the re-vendor instruction** when a package is absent, rather than
degrading: a validator that cannot load its validators must refuse, never report "no
issues" (`GATE-FAILS-OPEN`).

Consumers do:

```js
const { core, codegen, zod } = require('./vendor');
```

Self-check (re-runnable — this is the vendoring proof):

```
$ node tools/spec-catalog/vendor/index.js
core:    73 exports
codegen: collectActions, collectStatePaths, collectUsedComponents, escapeString, serializePropValue, serializeProps, traverseSpec
zod:     z present · version 4.3.6
```

`core` exposes the four the method needs by name — `defineCatalog` · `validateSpec` ·
`autoFixSpec` · `formatSpecIssues`.

## What each package supplies vs what this package writes

| `@json-render/codegen` supplies | `@json-render/core` supplies | this package writes |
|---|---|---|
| `traverseSpec` (depth-first walk, parent before child) | `validateSpec` (dangling children / dangling slot refs / malformed forms) | the emitter (call syntax, dialect, mount append) |
| `collectUsedComponents` (the unit set → catalog-membership check) | `autoFixSpec` + `fixDetails` lossy/lossless classification | `validateAgainstCatalog` (name / prop / type / class / slot) |
| `collectStatePaths`, `collectActions` — used as **refusal detectors**: a non-empty set means the spec reached for an excluded runtime form | `formatSpecIssues` | the object-literal printer, `cover.js`, the receipt |

## Re-vendoring

```bash
curl -s https://registry.npmjs.org/@json-render/core/0.21.0 \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).dist.tarball))"
```

Fetch each tarball, `shasum -a 256` it, `tar xz`, copy `package.json` + `dist/` into
`vendor/<pkg>/`, delete `*.map`, re-walk the `dependencies` of every vendored
`package.json` to fixpoint, and update the version + sha256 table above. If the closure
grows, the new package is vendored beside these and listed here — **an unlisted
transitive dependency is the failure this section exists to prevent.**
