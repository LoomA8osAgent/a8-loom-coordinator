<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# ENFORCEMENT — the architecture of a floor that holds

> **The one idea.** Every standing rule that *can* be mechanical *is* mechanical.
> A rule that lives only in prose survives exactly as long as the model reading it
> remembers to obey — which is to say, not across a model swap and not across a long
> session. So the discipline is a graduation ladder: a lesson starts as a
> failure-pattern row, and the moment it becomes mechanically detectable it becomes a
> hook. When a new failure class appears, the response is never "the governance
> broke." It is *surface a new gate into a hook,* then move on.
>
> **A rule in context is advice; a rule in a refusal is a wall.** That was measured,
> not asserted: a project ran its entire anti-hand-roll ruleset resident in every
> prompt — 107 KB, every turn — and hand-rolled a duplicate anyway; what stopped it was
> a hook refusing the edit until the canon was retrieved. Residency was never what made
> a rule binding. That measurement is why the rules live where the refusal happens, and
> why §1's canon router exists.

This document is the map of that floor: the moments a gate can fire, the gates on the
*instruments* you verify with, the meta-layer that keeps the gates honest, and the
graduation rule that grows the whole thing. It was distilled from a production stack
(the `hooks/` directory here is the config-driven, language-agnostic subset of it) over
successive hardening arcs whose lesson was blunt: the gates policed *edits, commits, and
spawns,* and the seat still walked straight through whatever space nobody had gated yet.
This is what closing those spaces looks like.

Names below are the mechanism, not the filename. Where this repo already ships a gate
as a config-driven hook it is marked **[shipped]**; where the mechanism is documented
as the production pattern for you to wire to your own workflow it is marked
**[pattern]**. All of it is stealable; none of it is exotic.

---

## The four moments a gate can fire

A gate is only as good as its timing. Four boundaries exist in an agent session, and
each has a class of failure that only a gate firing *at that boundary* can catch.

### 1. Edit-time — PreToolUse on Edit/Write

The oldest floor: refuse the edit until canon was actually retrieved this turn.

- **canon-search-required [shipped]** — an edit to a governed file is blocked unless a
  canon grep ran this turn (and, for machinery edits, the generated registry was
  consulted). Kills editing-from-memory.
- **canon hard-block [shipped]** — string-pattern bans: inline event handlers, native
  form controls, retired APIs, banned glyphs, reserved global names. The rules are a
  config array; an empty array is inert.
- **discover-then-reuse consent [shipped]** — a hand-rolled host, mount-CSS, or new
  design-vocabulary token is blocked unless the turn carries explicit consent.
- **helper-home [shipped]** — a raw builder in a non-helper file is blocked unless it
  is exported, composes an existing helper, or is a consented one-off.
- **constraint-before [shipped, opt-in]** — the inversion. Every gate above adjudicates
  code that has already been written; this one makes the freehand path *inexpressible*.
  The code registry is projected into a CATALOG, the builder emits a
  `{helper, props, children}` spec that can only name catalog entries, a compiler emits
  the real calls plus an HMAC'd receipt, and an edit that ADDS a new surface must be
  byte-contained in a fresh valid one. Three details carry the weight: the receipt holds
  the emitted BYTES (a sha of an untracked build artefact is not something the gate can
  check later); write and verify live in ONE file required by both the compiler and the
  gate (two implementations of "is this receipt valid" is where a gate and its producer
  drift apart); and a missing key fails every check, so **no key ⇒ nothing verifies ⇒ the
  gate refuses**, which is the only safe direction. The gate never mints the key — a gate
  that can create the secret that satisfies it is not a gate. It also states what it
  cannot see: a logic-only edit, and a block of pure catalog calls. That is the thesis,
  not a hole — the backstop finds nothing because there is nothing to find — and the
  red-fixture proves the receipt is decisive anyway by giving four verdicts to IDENTICAL
  bytes (absent / forged / stale / valid). See `integrations/spec-catalog.md`.
- **canon delivered BY SUBJECT [pattern]** — *the refusal carries the rules.* Instead of
  keeping the whole invariant set resident, a router resolves **the bullets that govern
  the file being edited** and prints them INSIDE the block message (a second mode
  resolves the bullets a prompt touches, at prompt time). Measured on a real corpus: of
  107 KB of always-on invariants, the worst-case file was governed by 21 KB of it and the
  typical one by under 2 KB — residency was paying ~50× for a delivery a lookup does
  exactly. Three rules keep the router honest, and they are the whole design: a subject
  **with** rules prints them; a subject with **nothing indexed** prints *why, naming what
  it looked for* (silence reads as "no rule governs this file" — `GATE-FAILS-OPEN` inside
  the thing that delivers the anti-hand-roll core); a payload over budget is **trimmed
  with an "N more" tail**, never dropped whole (an over-cap injection silently discarded
  while the hook reports success is that same failure wearing a success message).
- **the route ban [pattern]** — *a gate is a floor only if there is one door.* Every gate
  above fires on Edit/Write/MultiEdit; a file written through a shell (`cat > f <<'EOF'`,
  `cp`, `tee`, `sed -i`, an interpreter one-liner) bypasses all of them. Lived: an agent
  false-blocked by an edit gate routed around it with a heredoc — substance satisfied,
  mechanism bypassed. An agent under pressure routes around a gate every time it can. So
  a shell command whose *write target* is a governed path is refused and redirected to the
  real edit tools. It is a **route** ban, not a write ban: the remedy is always available
  and costless, so there is deliberately no inline escape marker (a comment marker is
  forged as easily as the write it excuses). State its reach honestly — literal paths are
  caught, computed paths are not — because an unstated boundary is how a guard gets
  trusted past its reach.

Edit-time gates have a hard ceiling, stated honestly: they see **one edit at a time**
and cannot judge reachability. The reachability check lives in the registry generator
(zero-caller orphan report), not here.

### 2. Spawn-time — PreToolUse on Agent/Task

The moment a worker is dispatched is the moment to enforce the economy. One gate, five
sequential refusals, each closing a hole the one before it left open:

- **the budget line [pattern]** — a spawn is **denied** unless its prompt carries an
  explicit token estimate: `BUDGET: ~350K opus`. *Visibility, not permission* — no cap is
  imposed; the operator simply sees the cost before it is spent. **Estimate in tokens and
  never convert to a plan-meter percentage:** metered plans do not track token volume
  linearly (two same-day windows measured a 5× spread in points-per-token), so a
  percentage is a fabricated number wearing a precise one's clothes.
- **the model pin [pattern]** — the spawn must carry an explicit model field, and the
  BUDGET line's tier word must agree with it. Closes the *word ≠ config* hole where a
  spawn declares one tier in prose and silently inherits another.
- **the agent allowlist [pattern]** — only the project's own canon-inheriting agents may
  be spawned; built-in general-purpose agents (which skip the governance) are denied.
- **the proof tier [pattern]** — a builder spawn is denied without `PROOF: light` or
  `PROOF: heavy (<reason>)`. Light is the default and covers almost everything: ONE
  comparison that answers *"did I break what already worked."* Heavy requires its reason
  written out, and only four things earn it — the claim *is* byte-identity across a
  corpus · the change touches a shared seam where one case cannot represent the others ·
  a genuine one-off whose assertion is unlike its siblings · a gate whose own
  falsification is the deliverable. *"It might catch something"* is not a reason: that
  argument is available for every item always, which is exactly how the cost compounds
  into something no operator can pay.
- **the body check — the label must equal the body [pattern]** — the newest, and the one
  that makes the tier real. A gate that reads only the *label* is a formality: ten lanes
  once fired with `PROOF: light` on the line the gate parses and the whole suite written
  into the body underneath — gate run + falsification + persistence gate + identity proof
  + self-check suite + asset bake + citation lint, per item. Every brief passed the label
  check. Three hours and a week's budget. So under `light` the body may name **at most
  one** proof instrument (and at most one acceptance-test id); naming two is the heavy
  tier wearing the light label, and the remedy is an honest `PROOF: heavy (<reason>)`.
  **Heavy is deliberately not body-checked** — the written reason IS the argument for the
  extra steps and a reader can challenge it; body-checking heavy would make the reason
  unspendable and push authors back to lying with the label.
- **commit-cadence [pattern]** — the other load-bearing one. The entire gate stack fires
  on `git commit`; a session that never commits until arc-end therefore lives *entirely
  in un-gated space* — spawn a builder, relay "it's ready" on unverified output, repeat,
  zero gates ever run. This gate **denies the next spawn while any build-surface file is
  uncommitted.** It forces the rhythm: builder returns → commit (which fires the whole
  stack) → *then* the next spawn. A wrong commit is free; not committing is the single
  act that bypasses every gate.

Also at this boundary, and only half-mechanical: **no prose to an executing builder.** A
build-executing brief carries *paths to executable sources of truth* (the mockup, the
schema, the roster file, the oracle) and the task as **diff-and-implement against them**,
plus mechanical acceptance — never the coordinator's summary of any of those. A summary
standing in for an executable source ships its own distillation loss, and no gate can
catch it, because the checker was pointed at the same summary. The body check bites part
of this by accident (a brief that quotes the rulebook at a builder trips it — correct);
the rest is the coordinator auditing its own brief before it fires.

Because real coordination runs concurrent agents and pivots mid-session, the cadence
gate is **dual-scoped**: it governs build-file edits and spawns *only* (never blocks a
doc or spec edit), and it **defers while a background agent is running** — a running
agent's dirty files are live WIP — enforcing only at *quiescence*, when a build file is
finished and un-gated work is about to advance on it. Where two coordinator seats share
one repo it attributes dirtiness **per seat**, and attribution **fails closed**: no
session id, no record, an unreadable state file, a fresh session inheriting a dirty tree,
or a peer gone quiet all read as *yours* and still block. Unknown provenance is never a
licence to proceed, and the answer to a false refusal is a better attribution rule, never
an escape hatch.

### 3. Commit-time — PreToolUse on the commit command

The commit is where a change becomes real, so it is where the completeness gates live.
Every one of these reads a **receipt, not a word** — a machine artifact written by the
test/coverage run, never the trailer sentence's claim.

- **doc-sync trailer [shipped]** — a feature commit is denied without its per-pillar
  `Docs:` trailer (spec + user-doc + acceptance test, or an explicit `n/a` per pillar).
- **state-persistence trailer [shipped]** — a commit adding a user-selectable variable is
  denied without proof it was wired into the save/recall walk.
- **coverage-batch trailer [pattern]** — a commit touching persistence-core files is
  denied unless the regression batch wrote a *full-green* receipt this run; the gate
  reads the receipt file, so a hand-typed "GREEN" cannot pass.
- **satellite-parity trailer [shipped]** — a standalone-surface commit is denied without a
  measured-parity trailer.
- **the watched-run receipt [pattern]** — the answer to *"was this thing ever actually
  looked at?"* Prose said "watch the app"; nothing made git obey. So: a non-checkpoint
  commit staging user-surface files is denied without a **machine-written receipt** —
  produced by the acceptance runner in watch mode, never by an agent's prose — that
  captures frames per flow and computes, mechanically, a blank-output check, a
  main-thread-stall check, a console-error count and a performance floor. The receipt is
  **keyed by a content hash of the staged surface**, computed identically on both sides,
  so any edit after the run makes it stale and the commit is refused. Frames stay
  untracked; the tracked receipt carries their digests, so tampering with the evidence is
  detectable. Auto-flagged problems never silently pass: each is acknowledged by a
  `Watch-red: <id> (<reason>)` line in the commit message — a conscious, git-audited
  override. **There is no checkpoint escape here.** A checkpoint clears the trailer gates;
  watching is never deferrable (the escape existed once, and every landing of that session
  rode it and shipped unwatched surfaces). And state the claim exactly — *"every change
  this commit stages was present, byte-identical, in a tree that was watched"* — because
  the stronger claim is unobtainable on a shared working tree, and a gate that implies
  more than it proves is worse than one that says what it means.
- **pattern→hook growth gate [pattern]** — the self-extending rule: a commit that adds a
  new failure-pattern row is **denied unless it also stages an enforcing hook** or
  carries `Pattern-hook: <hook> | un-gateable (<reason>)`. Prose-only patterns can no
  longer ship. This is the graduation ladder made mechanical.
- **experience-grade sentinel [pattern]** — an app commit runs a perf-floor / effect-grade
  acceptance test; a whole-frame stall or a surface that renders unlike its sibling is
  commit-blocking, not a courtesy.

**A trailer is a conscious call, never a formality.** Every pillar is either claimed or
declared `n/a (<why>)` by someone who thought about it, and a pillar claimed as moved must
have a matching staged file.

The **WIP escape** keeps the cadence honest: a mid-arc checkpoint (`git commit -m "WIP:
<reason>"`) is *free* — one trailer clears the heavy commit gates, leaving a
revertible, in-history, operator-visible checkpoint. The full stack still runs on the
non-WIP arc-close commit. The pinned rule that no hook can gate: **"ready / done /
works" is reserved for a non-WIP, full-gate-green commit cited by its hash** — a
checkpoint is never a claim.

### 4. Turn-boundary — the Stop hook

The gap the commit gates *cannot* close: a coordinator can finish, type "it's ready,"
and **end its turn** — handing the operator an un-gated tree to test — without ever
running a commit for a gate to fire on. Only a hook at turn-end catches this.

- **clean-tree-on-stop [pattern]** — blocks turn-end while any build-surface file is
  dirty. Combined with commit-cadence (no mid-turn advance on a dirty tree), the
  operator *never* receives control on an uncommitted build tree: every boundary is
  either committed (the whole stack fired) or clean. It shares the cadence gate's seat
  attribution and its fail-closed rule from one home, so the two cannot drift.
- **session-close harvest [pattern]** — on a governed-change turn-end, prints the
  session-end checklist (harvest new invariants, run the reconcile question, mirror the
  memory store). The most-repeated ritual in governance gets a mechanical trigger.
- **seat-discipline [pattern]** — the one the arc was named for. Every gate above polices
  edits, commits, and spawns; *nothing* policed the coordinator seat's own inline work
  volume. The seat's rule — *reason · spawn · audit · commit, nothing else* — lived in
  skill prose, and prose degrades per session (a single session burned a week's budget
  on inline forensics while every hook-backed rule held perfectly). Now a Bash gate
  whitelists the seat's legitimate jobs (git, the standing gate commands, generators,
  citation lint, single canon greps) and counts everything else against a rolling
  budget: warn, then hard-deny with the delegation order — *spawn a worker with the
  symptom.* The rule it enforces is four words long: **reason · spawn · audit · commit.**
  Any diagnosis needing more than one look is a worker brief, not a seat adventure — and
  that holds hardest during a crisis, which is precisely when the seat goes hands-on and
  forgets to hand back.

---

## Gate the instrument, not only the edit

The four moments police what the agent *writes*. A parallel class polices what the agent
*proves things with* — because a false green outlives a bad edit, which is caught.

- **scripted-API-only verification [shipped]** — app interaction routes through the
  project's scripted, replayable test API; ad-hoc pokes at the running system are denied.
  A verification you cannot re-run is an anecdote.
- **a declared instrument, and one receipt shape [shipped]** — a run that vouches for a
  change writes a **receipt**, and the receipt names the **instrument** that wrote it.
  Instruments are **declared** in config (`verification.instruments[]`: id · kind ·
  driver · launch · receipt · enabled), and a receipt naming an instrument nobody
  declared is refused — because a gate that *lists* instruments silently exempts every
  instrument added after it was written, so the roster enumerates the permitted set and
  anything else is taxed by default. Adding a second instrument (a desktop driver beside
  a browser driver) adds **no second shape and no second runner**: the two differ only in
  where a frame comes from, so the frame verdict is FACTORED the moment the second one
  appears rather than copied — two copies of *what counts as black* drift on their first
  edit. The watching law rides along unchanged: the driving agent **looks at** the
  captured frames and judges them as a user would; a verdict the instrument cannot
  measure is recorded `null`, never "clean"; and a flow that captured no frame at all
  earns an auto-RED rather than a receipt reading *0 frames … clean*. A native leg counts
  only once its probe has been **watched going RED on a black frame**, measured through
  the same decode path the driver uses. The synthetic-input ban below applies to a desktop
  driver identically — input is synthesised through the automation framework's OS-level
  path, never by asking the application to act on itself. Reader:
  `node hooks/verification-first.js --receipt <path>` (fixture:
  `hooks/verification-first.selftest.js`, whose three load-bearing legs are the same
  receipt bytes under three instrument names). Example driver, with its install audit —
  checksum *and* signature, both outbound channels pinned off and read back, and the fact
  that a GPU surface must be foregrounded and therefore takes the operator's pointer —
  `hooks/native-instrument.example.sh`.
- **no synthetic input [pattern]** — *absolute.* A page whose real input path is dead (an
  overlay swallowing clicks, a hole in hit-testing, an unwired listener) still responds to
  an event dispatched from script, because synthetic dispatch targets the element directly
  and bypasses the real input pipeline. Lived: 278 controls "clicked fine" from script
  while the operator's actual mouse was dead on every one of them. So the gate denies
  event-dispatch and programmatic-activation signatures inside any browser-eval tool, and
  interactivity is proven only by **real input** through the automation framework's
  OS-level path. Read-only probes (geometry, state reads) stay allowed — they measure;
  they do not pretend to click.
- **the native-dialog bridge [pattern]** — the shape that follows from the rule above.
  When a user path opens *browser chrome* (a file chooser), the sanctioned instrument is a
  **real click** plus the automation framework answering the dialog. The two obvious
  in-page "fixes" — dispatching a change event, assigning the input's files from script —
  both invent the *result* of the gesture, so they pass on a page where the menu row never
  committed and the input was never created. Ship **no** synthetic fallback: absent the
  bridge the step throws a named error rather than reading as a step that ran. And route
  the async failure into the step's own error channel, or it degrades into a settle
  timeout that names the wait and hides the cause.
- **harness pre-flight, enforced in the runner [pattern]** — *a learnings doc is worthless
  if its findings are not built into the testing.* So the runners refuse to open a browser
  until the environment is provably the one you think it is: which server am I driving
  (one env-var spelling, confirmed by fetching a known asset) · is the store root the tree
  the server actually serves (proved by a nonce — identity, not equality) · is another
  runner already driving this server (contention produces reds on healthy code) · are the
  ids passed as separate arguments. **Rule of thumb: a suite that goes red across the
  board, or flips on identical bytes, is the harness talking before it is the app
  talking.** Every new harness failure earns a pre-flight leg first and a written section
  second — never only the section.
- **isolation hygiene [pattern]** — a worker that needs its own server takes its **own**
  port and tears it down **by the PID it started**. Never pattern-kill a process name: one
  lane's `pkill -f <server>` killed the operator's server, the coordinator's audit clone
  and four sibling lanes' clones. Never resolve "your" pid by port either — on a shared box
  the command line, the cwd and the port all collide between lanes, so a port that refused
  you with `EADDRINUSE` is *someone else's*, including at teardown. And a scratch clone
  carries the **lane's own name**: a shared scratch directory with a canonical name gets
  reset under a running lane, which produces two full runs of false reds before anyone
  notices.

---

## The judgment layer — a fourth executor class

Everything above is a MATCHER: a regex, a path set, a registry lookup, a trailer check, a
receipt. Each is deterministic and none of them is replaced here. But a whole class of
standing rule has **no matcher and cannot get one**, because its signal is MEANING rather
than shape — *"this brief must require its worker to report the retrievals behind its
claims"*, *"this paragraph must still describe what the code does"*, *"this body must not
describe a whole suite under a light label"*. Each is satisfiable in a dozen phrasings and
violable in a dozen more. Those rows sit in the ledger marked *judgment* and hold only
while somebody remembers, which across a model swap or a long session means not at all.
Measured 2026-09-18: a resident governance paragraph described a hook's behaviour that git
had changed three days earlier, and every seat reading it reasoned from a sentence that was
already false.

**THE JUDGMENT LAYER IS A HOOK** — `hooks/judgment-gate.js`, registered at the
`Edit|Write|MultiEdit`, `Bash` and `Agent|Task` matchers of `hooks/settings.template.json`
(lines 27 / 36 / 42) and deployed by `hooks/install-hooks.sh` exactly like every other
gate. *"Fourth executor class"* is the `governance/FAILURE-PATTERNS.md` ledger's word for
WHAT enforces a row — a hook (regex/structure), a generator (a regenerated index), human
judgment (unenforced), and now a hook that consults a decision model. The class is about
the kind of EVIDENCE the executor can read — meaning, not tokens — not about a different
mechanism.

A **judgment seam** gives those rules an executor: a small on-device DECISION MODEL — not a
generator — answers ONE closed question at a gate boundary. Code enumerates the options,
the model picks one of them, code renders the outcome. It never writes, counts, orders
dates, measures geometry, or judges a render (it has no image input at all), so the
acceptance tests, the pixel probes and the human's eyes are untouched by any of it. Shipped
as **`hooks/judgment-gate.js` + `hooks/lib/decision-provider.js`, installed and ON by
default** (`judgment.enabled: true`): the gate SPEAKS on every fire, and declaring a
provider is what makes it judge. `enabled:false` is the only way to silence it, and that is
switching OFF an executor class rather than skipping an optional extra. Quickstart, with
the commands: `integrations/judgment.md`. Practice: `skills/judgment-SKILL.md`. Providers:
`governance/LOCAL-MODELS.md` — **Jev** (TypeSafe AI, remote, keyed, unusable from a gate by
construction) or an open decision model on your own machine (**Laya 421M** served by
**von** on loopback), plus the **fixture** stub for every test.

**The four moments it can fire at** are the ones this document already names, with a
measured verdict for each (an Apple M4, 16 GB, 2026-09-19, against a RESIDENT warm
provider):

| Moment | Budget | Fits | Verdict |
|---|---|---|---|
| **edit** (PreToolUse) | ≤ 500 ms | 1 question | technically runnable, and honestly *nothing belongs here*: ~600 ms × every edit of a session is a tax paid hundreds of times, and a gate that slows every keystroke-to-disk gets switched off |
| **spawn** (Agent/Task) | ≤ 2 s | ≤ 8 questions | the natural home for anything about a BRIEF |
| **commit** (Bash) | ≤ 2 s | ≤ 8 questions | preferred over `edit` for anything about what LANDS — the complete change is in view at the commit and never at a single hunk |
| **turn-boundary** | — | — | not wired; nothing has asked for it |

**ONE QUESTION PER SEAM FITS EVERY TIER; A TEN-QUESTION BUNDLE FITS NONE.** Bundling is
*super-linear* on a local provider (1 / 4 / 10 questions cost 1× / 3.9× / 13×, because the
state is re-encoded into every question's row) — so "bundle, don't chain" is an
API-round-trip argument that does not transfer. And the lever when a budget misses is the
STATE, never the model: a 151M and a 421M encoder landed within 2% of each other per
question.

**Six rules make it a floor rather than a liability:**

1. **Additive, never substitutive.** A judgment seam never replaces a verdict a matcher
   already reaches correctly. A body the word list already refused was denied three gates
   earlier and never reaches the seam; what the seam reads is the residue — and an
   enumeration of instruments *always* has residue, because it silently exempts every
   instrument added after it.
2. **Fail closed, and print the state.** Five states, all printed, never inferred from
   silence: NOT ADOPTED (`enabled:false` — a silent no-op, and NOT the default) · NO SEAMS
   (ON with no roster file written — one line, a pass; a roster that EXISTS and will not
   load still DENIES) · NOT ENGAGED (no provider declared — one line saying exactly that,
   and a pass) · ENGAGED (asks; **cannot reach its provider ⇒ DENIES**, with the typed
   error code printed verbatim) · ENGAGED+ARMED. *Failing open is
   asking, failing, and approving anyway* — that never happens. *Not engaged* is no
   question asked and none promised, which is a state every seam must pass through before
   any band arms. The property that makes it auditable: a reader of the gate's own output
   can always tell which state they are in. An adopted layer with an unreadable roster
   REFUSES — a gate that cannot load its roster has not found "no seam applies", it has
   found nothing.
3. **A fixture provider for every selftest.** Deterministic, synthetic, zero network,
   TOLD what to answer — so the GATE'S OWN LOGIC is under test and a leg can neither pass
   because a server was up nor fail because one was slow. It deliberately does not read
   the state (a fixture that inferred its answer would be a second, worse model), a
   missing map is an error rather than an empty map, and it is **never a silent fallback**
   — a failing real provider does not degrade to it.
4. **Trained-only refusal.** A refusal band is a cut on a calibrated confidence NUMBER.
   Only a TRAINED provider (a scoring head trained against proper scoring rules) produces
   that quantity; option logits read off a stock LLM give a usable argmax and an
   uncalibrated number wearing a distribution's shape. A `refuse` band against any other
   class — including an undeclared one — prints **BAND NOT ARMED** and runs advisory,
   loudly in both directions, because degrading silently is pass-by-silence one way and
   refuse-on-a-bad-instrument the other.
5. **Bands are a COVERAGE CURVE, measured — never a line, never adopted.** Automate only
   the high-confidence fraction and escalate the rest as an advisory **naming what it could
   not decide**; *"the gate had nothing to say about this one"* is a legitimate printed
   outcome, and it is not silence — silence is a pass without a question, this is a
   question with an honest abstention. A threshold is keyed by **(provider, arity)**, never
   by provider alone: measured 2026-09-19, one model's own temperature table made a 5-way
   Choice read confidence 0.03 and a 12-way read 0.80 on the SAME state, so a band taken
   off a mixed-arity population is taken off the temperature table by accident. Until a
   labeled set exists the roster records `coverageTarget: null` — the hole VISIBLE rather
   than implied. And no band arms without a **hostile-input leg** against live weights: the
   text a dev-process seam reads is agent-authored, which is precisely the text most able
   to say *"ignore the criteria"*.
6. **The calibration instrument is not the gate.** Vendor a published benchmark harness for
   discrimination / Brier / ECE / selective-risk rather than writing one (a selective-risk
   curve computed against the wrong denominator reads as a better model) — then supply your
   OWN manifests, because its shipped datasets are generic NLP and your gate is your
   content.

**What it retires: nothing.** Every matcher stays, registered where it was, and that is
deliberate — *a gate whose input class still exists is not retired because a newer gate
sits beside it.* What the layer removes is the excuse for a prose-only row: a rule that
could never be mechanical now has a mechanism, and the coverage report can stop scoring it
as permanently un-gateable. The honest cost is stated in the same breath — this executor is
**probabilistic**, which is why it ships advisory, why the bands are unarmed, and why
**nothing here is allowed to take over a verdict a regex already gets right.**

## The meta-layer — gates that keep the gates honest

A floor you cannot inspect is a floor you cannot trust. These do not gate the work;
they gate the *enforcement suite itself.*

- **GATE-FAILS-OPEN self-test [pattern].** The subtlest failure a gate can have is to
  *accept its own known-bad input* — silence scoring as a pass. Every adjudicating gate
  ships a red-fixture: an input it is supposed to reject, asserting it exits with a
  block. A gate that passes its own fixture is failing open, and the meta-harness turns
  that into a loud red. Missing fixtures are listed **UNCOVERED** — never scored as
  fine, because scoring a missing check as a pass would itself fail open. The fixture
  needs a **falsification channel** of its own: point it at a pre-change copy of the gate
  and confirm it goes red *there*. A fixture that cannot fail against the code it was
  written for proves nothing — the meta-gate's version of the same disease.
- **fail closed on an unreadable payload [pattern].** A gate handed input it cannot parse
  must refuse when the input is plausibly in scope. An unparseable spawn payload *is* an
  undeclared spend; an unparseable eval payload may be a fabricated click. "I couldn't
  read it, so I allowed it" is the purest form of silence-as-a-pass.
- **beware the enumeration [pattern].** A gate that enumerates *instruments* silently
  exempts every instrument added after it — measured three times in one stack (a
  browser-tool matcher that missed a later tool family; an agent allowlist a newly
  registered agent was never added to; a command allow-list that forbade what a sibling
  gate compelled). Where an enumeration is unavoidable, **enumerate the EXEMPT set**, so
  anything new is *taxed, not exempted* by default: the worst case becomes one visible
  line to add instead of a silent hole.
- **new-gate-lock [pattern].** A commit that adds a new gate is refused unless it ships
  that gate's red-fixture in the same commit. The self-test set can never shrink in
  coverage as it grows.
- **coverage report [pattern].** At session start, every failure-pattern code is mapped
  to its live executor by *scanning the actual gate stack* — no human re-classification.
  Each code resolves to COVERED, HISTORICAL (a past bug fixed in code + guarded by a
  regression test), JUDGMENT (inherently un-gateable — content, geometry, authoring),
  or a **HOLE** (a standing rule a gate could read but none does). A code that is
  neither covered nor curated defaults to *unclassified* and surfaces as a hole
  candidate, so a new pattern cannot hide. The headline hole count is printed loud.
  Beware the inverse as well: a coverage scanner that matches a pattern's *name inside
  prose* will score an essay as an executor and report a hole as covered.
- **hook-drift check [pattern].** At session start, the canonical hook registrations are
  diffed against what is actually deployed (list + content hash + the push-deny
  entries). A hook authored but never registered, or a registration that drifted from
  its canonical source, is caught before it can silently no-op.

## The evaluators the gates stand on

Gates enforce; **evaluators ground.** In order of preference:

1. **greps** — an agent's claim about existing code is untrusted until the retrieval
   behind it is shown; a "duplicated N times" finding gets a live-caller grep before
   anyone acts.
2. **linters** — every citation (`file:line`) is mechanically verified to exist and be
   in range.
3. **acceptance tests** — every fix ships a scripted, effect-grade test that drives the
   running system and asserts the *behavior,* not the surface. A green run writes to a
   **proven-runs ledger**; the assembler flags any test that was authored but never run,
   because a green name with no run behind it is an unproven claim.

A compiler, a grep, and a pixel probe do not hallucinate and they do not bill. Reach
for a voting jury of model agents only where no deterministic evaluator can exist.

**Keep the evaluator proportionate to the claim.** An acceptance test exists to prove
*the seam you touched still holds* — not to re-prove a path that has worked for months. A
known-good path is not re-tested because a lane rode it; testing resumes on a path when a
problem is found *on that path*. And driving the whole chain to prove that a seam exists
is diagnosis, not verification: build the chain so you can traverse it the day something
breaks, then test at the seam (`TRAVERSAL-IS-DIAGNOSIS-NOT-VERIFICATION`). This is the
same economy the proof-tier gate enforces at spawn-time, stated where the evaluators live.

---

## The graduation rule (how this grows)

1. A cross-cutting failure earns a **FAILURE-PATTERNS row** — named in SCREAMING-KEBAB,
   the code becomes shared vocabulary in commits and reviews.
2. If it is **mechanically detectable at edit or commit time, it becomes a hook** — and
   the pattern→hook growth gate *refuses the row without one* (or an explicit
   `un-gateable` reason).
3. The hook ships with its **red-fixture** (the new-gate-lock refuses it otherwise), so
   the day it lands we know it can fail.
4. The **coverage report** proves the code now resolves to COVERED; the hole count is
   the honest scorecard.

And the ladder runs the other way too: **every arc that adds a gate states what it
retires.** A stack that only accretes gates ends up charging every change for every
lesson ever learned — which is the cost that made the proof-tier gates necessary in the
first place. "It might catch something someday" is not evidence.

Prose is nice. Hooks are authoritative. The distance between the two is exactly the
work this document describes — and it is never finished, only current.
