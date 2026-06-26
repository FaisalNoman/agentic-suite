# AB — Agent Output Contracts

Every agent prompt MUST end with the OUTPUT CONTRACT block for its type.
The orchestrator parses agent responses as JSON only — no regex, no line scanning.

## How to append to agent prompts

At the end of every agent prompt in phases.md, append:

```
--- OUTPUT CONTRACT ---
Respond with ONLY a valid JSON object matching the schema below.
No preamble. No explanation. No markdown fences. Raw JSON only.
A response that is not valid JSON will be treated as failure → one retry.
Schema: {SCHEMA_FOR_THIS_AGENT_TYPE}
```

## Schemas by agent type

**architect:**
```json
{
  "status": "done | blocked",
  "interfaces_file": "<path written>",
  "types_defined": ["TypeName"],
  "dependencies_required": ["package@version"],
  "notes": "<only if blocked or ambiguous, else omit>"
}
```

**tdd:**
```json
{
  "status": "done | blocked",
  "test_file": "<path written>",
  "test_count": 0,
  "all_failing": true,
  "failing_count": 0,
  "notes": "<optional>"
}
```

**impl:**
```json
{
  "status": "done | blocked",
  "files_written": ["<path>"],
  "tests_passing": true,
  "lint_clean": true,
  "fix_iterations": 0,
  "notes": "<optional>"
}
```

**fix:**
```json
{
  "status": "done | blocked",
  "root_cause": "<Phase 1 statement: the root cause is X because evidence Y>",
  "fix_description": "<what was changed and why it addresses the root cause>",
  "files_changed": ["<path>"],
  "tests_passing": true,
  "integration_passing": true,
  "lint_clean": true,
  "fix_iterations": 0,
  "failed_hypotheses": ["<only if blocked>"],
  "notes": "<optional>"
}
```

**spec-review (Stage 1):**
```json
{
  "status": "pass | fail",
  "milestone_id": "<milestone_id>",
  "criteria_checked": 0,
  "missing": [{ "feature_id": "FEAT-001", "criterion": "...", "evidence": "not found in diff" }],
  "untested": [{ "feature_id": "FEAT-001", "criterion": "...", "evidence": "no test covers X" }],
  "extra": [{ "file": "src/...", "description": "built X which was not in spec" }],
  "verdict": "pass — all criteria met and tested | fail — see missing/untested above"
}
```

**quality-review (Stage 2):**
```json
{
  "status": "done",
  "milestone_id": "<milestone_id>",
  "findings": [
    { "severity": "critical | important | minor", "file": "<path>", "note": "<specific issue>" }
  ],
  "strengths": ["<what was done well>"],
  "recommendation": "commit | fix-before-commit | block"
}
```

## Retry rule (add to SKILL.md operating rules)

If JSON parsing fails on an agent's response:
1. Retry once: append to the same prompt
   `"Your response was not valid JSON. Reply with raw JSON only, no other text."`
2. If it fails again: treat as agent failure → enter fix loop (or blocked).
3. Never attempt line-by-line parsing or regex on agent output.

## Model tiering (per-role registry — cost control, P1a)

Pass an explicit `model` to the Agent tool per role so cheap work runs on cheap models and only
reasoning-heavy roles use the top tier. Default registry (override per project; a role absent here
inherits the session model):

| Role | Model tier | Why |
|------|-----------|-----|
| planner / architect | top (opus / sonnet) | global DAG + interface design drive everything downstream |
| spec-review / quality-review | sonnet+ | review is the gate before commit |
| fix | sonnet | root-cause debugging needs reasoning |
| tdd | sonnet or haiku | test authoring from clear acceptance criteria |
| impl (worker) | haiku | bounded, spec'd, test-guided edits — the bulk of agents; cheapest tier ≈ 3× worker-cost drop on large runs |

Set via the Agent tool `model` param at dispatch. Spend tracking + soft caps live in
`references/budget.md`. Specialist personas (P6) are injected into the prompt body, not the
`subagent_type`, and do NOT change the JSON output contract — see `references/agent-registry.md`.
