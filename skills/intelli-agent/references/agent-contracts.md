# Agent Contracts

Every sub-agent spawned by the orchestrator MUST return a JSON object as its
final output — nothing else. No prose, no markdown fences, just raw JSON.

If an agent returns non-JSON, the orchestrator retries once with
"Reply with raw JSON only, no other text." appended. Two failures = treat as
`status: "blocked"`, write BLOCKED.md, stop that task.

---

## Base contract (all agents)

```json
{
  "task_id": "string — matches the DAG node id",
  "agent_id": "string — matches registry key e.g. research-agent",
  "status": "green | blocked",
  "output_file": "string — path written, e.g. plan/state/tasks/gather-T1.md",
  "output_type": "markdown_report | json | file | structured_analysis | markdown_document | review_result | plan_or_merged_file",
  "summary": "string — ≤200 chars describing what was produced",
  "confidence": 0.85,
  "tokens": { "in": 0, "out": 0 }
}
```

`tokens` is the agent's self-estimate of its own consumption: `in` = approximate
context tokens it received (its context_slice + any files read), `out` = approximate
tokens it generated (its output file + this done-signal). Estimate by ~4 chars/token
if no exact count is available. Omit only if genuinely unknown. The orchestrator copies
this onto the agent's `agents.json` card and adds it to the run-level `tokens` aggregate.

**Model tiering (P1a):** each agent's model tier is set in `agent-registry.json` (`model` field) and passed
via the Agent tool `model` param — cheaper models for worker agents, stronger for coordinator/analysis/
review. **Specialist personas (P6):** when the dispatcher injects a persona (see
`references/specialist-registry.md`) it prepends the persona body to the prompt — it does NOT change the
done-signal JSON contract above.

---

## Extended fields per agent type

### research-agent
```json
{
  "sources": [
    { "url": "string", "title": "string", "accessed": "ISO date" }
  ],
  "proxy_flags": ["field name if proxy/estimated data was used"]
}
```

### code-agent
```json
{
  "files_written": ["relative/path/to/file.ts"],
  "tests_written": 4,
  "tests_passing": 4,
  "iterations": 2,
  "self_review": {
    "blockers": 0,
    "suggestions": 1,
    "nits": 2
  }
}
```

### data-agent
```json
{
  "rows_processed": 1240,
  "nulls_flagged": ["field_a", "field_c"],
  "schema_violations": 0
}
```

### content-agent
```json
{
  "word_count": 847,
  "sections_written": ["executive-summary", "findings", "conclusion"]
}
```

### analysis-agent
```json
{
  "recommendation_count": 3,
  "scqa_format_used": true,
  "evidence_citations": 7
}
```

### review-agent
```json
{
  "pass": true,
  "score": 0.88,
  "issues": [
    {
      "severity": "blocker | suggestion | nit",
      "description": "string",
      "location": "optional — section or line reference"
    }
  ],
  "suggestions": ["string"]
}
```
Note: `status` on a review-agent is always `"green"` unless the review itself
could not run (e.g. output file missing). A failed review is expressed via
`pass: false` + `score < 0.70`, NOT via `status: "blocked"`.

### coordinator-agent (decompose mode)
```json
{
  "features_created": 3,
  "tasks_created": 11,
  "dag_nodes_written": true
}
```

### coordinator-agent (merge mode)
```json
{
  "sections_merged": ["draft-T9", "draft-T10", "draft-T11"],
  "coherence_issues": [],
  "final_output_file": "outputs/report.md"
}
```

---

## Failure signal

When a task cannot be completed after the bounded retry limit:

```json
{
  "task_id": "string",
  "agent_id": "string",
  "status": "blocked",
  "output_file": null,
  "output_type": null,
  "summary": "string — brief description of why it blocked",
  "confidence": 0.0,
  "blocked_reason": "string — specific failure description",
  "attempts": 3
}
```

A blocked task causes the orchestrator to write `BLOCKED.md` and surface it
on the dashboard. The task's DAG descendants are also marked blocked. Independent
tasks continue running.
