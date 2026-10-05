---
name: onebyone
description: Use when the user invokes /onebyone, requests a one-at-a-time discussion of findings or ideas, or resumes that discussion after compaction.
---

# One by one

Help the user discuss one topic at a time without losing the larger goal or any items.

## Start or resume

Read `local://onebyone.md` first. If it exists, resume the saved topic; do not rebuild or reset the list.

Otherwise, collect all relevant findings, comments, questions, or plan points from the available conversation. Group closely related items before numbering, preserving every underlying point and its evidence. If the scope is unclear or information is missing, ask one focused question rather than guessing.

Save the full list before presenting the first topic. Do not dump the list into chat.

## Present and discuss

Use this structure, omitting fields that add nothing:

```text
### 5/12 — Topic title
Point: What we are discussing.
Context: Relevant evidence, reasoning, or uncertainty.
Why it matters: How this affects the main goal.
To discuss: The question or decision for this topic.
Related: Other item numbers, with a short explanation if useful.
```

Present only the current topic, then wait. Answer follow-up questions clearly and record corrections without advancing. Keep the current progress heading during the discussion. Reviewing or agreeing with an idea does not authorize implementation.

| User intent | Action |
|---|---|
| Next / continue | Mark current topic discussed; advance to the next pending topic, then any needing revisit |
| Question / correction | Stay on this topic; answer and update the notes |
| Back / jump to N | Move to that item without changing other items' status |
| Skip / later | Mark deferred, not deleted; move on |
| Pause / stop | Save the position and leave this mode |
| Resume / `/onebyone` | Read the saved record and continue there |

Keep item numbers stable. Progress is the current item's number out of the total, not a completed count. Append new topics and announce the new total. Record changed decisions and their reasons; flag affected earlier topics for revisit. Do not silently drop or renumber items.

When no pending or revisit items remain, report that the pass is finished and identify any deferred or unresolved item numbers. Do not call them resolved.

## Keep a durable record

Use one file: `local://onebyone.md`. It must contain:

- The session's main goal, scope, and what work resumes after this discussion.
- Whether the review is active, paused, or finished; the current item and total.
- Every numbered topic, including constituent points, details, sources, and uncertainty—not just titles.
- Each item's status: pending, discussed, deferred, or revisit.
- Decisions, user corrections, why decisions changed, open questions, and related item numbers.
- A short resume instruction: read this file and continue the current topic without advancing automatically.

Save updates before replying or navigating. If saving fails, say so; do not claim the notes or progress were saved. Discussion notes may be edited; unrelated work requires the user's request.

`local://` is stored with the current OMP session and survives compaction and resuming that session. After compaction, read the file before continuing; `/onebyone` resumes it. Include its path, the main goal, and current item in any compaction handoff. Do not rely on memory or a last-minute automatic snapshot.

A new session does not share this record: resume the original session or use a record the user supplies. Never guess another session's file. If explicitly starting a new review in the same session, archive the old file under a unique `local://` name first. In `--no-session` runs, warn that storage is temporary.
