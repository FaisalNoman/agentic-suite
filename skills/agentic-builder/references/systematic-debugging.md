# AB — Systematic Debugging Protocol

Adapted from obra/superpowers `systematic-debugging` skill.
Load this file into the fix-agent context (Phase 7). Do not load for impl agents.

**Core premise:** Random fixes waste time, mask root causes, and introduce new bugs.
Guess-and-check is not debugging — it's gambling. This protocol replaces it.

---

## The Four Phases — MANDATORY ORDER

You MUST complete each phase before proceeding to the next.
**Phase 1 is a hard gate. You cannot propose any fix until Phase 1 is complete.**

---

### Phase 1 — Root Cause Investigation (GATE: no fix until done)

Goal: understand WHERE and WHY it breaks, not just WHAT the symptom is.

**Step 1 — Read the full error**
- Read the complete error message and stack trace. Don't skim.
- Identify: error type · file · line number · call chain above it.
- Seeing the symptom ≠ understanding the root cause. Keep reading.

**Step 2 — Reproduce it cleanly**
- Run ONLY the failing test in isolation: `{test_command} --testNamePattern "{test_id}"`.
- Confirm it fails consistently. Intermittent = timing/async bug (see phase 2).
- Note exact failure mode: assertion failure / exception / timeout / wrong value.

**Step 3 — Check recent changes**
- `git log --oneline -10` — what changed since last green?
- `git diff HEAD~1 -- {source_file}` — what exactly changed in the relevant file?
- Most bugs live in the delta. Start there.

**Step 4 — Trace the data flow (for multi-component failures)**
For each component boundary between the test entry point and the failure site:
- Log what data ENTERS the component
- Log what data EXITS the component
- Verify config/env propagation at each layer
- Check state at each layer

Run once to gather evidence showing WHERE it breaks.
Then analyze evidence to identify the failing component.
Then investigate that specific component — not all of them.

**Phase 1 is complete when you can state:**
> "The root cause is [X] because [evidence Y shows Z]."
> NOT: "I think it might be X" or "X looks suspicious."

**If you cannot reach a root cause statement after full investigation:**
Check `references/root-cause-tracing.md` for backward call-stack tracing technique.
95% of "no root cause found" cases are incomplete investigation — go deeper before declaring unknown.

---

### Phase 2 — Pattern Analysis

Goal: understand the category of bug so the fix targets the right layer.

**Classify the bug:**
- **Logic error** — wrong condition, off-by-one, incorrect algorithm
- **Contract violation** — caller passes wrong type/shape, callee returns wrong shape
- **State corruption** — shared state mutated by another agent's write (check isolated writes rule)
- **Timing/async** — race condition, missing await, SSE event ordering
- **Environment** — missing env var, wrong path, dependency version mismatch
- **Test bug** — test itself is wrong (the implementation is correct)

**Compare against a working example:**
- Find the nearest passing test that exercises similar code.
- What's different between the passing case and the failing case?
- That diff is usually the fix location.

**Async/timing bugs specifically:**
- Never use `setTimeout` / `sleep` as a fix — that's masking, not fixing.
- Use condition-based waiting: poll until state is ready, with a timeout + error.
- See `references/condition-based-waiting.md` for the pattern.

---

### Phase 3 — Hypothesis + Single Fix

Goal: one targeted fix that addresses the root cause, nothing else.

**Form ONE hypothesis:**
> "If I change [X] in [file], the test will pass because [root cause from Phase 1]."

**Rules for the fix:**
- Change ONLY the file identified in Phase 1 (matches context_slice rule for fix agents).
- No refactoring, renaming, or "while I'm here" improvements.
- No new exports or signature changes — those break other agents' outputs.
- Minimal change: the fewer lines changed, the easier to verify and revert.

**If your hypothesis is wrong after one attempt:**
Stop. Do not try another guess. Return to Phase 1 with the new evidence.
Three failed hypotheses = the architecture is wrong, not the implementation.
See Phase 4.5.

---

### Phase 4 — Verify and Confirm

Goal: prove the fix works without breaking anything else.

**Step 1 — Write or confirm the reproduction test**
The failing test IS the reproduction test. It must now pass.
If no test existed for this failure path, note it in your output — the orchestrator will flag it.

**Step 2 — Run the failing test**
`{test_command} --testNamePattern "{test_id}"` → must be GREEN.

**Step 3 — Run the full integration suite**
`{integration_command}` → must stay green. No new failures introduced.

**Step 4 — Report**
Output the JSON contract. Include `root_cause` field with your Phase 1 statement.
Do NOT mark `status: "done"` if integration tests introduced new failures — revert and report blocked.

---

### Phase 4.5 — Architecture Escalation (3+ failed hypotheses)

If you have made 3+ fix attempts and the test is still failing:

**STOP. Do not attempt more fixes.**

This is not a failed hypothesis. This is a wrong architecture.

Output:
```json
{
  "status": "blocked",
  "root_cause": "Architecture issue: [describe what's fundamentally wrong]",
  "failed_hypotheses": ["attempt 1: ...", "attempt 2: ...", "attempt 3: ..."],
  "recommendation": "Requires orchestrator decision: refactor [X] vs redesign [Y]",
  "files_changed": [],
  "tests_passing": false
}
```

The orchestrator surfaces this to the user. Never silently keep trying.

---

## Anti-patterns — when you see these, STOP and return to Phase 1

- Adding `try/catch` to suppress an error without understanding it
- Changing test expectations to match wrong output
- Adding `sleep()` / `setTimeout()` to fix timing issues
- Commenting out the failing assertion
- Adding a special-case `if` to paper over a symptom
- Fixing the same bug in multiple places (root cause is upstream)
- Changing more than one thing at a time

---

## Context slice for fix agents

Per `context-utils.md`, fix agents receive ONLY:
- Failing test output (last 100 lines)
- The specific source file that failed
- `interfaces.lock` for that task

The orchestrator must NOT pass PRD, FEATURES, passing test files, or other tasks' state.
Everything the fix agent needs to diagnose is in the error + source file + interfaces.
