#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// compile.js — spec → real calls into the project's own code.
//
//   node tools/spec-catalog/compile.js <spec.json> [--name <fnName>] [--out <file>]
//                                      [--print] [--json]
//
// Method doc: integrations/spec-catalog.md.
//
// WHAT IT EMITS, and the whole of it: one declaration per node that needs a name, one
// `<callPrefix><unit>({…})` per node, the mount append, and a return. No document
// query, no element construction, no class assignment — whatever the project declared
// in `specCatalog.emitBans`. THE EMITTED TEXT IS CHECKED AGAINST THAT LIST BEFORE IT
// IS WRITTEN (emitGuard): a compiler able to emit the very shape the gates exist to
// refuse would be the back door with a receipt stapled to it.
//
// WHAT THE VENDORED PACKAGES DO HERE: `codegen.traverseSpec` walks the tree (parent
// before child, so a child's `$slot` reference is always already declared) and
// `codegen.serializePropValue` prints literals. The EMITTER is ours — the vendored
// `serializeProps` is JSX-shaped and unusable for an options object.
//
// NOTHING IS EMITTED FOR A SPEC THAT DOES NOT VALIDATE. A compiler that emits from an
// invalid spec hands the gate a receipt for content the validator would have refused,
// which is the layer inverted.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const OUT_DIR = path.join(HERE, 'out');

let codegen;
try { codegen = require(path.join(HERE, 'vendor')).codegen; }
catch (e) {
  console.error('spec-catalog compile: the vendored spec walk is unavailable.\n' +
    (e && e.message) + '\n' +
    'NOTHING is compiled until it is restored — see tools/spec-catalog/VENDORED.md.');
  process.exit(2);
}
const cover = require(path.join(HERE, 'cover.js'));
const validator = require(path.join(HERE, 'validate.js'));
const receiptLib = require(path.join(HERE, 'receipt.js'));

// ---- the emit guard ---------------------------------------------------------
// Rules come from the catalog (specCatalog.emitBans), because what counts as "raw
// assembly" is language- and project-specific. Each entry names WHY: a guard whose
// entries are unexplained gets loosened by the next author who trips one. An EMPTY
// ban list is reported once in the compile summary rather than passing silently —
// "nothing banned" and "nothing checked" must not look the same.
function emitBans() {
  const c = cover.catalogOrNull();
  const raw = (c && c.emitBans) || [];
  const out = [];
  for (const b of raw) {
    try { out.push([new RegExp(b.re, b.flags || ''), b.why || b.re]); } catch (e) { /* skip */ }
  }
  return out;
}
function emitGuard(src) {
  const bad = [];
  // the generated header names tool paths, and a banned word in PROSE is not code —
  // check the BODY only, exactly as the edit gates strip comments before adjudicating
  // (a rule must fire on INTRODUCE, never on READ)
  const body = src.split('\n').filter(l => !/^\s*(\/\/|#)/.test(l)).join('\n');
  for (const [re, why] of emitBans()) if (re.test(body)) bad.push(why);
  return bad;
}

// ---- dialect ----------------------------------------------------------------
// How a call is written is the project's, not this file's.
function dialect() {
  const c = cover.catalogOrNull() || {};
  const d = c.emit || {};
  return {
    callPrefix: d.callPrefix !== undefined ? d.callPrefix : '',
    decl: d.decl || 'var',
    fnKeyword: d.fnKeyword || 'function',
    end: d.end !== undefined ? d.end : ';',
    appendMethod: d.appendMethod || 'appendChild',
    quotes: d.quotes || 'single',
    maxLine: d.maxLine || 94
  };
}

// `panel-rows.json` → `_panelBuildRows`. The first token is the module prefix, the
// rest the subject; `--name` overrides.
function fnNameFor(specPath) {
  const base = path.basename(specPath).replace(/\.json$/i, '');
  const parts = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return '_buildBlock';
  const head = parts[0].toLowerCase();
  const tail = parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join('');
  return '_' + head + 'Build' + (tail || 'Block');
}
function ident(key) {
  const s = String(key).replace(/[^A-Za-z0-9_$]/g, '_');
  return /^[0-9]/.test(s) ? '_' + s : s;
}

function printValue(v, D) {
  const k = validator.refKind(v);
  if (k === '$arg') return ident(v.$arg);
  if (k === '$fn') return ident(v.$fn);
  if (k === '$slot') {
    const ref = String(v.$slot);
    const dot = ref.indexOf('.');
    return ident(ref.slice(0, dot)) + '.' + ref.slice(dot + 1);
  }
  return codegen.serializePropValue(v, { quotes: D.quotes }).value;
}

// Keys in CATALOG order. Deterministic, and that is the point beyond tidiness: the
// receipt pins a sha of the emitted bytes, so emission must be a FUNCTION of the spec
// and the catalog, never of key-insertion order in the JSON the agent happened to
// type. A DECLARED entry emits in its annotation's declaration order (the unit's own
// reading order); a DERIVED entry emits alphabetically, because sorted prop names are
// all that tier has.
function orderedPropKeys(entry, props) {
  const want = (entry.props ? Object.keys(entry.props) : []).concat(entry.propNames || []);
  const seen = new Set(), out = [];
  for (const k of want) {
    if (!seen.has(k) && Object.prototype.hasOwnProperty.call(props, k)) { seen.add(k); out.push(k); }
  }
  for (const k of Object.keys(props)) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}

// ---- compile ----------------------------------------------------------------
function compile(spec, opts) {
  opts = opts || {};
  const cat = cover.catalog();
  const D = dialect();
  const problems = [];
  const elements = spec.elements || {};
  const rootKey = spec.root;
  const mount = spec.mount || {};

  // Which nodes need a name: the root, anything a `$slot` points at, anything with
  // children. Everything else is a bare call, which keeps the block readable.
  const needsVar = new Set([rootKey]);
  for (const k of Object.keys(elements)) {
    const el = elements[k] || {};
    if ((el.children || []).length) needsVar.add(k);
    for (const pk of Object.keys(el.props || {})) {
      if (validator.refKind(el.props[pk]) === '$slot') {
        needsVar.add(String(el.props[pk].$slot).split('.')[0]);
      }
    }
  }

  const args = [], fns = [], order = [];
  codegen.traverseSpec(spec, (el, key) => {
    order.push(key);
    for (const pk of orderedPropKeys(cat.entries[el.type] || { propNames: [] }, el.props || {})) {
      const v = (el.props || {})[pk];
      const k = validator.refKind(v);
      if (k === '$arg' && args.indexOf(v.$arg) === -1) args.push(v.$arg);
      if (k === '$fn' && fns.indexOf(v.$fn) === -1) fns.push(v.$fn);
    }
  });
  // traverseSpec IS the emission order, so an unreachable node would be silently
  // dropped from the output — refusing here keeps the compiler from emitting a block
  // that is quietly smaller than the spec.
  for (const k of Object.keys(elements)) {
    if (order.indexOf(k) === -1) {
      problems.push('element `' + k + '` is not reachable from root `' + rootKey +
        '` — it would be silently dropped from the emitted block');
    }
  }

  const params = [];
  if (mount.kind === 'host' && mount.arg) params.push(ident(mount.arg));
  args.forEach(a => { if (params.indexOf(ident(a)) === -1) params.push(ident(a)); });
  fns.forEach(f => { if (params.indexOf(ident(f)) === -1) params.push(ident(f)); });

  const lines = [];
  const derivedTier = [], helpers = [];
  for (const key of order) {
    const el = elements[key];
    const entry = cat.entries[el.type];
    if (!entry) { problems.push('`' + el.type + '` is not a catalog entry'); continue; }
    if (helpers.indexOf(el.type) === -1) helpers.push(el.type);
    if (entry.tier !== 'declared' && derivedTier.indexOf(el.type) === -1) derivedTier.push(el.type);

    const keys = orderedPropKeys(entry, el.props || {});
    const pairs = keys.map(pk => pk + ': ' + printValue(el.props[pk], D));
    const head = (needsVar.has(key) ? D.decl + ' ' + ident(key) + ' = ' : '') +
      D.callPrefix + el.type + '(';
    const oneLine = head + '{ ' + pairs.join(', ') + ' })' + D.end;
    if (!pairs.length) {
      lines.push('  ' + head + '{})' + D.end);
    } else if (oneLine.length <= D.maxLine) {
      lines.push('  ' + oneLine);
    } else {
      lines.push('  ' + head + '{');
      pairs.forEach((p, i) => lines.push('    ' + p + (i === pairs.length - 1 ? '' : ',')));
      lines.push('  })' + D.end);
    }

    // A CHILD MOUNTS ITSELF, via a `$slot` prop naming its parent. Not a stylistic
    // choice: units take their host as an OPTION, so an append emitted BESIDE that
    // option would either duplicate the mount or fight it — and WHICH return key to
    // append is information the DERIVED tier does not carry. A child that names no
    // parent slot is refused WITH ITS OWN PROP LIST, so the author picks rather than
    // the compiler guessing (LAYOUT-DERIVED-NOT-MEASURED, applied to the emitter).
    for (const ch of (el.children || [])) {
      const cel = elements[ch] || {};
      const mounts = Object.keys(cel.props || {}).some(pk => {
        const v = cel.props[pk];
        return validator.refKind(v) === '$slot' && String(v.$slot).split('.')[0] === key;
      });
      if (!mounts) {
        const ce = cat.entries[cel.type];
        problems.push('`' + ch + '` is a child of `' + key + '` but names no slot of it. Give ' +
          'one of its props {"$slot":"' + key + '.<slotName>"} — ' +
          (ce ? '`' + cel.type + '` reads: ' + (ce.propNames || []).join(', ') : 'unknown unit'));
      }
    }
  }

  const rootEl = elements[rootKey] || {};
  const selfMounts = Object.keys(rootEl.props || {}).some(pk => {
    const v = rootEl.props[pk];
    return validator.refKind(v) === '$arg' && v.$arg === mount.arg;
  });
  if (mount.kind === 'host') {
    if (mount.slot) {
      lines.push('  ' + ident(mount.arg) + '.' + D.appendMethod + '(' + ident(rootKey) + '.' +
        mount.slot + ')' + D.end);
    } else if (!selfMounts) {
      const re = cat.entries[rootEl.type];
      problems.push('mount.kind:"host" needs either mount.slot (WHICH key of `' + rootEl.type +
        '`\'s return is the element to append) or a root prop {"$arg":"' + mount.arg +
        '"} (the root takes the host itself). Read the return at ' +
        (re ? re.file + ':' + re.line : '?') + ' — the compiler will not pick a key for you.');
    }
  }
  lines.push('  return ' + ident(rootKey) + D.end);

  const specSha = crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex');
  const fnName = opts.name || fnNameFor(opts.specPath || 'block.json');
  const relSpec = opts.specPath ? opts.specPath : '(inline)';

  const header = [
    '// GENERATED by tools/spec-catalog/compile.js from ' + relSpec,
    '// catalog: ' + String(cat.sha).slice(0, 12) + ' · spec: ' + specSha.slice(0, 12) +
      (derivedTier.length ? ' · derived-tier: ' + derivedTier.join(', ') : ' · all declared')
  ];
  const body = D.fnKeyword + ' ' + fnName + '(' + params.join(', ') + ') {\n' +
    lines.join('\n') + '\n}\n';

  emitGuard(body).forEach(w => problems.push('EMIT GUARD: the emitted block contains ' + w));

  return { fnName: fnName, params: params, helpers: helpers, derivedTier: derivedTier,
    tier: derivedTier.length ? 'derived' : 'declared', header: header, body: body,
    specSha: specSha, catalogSha: cat.sha, problems: problems, relSpec: relSpec,
    bansChecked: emitBans().length };
}

// ---- the receipt ------------------------------------------------------------
// Machine-written, HMAC'd over emittedSha + catalogSha with a machine-local key. A
// HAND-AUTHORED receipt has no valid HMAC and the gate refuses it; that is the input
// the gate must be PROVEN able to reject (hooks/spec-gate.selftest.js leg b). The
// write/verify pair lives in ./receipt.js — ONE home, required by this file and by
// the gate.
function writeOut(res, opts) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // THE RECEIPT IS NAMED FOR THE BODY, not for the file it describes. The emitted
  // header carries a `// receipt: …` pointer, so the file name cannot be the sha of
  // the bytes that contain it — that is circular, and it is how a verifier ends up
  // checking the wrong artefact. `bodySha` covers the function text alone (stable,
  // computable before the header exists); `emittedSha` is the sha of the bytes
  // actually written, which is what receipt.js check 1 verifies.
  const bodySha = crypto.createHash('sha256').update(res.body).digest('hex');
  const outPath = opts.out ? path.resolve(opts.out)
    : path.join(OUT_DIR, res.fnName.replace(/^_/, '') + '.js');
  const receiptPath = path.join(OUT_DIR, bodySha + '.json');
  const withReceipt = res.header.concat(['// receipt: ' + receiptPath]).join('\n') + '\n' + res.body;
  const finalSha = crypto.createHash('sha256').update(withReceipt).digest('hex');

  const receipt = {
    spec: res.relSpec, specSha: res.specSha, catalogSha: res.catalogSha,
    emittedSha: finalSha, bodySha: bodySha,
    tier: res.tier, derivedTier: res.derivedTier, helpers: res.helpers,
    fn: res.fnName, out: outPath,
    // THE EMITTED TEXT ITSELF. The gate's test — "the added content must be
    // BYTE-CONTAINED in a compile receipt" — cannot be performed against a sha of
    // something the gate has not got: out/*.js is untracked and may be long gone by
    // the time an Edit arrives. So the bytes live in the receipt, and the HMAC over
    // emittedSha binds them (edit the text, the sha moves, the HMAC fails).
    emitted: withReceipt,
    // PROVENANCE, not a check (receipt.js `promptBytes`): the size of the catalog
    // payload in force at compile time. The payload may be PRUNED per spawn, so this
    // records what the builder was actually looking at when it wrote the spec — the
    // one fact about a compiled block that is otherwise unrecoverable afterwards.
    // verify() ignores it, so receipts written before the field existed still verify.
    promptBytes: receiptLib.promptBytes(),
    written: new Date().toISOString(),
    hmac: receiptLib.hmacOf(finalSha, res.catalogSha)
  };
  fs.writeFileSync(outPath, withReceipt);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  return { outPath: outPath, receiptPath: receiptPath, receipt: receipt, emitted: withReceipt };
}

module.exports = { compile, writeOut, emitGuard, emitBans, fnNameFor, dialect,
  OUT_DIR, KEY_PATH: receiptLib.KEY_PATH };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (flag) => { const i = argv.indexOf(flag); return i !== -1 && argv[i + 1] ? argv[i + 1] : null; };
  const file = argv.find((a, i) => a[0] !== '-' && argv[i - 1] !== '--name' && argv[i - 1] !== '--out');
  if (!file) {
    console.error('usage: node tools/spec-catalog/compile.js <spec.json> [--name <fn>] ' +
      '[--out <file>] [--print] [--json]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  let spec;
  try { spec = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { console.error('cannot read spec: ' + (e && e.message)); process.exit(2); }

  const v = validator.validate(spec);
  if (!v.ok) {
    console.error('compile REFUSED — the spec does not validate (' + v.errors + ' error(s)):');
    console.error(validator.formatIssues(v.issues));
    process.exit(1);
  }

  const res = compile(spec, { specPath: abs, name: arg('--name') });
  if (res.problems.length) {
    console.error('compile REFUSED — ' + res.problems.length + ' problem(s):');
    res.problems.forEach(p => console.error('  · ' + p));
    process.exit(1);
  }

  if (argv.indexOf('--print') !== -1) {
    process.stdout.write(res.header.join('\n') + '\n' + res.body);
    process.exit(0);
  }

  const w = writeOut(res, { out: arg('--out') });
  if (argv.indexOf('--json') !== -1) {
    console.log(JSON.stringify(w.receipt, null, 2));
  } else {
    console.log('spec:     ' + res.relSpec);
    console.log('fn:       ' + res.fnName + '(' + res.params.join(', ') + ')');
    console.log('units:    ' + res.helpers.join(', ') + '   tier: ' + res.tier +
      (res.derivedTier.length ? '  (derived: ' + res.derivedTier.join(', ') + ')' : ''));
    console.log('emitted:  ' + w.outPath + '   (' + w.emitted.length + ' bytes, sha ' +
      w.receipt.emittedSha.slice(0, 12) + ')');
    console.log('receipt:  ' + w.receiptPath + '   catalog ' + res.catalogSha.slice(0, 12) +
      '  hmac ' + w.receipt.hmac.slice(0, 12) + '  promptBytes ' + w.receipt.promptBytes);
    if (!res.bansChecked) {
      console.log('emit guard: NO bans declared (specCatalog.emitBans is empty) — the emitted ' +
        'text was NOT checked. "Nothing banned" and "nothing checked" must not look the same.');
    }
    if (v.notes && v.notes.length) {
      console.log('derived-tier notes:');
      v.notes.forEach(n => console.log('  · ' + n.message));
    }
  }
}
