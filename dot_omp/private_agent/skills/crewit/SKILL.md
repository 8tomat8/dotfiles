---
name: crewit
description: Use when the user invokes /crewit or asks to execute an approved plan or task by delegating work to parallel OMP agents in Herdr tabs of the current workspace, or to resume, inspect, stop, or clean up such a delegation.
---

# Crewit — Herdr coordinator

## 1. Role

On invocation this session becomes a coordinator only: the human-facing `@default` session. It dispatches, supervises, validates, reports. It does not plan, implement, research, debug, or scrape in its own context. Planning — creating the plan, decomposing into phases and jobs, sequencing, the ownership split, contracts, acceptance criteria — belongs to a `@plan` session (section 3) the way implementation belongs to `@implementation`. Anything heavier than reading a worker report, a plan artifact, or a changed-path list is delegated to a child `omp` agent in a Herdr pane. Purpose: keep this session far from compaction so the plan context survives the whole run.

The only planning-adjacent work done here is small preparation the user explicitly asked for — e.g. reading one named file, creating the report directory. It never grows into drafting, splitting, or amending a plan.

This coordinator is the ONLY agent that creates Herdr tabs or panes, starts Herdr agents, or spawns subagents. Workers execute their assignment directly and never delegate further: no `herdr tab/pane/agent` commands, no `task` subagents, no nested crew. A worker that needs a different specialist (review, research, planning) says so in a BLOCKER and the coordinator spawns it.

## 2. Gate

1. `test "${HERDR_ENV:-}" = 1`. If it fails: tell the user Herdr is unavailable and stop. No silent fallback to `task` subagents — that changes the topology the user asked for. The only fallback is the explicit one below.
2. REQUIRED SUB-SKILL: read `skill://herdr` before the first herdr command. It is the command reference — layout, IDs, lifecycle, read sources — not a mandate about who may dispatch; ownership of tabs, panes, and agents is decided here (section 1). The installed CLI `--help` output is the authority on flags and JSON shapes; if a response shape differs from what this skill or that skill says, use what the CLI actually returned — never guess an ID field.
3. Record `$HERDR_WORKSPACE_ID` and the coordinator's own pane (`herdr pane current --current`). Fix the run slug `<run>` (section 5) and rename your own tab: `herdr tab rename "$HERDR_TAB_ID" "<run>·coord"`. Your own session path is not looked up here — it falls out of the registry write itself (section 4), so create `local://crewit.md` before any tab, pane, or agent exists and fill its session line from the physical path that write returns. All workers live in NEW TABS of this same workspace so the user can watch them alongside the coordinator. Never start an agent in the coordinator's pane, never close the coordinator's tab, never close the workspace, never steal focus (`--no-focus` on every create/start).
4. Honest limit: prompt-based supervision is best-effort. The coordinator observes only when a watcher or report wakes it (section 8) and cannot prevent a write that happens between wakes. Say this to the user once at start.
5. Every Herdr pane runs a FRESH TOP-LEVEL `omp` process, not a subagent — nothing in its context marks it as a worker, and manager-oriented user instructions load there in full. Its role comes only from the `Mode: worker` header in its first prompt (section 6), which by convention wins over those instructions. Never assume a pane inherits coordinator state or rules; state them in the assignment.

## 2a. Opt-out — `no crew`

The user can say `no crew` (in the `/crewit` arguments or in conversation, e.g. while the session is in another mode and spawning panes would be noise). Then, for that request only:

- Do not create tabs, panes, or Herdr agents. Handle the work through the normal in-process `task` subagents; keep the main session as coordinator (it still does not implement in its own context). Same routing as a crew: pick the agent type whose role matches the work (section 7); its model comes from the shared role aliases, never from a per-call model guess.
- Every other rule still applies: same worktree, owned paths, worker prompt template (section 6) — `Mode: worker` provenance header, no nested delegation, the three git rules, all sent verbatim — plus validation (section 9) and stop-and-report. Subagents do not spawn subagents either. The one mandatory substitution is the execution surface: a `task` subagent runs *inside* this process, so it gets surface block `[B]` and block `[A]` is deleted. That is what `[B]` already encodes — it reaches the coordinator over `hub` instead of a report file, its `local://` and `artifact://` handles are readable here so no absolute report path is needed, and it reports `session: unavailable` because the local root it writes through is this coordinator's, not its own. Never send it `[A]`'s report-file or standalone-session recipe.
- Waiting: all slices in ONE `task` call, then end the turn with a one-line status — results auto-deliver (APPEND_SYSTEM "Waiting"). No `hub wait`, no `hub jobs` checks.
- Log it in the registry under Decisions: `<time> no crew — <request> handled via task subagents`.
- Scope: the current request. The next `/crewit` or plan phase spawns crew again unless the user repeats `no crew` or says it applies until further notice; record that in the registry if so.

`crew back` / `use crew` ends a standing opt-out.

## 3. Intake

Source: plan file named in the invocation arguments, else the plan/task in conversation. `plan` as the argument → pair-planning mode (section 7), no implementation.

The coordinator never writes the plan. Route by what the source is:

- Approved plan whose jobs already carry every field below → execute it (section 5), copying phases, jobs, contracts, and acceptance criteria into assignments as written.
- No plan, an unapproved draft, or a plan that is missing a field, ambiguous, contradicted by the tree, or needs changes → Phase 0: ONE planner, dispatched with the fixed planner assignment (section 6). Never patch the plan yourself — not a missing owned path, not a one-word acceptance fix. Rework (review findings, user changes) goes back by surface:
  - crew pane (`@plan`): it writes the plan to its report file; arm its watcher and end the turn (section 8). Rework → `herdr agent prompt` that same pane with the feedback while it is live, then re-arm; else a fresh pane handed the prior plan's report path.
  - `no crew` (`plan` agent): its plan is its final result, auto-delivered — no pane, report file, or watcher. Rework → a NEW `plan` task given the prior result and the feedback; end the turn.
- Plan returned → plan reviewer (`@review`, fixed assignment in section 6) → plan + verdict to the user (plan tab ` !`) → phase gate `approved` only on the user's explicit approval (plan tab ` ✓`). Review findings and user changes go back to the planner as above, not into coordinator edits.

The plan splits into phases, and within a phase into jobs that are truly independent. Every job declares:

| field | meaning |
|---|---|
| owned paths | exclusive write scope; one owner per file, never two writers |
| read-only deps | paths it may read but not change |
| forbidden shared resources | lockfiles, generated files, schemas, migrations, fixtures it must not touch |
| acceptance criteria | observable result the coordinator can check from the report |

Shared interface between two jobs → the plan fixes the contract (copied into both assignment texts before spawning) or serializes them as dependent waves. Job needing another's output → later wave, not a parallel guess. A plan that leaves either open goes back to the plan session.

Baseline: run `git status --porcelain` before spawning and record it. Pre-existing user changes are protected — every worker is told not to touch or revert them.

Same worktree, always: every tab is created with `--cwd "$PWD"` (the coordinator's cwd) and every worker edits the coordinator's checkout in place. No `git worktree add`, no clones, no temp copies, no isolated subagent worktrees — the user reviews and commits one tree. Workers that themselves spawn subagents pass the same rule down.

## 4. Registry — `local://crewit.md`

Durable across compaction. Write intent BEFORE creating a resource; write returned IDs IMMEDIATELY after. Template:

```
# Crewit — <goal>
Run: <run> · Workspace: <id> · coordinator pane: <id> (untouchable) · cwd: <abs path> · plan: <ref> · baseline: <clean|paths>
Coordinator session id: <session id, else `unavailable`> · session path: <verified session jsonl path, else `unavailable`> · model: @default (<resolved id>)
## Phase <n> — tab <number> «<label>» (<tab_id>)[, overflow tabs same form] · gate: awaiting-user | approved
| job | pane | agent | role alias | resolved model | worker session | task state | scope (owned paths) | depends on | acceptance | report | watcher job |
## Decisions & incidents
- <time> <job>: <stopped/why, user decision, validation verdict>
```

`worker session` is the worker's own session path once it reports a verified one, else `unavailable` — never an invented, guessed, or unverified value (an unverified pointer is recorded as `reported (unverified): <path>`). The durable keys are the Herdr pane ID and agent name: Herdr never reuses a closed pane ID, so two panes stay distinguishable even when both sessions read `unavailable`. `report` is the absolute report-file path handed to the worker (section 6), never a pasted transcript.

Provenance runs both ways:

- coordinator → worker: every assignment carries the worker's own coordinates (Herdr workspace/tab/pane + agent name for a crew pane, or the task agent type + task job id for a `task` subagent), the job id, the role alias + resolved model, the absolute report-file path for a crew pane, and — labelled as the COORDINATOR's, separately — the coordinator's own session id and its verified session path (each `unavailable` when not verified) (section 6). The worker echoes those fields back **unchanged** — it must never re-derive the coordinator's identity from its own environment, and must never report the coordinator's session as its own.
- worker → coordinator: a crew pane's RESULT reports its own verified session path, or `unavailable`; a `task` subagent reports `unavailable` (it shares this coordinator's local root, so it has nothing of its own to verify).

Identity is the Herdr pane plus the agent name: `$HERDR_WORKSPACE_ID`/`$HERDR_TAB_ID`/`$HERDR_PANE_ID` in each pane's own environment, `herdr agent get <name>` for anyone else's. Herdr never reuses a closed pane id, so that pair keeps two panes distinguishable even when both sessions read `unavailable`. Session paths are decoration; the pane is the key.

A session path is recorded only when the process that OWNS it verified it from its own context. The check is a write, not a lookup: write through `local://` — the coordinator writes its registry `local://crewit.md` first, before any pane exists (section 4 runs before section 5 for exactly this reason) — and take the PHYSICAL path the write returns:

```
<sessions>/<cwd-slug>/<timestamp>_<session-id>/local/crewit.md
```

The session file is that local root's sibling, and counts as yours only if its own header carries the same id — one grep of the header record, never a transcript read:

```bash
root=${physical%/local/*}                    # …/<timestamp>_<session-id>
f="$root.jsonl"; id="${root##*_}"
grep -qm1 "\"type\":\"session\".*\"id\":\"$id\"" "$f" && echo "$f" || echo unavailable
```

Who may use it:

- A standalone `omp` process — crew pane, resumed coordinator, launched session — owns its local root, so this establishes its own identity. Demonstrated on this coordinator and on a live crew worker.
- An in-process `task` subagent SHARES its parent's local root: the physical path it gets back names the COORDINATOR's session, never its own. It records `unavailable`; its key is the task job id plus agent name.

Herdr's pointer (`herdr agent get <pane> | jq -r '.result.agent.agent_session.value'`) is a CANDIDATE, never a verification. It is the terminal's last-session breadcrumb: it can name a `fresh` file that does not exist yet, and — observed on a resumed coordinator — it can name a different session that does exist on disk. `[ -f "$f" ]` accepts that wrong file. Record the pointer as `reported (unverified): <path>`; it becomes the row's session only when the owning process itself reported that same path, verified by the rule above.

Four ways to be wrong, all banned:

- an existing breadcrumb target accepted because it exists — existence is not ownership.
- `$TMUX_PANE` — every omp process in one tmux pane inherits it, so a worker reports its parent's.
- the newest breadcrumb whose cwd line matches — parallel sessions in one cwd make it a coin flip.
- the `tmux-assistant-resurrect` state file `omp-<pid>.json` — it is per *process*, and in-process `task` subagents overwrite it with their own session on start, so it names whichever session last started in that process, not yours.

No verified path → `unavailable`, never a guess. Later steps quote the actual path a write or a RESULT returned; never a path assembled from a template.

Task states (coordinator's, separate from Herdr lifecycle `idle|working|blocked|done|unknown`):
`intent → provisioned → assigned → working → decision-needed → interrupt-requested → stopped → reported → validated | accepted`.

Rules: `idle` after work ≠ `validated`. `unknown` ≠ safe. Esc sent ≠ `stopped` — confirm quiescence with one bounded `agent read` after that worker's watcher reports it settled, before marking `stopped`. After compaction or resume: read the registry, reconcile every row once against one `herdr agent list` and one `hub jobs`, sync each tab label and Phase header to the reconciled state (section 5), reuse every recorded watcher job that is still running (a watcher survives compaction), re-arm (section 8) only a `working` row whose watcher is confirmed gone, then and only then dispatch.

## 5. Provision & dispatch — parallel barrier

Per phase, ONE tab in the coordinator's workspace, split into one pane per parallel job so the user sees the whole phase side by side.

Tab labels — the one format for every tab this skill creates: `<run>·P<n>·<what>`, e.g. `authfix·P1·api`.
- `<run>`: short slug of the request, ≤10 chars, lowercase, fixed at the gate and recorded in the registry header. The coordinator's own tab is `<run>·coord`.
- `P<n>`: phase number; `P0` is planning (section 3).
- `<what>`: the job name for a single-job tab; the role for a fixed-role tab (`plan`, `review`, `validate`, `merge`); otherwise a ≤12-char phase slug. Overflow tabs of a phase append `·2`, `·3`.
- State suffix: none = working, or reported but not yet validated; ` !` = something in the tab waits on the user (blocked, approval, decision); ` ✓` = every job in the tab validated or accepted; ` ✕` = a job in the tab confirmed `stopped` (section 4). ` !` wins while anything waits on the user.
- Total ≤28 chars including the suffix (tab bar width); trim `<what>`, never `<run>` or `P<n>`.
- Rename (`herdr tab rename <tab_id> "<label>"`) only on the wakes and gates that already happen (sections 3, 8, 9) and once during the section 4 compaction/resume reconciliation — never a poll of its own — and update the Phase header in the same step.

Tab reference: every message to the user that concerns crew work names the tab as `tab <number> «<label>» (<tab_id>)` — the one-line status after dispatch/arming, every wake report, blockers, the phase-end report; with several tabs live, list each with its state. `tab_id` is the stable key; `number` is the tab-bar position and shifts when a tab closes, so refresh it with one `herdr tab list` after a close.

1. `herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$PWD" --label "<run>·P<n>·<what>" --no-focus` → record `tab_id` and `number` from `.result.tab`, and `.result.root_pane`. Job #1 uses the root pane.
2. Each further job: `herdr pane split --pane <existing pane> --direction right|down --cwd "$PWD"` → pane from `.result.pane`. Alternate directions (split the largest pane) so panes stay usable; beyond ~4 jobs open a second tab for the same phase (label `…·2`) rather than slivers.
3. `herdr agent start <job> --kind omp --pane <pane> -- --model @<role> --thinking <level>` for ALL jobs, role alias per section 7 (e.g. `-- --model @implementation --thinking high`). Agent names: `[a-z][a-z0-9_-]{0,31}`, unique.
4. `herdr agent prompt <job> "<assignment>"` for ALL jobs, NO `--wait`; it returns once the prompt is submitted.
5. Only then arm one background watcher per job (section 8) and end the turn.

Never `prompt --wait` in a loop — it serializes the fleet. If one job fails preflight (e.g. agent_not_ready — a startup approval/question UI is already showing), keep prompting the healthy ones; for the failed one do ONE bounded `agent read`, rename its tab ` !` and surface the block to the user now, then arm a background `herdr agent wait <job> --until idle --timeout 3600000` (section 8 shape). Prompt it only when that watcher confirms `idle`; otherwise follow the section 8 re-arm rule, never prompt. Never blind-resend a prompt: check `agent read` first — a duplicate prompt is duplicate work.

## 6. Worker prompt template

Each assignment is self-contained; the worker has no conversation history. The template below has one shared body plus TWO execution-surface blocks. Fill EXACTLY ONE surface block — `[A]` for a Herdr pane, `[B]` for a `no crew` `task` subagent — and DELETE the other before sending. Never transmit both, and never leave the worker to infer which surface it runs on.

Execution jobs: TASK, OWNED PATHS, READ-ONLY DEPS, FORBIDDEN SHARED RESOURCES, and acceptance are copied from the approved plan's job entry, never re-derived; a field the plan leaves empty goes back to the planner (section 3), never filled in here. Include the job's planned signatures and names verbatim in every implementation assignment, with this instruction: 'Implement these as written; any needed deviation is a BLOCKER — report it and STOP.' Copy the job's "Rules per job" block from the plan verbatim under RULES, an explicit `none` included; only a job with no rules block at all goes back to the planner.

Fixed-role jobs are not in the plan and use these complete assignments. Fill the `<…>` slots only with verbatim material — the user's request, paths, RESULT text, the plan's own ownership map — never with anything composed here. All but the merge resolver are read-only: OWNED PATHS is `none` apart from the crew pane's report file; READ-ONLY DEPS is the whole repo plus the plan; FORBIDDEN SHARED RESOURCES is every tracked file; PROTECTED BASELINE as recorded. The merge resolver's OWNED PATHS are exactly the conflicted paths it is given, which it may edit only to resolve conflict markers; its PROTECTED BASELINE is the recorded baseline minus those paths, so every other baseline change stays protected. It is dispatched only when the user explicitly asks for conflicts to be resolved.

| job | role | TASK — acceptance |
|---|---|---|
| planner | `@plan` / `plan` | First read and follow `~/.omp/agent/agents/plan.md` in full; it defines your deliverables and limits. Produce or revise the plan for: <user request verbatim>. Prior plan: <report path or result, else "none">. Feedback: <reviewer findings / user words verbatim, else "none">. — acceptance: phases; independent jobs each declaring the four section 3 fields; shared contracts; sequencing with reasons; risks; open questions named, not guessed; reuse citations; signature-level snippets; existing vocabulary and justified new terms; rules per job, verbatim, from every AGENTS.md on each touched path. |
| plan reviewer | `@review` / `reviewer` | First read ~/.omp/agent/agents/reviewer.md and apply only its <consistency> block. Use this assignment's verdict and reporting format, not that file's frontmatter, overall_correctness field, or yield protocol. Review the plan at <path or result> against <user request verbatim>, ponytail lens. — acceptance: verdict `approve` or `revise`, findings citing job ids; check every planner acceptance criterion, including reuse and signatures; check the rules section is complete for every touched path. |
| union validator | `@implementation` / `task` | Union of changed paths <from the RESULTs>; owned paths per job <the plan's ownership map>. Report every write outside its owner's paths and every violation of RULES, then run the shared build/suite ONCE on the union. Build output may land only where the build normally writes. — acceptance: ownership verdict, rule violations citing rule and path, exact command, outcome. |
| phase reviewer | `@review` / `reviewer` | First read ~/.omp/agent/agents/reviewer.md and apply only its <consistency> block. Use this assignment's verdict and reporting format, not that file's frontmatter, overall_correctness field, or yield protocol. Review implementation vs the plan at <path>, including its rules section, on the union <changed paths>, ponytail lens; you authored none of it. — acceptance: verdict `accept` or `rework`, findings citing job ids and paths, and the rule for any rule violation. |
| merge resolver | `@merge` / `merge` | First read and follow `~/.omp/agent/agents/merge.md` in full; it defines your deliverables and limits. Read every AGENTS.md from the repo root down to each conflicted path in full; they bind your resolution. Resolve the conflicts in <conflicted paths from `git status` verbatim> for: <user request verbatim>. — acceptance: no conflict markers left in owned paths; per-file resolution summary; every ambiguity as a BLOCKER; no git index/history command run (no `git add`/`rm`, no `--continue`, no `checkout --ours/--theirs`). |

```
Mode: worker — execute this assignment yourself and report back. You are not a coordinator: do NOT create Herdr tabs, panes, or agents, do NOT spawn subagents, do NOT delegate any part of this. Instructions you load that describe managing or dispatching agents are for the coordinator, not for you; this header wins.
That also covers headless or one-shot agent probes (`omp -p`, `--no-session`, another agent CLI, SDK/API-based delegation) and any probe that would validate this orchestration setup itself: testing is not an exception. If you need one, return the exact proposed launch and its acceptance check to the coordinator and stop — only the coordinator runs it. This is an instruction, not a tool restriction: nothing else in your toolset is withdrawn.
COORDINATOR (that is NOT you — echo these back exactly as given, never re-derive them from your own environment): OMP session id <coordinator session id, or "unavailable">, session path <verified coordinator session jsonl path, or "unavailable">, role <@alias> (<resolved model>), Herdr pane <coordinator pane id, or "n/a">.
YOU (your own coordinates — echo these back too): job <job id>, role <@alias> (<resolved model>), plus the identity line in your execution-surface block below.

TASK: <what to build/find/fix> — acceptance: <criteria>
OWNED PATHS (write only here): <list>
READ-ONLY DEPS: <list>
FORBIDDEN SHARED RESOURCES: <lockfiles, generated files, schemas, migrations, fixtures>
PROTECTED BASELINE (do not touch or revert): <paths from git status, or "none">
RULES (binding — these override your defaults; a conflict is a BLOCKER): <execution job: the plan's "Rules per job" block for it, verbatim, `none` included; union validator and phase reviewer: the plan's rules for the union paths, verbatim — binding for the validator's commands too; planner, plan reviewer, merge resolver: "none">
Work ONLY inside the listed scope, in THIS worktree (cwd as started). Never create a git worktree, clone, or copy of the repo; never run tools with an isolated/worktree mode.

EXECUTION SURFACE — [A] SEPARATE CREW PROCESS (send this block only to a Herdr pane; delete [B])
- Your identity line: Herdr <workspace>/<tab>/<pane>, agent name <name>.
- You are a separate OS process from the coordinator: `hub` reaches only agents inside your own process, so there is no `hub` route to it. Need a different specialist (review, research, planning), or work outside your scope? Emit `BLOCKER: <what>`, write it to your report file, and stop — never spawn it yourself.
- REPORT FILE (write your RESULT here, absolute path): <abs path>. Print the same RESULT in your pane. Cite detail by absolute file path only — `local://` and `artifact://` handles resolve only inside the session that made them, so they are useless to the coordinator.
- Include one line `session: <path>`, verified from YOUR OWN context, not from a breadcrumb: you own your local root, so write one line to `local://<job>-provenance.md`, take the physical path that write returns, then
  `root=${physical%/local/*}; f="$root.jsonl"; id="${root##*_}"; grep -qm1 "\"type\":\"session\".*\"id\":\"$id\"" "$f" && echo "$f" || echo unavailable`
  and print exactly that. A Herdr `agent_session` pointer is a candidate only — never report one just because the file exists, never report the coordinator's, never guess.

EXECUTION SURFACE — [B] NATIVE `task` SUBAGENT (send this block only to an in-process subagent; delete [A])
- Your identity line: task agent type <type>, task job id <job id>.
- You run INSIDE the coordinator's process: reach it with `hub` (`send` to `<coordinator agent id>`). There is no report file and none is needed. Need a different specialist, or work outside your scope? Say `BLOCKER: <what>` over `hub` and in your final result, and stop — never spawn it yourself.
- Deliver your RESULT as your final result. `local://` and `artifact://` handles you create resolve for the coordinator, so citing them is fine alongside absolute paths.
- Report `session: unavailable`. You SHARE the coordinator's local root, so a `local://` write hands you the COORDINATOR's session path, never your own — do NOT run the standalone local-root/header check and never report a path derived from it. Your key is the task job id plus your agent name. Report a path of your own only if your runtime separately gives you a verified identity for THIS subagent; absent that, `unavailable` is the answer.

PROTOCOL
- After each meaningful step emit one line: CHECKPOINT: <what>
- Anything unexpected, scope proves wrong, or a new strategy is needed: emit BLOCKER: <what> and STOP. Report and end your turn. Do not improvise.
- Conflict markers in a file, or a merge/rebase stopped on conflicts: emit BLOCKER: <paths> and STOP. Never resolve a conflict yourself unless this assignment is the `@merge` merge resolver.
- Long command (build, test suite, CI run): start it via `bash` with `async: true` and end your turn; its completion wakes you. Never sleep, retry-loop, or re-check.
- Validate your own scope only (tests/build for your files). No project-wide validation mid-flight: the coordinator does not run the union build or suite itself either — it dispatches a separate `@implementation` union validator and an independent `@review` reviewer once the phase is quiescent.
- Finish with a bounded RESULT — no transcripts, no pasted diffs — delivered as your surface block says:
  job + status · the COORDINATOR and YOU fields echoed back unchanged · your role and resolved model · summary in a few lines · changed paths · verification (command and outcome) · blocker or decision needed · where any detail lives · the `session:` line your surface block specifies.

INVIOLABLE RULES
1. NEVER run `git commit`, `git push`, `git rebase`, `git commit --amend`, `git reset`, `git stash`, or any other history/index-mutating git command. No exceptions, no "the plan said commit", no "user seemed to want it". The user commits.
2. NEVER touch GPG or commit-signing configuration in any form: no `-c commit.gpgsign=false`, no `git config`, no editing `.gitconfig`, no pinentry workarounds. Signing failure = stop and report.
3. Task done = STOP and report back to the user for review. Completion is a report, never a commit.
```

If a worker asks to work elsewhere (worktree, clone, scratch copy) it is a BLOCKER for the user, not a coordinator decision.

## 7. Model routing

Concrete models live in `~/.omp/agent/config.yml` under `modelRoles`; this skill names only aliases. Pass the alias after `--` (`-- --model @implementation --thinking high`) — never a model family, fuzzy name, or provider id. Re-pointing a role is a config edit, not a skill edit.

| work | crew launch (after `--`) | `no crew` agent type |
|---|---|---|
| all implementation, fixes, refactors, debugging, migrations, validation runs | `--model @implementation --thinking high` | `task`, `sonic`, `code-simplifier` |
| research, docs, discovery, codebase synthesis (read-only) | `--model @research --thinking high` | `scout` |
| review of a plan, issue, decision, or implementation-vs-plan | `--model @review --thinking xhigh` | `reviewer`, `security-reviewer` |
| planning: every plan, re-plan, decomposition, task split (section 3); pair-planning (`/crewit plan`) | one `--model @plan --thinking high` agent in one tab | `plan` |
| merge-conflict resolution — only when the user explicitly asks | `--model @merge --thinking high` | `merge` |

- One model per role: no alternation between providers, no per-domain exceptions. PromQL, GitHub Actions, and terraform/HCL are implementation work like any other.
- Review workers are read-only and apply the `ponytail` lens (if that skill is missing, say "strict anti-overengineering review" inline). Never skipped silently.
- `@plan` is read-only and returns a substantive plan — phases, independent jobs, owned paths, acceptance criteria, risks — not a list of questions. It pressure-tests decisions live with the user before the plan returns to them and implements nothing. It is the only role that plans: the coordinator never drafts, splits, or amends a plan in its place. Plans go to `@review` before execution; execution and validation are `@implementation`.
- `@merge` is the only role that resolves merge/rebase conflicts, and only on the user's explicit request. Any other worker — implementation, validator, reviewer — that hits conflict markers or a conflicted merge/rebase stops with a BLOCKER; the coordinator reports it to the user and never resolves it or dispatches `@merge` unasked. `@merge` edits the working tree only; the user stages and commits.
- Route approved jobs by primary deliverable; domain beats file extension. Any proposed split goes back to `@plan`.
- The user may name an exact model for a job: pass exactly what they gave and record it in the registry next to the role.
- `no crew` dispatches name an agent type only; each agent already resolves its own role alias, so do not attach a model to a `task` dispatch. Use only agent names the task tool actually lists in this session — if one is missing, pick the closest listed agent in the same row, never a guessed name.

## 8. Supervision

Waiting is background, never a turn: every wake re-bills this whole context. Banned as ways to wait: `hub wait`, `sleep`/retry loops, repeated `herdr agent list/get/read` or `hub jobs` status checks, foreground `herdr agent wait`, `herdr agent prompt --wait`.

- Arm: after every prompt of the round has returned, ONE background watcher per worker via the bash tool, then a one-line status and end the turn:
  ```
  bash {"i": "Watching fix-auth", "command": "herdr agent wait fix-auth --timeout 3600000", "async": true, "timeout": 0}
  bash {"i": "Watching fix-pool", "command": "herdr agent wait fix-pool --timeout 3600000", "async": true, "timeout": 0}
  ```
  → `Crew running in tab 3 «authfix·P1·api» (wR:t3): fix-auth, fix-pool; watchers armed.` → end turn.
- Wake (a watcher finished), for that worker only:
  1. Read its absolute report file, bounded (first ~80 lines).
  2. Watcher reported `blocked`, a non-timeout error, or there is no report file → ONE `herdr agent read <name> --source recent-unwrapped --lines 120`. Non-timeout error → re-arm rule below. `blocked` (approval dialog): surface it to the user, never answer on the worker's behalf, then re-arm the transition watcher below so approval-then-completion wakes you. Idle with no report because it is awaiting its own background job → re-arm the transition watcher. Idle with no report otherwise → treat as a BLOCKER.
     Transition watcher (same async shape; timeout → step 3): `herdr agent wait <name> --until working --timeout 3600000 && herdr agent wait <name> --timeout 3600000`.
  3. Watcher timed out → step 1 still applies: a report file now present means the worker finished while the watcher was armed (e.g. it settled before `--until working` caught it), so handle that report. No report → ONE `herdr agent get <name>` to classify: `working` → re-arm the same watcher in the background and end the turn (at most one wake per hour per worker); anything else → step 2.
  4. Before this wake ends by any path — including step 3's re-arm-and-end-turn — sync the tab: if its state (section 5) differs from its label, one `herdr tab rename <tab_id> "<label>"` and update the Phase header (e.g. ` !` on a BLOCKER or approval dialog; a resumed worker's stale ` !` cleared). The wake report names the tab as `tab <number> «<label>» (<tab_id>)`.
- Re-arm rule: re-arm only after a genuine timeout (the watcher's own `--timeout` elapsed) of a worker that is still live, or after the transitions step 2 names. Any other watcher error (e.g. `{"error":{"code":"agent_not_found"}}` — the worker exited or crashed and Herdr dropped its name, so every new watcher fails at once) → classify once (the step 2 read, or one `herdr agent get`), report the exit or BLOCKER to the user, and never re-arm.
- Every arm returns a bash job id: record it in the row's `watcher job` column, replacing the previous one.
- Never stream whole transcripts into this context.

Rogue triggers: output referencing writes outside owned paths; a BLOCKER ignored or self-answered; repeated failing attempts (thrash); drifting from the assignment; touching that worker's protected baseline changes.

Rogue action, in order: `herdr agent send-keys <name> esc` immediately → its watcher (re-arm one if none is armed) reports it settled → verify quiescence via one bounded `agent read` → registry state `stopped` → pause jobs that depend on it → report evidence to the user → await an explicit decision. Healthy independent workers keep running.

## 9. Validation & phase gate

The coordinator assesses bounded evidence only: RESULT vs acceptance criteria, changed-path list vs owned scope, and the verdicts of the two workers below. It never re-reads implementations into this context, never patches them, and never runs the union build or suite itself — that is delegated work like any other.

Once the phase's writers are quiescent (every job `reported` or `stopped`, nothing `working`), dispatch both of these into new panes of the phase tab, in one round, no `--wait`, then arm their watchers (section 8) and end the turn:

1. `@implementation` union validator — the union of changed files across the phase: ownership violations (did anyone write outside its owned paths?), then the shared build/suite run ONCE on the union. Fixed assignment in section 6.
2. `@review` phase reviewer (section 7) — implementation-vs-plan on the same union, and never a worker reviewing its own output. Fixed assignment in section 6.

They are independent, so they run in parallel; acceptance needs both verdicts. Neither is auto-acceptance: a verdict is evidence the coordinator weighs against the acceptance criteria.

- Trivial, directly checkable result (a one-line config edit whose value is in the RESULT) → accept from the report, no validator, no reviewer.
- Rework after a rejected review or a failed union validation goes to an `@implementation` worker, in a new or the same job row. A rejected plan, or scope that no longer fits the plan, goes back to the `@plan` session (section 3).

Phase end: every job is `validated`, `stopped`, or `accepted`, and the validator and reviewer have reported → rename each phase tab ` ✓` or ` ✕` (section 5) → compact report to the user, naming each tab as `tab <number> «<label>» (<tab_id>)` (per job: outcome, changed files, deferred items, validator and `@review` verdicts, incidents) → STOP. The next phase spawns only on the user's explicit go-ahead. The user commits.

## 10. Cleanup

Only on user command. From the registry: confirm each agent is `idle` or `done` via `herdr agent list`, then `herdr tab close <tab>` for each phase tab listed (closing the tab closes all its panes). The ` ✓`/` ✕` labels make finished tabs obvious to the user; nothing closes automatically. Never close anything not in the registry; never the coordinator's tab or the workspace. Mark closed in the registry.

## 11. Red flags

- Starting an agent in the coordinator's pane, or creating workspaces instead of tabs.
- `prompt --wait` loops, or any other polling: `hub wait`, `sleep` loops, repeated `agent list/get/read` or `hub jobs`, foreground `herdr agent wait`.
- Reading full worker transcripts "to be safe".
- Answering a worker's approval dialog.
- Marking `stopped` because Esc was sent.
- Advancing a phase without the user.
- Closing tabs uninvited.
- Any worker or subagent in a different worktree, clone, or copy of the repo.
- Any git-mutating command, anywhere, by anyone.
- Hardcoding a model family or fuzzy model name in a launch instead of a role alias.
- A worker creating a pane, starting an agent, or spawning a subagent.
- A worker spawning a headless or one-shot probe (`omp -p`, another agent CLI, SDK/API call) to "test" the setup instead of handing the proposed launch back.
- Sending both execution-surface blocks, neither, or the wrong one — e.g. a `task` subagent told to write an absolute report file or to derive a session path from a local root it shares with the coordinator.
- A registry row carrying a session id nobody reported, or an unverified breadcrumb path recorded as if it were live.
- Identifying a session by `$TMUX_PANE`, by the newest cwd-matching breadcrumb, or by a breadcrumb target accepted because the file exists.
- Closing a phase without dispatching the union validator and the independent reviewer, or running that build/suite in the coordinator.
- The coordinator writing, decomposing, sequencing, or patching a plan itself instead of sending it to the `@plan` session.
- Dispatching a crew the user did not ask for.
- Anyone but a user-requested `@merge` job resolving a conflict — including the coordinator, or a worker "just picking a side" — or `@merge` dispatched without the user asking.
