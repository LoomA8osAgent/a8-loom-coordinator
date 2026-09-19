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

| Class | What it is | Calibration | May it arm a `refuse` band? |
|---|---|---|---|
| **TRAINED** | a scoring head trained against proper scoring rules — the training objective IS the calibration | trustworthy in principle, still measured per §5 | **YES**, after calibration |
| **DECODE** | option logits read off a stock generative LLM. The argmax is usable; the probabilities are a decoder's token likelihoods wearing a distribution's shape | **not trustworthy.** The tracker's measured line: *confidence does not reliably flag errors* | **NO** — advisory routing / classification only |
| **DIFFUSION** | an option read off a diffusion canvas | unestablished | research only |
| **FIXTURE** | a deterministic stub answering from a planted map | n/a — synthetic | neither; every answer is labeled `provenance: synthetic` |

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

**A TRAINED 421M-parameter encoder-scorer (Apache-2.0), served over the wire by its
vendor's own loopback HTTP server, on the PyTorch runtime.** It answers all three
primitives, at roughly half the in-process ONNX latency, for one ~25 s load per session.
The in-process ONNX export of the same weights is a **Noul-only fallback** — useful when
no Python lane is installed, unusable for any Score or wide Choice (§2).

**For in-browser / zero-server use**, a TRAINED 151M-parameter ModernBERT-class scorer
(Apache-2.0) loads unmodified in a JS ONNX runtime, carries 25 candidate slots, ships its
own temperature calibrator, and measured 196.8 ms p50 / 851 MB RSS on a 2-slot Choice.
**⚠ Choice-only until Noul and Score are evidenced on it** — its prompt encoding was
reconstructed from its own config rather than cross-checked against the vendor's engine,
so its timing is measured and its SEMANTICS are unverified. Do not design a Noul or Score
seam onto it before someone establishes both.

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

Library-first applies to the gate itself. A published, Apache-2.0 benchmark harness
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

**Seed on public data before spending a human's labelling pass.** The leading vendor
publishes ~20 public cases / 373 decisions, which is the set the whole reproduction
cohort reports against — so your numbers become comparable with theirs. A candidate that
fails on 373 public decisions never earns a pass over your own corpus. It is not a
substitute for your own labeled set.

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
