---
description: Process feedback and create followup tasks
argument-hint: [feedback/changes]
model: opus
---

Refactor $ARGUMENTS

Use the refactor agent. Requirements:
- Parse input into discrete change requests
- Use context7 MCP for ALL library/service documentation
- Spawn parallel subagents to research related change clusters
- Auto-detect project from context, ask if ambiguous
- Only touch files within target project scope
- Create followup tasks in `./tasks/<project>/NN.task-name.followup.md`
- No new dependencies unless explicitly approved
