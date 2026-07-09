#!/bin/bash
# A8 Coordinator Stack — MIT License. (c) 2026 contributors.
#
# service-recovery.sh — Claude Code StopFailure handler.
#
# WHY: an overload / rate-limit / server-error ends a turn abruptly and a dead
# turn cannot restart itself. StopFailure is logging-only — it CANNOT block or
# re-run the turn. So this does the two things it can:
#   1. LOG + (optionally) NOTIFY loudly so a stalled unattended run is visible.
#   2. BEST-EFFORT AUTO-RESUME — ONLY when a real `claude` CLI is reachable AND
#      serviceRecovery.autoResume is enabled in stack.config.json. A detached
#      backoff loop retries the resume, immune to the dead turn. Disabled by
#      default (a headless resume can't drive a GUI turn + risks double-run).
#
# Config (stack.config.json → serviceRecovery): notifyEnabled, notifyCommand
# (with {msg}/{title} placeholders — macOS osascript default), logFile,
# autoResume. Resolved at runtime from the session cwd; no hardcoded paths.
#
# stdin: JSON { session_id, transcript_path, cwd, error_type?, message? }
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JQ="$(command -v jq || true)"
NODE="$(command -v node || true)"

payload="$(cat)"
get() {
  if [ -n "$JQ" ]; then printf '%s' "$payload" | "$JQ" -r "$1 // empty" 2>/dev/null; fi
}

sid="$(get '.session_id')"
err="$(get '.error_type')"; [ -z "$err" ] && err="$(get '.reason')"; [ -z "$err" ] && err="unknown"
msg="$(get '.message')"
cwd="$(get '.cwd')"; [ -z "$cwd" ] && cwd="$PWD"
proj="$(basename "$cwd")"
ts="$(date '+%Y-%m-%d %H:%M:%S')"

# Resolve config values (notifyEnabled, notifyCommand, logFile, autoResume).
CFG_NOTIFY=1; CFG_NOTIFY_CMD=""; CFG_LOG="$HOME/.claude/service-recovery.log"; CFG_RESUME=0
if [ -n "$NODE" ]; then
  vals="$("$NODE" -e "try{const c=require('$SCRIPT_DIR/lib/config.js').load(process.argv[1])||{};const s=c.serviceRecovery||{};const exp=p=>p&&p.indexOf('~/')===0?require('os').homedir()+p.slice(1):p;process.stdout.write([s.notifyEnabled?1:0,(s.notifyCommand||''),exp(s.logFile||'~/.claude/service-recovery.log'),s.autoResume?1:0].join('\x1f'))}catch(e){process.stdout.write('1\x1f\x1f'+require('os').homedir()+'/.claude/service-recovery.log\x1f0')}" "$cwd" 2>/dev/null)"
  if [ -n "$vals" ]; then
    IFS=$'\x1f' read -r CFG_NOTIFY CFG_NOTIFY_CMD CFG_LOG CFG_RESUME <<< "$vals"
  fi
fi
LOG="${CFG_LOG:-$HOME/.claude/service-recovery.log}"

# 1. LOG.
printf '%s\tStopFailure\terr=%s\tsession=%s\tproj=%s\tmsg=%s\n' \
  "$ts" "$err" "$sid" "$proj" "$msg" >> "$LOG" 2>/dev/null

# 1b. NOTIFY (if enabled + a command template is configured).
if [ "$CFG_NOTIFY" = "1" ] && [ -n "$CFG_NOTIFY_CMD" ]; then
  n_msg="Turn stalled ($err) in $proj — recovery armed."
  n_title="Claude — service stall"
  cmd="${CFG_NOTIFY_CMD//\{msg\}/$n_msg}"
  cmd="${cmd//\{title\}/$n_title}"
  bash -c "$cmd" >/dev/null 2>&1 || true
fi

# 2. AUTO-RESUME — opt-in only.
[ "$CFG_RESUME" = "1" ] || exit 0
[ -n "$sid" ] || { echo "$ts	auto-resume skipped: no session_id" >> "$LOG"; exit 0; }

# Resolve a host-runnable claude CLI (login shell first, GUI bundle fallback).
CLAUDE_BIN="$(zsh -lic 'command -v claude' 2>/dev/null | tail -1)"
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  CLAUDE_BIN="$(ls -td "$HOME/Library/Application Support/Claude/claude-code/"*/claude.app/Contents/MacOS/claude 2>/dev/null | head -1)"
fi
if [ -z "$CLAUDE_BIN" ] || [ ! -x "$CLAUDE_BIN" ]; then
  echo "$ts	auto-resume skipped: no host claude binary found" >> "$LOG"; exit 0
fi

# One babysitter per session.
LOCK="$HOME/.claude/.recover-${sid}.lock"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "$ts	auto-resume skipped: babysitter already running" >> "$LOG"; exit 0
fi

# Detached backoff-retry loop. Each attempt is a fresh process immune to the dead turn.
nohup bash -c '
  sid="'"$sid"'"; bin="'"$CLAUDE_BIN"'"; log="'"$LOG"'"; lock="'"$LOCK"'"; cwd="'"$cwd"'"
  echo $$ > "$lock"; trap "rm -f \"$lock\"" EXIT
  backoffs=(30 60 120 300 600 600 600 900 900 1800); i=0; max=24
  while [ "$i" -lt "$max" ]; do
    s=${backoffs[$i]:-1800}; sleep "$s"
    t="$(date "+%Y-%m-%d %H:%M:%S")"
    echo "$t	auto-resume attempt $((i+1))/$max (after ${s}s) session=$sid" >> "$log"
    cd "$cwd" 2>/dev/null
    out="$("$bin" -p "Service recovered after an overload/rate-limit stall. Resume the previous turn and continue exactly where you left off." --resume "$sid" 2>&1)"; rc=$?
    printf "%s\n" "$out" >> "$log"
    if [ "$rc" -eq 0 ]; then echo "$t	auto-resume SUCCEEDED session=$sid" >> "$log"; exit 0; fi
    if printf "%s" "$out" | grep -qiE "not logged in|please run /login|invalid api key|authentication_error|oauth"; then
      echo "$t	auto-resume ABORTED: CLI not authenticated session=$sid" >> "$log"; exit 0
    fi
    i=$((i+1))
  done
  echo "$(date "+%Y-%m-%d %H:%M:%S")	auto-resume GAVE UP after $max attempts session=$sid" >> "$log"
' >/dev/null 2>&1 &
disown 2>/dev/null

echo "$ts	auto-resume babysitter launched session=$sid bin=$CLAUDE_BIN" >> "$LOG"
exit 0
