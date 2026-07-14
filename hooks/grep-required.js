#!/usr/bin/env node
// A8 Coordinator Stack — MIT License. (c) 2026 contributors.
//
// grep-required — PreToolUse gate for Edit | Write | MultiEdit.
//
// WHY: catches the "didn't even look" bypass (NO-GREP-PROOF / HELPER-HAND-ROLL).
// A model reasoning from memory reinvents helpers that already exist. This gate
// forces a canon-relevant search THIS TURN before any code edit lands.
//
// TWO gates, both keyed off the current turn (since the last real user message):
//   GATE 1 — at least one canon-relevant Grep/read this turn (query matches a
//            cfg.canon.hints substring). Proves you searched shared helpers/canon.
//   GATE 2 — a UI-machinery edit ALSO requires the code registry to have been
//            consulted this turn (a Read of the registry file, or a grep naming
//            it). GATE 1 only proves "grepped SOMETHING canon-shaped"; GATE 2
//            ties the proof to the registry that lists the helper you'd reinvent.
//
// Config-driven: canon hints, registry file, code globs, exemptions. No config
// governing the edited file ⇒ no-op (exit 0). Exit 2 → rejected.

'use strict';
const fs = require('fs');
const path = require('path');
const CFG = require('./lib/config.js');
const D = require('./lib/detect.js');

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
  if (!cfg) return;                                    // unconfigured → no gate
  if (D.isExemptFile(cfg, filePath)) return;
  if (!D.isCodeFile(cfg, filePath) && !D.isStyleOrMarkup(cfg, filePath)) return;

  const tx = data.transcript_path;
  if (!tx || !fs.existsSync(tx)) return;

  const HINTS = (cfg.canon && cfg.canon.hints) || [];
  const regFile = (cfg.canon && cfg.canon.registryFile) || 'CODE-REGISTRY.md';
  const regRe = new RegExp(regFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  function scanTranscript(txPath) {
    txPath = txPath || tx;
    let lines;
    try { lines = fs.readFileSync(txPath, 'utf8').trim().split('\n'); } catch (e) { return null; }
    let turnStart = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      let e; try { e = JSON.parse(lines[i]); } catch { continue; }
      const role = (e.message && e.message.role) || e.type;
      if (role === 'user' && e.message && Array.isArray(e.message.content)) {
        if (e.message.content.some(c => c.type === 'text' || typeof c === 'string')) { turnStart = i; break; }
      } else if (role === 'user' && typeof (e.message && e.message.content) === 'string') { turnStart = i; break; }
    }
    let canonGrepFound = false, anyGrepFound = false, registryConsulted = false;
    for (let i = turnStart + 1; i < lines.length; i++) {
      let e; try { e = JSON.parse(lines[i]); } catch { continue; }
      const content = (e.message && e.message.content) || [];
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== 'tool_use') continue;
        if (c.name === 'Read') {
          if (regRe.test(String(c.input && c.input.file_path || ''))) registryConsulted = true;
          continue;
        }
        let q = '';
        if (c.name === 'Grep') {
          anyGrepFound = true;
          q = String(c.input && c.input.pattern || '') + ' ' + String(c.input && c.input.path || '') + ' ' + String(c.input && c.input.glob || '');
        } else if (c.name === 'Bash') {
          const cmd = String(c.input && c.input.command || '');
          if (/\b(grep|git\s+grep|rtk\s+grep|rg|codegraph)\b/.test(cmd)) { anyGrepFound = true; q = cmd; }
        } else if (c.name === 'mcp__codegraph__codegraph_explore') {
          anyGrepFound = true; q = String(c.input && c.input.query || '');
        }
        if (!q) continue;
        const ql = q.toLowerCase();
        if (regRe.test(ql)) registryConsulted = true;
        if (!canonGrepFound) {
          for (const h of HINTS) { if (ql.indexOf(h.toLowerCase()) >= 0) { canonGrepFound = true; break; } }
        }
      }
    }
    return { canonGrepFound, anyGrepFound, registryConsulted };
  }

  function sleepMs(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) {} }

  let scan = scanTranscript();
  if (!scan) return;

  // Subagent transcript flush-race: a just-issued Bash/Grep tool_use may not be
  // flushed to disk when this PreToolUse reads. Only on the would-block path,
  // only for a subagent transcript, retry a few times to let the flush land.
  if (!scan.canonGrepFound && /\/subagents\/agent-/.test(tx)) {
    for (let r = 0; r < 4 && !scan.canonGrepFound; r++) { sleepMs(120); const re = scanTranscript(); if (re) scan = re; }
  }
  // Concurrent-subagent mis-route: with ≥2 subagents the harness may hand this
  // hook the PARENT transcript, hiding the caller's greps. Scan recently-active
  // sibling subagent transcripts. Does NOT loosen the gate — a fleet where
  // nobody grepped still blocks.
  if (!scan.canonGrepFound && !/\/subagents\/agent-/.test(tx)) {
    const subDir = path.join(tx.replace(/\.jsonl$/, ''), 'subagents');
    let cands = [];
    try {
      cands = fs.readdirSync(subDir).filter(f => /^agent-.*\.jsonl$/.test(f))
        .map(f => { const p = path.join(subDir, f); let mt = 0; try { mt = fs.statSync(p).mtimeMs; } catch (e) {} return { p, mt }; })
        .filter(c => Date.now() - c.mt < 15 * 60 * 1000).sort((a, b) => b.mt - a.mt).slice(0, 8);
    } catch (e) {}
    for (const c of cands) {
      const sub = scanTranscript(c.p);
      if (sub && sub.canonGrepFound) {
        scan = { canonGrepFound: true, anyGrepFound: scan.anyGrepFound || sub.anyGrepFound, registryConsulted: scan.registryConsulted || sub.registryConsulted };
        break;
      }
    }
  }

  let { canonGrepFound, anyGrepFound, registryConsulted } = scan;

  if (!canonGrepFound) {
    const out = [
      'CANON HARD-BLOCK — ' + tool + ' rejected: no canon-relevant search this turn.',
      '', 'File: ' + path.relative(cfg.__repoRoot, filePath), '',
      'Would Edit/Write without first searching for existing shared helpers /',
      'canonical patterns (HELPER-HAND-ROLL + NO-GREP-PROOF).', '',
      'Required: at least one Grep / Bash grep / codegraph_explore this turn whose',
      'query matches a canon hint. Hints: ' + HINTS.slice(0, 16).join(', '),
      '', 'Then re-issue ' + tool + '.'
    ];
    if (anyGrepFound) out.splice(6, 0, 'NOTE: a search ran but its query matched no canon hint. Search canon-relevant.', '');
    CFG.logGate(cfg, 'grep-required', 'BLOCK', filePath, 'no-canon-grep');
    process.stderr.write(out.join('\n') + '\n');
    process.exit(2);
  }

  const nc = D.newContentOf(tool, inp);
  const reg = D.loadRegistry(cfg);
  const isReusableMachinery = D.detectSignals(cfg, nc).length > 0 || (reg.ok && D.newCssClasses(cfg, filePath, nc, reg).length > 0);

  if (isReusableMachinery && !registryConsulted) {
    process.stderr.write([
      'REGISTRY-CHECK HARD-BLOCK — ' + tool + ' rejected: reusable-unit edit, ' + (cfg.canon.registryFile) + ' not consulted this turn.',
      '', 'File: ' + path.relative(cfg.__repoRoot, filePath), '',
      'This edit hand-rolls something the codebase may already provide (a declared',
      'hand-roll shape, a new reusable builder, or a new registry vocabulary item).',
      'Scan the registry of everything already built BEFORE building it — a',
      'canon-shaped grep elsewhere is not enough.', '',
      'Required (any ONE, this turn):',
      '  Read  ' + (cfg.canon.registryFile) + '     (scan the task→helper map, then the symbol/class index)',
      '  Grep  "<the helper you might reinvent>" ' + (cfg.canon.registryFile),
      '', 'Then re-issue ' + tool + '. If genuinely NOT in the registry, it is NEW —',
      'get the operator\'s consent first (' + (cfg.consent.tokens || []).join(' / ') + ').'
    ].join('\n') + '\n');
    CFG.logGate(cfg, 'grep-required', 'BLOCK', filePath, 'registry-not-consulted');
    process.exit(2);
  }

  CFG.logGate(cfg, 'grep-required', 'PASS', filePath, isReusableMachinery ? 'reusable-machinery+registry' : 'canon-grep');
});
