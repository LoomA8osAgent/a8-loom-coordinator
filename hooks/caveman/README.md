<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# caveman — terse output mode

A token-saver in **both** directions: it makes the model answer like a smart
caveman — drop articles, filler, and pleasantries; keep every bit of technical
substance. Fewer tokens per turn = cheaper + faster, no signal lost. Independent
of the governance gates (it lives in the **global** `~/.claude/settings.json`,
not a project's — it is a personal output preference, not project governance).

## Files
| file | role |
|---|---|
| `caveman-config.js` | mode resolver + symlink-safe flag read/write (the shared lib) |
| `caveman-activate.js` | SessionStart — writes the flag, emits the ruleset for the active level |
| `caveman-mode-tracker.js` | UserPromptSubmit — tracks `/caveman …` + NL toggles, re-injects a per-turn reminder |
| `caveman-statusline.sh` | statusline badge `[CAVEMAN]` / `[CAVEMAN:ULTRA]` |

## Levels + carve-outs
- `lite` — trim filler + pleasantries, keep grammar.
- `full` — drop articles/filler/hedging, fragments OK. **(default)**
- `ultra` — maximal compression, telegraphic.
- `off` — disabled.

**Auto-clarity carve-outs** (substance over brevity — caveman drops out for):
security warnings, irreversible-action confirmations, multi-step sequences where
fragment order risks misread, and any time the user asks to clarify or repeats a
question. Code / commits / PRs are always written normally.

**Persistence** — active every response, survives many turns + context
compression (the SessionStart ruleset + the per-turn tracker reminder both
anchor it). Toggle with `/caveman lite|full|ultra`, natural language ("talk like
caveman"), or `stop caveman` / `normal mode`.

## Wiring (global settings.json)
```jsonc
{
  "hooks": {
    "SessionStart": [{ "hooks": [
      { "type": "command", "command": "node \"$HOME/.claude/hooks/caveman/caveman-activate.js\"", "timeout": 5 }
    ]}],
    "UserPromptSubmit": [{ "hooks": [
      { "type": "command", "command": "node \"$HOME/.claude/hooks/caveman/caveman-mode-tracker.js\"", "timeout": 5 }
    ]}]
  },
  "statusLine": { "type": "command", "command": "bash \"$HOME/.claude/hooks/caveman/caveman-statusline.sh\"" }
}
```

Default level: `CAVEMAN_DEFAULT_MODE=ultra` env var, or `defaultMode` in
`~/.config/caveman/config.json`.

## Security
Both flag read + write refuse symlinks (O_NOFOLLOW), cap the read at 64 bytes,
and whitelist-validate the mode — so a local attacker cannot point the
predictable flag path at a secret and have the statusline / context injection
leak its bytes.
