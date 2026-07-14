#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// lib/config.js — the ONE reason this package is project-agnostic.
//
// Early versions hardcoded an absolute repo root in every file — so a hook could
// only ever govern one machine's one checkout. This resolver instead LOCATES
// stack.config.json at RUNTIME by walking up from the file being edited (or the
// session cwd). Consequences:
//   • zero hardcoded paths — install the hooks once, govern any number of repos;
//   • a repo with no stack.config.json at or above it is simply NOT governed:
//     load() returns null and every hook no-ops (exit 0). Never blocks the
//     unconfigured — the gate is a floor only where a project opted in.
//
// Resolution order:  A8_STACK_CONFIG env var  →  walk-up for stack.config.json.

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

// Sensible fallbacks so a partial config still runs harmlessly. Deep-merged
// UNDER the loaded config (loaded values win).
// All DEFAULTS are LANGUAGE- AND DOMAIN-NEUTRAL. Nothing here assumes a web app,
// a frontend, a specific language, or any particular framework. A project makes
// the gates concrete by supplying its OWN canon surfaces in stack.config.json
// (its helper modules, its registry, its hand-roll shapes). See the two shipped
// examples: stack.config.example.backend.json + stack.config.example.frontend.json.
const DEFAULTS = {
  project: { name: 'project', repoRoot: '', rootMarkers: ['CLAUDE.md'] },
  source: {
    // Neutral: any source tree. A project narrows this to its language(s).
    codeGlobs: ['src/**/*'], styleFiles: [], markupFiles: [],
    exemptDirSegments: ['/tools/', '/tests/', '/node_modules/', '/vendor/', '/target/', '/.claude/'],
    exemptExtensions: ['.md']
  },
  canon: { files: [], specGlobs: [], registryFile: 'CODE-REGISTRY.md', hints: [], helperHomes: [],
    // Which registry sections list REUSABLE SYMBOLS (functions/classes/modules/traits)
    // vs. domain-specific vocabulary (e.g. CSS classes). Both empty = the whole
    // registry is treated as reusable-symbol canon. Frontend projects set classSections.
    symbolSections: [], classSections: [] },
  consent: { tokens: ['new-ok'], oneOffMarker: 'one-off-ok' },
  // machinery — the DISCOVER-THEN-REUSE anti-hand-roll detectors, config-supplied
  // so they work on ANY existing codebase. A project declares the shapes that mean
  // "you are hand-rolling something the codebase already provides":
  //   signals[]      : [{ re, name }] — code shapes that reproduce an existing helper
  //   builderRe      : a regex matching "a new reusable builder/factory" (its author
  //                    must export it to canon, not keep it private) — empty = off
  //   reusableExportRe: a regex matching "a new public/exported symbol" (its addition
  //                    must be registry-consulted) — empty = off
  // ALL EMPTY BY DEFAULT → the anti-hand-roll machinery gates do nothing until a
  // project describes its own canon. Never invents a shape the project didn't declare.
  machinery: { signals: [], builderRe: '', reusableExportRe: '' },
  // frontend — the opt-in CSS/DOM module. When false (default) NO frontend-specific
  // detector runs (new-CSS-class, mount-class, style-layout). A web project sets
  // enabled:true and supplies mountClassRe/layoutPropRe/newClassRe. Backend projects
  // never touch this block. See frontend/README.md.
  frontend: { enabled: false, mountClassRe: '', layoutPropRe: '', newClassRe: '' },
  devServer: { command: '', port: 8080, url: 'http://localhost:8080/' },
  verification: { enabled: false, testApiPrefix: '', allowedCalls: [], browserTools: [] },
  statePersistence: { enabled: false, walkName: 'save walk', trailerName: 'State',
    exemptMarker: 'state-walk-exempt', stateFileGlobs: [], signals: [] },
  docSync: { enabled: false, trailerName: 'Docs', exemptMarker: 'docsync-exempt',
    featureGlobs: [], featureExemptPrefixes: [], pillars: [],
    citationLint: { enabled: false, command: '', specGlobPrefix: '' } },
  satellite: { enabled: false, trailerName: 'Satellite', manifestFile: '' },
  // canonBlock.fileTypes — which extensions the string-ban rules apply to.
  // Empty = apply to every non-exempt source file (language-neutral).
  canonBlock: { rules: [], fileTypes: [] },
  session: { generators: [], deploySkillsAgents: '', delegationHint: '', registryReminder: '' },
  worktree: { guardEnabled: false, dirSegment: '/.claude/worktrees/' },
  artifacts: { enabled: false, sweepRootImages: true, imageExtensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'],
    scratchPatterns: [], keepFiles: [], scratchDirs: ['.playwright-mcp'] },
  install: { hooksDir: '~/.claude/hooks', gateLog: '~/.claude/gate.log',
    settingsTarget: '.claude/settings.json', maxBackups: 2 },
  serviceRecovery: { notifyEnabled: true, notifyCommand: '', logFile: '~/.claude/service-recovery.log', autoResume: false },
  codegraph: { syncEnabled: true, staleThresholdMinutes: 5, binaryCandidates: [] }
};

function expandTilde(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function deepMerge(base, over) {
  if (!isObj(base)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!isObj(over)) return out;
  for (const k of Object.keys(over)) {
    out[k] = isObj(out[k]) && isObj(over[k]) ? deepMerge(out[k], over[k]) : over[k];
  }
  return out;
}

function findConfigFrom(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    const p = path.join(dir, 'stack.config.json');
    try { if (fs.existsSync(p)) return p; } catch (e) {}
    dir = path.dirname(dir);
  }
  return null;
}

function resolveConfigPath(startDir) {
  const env = process.env.A8_STACK_CONFIG;
  if (env && fs.existsSync(env)) return env;
  return findConfigFrom(startDir || process.cwd());
}

// Load config anchored at startDir (an abs file path or dir). Returns the merged
// config with two computed fields, or null if no config governs startDir.
//   __configPath — absolute path to stack.config.json
//   __repoRoot   — project.repoRoot or (default) the config file's directory
function load(startDir) {
  let anchor = startDir || process.cwd();
  try { if (fs.existsSync(anchor) && fs.statSync(anchor).isFile()) anchor = path.dirname(anchor); }
  catch (e) {}
  const cfgPath = resolveConfigPath(anchor);
  if (!cfgPath) return null;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) { return null; }
  const cfg = deepMerge(DEFAULTS, raw);
  cfg.__configPath = cfgPath;
  cfg.__repoRoot = (cfg.project && cfg.project.repoRoot) || path.dirname(cfgPath);
  return cfg;
}

// ---- gate pass/block logging ------------------------------------------------
// Hooks are SILENT on pass → no proof they ran. logGate appends one line per
// real adjudication so "are the gates live" is observable:
//   tail <install.gateLog>   →   ts | hook | PASS/BLOCK | file | detail
// NEVER throws — a logging failure must never block an edit. Self-bounding.
function logGate(cfg, hook, status, filePath, detail) {
  try {
    const logPath = expandTilde((cfg && cfg.install && cfg.install.gateLog) || '~/.claude/a8-gate.log');
    const root = (cfg && cfg.__repoRoot) || '';
    const rel = filePath && root && filePath.indexOf(root) === 0 ? filePath.slice(root.length + 1) : (filePath || '');
    const line = new Date().toISOString() + ' | ' + hook + ' | ' + status +
      ' | ' + rel + (detail ? ' | ' + detail : '') + '\n';
    try {
      const st = fs.existsSync(logPath) ? fs.statSync(logPath) : null;
      if (st && st.size > 262144) {
        const tail = fs.readFileSync(logPath, 'utf8').split('\n').slice(-200).join('\n');
        fs.writeFileSync(logPath, tail);
      }
    } catch (e) {}
    fs.appendFileSync(logPath, line);
  } catch (e) {}
}

module.exports = { load, expandTilde, deepMerge, DEFAULTS, logGate };
