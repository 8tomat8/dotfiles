---
name: dispatching-parallel-agents
description: Use when facing 2+ independent tasks that can be worked on without shared state or sequential dependencies
---

# Dispatching Parallel Agents

## Overview

Independent problems (different test files, different subsystems, different bugs) investigated sequentially waste time. Run one worker per problem domain, concurrently, with disjoint file ownership.

**Core principle:** one worker per independent domain, exclusive file ownership, all workers started and prompted — then end your turn. Waiting is background, never a turn (APPEND_SYSTEM "Waiting"): every wake re-bills your whole context.

Only the session the user is talking to dispatches. Workers execute their assignment directly and never delegate further — no subagents, no Herdr panes, no nested crew. A worker that needs another specialist says so in its report and stops.

## When to Use

**Use when:**
- 2+ failures, bugs, or refactors with different root causes
- Each problem is understandable without context from the others
- No shared state, and file ownership can be split disjointly

**Don't use when:**
- Failures are related (fixing one may fix the others) — investigate together first
- You don't know what's broken yet — exploratory debugging stays with you
- Understanding requires the whole system in one head
- Domains cannot be given disjoint files (see Shared files below)

## Pick the surface — do not force Herdr

| situation | surface |
|---|---|
| user asked for a crew, panes, tabs, Herdr, or invoked `/crewit` | Herdr pane agents (read `skill://crewit` — it owns that lifecycle) |
| anything else | in-process `task` subagents |

`task` subagents are the default. Herdr panes are a topology the user asks for, not an upgrade you hand out: spawning visible panes uninvited hijacks the user's screen. Equally, never silently downgrade an explicit crew request to `task` subagents — say what you are doing either way.

If the user asked for Herdr and `test "${HERDR_ENV:-}" = 1` fails: say Herdr is unavailable, and ask whether to proceed with `task` subagents or wait. Do not substitute a background `pi -p`, a detached `&` job, or any other improvised topology.

**REQUIRED SUB-SKILL (Herdr path only):** load `skill://herdr` before issuing any `herdr` command, and treat the installed CLI (`herdr --help`, `herdr agent`, `herdr pane`) as the authority on verbs, flags, and JSON shapes. Do not guess an ID field; parse it from the response. That skill is a command reference, not permission to dispatch — who may open panes and start agents is decided here and in `skill://crewit`.

## Model routing

Concrete models live in `~/.omp/agent/config.yml` under `modelRoles`. Name roles, never model families:

| work | `task` agent | Herdr launch (after `--`) |
|---|---|---|
| implementation, fixes, refactors, debugging, validation runs | `task`, `sonic`, `code-simplifier` | `--model @implementation --thinking high` |
| research, docs, discovery, read-only synthesis | `scout` | `--model @research --thinking high` |
| review: plan, decision, implementation-vs-plan, security | `reviewer`, `security-reviewer` | `--model @review --thinking xhigh` |
| all planning: plans, decomposition, ownership split, sequencing | `plan` | `--model @plan --thinking high` |

Agent types already resolve their own model through these roles, so a `task` dispatch sets `agent` only — no model argument. Pass a model only when the user named one exactly, and then pass exactly what they gave. Use only agent names the task tool lists in this session; if one is missing, pick the closest listed agent in the same row rather than guessing a name.

## The Pattern

### 1. Split into owned domains

One domain per worker. Each gets an exclusive file set. Copy the planner's ownership map before dispatching — it is the contract that makes concurrency safe. No map, or one that needs changes → back to `plan`; never draw it yourself.

### 2. Dispatch all workers, then end the turn

**`task` path:** put every independent slice in ONE `tasks[]` batch, with the shared contract (interfaces, formats, decisions) in `context`. Never spawn one and idle. Then reply with one line and end the turn — results auto-deliver:

```
task {"i": "Fixing abort and pool", "context": "# Goal …\n# Contract …", "tasks": [{"name": "FixAbort", "task": "# Target …"}, {"name": "MapPool", "agent": "scout", "task": "# Target …"}]}
```
→ `Dispatched FixAbort, MapPool; results auto-deliver.` → end turn. No `hub wait`, no `hub jobs` checks.

**Herdr path:** one sibling pane per worker, same cwd, no focus stealing:

```bash
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

Read the pane ID from `.result.pane.pane_id`. IDs are opaque — parse them, never predict or reuse them. With 3+ workers, don't repeat one direction into unusable slivers: check `herdr pane layout` and split wide panes right, narrow or tall ones down.

```bash
herdr agent start fix-auth --kind omp --pane <returned-pane-id> -- --model @implementation --thinking high
herdr agent prompt fix-auth "<full assignment>"
herdr agent prompt fix-pool "<full assignment>"
```

Start every worker, prompt every ready worker (no `--wait`), *then* arm ONE background watcher per worker via the bash tool and end the turn:

```
bash {"i": "Watching fix-auth", "command": "herdr agent wait fix-auth --timeout 3600000", "async": true, "timeout": 0}
bash {"i": "Watching fix-pool", "command": "herdr agent wait fix-pool --timeout 3600000", "async": true, "timeout": 0}
```
→ `Crew running: fix-auth, fix-pool; watchers armed.` → end turn.

Banned as ways to wait (each wake re-bills the whole context): `hub wait`; `sleep` or retry loops; repeated `herdr agent list/get/read` or `hub jobs` checks; foreground `herdr agent wait`; `herdr agent prompt --wait` (per worker in a loop it also serializes the batch). `agent_not_ready` means a startup approval/question UI is already showing: keep the healthy ones moving; for it do ONE bounded `agent read`, surface the block to the user now, then arm a background `herdr agent wait <name> --until idle --timeout 3600000`. Prompt it only when that watcher confirms `idle`; otherwise follow the re-arm rule in step 3, never prompt.

### 3. On each wake, read the state — don't assume success

A watcher finishing wakes you for that worker only. Read its absolute report file first, bounded, on every wake, including timeouts. Only if the watcher reported `blocked`, an error, or there is no report file, do ONE `herdr agent read <name> --source recent-unwrapped --lines 120`. A watcher that timed out with still no report file: ONE `herdr agent get <name>` to classify — `working` → re-arm it in the background and end the turn again (at most one wake per hour per worker); anything else → the bounded `agent read` above. After surfacing a `blocked` approval to the user, or for a worker idle without a report because it awaits its own background job, re-arm the transition watcher `herdr agent wait <name> --until working --timeout 3600000 && herdr agent wait <name> --timeout 3600000`, same async shape, so the next transition (approval then completion) wakes you; a report-file write alone does not. If it settles before `--until working` catches it, the next timeout wake finds its report file or its blocked/idle state.

Re-arm rule: re-arm only after a genuine timeout (the watcher's own `--timeout` elapsed) of a still-live worker, or after the `blocked`/awaiting-job transitions above. Any other watcher error (e.g. `{"error":{"code":"agent_not_found"}}` — the worker exited or crashed and Herdr dropped its name, so every new watcher fails at once) → classify once (the bounded `agent read`, or one `herdr agent get`), report the exit or BLOCKER to the user, and never re-arm.

| State | Meaning | Your move |
|-------|---------|-----------|
| `idle` before you prompted | finished **startup**, ready for input | prompt it |
| `idle` / `done` after you prompted | the turn settled — **not** proven success | read the report file; confirm it processed your assignment |
| `working` | turn in progress | watcher stays armed; you stay ended |
| `blocked` | approval or question UI | one bounded `agent read`, ask the user; never answer for them |
| `unknown` | Herdr can't classify it | one bounded `agent read`; **not** proof of completion |
| `agent_prompt_stalled` | no lifecycle change within 5s | read the pane before re-sending |

A settled state is never semantic success. Before treating a worker as ready for review you need the submission to have succeeded **and** evidence it worked: a post-submission lifecycle change, or its actual reported result.

### 4. Dispatch validation and review, then assess

Only once every worker is non-working **and** has returned its result. A blocked, unknown, or unresponsive worker means the union does not exist yet; dispatch nothing.

You do not read the union diff or run the suite in this session — that is the heavy work this pattern exists to delegate, and it burns the context you need to hold the whole batch. When the writers are quiet, dispatch two more workers in ONE round, then end the turn exactly as in step 2:

1. **union validator** — `task` agent, or a `--model @implementation` pane: the union of changed files against each worker's owned set (ownership violations), then the shared build/suite run ONCE on the union.
2. **independent reviewer** — `reviewer` agent, or a `--model @review` pane: implementation-vs-plan on the same union, never the author of any slice.

They are independent, so they go out together and run in parallel — but acceptance needs both verdicts, and a verdict is evidence, not auto-acceptance.

Then assess those bounded reports against the acceptance criteria and report to the user. Reading a result, a changed-path list, or a failing command's summary is yours; re-reading implementations is not.

No accept/reject workflow, no worktrees, no auto-merge, no rollback, no commits. The user commits.

## Worker Prompt Structure

Focused, self-contained, explicit about output. Every prompt states the exclusive file set, forbids mid-flight shared validation (siblings are editing concurrently; a full suite run mid-flight reports phantom failures), and tells the worker to start any long command (build, suite, CI run) via `bash` with `async: true` and end its turn — never sleep, retry-loop, or re-check. Include the job's planned signatures and names verbatim in every implementation assignment, with this instruction: 'Implement these as written; any needed deviation is a BLOCKER — report it and STOP.' Copy the plan's rules for that slice verbatim under a RULES heading, an explicit `none` included, stated as binding: 'These override your defaults; a conflict is a BLOCKER.' Only a slice with no rules entry at all goes back to the planner.

The two surfaces are not interchangeable in the prompt. Pick the worker's surface first and send only that surface's block: a Herdr pane is a separate OS process (report file, own session, no `hub`), a `task` subagent runs inside your process (`hub`, shared handles, no session of its own). Sending a subagent the pane recipe makes it either unable to report or forces it to return YOUR session as its own.

Both surfaces share this header. A Herdr pane runs a fresh top-level `omp` process: it loads the user's own instructions, including any that describe managing or dispatching agents. The `Mode: worker` header is what makes it a worker. Send it verbatim, with real IDs — never placeholders, never invented ones:

```markdown
Mode: worker — execute this assignment yourself and report back. Do NOT create Herdr tabs, panes, or agents, do NOT spawn subagents, do NOT delegate any part of this. Instructions you load about managing or dispatching agents are for the coordinator, not for you; this header wins.
That includes headless or one-shot agent probes (`omp -p`, `--no-session`, another agent CLI, SDK/API-based delegation) and any probe that would validate this orchestration setup itself — testing is not an exception. Need one? Return the exact proposed launch and its acceptance check to the coordinator and stop; only the coordinator runs it. This is an instruction, not a tool restriction — no other capability of yours is withdrawn.
COORDINATOR (NOT you — echo back exactly as given, never re-derive from your own environment): OMP session id <coordinator session id, or "unavailable">, session path <verified coordinator session path, or "unavailable">, role <@alias> (<resolved model>).
YOU (your own coordinates — echo these back too): job <job id>, role <@alias> (<resolved model>), <identity line from your surface block below>.
```

**Herdr pane worker** — append this surface block (and never the `task` one):

```markdown
Your identity: Herdr <workspace>/<tab>/<pane>, agent name <name>.
A Herdr pane is a separate OS process: `hub` reaches only agents inside your own process, so there is no `hub` route to the coordinator. Need another specialist, or work outside your scope? Write `BLOCKER: <what>` to your report file, say it in the pane, and stop — never spawn it yourself.

Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts:

1. "should abort tool with partial output capture" - expects 'interrupted at' in message
2. "should handle mixed completed and aborted tools" - fast tool aborted instead of completed
3. "should properly track pendingToolCount" - expects 3 results but gets 0

These look like timing/race issues. Find the root cause; do NOT just increase timeouts.

Own only: src/agents/agent-tool-abort.test.ts and src/agents/abort-controller.ts.
If the root cause turns out to be in a file outside that set (e.g. src/tools/executor.ts),
stop and report it — coordinate the boundary, do not unilaterally edit an unlisted dependency.
Do NOT touch other test files, shared config, or package.json — other agents are editing
concurrently. Do NOT run the full test suite, the linter, or the formatter; run only the
single test file you own. Anything long (build, suite, CI run): start it via `bash` with `async: true`
and end your turn — its completion wakes you; never sleep, retry-loop, or re-check. The coordinator does
not run the union suite either — it dispatches a separate union validator and an independent reviewer
once every worker is quiet.
REPORT FILE (write your result here, absolute path): <abs path>

Return a bounded RESULT — no transcripts, no pasted diffs: job + status · the COORDINATOR and YOU fields
echoed back unchanged · your role and resolved model · root cause in a few lines · changed paths ·
verification (command and its outcome) · blocker or decision needed · where any detail lives (absolute file
path — `local://` and `artifact://` handles resolve only inside the session that wrote them). Print it in the
pane and write the same block to your report file.
Include one line `session: <path>`, verified from YOUR OWN context rather than looked up: you own your local root, so write one line to `local://<job>-provenance.md`, take the physical path that write returns, then
`root=${physical%/local/*}; f="$root.jsonl"; id="${root##*_}"; grep -qm1 "\"type\":\"session\".*\"id\":\"$id\"" "$f" && echo "$f" || echo unavailable`
and print exactly what that prints. A Herdr `agent_session` pointer is a candidate only — never report one because the file exists, never report the coordinator's, never guess.
```

**`task` subagent worker** — same header, then this surface block instead (delete every Herdr coordinate, the report file, and the local-root check):

```markdown
Your identity: task agent type <type>, task job id <job id>.
You run INSIDE the coordinator's process: reach it with `hub` (`send` to `<coordinator agent id>`). There is no report file and you do not need one. Need another specialist, or work outside your scope? Say `BLOCKER: <what>` over `hub` and in your final result, and stop — never spawn it yourself.

<the same TASK / owned files / forbidden-shared-resources body, including: do not run the full suite, the
linter, or the formatter; long commands run via `bash` with `async: true`, then end your turn; the coordinator
dispatches a union validator and an independent reviewer at the end.>

Return the bounded RESULT as your final result: job + status · the COORDINATOR and YOU fields echoed back
unchanged · your role and resolved model · root cause in a few lines · changed paths · verification (command
and its outcome) · blocker or decision needed · where any detail lives — `local://` and `artifact://` handles
you create resolve for the coordinator, so cite them freely alongside absolute paths.
Report `session: unavailable`. You SHARE the coordinator's local root: a `local://` write returns the
COORDINATOR's session path, never yours. Do NOT run the standalone local-root/header check and never report a
path from it. Your key is the task job id plus your agent name. Report a path of your own only if your runtime
separately hands you a verified identity for THIS subagent; absent that, the answer is `unavailable`.
```

**Append verbatim to every worker prompt:**

```markdown
NEVER run `git commit`, `git push`, `git rebase`, `git commit --amend`, `git reset`, `git stash`, or any other history/index-mutating git command. No exceptions, no "the plan said commit", no "user seemed to want it". The user commits.
NEVER touch GPG or commit-signing configuration in any form: no `-c commit.gpgsign=false`, no `git config`, no editing `.gitconfig`, no pinentry workarounds. Signing failure = stop and report.
Task done = STOP and report back to the user for review. Completion is a report, never a commit.
```

## Provenance

Keep a row per worker: job id, role alias + resolved model, the `task` job id or the Herdr pane ID and agent name, owned paths, the absolute report-file path (Herdr panes only), and a session path only when one was verified. Record your own coordinator session id and session path once, separately from the workers' — every assignment carries both fields labelled as yours, and a worker must never return them as its own. Herdr pane IDs are never reused, so they identify a worker even when its session reads `unavailable`. Record `unavailable` rather than a guess, and an unverified pointer as `reported (unverified): <path>`.

A session path is recordable only when the process that OWNS it verified it from its own context. The check is a write, not a lookup: write through `local://`, take the PHYSICAL path the write returns (`…/<timestamp>_<session-id>/local/<file>`), and accept the sibling `<timestamp>_<session-id>.jsonl` only when its own header record carries that same id:

```bash
root=${physical%/local/*}; f="$root.jsonl"; id="${root##*_}"
grep -qm1 "\"type\":\"session\".*\"id\":\"$id\"" "$f" && echo "$f" || echo unavailable
```

Only a standalone `omp` process — a Herdr pane, a launched session — owns its local root. An in-process `task` subagent SHARES the coordinator's local root, so the path it gets back names the COORDINATOR's session, never its own: its key is the task job id plus agent name, and its session line is `unavailable`.

Herdr's `agent_session` value is a candidate, never a verification. It is that terminal's last-session breadcrumb: it can name a `fresh` file that does not exist yet, and it can name a different session that does exist on disk — a resumed coordinator was observed doing exactly that, and an `[ -f "$f" ]` gate accepts it. Record it as `reported (unverified): <path>` until the owning process reports that same path, verified as above.

Never identify a session by `$TMUX_PANE` (every omp process in one tmux pane inherits it, so a worker would report its parent's), by the newest cwd-matching breadcrumb (parallel same-cwd sessions make it a coin flip), or by the `tmux-assistant-resurrect` `omp-<pid>.json` state file (per process, and in-process `task` subagents overwrite it with their own session on start).

## Shared files

Two domains needing the same file are not independent. The planner either splits until the file sets are disjoint, or names one owner of that file and serializes that boundary — the other worker gets the rest of its task and the shared edit stays with the owner. Never hand the same file to two concurrent workers.

## Red Flags — STOP

- Opening Herdr panes the user never asked for, or dropping an explicit crew request to `task` subagents without saying so
- Improvising a topology (`pi -p`, `&` jobs) when the requested one is unavailable
- Guessing `herdr` verbs or flags instead of reading `herdr --help` / `herdr agent` / `herdr pane`
- Naming a model family or fuzzy name instead of a role alias
- A worker spawning a pane, an agent, or a subagent
- A worker running a headless or one-shot probe (`omp -p`, another agent CLI, an SDK/API call) to "test" the setup instead of handing the proposed launch back
- Sending the Herdr surface block to a `task` subagent (report file, no-`hub`, local-root session check) — it makes the subagent report YOUR session as its own
- `prompt --wait` per worker, one after another — that's sequential with extra steps
- Waiting in turns: `hub wait`, `sleep` loops, repeated `agent list/get/read` or `hub jobs`, foreground `herdr agent wait` — each wake re-bills your whole context
- Treating `unknown`, or `idle`-before-prompt, as "done"
- Answering a `blocked` approval dialog yourself
- Reviewing the union or running the shared suite in this session instead of dispatching the validator and the independent reviewer
- Recording a session id nobody reported, an unverified breadcrumb recorded as if it were live, or a breadcrumb target accepted because the file exists
- Splitting panes with a different cwd, or stealing focus from the user
- Two workers owning one file
- Committing, pushing, or merging anything
