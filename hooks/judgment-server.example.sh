#!/usr/bin/env bash
# A8 Loom Coordinator — MIT License. (c) 2026 contributors.
#
# judgment-server.example.sh — HOW TO RUN A RESIDENT LOOPBACK DECISION PROVIDER.
#
# ⚠ THIS FILE IS DOCUMENTATION THAT HAPPENS TO BE EXECUTABLE. Nothing in this package
#   runs it, nothing installs it, and `hooks/install-hooks.sh` does not deploy it as a
#   hook. It is here because the judgment layer's hardest operational facts are commands,
#   and a command written as prose in a README is a command nobody can copy correctly.
#   READ IT BEFORE YOU RUN IT — two lines below are supply-chain and exposure hazards if
#   you copy them from anywhere else.
#
# WHY RESIDENT, and it is a measurement rather than a preference (Apple M4, 16 GB,
# 2026-09-19):
#   · A PreToolUse hook is a SHORT-LIVED process. A judge loaded per fire pays its whole
#     cold start before it answers anything.
#   · In-process ONNX: cold session create ~551 ms, then ~200 ms per question warm. So
#     one question from a cold hook is ~750 ms — paid on EVERY tool call.
#   · A reference PyTorch runtime behind an HTTP server: ~25 s cold ONCE, then ~115 ms per
#     question INCLUDING the loopback round trip.
#   A 750 ms stall on every edit is how a gate gets switched off, and a switched-off gate
#   is how a real hole ships. The load is paid once, by a resident process; the hook is a
#   CLIENT of it and never an owner of the model.
#
# THE CONTRACT the server must satisfy is just the wire:
#     POST /v1/systemone   { model, state, questions }  ->  { answers, model, usage }
#   Several independent projects already speak exactly that route, which is why this
#   package pins the WIRE and not a vendor. Anything answering it on loopback works.
#
# ═══════════════════════════════════════════════════════════════════════════════
#  TWO HAZARDS. Read these before the commands, not after.
# ═══════════════════════════════════════════════════════════════════════════════
#
#  1. NAME COLLISIONS ON PUBLIC PACKAGE INDEXES ARE REAL, AND ONE BIT US.
#     A runtime whose README says `pip install <name>` may not own `<name>` on PyPI. In
#     the case measured here the published package under that name was an unrelated
#     2.5 KB stub by a different author, and following the README verbatim installs it.
#     INSTALL FROM THE PROJECT'S OWN GIT REMOTE, pinned, and verify the repo you got.
#     Any instruction that quotes a README's install line without checking the index is
#     quoting a supply-chain hazard.
#
#  2. DECISION SERVERS TEND TO DEFAULT TO 0.0.0.0.
#     That is a LAN-exposed judge with no authentication. `--host 127.0.0.1` is MANDATORY
#     and is passed EXPLICITLY on every launch below. A bind argument is a promise; if you
#     write your own server, also re-check every request's peer address, because a peer
#     check is a fact. `hooks/lib/decision-provider.js` refuses a non-loopback base URL
#     outright — it will not send a brief, a diff or a commit message off-device.
#
# ═══════════════════════════════════════════════════════════════════════════════
#  TELEMETRY MUSTs — measured in BOTH directions, not assumed
# ═══════════════════════════════════════════════════════════════════════════════
#
#  · ONNX Runtime's npm package was clean at install on darwin/arm64, but the NATIVE
#    DYLIB embeds a vendor telemetry client. Measured: a plain session create WRITES a
#    persistent 36-byte device-id UUID plus an event database under the user's
#    Application Support directory; with `ORT_DISABLE_TELEMETRY=1` that directory is
#    never created at all. Nothing was observed leaving the machine — a persistent device
#    identifier written to disk unasked is already the violation.
#    THE ADDON READS THE VARIABLE AT DYLIB INIT, so exporting it BEFORE the module loads
#    is load-bearing, not decorative.
#  · Model-hub clients phone home on load unless told not to. Point the runtime at a
#    LOCAL weights directory and set the hub's offline + no-telemetry flags; then no
#    network code executes at all.
#  · Verify rather than believe: with the server warm, `lsof -nP -a -p <pid> -i` should
#    show EXACTLY ONE line — your own loopback listener. That check was run across a full
#    session (cold load plus 270 timed requests) and showed exactly that.

set -euo pipefail

PORT="${A8_DECISION_PORT:-8497}"
HOST=127.0.0.1                      # NEVER parameterise this. See hazard 2.

export ORT_DISABLE_TELEMETRY=1      # before anything loads a native inference addon
export HF_HUB_OFFLINE=1             # if your runtime uses a model hub client
export HF_HUB_DISABLE_TELEMETRY=1

# ── 1. A reference PyTorch runtime served over the wire ───────────────────────
# Install FROM GIT (hazard 1), into a project-local virtualenv, and download the weights
# to a local directory so the hub is bypassed by path:
#
#   python3 -m venv .judgment/venv
#   .judgment/venv/bin/pip install "<project>[all] @ git+https://<host>/<owner>/<repo>@<pinned-ref>"
#   # weights -> .judgment/models/<model>/   (curl each file from the model's own host)
#
# Then launch, loopback ONLY:
#
#   .judgment/venv/bin/<serve-cmd> --host 127.0.0.1 --port "$PORT" --device auto
#
# Measured on an Apple M4 / 16 GB / 2026-09-19: launch → /health in ~0.8 s, first request
# (weights + device transfer) ~24.6 s, total cold-to-first-answer ~25.4 s, then 115 ms per
# Noul / 122 ms per 3-level Score / 178 ms per 12-way Choice. Resident footprint ~3.3 GB
# on the GPU path — and note that `ps` RSS reported 238 MB, which is a lie: GPU/IOSurface
# memory is invisible to it. Use the platform's physical-footprint tool.

# ── 2. Your own in-process server ─────────────────────────────────────────────
# If you write one, the checklist is short and every item was learned the hard way:
#   · bind 127.0.0.1 explicitly AND re-check each request's peer address
#   · set ORT_DISABLE_TELEMETRY=1 (or your runtime's equivalent) BEFORE the require
#   · enforce a request-body ceiling on the way IN and refuse over it — never truncate,
#     because a truncated state is a DIFFERENT question, silently asked
#   · return the provider's OWN error text on a 4xx/5xx; "not ready" in place of a known
#     cause is the ERROR-REPORTED-AS-NOT-READY failure one layer down
#   · expose GET /health with `{ ok, model, warm, coldLoadMs, maxOptions }` so a session
#     can report which state it is in
#   · REPORT THE OPTION CEILING rather than crashing on a wide question: some published
#     exports freeze the option slot at 2, which makes every Score and every 3+-way Choice
#     unanswerable. A capability report is useful; a stack trace is not.
#   · exit when the session that started you is gone — a resident process with no parent
#     holding gigabytes is a leak someone finds at exactly the wrong moment

# ── 3. Point the gate at it ───────────────────────────────────────────────────
# In stack.config.json:
#   "judgment": { "enabled": true,
#                 "provider": { "kind": "systemone",
#                               "baseUrl": "http://127.0.0.1:8497",
#                               "modelId": "<the pinned checkpoint>",
#                               "providerClass": "" } }
#
# Leave `providerClass` empty until you have MEASURED calibration on your own labeled set
# (`governance/LOCAL-MODELS.md`). Undeclared is not TRAINED, and only TRAINED arms a
# refusal band — which is the safe direction and the honest one for a value nobody
# measured.

# ── 4. Prove it before you trust it ───────────────────────────────────────────
# The whole contract in one request — all three primitives at once:
#
#   curl -s -X POST "http://127.0.0.1:${PORT}/v1/systemone" \
#     -H 'Content-Type: application/json' -d '{
#     "model":"<pinned>",
#     "state":"The production database is locked and customer writes are failing.",
#     "questions":{
#       "urgent":{"type":"noul","instructions":"Is this urgent?"},
#       "dept":{"type":"choice","instructions":"Route it","criteria":{"infra":"Infrastructure","design":"Design","billing":"Billing"}},
#       "sev":{"type":"score","instructions":"How severe is this?","criteria":["Cosmetic","Workaround exists","Blocking"]}}}'
#
# Then check the answers against the validation contract by running the client directly:
#
#   echo '{"provider":{"kind":"systemone","baseUrl":"http://127.0.0.1:'"${PORT}"'"},
#          "questions":{"urgent":{"type":"noul","instructions":"Is this urgent?"}},
#          "state":"the database is down"}' | node hooks/lib/decision-provider.js
#
# A non-zero exit prints a TYPED code. That is the answer to take to a bug report — a
# refusal that says only "could not decide" is useless to everyone.

echo "This file is documentation. Read it, copy the lines you need, and launch by hand."
echo "Nothing was started. Gate config: judgment.provider.kind=systemone, baseUrl=http://${HOST}:${PORT}"
