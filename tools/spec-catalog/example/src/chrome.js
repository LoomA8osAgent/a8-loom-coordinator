// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// example/src/chrome.js — a tiny STAND-IN codebase for the spec-catalog example.
//
// This is not a library anyone should use; it exists so `tools/gen-catalog.js`,
// `validate.js`, `compile.js` and `hooks/spec-gate.js` have a real corpus to run
// against on a fresh clone — the layer's own red-fixture needs a catalog, and a
// catalog needs code. Two units are ANNOTATED (declared tier) and one is not
// (derived tier), so both tiers appear in the generated catalog and both code paths
// are exercised by the shipped proofs.
//
// Read it as the shape your OWN project's registry-indexed units already have: a
// name the registry scan finds, an options object, and (frontend projects) classes
// the unit itself writes.

/** @catalog
 *  desc:  a titled section with a body — the ONE section wrapper
 *  prop   prefix: string!         module prefix stamped onto the section classes
 *  prop   label: string!          the header text
 *  prop   collapsed: bool         start closed
 *  slots: body, header            children mount into these
 */
function buildSection(opts) {
  var section = document.createElement('div');
  section.className = 'ex-section';
  var header = document.createElement('div');
  header.className = 'ex-section-hd';
  header.textContent = opts.label;
  var body = document.createElement('div');
  body.classList.add('ex-section-body');
  if (opts.collapsed) section.classList.add('is-collapsed');
  section.appendChild(header);
  section.appendChild(body);
  return { section: section, header: header, body: body, prefix: opts.prefix };
}

/** @catalog
 *  desc:  param rows for any section or panel (the ONE row host)
 *  prop   host: element!          host element the rows mount into
 *  prop   items: any!             row descriptors ({name, min, max, value})
 *  prop   mode: enum(edit|view)   which affordances are wired
 *  prop   onChange: fn            rebuild callback
 *  slots: none                    (rows come from `items`, never from children)
 */
function buildRowHostFromItems(opts) {
  var rows = [];
  (opts.items || []).forEach(function (it) {
    var row = document.createElement('div');
    row.className = 'ex-param-row';
    if (opts.mode === 'view') row.classList.add('is-readonly');
    row.textContent = it.name;
    opts.host.appendChild(row);
    rows.push(row);
  });
  if (opts.onChange) opts.onChange(rows);
  return { rows: rows };
}

// No annotation on purpose: this one lands at the DERIVED tier, where the catalog
// carries its NAME and its option NAMES but no types, no slots and no description.
// A derived entry is still catalog-only — an agent cannot name a unit that does not
// exist, which is the whole constraint.
function buildDotsPair(opts) {
  var wrap = document.createElement('span');
  wrap.className = 'ex-dots';
  wrap.title = opts.tip || '';
  return { wrap: wrap, count: opts.count || 2 };
}

window.buildSection = buildSection;
window.buildRowHostFromItems = buildRowHostFromItems;
window.buildDotsPair = buildDotsPair;
