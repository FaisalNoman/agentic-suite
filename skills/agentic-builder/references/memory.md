# AB — Cross-Session Project Memory (P2)

Persistent knowledge store written to `.agentic-builder/memory.json` at the project root; survives plan-dir deletion and spans runs.
**vs per-run cache** (`plan/state/agent-cache.json`): the cache starts cold each run and stores exact agent outputs for replay within one run; memory is cross-run, stores distilled decisions/failures, and provides a warm start for the *next* run.

---

## memory.json schema

```json
{
  "version": 1,
  "project": "mini-Minecraft (web)",
  "runs": [
    {
      "startedAt": "2026-06-15T00:00:00Z",
      "mode": "GREENFIELD",
      "summary": "Built data + api milestones. Vite+React, Vitest. 22 tasks, 21 green."
    }
  ],
  "milestones": {
    "data": {
      "built": ["voxelWorld.ts", "chunkStore.ts"],
      "decisions": [
        "Chose Uint8Array over Map for chunk storage — 40× faster fill benchmark"
      ],
      "failures": [
        {
          "symptom": "setBlock out-of-bounds on negative coords",
          "root_cause": "Missing Math.floor before modulo — JS % returns negative",
          "fix": "wrap(n, size) = ((n % size) + size) % size",
          "file": "src/world/voxelWorld.ts"
        }
      ],
      "files": ["src/world/voxelWorld.ts", "src/world/chunkStore.ts"]
    }
  },
  "glossary": {
    "chunk": "16×16×16 block region; primary unit of world storage"
  }
}
```

- `runs[]` — append-only log of run summaries (newest last).
- `milestones` — keyed by milestone id (matches `milestones.json`).
- `built[]` — short labels for what was implemented in that milestone.
- `decisions[]` — plain-text rationale strings (why, not what).
- `failures[]` — resolved issues only; each entry has `symptom`, `root_cause`, `fix`, `file`.
- `files[]` — canonical source paths owned by that milestone.
- `glossary` — domain terms that the planner established (optional; carry forward).

---

## Write points

Never blind-overwrite — always **append or merge** into existing entries.

| Trigger | Action |
|---|---|
| `commit-{M}` completes (Phase 6) | Merge `built`, `decisions`, `files` into `milestones[M]`. Preserve prior values. |
| Fix agent resolves a failure | Append one `failures[]` entry (symptom / root_cause / fix / file) under the task's milestone. Only write on resolution, not on attempt. |
| Phase 9 (finishing) | Append one entry to `runs[]`: `startedAt`, `mode`, `summary` (one sentence). |

Write rule: read the file, merge in memory (JS object spread / Python dict update), write back atomically (temp-file rename or single Write call).

---

## Load + keyword retrieval

**Stage 0** — after preflight state files are initialized, before the planner runs:

1. Check for `.agentic-builder/memory.json` at the project root. If absent, skip silently.
2. Build a **keyword set** from the new run's features/task domains: tokenize feature names, milestone ids, and the user's original prompt (lowercase, split on whitespace/punctuation, drop stop words).
3. For each milestone entry in `memory.milestones`, score it by token overlap against the keyword set:
   - Score = count of keyword tokens that appear (case-insensitive) in the milestone's `id` + `built[]` + `decisions[]` joined text.
4. Sort descending by score. Take top-K = 3 milestones (or fewer if total < 3).
5. Apply a **token budget**: cap extracted text to ~800 tokens total across selected milestones. Truncate `decisions[]` first (keep first 2 per milestone), then `failures[]` (keep most recent 2 per milestone).
6. Store the filtered slice in orchestrator working memory as `PRIOR_RUNS_CONTEXT`. Also note `memory.glossary` (always included in full — it is small).

No embeddings, no HNSW, no semantic model. Token overlap only.

---

## Injection (context_slice addendum)

Extends the table in `context-utils.md`. Apply **after** the normal context_slice rules.

| Agent type | PRIOR RUNS injection |
|---|---|
| `planner` | Inject full `PRIOR_RUNS_CONTEXT`: relevant milestones' `decisions[]` + `failures[]` (symptom+fix only) + `glossary`. Label the block `## PRIOR RUNS`. |
| `architect` | Same as planner. Omit `failures[]` entries whose `file` is unrelated to this module. |
| `impl` | Inject **only** a `failures[]` entry whose `file` exactly matches the task's owned file. One entry max. Label `## PRIOR FAILURE`. Omit if no match. |
| `fix` | Same as `impl` — match on `file`. If matched, prepend the prior fix as a hint before the failing test output. |
| `tdd` | **No injection.** Keep TDD agents lean; prior failures are irrelevant to spec authoring. |
| `integration`, `spec-review`, `quality-review` | **No injection.** |

Never pass `memory.json` in full to any agent. Never inject `runs[]` raw — the planner summary is enough.

Dashboard `detail` field: log injection like
`"context: data-decisions(2) + voxelWorld-failure (PRIOR RUNS injected)"`.

---

## Size + hygiene

- **Max file size**: 64 KB. If exceeded, prune `runs[]` from the oldest end (keep ≥ 5 most recent runs).
- **Max `failures[]` per milestone**: 20 entries. Evict oldest when exceeded.
- **Max `decisions[]` per milestone**: 15 entries. Evict oldest when exceeded.
- Keep the file **human-readable** — 2-space indent, no minification.
- `.agentic-builder/` directory: create it on first write if absent.
- **Version field**: if `version` is missing or < 1 on load, treat file as corrupt and skip (do not crash).
- **Git**: add a note in Phase 9 output suggesting the user either commit `.agentic-builder/memory.json` (to share memory across machines/teammates) or add it to `.gitignore` (to keep it local). Default recommendation: commit it.
