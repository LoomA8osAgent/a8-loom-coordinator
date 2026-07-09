<!-- A8 Coordinator Stack — MIT License -->
<!--
  WHAT THIS IS: the operator contract — the founder standards the operator holds THEMSELF to,
  and which the agent has the right AND obligation to enforce. This is the human half of the
  governance: how a session opens, how corrections are read, when to wrap up. Generalized from
  a real 74-session operator↔agent co-evolution.

  WHEN IT LOADS: always-on (@-imported by CLAUDE.template.md).

  HOW TO FILL: replace {{operator.name}} + other tokens. This is a LIVING document — widen it
  as sessions surface patterns; every change is committed with a note on which session
  surfaced it. Rules that still apply are preserved across edits.
-->

# OPERATOR.md — {{operator.name}}'s standards (the agent enforces these)

Read after `CLAUDE.md`. These are the standards {{operator.name}} holds themself to. The
agent has the right and obligation to enforce them. Living document: widened as sessions
surface new patterns; updates preserve rules that still apply.

---

## Rules

### 1. Skill gate
Every session opener names at least one skill. No skill, no work — the agent refuses to
begin and asks which skill applies. If unsure, say "load coordinator" and the agent routes.
(WHY: context-free sessions waste both parties' time and produce ungrounded work.)

### 2. Bug reports
Verify the build/version before reporting. Every report includes: version, steps to
reproduce, expected vs actual, and a screenshot or console paste if applicable.

### 3. Session openers = three elements
(1) files or skill to load, (2) the task, (3) the mode. Example: "Load {{skill.build}}.
Implement the X layer. Build mode." If any element is missing, the agent asks for it before
any tool call.

### 4. Modes are gates, not blends
Declare the primary mode at open (build / spec-dictation / design-review / bug-fix-testing /
organization / handoff-packaging). To switch mid-session, say "switching to [mode]"
explicitly, and switch back explicitly. **Cross-cutting edits are NOT mode switches** —
editing a spec + a style file + the code + the entry file in one task is one build activity.
The mode is set by the primary deliverable's intent, not the count of files touched.

### 5. Phase gates
No Phase N+1 work begins until the Phase N gate checklist is complete. The coordinator
confirms. Checklists are created at phase ENTRY, not improvised at exit. Cross-cutting
ripples inside a phase are allowed and expected.

### 6. Naming freeze
The top-level project name and all internal names are frozen until release candidate. The
full rename executes once, at RC, with a dedicated spec. Do not change names before then.

### 7. Energy management / wrap-up
When running low, say "wrap up" — the agent packages everything, writes the handoff, ensures
zero work is lost. A clean stop at 80% beats a messy push to 95%. **Either side may call
wrap-up.** The agent calls it on exhaustion signals: testing the wrong version, a session
past its budget with no deliverable, output-per-turn dropping, three-plus unexpected
blockers, or decisions that should wait for rest. The operator calls it any time. The agent
respects the call and shifts immediately into handoff packaging.

### 8. Invoke skills (proactive scan)
Every opener names the primary skill; skills only work when invoked. The agent proactively
scans the skill descriptions against the task, announces the applicable set (primary +
secondary), and waits for the operator's confirm before loading. The operator does not carry
skill-discovery burden — the agent runs the scan and surfaces the list.

### 9. Fresh-session context
Every session is a fresh instance. Point to the repo, or at minimum name which specs to read.
"Continue where we left off" is not a valid opener — a fresh session has zero context beyond
what is committed and written down.

### 10. One primary focus per session
One focus (e.g. "land the X layer", "wire the router"). Cross-cutting ripples across many
files are expected and in-focus IF declared in a drift report before editing. Adding a NEW
tangential module mid-session is a scope change, not a ripple: fold it into the next-session
handoff, or finish the current focus first then open the new one explicitly. Don't let one
task quietly become another.

### 11. Corrections carry signal
Corrections include direction + magnitude, or an explicit target. Pure vent is OK as a first
beat ("WTF is this") but a vent without signal gets a clarifying question from the agent
("what target?" / "which element?" / "how much?") before any action. **Visual corrections
have a two-iteration limit** before the agent requests explicit measured targets. Emotional
reaction alone is a flag that a correction is coming — not the instruction itself.

### 12. Scope expansion is explicit
Mid-session expansions ("also add X") are declared, not silent. The agent responds "scope
change — [list of new files/tasks]. Confirm?" and waits. The operator can still say yes to
every expansion — the signal is what changes, not the decision. (WHY: silent expansion
compresses end-state cleanup and hides the accumulating cost.)

### 13. Canonical before derivation
When a canonical reference exists (a locked decision, a prior spec section, a reference
implementation), use it verbatim. Do not re-derive what is already solved. If the agent
catches itself re-deriving, it stops and locates the canonical source first. If the canonical
source disagrees with a spec, flag the conflict — never silently reconcile with a third
interpretation.

### 14. The workspace is the live app
The build target is the real running application. Reference / prototype files are INPUTS to
that target, not parallel outputs. Integration means copying canonical patterns verbatim into
the live app. Never build a standalone prototype as a substitute for real integration.

### 15. Specs reconcile, never just accrete
A session that touches a module verifies the module's spec still describes what the code does,
and fixes drift in the same session (`SPEC-DRIFT-APPEND-NOT-RECONCILE`). The reverse holds: a
user-touchable feature ships WITH its spec section, user-doc, and acceptance test in the same
commit (`LIVE-FEATURE-UNDOCUMENTED`). Appending a harvest to the bottom of a spec while stale
claims stand above it is the failure.

---

## The agent's enforcement rights and obligations

The agent will:
- Refuse to start work without a skill reference (rule 1).
- Ask for version confirmation on bug reports (rule 2).
- Ask for missing opener elements — skill, task, or mode (rule 3).
- Request explicit mode switches on actual mode drift, not cross-cutting ripples (rule 4).
- Block Phase N+1 work when the Phase N gate is incomplete (rule 5).
- Call for wrap-up on exhaustion signals (rule 7).
- Request read-order / context when a session opens context-free (rule 9).
- Flag scope expansions as "scope change — confirm?" and wait (rule 12).
- Ask for measured targets or element specifics on vent-corrections (rule 11).
- Run proactive audits (grep for stale tokens, cross-reference + parallel-path checks) after
  spec/code edits WITHOUT being asked — never ship a change claimed complete without the grep
  audit shown.
- Push back with "specs first" / "canonical first" on premature-build or re-derivation (rule 13).
- Redirect standalone-prototype attempts back into the live app (rule 14).

---

## Changelog
> Append dated entries as rules are added/widened; note which session surfaced each change.
- **{{date}}** — Initial contract adopted from the A8 Coordinator Stack.
