#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// gen-catalog.js — project the code registry's scan into a CATALOG: a machine
// readable table of the reusable units a builder agent is ALLOWED to name, plus a
// byte-capped prompt payload that arrives in that agent instead of a raw ruleset.
//
//   node tools/gen-catalog.js                      # write catalog.json + catalog.prompt.md
//   node tools/gen-catalog.js --print              # counts only, write nothing
//   node tools/gen-catalog.js --sections a,b,c     # build a SUBSET of the payload
//   node tools/gen-catalog.js --help
//
// THE PAYLOAD IS SECTIONED, and a caller may ask for a subset. Six ids, default ALL:
//
//   head      what this payload is + why a spec replaces freehand assembly
//   rules     the hard rules the builder is gated on
//   taskmap   task → canonical unit (absent when the project declared no task map)
//   entries   THE CATALOG — every unit a spec may name, with props/tier/owns
//   format    the spec shape + the four-form expression subset + "a child mounts itself"
//   workflow  the commands, and the COMPILED worked example
//
// Also a module API — `require('./gen-catalog.js').buildPrompt(catalog, sections)` —
// so a caller wanting a pruned payload builds one in memory instead of re-implementing
// the renderer. WHICH sections a task needs is the caller's decision and is never made
// here: this file has no opinion about pruning, it only accepts the list. An unknown
// id is a LOUD failure, never a skip (a payload quietly smaller than the one asked for
// is GATE-FAILS-OPEN in payload form), and the summary line always reports the sections
// actually built, because a pruned prompt and a broken renderer look identical from a
// byte count alone.
//
// WHY (the method — integrations/spec-catalog.md): the edit gates refuse AFTER a
// freehand surface is written. This layer constrains BEFORE: the agent emits a
// {helper, props, children} spec that can only name catalog entries, the validator
// checks it against this catalog, the compiler emits real helper calls, and the
// spec-gate refuses freehand new surfaces that no compile receipt covers. Constraint
// -before replaces refusal-after.
//
// THE ONE SCAN RULE. This file does NOT scan the codebase. It requires
// tools/gen-code-registry.js — the ONE scan, which also writes canon.registryFile —
// and projects the SAME result. A parallel scanner drifts from the registry and then
// two indexes disagree about the same codebase (PATCH-NOT-ESCALATED-TO-SHARED). If a
// count here disagrees with the registry's own stdout line, THIS file is wrong.
//
// TWO FIELDS ARE NEW WORK HERE, and only two:
//   props  the reusable unit's option NAMES, read out of its body via
//          specCatalog.propReadRe (language-specific ⇒ config-supplied)
//   owns   (frontend.enabled only) the CSS classes the unit WRITES, so the compiler
//          emits them and an agent never authors one
//
// TWO TIERS (so the layer is usable on day one):
//   derived   no annotation — the unit NAME and its prop NAMES are checked; types are not
//   declared  a `specCatalog.annotationTag` block above the definition — prop TYPES,
//             requiredness, slot names and a one-line desc are checked too
// A derived entry is still catalog-only, which IS the constraint: an agent cannot name
// a unit that does not exist.
//
// THE ANNOTATION FORM (default tag `@catalog`; a block comment immediately above the
// definition, in whatever comment syntax the language uses — the reader strips leading
// `/*`, `*`, `//` and `#`):
//
//   /** @catalog
//    *  desc:  param rows for any panel (the ONE row host)
//    *  prop   host: element!        host element the rows mount into
//    *  prop   items: any!           row descriptors
//    *  prop   onChange: fn          rebuild callback
//    *  prop   mode: enum(edit|view) which affordances are wired
//    *  slots: body, header          (children mount into these; `none` = no slots)
//    */
//
// Type vocabulary is CLOSED (specCatalog.types). A declared prop whose type is outside
// it is a BUILD FAILURE, not a warning: an unchecked type token is a prop the gate
// believes it validated and did not (GATE-FAILS-OPEN).
//
// Config: everything under `specCatalog` in stack.config.json (see
// stack.config.README.md). `specCatalog.enabled:false` (the default) ⇒ this tool
// no-ops. Class/`owns` work runs ONLY when `frontend.enabled`.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (process.argv.includes('--help')) {
  console.log('gen-catalog — project the code registry into catalog.json + catalog.prompt.md.\n' +
    'Usage: node tools/gen-catalog.js [--config <path>] [--print] [--sections a,b,c]\n' +
    'Sections (default all): head · rules · taskmap · entries · format · workflow\n' +
    'Reads stack.config.json (walk-up from cwd). Writes specCatalog.catalogDir.');
  process.exit(0);
}

// ---- config -----------------------------------------------------------------
// Resolved the same way every hook resolves it (walk-up / --config / A8_STACK_CONFIG),
// via the shared lib so "which config governs this file" has ONE answer.
const CFGLIB = require(path.join(__dirname, '..', 'hooks', 'lib', 'config.js'));
function resolveConfigPath() {
  const i = process.argv.indexOf('--config');
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  return null;
}
const EXPLICIT = resolveConfigPath();
const CFG = CFGLIB.load(EXPLICIT || process.cwd());
if (!CFG) { console.error('gen-catalog: no stack.config.json found.'); process.exit(2); }
const ROOT = CFG.__repoRoot;

const SC = Object.assign({
  enabled: false,
  catalogDir: 'tools/spec-catalog',
  specDir: 'specs/ui-specs',
  annotationTag: '@catalog',
  propReadRe: '\\b(?:opts|options|config|props)\\.([A-Za-z_]\\w*)',
  types: ['element', 'string', 'number', 'bool', 'fn', 'object', 'element[]', 'any'],
  exampleSpec: '',
  keyFile: '~/.claude/spec-catalog.key',
  signalEntry: {},
  sealedShells: [],
  classPropRe: '(^|[a-z])class(es)?$|^cls|Class(es)?$',
  emitBans: [],
  emit: {},
  appScopeRe: '',
  gateScopeGlobs: [],
  taskMap: null,
  promptTargetBytes: 24576,
  promptCeilingBytes: 32768
}, CFG.specCatalog || {});

const CAT_DIR = path.join(ROOT, SC.catalogDir);
const OUT_JSON = path.join(CAT_DIR, 'catalog.json');
const OUT_PROMPT = path.join(CAT_DIR, 'catalog.prompt.md');
const FE_ON = !!(CFG.frontend && CFG.frontend.enabled);

// ---- THE ONE SCAN — required as a module, never re-implemented --------------
// gen-code-registry.js must export its scanners and guard its own main() (see
// integrations/spec-catalog.PATCHES.md). A missing export is a LOUD failure: a
// catalog built off a second scan is the duplication this file exists to avoid.
let registry;
try {
  registry = require(path.join(__dirname, 'gen-code-registry.js'));
} catch (e) {
  console.error('gen-catalog: cannot require tools/gen-code-registry.js — ' + (e && e.message));
  process.exit(2);
}
if (!registry || typeof registry.scanCode !== 'function') {
  console.error('gen-catalog: tools/gen-code-registry.js does not export scanCode().\n' +
    'Apply the export block from integrations/spec-catalog.PATCHES.md (§ gen-code-registry.js).\n' +
    'This tool will NOT scan the codebase itself — one scan, two projections.');
  process.exit(2);
}

// ---- source helpers ---------------------------------------------------------
const PROP_RE_SRC = SC.propReadRe;
const ENUM_RE = /^enum\(([^)]+)\)$/;
function typeIsKnown(t) { return SC.types.indexOf(t) !== -1 || ENUM_RE.test(t); }

// A brace/comment-aware forward scan from a definition line to the end of the body.
// Strings, template literals and both comment forms are skipped so a brace inside any
// of them cannot close the body early. Languages that do not use braces get the
// fallback window (see below) — the props/owns reads degrade, the NAME set does not,
// and a derived entry is still a real constraint.
function bodyRange(src, defLine) {
  const lines = src.split('\n');
  let i = 0;
  for (let n = 0; n < defLine - 1 && n < lines.length; n++) i += lines[n].length + 1;
  const start = i;
  let depth = 0, seen = false, inS = null, inC = null;
  for (let p = start; p < src.length; p++) {
    const c = src[p], n = src[p + 1];
    if (inC === 'line') { if (c === '\n') inC = null; continue; }
    if (inC === 'block') { if (c === '*' && n === '/') { inC = null; p++; } continue; }
    if (inS) { if (c === '\\') { p++; continue; } if (c === inS) inS = null; continue; }
    if (c === '/' && n === '/') { inC = 'line'; p++; continue; }
    if (c === '/' && n === '*') { inC = 'block'; p++; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = c; continue; }
    if (c === '{') { depth++; seen = true; continue; }
    if (c === '}') { depth--; if (seen && depth <= 0) return src.slice(start, p + 1); }
  }
  // no balanced body found (brace-less language, or an unbalanced file): a bounded
  // window, so a read is never silently the whole rest of the file
  return src.slice(start, Math.min(src.length, start + 40000));
}

// A comment-BLANKED view of a file, for definition-site resolution only. Lines are
// blanked, never removed, so numbering stays true. Prose naming a definition is not a
// definition — a header comment that documents `window.thing = {` would otherwise
// resolve the unit to its own documentation.
function blankComments(text) {
  let inBlock = false;
  return text.split('\n').map(raw => {
    let line = raw;
    if (inBlock) {
      const e = line.indexOf('*/');
      if (e === -1) return '';
      line = ' '.repeat(e + 2) + line.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const li = line.indexOf('//');
      const bi = line.indexOf('/*');
      // whichever opener comes FIRST wins: handling `/*` first lets a `/*` inside a
      // path glob in a LINE comment open a block that never closes, blanking the
      // rest of the file and losing every definition below it
      if (li !== -1 && (bi === -1 || li < bi)) {
        const head = line.slice(0, li);
        if ((head.match(/['"`]/g) || []).length % 2 === 0) line = head;
        break;
      }
      if (bi === -1) break;
      const be = line.indexOf('*/', bi);
      if (be === -1) { line = line.slice(0, bi); inBlock = true; break; }
      line = line.slice(0, bi) + ' '.repeat(be + 2 - bi) + line.slice(be + 2);
    }
    return line;
  });
}

// ---- definition-site resolution --------------------------------------------
// The registry fills its map with the FIRST line matching an export/def regex, and
// those regexes match a CALL as readily as a definition. Reading props/owns out of a
// call site yields data that is not merely missing but WRONG — and a catalog that
// under-reports a prop REFUSES the spec that names it. So the definition is located
// for names the scan ALREADY FOUND. This is a lookup, never a second inventory: the
// NAME set comes entirely from the registry and is never added to. The registry's own
// file:line is carried through untouched so the two projections stay comparable.
const DEF_KINDS = (n) => [
  new RegExp('^\\s*(?:async\\s+)?function\\s+' + n + '\\s*\\('),
  new RegExp('^\\s*(?:export\\s+)?(?:const|var|let)\\s+' + n + '\\s*=\\s*(?:async\\s+)?(?:function|\\()'),
  new RegExp('^\\s*(?:module\\.exports|exports|window|globalThis)\\.' + n +
    '\\s*=\\s*(?:async\\s+)?(?:function|\\()'),
  new RegExp('^\\s*(?:module\\.exports|exports|window|globalThis)\\.' + n + '\\s*=\\s*\\{\\s*$'),
  // a couple of non-JS shapes, so a mixed repo is not silently unresolved
  new RegExp('^\\s*(?:async\\s+)?def\\s+' + n + '\\s*\\('),
  new RegExp('^\\s*(?:pub\\s+)?fn\\s+' + n + '\\s*[(<]')
];
function isDefLine(name, line) { return DEF_KINDS(name).some(re => re.test(line || '')); }
const ALIAS_RE = (n) => new RegExp('^\\s*(?:window|globalThis|exports)\\.' + n +
  '\\s*=\\s*(?:(?:window|globalThis)\\.)?([A-Za-z_]\\w*)\\s*;');
function aliasOf(name, line) { const m = ALIAS_RE(n2(name)).exec(line || ''); return m ? m[1] : null; }
function n2(n) { return String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ---- props ------------------------------------------------------------------
function propNames(body) {
  const out = new Set();
  let re;
  try { re = new RegExp(PROP_RE_SRC, 'g'); } catch (e) { return []; }
  let m;
  while ((m = re.exec(body))) if (m[1]) out.add(m[1]);
  return [...out].sort();
}

// ---- owns (FRONTEND ONLY) ---------------------------------------------------
// The classes a unit WRITES, so the compiler emits them and the agent never does.
// Two narrowings, both load-bearing: a class-writing CONTEXT is required (else a
// runtime id concatenation credits every class sharing its stem), and a stem's
// evidence stays SEPARATE and labelled (a stem is coarser than a name — merging the
// two counts turns a census into a rumour).
const CLASS_CTX = /(?:classList\s*\.\s*(?:add|remove|toggle|replace)\s*\(|\.className\s*\+?=|setAttribute\s*\(\s*['"]class['"]\s*,|\bclass\s*=\s*)/;
const STEM = /(['"`])((?:[^'"`\\\n]|\\.)*?)([A-Za-z_][A-Za-z0-9_-]*-)(?:\1\s*\+|\$\{)/g;
function stemIsClassy(head) {
  const a = head.match(/([A-Za-z_:-]+)\s*=\s*["']?[^"']*$/);
  return !a || a[1] === 'class';
}
function ownedClasses(body, classSet) {
  if (!FE_ON) return { owns: [], ownsConcat: [] };
  const literal = new Set(), viaStem = new Set(), stems = new Set();
  for (const line of body.split('\n')) {
    if (!CLASS_CTX.test(line)) continue;
    const toks = line.match(/[A-Za-z_][A-Za-z0-9_-]*/g) || [];
    for (const t of toks) if (classSet.has(t)) literal.add(t);
    STEM.lastIndex = 0;
    let s;
    while ((s = STEM.exec(line))) { if (stemIsClassy(s[2])) stems.add(s[3]); }
  }
  if (stems.size) {
    for (const c of classSet) {
      for (const st of stems) {
        if (c.length > st.length && c.indexOf(st) === 0 && !literal.has(c)) { viaStem.add(c); break; }
      }
    }
  }
  return { owns: [...literal].sort(), ownsConcat: [...viaStem].sort() };
}

// ---- the annotation ---------------------------------------------------------
// Read by walking UPWARD from the definition line while the lines are comment lines.
function commentAbove(lines, defLine) {
  const acc = [];
  for (let i = defLine - 1; i > 0 && i > defLine - 60; i--) {
    const s = (lines[i - 1] || '').trim();
    if (s.startsWith('/*') || s.startsWith('*') || s.endsWith('*/') ||
        s.startsWith('//') || s.startsWith('#')) {
      acc.push(s);
      if (s.startsWith('/*')) break;
    } else if (acc.length || s) break;
  }
  return acc.reverse();
}
function stripCommentSyntax(raw) {
  return raw.replace(/^\/\*+\s?/, '').replace(/^\*+\s?/, '').replace(/^\/\/\s?/, '')
    .replace(/^#\s?/, '').replace(/\*\/\s*$/, '').trim();
}
function parseAnnotation(commentLines, where, problems) {
  const tag = SC.annotationTag;
  const joined = commentLines.join('\n');
  if (joined.indexOf(tag) === -1) return null;
  const ann = { desc: '', props: {}, slots: [] };
  for (const raw of commentLines) {
    const ln = stripCommentSyntax(raw);
    if (!ln || ln.indexOf(tag) === 0) continue;
    let m;
    if ((m = ln.match(/^desc:\s*(.+)$/))) { ann.desc = m[1].trim(); continue; }
    if ((m = ln.match(/^slots:\s*(.+)$/))) {
      const v = m[1].trim();
      ann.slots = /^none\b/.test(v) ? []
        : v.replace(/\(.*$/, '').split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }
    if ((m = ln.match(/^prop\s+([A-Za-z_]\w*)\s*:\s*(\S+?)(!?)\s*(?:\s{2,}(.*))?$/))) {
      const type = m[2], required = m[3] === '!';
      if (!typeIsKnown(type)) {
        problems.push(where + ': prop `' + m[1] + '` declares type `' + type +
          '` which is outside the closed vocabulary (' + SC.types.join(' · ') + ' · enum(a|b|c)). ' +
          'Extend specCatalog.types deliberately — an unchecked type token is a prop the ' +
          'gate believes it validated and did not.');
      }
      ann.props[m[1]] = { type: type, required: required, desc: (m[4] || '').trim() };
      continue;
    }
  }
  if (!ann.desc) {
    problems.push(where + ': ' + tag + ' block has no `desc:` line — the one thing no scan ' +
      'can infer is the thing the block exists to carry');
  }
  return ann;
}

// ---- build ------------------------------------------------------------------
function build() {
  const problems = [];
  const { exportsMap, chromeMap, components, engines } = registry.scanCode();
  const classes = FE_ON && typeof registry.scanClasses === 'function'
    ? registry.scanClasses() : new Map();
  const live = typeof registry.scanCallers === 'function'
    ? registry.scanCallers(new Set(exportsMap.keys())) : new Map();
  const classSet = new Set(classes.keys());

  const srcCache = new Map();
  const srcOf = (relFile) => {
    if (!srcCache.has(relFile)) {
      let txt = '';
      try { txt = fs.readFileSync(path.join(ROOT, relFile), 'utf8'); } catch (e) { txt = ''; }
      srcCache.set(relFile, { txt: txt, lines: txt.split('\n'), codeLines: blankComments(txt) });
    }
    return srcCache.get(relFile);
  };
  const codeFiles = (typeof registry.allCodeFiles === 'function' ? registry.allCodeFiles() : [])
    .map(p => path.relative(ROOT, p));

  const resolveDef = (name, hintFile, hintLine, hop) => {
    hop = hop || 0;
    const hint = srcOf(hintFile);
    if (hint.txt && isDefLine(name, hint.codeLines[hintLine - 1])) {
      return { file: hintFile, line: hintLine, resolved: hop > 0, alias: hop > 0 ? name : null };
    }
    let alias = null, aliasAt = null;
    for (const rf of codeFiles) {
      const s = srcOf(rf);
      if (!s.txt || s.txt.indexOf(name) === -1) continue;
      for (let i = 0; i < s.lines.length; i++) {
        if (isDefLine(name, s.codeLines[i])) {
          return { file: rf, line: i + 1, resolved: true, alias: hop > 0 ? name : null };
        }
        if (!alias) {
          const a = aliasOf(name, s.codeLines[i]);
          if (a && a !== name) { alias = a; aliasAt = { file: rf, line: i + 1 }; }
        }
      }
    }
    // one alias hop is the measured need, two is the cap, a cycle can never spin
    if (alias && hop < 2) {
      const via = resolveDef(alias, aliasAt.file, aliasAt.line, hop + 1);
      if (via) return Object.assign({}, via, { resolved: true, alias: via.alias || alias });
    }
    return null;
  };

  const entries = {};
  let declared = 0, derived = 0, relocated = 0, unresolved = 0;
  for (const [name, v] of [...chromeMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const def = resolveDef(name, v.file, v.line);
    if (!def) unresolved++; else if (def.resolved) relocated++;
    const src = def ? srcOf(def.file) : { txt: '', lines: [], codeLines: [] };
    const body = def && src.txt ? bodyRange(src.txt, def.line) : '';
    const o = ownedClasses(body, classSet);
    const ann = def && src.txt
      ? parseAnnotation(commentAbove(src.lines, def.line),
        def.file + ':' + def.line + ' ' + name, problems)
      : null;
    if (ann) declared++; else derived++;
    entries[name] = {
      name: name,
      file: def ? def.file : v.file,
      line: def ? def.line : v.line,
      firstLine: def && src.lines[def.line - 1]
        ? src.lines[def.line - 1].trim().slice(0, 110) : v.sig,
      // the registry's own projection of the same name, carried verbatim so the two
      // are comparable — registryLine !== line means the registry indexed a CALL
      registryFile: v.file,
      registryLine: v.line,
      defUnresolved: !def,
      defAlias: (def && def.alias) || null,
      tier: ann ? 'declared' : 'derived',
      desc: ann ? ann.desc : null,
      propNames: propNames(body),
      props: ann ? ann.props : null,
      slots: ann ? ann.slots : null,
      owns: o.owns,
      ownsConcat: o.ownsConcat,
      orphan: live.get(name) === 0,
      bodyBytes: body.length
    };
  }

  const knownClasses = {};
  for (const [c, at] of [...classes.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    knownClasses[c] = { at: at };
  }

  const taskMap = (SC.taskMap || (CFG.codeRegistry && CFG.codeRegistry.taskMap) || [])
    .map(r => (Array.isArray(r) ? { task: r[0], use: r[1], never: r[2] || '' } : r));

  const catalog = {
    version: 1,
    generator: 'tools/gen-catalog.js',
    source: 'tools/gen-code-registry.js',
    doc: 'integrations/spec-catalog.md',
    generated: new Date().toISOString(),
    project: (CFG.project && CFG.project.name) || 'project',
    frontend: FE_ON,
    types: SC.types,
    specDir: SC.specDir,
    catalogDir: SC.catalogDir,
    // config CARRIED INTO the catalog, so every consumer (cover · validate · compile ·
    // receipt · the gate) reads ONE artefact and they cannot disagree about the rules.
    // A hook that re-resolved stack.config.json for itself is a second source of truth.
    keyFile: SC.keyFile,
    signalEntry: SC.signalEntry,
    sealedShells: SC.sealedShells,
    classPropRe: SC.classPropRe,
    emitBans: SC.emitBans,
    emit: SC.emit,
    appScopeRe: SC.appScopeRe,
    gateScopeGlobs: SC.gateScopeGlobs,
    counts: {
      helpers: Object.keys(entries).length,
      declared: declared, derived: derived,
      defRelocated: relocated, defUnresolved: unresolved,
      exports: exportsMap.size,
      classes: Object.keys(knownClasses).length,
      components: components ? components.size : 0,
      engines: engines ? engines.size : 0
    },
    taskMap: taskMap,
    entries: entries,
    knownClasses: knownClasses,
    problems: problems
  };
  // the hash the compile receipt pins — over the catalog WITHOUT its own timestamp,
  // so an unchanged corpus regenerates to an unchanged sha and a valid receipt does
  // not go stale merely for having been rebuilt
  const stable = JSON.stringify(Object.assign({}, catalog, { generated: null, sha: null }));
  catalog.sha = crypto.createHash('sha256').update(stable).digest('hex');
  return catalog;
}

// ---- the prompt payload -----------------------------------------------------
// These bytes are what ARRIVES in a builder agent (integrations/spec-catalog.md §the
// payload). The byte cap is the point: a payload over the ceiling is filed away
// undelivered while the tooling reports success — GATE-FAILS-OPEN wearing a success
// message. Over the ceiling is a BUILD FAILURE, never a warning.
//
// SECTIONS — the payload is assembled from six named sections, and a caller may ask
// for a SUBSET (`sections` argument / `--sections a,b,c`). The default is ALL of them;
// pruning is a caller's decision, never this file's, and nothing here judges which
// slices a task needs.
//
//   head      what this payload is + why a spec replaces freehand assembly
//   rules     the hard rules the builder is gated on
//   taskmap   task → canonical unit (omitted when the project declared no task map)
//   entries   THE CATALOG — every unit a spec may name, with props/tier/owns
//   format    the spec shape + the four-form expression subset + "a child mounts itself"
//   workflow  the commands, and the COMPILED worked example
//
// An unknown id is a LOUD failure, not a skip: silently dropping an id the caller
// asked for yields a payload smaller than requested while the tool reports success
// (GATE-FAILS-OPEN). `entries` may be pruned away like any other section — that is the
// caller's call — but the summary line always reports which sections were built, so a
// short payload is never mistaken for a complete one.
const PROMPT_SECTIONS = ['head', 'rules', 'taskmap', 'entries', 'format', 'workflow'];

function buildPrompt(catalog, sections) {
  const want = sections && sections.length ? sections.slice() : PROMPT_SECTIONS.slice();
  const bad = want.filter(s => PROMPT_SECTIONS.indexOf(s) === -1);
  if (bad.length) {
    throw new Error('gen-catalog: unknown prompt section(s) [' + bad.join(', ') + ']. ' +
      'Accepted: ' + PROMPT_SECTIONS.join(' · ') + '. An unknown id is refused rather ' +
      'than skipped — a payload quietly smaller than the one asked for is the failure ' +
      'this check exists to prevent.');
  }
  const on = (id) => want.indexOf(id) !== -1;
  const P = [];
  const push = (s) => P.push(s);

  if (on('head')) push([
    '# ' + catalog.project + ' catalog — emit a SPEC, never freehand structure',
    '',
    '> GENERATED by `tools/gen-catalog.js` from the code registry (catalog sha `' +
      String(catalog.sha).slice(0, 12) + '`, built ' + catalog.generated + ').',
    '> DO NOT HAND-EDIT. Method: `integrations/spec-catalog.md`.',
    '',
    'You do not assemble structure by hand in this repo. You write a `{helper, props, children}`',
    'spec that can only name catalog entries, validate it, compile it, and paste the compiled',
    'calls. The freehand path is not something a spec can express — which is the point: the edit',
    'gates adjudicate prose AFTER it is written (`HELPER-HAND-ROLL`,',
    '`NEW-VOCABULARY-WITHOUT-CONSENT`), and this constrains BEFORE. The gates stay as the backstop',
    'for operator-consented hand edits.'
  ].join('\n'));

  if (on('rules')) push([
    '## The hard rules — you will be gated on these',
    '',
    '1. **NEVER invent a new reusable unit or vocabulary.** Everything you may name is in the',
    '   table below (it is the code registry, projected). Reinventing a listed unit is',
    '   `HELPER-HAND-ROLL`; inventing a rival abstraction is `NEW-VOCABULARY-WITHOUT-CONSENT`.',
    '   If the capability is genuinely absent from this catalog it is NEW — STOP and get the',
    '   operator\'s express consent before writing it.',
    (catalog.frontend
      ? '2. **NEVER author a class.** A class belongs to the unit that OWNS it (the `owns` column);\n' +
        '   the compiler emits it for you. A class you type is `NEW-CLASS-WITHOUT-CONSENT`.'
      : '2. **NEVER author the structural glue by hand.** The compiler emits every call and every\n' +
        '   mount; what you write is the spec.'),
    '3. **NEVER theorize a measured value.** A rendered coordinate/size is a SUM across the whole',
    '   system that no source read yields — MEASURE it on the running system, or state the',
    '   measurement you need and return it (`LAYOUT-DERIVED-NOT-MEASURED`).',
    '4. **Canon-grep before every edit** and cite `<file>:<line>` — the grep-required hook',
    '   enforces it. View source at exact lines; never edit from memory.'
  ].join('\n'));

  if (on('taskmap') && catalog.taskMap.length) {
    push(['## Task → canonical unit (' + catalog.taskMap.length + ' rows)', '',
      '| task | use | NEVER |', '|---|---|---|']
      .concat(catalog.taskMap.map(t => '| ' + t.task + ' | `' + t.use + '` | ' + (t.never || '') + ' |'))
      .join('\n'));
  }

  const names = Object.keys(catalog.entries).sort();
  if (on('entries')) push([
    '## The catalog — ' + names.length + ' units (' + catalog.counts.declared +
      ' declared, ' + catalog.counts.derived + ' derived)',
    '',
    'A `type` in your spec must be one of these names. A `props` key must be one of that row\'s',
    'prop names — they are the option reads inside the unit\'s body, so a name absent from the row',
    'is an option the unit does not read. A **declared** row additionally carries prop types,',
    'requiredness and slots (its `desc` is the second line); a **derived** row has names only.',
    (catalog.frontend ? '`owns` is what the unit WRITES: those classes are emitted for you.' : ''),
    'Read the unit at its `file:line` when you need its semantics.',
    '',
    '| unit | file:line | tier | props | ' + (catalog.frontend ? 'owns |' : '') ,
    '|---|---|---|---|' + (catalog.frontend ? '---|' : '')
  ].filter(Boolean).concat(names.map(n => {
    const e = catalog.entries[n];
    const props = e.props
      ? Object.keys(e.props).map(k => k + ': ' + e.props[k].type + (e.props[k].required ? '!' : '')).join(' ')
      : ((e.propNames || []).length ? e.propNames.join(' ') : '—');
    const row = '| `' + e.name + '` | ' + e.file + ':' + e.line + ' | ' + e.tier + ' | ' + props + ' |';
    return catalog.frontend
      ? row + ' ' + ((e.owns || []).length ? e.owns.join(' ') : '—') + ' |'
      : row;
  })).concat(names.filter(n => catalog.entries[n].desc).length ? ['',
    '**Declared units, what each is FOR:**', ''
  ].concat(names.filter(n => catalog.entries[n].desc)
    .map(n => '- `' + n + '` — ' + catalog.entries[n].desc +
      (catalog.entries[n].slots && catalog.entries[n].slots.length
        ? '  *(slots: ' + catalog.entries[n].slots.join(', ') + ')*' : ''))) : []).join('\n'));

  if (on('format')) push([
    '## The spec you emit',
    '',
    'A flat tree. `mount` says where it attaches, `root` names the top element, `elements` is a',
    'map of `{type, props, children}`. Authored under `' + catalog.specDir + '/<name>.json`, tracked.',
    '',
    '### The expression subset — four forms, and only four',
    '',
    '| form | meaning |',
    '|---|---|',
    '| literal | a string / number / bool / array prop |',
    '| `{"$arg":"name"}` | a parameter of the emitted function — the CALLER owns the value |',
    '| `{"$fn":"name"}` | a named callback parameter — handlers are the caller\'s, never the spec\'s |',
    '| `{"$slot":"key.slotName"}` | the element another node returns — how a child mounts into a parent |',
    '',
    '**Excluded absolutely — REFUSED, never fixed:** `$state` · `$bindState` · `$bindItem` ·',
    '`$computed` · `repeat` · `watch` · `visible` · `on`. Those are runtime features of a state',
    'model this project does not have; a second state model beside the real one is a duplication',
    'failure by construction (`PERSISTENCE-HOLE`, `STATE-NOT-PERSISTED`).',
    '',
    '### A CHILD MOUNTS ITSELF',
    '',
    'Units take their host as an OPTION, so a child declares its own attachment as a `$slot` prop',
    'naming its parent (`"host": {"$slot":"grp.body"}`). A child naming no slot of its parent is',
    'REFUSED with its own prop list attached, so YOU pick rather than the compiler guessing.',
    '`children` keeps two jobs: it fixes emission order (parent before any child that references',
    'it) and it is what the validator reads to find dangling references.',
    '',
    '`mount.kind:"host"` is the common case — the emitted function receives an existing host',
    'element and appends into it; it never queries the document. `mount.slot` names WHICH key of',
    'the root unit\'s return is appended into `mount.arg`; it is optional only when the root takes',
    'the host as a prop and so mounts itself. Neither ⇒ refused, because guessing a return key is',
    '`LAYOUT-DERIVED-NOT-MEASURED` applied to the emitter.'
  ].join('\n'));

  if (!on('workflow')) return P.join('\n\n---\n\n') + '\n';

  const wf = [
    '## The workflow — spec first, two commands, then paste',
    '',
    '```',
    '1  write   ' + catalog.specDir + '/<name>.json',
    '2  node ' + catalog.catalogDir + '/validate.js ' + catalog.specDir + '/<name>.json [--fix --write]',
    '3  node ' + catalog.catalogDir + '/compile.js  ' + catalog.specDir + '/<name>.json --name <fnName>',
    '4  paste the emitted block into the target file with Edit, then syntax-check it',
    '```',
    '',
    '`validate.js` reports issues NAMING the entry that covers the need, and `--fix` is',
    'LOSSLESS-ONLY (a near-miss name is repaired only when exactly ONE candidate resolves; two',
    'candidates ⇒ refused with both named; an invented name is never "fixed"). `compile.js` emits',
    'one call per node plus the mount, and writes a tracked RECEIPT. The `spec-gate` hook REFUSES',
    'a freehand new surface that no receipt covers — so the compiled block is not the polite',
    'route, it is the only route.'
  ];
  if (SC.exampleSpec) {
    // COMPILED into the payload, never transcribed. A transcription cannot be kept
    // true by care: it drifts the moment the emitter moves, and this is the model's
    // only picture of the output. An example that fails to validate or compile is a
    // BUILD FAILURE of the payload, never a silently-omitted section.
    const abs = path.join(ROOT, SC.exampleSpec);
    let json, res;
    try {
      json = fs.readFileSync(abs, 'utf8').replace(/\s+$/, '');
      const validator = require(path.join(CAT_DIR, 'validate.js'));
      const compiler = require(path.join(CAT_DIR, 'compile.js'));
      const spec = JSON.parse(json);
      const v = validator.validate(spec);
      if (!v.ok) {
        console.error('gen-catalog REFUSED — the worked example does not validate (' +
          SC.exampleSpec + '):');
        console.error(validator.formatIssues(v.issues));
        process.exit(1);
      }
      res = compiler.compile(spec, { specPath: abs });
      if (res.problems.length) {
        console.error('gen-catalog REFUSED — the worked example does not compile (' +
          SC.exampleSpec + '):');
        res.problems.forEach(p => console.error('  · ' + p));
        process.exit(1);
      }
    } catch (e) {
      console.error('gen-catalog REFUSED — the worked example could not be built: ' +
        (e && e.message) + '\n(specCatalog.exampleSpec = ' + SC.exampleSpec + ')');
      process.exit(1);
    }
    wf.push('', 'A worked spec (`' + SC.exampleSpec + '`) and what the compiler emits from it — ' +
      'both COMPILED into this payload, not transcribed:', '', '```json');
    wf.push(json, '```', '', '```js', res.body.replace(/\s+$/, ''), '```');
  } else {
    wf.push('', '> No worked example is configured (`specCatalog.exampleSpec`). Set one to a tracked,' +
      ' compiling spec — the payload then carries the real emitted bytes instead of this note.');
  }
  push(wf.join('\n'));

  return P.join('\n\n---\n\n') + '\n';
}

// ---- module API -------------------------------------------------------------
// `build()` and `buildPrompt(catalog, sections)` are callable without running the
// tool, so a caller that wants a PRUNED payload (a spawn-time pruner, a test) builds
// one in memory rather than re-implementing the renderer. `main()` runs only when
// this file is the entry point — the same discipline gen-code-registry.js needs for
// gen-catalog to exist at all.
module.exports = { build, buildPrompt, PROMPT_SECTIONS, SC, CAT_DIR, OUT_JSON, OUT_PROMPT, main };

// ---- run --------------------------------------------------------------------
function main() {
  if (!SC.enabled) {
    console.log('gen-catalog: specCatalog.enabled is false — nothing to do (inert).');
    return 0;
  }

  // --sections a,b,c — build a SUBSET of the payload. Default is every section; an
  // unknown id throws out of buildPrompt rather than being skipped.
  const si = process.argv.indexOf('--sections');
  const sections = (si !== -1 && process.argv[si + 1])
    ? process.argv[si + 1].split(',').map(s => s.trim()).filter(Boolean) : null;

  const catalog = build();
  const summary = 'catalog: ' + catalog.counts.helpers + ' units (' + catalog.counts.declared +
    ' declared, ' + catalog.counts.derived + ' derived), ' + catalog.counts.classes +
    ' classes, ' + catalog.counts.exports + ' exports. def-sites: ' +
    catalog.counts.defRelocated + ' resolved off a registry call-site, ' +
    catalog.counts.defUnresolved + ' unresolved. sha ' + catalog.sha.slice(0, 12);

  if (process.argv.indexOf('--print') !== -1) {
    console.log(summary + '  (--print: nothing written)');
  } else {
    fs.mkdirSync(CAT_DIR, { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify(catalog, null, 2) + '\n');
    let prompt;
    try { prompt = buildPrompt(catalog, sections); }
    catch (e) { console.error(String(e && e.message)); return 1; }
    fs.writeFileSync(OUT_PROMPT, prompt);
    const bytes = Buffer.byteLength(prompt, 'utf8');
    const built = sections || PROMPT_SECTIONS;
    console.log(summary);
    // The sections built are ALWAYS reported, so a short payload is never mistaken
    // for a complete one — a pruned prompt and a broken renderer look identical from
    // a byte count alone.
    console.log('catalog.prompt.md: ' + bytes + ' bytes (' + (bytes / 1024).toFixed(1) +
      ' KB; target ' + SC.promptTargetBytes + ', ceiling ' + SC.promptCeilingBytes + ') · ' +
      'sections: ' + built.join(',') + (sections ? '  (pruned from ' +
        PROMPT_SECTIONS.length + ')' : ''));
    if (bytes > SC.promptCeilingBytes) {
      console.error('BUILD FAILURE — catalog.prompt.md is ' + bytes + ' bytes, over the ceiling ' +
        'of ' + SC.promptCeilingBytes + '. The whole point of this payload is that it ARRIVES; an ' +
        'oversized one is filed away undelivered while the tooling reports success ' +
        '(GATE-FAILS-OPEN). Shrink a section — do not raise the ceiling.');
      return 1;
    }
    if (bytes > SC.promptTargetBytes) {
      console.error('WARNING — ' + bytes + ' bytes is over the target of ' + SC.promptTargetBytes +
        ' (under the ceiling). Shrink the next section that grows.');
    }
  }

  if (catalog.counts.helpers === 0) {
    console.error('WARNING: the catalog read EMPTY — check source.codeGlobs and the registry\'s ' +
      'own counts. A generated index that reads empty is worse than none (false confidence).');
  }
  if (catalog.problems.length) {
    console.error('\n' + catalog.problems.length + ' annotation problem(s):');
    catalog.problems.forEach(p => console.error('  - ' + p));
    return 1;
  }
  return 0;
}

if (require.main === module) process.exit(main());
