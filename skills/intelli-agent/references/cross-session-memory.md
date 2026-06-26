# Cross-Session Shared Memory (P2)

Persistent keyword-retrieved store written to `.agentic-builder/memory.json` at the project root.
Survives `plan/` deletion. Shared schema with the agentic-builder skill — both read and write the same file, enabling warm-starts across runs and across tools.

**vs per-run state** (`plan/state/`): per-run state is cold each run and stores full agent outputs for replay within one run; this layer is cross-run, stores distilled decisions/failures/glossary, and provides a warm start for the *next* run.

---

## memory.json schema

```json
{
  "version": 1,
  "project": "market-sizing report",
  "runs": [
    {
      "startedAt": "2026-06-15T09:00:00Z",
      "mode": "research",
      "summary": "Completed TAM/SAM/SOM analysis for EV fleet sector. 4 tasks, all green."
    }
  ],
  "milestones": {
    "data": {
      "built": ["ev-fleet-dataset.json", "cagr-model.json"],
      "decisions": [
        "Used IEA 2024 fleet data over BloombergNEF — free tier sufficient for TAM"
      ],
      "failures": [
        {
          "symptom": "CAGR formula returned NaN for markets with zero base-year value",
          "root_cause": "Division by zero when base_year_units = 0 in emerging segments",
          "fix": "Guard: if base == 0 use linear delta instead of CAGR ratio",
          "file": "outputs/data/cagr-model.json"
        }
      ],
      "files": ["outputs/data/ev-fleet-dataset.json", "outputs/data/cagr-model.json"]
    }
  },
  "glossary": {
    "TAM": "Total Addressable Market — full revenue opportunity at 100% market share",
    "SAM": "Serviceable Addressable Market — subset reachable by current offering"
  }
}
```

- `runs[]` — append-only log; newest last.
- `milestones` — keyed by milestone id (matches the run's task decomposition).
- `built[]` — short labels for outputs produced in that milestone.
- `decisions[]` — rationale strings (why, not what).
- `failures[]` — resolved issues only; fields: `symptom`, `root_cause`, `fix`, `file`.
- `files[]` — canonical output paths owned by that milestone.
- `glossary` — domain terms the coordinator established (carry forward across runs).

---

## Write points

Never blind-overwrite — always **append or merge** into existing entries.

| Trigger | Action |
|---|---|
| Milestone completes (all tasks green) | Merge `built`, `decisions`, `files` into `milestones[M]`. Preserve prior values. |
| A task resolves a failure | Append one `failures[]` entry under the task's milestone. Write on resolution only, not on attempt. |
| End of run (finishing phase) | Append one entry to `runs[]`: `startedAt`, `mode`, `summary` (one sentence). |

Write rule: read the file → merge in memory (dict update / object spread) → write back atomically (single Write call or temp-file rename).

---

## Load + keyword retrieval

**Stage 0** — after preflight state is initialized, before the coordinator-agent plans:

1. Check for `.agentic-builder/memory.json` at the project root. If absent, skip silently.
2. If `version` is missing or `< 1`, treat file as corrupt — skip, do not crash.
3. Build a **keyword set** from the new run: tokenize the user's original prompt + task domains (lowercase, split on whitespace/punctuation, drop stop words).
4. Score each milestone entry by token overlap against the keyword set:
   - Score = count of keyword tokens that appear (case-insensitive) in `id` + `built[]` + `decisions[]` joined text.
5. Sort descending. Take top-K = 3 milestones (or fewer if total < 3).
6. Apply **token budget**: cap extracted text to ~800 tokens total. Truncate `decisions[]` first (keep first 2 per milestone), then `failures[]` (keep most recent 2 per milestone).
7. Store the filtered slice as `PRIOR_RUNS_CONTEXT` in orchestrator working memory. Include `memory.glossary` in full (it is small).

No embeddings, no HNSW, no semantic model. Token overlap only.

---

## Injection (context_slice addendum)

Extends the table in `context-utils.md`. Apply **after** normal context_slice rules. Memory retrieval still runs first per the existing procedure; this layer is injected as a separate labelled block.

| Agent type | PRIOR RUNS injection |
|---|---|
| `coordinator-agent` | Inject full `PRIOR_RUNS_CONTEXT`: relevant milestones' `decisions[]` + `failures[]` (symptom+fix only) + `glossary`. Label block `## PRIOR RUNS`. |
| `analysis-agent` | Inject relevant milestones' `decisions[]` + `failures[]` (symptom+fix). Omit `failures[]` whose `file` is unrelated to the current analysis domain. Label block `## PRIOR RUNS`. |
| `code-agent` | Inject **only** a `failures[]` entry whose `file` exactly matches the task's output file. One entry max. Label `## PRIOR FAILURE`. Omit if no match. |
| `data-agent` | Same as `code-agent` — match on `file`. One entry max. Omit if no match. |
| `research-agent` | **No injection.** Keep research agents lean and unbiased. |
| `content-agent` | **No injection.** |
| `review-agent` | **No injection.** Must judge fresh — never biased by prior runs. |

Never pass `memory.json` in full to any agent. Never inject `runs[]` raw — the coordinator summary is enough context.

Dashboard `detail` field: log injection like  
`"context: data-decisions(2) + cagr-failure (PRIOR RUNS injected)"`.

---

## vs the chromadb vector layer

Both layers can run simultaneously; they serve different purposes.

| Dimension | chromadb vector layer (`memory-policy.md`) | This keyword layer |
|---|---|---|
| **Retrieval** | Semantic cosine similarity via embeddings | Token overlap — no model required |
| **Scope** | This project's runs only (`ia_{project_slug}` namespace) | Portable — shared with agentic-builder, any project at that root |
| **Storage** | `plan/state/memory/` (deleted on plan-dir purge) | `.agentic-builder/memory.json` (survives plan-dir deletion) |
| **Content** | Full agent summaries, any agent type | Distilled decisions, failures, glossary — coordinator + analysis focus |
| **Token budget** | Per-agent caps (200–800 tok, 0 for review-agent) | ~800 tok total across top-3 milestones |
| **Human-readable** | No (binary embeddings) | Yes — 2-space JSON, commitable to git |
| **Shared across tools** | No — intelli-agent only | Yes — same file/schema as agentic-builder |
| **When unavailable** | `caps.memory=false` → all agents get 0 tok silently | File absent → skip silently, no impact on run |

**If chromadb is off** (`caps.memory = false`): the vector layer is skipped entirely, but this keyword layer still loads and injects normally — the two are independent. Both running together is the richest configuration.

---

## Size + hygiene

- **Max file size**: 64 KB. If exceeded, prune `runs[]` from the oldest end (keep ≥ 5 most recent).
- **Max `failures[]` per milestone**: 20 entries. Evict oldest when exceeded.
- **Max `decisions[]` per milestone**: 15 entries. Evict oldest when exceeded.
- Keep the file **human-readable** — 2-space indent, no minification.
- `.agentic-builder/` directory: create on first write if absent.
- **Git**: at end of run, suggest the user either commit `.agentic-builder/memory.json` (share across machines/teammates) or add it to `.gitignore` (keep local). Default recommendation: commit it.
