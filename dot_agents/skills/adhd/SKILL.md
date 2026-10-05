---
name: adhd
description: Low-noise, scannable terminal output for an ADHD reader. Use on /adhd, "adhd mode", or when the user says replies are hard to read or too dense. Stays on until /adhd off or "normal output".
---

# ADHD output mode

The reader loses the thread in dense text. Every reply: first line answers, structure carries the rest, nothing is there for ceremony. Existing terseness rules stay in force; this adds shape, not words.

## Scope

- Applies to chat replies only.
- Never reformat code, commands, quoted errors, JSON or other machine-readable output, or file contents. Those ship exactly as they must.
- Never omit requested deliverables, caveats, evidence or safety information to stay short.

## Mode

- On: `/adhd` or `/adhd on`. Off: `/adhd off` or "normal output". Confirm either in one line, then act.
- Active until explicitly turned off. Topic changes, tool-heavy turns and long sessions do not end it. A one-off format request applies to that reply only and does not cancel the mode.
- If unsure whether it is still on, it is.
- Any compaction or handoff summary you write must include the line `Output mode: adhd (skill://adhd)`. On resume from such a summary, reload the skill before replying: in OMP read `skill://adhd`; in Claude Code use the Skill tool or read `~/.claude/skills/adhd/SKILL.md`; elsewhere re-read this file.

## Rules

1. First line is the answer, result or decision. Never the question, never what you did to get there.
2. One topic per paragraph. Blank line between topics.
3. Bullets for parallel facts. Numbered lists for sequences and steps. Short prose for cause and effect.
4. Keep genuine uncertainty visible; do not flatten "probably" into "is".
5. Backticks on every path, command, symbol, flag, config key, error id. `src/auth.rs:42` beats "the auth file".
6. Descriptive headings are allowed on longer replies. A reply of a few lines gets none.
7. Status line only when a multi-step task made meaningful progress this reply: `Done: <what>. Next: <what>.` Add `Step N/M` only if the plan really has M steps; never invent totals.
8. Tool activity is silent unless it failed or changed the answer.
9. Errors and warnings first, plain: `where` - what - fix.
10. Bold at most one decisive phrase or warning per reply.
11. Tables only for small comparisons.
12. Nothing decorative: no openers, closers, recaps, emoji.
13. No medical claims about ADHD or the reader.

## Templates

The one-line answer always comes first, above any heading. Tiny replies use no headings at all.

Code change
```
<one-line result: what changed and whether it works>

## Changed
`src/auth.rs`
- Validates `aud`; duplicate expiry check removed.

## Tests
`cargo test auth` - 12 passed, 0 failed.

## Next
<one action, or omit the section>
```

Investigation
```
<one-line answer: the cause, or the fix status>

## Problem
<one line>

## Cause
<one line, with `file:line`>

## Fix
<applied, or proposed with the exact change>
```

Decision
```
Use `tokio::sync::watch`.

- <reason>
- <reason>

Rejected: `broadcast` - history is not needed.
```

## Precedence, highest first

1. Correctness.
2. Safety and warnings. Destructive or irreversible actions get one full plain sentence before anything else.
3. Required report fields (worker reports, harness formats) keep their fields; shape the content inside them.
4. Scannability.
5. Brevity.

<!-- Inspired by MIT-licensed ayghri/i-have-adhd and JuliusBrussee/caveman. -->
