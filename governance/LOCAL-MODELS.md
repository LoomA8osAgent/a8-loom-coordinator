<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->
<!--
  WHAT THIS IS: the dated recommendation for the judgment layer's PROVIDER — what a
  decision model is, which classes of them may arm a gate, what one costs on real
  hardware, and how a band is calibrated before it is allowed to refuse anything.

  WHEN IT LOADS: on demand, when adopting `judgment.enabled`, choosing or swapping a
  provider, or arming a band. Never always-on.

  HOW TO FILL: nothing here is a placeholder — but every NUMBER is a measurement with a
  date and a machine attached, and measurements expire. See §0.
-->

# LOCAL-MODELS — choosing a provider for the judgment layer

**Version: 2026-09-19. Revised as the field moves** — see §0 for what that means and
what expires first.

The judgment layer (`hooks/judgment-gate.js` + `hooks/lib/decision-provider.js`) asks a
DECISION MODEL a closed question at a gate boundary. This document is about the model at
the other end of that loopback socket: what kind of thing it must be, which kinds may be
trusted with a refusal, what it costs, and what has to be measured before a band arms.

**It is a recommendation, not a dependency.** This package ships no model, no weights, no
runtime and no inference library. The contract is the wire — `POST /v1/systemone` with
`{ model, state, questions }` — so a provider is a choice a project makes and revises.

> **Names here are VENDORS and MODELS — facts, with dates and sources.** Nobody can install
> "a TRAINED 421M encoder-scorer"; they install **Laya**, from **convaiinnovations**, under
> **Apache-2.0**, served by **von**. What this package stays free of is PROJECT nouns — the
> repos, lanes and internal identifiers of the codebase these measurements came out of.
> That is what "unbranded" means here; it was never meant to strip the facts.

**Operator quickstart — a provider running end to end, with the commands:**
[`integrations/judgment.md`](../integrations/judgment.md).

---

## 0. What expires, and how to tell

This field moves faster than this file. Three classes of claim, with different shelf
lives:

| Claim class | Shelf life | How to refresh |
|---|---|---|
| **The architecture** (§1 classes, §2 primitives, §5 calibration method) | long | It follows from what calibration IS, not from any model. |
| **The measurements** (§3) | months | Re-run them on YOUR machine. A vendor's number was out by 5× here. |
| **The named candidates** (§4) | weeks | The community reproductions tracker: <https://huggingface.co/spaces/multimodalart/jev-reproductions-tracker> |

The tracker's own standing line, adopted verbatim as the ceiling over everything in §4:
**no open model yet matches the leading proprietary decision model's calibration
claims.** Nothing in §4 is independently verified by this package; every per-candidate
detail is a repository / model-card reading, not a benchmark run.

---

## 1. Provider CLASSES — the distinction that decides what a provider may DO

A local judge is not one thing. Three classes exist, they differ in exactly the property
this whole layer runs on — **whether the returned distribution is a calibrated confidence
or merely an ordering** — and the difference is architectural rather than a matter of
size or score.

| Class | What it is | Calibration | Named examples | May it arm a `refuse` band? |
|---|---|---|---|---|
| **TRAINED** | a scoring head trained against proper scoring rules — the training objective IS the calibration | trustworthy in principle, still measured per §5 | **Jev 1.13.0** (TypeSafe AI, commercial, remote) · **Laya 421M** (`convaiinnovations/laya`, Apache-2.0) · **Verdict / OpenJev 151M** (`heman10x/rlcd-modernbert-151m`, Apache-2.0) · NanoJev 0.6B · `Mapika/decider-2b` · Bespoke Nimble 9B | **YES**, after calibration |
| **DECODE** | option logits read off a stock generative LLM. The argmax is usable; the probabilities are a decoder's token likelihoods wearing a distribution's shape | **not trustworthy.** The tracker's measured line: *confidence does not reliably flag errors* | `snapjudge` (MIT, MLX) · `jevmlx` (MIT, explicitly *"not a trained head"*) · `system-one` Lite (MIT, logit-reading on stock Qwen3 1.7B/4B) · `kshetrajna12/reflex` (MIT) | **NO** — advisory routing / classification only |
| **DIFFUSION** | an option read off a diffusion canvas | unestablished | DiffusionGemma canvas readout (vLLM PR #57250) | research only |
| **FIXTURE** | a deterministic stub answering from a planted map | n/a — synthetic | `provider.kind:"fixture"` in this package | neither; every answer is labeled `provenance: synthetic` |

**THE RULE, and it is the load-bearing one here: only a TRAINED provider may arm a
`refuse` band.** A refusal band is a cut on a confidence NUMBER. A DECODE provider's
number is not that quantity, and wiring a band to it is reading a thermometer that only
knows hotter-or-colder. `hooks/judgment-gate.js` enforces this mechanically: a seam
configured `mode: "refuse"` against a provider whose class is not `TRAINED` prints
**BAND NOT ARMED** and degrades to advisory for that run. It is loud in both directions
on purpose — degrading silently would be pass-by-silence one way and
refuse-on-a-bad-instrument the other.

**Undeclared is not TRAINED.** `judgment.provider.providerClass` defaults to empty, which
never arms a band. That is the safe direction and the honest one for a value nobody has
measured. Declaring it is a claim, and §5 is the evidence that claim needs.

---

## 2. What a provider must be able to ANSWER — and the trap that is not about accuracy

The three primitives (wire shapes in `hooks/lib/decision-provider.js`):

- **Noul** — a yes/no as a probability in [0,1]. Always exactly two options.
- **Choice** — one key from a NAMED, CLOSED menu, with a probability per option.
- **Score** — a position on an ORDERED ladder of named SITUATIONS. The number is an
  ordinal index, never a measurement.

**⛔ CHECK THE OPTION CEILING BEFORE YOU DESIGN A SEAM.** Measured 2026-09-19: the
published ONNX exports of an otherwise fully capable TRAINED model froze their option
axis at **2** — verified twice, from the loaded session's input metadata and from the
protobuf itself. Only batch and sequence were exported as dynamic axes; the option axis
was traced away. The consequence is absolute and has nothing to do with quality:

| Primitive | On that export |
|---|---|
| Noul | ✅ always exactly 2 options |
| Choice, 2 options | ✅ |
| Choice, 3+ options | ❌ refused at encode |
| Score, any ladder | ❌ — a 3-level ladder is 3 markers |

**It was the CONVERSION's limit, not the model's**: the same weights on the vendor's own
PyTorch runtime answered a 12-way Choice and a 5-level Score without complaint. Two
lessons, both general:

1. **A provider reports its ceiling; it does not crash on a wide question.** An
   over-wide menu is a capability report.
2. **A seam whose primitive the configured provider cannot encode DENIES** — the seam was
   engaged, an answer was owed, and none came. That is the honest state, and the gate
   prints it. Do not "solve" it by restating a Score as a cascade of Nouls: the ordinal
   ladder IS the primitive, synthesising an ordering from independent binaries
   manufactures a ranking the model never expressed, and it costs one forward pass per
   rung.

---

## 3. The measured table — Apple M4, 16 GB, 2026-09-19

> Every number below was RUN on one machine on one date: **an Apple M4, 10 cores, 16 GB
> unified memory, macOS 15.7.5, Node 26**, against the SAME 902-character state (≈304
> tokens per question), 30 runs per shape, warm. The reference-runtime figures are timed
> at the HTTP client, so they INCLUDE the loopback round trip and the JSON encode/decode
> — the cost a consumer actually pays. Re-measure on your own hardware before you trust
> any of it; see §3.4 for what happened to the vendor's published figures.

### 3.1 Per-question latency

| Shape | Reference runtime (PyTorch, GPU) | In-process ONNX export (CPU) |
|---|---|---|
| 1 Noul | **115.5 ms** | 199.6 ms |
| 1 Choice, 5-way | **165.8 ms** | ❌ refused at encode |
| 1 Choice, 12-way | **178.0 ms** | ❌ refused at encode |
| 1 Score, 3-level | **122.4 ms** | ❌ refused at encode |
| 1 Score, 5-level | **124.9 ms** | ❌ refused at encode |
| 4 Nouls | **451.9 ms** | 876.3 ms |
| 10 Nouls | **1,520 ms** | 2,179.6 ms |
| a 10-question mixed bundle | **1,857.7 p50 / 2,017.8 p95** | ❌ 6 of 10 refused |

### 3.2 Cold start — the whole reason the provider must be RESIDENT

| | Reference runtime | In-process ONNX |
|---|---|---|
| Cold load | **~25.4 s**, ONCE per server lifetime | **551 ms**, PER PROCESS |
| Resident footprint | ~3.3 GB (GPU) | ~1.15 GB |

A PreToolUse hook is a short-lived process. On the in-process path it therefore pays 551
ms **before it asks anything** — one question from a cold hook is ~750 ms, on every tool
call. **That disqualifies the per-fire model.** The load is paid once by a resident
loopback server and the hook is a client of it (`hooks/judgment-server.example.sh`).
⚠ And read the footprint with the right tool: `ps` RSS reported 238 MB for a process
whose real GPU-side footprint was 3.3 GB.

### 3.3 ⛔ BUNDLING BUYS NOTHING on a local provider — and the lever is the STATE

1 → 4 → 10 questions cost **1× → 3.9× → 13.2×** on the reference runtime and **1× → 4.4×
→ 10.9×** on the ONNX export. Two independent implementations, the same *super-linear*
shape, and the reason is structural and readable in the source: the encoder emits **one
row per question with the full state appended to each**, so a 10-question bundle is 2,990
tokens of transformer work rather than 304. Above roughly six questions a bundle costs
slightly MORE than issuing them separately.

"Bundle, don't chain" is still right — but it is an API-ROUND-TRIP and client-bookkeeping
argument, and against a local provider it saves no compute. Any budget computed as
"N questions ≈ one call" is wrong.

**⛔ MODEL SIZE IS NOT THE LEVER. STATE LENGTH IS.** Measured on the same state: a
151M-parameter fp16 encoder and a 421M-parameter int8 encoder landed **within 2% of each
other per question** (196.8 ms vs 199.6 ms). The binding cost is the ~300-token forward
pass, and it is insensitive to parameter count and to quantisation. **A smaller
checkpoint will not fix a budget miss; a shorter state might.** Keeping the state minimal
was already required for ACCURACY (irrelevant context degrades the answer) — on a local
provider it is also the only performance lever that exists.

### 3.4 What this says about published figures

The vendor's own numbers for the same checkpoint were **38 ms** for one question and
**156 ms** for ten. Measured here: **199.6 ms** and **2,180 ms** — 5.2× and 14× out, and
the gap widens with bundle size precisely because the claimed batching amortisation does
not materialise. Treat a published latency as an upper bound on hope.

### 3.5 The budget per moment, which follows from the above

Against a RESIDENT WARM provider (a cold process adds its whole load and busts every row):

| Moment | Budget | Questions that fit |
|---|---|---|
| **Edit-time** (PreToolUse on a diff) | ≤ 500 ms | **1** — and honestly, none: ~600 ms × every edit of a session is a tax paid hundreds of times, and a gate that slows every keystroke-to-disk gets switched off |
| **Commit / spawn** | ≤ 2 s | **≤ 8**. Ten bundled is marginal (p95 1% over the ceiling) |
| **In-app / per-tick** | ≤ 250 ms | **1** |

**⇒ ONE QUESTION PER SEAM FITS EVERY TIER; A TEN-QUESTION BUNDLE FITS NONE.** A seam
whose candidate set exceeds its budget **ranks in code, takes the top N, and prints the
remainder BY NAME as unexamined** — an unexamined candidate silently dropped is the
fail-open shape.

Prefer the **commit** moment over the **edit** moment wherever the question allows it, and
not only for cost: the complete change is in view at the commit and never at a single
edit, and most rules govern what LANDS rather than what is typed.

---

## 4. The current pick — 2026-09-19

- 🔭 **WATCH THIS ONE PAGE for what replaces everything below:** the community
  reproductions tracker,
  <https://huggingface.co/spaces/multimodalart/jev-reproductions-tracker> (45 entries at
  the time of writing). It catalogues open attempts at this model class, sorted by how
  they work — **decoding** (logits off a stock LLM), **diffusion** (a canvas readout),
  **trained** (a real scoring head), plus **prior art** and **explainers**. Its own
  standing ceiling line: **no open model yet matches Jev's calibration claims.** And only
  the **TRAINED** rows are even candidates for a band (§1) — a new entry in the decoding
  column is never a new judge, however good its accuracy column looks.

### 4.1 The commercial reference — Jev, by TypeSafe AI (optional)

The working implementation of this shape, and the one every open reproduction reports
against. `POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer <key>`,
model pinned as **`jev-1.13.0`** (never `jev-latest` / `jev-preview`). ~100 ms typical
(70–500 ms from US West); errors `401` / `422` / `429` / `529`; rate 1,200 req/min.
SDKs: **`@typesafe-ai/sdk`** (Node — `choice()` / `noul()` / `score()` builders +
`TypeSafeClient.systemOne({state, questions})`) and **`typesafe-sdk`** (Python). Docs:
<https://docs.typesafe.ai> — an `llms.txt` index at the root, and `.md` appended to any
page gives the machine-readable form.

**Why it is OPTIONAL here, and cannot serve a repo gate:** it needs a key and a remote
call. `hooks/lib/decision-provider.js` refuses a non-loopback base URL outright, so a
brief, a diff or a commit message cannot be sent off-device by a configuration mistake. A
gate must never depend on a key being present or a service being up. Use it app-side or
author-time; gates run local or fixture.

**Price contrast, one line:** Jev is **$0.042 per million input tokens, output free**; a
local model has **zero marginal cost after a ~25 s load per session**.

### 4.2 The open primary — Laya 421M, served by von

**[`convaiinnovations/laya`](https://huggingface.co/convaiinnovations/laya), Apache-2.0, served by [von](https://github.com/wfzyx/von).** ModernBERT-large backbone (395M, bidirectional,
fully fine-tuned) plus a decision head trained from scratch against proper scoring rules —
so it is genuinely TRAINED, non-autoregressive, "it never generates text". It speaks the
same three primitives natively, answers all of them, and runs on PyTorch with an MPS
backend on Apple silicon (`cuda → mps → cpu`; there is no MLX path). 512 input tokens per
question.

It has **no HTTP server of its own**. **`von`** (`github.com/wfzyx/von`, Apache-2.0) is
what serves it behind `POST /v1/systemone`:

```
von serve --host 127.0.0.1 --port 8493 --backend laya --device auto
```

Measured here (§3): 115.5 ms per Noul, 165.8 ms 5-way Choice, 122.4 ms 3-level Score, one
~25.4 s cold load per server lifetime, ~3.3 GB resident on the GPU path.

**Two traps, both measured, both load-bearing:**

1. **`pip install von` INSTALLS THE WRONG PACKAGE.** PyPI `von` is `von 0.1a0`, MIT,
   2.5 KB, summary *"test pip package"*, by an unrelated author. Install from the git
   remote: `"von[all] @ git+https://github.com/wfzyx/von@master"`. Any instruction quoting
   the upstream README's install line is quoting a supply-chain hazard.
2. **`von serve` defaults to `--host 0.0.0.0`** — a LAN-exposed decision server with no
   auth unless `VON_API_KEY` is set. Pass `--host 127.0.0.1` explicitly, every time.

The in-process **ONNX export** of the same weights (`Mattepiu/laya-onnx`, Apache-2.0) is a
**Noul-only fallback** — useful when no Python lane is installed, unusable for any Score or
wide Choice, because the export froze its option axis at 2 (§2).

### 4.3 The in-browser option — Verdict / OpenJev 151M

**`heman10x/rlcd-modernbert-151m`, Apache-2.0.** ModernBERT-base (151,378,177 params) plus
a GLiClass bi-encoder head, non-autoregressive; composite Cross-Entropy + Brier loss, then
post-hoc L-BFGS temperature scaling (T = 1.0716); published ECE 3.35% (on a 1,000-case
Banking77 / CLINC150 intent set — generic NLP, nothing like your content). It loads
unmodified in `onnxruntime-node`, carries **25 candidate slots**, and measured **196.8 ms
p50 / 211.8 p95, 851 MB RSS** on a 2-slot Choice over a 289-token state.

**⚠ Choice-only until Noul and Score are evidenced on it.** Its prompt encoding was
reconstructed from its own `config.json` rather than cross-checked against the vendor's
own engine: the timing is measured, the SEMANTICS are unverified. Do not design a Noul or
Score seam onto it before someone establishes both.

### 4.4 The also-rans, one line each

| Candidate | Verdict |
|---|---|
| **NanoJev 0.6B** (`TianyuCodings/NanoJev`) | a training-pipeline RESEARCH repo, not a provider: torch-only, no server, **no licence file found** — unusable as shipped |
| **Reflex** (`kshetrajna12/reflex`, MIT) | DECODE class (direct logits off a stock Qwen) **and NVIDIA-only** — not runnable on Apple silicon |
| **"System-One 4B"** | LICENCE-BLOCKED: no 4B model exists under that name; the closest same-named family is non-commercial. `system-one` **Lite** (MIT) is a different, DECODE-class thing, worth exactly one job: a transport smoke target for the `/v1/systemone` adapter before real weights are downloaded |
| **Bespoke Nimble 9B** (`bespokelabs/Bespoke-Nimble-9B`) | **RE-EVALUATED 2026-09-20 (desk research; nothing downloaded or run) AND DROPPED, on three grounds, two of them new.** Genuinely TRAINED, with a real fine-tuning recipe (LoRA r16, lr 5e-5, batch 8, one epoch, 2,676 labelled examples), and the base-licence worry is CLOSED — both the adapter and `Qwen/Qwen3.5-9B` are Apache-2.0. But: **(1) 9B at ~18 GB BF16 does not load on a 16 GB machine at any tier, and its MLX runner explicitly refuses quantised weights — no quantised build of any kind exists;** **(2) the serve path disclaims the very number a band is a cut on** — *"confidence is entropy concentration, not calibrated accuracy"* — which under §1 leaves the architecture TRAINED but the NUMBER vendor-disclaimed, so it may not arm a refusal; **(3) the REPO carries no licence** (`license: null`, licence API 404 — the only `LICENSE` in the tree belongs to a vendored third-party skill), and its `openjev-sglang` serve dependency has none either, so the code is all-rights-reserved by default and nothing in it may be vendored, ported or transliterated. Any one of the three is disqualifying on its own |
| **`Mapika/decider-2b`** | Apache-2.0 adapter over a Qwen-licensed base — same base-licence caveat, unmeasured here |

### 4.5 Laya vs Jev — the vendor's own numbers, and what they license you to build

> **⚠ SOURCE: VENDOR-CLAIMED, and not a same-set comparison.** The rows below are Laya's
> own evaluation (23,024 questions) placed beside Jev's PUBLISHED figures. Nothing in it
> is independently verified, and no threshold anywhere may be trusted on its strength. It
> is used for ONE thing: deciding, before any build, which seams are even CANDIDATES for a
> refusal.

**Latency (vendor-claimed):** Laya ~38 ms for a single question on their hardware, against
~150–400 ms for a hosted API round trip. Measured here on an Apple M4, the same checkpoint
answered in **115.5 ms** including the loopback hop (§3.4: treat a published latency as an
upper bound on hope).

| Task family | Claimed accuracy | What a seam in it may do |
|---|---|---|
| intent / routing | **99.1** | refuse-grade, after calibration |
| moderation | 96.7 | refuse-grade, after calibration |
| topic classification | **93.9** | refuse-grade, after calibration |
| emotion / tone | 90.6 | advisory |
| inference / fact-check | **88.3** | **advisory, and it stays advisory** |
| instruction following | 87.8 | advisory |
| robustness (adversarial) | 85.1 | the ceiling on all of them — §5.4 |
| reading comprehension | 84.7 | advisory |
| search relevance | **62.8** | **not built** |
| response quality | **58.1** | **not built** |

**Selective automation (vendor-claimed):** 92.2% accuracy at 50% coverage vs 83.8% at
100% — the shape §5.3 is built on.

**The consequence, in one line:** *routing and classification seams may become
refuse-grade; fact-check seams advise first and keep advising; quality and relevance seams
are never built at all.* Refusing on an 88%-accurate reading of a paragraph blocks correct
work about one time in eight, and a gate that cries wolf gets switched off.

**What is NOT a decision provider, stated so nobody tries:**

- **A stock generative LLM with a JSON-schema prompt.** That is the DECODE class: the
  argmax may be fine, the probabilities are not a confidence, and no band may cut them.
- **Anything that cannot return a distribution over exactly the submitted candidate
  keys.** That is the entire interface. A model that needs the validation relaxed is not
  a provider — it is a model you are arguing with.
- **A LoRA-over-9B fine-tune trained on rented datacentre GPUs.** Reviewed and rejected
  here as a runtime: the recipe is real and useful, but it is not a 16 GB-laptop
  operation, no quantised build was verified to exist, and its base model's licence
  governs what you actually load even when the adapter is permissive.
- **Anything remote.** A repo gate must never depend on a remote key being present or a
  remote service being up. `hooks/lib/decision-provider.js` refuses a non-loopback base
  URL outright.

---

## 5. CALIBRATION — how a provider earns a band

A provider is adopted when it passes this gate, and the result is a row in a threshold
table, not an opinion:

| # | Criterion |
|---|---|
| 0 | **CLASS** established from the architecture (§1) and stated. A DECODE provider is admitted to advisory seams only. |
| 1 | **Licence** commercially clean if you intend to ship or recommend it — INCLUDING the base model's where it is an adapter, and the training data's. |
| 2 | **Runs on the target machine**, through the loopback wire, with no new subsystem. |
| 3 | **Discrimination + probability quality + selective risk, MEASURED** on your own labeled set (§5.1, §5.2). |
| 4 | **Latency measured at the moment's budget on the target machine** (§3.5), not quoted from a README. |
| 5 | **The validation contract passes unmodified** — `hooks/lib/decision-provider.js` `validateAnswers`, every clause. |

### 5.1 The instrument is VENDORED, never written

Library-first applies to the gate itself. **`AbdelStark/jev-benchmarks` (Apache-2.0)**
already measures exactly what criterion 3 needs — accuracy and macro-F1
(discrimination), multiclass Brier / NLL / top-label ECE (probability quality, which is
what makes the TRAINED-vs-DECODE distinction *measurable* rather than merely
architectural), and *maximum threshold-realizable coverage at a fixed empirical error
budget* (which IS the threshold-row derivation). **Do not spec, write, or fork a parallel
harness**: a hand-rolled selective-risk curve computed against the wrong denominator
reads as a better model, and the definition is the hard part.

**⚠ THE HARNESS IS THE INSTRUMENT, NEVER THE GATE.** It ships generic NLP datasets. Your
gate is YOUR content. Adopt the harness, the metric definitions and its manifest format;
supply your own manifests.

It takes a **JSONL manifest** (ordered label tuples + a target index), runs via **`uv`**,
is TypeSafe-SDK-only on the wire but **honours `TYPESAFE_BASE_URL`** — so it points at any
loopback `/v1/systemone` server (von, snapjudge, `system-one` Lite) without a fork — and
its backend interface (`warmup` / `predict` / `close` → a common `Prediction`) means an
in-process provider is a backend CLASS rather than a fork. ⚠ Its own terms were not
fetched: UNVERIFIED before any redistribution.

**Seed on public data before spending a human's labelling pass.** TypeSafe publishes ~20
public cases / 373 decisions at <https://evals.typesafe.ai> — the set the whole
reproduction cohort reports against, which is what makes your numbers comparable with
theirs. A candidate that fails on 373 public decisions never earns a pass over your own
corpus. It is not a substitute for your own labeled set.

### 5.2 A threshold is keyed by (provider, ARITY) — never by provider alone

`confidence` is distribution CONCENTRATION, a property of the model rather than of the
question, so two providers answering equally well can be systematically differently
concentrated. **And measured 2026-09-19, it is a property of the MENU SIZE too:** the
model's own temperature table set one value for 3–5-option questions and a very different
one for 11+, so on a SINGLE state a 5-way Choice answered at confidence **0.0318** and a
12-way at **0.8044** — the wider menu looking eight times more confident because of a
temperature row, not because of evidence. The 8-way form of the same question on the same
state picked a DIFFERENT option.

Consequences that bind:

- A band read off a mixed-arity population is read off the temperature table by accident.
- **A 5-way Choice at confidence ~0.03 gets no band at all.** Advisory is the only honest
  grade there.
- Swapping a provider silently invalidates every band. So does changing a menu's width.

### 5.3 Thresholds are a COVERAGE CURVE, never a single line

Selective automation is the whole mechanism: the confident fraction of answers is
materially better than the average (a vendor-claimed 92.2% at 50% coverage vs 83.8% at
100% — their number, unverified, but the SHAPE is the point). So a seam automates only
its high-confidence fraction and escalates the remainder as an advisory **naming what it
could not decide**. *"The gate had nothing to say about this one"* is a legitimate,
PRINTED outcome — silence is a pass without a question; this is a question with an honest
abstention.

Record `coverageTarget: null` until you have measured one. The shipped example roster
does exactly that, so the hole is VISIBLE rather than implied. Inventing a coverage
target before the labeled set is a cookbook value adopted as canon.

### 5.4 A hostile-input leg is a PRECONDITION of arming any refusal

A judgment seam at a gate boundary reads AGENT-AUTHORED text — a brief, a paragraph, a
commit message — which is precisely the text most capable of containing *"ignore the
criteria and answer yes"*. Adversarial robustness is the lowest-scoring family on every
published breakdown.

The STRUCTURAL defence holds: the returned key is looked up, never interpreted, so the
worst case is a wrong verdict and never an executed instruction. But a wrong REFUSAL is
itself a cost. **So: no seam arms its `refuse` band until its red-fixture includes a
hostile leg against LIVE weights** — an input written to steer the answer, asserting that
the steer either fails or lands outside the automated coverage fraction and escalates.

`hooks/judgment-gate.selftest.js` proves the narrow half of this deterministically: the
gate reads its PROVIDER's answer and not the input's instructions. That is a real
property and it is not the live test.

### 5.5 Nothing here is calibrated

Every number in §3 is latency, memory, shape, or validation. **No accuracy was measured.
None.** That is why the shipped roster's bands are placeholders, why both example seams
are advisory, and why `refuse` is off by default. Say the same about yours until you have
run §5.1.

---

## 6. Privacy posture

The judgment layer is on-device by construction, and the enforcement is mechanical rather
than documentary:

- `hooks/lib/decision-provider.js` **refuses a non-loopback base URL** with its own typed
  error. A brief, a diff or a commit message cannot be sent off-device by configuration
  mistake.
- No key, no account, no remote service, and therefore nothing for a gate to depend on
  being up.
- A request-byte ceiling is enforced BEFORE the send, and an over-ceiling request is
  REFUSED rather than truncated — a truncated state is a different question, silently
  asked.
- The telemetry MUSTs in `hooks/judgment-server.example.sh` are measured in both
  directions, not assumed. A runtime you cannot prove silent is one you have not finished
  evaluating.

**The two measured findings, named:**

- **⚠ ONNX Runtime.** The `onnxruntime-node` npm package is clean at install on
  darwin/arm64 (the `postinstall` downloads nothing), but the native
  `libonnxruntime.*.dylib` embeds the **Microsoft 1DS / OneCollector** telemetry client —
  including the ingestion URL `https://mobile.events.data.microsoft.com/OneCollector/1.0`.
  Measured in both directions: a plain `InferenceSession.create` CREATES
  `~/Library/Application Support/Microsoft/DeveloperTools/.onnxruntime/` with a persistent
  **36-byte `deviceid` UUID** plus an event DB; with **`ORT_DISABLE_TELEMETRY=1`** set
  before the module loads, that directory is never created at all. The queue was empty
  after ~130 inferences and no socket ever opened — so nothing was observed leaving the
  machine, and *a persistent device identifier written to disk unasked is already the
  violation.* **Any consumer of `onnxruntime-node` sets the variable before the require**;
  the addon reads it at dylib init, so "before" is load-bearing.
- **✅ von + Laya are clean, and that is measured too.** No telemetry client, beacon or
  analytics import in either package. `laya`'s only network call is
  `huggingface_hub.snapshot_download`, guarded by `os.path.exists(model_dir)` — point it at
  a local weights directory and no network code executes. Across a full session (cold load,
  270 timed requests, both backends) `lsof -nP -a -p <pid> -i` showed **exactly one socket:
  the loopback listener**. `HF_HUB_OFFLINE=1` + `HF_HUB_DISABLE_TELEMETRY=1` belt-and-brace
  it; no `~/.cache/huggingface` was ever created.

---

## 7. What we measured — the first public calibration run of a local decision model

§5 above states the METHOD. This section is the first time it was actually RUN, on a real
seam, with a labeled set built from the seam's own content — a 16-way classification asking
a decision model which of 16 named ROLES a shader parameter (a "knob") plays. It is the
benchmark a next candidate is measured against, not a claim about decision models in
general: one seam, one corpus, one machine.

### 7.1 The method, concretely

- **The labeled set is agent-built from the seam's own artifacts** — 220 rows in the first
  pass (`knob-role-v1`), 336 after a second labelling pass (`knob-role-v1v2`) — each row a
  `{state, questions, label, confidence, reasoning}` tuple over a real parameter, hand-filed
  by the agents that authored the shapes, with the reasoning recorded beside the label. No
  operator-labeled set exists anywhere in this run; §5.1's "your gate is your content"
  extends to who writes the labels.
- **5-fold stratified cross-validation**, seed fixed, folds written once to a tracked file
  and re-read by every later run (never regenerated) — so a "same folds" comparison between
  two heads is a same-rows comparison, not a coincidence.
- **A coverage curve at seven thresholds** (`p(argmax) ≥ 0.5 … 0.99`), read as precision
  against coverage together, never as a single accuracy number — this is §5.3's rule, run
  for real.
- **Top-label expected calibration error (ECE)**, 10-bin, n-weighted — the number that
  answers "when this model says 99%, is it right 99% of the time" (it usually was not).
- **The band rule**: a threshold arms only at precision ≥ 0.9 **and** coverage ≥ 0.3 — a
  confident fraction has to be both right nine times in ten and cover at least three rows in
  ten, or automation is not honest. §5.2/§5.3, applied.

### 7.2 The numbers

Measured on an Apple M4, 16 GB, one machine, one date (2026-09-19), against the SAME 220 or
336 rows, same 16-way question, same band rule.

| provider | class | params / dtype | accuracy | top-label ECE | latency p50 | precision ≥ 0.9 at coverage ≥ 0.3? |
|---|---|---|---:|---:|---:|---|
| Laya 421M, via von | TRAINED | 421M, int8 | **34.5%** (76/220) | **0.60** | **156 ms** | **NO** — under the band at every threshold |
| kev-0.6b | TRAINED | 0.6B, fp32 | 29.1% (64/220) | 0.10 | 615 ms | NO — one row in 220 above p ≥ 0.5 |
| kev-4b | TRAINED | 4B, bf16, 8 GB weights | **44.1%** (97/220) | 0.22 | 3.4 s | **NO on coverage** — precision 89.5% at coverage 17.3% (p ≥ 0.8), needs ≥ 30% |

*Laya, per-answer detail:* at the confidence-99% cut, 150 of 220 rows are answered and
**89 of those 150 are wrong** — the mean confidence on correct answers (0.964) and on
wrong answers (0.939) differ by 2.5 points, i.e. the probability carries almost no
information about correctness. Precision moves 35.0% → 40.7% from coverage 98.6% down to
68.2% — 5.7 points of precision bought with 30 points of abstention. That is what
"anti-calibrated, not merely mis-calibrated" means as a number rather than a description.
(`agent-reports/knob-role-calibration-v1.md`)

*kev-4b, per-answer detail:* the mechanism §5.3 depends on is actually present — precision
rises from 47.8% at coverage 83.6% (p ≥ 0.5) to **100% at coverage 10.0%** (p ≥ 0.9), a
monotone reliability curve unlike Laya's. It fails the band on coverage alone: the
precision-≥-0.9 point sits at 17.3% coverage, not the required 30%. It also fails
criterion 4 (latency) outright at 21× Laya's p50, and criterion 5 as shipped — it rounds
every probability to two decimals on the wire, so a 16-option answer sums to 1.03 and
fails validation unmodified; a run-time renormalize step (never landed in a tracked
client) restored the softmax to make the run possible at all.
(`agent-reports/kev-eval-v1.md`)

### 7.3 The head retrain — a trained local head learns calibration, not the mapping

`decision-models.md` §12b-2 ratifies fine-tuning Laya's own decision head (backbone
FROZEN — zero encoder gradients, asserted at every run) against the labeled rows, loss
shape transplanted from the RFDT recipe (cross-entropy on the chosen answer, KL to soft
targets, the mix weight between hard label and the shipped head's own distribution swept
`{0, 0.25, 0.5}`), receipts as the training rows.

| run | rows | best cell | CV accuracy | CV ECE (T) | armed (prec ≥ 0.9 @ cov ≥ 0.3)? |
|---|---:|---|---:|---:|---|
| shipped head (baseline) | 220 | — | 34.7% | 0.61 | no |
| retrained, 10-epoch cap | 220 | lr 5e-5, mix 0.5 | 36.6% | 0.14 | **no** — best pooled cut 53.4% @ coverage 33.2% |
| retrained, 40-epoch cap | 220 | lr 5e-5, mix 0.5 | 37.0% | 0.13 | **no** — early stop fires before 40 in every fold; the cap was not the ceiling |
| retrained, merged rows | 336 | lr 5e-5, mix 0.25 | 36.0% | 0.11 | **no** — best pooled cut 59.8% @ coverage 34.8% |

**Accuracy is flat: 34.5% → 34.7% → 36.0–37.0%, a 2-point move that a reproducibility check
(the same cell run twice, different processes) measured as inside this machine's own
±1-point MPS noise floor.** ECE fell 5–6×, from 0.60 to 0.11–0.14, and the precision-at-high-confidence
number is real (precision 0.60 → 0.81 at p ≥ 0.9 between the 220-row and
336-row runs) — **the retrained head becomes honest about being unsure faster than it
becomes more often right.** Adding 116 more rows targeted at the four roles the shipped
head scored 0% on bought those roles **zero** additional accuracy (−1.3e-05 accuracy per
added row, and a per-class slope indistinguishable from zero on ten of twelve classes that
gained rows) — the round the labelled-set expansion was aimed at exhausted as a lever with
no result. (`agent-reports/laya-head-retrain-v1.md`, `laya-head-retrain-v2.md`)

### 7.4 The question split — collapse gone, accuracy worse

The failure mode behind the flat curve: two of sixteen options (`unique`, the residue, and
`iterations`) absorbed 65% of every answer, at every row count. `decision-models.md` §P2.4a
splits the 16-way Choice into a two-stage question — a 5-way FAMILY Choice, then a 2–4-way
ROLE Choice inside the chosen family — reusing the same 336 labeled rows unrelabeled.

- **The attractor collapse is genuinely gone.** The two-stage retrain spreads across 14 of
  16 final options; the 16-way retrain never chose 3 of them at all.
- **The sub-question the split was built for does what it was built for.** Stage 2, asked
  inside the TRUE family, scores 49.6% retrained (up from 36.6% at 16-way), with single
  folds reaching precision 0.818 at coverage 0.361 — the closest this seam has come to the
  band in its whole history.
- **And end to end it is a net loss.** Composed accuracy **37% → 18%** (retrained), 34.5% →
  12.5% (shipped) — roughly HALVED in both cases, because stage 1 (the 5-way family gate) is
  itself only 30.1% accurate, and a knob mis-filed at stage 1 can never reach the stage-2
  question that would have answered it correctly. The split moved the failure from
  option-confusion to family-confusion; it did not remove it. (`agent-reports/knob-role-split-v1.md`)

### 7.5 The conclusion

**A trained local head, on a few hundred rows, learns CALIBRATION and not the MAPPING.**
Every intervention tried here — more training, more rows, a narrower question — moved ECE
sharply and moved accuracy barely or negatively. That is the signature of a model that is
becoming more honest about a decision boundary it was never given enough signal to learn,
not a model closing in on the answer. **A 16-way classification over close, jargon-adjacent
domain vocabulary is the wrong seam for a 421M-class local model at hundreds of labeled
rows.** The vendor's own published task-family table (§4.5) predicted this shape before any
of these runs: intent/routing and moderation score in the 90s, inference/fact-check sits at
88% and stays ADVISORY-FIRST by rule, and this seam — a closed-vocabulary classification
over technical jargon — sits below all of them on a corpus this small. **The fit that DOES
hold** is the shape `skills/judgment-SKILL.md` §5 already names as REFUSE-GRADE-eligible and
ADVISORY-FIRST-by-default: a yes/no fact-check over PROSE (does this brief demand an
evidence list, does this paragraph still describe what the cited code does) — one Noul, two
options, no jargon-dense closed menu to collapse onto.

**The kit is now the benchmark.** `research/labeled/knob-role-v1.jsonl` (+ `v2`, 336 rows
total) + the fixed fold files + `tools/judgment/calibrate-knobs.js` + `tools/judgment/train-head.py`
are a reusable measuring stick: any future provider — a new open checkpoint, a bigger local
model, a remote one — is graded by running the SAME rows through the SAME coverage-curve /
ECE / band arithmetic and reported against this table, never against its own vendor's
published numbers (§3.4's warning, restated: a vendor's number here was out by 5×).

---

## 8. Prior art, and what we took

Every project below was read for its SHAPE, not copied. Each row states what was adopted,
what was refused, and why — so a reader choosing a stack can see the same trade-offs rather
than re-discover them.

| project | what it is | took | refused | why |
|---|---|---|---|---|
| [`coldteadotai/abide`](https://github.com/coldteadotai/abide) (MIT) | compiles a repo's instruction files into a rubric at session start, evaluates after every edit and once per turn against the full diff, bands at 0.8 / 0.5–0.8 / below 0.5; ships a `calibrate` command that scores rules against real git history to find ones that never fire | the rubric compiled from the instruction corpus rather than hand-listed · one question per rule over a diff · a three-outcome band ladder (act / notify / nothing) · `calibrate` as a command that finds dead rules against real history | **the transport** — Abide evaluates on TypeSafe's cloud; every changed line leaves the machine under the user's key | a repo gate must never depend on a remote key or a remote service being up, and must never ship a diff off-device; cloud-only fails a local-first privacy posture outright, whatever the rubric's quality |
| [`thruwire/foreman`](https://github.com/thruwire/foreman) (MIT) | a fast classifier (Jev) supervising a slow coding agent concurrently, mid-flight, with a deterministic Python policy layer deciding what to do about the numbers (CONTINUE / START_WORKER / STEER_WORKER / STOP_WORKER / RETRY_WORKER / FINISH / ESCALATE) | concurrent mid-flight assessment as a pattern (a judge that watches a session IN PROGRESS, not only at a gate boundary) · a deterministic policy layer sitting between the model's number and the action taken — the model never acts directly | shipped as **Jev-only** (TypeSafe's hosted model is the implemented classifier; the README names other backends only as a future direction) · **Python-only**, a native `asyncio` runtime · **Codex-CLI-specific** as the only implemented worker, despite a documented worker protocol | this stack is deliberately runtime-agnostic (any coding agent, any language) and local-first; a fixed remote classifier and a single coding-CLI integration are both narrower than the surface this package targets |
| [`jaredpalmer/kev`](https://github.com/jaredpalmer/kev) (Apache-2.0) | a pointer-head classifier (LoRA r=16 over a Qwen backbone, cross-entropy on the option distribution) trained and served on MPS as well as CUDA, `/v1/systemone`-compatible, 0.5b–8b checkpoints | the MPS pointer-head training loop as a working reference · the lr finding — **5e-5**, because *"2e-4 erodes what the base model already knows"* — corroborated on a different head and a different corpus in our own retrain (§7.3) | **adoption as a resident provider** — the 4B checkpoint that is actually competitive (44.1% accuracy, ECE 0.22, a real coverage curve) measured 3.4 s p50 on this machine, 21× Laya's latency, and 8 GB of bf16 weights drove system swap to 11.6 GB alongside the compositor and the reference runtime already running | a local judge must be resident and fast enough that a gate firing on every edit does not become a tax anyone switches off; the only checkpoint size worth using here is the one that does not fit |
| [`featherless-ai/simple-jev`](https://github.com/featherless-ai/simple-jev) + [`RFDT`](https://github.com/featherless-ai/simple-jev/blob/main/RFDT/README.md) (repo licence unstated in the README, flagged rather than assumed) | RFDT fine-tunes a decoder LM with selected-label cross-entropy plus teacher→student KL to soft targets, from JSONL rows of `{request: {state, questions}, targets}`; `simple-jev` serves any open model as a decode-class classifier behind a `/v1/systemone` alias | **the loss shape** — cross-entropy on the chosen answer plus KL to soft targets, transplanted onto Laya's OWN decision head instead of a decoder's answer-token logits (§7.3); the observation that a receipt already IS a training row in this shape, for free | **RFDT as shipped** — decoder-only, requires NVIDIA BF16 GPUs (four in its own example), no Apple-silicon/MPS path, no calibration method stated, no benchmark against a trained head · **`simple-jev` untrained** — its own README states its outputs are "not calibrated probabilities of correctness," which is the DECODE class by definition (§1): argmax only, never a band | the loss shape is the real contribution and it transplants cleanly onto an already-TRAINED encoder head that already runs on this machine (§7.3's retrain is that transplant); the surrounding CUDA-only training rig and the untrained serving path are both refused as-is |
| [`cocktailpeanut/jevthoven`](https://github.com/cocktailpeanut/jevthoven) (MIT) | a working Jev composer — music generated from a prompt via ~75–80 sequential Choice calls per 16-bar piece | **the composer spine** — code enumerates a structured space (bars, instruments, a fixed vocabulary of musical moves), the model picks one of the enumerated things per call, code renders the result; zero lines of code reused, the shape only | the domain (music) and the sequential-call structure for a task with a much smaller, flatter decision space than this stack's | a composer over a wide space needs many small closed picks in sequence; this repo's own composition seams (PART 2 of `decision-models.md`) follow the same spine over a different domain |
| [`convaiinnovations/laya`](https://huggingface.co/convaiinnovations/laya) (Apache-2.0) + [`wfzyx/von`](https://github.com/wfzyx/von) (Apache-2.0) | a ModernBERT-large backbone (395M) plus a decision head trained from scratch against proper scoring rules — genuinely TRAINED, non-autoregressive, never generates text — served over `/v1/systemone` by `von`, since Laya has no HTTP server of its own | **the provider we run.** §4.2's install path, §7's whole benchmark, and §7.3's head retrain are all against this pair. Two install traps recorded rather than repeated: `pip install von` installs an unrelated 2.5 KB stub, and `von serve` defaults to `--host 0.0.0.0` | nothing — this is the adopted default, not a rejection | it is the only candidate measured here that is simultaneously TRAINED, resident-fast (156 ms p50), Apache-2.0, and answers all three primitives (Noul / Choice / Score) without an export ceiling — even though §7 shows its calibration on THIS seam does not clear the band |
