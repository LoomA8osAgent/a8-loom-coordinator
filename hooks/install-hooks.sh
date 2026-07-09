#!/usr/bin/env bash
# A8 Coordinator Stack — MIT License. (c) 2026 contributors.
#
# install-hooks.sh — deploy the gate stack from this package into the machine's
# Claude hooks dir, and merge the settings wiring FROM stack.config.json.
#
#   bash hooks/install-hooks.sh [--config <path>]   # install
#   bash hooks/install-hooks.sh --verify            # diff installed vs package
#
# WHY zero hardcoded paths: the hooks resolve stack.config.json at RUNTIME by
# walking up from the edited file, so the SAME installed binary governs any
# number of repos. This script only needs to know (a) where to copy the hooks
# (install.hooksDir) and (b) which project settings file to wire
# (install.settingsTarget) — both read from the config, not baked in.
#
# Idempotent. Backs up what it overwrites and PRUNES old backups to
# install.maxBackups (cures the ~130-.bak accumulation the Anim8 deploy grew).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"       # .../hooks
PKG_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERIFY=0
CONFIG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --verify) VERIFY=1 ;;
    --config) shift; CONFIG="$1" ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
  shift
done

# Locate the config: --config arg | package root | cwd walk-up.
if [ -z "$CONFIG" ]; then
  if [ -f "$PKG_ROOT/stack.config.json" ]; then CONFIG="$PKG_ROOT/stack.config.json";
  else
    d="$PWD"
    while [ "$d" != "/" ]; do [ -f "$d/stack.config.json" ] && { CONFIG="$d/stack.config.json"; break; }; d="$(dirname "$d")"; done
  fi
fi
[ -n "$CONFIG" ] && [ -f "$CONFIG" ] || { echo "ERROR: no stack.config.json found (pass --config <path>)."; exit 2; }

NODE="$(command -v node)"
read -r HOOKS_DIR SETTINGS_REL MAX_BACKUPS REPO_ROOT <<EOF
$("$NODE" -e "
const c=require('$SCRIPT_DIR/lib/config.js').load('$CONFIG');
const exp=p=>p&&p.indexOf('~/')===0?require('os').homedir()+p.slice(1):p;
process.stdout.write([exp(c.install.hooksDir), c.install.settingsTarget, String(c.install.maxBackups||2), c.__repoRoot].join(' '));
")
EOF

SETTINGS_TARGET="$REPO_ROOT/$SETTINGS_REL"
echo "A8 Coordinator Stack — gate install"
echo "  config:   $CONFIG"
echo "  repo:     $REPO_ROOT"
echo "  hooks  →  $HOOKS_DIR"
echo "  settings: $SETTINGS_TARGET"
echo ""

# Files to deploy: every hook script + shared lib + caveman subdir.
copy_list() {
  find "$SCRIPT_DIR" -maxdepth 1 -type f \( -name '*.js' -o -name '*.sh' \) ! -name 'install-hooks.sh'
  find "$SCRIPT_DIR/lib" -type f -name '*.js' 2>/dev/null || true
  find "$SCRIPT_DIR/caveman" -type f \( -name '*.js' -o -name '*.sh' \) 2>/dev/null || true
}

if [ "$VERIFY" = 1 ]; then
  rc=0
  while IFS= read -r f; do
    rel="${f#$SCRIPT_DIR/}"
    inst="$HOOKS_DIR/$rel"
    [ -f "$inst" ] || { echo "MISSING: $rel"; rc=1; continue; }
    diff -q "$f" "$inst" >/dev/null 2>&1 || { echo "DRIFT:   $rel"; rc=1; }
  done < <(copy_list)
  [ "$rc" = 0 ] && echo "OK — installed gates match package." || echo "↑ drift; run without --verify to reinstall."
  exit $rc
fi

ts="$(date +%Y%m%d-%H%M%S)"
prune_backups() {  # keep at most $MAX_BACKUPS .bak-* for a given installed file
  local base="$1"
  local n
  n="$(ls -1t "$base".bak-* 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) || true)"
  [ -n "$n" ] && echo "$n" | xargs -r rm -f
}

while IFS= read -r f; do
  rel="${f#$SCRIPT_DIR/}"
  inst="$HOOKS_DIR/$rel"
  mkdir -p "$(dirname "$inst")"
  if [ -f "$inst" ] && ! diff -q "$f" "$inst" >/dev/null 2>&1; then
    cp "$inst" "$inst.bak-$ts"
    prune_backups "$inst"
  fi
  cp "$f" "$inst"
  chmod +x "$inst" 2>/dev/null || true
  echo "installed $rel"
done < <(copy_list)

# Wire the project settings from the template (substitute the hooks dir).
mkdir -p "$(dirname "$SETTINGS_TARGET")"
tmp_settings="$(mktemp)"
sed "s#__HOOKS_DIR__#$HOOKS_DIR#g" "$SCRIPT_DIR/settings.template.json" > "$tmp_settings"
if [ ! -f "$SETTINGS_TARGET" ]; then
  mv "$tmp_settings" "$SETTINGS_TARGET"
  echo "wrote $SETTINGS_TARGET (was absent)"
else
  if diff -q "$tmp_settings" "$SETTINGS_TARGET" >/dev/null 2>&1; then
    rm -f "$tmp_settings"; echo "settings already current."
  else
    cp "$SETTINGS_TARGET" "$SETTINGS_TARGET.bak-$ts"; prune_backups "$SETTINGS_TARGET"
    echo "NOTE: $SETTINGS_TARGET exists + differs (backed up). It was NOT overwritten —"
    echo "      merge the hooks blocks from this generated template by hand:"
    echo "      $tmp_settings"
  fi
fi

echo ""
echo "Done. Restart the Claude session so the hooks reload."
echo "Verify the gates fire:  tail -f \$(node -e \"const c=require('$SCRIPT_DIR/lib/config.js').load('$CONFIG');process.stdout.write(c.install.gateLog.replace('~',require('os').homedir()))\")"
