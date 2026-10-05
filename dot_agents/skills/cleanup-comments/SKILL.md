---
name: cleanup-comments
description: Use when the user asks to clean up comments, simplify comments, or "explain WHY not WHAT" — typically right after writing or editing Rust, TypeScript, or YAML/CI code. Also use before handing off a change whose comments narrate what the code already says or tell a story.
---

# Cleanup Comments

Code says WHAT. Comments say WHY — in the fewest words that keep every fact. Rust, TypeScript, YAML/CI.

## Scope: this change only

Clean **only the comments in the code you wrote or edited in this session.** Untouched functions, files, and modules stay untouched — even if their comments are worse. Do not sweep the file. Do not sweep the repo. A cleanup diff that grows past your actual change is a bug.

## Delete

- Restates the line below or beside it — `// increment the counter`, `// return the result`
- Labels a declaration — `// helper fn`, `// the map`, `// Struct for config`
- Doc tags that repeat a typed signature — `@param`/`@returns` in TSDoc, `# Arguments` in rustdoc that just names the params
- Section banners, dividers, commented-out code, attribution

**Leave no residue.** Delete whole banners, not most of their lines. Never leave an empty `///`, `*`, or `#` line at the edge of a doc block you trimmed.

<Bad>
```rust
// ============================================================

///
/// # Safety
```
</Bad>

<Good>
```rust
/// # Safety
```
</Good>

## Condense

A WHY comment is a fact list, not a story. Keep the facts; delete the narrative: history of how the bug was found, incident numbers, timelines, "otherwise X would happen, that is how Y broke", reasoning the code line already implies, restated conclusions. Target one line, two at most.

<Bad>
```yaml
# A push to main and the daily schedule (or a manual run) otherwise both pass the
# gate before either has published a PR — that is how #2531 and #2532 were both
# opened 23 s apart. Queue instead of cancel: a started triage should finish.
```
</Bad>

<Good>
```yaml
# Cancel only in PRs; the rest queues so we do not create duplicate PRs.
```
</Good>

<Bad>
```yaml
# Merges of the bot's own triage PRs are skipped too — re-triaging a merge just
# opens another PR seconds later; the daily schedule is the catch-up path.
# The merge commit is authored by the bot (`github.actor` is the human who
# clicked merge, so it cannot be used here).
```
</Bad>

<Good>
```yaml
# Skip bot PR merges (would re-open a PR right away).
# head_commit.author is the bot; github.actor is the human who merged.
```
</Good>

Test per comment: strike each clause; if the next reader still knows why the code is this way, the clause goes.

## Keep unchanged

- The facts inside a WHY: the rejected option, the measurement, the constraint, the gotcha, the spec/issue link
- Rustdoc `# Safety`, `# Panics`, `# Errors` — these are API contracts, not prose
- `TODO`/`FIXME`, especially `TODO (LLM):` — verbatim, never reworded

Condensing must not drop a fact. Narrative is not a fact:

<Bad>
```rust
// sha1 is faster here.
```
</Bad>

<Good>
```rust
// sha1 not sha256: digest is truncated to 16 bytes anyway, and sha1 is ~2x
// faster on this hot path.
```
</Good>

## Never delete code with the comment

`self.map.remove(&k); // remove it` is a statement *and* a noise comment. Rewrite the line as its code; never delete the line.

Before you claim the code is untouched, re-read the edited region and confirm every statement that carried a trailing comment is still there, braces and commas included. Memory of the edit is not evidence.

## Writing one

One or two lines, at the surprise, no preamble, no story. `///` only where a reader needs the contract; `//` for the reason behind an implementation choice.

## Before yielding

Run the Condense test on every comment you added or edited this session, including ones you wrote as WHY. Your own comments are the most likely to be stories.
