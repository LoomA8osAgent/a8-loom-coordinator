#!/usr/bin/env node
'use strict';
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// lib/detect.js — SHARED detector lib for the anti-handroll gate stack.
//
// One source of truth for: stdin/payload extraction, the operator-consent token
// read (unforgeable — from the operator's own most-recent message), the code-
// registry parse (known CSS classes + exports), and the "is this edit building
// UI machinery?" signal detector. Consumed by grep-required / new-surface-
// consent / helper-home so their notion of "UI machinery" never drifts apart.
//
// Everything is config-parameterized (via lib/config.js) — no hardcoded paths.

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

// ---- registry parse (known classes + exports) ------------------------------
// Reads the generated code-registry markdown. §5 = CSS classes, §4 = window
// exports, §0–§3 = helper/component/engine names.
function loadRegistry(cfg) {
  const regFile = path.join(cfg.__repoRoot, (cfg.canon && cfg.canon.registryFile) || 'UI-REGISTRY.md');
  let txt = '';
  try { txt = fs.readFileSync(regFile, 'utf8'); }
  catch (e) { return { classes: new Set(), exports: new Set(), ok: false }; }
  const classes = new Set(), exports = new Set();
  const after5 = txt.split(/^## 5\./m)[1] || '';
  for (const m of after5.matchAll(/`\.(-?[A-Za-z_][\w-]*)`/g)) classes.add(m[1]);
  const sec4 = (txt.split(/^## 4\./m)[1] || '').split(/^## 5\./m)[0] || '';
  for (const m of sec4.matchAll(/`([A-Za-z_]\w*)`/g)) exports.add(m[1]);
  const head = txt.split(/^## 4\./m)[0] || '';
  for (const m of head.matchAll(/`([A-Za-z_][\w-]*)`/g)) exports.add(m[1]);
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

// ---- UI-machinery signal detector -------------------------------------------
function detectSignals(nc) {
  const sig = [];
  if (/\b(inputs|INPUTS|getInputs\s*\([^)]*\))\s*\.\s*forEach\b/.test(nc) && /\bsxCreate\s*\(/.test(nc)) {
    sig.push('inputs-forEach-sxCreate');
  }
  if ((nc.match(/createElement\s*\(/g) || []).length >= 3) sig.push('createElement-chain');
  if (domBuildingFn(nc)) sig.push('dom-building-fn');
  return sig;
}

// a NAMED function/method whose body contains createElement (raw DOM builder).
function domBuildingFn(nc) {
  if (/\bfunction\s+[A-Za-z_]\w*\s*\([^)]*\)\s*\{[\s\S]*?createElement\s*\(/.test(nc)) return true;
  if (/\b[A-Za-z_]\w*\s*[:=]\s*function\s*\([^)]*\)\s*\{[\s\S]*?createElement\s*\(/.test(nc)) return true;
  if (/\bprototype\.[A-Za-z_]\w*\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?createElement\s*\(/.test(nc)) return true;
  return false;
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
function newCssClasses(cfg, fp, nc, reg) {
  if (!isStyleOrMarkup(cfg, fp)) return [];
  const found = new Set();
  for (const ln of nc.split('\n')) {
    if (!/[{,]\s*$/.test(ln) && !/\{/.test(ln)) continue;
    for (const m of ln.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
      if (!reg.classes.has(m[1])) found.add(m[1]);
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
  detectSignals, domBuildingFn, callsSharedHelper, newCssClasses, hasOneOffMarker
};
