#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
// (This resolver is the ONE package-authored file in vendor/; everything beside it
//  is verbatim upstream. See VENDORED.md.)
//
// vendor/index.js — the vendor resolver.
//
// This package ships NO node_modules and has no runtime dependencies: the hooks and
// tools are dependency-free, and the spec-catalog's three packages are VENDORED here
// so the layer works on a fresh clone with no install step. Their dist bytes are
// verbatim upstream, so `@json-render/core`'s own `require("zod")` has nothing to
// resolve against in a flat vendor/ layout.
//
// Rather than patch a vendored byte (which would make VENDORED.md's "verbatim" claim
// false and turn every future re-vendor into a merge), this file installs ONE
// bare-specifier map on Module._resolveFilename before requiring the packages. Only
// the three specifiers of the measured dependency closure are mapped; anything else
// falls through to node's own resolution untouched.
//
//   const { core, codegen, zod } = require('./vendor');     // from tools/spec-catalog/
//
// Closure, read off the vendored package.json files and walked to fixpoint:
//   @json-render/core     0.21.0  deps { zod: ^4.3.6 }  peer { zod: ^4.0.0 }
//   @json-render/codegen  0.21.0  deps { @json-render/core: 0.21.0 }
//   zod                   4.3.6   deps { }                          ← closes here
//
// ABSENT VENDOR IS A LOUD FAILURE, never a silent degrade: require() throws with the
// re-vendor instruction attached (VENDORED.md §Re-vendoring). A validator that
// "passes" because it could not load its validators is GATE-FAILS-OPEN.

'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');

const HERE = __dirname;
const MAP = {
  '@json-render/core': path.join(HERE, 'json-render-core'),
  '@json-render/codegen': path.join(HERE, 'json-render-codegen'),
  'zod': path.join(HERE, 'zod')
};

const missing = Object.keys(MAP).filter(k => !fs.existsSync(path.join(MAP[k], 'package.json')));
if (missing.length) {
  throw new Error(
    'spec-catalog vendor is INCOMPLETE — missing: ' + missing.join(', ') + '\n' +
    'Expected under ' + HERE + '.\n' +
    'This package ships no node_modules; the three packages are vendored. Restore them\n' +
    'per tools/spec-catalog/VENDORED.md §Re-vendoring (fetch the registry tarballs, keep\n' +
    'dist/ + package.json + LICENSE, drop *.map, record the sha256s).\n' +
    'Nothing downstream may proceed: a validator that cannot load its validators must\n' +
    'REFUSE, never report "no issues" (GATE-FAILS-OPEN).');
}

if (!Module._specCatalogVendorPatched) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    for (const spec of Object.keys(MAP)) {
      if (request === spec) return orig.call(this, MAP[spec], parent, isMain, options);
      if (request.indexOf(spec + '/') === 0) {
        return orig.call(this, path.join(MAP[spec], request.slice(spec.length + 1)),
          parent, isMain, options);
      }
    }
    return orig.call(this, request, parent, isMain, options);
  };
  Module._specCatalogVendorPatched = true;
}

const core = require('@json-render/core');
const codegen = require('@json-render/codegen');
const zod = require('zod');

module.exports = { core: core, codegen: codegen, zod: zod, VENDOR_DIR: HERE };

if (require.main === module) {
  console.log('core:    ' + Object.keys(core).length + ' exports');
  console.log('codegen: ' + Object.keys(codegen).sort().join(', '));
  console.log('zod:     ' + (zod.z ? 'z present' : 'NO z') +
    ' · version ' + require(path.join(HERE, 'zod', 'package.json')).version);
}
