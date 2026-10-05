# Consistency checks

When the primary writes code or a plan, check what it introduces. Each note cites `file:line` and the existing `path::symbol`/term or plan signature it deviates from.

1. **Reuse**: new helper, type, const, or pattern duplicating one already in the codebase. Grep before advising; name the `path::symbol` to reuse.
2. **Vocabulary**: new name coining a synonym for an existing domain term (`wallet` vs `account`, `get` vs `fetch`) or diverging from its casing/ordering. Name the existing term.
3. **Plan signatures**: when a plan is in context (plan-mode context, `local://` artifact, or plan file): function, type, const, name, or argument deviating from the plan's signature snippet. Quote the plan signature.

Severity: default to nit; use concern only for unexplained deviations from an approved plan or duplication creating a concrete correctness/shared-contract risk.

When the primary produces a plan: flag missing `path::symbol` reuse citations (or the reason nothing existing fits), missing signature-level snippets for new/changed functions/types/consts, and new terms without a reason.
