<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# Using a decision model in this stack

The operator-facing quickstart for the judgment layer: get a provider running, enable the
gate, read what it prints, and earn the right to let it refuse anything.

Method: [`skills/judgment-SKILL.md`](../skills/judgment-SKILL.md). Providers, measured
costs, calibration: [`governance/LOCAL-MODELS.md`](../governance/LOCAL-MODELS.md). The gate
itself: `hooks/judgment-gate.js` + `hooks/lib/decision-provider.js`.

---

## 1. What it is, and where it sits

**The judgment layer is a HOOK** — `hooks/judgment-gate.js`, registered at the
`Edit|Write|MultiEdit`, `Bash` and `Agent|Task` matchers in
`hooks/settings.template.json` (lines 27 / 36 / 42) and deployed by
`hooks/install-hooks.sh` exactly like every other gate. *"Fourth executor class"* is the
`governance/FAILURE-PATTERNS.md` ledger's word for WHAT enforces a row — a hook
(regex/structure), a generator (a regenerated index), human judgment (unenforced), and now
a hook that consults a decision model. The class is about the kind of EVIDENCE the executor
can read — meaning, not tokens — not about a different mechanism.

A **decision model** is a classifier, not a generator. It answers three shapes of closed
question about a state — **yes/no** (Noul, a probability), **pick one from a named closed
menu** (Choice), **which rung of an ordered ladder** (Score) — with a probability per
option. It never writes text or code, never counts, never orders dates, never sees an image.

In this stack it sits at **the four moments a gate already fires** — `edit` · `spawn` ·
`commit` · `turn-boundary` — as the executor for rules that had to live in prose because no
matcher reads MEANING: *"does this brief require its worker to report the retrievals behind
its claims"*, *"does this body describe a whole suite under a light label"*. Code enumerates
the options, the model picks one of them, code renders the outcome.

It is **additive**: a verdict a regex already reaches correctly is never delegated to it.

---

## 2. Get a provider running — pick one

### Option A — local, open weights (the default recommendation)

**Laya 421M** (`convaiinnovations/laya`, Apache-2.0) — a ModernBERT-large backbone plus a
decision head trained against proper scoring rules, so it is the TRAINED class. It has no
HTTP server of its own; **von** (`github.com/wfzyx/von`, Apache-2.0) serves it behind the
`POST /v1/systemone` wire this stack pins.

> ⚠ **`pip install von` INSTALLS THE WRONG PACKAGE.** PyPI `von` is an unrelated 2.5 KB
> stub (`von 0.1a0`, MIT, *"test pip package"*) by a different author. Install from the git
> remote, pinned.
> ⚠ **`von serve` defaults to `--host 0.0.0.0`** — a LAN-exposed judge with no auth unless
> `VON_API_KEY` is set. Pass `--host 127.0.0.1` explicitly, always.

```bash
# install (once) — a project-local venv, and von FROM GIT
python3 -m venv .judgment/venv
.judgment/venv/bin/pip install "von[all] @ git+https://github.com/wfzyx/von@master"

# weights (once) — fetch to a local dir so the hub client never runs
MODELS_DIR=.judgment/models
mkdir -p "$MODELS_DIR/laya/encoder" "$MODELS_DIR/laya/tokenizer"
B=https://huggingface.co/convaiinnovations/laya/resolve/main
for f in rl_agent_config.json encoder/config.json tokenizer/tokenizer.json \
         tokenizer/tokenizer_config.json model.safetensors; do
  curl -sL "$B/$f" -o "$MODELS_DIR/laya/$f"
done

# start — LOOPBACK ONLY, resident for the whole session
export HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1
.judgment/venv/bin/von serve --host 127.0.0.1 --port 8493 --backend laya --device auto
```

Smoke it — the whole contract, all three primitives, in one request:

```bash
curl -s -X POST http://127.0.0.1:8493/v1/systemone \
  -H 'Content-Type: application/json' -d '{
  "model":"von-latest",
  "state":"Production database is locked and customer writes are failing.",
  "questions":{
    "urgent":{"type":"noul","instructions":"Is this urgent?"},
    "dept":{"type":"choice","instructions":"Route it","criteria":{"infra":"Infrastructure","design":"Design","billing":"Billing"}},
    "sev":{"type":"score","instructions":"How severe is this?","criteria":["Cosmetic","Workaround exists","Blocking"]}}}'
```

If you instead run an **ONNX** export in-process (`onnxruntime-node`), export
`ORT_DISABLE_TELEMETRY=1` **before the module loads** — measured, the native dylib otherwise
writes a persistent device-id UUID and an event DB to disk (§6 of `LOCAL-MODELS.md`).

### Option B — remote (Jev, by TypeSafe AI)

The commercial reference implementation of this shape: `POST https://api.typesafe.ai/v1/systemone`
with `Authorization: Bearer <key>`, model id pinned to `jev-1.13.0` (never `jev-latest`).
~100 ms typical, **$0.042 per million input tokens, output free**. SDKs: `@typesafe-ai/sdk`
(Node) and `typesafe-sdk` (Python); docs at `https://docs.typesafe.ai` (an `llms.txt` index
at the root; append `.md` to any page for the machine-readable form).

**It is optional, and it cannot serve a repo gate.** `hooks/lib/decision-provider.js`
refuses a non-loopback base URL outright, so a brief, a diff or a commit message cannot
leave the device by configuration mistake. Use the remote provider for app-side or
author-time work where a key is acceptable; gates run local or fixture.

### Option C — fixture (every test, always)

Deterministic, synthetic, zero network, TOLD what to answer, so the GATE'S OWN LOGIC is
under test:

```bash
A8_DECISION_PROVIDER=fixture A8_DECISION_FIXTURE=./fixtures/answers.json node hooks/judgment-gate.selftest.js
```

It never runs as a silent fallback — a failing real provider DENIES rather than degrading.

### Watching the field, and what the numbers license

- 🔭 **The open reproductions tracker:**
  <https://huggingface.co/spaces/multimodalart/jev-reproductions-tracker> — the place to
  watch for new open decision models. It sorts them by how they work: **decoding** (logits
  off a stock LLM), **diffusion** (a canvas readout), **trained** (a real scoring head),
  plus **prior art** and **explainers**. Its own ceiling note still reads: *no open model
  yet matches Jev's calibration claims.* **Only the TRAINED rows may ever arm a band.**

**Laya vs Jev, vendor-claimed and dated 2026-09-19 — not a same-set comparison** (Laya's
own eval, 23,024 questions, placed beside Jev's published figures): single question ~38 ms
on their hardware vs ~150–400 ms for an API round trip; intent/routing **99.1** ·
moderation **96.7** · topic classification **93.9** · inference/fact-check **88.3** ·
search relevance **62.8** · response quality **58.1**; selective automation **92.2% at 50%
coverage vs 83.8% at 100%**. **The consequence:** routing and classification seams may
become refuse-grade; fact-check seams advise first and keep advising; quality and relevance
seams are never built. **Price:** Jev $0.042 per million input tokens, output free; a local
model, zero marginal cost after a ~25 s load per session.

---

## 3. Declare seams and a provider

**It is installed and ON by default** (`judgment.enabled: true`). The gate speaks on every
fire; what you add here is a roster to ask FROM and a provider to ask. Until you do, every
spawn and commit prints one honest line and passes — nothing is refused and nothing is
silent. Setting `enabled: false` is the only way to make the line disappear, and it is
turning off an executor class, not skipping an optional extra.

Copy the roster and make the seams yours, then declare the provider:

```bash
cp hooks/judgment-roster.example.js hooks/judgment-roster.js
```

```json
"judgment": {
  "enabled": true,
  "roster": "hooks/judgment-roster.js",
  "stateMaxChars": 2000,
  "timeoutMs": 8000,
  "provider": {
    "kind": "systemone",
    "baseUrl": "http://127.0.0.1:8493",
    "modelId": "laya",
    "providerClass": ""
  }
}
```

Leave `providerClass` empty until you have MEASURED calibration (§5). **Undeclared is not
TRAINED, and only TRAINED arms a refusal band.**

The two example seams, both at the `spawn` moment, both advisory:

| seam | primitive | what it reads |
|---|---|---|
| `briefAudit` | four Nouls | a worker brief's CONTRACT — does it demand an evidence list, state its return shape, name files to read in full rather than summarise them, state its proof tier |
| `proofTier` | one 3-rung Score | how much verification the brief actually describes, scoped by `appliesRe` to briefs that declare the light tier |

---

## 4. Install the hook, and what you will see

```bash
hooks/install-hooks.sh          # or: npx a8-loom-coordinator install
```

A spawn now prints one block per engaged seam:

```
JUDGMENT seam (briefAudit) · spawn · systemone/laya · roster example-roster-1/briefAudit-1 · 412 ms · ADVISORY (ADVISORY-FIRST (fact-check family))
  requires_evidence_list  0.91  ✓
  has_return_shape        0.88  ✓
  names_executable_sources 0.31  ✗ below 0.50
  proof_tier_stated       0.77  ✓
  ADVISORY: names_executable_sources
```

The other states are printed too, and never inferred from silence:

- **no seams** — ON (the default) with no roster file written: one line saying nothing is
  declared, then a pass. A roster that EXISTS and will not load still denies.
- **not engaged** — seams declared, no provider: `judgment: not engaged — no provider
  declared`, then a pass. *"Nothing was asked"* is never confusable with *"asked, failed,
  approved anyway"*.
- **not adopted** — `judgment.enabled:false`, a silent no-op, and the only way to switch
  the layer off entirely.
- **engaged and unreachable** — a **DENY** carrying the typed code verbatim
  (`EDECISIONNOSERVER` · `EDECISIONTIMEOUT` · `EDECISIONSTATUS` · `EDECISIONPAYLOAD` ·
  `EDECISIONVALIDATION` · `EDECISIONBASEURL` …) plus the remedies. *A gate that cannot ask
  does not get to approve.*

A `mode:"refuse"` seam against a provider whose class is not TRAINED prints **BAND NOT
ARMED** and runs advisory for that run — loudly, in both directions.

---

## 5. Shadow mode → a band

Run advisory and keep the output. Then, and only then:

1. Label **40–100 cases** of your own content (the gate is your content; a vendored
   harness's shipped datasets are generic NLP).
2. Run the vendored instrument — `AbdelStark/jev-benchmarks` (Apache-2.0): accuracy /
   macro-F1, multiclass Brier / NLL / top-label ECE, and *maximum threshold-realizable
   coverage at a fixed empirical error budget*, which IS the threshold derivation. Seed on
   the ~20 public cases / 373 public decisions at `https://evals.typesafe.ai` first, so your
   numbers are comparable with everyone else's. It honours `TYPESAFE_BASE_URL`, so it points
   at any loopback `/v1/systemone`.
3. Read a **coverage curve**, never a line, and key it by **(provider, arity)**: measured
   2026-09-19, one model's own temperature table made a 5-way Choice read confidence 0.03
   and a 12-way read 0.80 on the SAME state.
4. Add a **hostile-input leg** against live weights — the text a dev-process seam reads is
   agent-authored, i.e. exactly the text most able to say *"ignore the criteria"*. No band
   arms without it.

Grade the seam by its task family before any of this: routing / classification questions may
become refuse-grade; fact-check / reading-comprehension questions advise and keep advising;
quality and relevance questions are not built at all.

---

## 6. Write your own seam — the checklist

1. **Roster entry** — questions, primitive, grade, band, `templateVersion`. Nowhere else.
2. **State filter in code** — parse, grep, count and order dates in the hook; the model sees
   the minimum. Cap it, and say so inside the state when it truncates.
3. **Primitive** — the ladder IS the primitive; never restate a Score as a cascade of Nouls.
4. **Client call** — `hooks/lib/decision-provider.js`, typed errors, fail closed.
5. **Argmax in code** — never cut the weighted `score`; quote the rung's own words back.
6. **Print everything, including the passes** — the distribution is what a calibration is
   later read off.
7. **Engagement three-state, fixture legs, one watched RED** against a neutered gate.

```js
const mySeam = {
  moment: 'commit',
  mode: 'advisory',
  grade: 'ADVISORY-FIRST (fact-check family)',
  templateVersion: 'mySeam-1',
  band: { advise: 0.5 },
  coverageTarget: null,            // null until a labeled set measures one
  questions: {
    claim_matches_code: {
      type: 'noul',
      instructions: 'Does this paragraph still describe what the code it cites does? ' +
        'Answer yes if the described behaviour matches the cited code.'
    }
  }
};
```

---

## 7. Budget

Measured on an Apple M4, 16 GB, 2026-09-19, against a RESIDENT WARM local provider, timed
at the HTTP client so the loopback round trip is included: **1 Noul 115.5 ms · 5-way Choice
165.8 · 12-way 178.0 · 3-level Score 122.4 · 4 Nouls 451.9 · a 10-question bundle 1,858 p50**.
Cold start ~25.4 s, **once per server lifetime** — which is the whole reason the provider is
resident and the hook is only a client of it.

| Moment | Budget | Questions that fit |
|---|---|---|
| edit | ≤ 500 ms | 1 — and honestly none; a tax on every edit gets the gate switched off |
| spawn / commit | ≤ 2 s | ≤ 8 |
| per-tick / in-app | ≤ 250 ms | 1 |

**Bundling buys nothing locally.** 1 / 4 / 10 questions cost 1× / 3.9× / 13.2×, because the
encoder emits one row per question with the full state appended to each. **Model size is not
the lever either** — a 151M and a 421M encoder landed within 2% per question. **State length
is the only lever there is.**

---

## 8. Never ask it

Never to write or generate anything · never to count · never any arithmetic, including
mapping a level to a value · never to order dates or versions · never to judge an image,
a render or a screenshot (it has no image input) · never *"is this well written / good /
more relevant"* (the lowest-scoring families published, ≈58–63%) · never a verdict a regex
already reaches correctly.

---

## 9. Calibrate and retrain

Full method, measured numbers, and the conclusion: `governance/LOCAL-MODELS.md` §7. This
is the shape, so a project can build its own — every path below is PROPOSED (this package
vends no labeled data, no trainer, and no calibration tool today; it names the shape they
would ship under if adopted).

### 9.1 A labeled row

One line of JSONL per row, the same wire shape the gate already asks:

```json
{
  "record": "example-record.field",
  "state": "…the state your seam's filterState produced…",
  "questions": { "knob_role": { "type": "choice", "criteria": { "…": "…", "unique": "the residue — no sentence written" } } },
  "label": "coefficient",
  "confidence": "high",
  "reasoning": "one sentence: why this row got this label, not the others"
}
```

Build the set from your own history first — past briefs, authored tests, the incident
record, anything your repo already produced that carries a defensible answer. Label only
where the history is ambiguous. `reasoning` is not decoration: it is what makes a labeled
set audit-able later, and it is what a "the labeler's confidence doesn't predict the
model's failures" finding (§7.2, measured here) is actually read off.

### 9.2 The calibrate tool's output (proposed shape: `tools/judgment/calibrate-<seam>.js`)

Given a labeled set and a results file (one recorded answer per row, same order), it
prints and never edits a band on its own:

- **overall accuracy** and **top-label ECE** (n-weighted, 10-bin)
- **the coverage curve** at seven thresholds (`p(argmax) ≥ 0.5 … 0.99`): answered / coverage
  / correct / precision, per rung — never a single accuracy line
- **per-label accuracy**, so a collapse onto one or two options is visible rather than
  averaged away
- **the confusion table**: predicted-label mass, and the top true→predicted pairs
- **the band verdict**: `armed: true/false` against the project's own precision/coverage
  bars, computed, never asserted

A re-run OVERWRITES its own report; the raw per-row results file is the durable artifact,
and any hand-authored commentary lives in a clearly marked section below the generated
part, same discipline `governance/LOCAL-MODELS.md` §7 itself follows.

### 9.3 The trainer's flags (proposed shape: `tools/judgment/train-head.py`)

A single-device fine-tune of a TRAINED provider's own decision head, backbone frozen:

| flag | what it does |
|---|---|
| `--sets a.jsonl,b.jsonl` | one or more labeled sets, concatenated in order; cross-set duplicate `(record, question)` pairs are FATAL (a row must never sit in one set's train half and another's val half); an in-set duplicate is a NOTE, not a fatality |
| `--results a.results.jsonl,b.results.jsonl` | the provider's own recorded soft-target distribution per row, same order as `--sets`, used as the KL target |
| `--folds-file path.json` | write-once, read-forever: the k-fold split is generated on first use and every later run reads the SAME file, so two runs over the same rows are comparable by construction, not by coincidence |
| `--lrs` / `--mix` | sweep learning rate and the mix weight between the hard label and the provider's own soft distribution (`(1-mix)·onehot + mix·distribution`) — report the sweep as a table, never a single winning cell |
| `--epochs` | an epoch CAP, not a target; early stop on held-out fold loss is the actual stopping rule, and a run that hits the cap in every fold is a sign the cap was too low, not that training is done (§7.3) |
| `--stages` | for a split/hierarchical question (§7.4): trains one head per stage over the SAME frozen backbone, fold membership kept by ROW so a row's stage-1 and stage-2 examples never cross the split |
| `--final` | **only past the band.** Writes a servable checkpoint directory (weights + the provider's own config + a `head-card.json` recording which labeled set, which folds file, which hyperparameters, and the measured CV metrics). Every other flag combination trains, evaluates, and reports — and writes NOTHING that could be served |

The backbone is frozen and asserted frozen at every run (zero gradients on the encoder,
checked, not assumed) — the trainer only ever changes the head. §7.3's numbers are what
this loop returns when it is run for real: ECE improves sharply, accuracy does not, and
the honest report is both facts side by side, never the flattering one alone.
