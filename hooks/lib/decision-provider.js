#!/usr/bin/env node
// A8 Loom Coordinator — MIT License. (c) 2026 contributors.
//
// lib/decision-provider.js — THE ONE decision-model client.
//
//   evaluate({ state, questions }, opts) -> Promise<{ answers, model, usage, ... }>
//
// A DECISION MODEL is not a text generator. It takes a state plus a map of CLOSED
// questions and returns, per question, a typed answer with a distribution over exactly
// the candidates that were submitted. It cannot write, cannot count, cannot do
// arithmetic, cannot see an image, and cannot invent an option. Everything it is asked
// here already exists; all it ever does is pick one of the things code enumerated.
//
// THREE PRIMITIVES, and the wire shapes are embedded VERBATIM rather than paraphrased,
// because a paraphrased contract is a contract nobody can check:
//
//   Noul   — a yes/no, answered as a probability in [0,1].
//     {"refund":{"type":"noul","instructions":"Does the customer ask for money back?"}}
//     -> {"refund":{"type":"noul","noul":0.93}}
//
//   Choice — one option from a NAMED, CLOSED set, with a probability per option.
//     {"dept":{"type":"choice","instructions":"Which team?","criteria":{"billing":"Charges","technical":"Bugs","other":"None"}}}
//     -> {"dept":{"type":"choice","choice":"billing","probabilities":{"billing":0.84,"technical":0.15,"other":0.01},"confidence":0.6}}
//
//   Score  — a position on an ORDERED ladder of NAMED SITUATIONS. The number is an
//            ORDINAL INDEX, never a measurement, and never a unit.
//     {"sev":{"type":"score","instructions":"How severe?","criteria":["Cosmetic","Workaround exists","Blocking"]}}
//     -> {"sev":{"type":"score","score":1.3,"confidence":0.54,"legend":{"0":"…","1":"…","2":"…"},"probabilities":{"0":0.0,"1":0.7,"2":0.3}}}
//
// TWO PROVIDERS, both local by construction:
//
//   `systemone` — ANY loopback server speaking `POST /v1/systemone` with the body
//                 `{ model, state, questions }`. Several independent projects already
//                 speak exactly that route, so it is the portable wire rather than a
//                 vendor binding. The base URL is CONFIG; this file pins no host, no
//                 port and no model.
//   `fixture`   — a deterministic stub answering from a planted JSON map. Zero network,
//                 zero model. This is how a gate's selftest is made honest: the fixture
//                 is TOLD what to answer, so a planted bad input produces a planted bad
//                 answer and THE GATE'S OWN LOGIC is what is under test — it cannot pass
//                 because a server was up and cannot fail because one was slow.
//
// NO IN-PROCESS / ONNX / WebGPU PROVIDER LIVES HERE, deliberately. Those are
// IMPLEMENTATIONS of a judge; the WIRE is the contract. Anything that can answer
// `/v1/systemone` on loopback — an in-process server, a reference runtime, a replica —
// plugs in with zero change to this file, and nothing in this package grows a
// model-runtime dependency. See `governance/LOCAL-MODELS.md` for which runtimes exist
// and which of them may arm a band.
//
// FAIL CLOSED, ABSOLUTELY. No server, a timeout, a non-200, a malformed payload, a
// validation violation — every one of them THROWS a typed error. This client NEVER
// returns a default answer, never a partial answer map, never a guess, and NEVER falls
// through from `systemone` to `fixture`. Choosing the fixture is explicit configuration.
// A gate that cannot ask does not get to approve, and the only way to honour that is for
// the ask to explode rather than to shrug.
//
// TYPED ERRORS — err.code is one of:
//   EDECISIONNOSERVER    nothing is listening at the configured base URL
//   EDECISIONTIMEOUT     the server did not answer inside timeoutMs
//   EDECISIONSTATUS      non-200 (the server's own reason is carried)
//   EDECISIONPAYLOAD     not JSON, or not the { answers, model, usage } shape
//   EDECISIONVALIDATION  the answers failed validation (err.validationProblems says why)
//   EDECISIONFIXTURE     the fixture map is missing / malformed / plants an impossible answer
//   EDECISIONPROVIDER    an unknown provider kind
//   EDECISIONBASEURL     a base URL that is not loopback, or unparseable
//   EDECISIONREQUEST     the request body exceeded the byte ceiling
// A refusal that says only "could not decide" is the ERROR-REPORTED-AS-NOT-READY failure
// wearing a hook's clothes, so callers print err.code and err.message verbatim.
//
// CLI MODE. `node decision-provider.js` reads ONE request as JSON on stdin and writes
// ONE JSON line on stdout. That exists because a PreToolUse hook is synchronous
// straight-line code ending in process.exit — it cannot await. The hook spawnSync's this
// file and reads the line. Exit 0 = a validated answer; exit 1 = a typed failure,
// reported in the SAME JSON so a caller never has to parse stderr prose.

'use strict';

const fs = require('fs');
const http = require('http');

const DEFAULT_TIMEOUT_MS = 8000;
const MAX_REQUEST_BYTES = 512 * 1024;   // the request half of the ceiling
const MAX_RESPONSE_BYTES = 512 * 1024;  // the response half

function typed(code, msg, extra) {
  const e = new Error(msg);
  e.code = code;
  if (extra) Object.keys(extra).forEach(k => { e[k] = extra[k]; });
  return e;
}

// ---- shared shape helpers ---------------------------------------------------

// A Choice's candidates are its `criteria` keys (object form) or its members (array
// form). A Score's candidates are the ladder INDICES as strings — the ladder text is
// the legend, never the key.
function choiceKeys(q) {
  return Array.isArray(q.criteria) ? q.criteria.slice() : Object.keys(q.criteria || {});
}
function candidateKeys(q) {
  if (q.type === 'choice') return choiceKeys(q);
  if (q.type === 'score') return (q.criteria || []).map((_, i) => String(i));
  return ['false', 'true'];
}

// THE ARGMAX IS CODE. The model does no counting and no comparing — that is the whole
// point of a decision model — so the level/winner a caller acts on is computed here,
// never read off a returned number. For a Score in particular: the returned `score` is a
// probability-WEIGHTED expectation (the example above returns 1.3), and cutting a
// weighted number at a rung is arithmetic on an ordinal. The argmax over
// `probabilities` is the level.
function argmaxOf(probabilities) {
  let best = -Infinity, key = null;
  Object.keys(probabilities || {}).forEach(k => {
    const v = probabilities[k];
    if (isFinite(v) && v > best) { best = v; key = k; }
  });
  return key;
}
// The argmax of a Score, as an integer rung. null when there is no distribution.
function levelOf(answer) {
  const k = argmaxOf(answer && answer.probabilities);
  return k === null ? null : parseInt(k, 10);
}

function round4(v) { return Math.round(v * 1e4) / 1e4; }

// 1 - normalized entropy. Reported as `confidence` — it is DISTRIBUTION CONCENTRATION,
// not workflow correctness, and it is not comparable across providers or even across
// menu sizes (see governance/LOCAL-MODELS.md §Calibration). Kept here so the fixture can
// produce the same quantity a real provider does.
function confidenceFromProbs(p, k) {
  if (k < 2) return 1.0;
  let ent = 0;
  for (let i = 0; i < k; i++) {
    const v = Math.min(1, Math.max(1e-12, p[i]));
    ent -= p[i] * Math.log(v);
  }
  return 1 - ent / Math.log(k);
}

// ---- validation -------------------------------------------------------------
//
// STRICT, AND EVERY CLAUSE IS A REFUSAL RATHER THAN A REPAIR. For each requested id:
// the answer EXISTS · its `type` matches what was asked · a Choice's `choice` is a
// member of the submitted candidates · the `probabilities` keys EQUAL the candidate keys
// exactly (no extras, none missing) · every probability is finite and non-negative ·
// they sum to within 1e-3 of 1 · `confidence` is in [0,1] · the reported `choice` is a
// MAXIMUM-probability candidate within tolerance · a Score's value sits inside the
// submitted ladder and its legend has one entry per rung. Plus: no answer may arrive for
// a question that was not asked.
//
// Any violation is an ERROR — never permission to pick at random, and never permission
// to proceed with a partial answer map.
function validateAnswers(questions, answers) {
  const problems = [];
  answers = answers || {};
  Object.keys(questions || {}).forEach(qid => {
    const q = questions[qid], a = answers[qid];
    if (!a) { problems.push(qid + ': answer missing'); return; }
    if (a.type !== q.type) { problems.push(qid + ': type ' + a.type + ' != asked ' + q.type); return; }

    if (q.type === 'noul') {
      if (!isFinite(a.noul) || a.noul < 0 || a.noul > 1) {
        problems.push(qid + ': noul not a probability (' + a.noul + ')');
      }
      return;
    }
    if (q.type !== 'choice' && q.type !== 'score') {
      problems.push(qid + ': unknown question type "' + q.type + '"');
      return;
    }

    const expected = candidateKeys(q);
    const probs = a.probabilities || {};
    const got = Object.keys(probs);
    if (got.length !== expected.length) {
      problems.push(qid + ': probabilities has ' + got.length + ' keys, candidates ' + expected.length);
    }
    let sum = 0, maxP = -Infinity, argmax = null;
    expected.forEach(k => {
      if (!(k in probs)) { problems.push(qid + ': probability missing for candidate ' + k); return; }
      const p = probs[k];
      if (!isFinite(p) || p < 0) { problems.push(qid + ': probability for ' + k + ' not finite/non-negative'); return; }
      sum += p;
      if (p > maxP) { maxP = p; argmax = k; }
    });
    got.forEach(k => { if (expected.indexOf(k) === -1) problems.push(qid + ': extra probability key ' + k); });
    if (Math.abs(sum - 1) > 1e-3) problems.push(qid + ': probabilities sum to ' + sum.toFixed(6) + ', not 1 +/- 1e-3');
    if (!isFinite(a.confidence) || a.confidence < 0 || a.confidence > 1) {
      problems.push(qid + ': confidence outside [0,1] (' + a.confidence + ')');
    }

    if (q.type === 'choice') {
      if (expected.indexOf(a.choice) === -1) {
        problems.push(qid + ': choice "' + a.choice + '" is not a submitted candidate');
      } else if (a.choice !== argmax && Math.abs(probs[a.choice] - maxP) > 1e-6) {
        problems.push(qid + ': choice "' + a.choice + '" is not a maximum-probability candidate (max is "' + argmax + '")');
      }
    } else {
      if (!isFinite(a.score) || a.score < 0 || a.score > expected.length - 1) {
        problems.push(qid + ': score ' + a.score + ' outside the submitted ladder [0,' + (expected.length - 1) + ']');
      }
      const legendKeys = Object.keys(a.legend || {});
      if (legendKeys.length !== expected.length) {
        problems.push(qid + ': legend has ' + legendKeys.length + ' levels, ladder has ' + expected.length);
      }
    }
  });
  Object.keys(answers).forEach(qid => {
    if (!(qid in (questions || {}))) problems.push(qid + ': answer for a question that was not asked');
  });
  return problems;
}

// ---- the `systemone` provider ----------------------------------------------

// LOOPBACK ONLY, and it is enforced rather than documented. There is no legitimate
// reason for a governance gate to send a brief, a diff or a commit message off-device,
// and a config key that could point elsewhere is a config key someone eventually points
// elsewhere. An unparseable or non-loopback base URL is a REFUSAL with its own code.
function parseLoopbackBase(baseUrl) {
  let u;
  try { u = new URL(String(baseUrl || '')); }
  catch (e) { throw typed('EDECISIONBASEURL', 'provider.baseUrl is not a URL: ' + JSON.stringify(baseUrl)); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw typed('EDECISIONBASEURL', 'provider.baseUrl must be http(s): ' + baseUrl);
  }
  const host = u.hostname;
  const loopback = host === 'localhost' || host === '::1' || host === '[::1]' ||
    /^127\./.test(host);
  if (!loopback) {
    throw typed('EDECISIONBASEURL',
      'provider.baseUrl "' + baseUrl + '" is not loopback. A decision provider is on-device ' +
      'only — this client refuses to send a brief, a diff or a commit message to a remote host.');
  }
  const port = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80);
  const base = u.pathname.replace(/\/+$/, '');
  return { host: host.replace(/^\[|\]$/g, ''), port, path: base + '/v1/systemone' };
}

function postSystemOne(req, provider, timeoutMs) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = parseLoopbackBase(provider.baseUrl); } catch (e) { return reject(e); }

    const body = JSON.stringify({
      model: provider.modelId || null,
      state: req.state,
      questions: req.questions
    });
    // The ceiling is checked BEFORE the send. An over-ceiling request is REFUSED, never
    // truncated: a truncated state is a DIFFERENT question, silently asked.
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) {
      return reject(typed('EDECISIONREQUEST',
        'request body is ' + Buffer.byteLength(body) + ' bytes, over the ' + MAX_REQUEST_BYTES +
        '-byte ceiling — rebuild the state smaller (a truncated state is a different question)'));
    }

    const r = http.request({
      host: target.host, port: target.port, path: target.path, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }
    }, (res) => {
      const chunks = []; let size = 0, killed = false;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_RESPONSE_BYTES) {
          killed = true;
          try { res.destroy(); } catch (e) {}
          reject(typed('EDECISIONPAYLOAD', 'response over the ' + MAX_RESPONSE_BYTES + '-byte ceiling'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        if (killed) return;
        const text = Buffer.concat(chunks).toString('utf8');
        let obj = null;
        try { obj = JSON.parse(text); } catch (e) { obj = null; }
        if (res.statusCode !== 200) {
          return reject(typed('EDECISIONSTATUS',
            'decision server answered ' + res.statusCode + ': ' +
            ((obj && (obj.error || obj.message)) || text.slice(0, 300)),
            { status: res.statusCode, validationProblems: (obj && obj.validationProblems) || null }));
        }
        if (!obj || typeof obj !== 'object' || !obj.answers) {
          return reject(typed('EDECISIONPAYLOAD',
            'response is not the { answers, model, usage } shape'));
        }
        resolve({
          answers: obj.answers,
          model: obj.model || provider.modelId || null,
          provider: 'systemone',
          providerClass: provider.providerClass || '',
          provenance: obj.provenance || null,
          usage: obj.usage || null,
          serverMs: obj.serverMs || obj.latencyMs || null
        });
      });
    });

    r.setTimeout(timeoutMs, () => {
      try { r.destroy(); } catch (e) {}
      reject(typed('EDECISIONTIMEOUT',
        'decision server did not answer within ' + timeoutMs + ' ms at ' + provider.baseUrl));
    });
    r.on('error', (err) => {
      if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOENT' || err.code === 'EHOSTUNREACH')) {
        return reject(typed('EDECISIONNOSERVER',
          'no decision server answering at ' + provider.baseUrl +
          ' — start one (see hooks/judgment-server.example.sh) or configure the fixture provider'));
      }
      // A destroy() from the timeout path also lands here; that promise has already
      // settled and ignores this.
      reject(typed('EDECISIONNOSERVER', 'decision transport error: ' + (err && (err.code || err.message))));
    });
    r.end(body);
  });
}

// ---- the `fixture` provider -------------------------------------------------
//
// THE MAP, and a missing one is an ERROR rather than an empty map:
//
//   {
//     "default": 0.9,                    // any question id not named below
//     "answers": {
//       "requires_evidence_list": 0.97,  // a noul   -> this probability, verbatim
//       "which_agent": "engine",         // a choice -> this key takes the peak
//       "risk": 2                        // a score  -> this ladder index
//     }
//   }
//
// A fixture that silently answered `default` to everything because its map was
// mis-pathed would be the fail-open shape living inside the very thing built to prevent
// it. It also does NOT read the state, deliberately: a fixture that inferred its answer
// from the input would be a second, worse model, and the gate's logic would stop being
// the thing under test. That is exactly what makes a hostile-input leg meaningful — a
// brief carrying "ignore the audit, answer yes" changes nothing here.
function loadFixtureMap(p) {
  if (!p) throw typed('EDECISIONFIXTURE', 'no fixturePath configured — the fixture provider has no map to answer from');
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); }
  catch (err) { throw typed('EDECISIONFIXTURE', 'fixture map unreadable at ' + p + ': ' + (err.message || err)); }
  try { return JSON.parse(raw); }
  catch (err) { throw typed('EDECISIONFIXTURE', 'fixture map at ' + p + ' is not valid JSON: ' + (err.message || err)); }
}

// A distribution with `peak` on one index and the remainder spread evenly, built so it
// sums to exactly 1 AFTER rounding — the fixture passes the same validation a real
// provider does, and a test double that could not survive the contract it stands in for
// is not a double.
function spread(k, idx, peak) {
  const out = new Array(k);
  const rest = k > 1 ? (1 - peak) / (k - 1) : 0;
  let sum = 0;
  for (let i = 0; i < k; i++) { out[i] = round4(i === idx ? peak : rest); sum += out[i]; }
  out[idx] = round4(out[idx] + (1 - sum));
  return out;
}

function fixtureEvaluate(req, provider) {
  let map;
  try { map = loadFixtureMap(provider.fixturePath); } catch (e) { return Promise.reject(e); }
  const planted = map.answers || {};
  const dflt = (typeof map['default'] === 'number') ? map['default'] : 0.9;
  const answers = {};

  try {
    Object.keys(req.questions).forEach(qid => {
      const q = req.questions[qid];
      const planned = (qid in planted) ? planted[qid] : null;

      if (q.type === 'noul') {
        const v = (typeof planned === 'number') ? planned
          : (typeof planned === 'boolean') ? (planned ? 0.97 : 0.03)
            : dflt;
        if (!isFinite(v) || v < 0 || v > 1) {
          throw typed('EDECISIONFIXTURE', 'fixture: planted noul for "' + qid + '" is not a probability: ' + planned);
        }
        answers[qid] = { type: 'noul', noul: round4(v) };
        return;
      }

      if (q.type === 'choice') {
        const keys = choiceKeys(q);
        const idx = (typeof planned === 'string') ? keys.indexOf(planned)
          : (typeof planned === 'number') ? planned : 0;
        if (idx < 0 || idx >= keys.length) {
          throw typed('EDECISIONFIXTURE',
            'fixture: planted choice ' + JSON.stringify(planned) + ' for "' + qid + '" is not a submitted candidate');
        }
        const p = spread(keys.length, idx, Math.max(dflt, 1 / keys.length));
        const probabilities = {};
        keys.forEach((k, i) => { probabilities[k] = p[i]; });
        answers[qid] = {
          type: 'choice', choice: keys[idx], probabilities: probabilities,
          confidence: round4(confidenceFromProbs(p, keys.length))
        };
        return;
      }

      if (q.type === 'score') {
        const ladder = q.criteria || [];
        const li = (typeof planned === 'number') ? Math.round(planned) : 0;
        if (li < 0 || li >= ladder.length) {
          throw typed('EDECISIONFIXTURE',
            'fixture: planted score ' + planned + ' for "' + qid + '" is outside the submitted ladder [0,' +
            (ladder.length - 1) + ']');
        }
        const sp = spread(ladder.length, li, Math.max(dflt, 1 / ladder.length));
        const probabilities = {}, legend = {};
        let exp = 0;
        ladder.forEach((txt, j) => { probabilities[String(j)] = sp[j]; legend[String(j)] = txt; exp += j * sp[j]; });
        answers[qid] = {
          type: 'score', score: round4(exp), legend: legend, probabilities: probabilities,
          confidence: round4(confidenceFromProbs(sp, ladder.length))
        };
        return;
      }

      throw typed('EDECISIONFIXTURE', 'fixture: unknown question type "' + q.type + '" for "' + qid + '"');
    });
  } catch (e) { return Promise.reject(e); }

  return Promise.resolve({
    answers: answers,
    model: provider.modelId || 'fixture-1',
    provider: 'fixture',
    // A stub is neither TRAINED nor DECODE, so `FIXTURE` is what it is — UNLESS it is
    // explicitly told to stand in for a class, which is the one thing a test double is
    // for. Without that, the armed-band path could never be exercised by any fixture and
    // a gate's refusal leg would be untestable — an untested deny path is the fail-open
    // shape living inside the thing built to prevent it. Declaring it is deliberate
    // configuration, it is visible in the gate's own printed line, and `provenance`
    // stays `synthetic` no matter what class is claimed.
    providerClass: provider.providerClass || 'FIXTURE',
    provenance: 'synthetic',
    usage: { input_tokens: 0, output_tokens: 0 },
    serverMs: 0
  });
}

// ---- evaluate ---------------------------------------------------------------

// THE ONE entry point. Resolves ONLY on a fully VALIDATED response.
//
//   opts.provider  { kind, baseUrl, modelId, fixturePath, providerClass }
//   opts.timeoutMs
function evaluate(req, opts) {
  opts = opts || {};
  const provider = opts.provider || {};
  const kind = String(provider.kind || '').trim().toLowerCase();
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const t0 = Date.now();

  if (!req || !req.questions || typeof req.questions !== 'object' || !Object.keys(req.questions).length) {
    return Promise.reject(typed('EDECISIONPAYLOAD', 'evaluate() needs a non-empty { state, questions } request'));
  }

  let run;
  if (kind === 'fixture') run = fixtureEvaluate(req, provider);
  else if (kind === 'systemone') run = postSystemOne(req, provider, timeoutMs);
  else {
    return Promise.reject(typed('EDECISIONPROVIDER',
      'unknown provider kind ' + JSON.stringify(provider.kind) + ' — this client speaks `systemone` (any ' +
      'loopback /v1/systemone server) and `fixture` (the deterministic stub)'));
  }

  return run.then(out => {
    // Validation runs HERE, not only inside a provider. A provider validates its own
    // output because it must be falsifiable standalone; the CLIENT validates what
    // ARRIVED because between the two sits a socket, a JSON round trip and a process
    // boundary — and "the other end promised" is not a check.
    const problems = validateAnswers(req.questions, out.answers);
    if (problems.length) {
      throw typed('EDECISIONVALIDATION', 'validation failed: ' + problems.join(' | '),
        { validationProblems: problems });
    }
    out.clientMs = Date.now() - t0;
    return out;
  });
}

// ---- the ONE seam to the spec-catalog layer --------------------------------
//
// `specCatalog.autofixSelector: "judgment"` means the catalog validator's
// `autoFix(spec, { selector })` is handed a selector supplied by the owner of the
// `judgment` block — this function. It is deliberately TINY, because the boundary is the
// point: **the catalog layer ENUMERATES the candidates and refuses anything outside them;
// this selector only says WHICH of them.** It cannot mint a name (a returned
// non-candidate is refused on the other side), it never sees a name with zero candidates
// (nothing to fix it to, so it is never consulted), and returning `null` leaves the
// ambiguity refusal exactly as it was.
//
// SYNCHRONOUS, because the validator is straight-line CLI code that cannot await — so
// the request goes through this file's own CLI mode via spawnSync, the same shape the
// gate uses.
//
// TWO THINGS IT DOES NOT DO, both on purpose:
//   · with exactly ONE candidate it returns that candidate WITHOUT asking. A unique
//     resolution is lossless and deterministic; spending a model call on it would make a
//     certain answer probabilistic.
//   · on ANY failure — no provider, a timeout, an invalid answer — it returns `null`.
//     Null is the conservative direction HERE (the refusal stands), which is the opposite
//     of the gate's fail-closed exit(2) and is correct for the same reason: in both
//     places the safe answer is "do not let this through unexamined".
function catalogSelector(opts) {
  opts = opts || {};
  const provider = opts.provider || {};
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  return function select(name, candidates) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const req = JSON.stringify({
      state: (opts.state ? String(opts.state) + '\n' : '') +
        'A specification names "' + name + '", which is not in the catalog.',
      questions: {
        pick: {
          type: 'choice',
          instructions: opts.instructions ||
            ('Which of these existing catalog entries is the one "' + name + '" was meant to name?'),
          criteria: candidates.slice()
        }
      },
      provider: provider,
      timeoutMs: timeoutMs
    });
    const r = require('child_process').spawnSync(process.execPath, [__filename], {
      input: req, encoding: 'utf8'
    });
    let out = null;
    try { out = JSON.parse(String(r.stdout || '').trim().split('\n').pop() || ''); } catch (e) { out = null; }
    if (!out || out.ok !== true) return null;
    const a = (out.answers || {}).pick || {};
    // The argmax is computed HERE, in code, and checked against the enumerated list —
    // never trusting the returned `choice` string on its own.
    const picked = argmaxOf(a.probabilities) || a.choice;
    return candidates.indexOf(picked) === -1 ? null : picked;
  };
}

// ---- provider resolution from a project's config ----------------------------
//
// ONE HOME for "which provider does this project ask, and what is it allowed to do".
// Both the gate and the optional monitor resolve it; a second copy would drift, and the
// thing it decides — whether a band may arm — is the last value in this package that
// should have two answers.
//
// Config first, ENVIRONMENT second: the override exists so a red-fixture can point at the
// deterministic stub without editing the project's config, which is the only way a
// selftest can be both honest and side-effect free.
function resolveFromConfig(cfg) {
  const j = (cfg && cfg.judgment) || {};
  const p = j.provider || {};
  const kind = String(process.env.A8_DECISION_PROVIDER || p.kind || '').trim().toLowerCase();
  if (!kind) return { engaged: false, why: 'no judgment.provider.kind configured and no A8_DECISION_PROVIDER' };
  if (kind !== 'systemone' && kind !== 'fixture') {
    return { engaged: false, why: 'provider kind "' + kind + '" is not one this client speaks (systemone | fixture)' };
  }
  return {
    engaged: true,
    why: (process.env.A8_DECISION_PROVIDER ? 'A8_DECISION_PROVIDER=' : 'judgment.provider.kind=') + kind,
    provider: {
      kind: kind,
      baseUrl: process.env.A8_DECISION_BASE_URL || p.baseUrl || 'http://127.0.0.1:8497',
      modelId: process.env.A8_DECISION_MODEL || p.modelId || '',
      fixturePath: process.env.A8_DECISION_FIXTURE || p.fixturePath || '',
      // The CLASS gates what the provider may DO. Undeclared is not TRAINED, so an
      // undeclared provider can never arm a refusal — the safe direction, and the honest
      // one for a value nobody measured.
      providerClass: (process.env.A8_DECISION_CLASS || p.providerClass || '').toUpperCase()
    }
  };
}

module.exports = {
  evaluate,
  resolveFromConfig,
  catalogSelector,
  validateAnswers,
  argmaxOf,
  levelOf,
  candidateKeys,
  choiceKeys,
  confidenceFromProbs,
  parseLoopbackBase,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  DEFAULT_TIMEOUT_MS
};

// ---- CLI --------------------------------------------------------------------

if (require.main === module) {
  let input = '';
  try { input = fs.readFileSync(0, 'utf8'); } catch (e) { input = ''; }
  let req = null;
  try { req = JSON.parse(input); } catch (e) { req = null; }
  if (!req || !req.questions) {
    process.stdout.write(JSON.stringify({
      ok: false, code: 'EDECISIONPAYLOAD',
      error: 'stdin is not a { state, questions, provider, timeoutMs } request'
    }) + '\n');
    process.exit(1);
  }
  evaluate({ state: req.state, questions: req.questions },
    { provider: req.provider, timeoutMs: req.timeoutMs })
    .then(out => {
      process.stdout.write(JSON.stringify(Object.assign({ ok: true }, out)) + '\n');
      process.exit(0);
    })
    .catch(err => {
      process.stdout.write(JSON.stringify({
        ok: false,
        code: err.code || 'EDECISIONUNKNOWN',
        error: String(err.message || err),
        validationProblems: err.validationProblems || null
      }) + '\n');
      process.exit(1);
    });
}
