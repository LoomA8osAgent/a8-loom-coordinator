<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the skill that governs creating, evaluating, and maintaining all other skill
  files. A skill is an agent ACTIVATION CONTRACT, not a spec summary. Nearly project-agnostic
  as shipped.

  WHEN IT LOADS: on "create a skill", "update the skill for X", "test if this skill triggers".

  HOW TO FILL: replace {{...}} (mainly the skills dir + registry references). The format,
  anatomy, and evaluation protocol are generic — keep them.
-->
---
name: skill-creator
description: >
  Use this skill when creating a new skill file, modifying an existing skill, testing a
  skill's trigger accuracy, or optimizing a skill's description for better agent matching.
  Triggers: "create a skill", "write a skill", "update the skill for", "skill for X module",
  "test if this skill triggers", "the coordinator should route to", or any request to
  formalize domain knowledge for agent reuse.

  Key rules every skill-creator agent follows:
  - Skills use YAML frontmatter with a `name` field and a `description` trigger field.
  - The description IS the trigger pattern — enumerate the specific keywords, module names,
    and task types that should activate the skill, written so an agent matches it from a
    terse opener ("load the X skill").
  - Every skill lists its reference files (what it reads before acting) and its key
    constraints (the domain-specific rules NOT already in CLAUDE.md).
  - Skills are NOT spec summaries. A spec says how something works; a skill tells an agent
    what to check, what to avoid, and where to look before starting.
  - Skills stay current — when a spec changes, the skill that references it updates the same
    session. A skill pointing at a nonexistent spec is worse than no skill.

  Reference files: {{skills.dir}} (existing skills as examples), CLAUDE.md, {{spec.fileManifest}}
---

# Skill-Creator

Governs the creation, evaluation, and maintenance of every skill in `{{skills.dir}}`.

## Skill file format

```markdown
---
name: {skill-name}
description: >
  {Multi-line trigger pattern. Enumerate every keyword, module name, task type, and phrase
  that should activate this skill — answer "when should an agent load this?"}

  Key facts every {domain} agent must know:
  - {constraint 1}
  - {constraint N}

  Reference files: {spec1}, {spec2}
---

# {Skill Name}

## Reference Files (in read order)
1. CLAUDE.md + FAILURE-PATTERNS.md — governance every skill inherits
2. ROUTING.md — keyword→spec map (big specs are Read/grep on demand)
3. {{registry.uiIndex}} — index of everything already built (for any building skill)
4. {primary spec} → {secondary specs}

## Key Constraints
{Domain-specific rules not in CLAUDE.md}

## Common Failure Patterns
{What goes wrong in this domain and how to prevent it — cite FAILURE-PATTERNS codes}
```

## When to create a new skill

Create one when: a new module has enough domain-specific constraints to warrant its own
activation pattern; a recurring task type consistently needs the same reference files +
constraints; or a coordinator routing entry references more than ~3 specs.

Do NOT create one when: an existing skill covers it with minor additions (extend it); the task
is a one-off with no recurring pattern; or the constraints are already in CLAUDE.md.

## Skill evaluation

To test trigger accuracy: present the description to a fresh agent session alongside a task and
check if the agent selects this skill. Test with exact trigger phrases, paraphrased triggers,
and edge cases that should NOT trigger it. Benchmark with 10 openers — 5 that should trigger, 5
that shouldn't; report true positives / false positives / false negatives. A good skill scores
0 false positives and 0 false negatives.

## Skill update protocol (when a spec changes)

1. Identify all skills referencing the changed spec.
2. Update each skill's reference-file list if the spec was renamed.
3. Update each skill's constraints if the spec's rules changed.
4. Update each skill's description trigger if the domain terminology changed.
5. Deliver the updated skills in the SAME session as the spec change.

Point every skill at the CURRENT tooling — the generated registry + ROUTING + the live sources,
never a hardcoded list that drifts. Keep the skill inventory table (if the coordinator holds
one) accurate; a stale inventory misleads.
