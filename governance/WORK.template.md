<!-- A8 Loom Coordinator — MIT License -->
<!--
  WHAT THIS IS: the work list + the rails. ONE flat list of everything that needs doing,
  plus the autonomy contract the coordinator works it under. It replaces the goal-tree /
  backlog-charter shape that earlier versions of this stack shipped (see §Why below — that
  shape was measured and retired).

  WHEN IT LOADS: the rails are always-on (@-imported by CLAUDE.md). The LIST itself is not
  a markdown file at all — it is `WORK.tsv`, printed on demand by `node tools/work.js`.

  HOW TO FILL: replace {{...}}, keep the rules verbatim (they are the whole mechanism), and
  seed WORK.tsv with your real open items — one row each, no nesting.
-->

# WORK — the list, and the rails it is worked under

> **There is ONE work list and it is `WORK.tsv`.** One line per item:
> `id <TAB> title <TAB> body`. `node tools/work.js` prints it. No second list, no tree, no
> lanes, no status column, no priority field: **on the list = needs doing, and ORDER is the
> only priority signal.** A row leaves the list only via
> `node tools/work.js done <id> <hash>`, which resolves the hash locally and refuses a
> checkpoint or a hash that does not exist. `git log -p WORK.tsv` is the record of what got
> done and by which commit.

## 1. The rules (keep these verbatim — they are the mechanism)

1. **ONE file.** `WORK.tsv` at the repo root. There is no second work list, no sidecar, no
   "parked" file, no per-area breakout. A second list is how the first one starts lying.
2. **ONE row per item** — `id <TAB> title <TAB> body`, body newlines escaped, so **nesting is
   not representable**. That is the point, not a limitation.
3. **No status column.** No parked / queued / deferred / blocked / in-progress. An item that
   does not need doing is **deleted**. An item that needs an operator decision says so in its
   body and stays on the list, because it still needs doing.
4. **Done is a commit, not a sentence.** `done <id> <hash>` refuses a hash that does not
   resolve, and refuses a checkpoint (`WIP:`) commit. Nobody can write "done" — they can only
   point at a commit that exists.
5. **Zero prose in the file.** Not a header, not a column label, not a section marker. Usage
   is `--help`; history is `git log -p WORK.tsv`. Every byte in the file is an item.
6. **A row with no body is refused** — a bare title sends the next reader hunting for a doc
   that may not exist. The body IS the item: what, where, and what "done" looks like.

## 2. The four verbs

```bash
node tools/work.js                      # print the list (id · title · first body line)
node tools/work.js show <id>            # one item, body unescaped
node tools/work.js add "<title>" "<body>"   # append one — BOTH required
node tools/work.js done <id> <hash>     # remove it; REFUSED on a fake or WIP hash
node tools/work.js --check              # the gate (wire it into .githooks/pre-commit)
```

## 3. Why this shape (the measurement that retired the goal tree)

The ancestor project ran a goal tree plus an open-work backlog: **185 KB of prose with
checkboxes buried in it** — an open item averaged 15 lines / 1.3 KB. Every tool that had to
*find* work was a regex over English, so **every hole was a parser hole**: one heading-word
test hid 20 goals and 43 open items for weeks. Both files were deleted along with the ~28
tools that parsed them.

The diagnosis generalizes: **nesting, status columns, and resident completed work are the
disease.** A tree invites a lane that is neither open nor closed; a status column invites an
item that is neither done nor deleted; completed work left in place buries the live rows. A
flat list with no status cannot express any of those, which is why it stays true.

## 4. The autonomy contract

- **Autonomous (no ask):** everything inside a row's stated scope — investigation, delegation,
  builds, verification, commits (a commit IS the tick), doc sync, authoring acceptance tests,
  restarting a stalled worker, and **re-firing any lane that refused for a mechanical reason**
  (§5).
- **Operator-gated (stop and ask, once, after searching the docs):** ratifying a decision not
  already marked RATIFIED · anything user-visible and genuinely new (new vocabulary / new
  surface consent) · external publication · deleting operator-authored content · changing what
  a row *is* · anything touching money or accounts.
- **Never escalate a question the docs answer.** Search the owning spec first and show the
  search; an escalation that the spec already answered costs the operator's scarcest resource
  (`ESCALATED-A-QUESTION-THE-DOCS-ANSWER`).
- **Spot-check protocol:** each landed row leaves a commit whose message carries the evidence,
  and the row leaves the list citing that hash. The operator samples; silence = proceed.
- **Estimates are stated in TOKENS**, per spawn, visible in the turn that fires it — never
  converted into a plan-meter percentage. Metered plans do not track token volume linearly
  (measured: a 5× spread between two same-day windows), so a percentage estimate is a
  fabricated number wearing a precise one's clothes. Sum the planned lanes' token estimates;
  if the real budget matters, read the meter before and after and record the pair.

## 5. The rails (absolute, and mostly mechanical)

- **`BREAK-WORKING` is the prime rail.** Anything operator-verified-working changes only
  through its owning shared path, with test proof before the commit.
- **Commit as you build.** The whole gate stack fires on `git commit`, so a session that
  defers committing lives entirely in un-gated space. A checkpoint is free
  (`git commit -m "WIP: <reason>"`); the full stack runs on the non-WIP arc-close commit.
  **"ready / done / works" is reserved for a non-WIP, gate-green commit cited by its hash.**
- **One proof instrument per lane.** The default tier is the lightest one that answers "did I
  break what already worked". A known-good path is NOT re-proven; adding content to a proven
  path ships with the generator/converter run and ONE user-path acceptance test. A heavier
  tier needs its reason written in the brief. Do not run gates over surfaces the diff cannot
  reach. (`TRAVERSAL-IS-DIAGNOSIS-NOT-VERIFICATION`.)
- **A mechanical refusal is a queue entry, not a report.** If a lane refuses because a sibling
  holds its file, because the unit is atomic and did not fit its budget, or because a
  prerequisite is unbuilt — record the refusal **with its unblock condition**, then watch for
  that condition and **re-fire it in the same run**. The only refusal that genuinely waits is
  one that needs an operator ruling. Idle capacity with rows left on the list means either
  every remaining row is operator-gated (name them) or something refused and was not re-fired.
- **The seat does four things:** reason · spawn · audit · commit. Any diagnosis that needs
  more than one look goes to a worker *with the symptom*, and it returns the root cause. This
  holds hardest during a crisis, which is exactly when the seat is tempted to go hands-on.
- **One canonical dev/test server**, shared with the operator; a worker that needs isolation
  takes its OWN port and tears it down **by the PID it started** (§`dev-infrastructure`).
- Every landed row ships its doc / test / persistence duties, or declares each `n/a` with a
  reason. No silent skips.

## 6. Working the list

Take the **topmost** row. Read its body (`show <id>`). Confirm it with the operator if it is
operator-gated; otherwise route it per the delegation grid, audit the returned brief, verify
the effect on the running system, commit, then `done <id> <hash>` and take the next row.
One row per increment; the list is re-read, never remembered.

A batch-shaped row (many files, same mechanical operation) runs as one lane with one proof
instrument and per-family checkpoints, closed by a single non-WIP commit — not one gate run
per item.
