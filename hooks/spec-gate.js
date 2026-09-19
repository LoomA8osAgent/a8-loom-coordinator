#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// spec-gate — PreToolUse gate for Edit | Write | MultiEdit.
//
// WHY: the other edit gates refuse AFTER a freehand surface is written — they
// adjudicate prose the model has already produced, and the cost is a refusal, a
// retry, and (when the shape slips past a NAME check) a duplicate that ships. This
// gate is the CONSTRAINT-BEFORE half: a builder emits a `{helper, props, children}`
// spec that can only name catalog entries, `tools/spec-catalog/compile.js` turns it
// into real calls and writes an HMAC'd receipt, and an edit that ADDS a new surface
// must be byte-contained in one. The freehand path stops being expressible.
// Method doc: integrations/spec-catalog.md.
//
// TWO RULES:
//
//   R1  BUILD-TOOLING-STAYS-OUT-OF-THE-APP   (specCatalog.appScopeRe)
//       The vendored json-render packages are build tooling. A require/import of
//       them inside the application scope is REFUSED: what crosses into the app is
//       the compiler's OUTPUT (plain calls into the project's own code), never the
//       compiler's dependencies. Empty `appScopeRe` ⇒ inert, by design (a project
//       with no such boundary is not made to invent one).
//
//   R2  THE RECEIPT TEST
//       An edit inside the gate's scope that ADDS a new surface — detected by the
//       SHARED detector (machinery.signals / the new-class shapes), never a second
//       one — must be byte-contained in a compile receipt whose catalogSha equals the
//       live catalog's and whose HMAC verifies. The refusal carries THE CATALOG ENTRY
//       THAT COVERS THE NEED, because a rule in a refusal is a wall and "spec first"
//       is not an answer.
//
// WHAT R2 CANNOT SEE, stated rather than implied: a logic-only edit, and a block of
// pure catalog calls. Neither adds new-surface machinery, so neither trips the
// detector — that is the layer's THESIS (the backstop finds nothing because there is
// nothing to find), not a hole. The red-fixture proves the receipt is DECISIVE by
// giving four verdicts to IDENTICAL bytes: no receipt → DENY, forged HMAC → DENY,
// stale catalog → DENY, fresh valid receipt → PASS.
//
// THE ONE ESCAPE is the operator's own consent token, read from the transcript by the
// same `D.hasConsent` every other gate uses. No second escape is minted.
//
// Config-driven and project-agnostic like every hook here: no config, or
// `specCatalog.enabled:false`, ⇒ no-op (exit 0). Exit 2 ⇒ rejected.

'use strict';
const path = require('path');
const CFG = require('./lib/config.js');
const D = require('./lib/detect.js');

function rx(src, flags) { try { return src ? new RegExp(src, flags || '') : null; } catch (e) { return null; } }

// Crude comment strip (line tails + block comments), the same shape canon-block uses.
// A rule must fire on INTRODUCE, never on READ: a comment pointing AT the compiler is
// the correct thing to find in an application file.
function stripComments(src) {
  const out = [];
  let inBlock = false;
  src.split('\n').forEach(raw => {
    let line = raw;
    if (inBlock) {
      const e = line.indexOf('*/');
      if (e === -1) return;
      line = line.slice(e + 2); inBlock = false;
    }
    let bs;
    while ((bs = line.indexOf('/*')) !== -1) {
      const be = line.indexOf('*/', bs);
      if (be === -1) { line = line.slice(0, bs); inBlock = true; break; }
      line = line.slice(0, bs) + ' ' + line.slice(be + 2);
    }
    const i = line.indexOf('//');
    if (i !== -1) {
      const head = line.slice(0, i);
      if ((head.match(/['"`]/g) || []).length % 2 === 0) line = head;
    }
    out.push(line);
  });
  return out.join('\n');
}

// require('@json-render/x') · import … from '…' · import '…' · await import('…'),
// scoped and bare forms.
const BUILD_TOOLING_RE = /(?:require|from|import)\s*\(?\s*['"][^'"]*@?json-render/;

// Does this path fall inside the gate's R2 scope? `specCatalog.gateScopeGlobs` when
// declared, else `source.codeGlobs` + `source.styleFiles`. Suffix matching only, the
// same shape lib/detect.js uses — an unstated boundary is how a guard gets trusted
// past its reach, so the refusal prints the scope it applied.
function inScope(cfg, sc, fp) {
  const globs = (sc.gateScopeGlobs && sc.gateScopeGlobs.length)
    ? sc.gateScopeGlobs
    : ((cfg.source && cfg.source.codeGlobs) || []).concat((cfg.source && cfg.source.styleFiles) || []);
  const rel = fp.indexOf(cfg.__repoRoot) === 0 ? fp.slice(cfg.__repoRoot.length + 1) : fp;
  return globs.some(g => {
    const star = g.indexOf('*');
    if (star === -1) return rel === g || fp.endsWith(g);
    const head = g.slice(0, star).replace(/\/$/, '');
    const ext = g.slice(g.lastIndexOf('.'));
    const extOk = /^\.[A-Za-z0-9]+$/.test(ext) ? fp.endsWith(ext) : true;
    return extOk && (!head || rel.indexOf(head) === 0);
  });
}

(function main() {
  let data;
  try { data = JSON.parse(D.readStdin()); } catch (e) {
    // FAIL CLOSED on an unreadable payload only when it is plausibly in scope — and
    // here we cannot tell, so we exit 0 exactly like every other hook does on a
    // malformed envelope. (The project's own dispatcher owns the fail-closed policy
    // for unparseable stdin; duplicating a second one here would make two.)
    return;
  }
  const tool = data.tool_name;
  if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) return;

  const input = data.tool_input || {};
  const filePath = input.file_path || '';
  if (!filePath) return;

  const cfg = CFG.load(filePath);
  if (!cfg) return;                                   // repo not governed
  const sc = cfg.specCatalog || {};
  if (!sc.enabled) return;                            // layer not adopted ⇒ inert
  if (D.isExemptFile(cfg, filePath)) return;

  const nc = D.newContentOf(tool, input);
  if (!nc) return;

  const rel = filePath.indexOf(cfg.__repoRoot) === 0
    ? filePath.slice(cfg.__repoRoot.length + 1) : filePath;
  const catDir = path.resolve(cfg.__repoRoot, sc.catalogDir || 'tools/spec-catalog');

  // ---- R1 -------------------------------------------------------------------
  const appRe = rx(sc.appScopeRe);
  if (appRe && appRe.test(filePath) && BUILD_TOOLING_RE.test(stripComments(nc))) {
    CFG.logGate(cfg, 'spec-gate', 'BLOCK', filePath, 'build-tooling-in-app');
    process.stderr.write([
      'SPEC GATE — ' + tool + ' rejected: build tooling reached the application scope.',
      '',
      'File: ' + rel,
      'Rule: BUILD-TOOLING-STAYS-OUT-OF-THE-APP  (specCatalog.appScopeRe)',
      '',
      'json-render is vendored NODE-SIDE build tooling (' + sc.catalogDir + '/vendor/). The',
      'application has — and must keep — zero dependency on it: what crosses into the app is',
      'the COMPILER OUTPUT, plain calls into your own code, which is exactly what the other',
      'gates expect to see.',
      '',
      'Compile the spec instead:',
      '  node ' + sc.catalogDir + '/compile.js ' + (sc.specDir || 'specs/ui-specs') + '/<name>.json',
      'then paste the emitted block.'
    ].join('\n') + '\n');
    process.exit(2);
  }

  // ---- R2 -------------------------------------------------------------------
  if (!inScope(cfg, sc, filePath)) {
    CFG.logGate(cfg, 'spec-gate', 'PASS', filePath, 'out-of-scope');
    return;
  }

  // Does this edit ADD a new surface? The SHARED detector answers, never a second
  // one, so "what counts as new-surface machinery" can never drift between this gate
  // and new-surface-consent. Comments are stripped on the code side for the same
  // reason R1 strips them; the style side is not (the class scanner handles its own
  // comment syntax, and a code stripper would mangle CSS).
  const isStyle = D.isStyleOrMarkup(cfg, filePath);
  const signals = D.detectSignals(cfg, isStyle ? nc : stripComments(nc));
  const reg = D.loadRegistry(cfg);
  const newCls = reg.ok ? D.newCssClasses(cfg, filePath, nc, reg) : [];

  if (!signals.length && !newCls.length) {
    CFG.logGate(cfg, 'spec-gate', 'PASS', filePath, 'no-new-surface');
    return;
  }

  // THE LAYER MUST BE READABLE OR THE GATE REFUSES. A verifier that cannot load its
  // own receipt library has not found "no violation" — it has found NOTHING, and
  // reporting that as a pass is GATE-FAILS-OPEN by construction.
  let receipts, cover;
  try {
    receipts = require(path.join(catDir, 'receipt.js'));
    cover = require(path.join(catDir, 'cover.js'));
  } catch (e) {
    CFG.logGate(cfg, 'spec-gate', 'BLOCK', filePath, 'layer-unreadable');
    process.stderr.write([
      'SPEC GATE — ' + tool + ' rejected: the spec-catalog layer is unreadable.',
      '',
      'File: ' + rel,
      'Detected: ' + signals.concat(newCls.map(c => 'new-class:.' + c)).join(', '),
      'Error: ' + (e && e.message),
      '',
      sc.catalogDir + '/{receipt,cover}.js + catalog.json must load for this gate to judge a',
      'new-surface edit. A gate that cannot check may not pass (GATE-FAILS-OPEN).',
      'Run: node tools/gen-catalog.js'
    ].join('\n') + '\n');
    process.exit(2);
  }

  const all = receipts.loadAll();
  const hit = receipts.covers(nc, all.valid);
  if (hit) {
    CFG.logGate(cfg, 'spec-gate', 'PASS', filePath,
      'receipt:' + String(hit.emittedSha).slice(0, 12));
    return;
  }

  // Checked AFTER coverage on purpose: a receipted edit needs no token, so the token
  // is never the thing that cleared a compiled block.
  if (D.hasConsent(cfg, data.transcript_path)) {
    CFG.logGate(cfg, 'spec-gate', 'PASS', filePath, 'consent');
    return;
  }

  const detected = signals.slice();
  if (newCls.length) {
    detected.push('new class' + (newCls.length > 1 ? 'es' : '') + ': ' +
      newCls.slice(0, 8).map(c => '.' + c).join(' ') + (newCls.length > 8 ? ' …' : ''));
  }

  const msg = [
    'SPEC GATE — ' + tool + ' rejected: a new surface was added without a compiled spec.',
    '',
    'File: ' + rel,
    'Detected: ' + detected.join(' · '),
    ''
  ];

  if (signals.length) {
    msg.push('THE CATALOG ENTRY THAT COVERS THIS:');
    msg.push(cover.renderCover(cover.coverFor({ signals: signals, text: nc }), '  '));
    msg.push('');
  }
  if (newCls.length) {
    msg.push('THE VOCABULARY YOU ARE MINTING:');
    newCls.slice(0, 6).forEach(c => msg.push(cover.renderClassCover(c, cover.classCover(c), '  ')));
    msg.push('');
    msg.push('  NEW-CLASS-WITHOUT-CONSENT: the compiler emits only classes a catalog entry');
    msg.push('  OWNS. Genuinely-new vocabulary needs the operator\'s express consent.');
    msg.push('');
  }

  // Why the receipts on disk did not clear it — STALE and FORGED are different
  // answers, and the actionable one must not be reported as "none found".
  if (all.present) {
    msg.push('RECEIPTS ON DISK: ' + all.present + ' · ' + all.valid.length + ' valid · ' +
      all.rejected.length + ' rejected');
    all.rejected.slice(0, 4).forEach(r => msg.push('  ✗ ' + String(r.file).slice(0, 12) + '… ' +
      (r.spec ? '(' + r.spec + ') ' : '') + r.why));
    if (all.valid.length) {
      msg.push('  the valid receipt' + (all.valid.length > 1 ? 's do' : ' does') +
        ' not CONTAIN this content — a near-copy of compiler output is not compiler output');
    }
    msg.push('');
  } else {
    msg.push('RECEIPTS ON DISK: none.');
    msg.push('');
  }

  const specDir = sc.specDir || 'specs/ui-specs';
  msg.push('DO THIS:');
  msg.push('  1. write ' + specDir + '/<name>.json naming that entry');
  msg.push('  2. node ' + sc.catalogDir + '/validate.js ' + specDir + '/<name>.json   → 0 issues');
  msg.push('  3. node ' + sc.catalogDir + '/compile.js  ' + specDir + '/<name>.json');
  msg.push('  4. paste the emitted block verbatim, then syntax-check the file');
  msg.push('  Operator consent (' + ((cfg.consent && cfg.consent.tokens) || []).join(' / ') +
    ') clears this gate for a hand edit.');

  CFG.logGate(cfg, 'spec-gate', 'BLOCK', filePath,
    detected.length + ' signal(s) · receipts ' + all.valid.length + 'v/' + all.rejected.length + 'x');
  process.stderr.write(msg.join('\n') + '\n');
  process.exit(2);
})();
