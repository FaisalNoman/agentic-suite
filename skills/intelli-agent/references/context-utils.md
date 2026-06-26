# Context Compression Utilities

Apply `context_slice` before constructing EVERY sub-agent prompt.
Never pass the full task description or all prior outputs to any agent.
Only the orchestrator reads everything.

---

## context_slice procedure

Before each Agent tool call, build the agent's context using this table ONLY.
Total assembled context must not exceed the agent's `context_budget_tokens`
from `agent-registry.json`.

Memory retrieval runs FIRST. Retrieved memory is injected before the task spec.
It is capped at `memory_budget_tokens` — never exceeds that even if retrieval
returns more. Truncate retrieved content to fit.

| Agent type | Include | Exclude |
|---|---|---|
| research-agent | Memory retrieval (≤800 tok) · task spec for THIS task only · research-agent.md prompt template | Other tasks' specs · analysis outputs · unrelated memory |
| code-agent | Memory retrieval (≤200 tok, architecture patterns only) · task spec · interfaces.lock if the module has one · code-agent.md prompt template | Other tasks · data files · content outputs |
| data-agent | Memory retrieval (≤200 tok, schema patterns only) · task spec · input schema description · data-agent.md prompt template | Other domain tasks · code files |
| content-agent | Memory retrieval (≤400 tok, style/structure only) · task spec · section outline if coordinator produced one · content-agent.md prompt template | Raw data files · analysis JSON · code files |
| analysis-agent | Memory retrieval (≤600 tok) · task spec · ALL prior task output files listed in task spec inputs · analysis-agent.md prompt template | Unrelated tasks · code files |
| review-agent | **No memory** · worker output file (full content) · review criteria file for this domain · task spec (acceptance criteria section only) | All other files · other tasks |
| coordinator-agent | Memory retrieval (≤400 tok) · full task description · domain classification result · agent roster · coordinator-agent.md prompt template | Individual task output files |

---

## Extraction rules

**Task specs:** Each task has a file at `plan/state/tasks/{FEAT}-tasks.json`.
Use `grep -A 20 '"id": "{task_id}"'` to extract only the relevant task entry.
Never pass the full tasks file to a build agent.

**Prior task outputs (for analysis-agent):** The task spec lists `inputs: [task_id, ...]`.
Read those output files. Summarise each to ≤500 tokens using the agent's done-signal
summary field if the full file would exceed budget. Feed the summary, not the raw file,
unless budget permits the full content.

**Review criteria file:** Select based on the domain of the task being reviewed:
- `research` or `data_processing` → `references/review-criteria/research.md`
- `analysis` → `references/review-criteria/analysis.md`
- `code` → `references/review-criteria/code.md`
- `content` or multi-domain → `references/review-criteria/default.md`

---

## PRIOR RUNS injection (cross-session memory, P2)

When `.agentic-builder/memory.json` exists (loaded at Stage 0), inject a keyword-filtered
`PRIOR_RUNS_CONTEXT` slice AFTER the per-agent context_slice — ONLY for `coordinator-agent` (prior
decisions + failures+fixes + glossary) and `analysis-agent`. Workers (`code`/`data`) may receive a single
prior failure+fix whose `file` matches their output; `research`/`content`/`review` get none. Never pass
the whole file. Separate from the chromadb vector retrieval above. See `references/cross-session-memory.md`.

## Specialist persona injection (P6)

After context_slice, if the specialist router (`references/specialist-registry.md`) matched a persona,
prepend its persona body to the agent prompt (before the task spec). It changes HOW the agent works, not
the output contract. None matched → plain generic agent.

## Dashboard logging

In the agent's dashboard `detail` field, log what was included and excluded:
```
"context: memory(412 tok) + task-spec(280 tok) + prompt-template(820 tok) | excluded: other tasks, prior outputs"
```

This makes context decisions visible and auditable on the dashboard.

---

## Token overflow handling

If assembled context exceeds `context_budget_tokens`:
1. First cut: reduce memory retrieval by 50%
2. Second cut: summarise the prompt template to its critical-rules section only
3. Third cut: summarise the task spec to acceptance criteria + output path only
4. If still over budget: log a warning in `agents.json` under `reasoning` and
   proceed with best-effort truncation. Do NOT abort the task.
