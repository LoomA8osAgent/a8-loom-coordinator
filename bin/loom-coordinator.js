#!/usr/bin/env node
// a8-loom-coordinator — CLI entry. MIT License.
//
//   npx a8-loom-coordinator init      # scaffold stack.config.json in the current repo
//   npx a8-loom-coordinator install   # deploy the hook stack (runs hooks/install-hooks.sh)
//   npx a8-loom-coordinator --help
//
// The package is a governance/skills/hooks stack. `init` drops a neutral
// stack.config.json you fill in; `install` wires the hooks. See README.md.

'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PKG_ROOT = path.resolve(__dirname, '..');
const CWD = process.cwd();
const cmd = process.argv[2] || 'help';

function say(s) { process.stdout.write(s + '\n'); }

function help() {
  say(`a8-loom-coordinator — a reusable senior-engineer seat for LLM coordinators.

Usage:
  npx a8-loom-coordinator init       Scaffold a stack.config.json in this repo.
  npx a8-loom-coordinator install    Deploy the hook stack (hooks/install-hooks.sh).
  npx a8-loom-coordinator examples   List the shipped example configs.
  npx a8-loom-coordinator --help     This message.

After init: fill stack.config.json with YOUR project's canon (helper modules,
registry file, hand-roll shapes). Frontend or backend, any language — the gates
enforce discover-then-reuse against what you declare. Full docs: README.md.
Repo: https://github.com/LoomA8osAgent/a8-loom-coordinator`);
}

function init() {
  const dest = path.join(CWD, 'stack.config.json');
  if (fs.existsSync(dest)) {
    say('stack.config.json already exists here — not overwriting. Edit it directly.');
    return;
  }
  const tpl = path.join(PKG_ROOT, 'stack.config.json');
  fs.copyFileSync(tpl, dest);
  say('Wrote stack.config.json (neutral template) to ' + dest);
  say('');
  say('Next:');
  say('  1. Fill it with your project canon. Start from the nearest example:');
  say('       ' + path.join(PKG_ROOT, 'stack.config.example.backend.json'));
  say('       ' + path.join(PKG_ROOT, 'stack.config.example.frontend.json'));
  say('  2. npx a8-loom-coordinator install   # wire the hooks');
  say('  3. Read README.md + governance/ templates.');
}

function install() {
  const sh = path.join(PKG_ROOT, 'hooks', 'install-hooks.sh');
  if (!fs.existsSync(sh)) { say('install-hooks.sh not found in package.'); process.exit(1); }
  try {
    execFileSync('bash', [sh], { stdio: 'inherit', cwd: CWD });
  } catch (e) {
    say('install-hooks.sh failed: ' + (e.message || e));
    process.exit(1);
  }
}

function examples() {
  ['stack.config.example.backend.json', 'stack.config.example.frontend.json'].forEach(f => {
    say(f + '  →  ' + path.join(PKG_ROOT, f));
  });
}

switch (cmd) {
  case 'init': init(); break;
  case 'install': install(); break;
  case 'examples': examples(); break;
  case '-h': case '--help': case 'help': default: help(); break;
}
