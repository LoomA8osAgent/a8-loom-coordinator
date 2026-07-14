#!/usr/bin/env node
'use strict';
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// lib/detect.js — SHARED detector lib for the anti-hand-roll gate stack.
//
// One source of truth for: stdin/payload extraction, the operator-consent token
// read (unforgeable — from the operator's own most-recent message), the code-
// registry parse (reusable symbols [+ optional CSS classes]), and the "is this
// edit HAND-ROLLING something the codebase already provides?" signal detector.
// Consumed by grep-required / new-surface-consent / helper-home so their notion
// of "reusable-unit machinery" never drifts apart.
//
// Everything is config-parameterized (via lib/config.js) — NO hardcoded language,
// framework, or domain idiom. The anti-hand-roll signals a project cares about are
// DECLARED by that project in stack.config.json (machinery.signals / builderRe /
// reusableExportRe); CSS/DOM detection runs only when frontend.enabled. Empty
// config → the detector reports nothing (never invents a shape).

const fs = require('fs');
const path = require('path');

// ---- stdin / payload --------------------------------------------------------
function readStdin() { try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; } }

function newContentOf(tool, input) {
  if (!input) return '';
  if (tool === 'Write') return String(input.content || '');
  if (tool === 'Edit') return String(input.new_string || '');
  if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits.map(ed => String(ed.new_string || '')).join('\n');
  }
  return '';
}

// ---- operator consent token (unforgeable — reads the transcript) ------------
// Text of the most-recent REAL user message (a text block, not a tool_result).
// The model cannot forge this — it is the operator's own words.
function userMessageText(txPath) {
  if (!txPath || !fs.existsSync(txPath)) return '';
  let lines;
  try { lines = fs.readFileSync(txPath, 'utf8').trim().split('\n'); } catch (e) { return ''; }
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    const role = (e.message && e.message.role) || e.type;
    if (role !== 'user') continue;
    const content = e.message && e.message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const txt = content.filter(c => c && (c.type === 'text' || typeof c === 'string'))
        .map(c => (typeof c === 'string' ? c : c.text || '')).join('\n');
      if (txt.trim()) return txt;
    }
  }
  return '';
}

// any of cfg.consent.tokens in the operator's own message → consent.
function hasConsent(cfg, txPath) {
  const t = userMessageText(txPath).toLowerCase();
  const toks = (cfg.consent && cfg.consent.tokens) || [];
  return toks.some(tok => new RegExp('\\b' + tok.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t));
}

// ---- registry parse (reusable symbols [+ optional CSS classes]) -------------
// Reads the generated code-registry markdown. Any `backtick` token is a known
// reusable symbol (function / class / module / helper / trait). CSS-class parsing
// (a leading-dot token in a §5 section) runs ONLY when frontend.enabled — a
// backend registry simply has no classes, and `classes` stays empty (harmless).
function loadRegistry(cfg) {
  const regFile = path.join(cfg.__repoRoot, (cfg.canon && cfg.canon.registryFile) || 'CODE-REGISTRY.md');
  let txt = '';
  try { txt = fs.readFileSync(regFile, 'utf8'); }
  catch (e) { return { classes: new Set(), exports: new Set(), ok: false }; }
  const classes = new Set(), exports = new Set();
  const feOn = !!(cfg.frontend && cfg.frontend.enabled);
  if (feOn) {
    // CSS classes: a `.token` in the classSections (default: a "## 5." section).
    const after5 = txt.split(/^## 5\./m)[1] || '';
    for (const m of after5.matchAll(/`\.(-?[A-Za-z_][\w-]*)`/g)) classes.add(m[1]);
  }
  // Reusable symbols: every backtick-quoted identifier in the registry.
  for (const m of txt.matchAll(/`([A-Za-z_][\w-]*)`/g)) exports.add(m[1]);
  return { classes, exports, ok: classes.size > 0 || exports.size > 0 };
}

// ---- file-scope exemptions --------------------------------------------------
function isExemptFile(cfg, fp) {
  if (!fp || fp.indexOf(cfg.__repoRoot) !== 0) return true;   // outside project
  const exts = (cfg.source && cfg.source.exemptExtensions) || [];
  if (exts.some(e => fp.toLowerCase().endsWith(e))) return true;
  const segs = (cfg.source && cfg.source.exemptDirSegments) || [];
  if (segs.some(s => fp.indexOf(s) >= 0)) return true;
  return false;
}

function isHelperHome(cfg, fp) {
  const homes = (cfg.canon && cfg.canon.helperHomes) || [];
  return homes.some(s => fp.endsWith(s));
}

// is fp a code file we gate? (matches cfg.source.codeGlobs suffix, e.g. js/**/*.js → .js)
function isCodeFile(cfg, fp) {
  const globs = (cfg.source && cfg.source.codeGlobs) || [];
  return globs.some(g => {
    const ext = g.slice(g.lastIndexOf('.'));
    return /^\.[A-Za-z0-9]+$/.test(ext) && fp.endsWith(ext);
  });
}

function isStyleOrMarkup(cfg, fp) {
  const files = ((cfg.source && cfg.source.styleFiles) || []).concat((cfg.source && cfg.source.markupFiles) || []);
  return files.some(f => fp.endsWith(f));
}

// ---- hand-roll signal detector (config-driven, project-declared) ------------
// A project declares the shapes that mean "you are re-building something the
// codebase already provides" in cfg.machinery.signals[] = [{ re, name }]. NOTHING
// is hardcoded: no config signals → no detections. This is what makes the
// discover-then-reuse gate work on ANY existing codebase — the project describes
// its own hand-roll shapes (a raw SQL string where a query-builder exists, a
// hand-written DOM builder where a component factory exists, a re-implemented
// util, etc.).
function _compile(re) { try { return new RegExp(re); } catch (e) { return null; } }

function detectSignals(cfg, nc) {
  const sig = [];
  const sigs = (cfg.machinery && cfg.machinery.signals) || [];
  for (const s of sigs) {
    if (!s || !s.re) continue;
    const rx = _compile(s.re);
    if (rx && rx.test(nc)) sig.push(s.name || s.re);
  }
  if (builderFn(cfg, nc)) sig.push('reusable-builder-fn');
  return sig;
}

// cfg.machinery.builderRe is the COMPLETE regex identifying "a new reusable
// builder/factory being defined" IN THIS PROJECT'S LANGUAGE — e.g. a JS
// `function \w+ ... createElement`, a Python `def build_`, a Rust `fn build_`.
// The project owns the full shape so nothing is language-assumed here. Empty → off.
function builderFn(cfg, nc) {
  const src = (cfg.machinery && cfg.machinery.builderRe) || '';
  const rx = src && _compile(src);
  return rx ? rx.test(nc) : false;
}

// does the new content CONSUME a shared helper? (escape — a wiring method, not a raw builder)
function callsSharedHelper(cfg, nc) {
  const hints = (cfg.canon && cfg.canon.hints) || [];
  // a shared-helper CALL is a hint token immediately followed by an identifier char / '(' / '.'
  return hints.some(h => {
    const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + esc + '\\w*\\s*[.(]').test(nc);
  });
}

// new CSS classes in a style/markup edit not present in the registry.
// FRONTEND-ONLY: returns [] unless frontend.enabled. A project may override the
// class-detection regex via cfg.frontend.newClassRe (default: a `.class {` shape).
function newCssClasses(cfg, fp, nc, reg) {
  if (!(cfg.frontend && cfg.frontend.enabled)) return [];
  if (!isStyleOrMarkup(cfg, fp)) return [];
  const rx = (cfg.frontend.newClassRe && _compile(cfg.frontend.newClassRe)) || /\.(-?[A-Za-z_][\w-]*)/g;
  const found = new Set();
  for (const ln of nc.split('\n')) {
    if (!/[{,]\s*$/.test(ln) && !/\{/.test(ln)) continue;
    for (const m of ln.matchAll(new RegExp(rx.source, 'g'))) {
      if (m[1] && !reg.classes.has(m[1])) found.add(m[1]);
    }
  }
  return [...found];
}

function hasOneOffMarker(cfg, nc) {
  const mk = (cfg.consent && cfg.consent.oneOffMarker) || 'one-off-ok';
  return new RegExp('//\\s*' + mk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(nc);
}

module.exports = {
  readStdin, newContentOf, userMessageText, hasConsent,
  loadRegistry, isExemptFile, isHelperHome, isCodeFile, isStyleOrMarkup,
  detectSignals, builderFn, callsSharedHelper, newCssClasses, hasOneOffMarker
};
