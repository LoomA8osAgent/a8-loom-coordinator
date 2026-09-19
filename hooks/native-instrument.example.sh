#!/usr/bin/env bash
# A8 Loom Coordinator — MIT License. (c) 2026 contributors.
#
# native-instrument.example.sh — HOW A DESKTOP INSTRUMENT DRIVES A BUILT APP AND
# WRITES THE ONE RECEIPT SHAPE.
#
# ⚠ THIS FILE IS DOCUMENTATION THAT HAPPENS TO BE EXECUTABLE. Nothing in this package
#   runs it, nothing installs it, and `hooks/install-hooks.sh` does not deploy it as a
#   hook. It exists because the hard parts of a native instrument are COMMANDS, and a
#   command written as prose is a command nobody can copy correctly. Read it, take the
#   shapes, write your project's own driver.
#
# WHAT IT IS FOR. A browser instrument can drive the app you serve; it can never drive
# the artefact a user double-clicks. That one surface — the shipped bundle running in
# its own window — is what a native instrument adds, and it adds NOTHING else. The
# browser suite keeps its whole job: it is faster, it reaches the document, and it is
# where regressions are caught. Say that plainly rather than letting a second instrument
# quietly imply a second suite.
#
# ONE FLOW, four phases, in order:
#     launch  →  window  →  screenshot  →  non-black luma probe  →  the receipt
# A flow whose steps outnumber the phases is REFUSED BY NAME. You grow a phase here;
# you never grow a sibling runner, because the receipt reader knows exactly one shape
# and two runners means two notions of "a flow was watched".
#
# ═══════════════════════════════════════════════════════════════════════════════
#  BEFORE YOU INSTALL AN OS-AUTOMATION CLI — the install audit, in three parts
# ═══════════════════════════════════════════════════════════════════════════════
#
#  The example tool here is **cua Driver** (MIT, trycua/cua), named ONCE. Any OS-level
#  automation CLI that can launch an app, enumerate its windows and write a lossless
#  per-window PNG substitutes without changing a line of the logic below. What does NOT
#  substitute is the audit — an automation tool runs on the operator's machine with
#  input-synthesis and screen-capture rights, which is the most privileged thing in the
#  verification stack.
#
#  1. CHECKSUM **AND** SIGNATURE, because they are different claims.
#     The upstream installer for the tool audited here performs ZERO checksum
#     verification — the release publishes a checksums file and the installer never
#     reads it. It does verify the macOS code signature, which is Apple-signature
#     VALIDITY and not release PINNING: a signed artefact is not necessarily the
#     artefact you meant. So install BY HAND from a pinned release:
#
#       curl -fLO https://<host>/<owner>/<repo>/releases/download/<pinned-tag>/<artefact>
#       curl -fLO https://<host>/<owner>/<repo>/releases/download/<pinned-tag>/checksums.txt
#       shasum -a 256 -c checksums.txt --ignore-missing
#       codesign --verify --deep --strict <extracted>.app
#
#     ⚠ The checksums file is served by the SAME host as the artefact, so it detects
#       corruption and a partial download — not a compromised host. Pin the tag, and
#       record the digest you accepted where your project records dependencies.
#
#  2. TELEMETRY OFF, BEFORE FIRST RUN, AND VERIFIED.
#     The tool audited here phones home BY DEFAULT — an analytics capture endpoint with
#     a hardcoded write key, enabled-by-default precedence, PLUS a second independent
#     outbound channel (an update check). Two channels, so one kill is not a kill.
#     Export both before the first invocation and READ THE STATUS BACK rather than
#     assuming the export took:
#
#       export <TOOL>_TELEMETRY_ENABLED=false
#       export <TOOL>_UPDATE_CHECK=false
#       <tool> telemetry status        # verify; do not assume
#
#     It also writes a persistent pseudonymous id under a dotfile directory that
#     survives an ordinary uninstall (its own `telemetry reset-id` / `uninstall --purge`
#     is what erases it). Nothing from this family is bundled, vendored, or compiled
#     into your product; the instrument lives beside the app, never inside it.
#
#  3. BACKGROUND DELIVERY IS A CAPABILITY, NOT A GUARANTEE.
#     Chrome-only surfaces (menus, settings rows, sidebars) can usually be driven in the
#     BACKGROUND, costing the operator nothing. A GPU canvas typically cannot: it accepts
#     only a lower-level event route, and the window must be FOREGROUNDED to receive it —
#     which TAKES THE OPERATOR'S POINTER. So a canvas flow is announced, scheduled and
#     short, and the driver logs the moment it fronts a window. Never make a machine
#     silently steal the pointer.
#
#  THE SYNTHETIC-INPUT BAN APPLIES HERE IDENTICALLY (ENFORCEMENT.md §Gate the
#  instrument). Driving a desktop app does not soften it: input is synthesised through
#  the automation framework's OS-level path, never by asking the application to act on
#  itself. Read-only probes — geometry, window state, a screenshot — stay allowed,
#  because they measure and do not pretend to click.

set -euo pipefail

APP="${NATIVE_APP:-dist/MyApp.app}"                 # the built bundle under test
TOOL="${NATIVE_TOOL:-automation-cli}"          # the OS-automation CLI on $PATH
FLOW="${1:-native.launch-nonblack}"            # ONE flow id, from your own flow library
FRAMES="${NATIVE_FRAMES:-4}"
OUT="${NATIVE_RECEIPT_DIR:-verification/receipts}"

export "${TOOL_TELEMETRY_VAR:-AUTOMATION_TELEMETRY_ENABLED}"=false
export "${TOOL_UPDATE_VAR:-AUTOMATION_UPDATE_CHECK}"=false

# ── phase 0 — LAUNCH ──────────────────────────────────────────────────────────
# One launch per flow: nothing may be inherited from a previous run's window. Kill any
# pre-existing instance BY THE PATH YOU ARE TESTING (never a name pattern — pattern-kill
# is how one lane once killed the operator's server and four sibling clones).
#
#   pgrep -f "$APP/Contents/MacOS/" | xargs -r kill
#   "$TOOL" call launch_app '{"bundle_id":"<id>","session":"<label>"}'      # -> { pid }
#
# ASSERT THE ARTEFACT IS THE ARTEFACT. Two independent reads, both measured as real
# traps: the OS launcher resolves a bundle id through its own database and may open a
# DIFFERENT copy on disk (a stale build in another directory), so check the running
# pid's executable path against "$APP"; and check the bundle's own version string
# against the version your source tree declares, because "fixed it and it still does the
# old thing" is almost always a stale install.
#
# Start the automation SESSION as phase zero, not as ceremony: a session label whose
# lifecycle has ended refuses every ordinary action afterwards, and no ordinary action
# revives it. Starting it is idempotent and revives — so a run after an idle gap works
# instead of reporting red on the instrument.

# ── phase 1 — THE MAIN WINDOW ─────────────────────────────────────────────────
#   "$TOOL" call list_windows '{"pid":N}'
#
# "A top-layer window with non-zero bounds" is NOT a sufficient predicate — measured, an
# app owns several off-screen top-layer strips and (if it has one) a hidden render
# window, and the loose predicate matches the wrong one. Require: top layer AND
# on-screen AND on the current desktop/space AND largest area. Poll with a timeout; a
# window that never appears is a named failure, never a wait that quietly expires.
#
# Then bring it to the front IF the flow touches a GPU surface, and LOG that you did.

# ── phase 2 — SCREENSHOT ──────────────────────────────────────────────────────
#   "$TOOL" call get_window_state \
#     '{"pid":N,"window_id":W,"include_accessibility_tree":false,"screenshot_out_file":"/abs/f00.png"}'
#
# Take the LOSSLESS PER-WINDOW PNG path. A convenience "zoom"/thumbnail route is often a
# JPEG capped at a few hundred pixels, and on a dark theme that alone pushes a healthy
# frame under the darkness threshold — the probe then reports black for a picture that
# is fine. Hash every frame (sha256) into the receipt: frames stay untracked, the
# receipt is tracked, and the hash is what makes tampering with the evidence detectable.

# ── phase 3 — THE NON-BLACK LUMA PROBE ────────────────────────────────────────
# Decode the PNG, downsample to a small fixed raster, and compute the fraction of pixels
# below a darkness threshold. Above the fraction ⇒ an auto-RED `<flow>:black-frame`.
# THREE RULES, each of them a bug someone already shipped:
#   · ONE probe, shared by every instrument. A native frame is a PNG buffer and so is a
#     browser frame; the moment a second instrument appears you FACTOR the verdict, you
#     do not copy it. Two copies of "what counts as black" drift on their first edit.
#   · A FLOW THAT CAPTURED NOTHING IS NOT CLEAN. A run that dies before the capture
#     phase must emit an auto-RED (`no-frame`), never a receipt reading "0 frames …
#     clean" — that is absence scoring as correctness, exactly.
#   · A VERDICT YOU CANNOT MEASURE IS RECORDED NULL, NEVER "clean". Main-thread hang and
#     console-error verdicts need in-application instrumentation a screenshot route does
#     not have. Write `null` and say so; writing "clean" claims a measurement nobody made.
#
# FALSIFY IT BEFORE THE LEG COUNTS: feed an all-black PNG through the SAME functions the
# driver calls and watch the probe go RED. A probe nobody has watched fail is a
# decoration. And measure it with the driver's OWN decode arguments — the same frame
# measured ~2% differently under a default decoder and a hardware-accelerated one; far
# inside the margin, but a falsification harness that decodes differently is measuring a
# different thing.

# ── phase 4 — THE RECEIPT ─────────────────────────────────────────────────────
# ONE shape, whatever the instrument. Written by the DRIVER, never by an agent's prose.
#
#   {
#     "instrument": "native",                     // MUST match a verification.instruments[].id
#     "timestamp":  "<ISO-8601>",
#     "treeHash":   "<your build-surface hash>",  // what your commit gate binds against
#     "launch":     { "app": "<path>", "pid": 0, "version": "<bundle version>" },
#     "flows":      [ { "id": "<flow id>", "ok": true,
#                       "frames": [ { "file": "…/f00.png", "sha256": "…",
#                                     "darkFrac": 0.94, "avgLuma": 2.2 } ],
#                       "verdicts": { "hang": null, "console": null } } ],
#     "autoReds":   []                            // [] when there are none — never absent
#   }
#
# Then have the reader accept it:
#
#   node hooks/verification-first.js --receipt "$OUT/<hash>.json"
#
# exit 0 = this instrument is declared and enabled, so the receipt may vouch;
# exit 2 = refused, with the reason (undeclared instrument · disabled · no instrument
# field · no findings array · unparseable). Declare the instrument in
# stack.config.json → verification.instruments[] BEFORE its first run, or its receipts
# are worth nothing — which is the point: an instrument is declared, never assumed.

echo "This file is documentation. Read it, copy the shapes, write your driver."
echo "Nothing was launched. app=$APP tool=$TOOL flow=$FLOW frames=$FRAMES receipts=$OUT"
