#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// validate.js — the two-pass validator + the lossless-only fixer.
//
//   node tools/spec-catalog/validate.js <spec.json> [--fix [--write]] [--json]
//
// Method doc: integrations/spec-catalog.md.
//
// PASS 1 is the VENDORED core's (`validateSpec`) plus the REFUSAL DETECTORS: a spec
// that reached for a runtime feature of a state model this project does not have
// ($state / $bindState / $bindItem / $computed / repeat / watch / visible / on) is
// REFUSED, never fixed. A second state model beside the project's real one is a
// duplication failure by construction (STATE-NOT-PERSISTED · PERSISTENCE-HOLE).
//
// PASS 2 is ours: every `type` is a catalog entry, every prop key is one the unit
// actually reads, every `$slot` names a node that exists and (declared tier) a slot
// that unit declares, every class-valued string is a class the scan knows or the
// RECEIVING unit owns. An issue NAMES THE ENTRY THAT COVERS THE NEED (via ./cover.js,
// shared with the gate's refusal) — "that unit does not exist" is a true and useless
// answer.
//
// THE CANDIDATES ARE ENUMERATED BY CODE, AND THE PICK IS A SEPARATE STEP.
// `autoFix(spec, { selector })` returns `choices` — `{kind, at, name, arm, candidates}`
// per unresolved name — built BEFORE anything is chosen, and the injected selector
// `(name, candidates) => chosen|null` picks among exactly that list. Default:
// `defaultSelector`, the uniqueness gate (one candidate ⇒ that one, else null). A
// selector that returns a name OUTSIDE the list is refused — code owns what is
// possible, a selector owns only which of those — and returning null leaves the
// ambiguity refusal untouched, every candidate named.
//
// THE FIXER IS LOSSLESS-ONLY, and that is the whole of its discipline:
// autoFixSpec(spec, {lossy:false}) relocates misplaced fields; pruning a dangling
// child would silently delete work the agent meant to build. On top of it ONE fixer —
// the near-miss name repair — applied ONLY when exactly one candidate resolves. Two
// candidates ⇒ REFUSE with both named. An INVENTED name is never fixed: there is
// nothing to fix it to, and inventing a target is how a lossy fix gets called lossless.
//
// NO node_modules: if tools/spec-catalog/vendor/ is absent this file FAILS LOUDLY with
// the re-vendor instruction (VENDORED.md §Re-vendoring). A validator that reports "no
// issues" because it could not load its validators is GATE-FAILS-OPEN.

'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
let core, codegen, zod;
try {
  const V = require(path.join(HERE, 'vendor'));
  core = V.core; codegen = V.codegen; zod = V.zod;
} catch (e) {
  console.error('spec-catalog validate: the vendored validators are unavailable.\n' +
    (e && e.message) + '\n' +
    'NOTHING is validated until they are restored — see tools/spec-catalog/VENDORED.md.');
  process.exit(2);
}
const z = zod.z || zod;
const cover = require(path.join(HERE, 'cover.js'));

// ---- the excluded expression forms ------------------------------------------
// Refused, not fixed. Two detectors, because the forms arrive two ways: as a PROP
// value ({"$state":"x"} inside props) and as an ELEMENT field (repeat/watch/visible
// beside `type`). The vendored collectStatePaths / collectActions are used as REFUSAL
// DETECTORS — a non-empty set means an excluded form was used.
const EXCLUDED_PROP_FORMS = ['$state', '$bindState', '$bindItem', '$computed'];
const EXCLUDED_ELEMENT_FIELDS = ['repeat', 'watch', 'visible', 'on'];
const ALLOWED_PROP_FORMS = ['$arg', '$fn', '$slot'];

function refKind(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const k = Object.keys(v);
  if (k.length !== 1) return null;
  return ALLOWED_PROP_FORMS.indexOf(k[0]) !== -1 ? k[0] : null;
}

// ---- the zod layer, built from the catalog at runtime -----------------------
// Built here rather than emitted as a generated file: the tables come straight out of
// catalog.json, so a new annotation block becomes a real type check by re-running
// `gen-catalog.js` and nothing else — one artefact fewer to keep in sync.
const argRef = z.object({ $arg: z.string() }).strict();
const fnRef = z.object({ $fn: z.string() }).strict();
const slotRef = z.object({ $slot: z.string().regex(/^[A-Za-z_]\w*\.[A-Za-z_]\w*$/) }).strict();
const ref = z.union([argRef, fnRef, slotRef]);
const literal = z.union([z.string(), z.number(), z.boolean(), z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean()]))]);

// type token → the value schema a DECLARED prop accepts. A ref form is ALWAYS allowed
// in its place: the caller owns the value, which is the point of the expression subset.
const TYPE_SCHEMA = {
  element: ref,
  'element[]': z.union([ref, z.array(ref)]),
  fn: fnRef,
  object: z.union([ref, z.record(z.string(), z.unknown())]),
  string: z.union([ref, z.string()]),
  number: z.union([ref, z.number()]),
  bool: z.union([ref, z.boolean()]),
  any: z.union([ref, literal, z.array(z.unknown()), z.record(z.string(), z.unknown())])
};
function typeSchema(t) {
  const m = /^enum\(([^)]+)\)$/.exec(String(t));
  if (m) return z.union([ref, z.enum(m[1].split('|').map(s => s.trim()))]);
  // a project-declared type token outside the built-in set validates as `any` — it is
  // in specCatalog.types (gen-catalog refuses one that is not), so it is a deliberate
  // domain alias whose shape only that project knows
  return TYPE_SCHEMA[t] || TYPE_SCHEMA.any;
}

const elementSchema = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()).optional(),
  children: z.array(z.string()).optional()
}).strict();
const specSchema = z.object({
  // `slot` — WHICH KEY of the root unit's return is the element to append into `arg`.
  // Optional, because a root that takes the host as a PROP mounts itself and has
  // nothing to append; a root with NEITHER is refused rather than guessed at, which
  // would be LAYOUT-DERIVED-NOT-MEASURED in the emitter.
  mount: z.object({
    kind: z.enum(['host', 'component']),
    arg: z.string(),
    slot: z.string().optional()
  }).strict(),
  root: z.string(),
  elements: z.record(z.string(), elementSchema)
}).strict();

// ---- class-valued props -----------------------------------------------------
// WHICH props carry a class name is a naming question, and the honest answer is "the
// ones whose NAME says so". A value-shape heuristic ("looks like a class") would flag
// every label string in the project, so the NAME is the gate. Projects widen it via
// specCatalog.classPropRe.
function classPropRe() {
  const c = cover.catalogOrNull();
  const src = (c && c.classPropRe) || '(^|[a-z])class(es)?$|^cls|Class(es)?$';
  try { return new RegExp(src); } catch (e) { return /(^|[a-z])class(es)?$/; }
}
function classTokens(val) {
  if (typeof val !== 'string') return [];
  return val.trim().split(/\s+/).filter(Boolean).map(t => t.replace(/^\./, ''));
}

function issue(severity, code, elementKey, message, detail) {
  return { severity: severity, code: code, elementKey: elementKey || null,
    message: message, detail: detail || null };
}

// ---- PASS 2 -----------------------------------------------------------------
function validateAgainstCatalog(spec) {
  const issues = [], notes = [];
  const cat = cover.catalogOrNull();
  if (!cat) {
    issues.push(issue('error', 'catalog_unreadable', null,
      'tools/spec-catalog/catalog.json could not be read — run `node tools/gen-catalog.js`. ' +
      'A validator that cannot read its catalog may not report "valid" (GATE-FAILS-OPEN).'));
    return { issues: issues, notes: notes };
  }
  const CLASS_PROP_RE = classPropRe();
  const feOn = !!cat.frontend;
  const elements = (spec && spec.elements) || {};
  const helperPool = cover.helperNames();

  const mount = (spec && spec.mount) || null;
  if (!mount || !mount.kind || !mount.arg) {
    issues.push(issue('error', 'mount_missing', null,
      'spec.mount must be {kind:"host"|"component", arg:"<name>"[, slot:"<returnKey>"]}'));
  }
  // A component mount rides a SEALED shell, never a hand-built root: a standalone
  // surface assembled out of classes without its real host chain is
  // STRIPPED-SHELL-HOST-MISMATCH, and this catches it at spec time instead of after a
  // styling grind. The project declares its sealed shells in specCatalog.sealedShells;
  // an empty list means the project has none and the check is inert (stated, not silent).
  if (mount && mount.kind === 'component') {
    const sealed = cat.sealedShells || [];
    const rootType = elements[spec.root] && elements[spec.root].type;
    if (sealed.length && sealed.indexOf(rootType) === -1) {
      issues.push(issue('error', 'component_root_not_sealed', spec.root,
        'mount.kind:"component" requires the root to be a SEALED shell (' + sealed.join(' / ') +
        '); got ' + JSON.stringify(rootType) + '. A hand-built root is ' +
        'STRIPPED-SHELL-HOST-MISMATCH caught at spec time.'));
    } else if (!sealed.length) {
      notes.push(issue('note', 'sealed_shells_undeclared', spec.root,
        'specCatalog.sealedShells is empty, so mount.kind:"component" roots are UNCHECKED. ' +
        'Declare the shells that legitimately mint a component — an unchecked root is a ' +
        'check this layer would otherwise be believed to perform.'));
    }
  }

  for (const key of Object.keys(elements)) {
    const el = elements[key] || {};

    for (const f of EXCLUDED_ELEMENT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(el, f)) {
        issues.push(issue('error', 'excluded_form', key,
          '`' + f + '` is a runtime feature of a state model this project does not have — ' +
          'REFUSED, not fixed. Application state lives in the project\'s own store and its ' +
          'persistence walk; a second state model beside it is a duplication failure.'));
      }
    }

    const t = el.type;
    if (typeof t !== 'string' || !t) {
      issues.push(issue('error', 'type_missing', key, 'element has no `type`'));
      continue;
    }
    const entry = cat.entries[t];
    if (!entry) {
      const r = cover.resolveName(t, helperPool);
      issues.push(issue('error', 'unknown_helper', key,
        '`' + t + '` is not a catalog entry' +
        (r.unique ? ' — unique near-miss [' + r.arm + ']: `' + r.unique + '` (autofix repairs this)'
          : r.candidates.length
            ? ' — ' + r.candidates.length + ' candidates [' + r.arm + ']: ' +
              r.candidates.join(', ') + ' — REFUSED, not fixed'
            : ' and nothing in the catalog resolves to it'),
        cover.renderCover(cover.coverFor({ name: t, text: t }), '      ')));
      continue;
    }

    const props = el.props || {};
    const declared = entry.props || null;
    const knownProps = new Set((entry.propNames || []).concat(declared ? Object.keys(declared) : []));

    for (const pk of Object.keys(props)) {
      const v = props[pk];

      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const bad of EXCLUDED_PROP_FORMS) {
          if (Object.prototype.hasOwnProperty.call(v, bad)) {
            issues.push(issue('error', 'excluded_form', key,
              'prop `' + pk + '` uses `' + bad + '` — a runtime state form. REFUSED, not fixed. ' +
              'The four legal forms are a literal, {"$arg":…}, {"$fn":…}, {"$slot":"key.slotName"}.'));
          }
        }
      }

      if (!knownProps.has(pk)) {
        const r = cover.resolveName(pk, [...knownProps]);
        issues.push(issue('error', 'unknown_prop', key,
          '`' + t + '` does not read an option named `' + pk + '` (' + entry.file + ':' +
          entry.line + ')' +
          (r.unique ? ' — unique near-miss [' + r.arm + ']: `' + r.unique + '`'
            : r.candidates.length ? ' — candidates [' + r.arm + ']: ' + r.candidates.join(', ') : ''),
          cover.formatEntry(t, '      ')));
        continue;
      }

      if (declared && declared[pk]) {
        const res = typeSchema(declared[pk].type).safeParse(v);
        if (!res.success) {
          issues.push(issue('error', 'prop_type', key,
            'prop `' + pk + '` must be ' + declared[pk].type + ' (or a $arg/$fn/$slot ref): ' +
            (res.error && res.error.issues && res.error.issues[0]
              ? res.error.issues[0].message : 'type mismatch')));
        }
      }

      if (refKind(v) === '$slot') {
        const sref = String(v.$slot);
        const dot = sref.indexOf('.');
        const parentKey = dot === -1 ? sref : sref.slice(0, dot);
        const slotName = dot === -1 ? '' : sref.slice(dot + 1);
        if (!slotName) {
          issues.push(issue('error', 'slot_malformed', key,
            'prop `' + pk + '`: {"$slot":"' + sref + '"} must be "<elementKey>.<slotName>"'));
        } else if (!elements[parentKey]) {
          issues.push(issue('error', 'slot_dangling', key,
            'prop `' + pk + '`: {"$slot":"' + sref + '"} names element `' + parentKey +
            '`, which is not in spec.elements'));
        } else {
          const pEntry = cat.entries[elements[parentKey].type];
          if (pEntry && pEntry.slots) {
            if (pEntry.slots.indexOf(slotName) === -1) {
              issues.push(issue('error', 'slot_unknown', key,
                'prop `' + pk + '`: `' + elements[parentKey].type + '` declares slots [' +
                pEntry.slots.join(', ') + '] and not `' + slotName + '`',
                cover.formatEntry(elements[parentKey].type, '      ')));
            }
          } else if (pEntry) {
            // The DERIVED tier cannot check a slot NAME, and the disclosure's home is
            // the compile receipt, not the issue list: a valid spec must report 0
            // ISSUES or the count stops meaning anything. It is still SAID — silence
            // would be a check the layer believes it performed and did not.
            notes.push(issue('note', 'slot_derived_tier', key,
              'prop `' + pk + '`: `' + elements[parentKey].type + '` is DERIVED tier (no ' +
              'annotation block) so slot `' + slotName + '` is UNCHECKED — read its return at ' +
              pEntry.file + ':' + pEntry.line + '. Annotating it turns this into a real check.'));
          }
        }
      }

      // A class named in a spec must already exist, or be OWNED by the unit RECEIVING
      // it — the unit HANDED a class is the one that writes it, and the parent may not
      // even be in the same subtree.
      if (feOn && CLASS_PROP_RE.test(pk)) {
        const vals = Array.isArray(v) ? v : [v];
        for (const one of vals) {
          for (const c of classTokens(one)) {
            const cc = cover.classCover(c);
            const ownedHere = (entry.owns || []).indexOf(c) !== -1 ||
              (entry.ownsConcat || []).indexOf(c) !== -1;
            if (cc.known || ownedHere) continue;
            issues.push(issue('error', 'unknown_class', key,
              'prop `' + pk + '` names class `.' + c + '`, which is neither in the scan nor ' +
              'owned by `' + t + '`. NEW-CLASS-WITHOUT-CONSENT: a spec may not mint vocabulary.',
              cover.renderClassCover(c, cc, '      ')));
          }
        }
      }
    }

    if (declared) {
      for (const pk of Object.keys(declared)) {
        if (declared[pk].required && !Object.prototype.hasOwnProperty.call(props, pk)) {
          issues.push(issue('error', 'prop_required', key,
            '`' + t + '` requires prop `' + pk + ': ' + declared[pk].type + '`' +
            (declared[pk].desc ? '  — ' + declared[pk].desc : '')));
        }
      }
    }

    for (const ch of (el.children || [])) {
      if (!elements[ch]) {
        issues.push(issue('error', 'missing_child', key,
          'children names `' + ch + '`, which is not in spec.elements'));
      }
    }
  }
  return { issues: issues, notes: notes };
}

// ---- PASS 1 + PASS 2 --------------------------------------------------------
function validate(spec) {
  const issues = [];

  const shape = specSchema.safeParse(spec);
  if (!shape.success) {
    for (const i of shape.error.issues) {
      const at = i.path.join('.');
      // a bad `type` is reported far more usefully by pass 2 — do not double-report
      if (/^elements\.[^.]+\.type$/.test(at)) continue;
      issues.push(issue('error', 'spec_shape', at || null, (at ? at + ': ' : '') + i.message));
    }
  }

  let v = { valid: true, issues: [] };
  try { v = core.validateSpec(spec, { checkOrphans: true }); }
  catch (e) {
    issues.push(issue('error', 'core_threw', null,
      'validateSpec threw on this spec: ' + (e && e.message)));
  }
  for (const i of (v.issues || [])) {
    issues.push(issue(i.severity === 'warning' ? 'warning' : 'error',
      i.code, i.elementKey || null, i.message));
  }

  try {
    const sp = codegen.collectStatePaths(spec);
    if (sp && sp.size) {
      issues.push(issue('error', 'excluded_form', null,
        'collectStatePaths found ' + sp.size + ' state path(s) [' + [...sp].join(', ') +
        '] — the spec used a runtime state form. REFUSED, not fixed.'));
    }
    const ac = codegen.collectActions(spec);
    if (ac && ac.size) {
      issues.push(issue('error', 'excluded_form', null,
        'collectActions found ' + ac.size + ' action(s) [' + [...ac].join(', ') +
        '] — handlers are the CALLER\'s, passed as {"$fn":…}, never declared in the spec.'));
    }
  } catch (e) { /* a detector that throws must not suppress the issues already found */ }

  const pass2 = validateAgainstCatalog(spec);
  issues.push(...pass2.issues);

  const errors = issues.filter(i => i.severity === 'error');
  return { ok: errors.length === 0, issues: issues, notes: pass2.notes, errors: errors.length };
}

// ---- the lossless-only fixer ------------------------------------------------
// THE CANDIDATE LIST IS ENUMERATED BY CODE AND EXPOSED BEFORE ANYTHING IS CHOSEN.
// `autoFix` returns a `choices` array — `{kind, at, name, arm, candidates}` per
// unresolved name, built from the catalog — and a SELECTOR then picks among them. The
// default selector is the uniqueness gate this layer has always applied: exactly one
// candidate ⇒ that one, otherwise null. A caller may inject another
// (`autoFix(spec, { selector })`), which is how a different resolution policy plugs in
// without this file growing one.
//
// THREE PROPERTIES HOLD FOR ANY SELECTOR, enforced here rather than trusted to it:
//   · a selector may only pick FROM THE ENUMERATED LIST. A returned name that is not a
//     candidate is REFUSED — code owns what is POSSIBLE, a selector owns only WHICH of
//     those. That is the whole difference between choosing and inventing.
//   · zero candidates is not a choice at all. An invented name resolves to nothing and
//     there is nothing to fix it to, so the selector is never consulted.
//   · a selector returning null leaves the AMBIGUITY REFUSAL exactly as it was, with
//     every candidate named.
function defaultSelector(name, candidates) {
  return candidates.length === 1 ? candidates[0] : null;
}

function autoFix(spec, opts) {
  opts = opts || {};
  const selector = typeof opts.selector === 'function' ? opts.selector : defaultSelector;
  const fixes = [], refusals = [], choices = [];
  let out = JSON.parse(JSON.stringify(spec));
  try {
    // core.autoFixSpec RECONSTRUCTS the spec off the json-render Spec shape
    // ({root, elements, state}), so it DROPS this layer's `mount` (not a json-render
    // field) and SEEDS an empty `state` model (the runtime this project does not
    // have). Left alone, the LOSSLESS fixer emits a spec that fails this layer's own
    // schema. So the extra fields are carried ACROSS the call and the seeded runtime
    // field is dropped; a `state` model that arrives NON-empty is a spec that used an
    // excluded form, which validate() refuses on its own.
    const hadMount = Object.prototype.hasOwnProperty.call(out, 'mount');
    const mount = out.mount;
    const hadState = Object.prototype.hasOwnProperty.call(out, 'state');
    const r = core.autoFixSpec(out, { lossy: false });
    out = r.spec;
    if (hadMount) out = Object.assign({ mount: mount }, out);
    if (!hadState && Object.prototype.hasOwnProperty.call(out, 'state') &&
        !Object.keys(out.state || {}).length) delete out.state;
    (r.fixDetails || []).forEach(f => {
      if (f.lossy) refusals.push('core (lossy, NOT applied): ' + f.message);
      else fixes.push({ by: 'core', lossy: false, message: f.message });
    });
  } catch (e) { refusals.push('core autoFixSpec threw: ' + (e && e.message)); }

  const cat = cover.catalogOrNull();
  if (!cat) {
    refusals.push('catalog unreadable — no name fix attempted');
    return { spec: out, fixes: fixes, refusals: refusals, choices: choices };
  }
  const CLASS_PROP_RE = classPropRe();
  const feOn = !!cat.frontend;
  const helperPool = cover.helperNames();
  const classPool = cover.classNames();

  for (const key of Object.keys(out.elements || {})) {
    const el = out.elements[key];

    if (el && typeof el.type === 'string' && !cat.entries[el.type]) {
      const r = cover.resolveName(el.type, helperPool);
      const at = 'elements.' + key + '.type';
      // enumerated BEFORE any choice is made — a caller inspecting `choices` sees the
      // same list the selector was handed
      if (r.candidates.length) {
        choices.push({ kind: 'unit', at: at, name: el.type, arm: r.arm,
          candidates: r.candidates.slice() });
      }
      const picked = r.candidates.length ? selector(el.type, r.candidates.slice()) : null;
      if (picked && r.candidates.indexOf(picked) === -1) {
        refusals.push(at + ' `' + el.type + '`: the selector returned `' + picked +
          '`, which is not one of the enumerated candidates [' + r.candidates.join(', ') +
          '] — REFUSED. A selector picks among what code found; it may not introduce a name.');
      } else if (picked) {
        fixes.push({ by: 'catalog', lossy: false, message: at + ' `' + el.type + '` → `' +
          picked + '` (' + r.arm + ' near-miss, ' + r.candidates.length + ' candidate' +
          (r.candidates.length > 1 ? 's' : '') + ')' });
        el.type = picked;
      } else if (r.candidates.length) {
        refusals.push(at + ' `' + el.type + '` has ' + r.candidates.length +
          ' candidates [' + r.arm + ']: ' + r.candidates.join(', ') +
          ' — REFUSED (a fix applies only when the selector resolves exactly one)');
      } else {
        refusals.push('elements.' + key + '.type `' + el.type + '` resolves to nothing in the ' +
          'catalog — INVENTED, and there is nothing to fix it to.');
      }
    }

    if (!feOn) continue;
    const entry = cat.entries[el && el.type];
    const props = (el && el.props) || {};
    for (const pk of Object.keys(props)) {
      if (!CLASS_PROP_RE.test(pk) || typeof props[pk] !== 'string') continue;
      let changed = false;
      const next = classTokens(props[pk]).map(c => {
        if (cat.knownClasses && cat.knownClasses[c]) return c;
        if (entry && ((entry.owns || []).indexOf(c) !== -1 ||
                      (entry.ownsConcat || []).indexOf(c) !== -1)) return c;
        const r = cover.resolveName(c, classPool);
        const at = 'elements.' + key + '.props.' + pk;
        if (r.candidates.length) {
          choices.push({ kind: 'class', at: at, name: c, arm: r.arm,
            candidates: r.candidates.slice() });
        }
        const picked = r.candidates.length ? selector(c, r.candidates.slice()) : null;
        if (picked && r.candidates.indexOf(picked) === -1) {
          refusals.push(at + ' `.' + c + '`: the selector returned `' + picked + '`, which is ' +
            'not one of the enumerated candidates — REFUSED. A selector may not mint a class.');
          return c;
        }
        if (picked) {
          fixes.push({ by: 'catalog', lossy: false, message: at + ' `.' + c + '` → `.' + picked +
            '` (' + r.arm + ' near-miss, ' + r.candidates.length + ' candidate' +
            (r.candidates.length > 1 ? 's' : '') + ')' });
          changed = true;
          return picked;
        }
        if (r.candidates.length) {
          refusals.push(at + ' `.' + c + '` has ' + r.candidates.length + ' candidates [' +
            r.arm + ']: ' + r.candidates.map(x => '.' + x).join(', ') + ' — REFUSED');
        } else {
          refusals.push('elements.' + key + '.props.' + pk + ' `.' + c + '` is in no scan and ' +
            'no unit owns it — INVENTED vocabulary, REFUSED (NEW-CLASS-WITHOUT-CONSENT). ' +
            'A fixer may not mint a class.');
        }
        return c;
      });
      if (changed) props[pk] = next.join(' ');
    }
  }
  return { spec: out, fixes: fixes, refusals: refusals, choices: choices };
}

function formatIssues(issues) {
  if (!issues.length) return '0 issues.';
  const out = [];
  for (const i of issues) {
    out.push('  [' + i.severity + ' ' + i.code + ']' + (i.elementKey ? ' ' + i.elementKey : '') +
      ': ' + i.message);
    if (i.detail) out.push(i.detail.split('\n').map(l => '    ' + l).join('\n'));
  }
  return out.join('\n');
}

module.exports = { validate, validateAgainstCatalog, autoFix, defaultSelector,
  formatIssues, typeSchema,
  EXCLUDED_PROP_FORMS, EXCLUDED_ELEMENT_FIELDS, ALLOWED_PROP_FORMS,
  refKind, classPropRe, classTokens };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const file = argv.find(a => a[0] !== '-');
  if (!file) {
    console.error('usage: node tools/spec-catalog/validate.js <spec.json> [--fix [--write]] [--json]');
    process.exit(2);
  }
  const abs = path.resolve(file);
  let spec;
  try { spec = JSON.parse(fs.readFileSync(abs, 'utf8')); }
  catch (e) { console.error('cannot read spec: ' + (e && e.message)); process.exit(2); }

  let subject = spec, fixReport = null;
  if (argv.indexOf('--fix') !== -1) { fixReport = autoFix(spec); subject = fixReport.spec; }
  const res = validate(subject);

  if (argv.indexOf('--json') !== -1) {
    console.log(JSON.stringify({ spec: abs, catalogSha: (cover.catalogOrNull() || {}).sha,
      ok: res.ok, issues: res.issues, notes: res.notes,
      fix: fixReport && { fixes: fixReport.fixes, refusals: fixReport.refusals,
        choices: fixReport.choices } }, null, 2));
  } else {
    console.log('spec: ' + abs);
    console.log('catalog: ' + String((cover.catalogOrNull() || {}).sha).slice(0, 12));
    if (fixReport) {
      console.log('autofix (lossless only): ' + fixReport.fixes.length + ' applied, ' +
        fixReport.refusals.length + ' refused, ' + fixReport.choices.length +
        ' candidate set(s) enumerated');
      fixReport.fixes.forEach(f => console.log('  + ' + f.message));
      fixReport.refusals.forEach(r => console.log('  ! ' + r));
    }
    console.log('validate: ' + (res.ok ? 'OK' : res.errors + ' error(s)') + ' · ' +
      res.issues.length + ' issue(s)' +
      (res.notes.length ? ' · ' + res.notes.length + ' derived-tier note(s)' : ''));
    if (res.issues.length) console.log(formatIssues(res.issues));
    if (res.notes.length) console.log(formatIssues(res.notes));
  }

  if (fixReport && argv.indexOf('--write') !== -1 && fixReport.fixes.length) {
    fs.writeFileSync(abs, JSON.stringify(subject, null, 2) + '\n');
    console.log('wrote repaired spec: ' + abs);
  }
  process.exit(res.ok ? 0 : 1);
}
