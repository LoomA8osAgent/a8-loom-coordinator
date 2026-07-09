<!-- A8 Coordinator Stack — MIT License -->

# Agents — the custom subagent registry

The three archetypes in this directory (`planner` · `builder` · `auditor`) are the custom,
governance-aware subagents the coordinator delegates to. Use ONLY these custom agents for
project work — a built-in general/Explore/Plan agent SKIPS the project governance (CLAUDE.md)
and therefore invents and duplicates. If a task is not covered by an extant custom agent, STOP
and ask the operator before spawning anything (or handle it inline if trivial).

## Why custom agents

A custom agent INHERITS the full governance hierarchy, PRELOADS the domain canon via its
`skills:` frontmatter, and fires the SAME PreToolUse gates (grep-required / canon-block /
consent) as the main agent. That is what makes delegated work unable to invent or duplicate —
the preloaded canon + the gates travel with the subagent.

## The three lanes

| Agent | Lane | Never |
|-------|------|-------|
| `planner` | Investigates + designs + authors specs/roadmap. Returns a grounded plan. | Does NOT write application code. Never git. |
| `builder` | Edits its ASSIGNED files; extends shared homes, never re-rolls per-module copies. | NEVER touches git — returns its diff + summary; the coordinator commits. |
| `auditor` | Sweeps for duplication/orphans/dead-code + audits deliverables. Findings untrusted until grep-confirmed. | Does NOT apply findings blind; never git. |

Clone `builder.template.md` per specialized lane if the project needs it (e.g. a UI/style
builder and a logic/engine builder) — vary the `skills:` preload and the lane note; the
shared-level fix rule and the no-git rule are invariant across clones.

## How the registry deploys

These files are the SOURCE OF TRUTH in the repo. A generator/deploy step copies them into the
agent runtime directory (the machine-local `.claude/agents/` or equivalent), materializing the
`{{...}}` tokens from `stack.config.json`. **A newly-added or edited agent is discovered at the
NEXT session start** — edit the source here, run the deploy step, restart the session, then the
agent is invocable. Never edit the deployed copy as the primary — it is regenerated and your
edit is lost.

## Worker mechanics (binding on every delegation)

1. **Disjoint file ownership** — each parallel worker owns a DISJOINT file set; two workers
   never touch the same file. Shared/governance files are written ONLY by the coordinator.
2. **Return = audit brief, not content** — a worker returns its verdict table, `file:line`
   evidence for risky claims, the greps it ran, and the files it wrote. Content stays on disk.
3. **Audit-gate EVERY worker before its work lands** — the coordinator runs the live-caller
   grep (code) or the citation + retired-token check (docs), reviews the diff, then commits per
   cluster (file-granular revert).
4. **Self-contained prompts** — exact paths, the handle/return-brief shape, and the grounding
   mandate (retrieve first; never present a partial list as complete).
5. **Stall handling** — a silent worker is restarted once with the same brief, then escalated
   one model tier. Independent workers spawn in ONE message so they run concurrently.
