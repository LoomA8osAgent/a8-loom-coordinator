// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// example/src/panel.js — a CONSUMER of the units in chrome.js.
//
// It exists so the registry's zero-caller orphan report has something true to say:
// without a live caller every unit in the stand-in codebase reads as an orphan
// candidate, and the catalog would then flag the very unit its own refusals
// recommend. A generated index that is technically correct and practically
// misleading teaches the reader to ignore it.
//
// This block is ALSO what `compile.js` emits from `specs/ui-specs/panel-rows.json`
// (modulo the function name) — pasted here as a real call site, which is exactly the
// workflow the layer prescribes: write the spec, compile it, paste the block.

function exBuildParams(body, items, rebuild) {
  var grp = window.buildSection({ prefix: 'ex', label: 'parameters', collapsed: false });
  window.buildRowHostFromItems({ host: grp.body, items: items, mode: 'edit', onChange: rebuild });
  body.appendChild(grp.section);
  return grp;
}

function exBuildBadge(host) {
  var dots = window.buildDotsPair({ count: 2, tip: 'two states' });
  host.appendChild(dots.wrap);
  return dots;
}

window.exBuildParams = exBuildParams;
window.exBuildBadge = exBuildBadge;
