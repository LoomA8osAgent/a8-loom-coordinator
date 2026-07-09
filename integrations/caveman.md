<!-- A8 Loom Coordinator — MIT License. (c) 2026 contributors. -->

# caveman — terse output mode

**Why: a token saver in BOTH directions.** caveman makes the model answer like a
smart caveman — drop articles, filler words, and pleasantries; keep every bit of
technical substance. Fewer output tokens per turn means cheaper + faster
responses, and it trains a tighter house style that costs less to read too. No
signal is lost — code, errors, and technical terms are preserved exactly.

The implementation ships in this package under `hooks/caveman/` (four files +
their own README). This doc is the "what + why + wiring" overview; see
`hooks/caveman/README.md` for the file-by-file reference.

## The terse-mode contract
- **Drop:** articles (a/an/the), filler (just/really/basically/actually/simply),
  pleasantries (sure/certainly/of course/happy to), hedging.
- **Keep:** all technical substance, exact technical terms, code blocks verbatim,
  error strings quoted exactly. Fragments are fine. Short synonyms preferred
  ("fix" not "implement a solution for").
- **Pattern:** `[thing] [action] [reason]. [next step].`

## Levels
| level | behavior |
|---|---|
| `lite` | trim filler + pleasantries, keep grammar |
| `full` | drop articles/filler/hedging, fragments OK (**default**) |
| `ultra` | maximal compression, telegraphic |
| `off` | disabled |

Set the default via `CAVEMAN_DEFAULT_MODE=ultra` or `defaultMode` in
`~/.config/caveman/config.json`. Toggle live with `/caveman lite|full|ultra`,
natural language ("talk like caveman"), or `stop caveman` / `normal mode`.

## Auto-clarity carve-outs (substance beats brevity)
caveman **drops out automatically** for cases where terseness risks harm or
misread, then resumes:
- security warnings,
- irreversible-action confirmations,
- multi-step sequences where fragment order could be misread,
- any time the user asks to clarify or repeats a question.

Code, commits, and PRs are **always** written normally.

## Persistence
Active every response and survives many turns + context compression — the
SessionStart hook injects the full ruleset for the active level, and the
UserPromptSubmit tracker re-injects a compact reminder each turn so competing
context doesn't wash it out. A statusline badge (`[CAVEMAN]` / `[CAVEMAN:ULTRA]`)
shows the live mode.

## Wiring
caveman is **personal/global** — wire it in your global `~/.claude/settings.json`
(not a project's `stack.config.json`; it is an output preference, not project
governance):

```jsonc
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/caveman/caveman-activate.js\"" }]}],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/caveman/caveman-mode-tracker.js\"" }]}]
  },
  "statusLine": { "type": "command", "command": "bash \"$HOME/.claude/hooks/caveman/caveman-statusline.sh\"" }
}
```

## Security
Flag read + write refuse symlinks (O_NOFOLLOW), cap the read at 64 bytes, and
whitelist-validate the mode — so a local attacker cannot redirect the predictable
flag path at a secret and leak its bytes through the statusline or context
injection.
