# AB — Two-Stage Code Review Protocol

Adapted from obra/superpowers `requesting-code-review` + `receiving-code-review` +
`subagent-driven-development` skills.

Load this file for the orchestrator when dispatching review agents (Phase 8).
The impl agent's self-review checklist is at the bottom — embed it in Phase 5 prompts.

---

## Why two stages, not one

A single "review" pass forces the reviewer to hold spec compliance AND code quality
in mind simultaneously. In practice one always dominates and the other gets skipped.

- **Stage 1 (Spec Compliance)** — Did we build the right thing?
- **Stage 2 (Code Quality)** — Did we build it well?

Stage 2 only runs if Stage 1 passes. A spec-incomplete implementation with clean code
is still wrong. Don't polish the wrong thing.

---

## Stage 1 — Spec Compliance Review Agent

**Dispatch:** one agent per milestone (the `review-{M}` node), after that milestone's gate is green.
**Context:** git diff for this milestone only · FEATURES.txt acceptance criteria for milestone features · task specs.
**Do NOT include:** full file contents, other milestones, PRD.

### Prompt template

```
You are a spec compliance reviewer. Your job is skeptical verification — not helpfulness.
Do not trust the implementer's report. Read the actual code.

Milestone: {milestone_id}
Features reviewed: {feature_ids}

Read: git diff for milestone {milestone_id}'s files (its changeset)
Read: FEATURES.txt sections for {feature_ids} — focus on acceptance_criteria only.
Read: plan/state/tasks/*-tasks.json for milestone {milestone_id}'s features — the task specs.

For each acceptance criterion in each feature, answer:
1. Is it implemented? (find the exact code that satisfies it — not inferred, found)
2. Is it tested? (find the test that covers it — not assumed, found)
3. Is anything extra built that wasn't asked for? (over-building is a spec violation too)

Flag MISSING (criterion not implemented), UNTESTED (implemented but no test), and
EXTRA (built something not in spec). Do not flag code style issues — that's Stage 2.

--- OUTPUT CONTRACT ---
Respond with ONLY a valid JSON object. No preamble. No markdown. Raw JSON only.
{
  "status": "pass | fail",
  "milestone_id": "{milestone_id}",
  "criteria_checked": 0,
  "missing": [{ "feature_id": "FEAT-001", "criterion": "...", "evidence": "not found in diff" }],
  "untested": [{ "feature_id": "FEAT-001", "criterion": "...", "evidence": "no test covers X" }],
  "extra": [{ "file": "src/...", "description": "added X which was not in spec" }],
  "verdict": "pass — all criteria met and tested | fail — see missing/untested above"
}
```

**Orchestrator action on Stage 1 result:**
- `pass` → dispatch Stage 2 immediately.
- `fail` → dispatch a targeted impl agent to fix ONLY the missing/untested criteria.
  Use the same fix-loop bound (max 3 rounds) then escalate to user.
  Do NOT proceed to Stage 2 until Stage 1 passes.

---

## Stage 2 — Code Quality Review Agent

**Dispatch:** only after Stage 1 passes.
**Context:** git diff for this milestone · ARCHITECTURE.md module boundary section for milestone domains ·
**UI milestones: `plan/docs/DESIGN-SYSTEM.md` accessibility + anti-pattern checklist (if it exists)**.
**Do NOT include:** PRD, full file contents, passing test files.

### Prompt template

```
You are a code quality reviewer. Stage 1 (spec compliance) has already passed.
Your job: verify the implementation is clean, maintainable, and correctly decomposed.

Read: git diff for milestone {milestone_id}'s files (its changeset)
Read: plan/docs/ARCHITECTURE.md — module boundary section for domains: {domains}

Evaluate these areas and categorize every finding as Critical / Important / Minor:

**Structure:**
- Does each file have ONE clear responsibility?
- Are units decomposed so they can be understood and tested independently?
- Does the implementation follow the file structure from the task specs?
- Did any file grow unreasonably large (>300 lines)? Was a new file added that's already too large?

**Code quality:**
- Clean separation of concerns?
- Proper error handling — are error types from interfaces.lock used correctly?
- Type safety maintained throughout?
- DRY without premature abstraction (don't abstract things used only once)?
- Edge cases handled per the acceptance criteria?

**Architecture:**
- Integrates cleanly with the existing module boundaries in ARCHITECTURE.md?
- No circular dependencies introduced?
- No unnecessary coupling between domains?

**Testing:**
- Tests verify real behavior, not implementation details?
- Tests don't mock what they're supposed to test?
- Edge cases from acceptance criteria are covered?

**Accessibility & design-system compliance (UI milestones ONLY — run only if plan/docs/DESIGN-SYSTEM.md was provided):**
- Does the UI follow the design system's tokens (colors, typography, spacing, motion)? Flag drift.
- Are the design system's anti-patterns avoided?
- Accessibility checklist from DESIGN-SYSTEM.md: WCAG AA contrast, keyboard navigation, focus states,
  reduced-motion support, semantic markup / labels. Flag each unmet item (severity: important).
- Skip this whole block for non-UI milestones (no DESIGN-SYSTEM.md, or backend/logic only).

**Out of scope — do NOT review these:**
- Formatting, style, import order, naming-case, line length, lint rules — a **lint gate already passed**
  before this review. Do not itemize lint-class issues. (If the code is genuinely messy in a way a
  linter wouldn't catch, that's a real structural finding — flag THAT, not the formatting.)

**Calibration:**
- Not everything is Critical. Be accurate, not alarming.
- Acknowledge what was done well — accurate praise helps the implementer trust the rest.
- If you find significant deviations from ARCHITECTURE.md, flag them specifically.

--- OUTPUT CONTRACT ---
Respond with ONLY a valid JSON object. No preamble. No markdown. Raw JSON only.
{
  "status": "done",
  "milestone_id": "{milestone_id}",
  "findings": [
    { "severity": "critical | important | minor", "file": "<path>", "note": "<specific issue>" }
  ],
  "strengths": ["<what was done well>"],
  "recommendation": "commit | fix-before-commit | block"
}
```

**Orchestrator action on Stage 2 result:**
- `commit` → proceed with git commit, advance milestone to done.
- `fix-before-commit` → dispatch surgical fix agents for `critical` + `important` findings only.
  Minor findings → log in milestone summary, do not block commit.
  After fixes, re-run integration gate (not full review cycle).
- `block` → surface to user with full findings. Do not commit. Do not auto-fix.

---

## Impl agent self-review (embed in Phase 5 prompt)

Before returning your output JSON, run this checklist yourself:

```
SELF-REVIEW (do this before writing your output JSON):
□ Does my implementation match the interfaces.lock exactly? (no new exports, no signature changes)
□ Do all tests pass? (run the test command — don't assume)
□ Is my file lint-clean? (ran lint:fix then lint — no remaining errors, no disabled rules)
□ Did I touch only MY assigned file? (no writes to other agents' files)
□ Is error handling present for every error type in interfaces.lock?
□ Would a new developer reading this file understand it without context from other files?
□ Did I add anything not asked for in the task spec? (if yes, remove it)

Only mark status: "done" if all boxes are checked.
If any box fails, fix it first.
```

---

## Receiving review feedback (embed in impl agent fix prompt when Stage 1/2 findings come back)

When the orchestrator dispatches you with review findings:

1. **Read every finding** — don't skim, don't dismiss.
2. **Address Critical and Important findings only** — don't gold-plate Minor findings.
3. **For each Critical/Important finding:**
   - Understand it before changing anything (apply systematic-debugging.md Phase 1 mindset).
   - Make the minimal change that addresses it.
   - Do not refactor anything else while fixing.
4. **Disagree with a finding?** Output it in your `notes` field with your reasoning.
   The orchestrator surfaces it. Never silently ignore a finding.
5. **Run tests after every fix** — confirm you haven't broken the passing suite.
