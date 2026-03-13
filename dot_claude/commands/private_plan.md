---
description: Plan a task with strict phase-based workflow
argument-hint: [task-description]
model: opus
---

Plan: $ARGUMENTS

Execute the planner agent's STRICT 5-phase workflow:

**Phase 1: RESEARCH** — Spawn 2-3 parallel subagents. Use context7 MCP. Understand fully. No proposals yet.
**Phase 2: PROJECT SETUP** — Create folder + draft overview. Get approval.
**Phase 3: TASK REFINEMENT** — Each task approved individually in loop.
**Phase 4: RECONCILIATION** — Check cascading changes. Fix with approval.
**Phase 5: FINALIZE** — Lock in final overview with approval.

MANDATORY TOOLS (use in EVERY phase):
- **context7 MCP** — For ALL dependency, library, API research
- **Parallel subagents** — Spawn 2-3 to research different aspects simultaneously

CRITICAL:
- State current phase in EVERY response
- Get explicit approval at EVERY gate
- Write task files ONLY after individual approval
- NEVER skip phases or batch approvals
- NEVER proceed without using context7 AND parallel subagents
