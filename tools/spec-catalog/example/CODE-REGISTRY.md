# CODE-REGISTRY.md — the index of everything already built

> **GENERATED — do not hand-edit.** `node tools/gen-code-registry.js` regenerates from source,
> so it never drifts. **Before building ANY UI, scan this file and USE what exists.** Reinventing
> a helper/class/component listed here is a hand-roll. If a capability is NOT here it is genuinely
> new — STOP and get operator consent.

> Counts: 3 chrome helpers · 5 exports · 7 CSS classes · 0 components · 0 engines.

## 0. Task → canonical helper (the anti-handroll map — READ FIRST)

| building… | USE | never |
|---|---|---|
| param / control rows under a host | `buildRowHostFromItems` | a hand-rolled items.forEach + createElement loop |
| a titled section with a body | `buildSection` | a hand-assembled wrapper div |

## 1. Chrome / UI helpers — scan before building any control/chrome

| helper | file:line | first line |
|---|---|---|
| `buildDotsPair` | src/chrome.js:63 | `function buildDotsPair(opts) {` |
| `buildRowHostFromItems` | src/chrome.js:45 | `function buildRowHostFromItems(opts) {` |
| `buildSection` | src/chrome.js:23 | `function buildSection(opts) {` |

## 2. Components (typeId) — already-built modules/editors

| typeId | file |
|---|---|


## 3. Engines

| engine | file |
|---|---|


## 4. All exports (full API surface — grep here before adding a global)

`buildDotsPair` · `buildRowHostFromItems` · `buildSection` · `exBuildBadge` · `exBuildParams`

## 5. CSS classes — grep before adding ANY new class

`.ex-dots` (src/app.css:11) · `.ex-param-row` (src/app.css:10) · `.ex-section` (src/app.css:7) · `.ex-section-body` (src/app.css:9) · `.ex-section-hd` (src/app.css:8) · `.is-collapsed` (src/app.css:12) · `.is-readonly` (src/app.css:13)

## 6. Orphan candidates — exports with ZERO live callers (VERIFY reachability)

> A `window.`-export whose bareword appears nowhere as a LIVE call — only its own def / export /
> comments. **CANDIDATE, not a verdict.** May still be reached dynamically or string-registered.
> Before deleting, `grep <name>` excluding defs/exports/comments. Feature-surface orphans first.

**Feature surface (0):** _none_

**Suspect (2):** `exBuildBadge` (src/panel.js:29) · `exBuildParams` (src/panel.js:28)

**Debug / internal (0):** _none_
