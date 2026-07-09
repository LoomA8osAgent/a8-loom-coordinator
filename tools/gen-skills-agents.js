#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// gen-skills-agents.js — deploy the project's TRACKED skills + subagents into
// the gitignored `.claude/` so a fresh clone always has them.
//
// WHY: `.claude/skills/` + `.claude/agents/` are machine-local (gitignored), so
// the CANONICAL sources live TRACKED in the repo (default `skills/` + `agents/`)
// and this generator copies them into `.claude/` each session (wired into the
// SessionStart regenerate hook). Claude Code discovers `.claude/` at session
// START — a freshly deployed agent/skill is invocable next session.
//
//   node tools/gen-skills-agents.js [--config <path>]
//   node tools/gen-skills-agents.js --help
//
// Config (optional cfg.skillsAgents): skillsSrc (default "skills"),
// agentsSrc (default "agents"), out (default ".claude"). Idempotent, no deps.

'use strict';
const fs = require('fs');
const path = require('path');

if (process.argv.includes('--help')) {
  console.log('gen-skills-agents — deploy tracked skills/ + agents/ into gitignored .claude/.\n' +
    'Usage: node tools/gen-skills-agents.js [--config <path>]');
  process.exit(0);
}

function loadConfig() {
  const argi = process.argv.indexOf('--config');
  let p = argi >= 0 ? process.argv[argi + 1] : null;
  if (!p) { let d = process.cwd(); while (d && d !== path.dirname(d)) { const c = path.join(d, 'stack.config.json'); if (fs.existsSync(c)) { p = c; break; } d = path.dirname(d); } }
  if (!p || !fs.existsSync(p)) { console.error('gen-skills-agents: no stack.config.json found.'); process.exit(2); }
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  cfg.__repoRoot = (cfg.project && cfg.project.repoRoot) || path.dirname(p);
  return cfg;
}
const CFG = loadConfig();
const ROOT = CFG.__repoRoot;
const SA = CFG.skillsAgents || {};
const CLAUDE = path.join(ROOT, SA.out || '.claude');

function mkdirp(d) { fs.mkdirSync(d, { recursive: true }); }
function copyTree(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) { mkdirp(d); n += copyTree(s, d); }
    else { mkdirp(path.dirname(d)); fs.copyFileSync(s, d); n++; }
  }
  return n;
}

function main() {
  let nSkills = 0, nAgents = 0;
  const skillsSrc = path.join(ROOT, SA.skillsSrc || 'skills');
  const agentsSrc = path.join(ROOT, SA.agentsSrc || 'agents');
  if (fs.existsSync(skillsSrc)) { mkdirp(path.join(CLAUDE, 'skills')); nSkills = copyTree(skillsSrc, path.join(CLAUDE, 'skills')); }
  if (fs.existsSync(agentsSrc)) { mkdirp(path.join(CLAUDE, 'agents')); nAgents = copyTree(agentsSrc, path.join(CLAUDE, 'agents')); }
  console.log('skills/agents deployed to ' + path.relative(ROOT, CLAUDE) + '/: ' + nSkills + ' skill file(s), ' + nAgents + ' agent file(s).');
}
main();
