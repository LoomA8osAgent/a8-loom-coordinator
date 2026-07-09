#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// canon-block — PreToolUse gate for Edit | Write | MultiEdit.
//
// WHY: string-pattern bans for documented failure modes. When a specific literal
// (a native color input, an inline event handler, a retired API name) is known
// to reintroduce a bug, this hook rejects it outside its allowed-file list —
// catching the regression at the edit, not in review. This is the coarse,
// literal-match complement to the semantic anti-handroll gates.
//
// Rules live in cfg.canonBlock.rules — NOT hardcoded (the disease being cured).
// Each rule: { pattern (string → RegExp), flags, allow (path suffixes matched
// with endsWith), code (failure-pattern name), msg (user-facing reason) }.
// Ships with two generic examples in the sample config; add your project's.
//
// Exit 2 → rejected. Exit 0 → proceeds. No config ⇒ no-op.

'use strict';
const path = require('path');
const CFG = require('./lib/config.js');

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(input); } catch (e) { return; }
  const tool = data.tool_name || '';
  if (!['Edit', 'Write', 'MultiEdit'].includes(tool)) return;

  const inp = data.tool_input || {};
  const filePath = inp.file_path || '';
  if (!filePath) return;

  const cfg = CFG.load(filePath);
  if (!cfg) return;
  const rules = (cfg.canonBlock && cfg.canonBlock.rules) || [];
  if (!rules.length) return;

  // Only JS source by default (the sample rules target JS). A rule targeting
  // other file types still works — the endsWith allow-list + pattern govern it.
  if (!/\.js$/.test(filePath) && !/\.(css|html)$/.test(filePath)) return;

  const parts = [];
  if (tool === 'Edit') parts.push(String(inp.new_string || ''));
  if (tool === 'Write') parts.push(String(inp.content || ''));
  if (tool === 'MultiEdit' && Array.isArray(inp.edits)) inp.edits.forEach(e => parts.push(String(e.new_string || '')));
  const combined = parts.join('\n');
  if (!combined) return;

  const violations = [];
  for (const rule of rules) {
    if (!rule || !rule.pattern) continue;
    if ((rule.allow || []).some(sfx => filePath.endsWith(sfx))) continue;
    let re;
    try { re = new RegExp(rule.pattern, rule.flags || ''); } catch (e) { continue; }
    const m = combined.match(re);
    if (m) violations.push({ rule, match: m[0] });
  }
  if (!violations.length) return;

  const lines = [
    'CANON HARD-BLOCK — ' + cfg.project.name + ' Edit/Write rejected.',
    '', 'Tool: ' + tool, 'File: ' + (path.relative(cfg.__repoRoot, filePath) || filePath), '',
    violations.length + ' violation' + (violations.length === 1 ? '' : 's') + ' detected:', ''
  ];
  violations.forEach((v, i) => {
    lines.push('  ' + (i + 1) + '. [' + v.rule.code + ']');
    lines.push('     match: ' + v.match.slice(0, 80) + (v.match.length > 80 ? '…' : ''));
    lines.push('     ' + v.rule.msg);
    lines.push('');
  });
  lines.push('To proceed:');
  lines.push('  - Refactor the edit to use the canonical helper / pattern.');
  lines.push('  - OR add the file path to the rule\'s allow list in stack.config.json');
  lines.push('    (canonBlock.rules) if this file is the new canonical host.');
  lines.push('  - OR retire the rule explicitly if it is wrong.');

  CFG.logGate(cfg, 'canon-block', 'BLOCK', filePath, violations.map(v => v.rule.code).join(','));
  process.stderr.write(lines.join('\n') + '\n');
  process.exit(2);
});
