# agentic-worker — Runtime file-ownership conflict prevention

Prevents two parallel agents from clobbering the same file by blocking overlapping write-sets at dispatch time — no OS/file locks, pure scheduling.

## The `writes` field

Every task entry in `plan/state/tasks/{FEAT}-tasks.json` declares the paths it may write:

```json
{
  "id": "analyze-T6",
  "scheduler_role": "analyze",
  "milestone": "m2",
  "writes": ["plan/output/analysis/**", "plan/output/summary.md"],
  "inputs": ["plan/state/tasks/gather-T1.md", "plan/state/tasks/gather-T2.md"]
}
```

Glob rules:
- Directory globs (`plan/output/analysis/**`) for tasks that own a whole folder.
- Exact paths (`plan/output/summary.md`) for shared files the task edits.
- When two tasks share a file, planner assigns ownership to one and makes it a dep for the other.
- `writes` is derived from the task description — every file the task creates or modifies.

## Glob-overlap test

Two tasks conflict if any glob in set A could match a path that any glob in B could also match.
Conservative: when uncertain, treat as conflict.

```
def globs_overlap(A: list[str], B: list[str]) -> bool:
  for ga in A:
    for gb in B:
      if glob_pair_conflicts(ga, gb):
        return True
  return False

def glob_pair_conflicts(ga: str, gb: str) -> bool:
  # Case 1: identical strings
  if ga == gb: return True
  # Case 2: one is a concrete path matchable by the other's pattern
  if matches(ga, gb) or matches(gb, ga): return True
  # Case 3: shared directory prefix — one subtree subsumes the other
  pa = strip_glob_suffix(ga)   # "plan/output/analysis/**" → "plan/output/analysis"
  pb = strip_glob_suffix(gb)
  if pa == pb: return True
  if pa.startswith(pb + "/") or pb.startswith(pa + "/"): return True
  return False

# matches(pattern, path): standard minimatch/micromatch semantics
# strip_glob_suffix: remove trailing "/**" or "/*" to get directory prefix
```

Examples:
- `plan/output/analysis/**` vs `plan/output/analysis/gaps.md` → conflict (prefix subsumes concrete path)
- `plan/output/summary.md` vs `plan/output/summary.md` → conflict (identical)
- `plan/output/analysis/**` vs `plan/output/report/**` → no conflict

## FILL SLOTS dispatch gate

Slots into scheduler.md's **FILL SLOTS** step (loop step 2), before moving nodes into `in_flight`:

```
FILL SLOTS:
  slots      = max_concurrent - len(in_flight)
  candidates = ready_queue[:slots * 2]   # oversample; filter below

  claimed      = union of tasks[n]["writes"] for n in in_flight  # in_flight write-sets

  dispatch_batch = []
  batch_writes   = []   # writes claimed within this wave

  for node in candidates:
    node_writes = tasks[node].get("writes", [])
    if globs_overlap(node_writes, claimed):
      continue   # conflicts with in_flight — stays in ready_queue
    if globs_overlap(node_writes, batch_writes):
      continue   # conflicts with sibling picked this wave — stays in ready_queue
    dispatch_batch.append(node)
    batch_writes.extend(node_writes)
    if len(dispatch_batch) == slots:
      break

  for node in dispatch_batch:
    ready_queue.remove(node)

  Move dispatch_batch → in_flight
  Write locks.json  (add claims for dispatch_batch)
  Save framework-state.json; update agents.json (status: "working" per card)
  Emit ALL dispatch_batch Agent tool calls in ONE message   ← mandatory
```

Deferred nodes (skipped for write conflict) remain in `ready_queue` and are reconsidered on the next loop iteration after a blocking task completes.

## locks.json

Live write-claim registry. Path: `plan/state/locks.json`. Source of truth for the dashboard.

```json
{
  "claims": [
    {
      "node": "analyze-T6",
      "writes": ["plan/output/analysis/**", "plan/output/summary.md"],
      "since": "2026-06-27T00:00:00.000Z"
    }
  ]
}
```

Lifecycle:
- **Claimed:** node moves `ready_queue → in_flight` at FILL SLOTS.
- **Released:** node moves to `done_set` or `blocked_set` at PROCESS RETURNS.
- **Resume:** regenerate from `scheduler.in_flight` — interrupted tasks re-claim their writes.

## Dashboard surfacing

After every `locks.json` write, the orchestrator mirrors active claims into `agents.json`:

```json
{
  "locks": [
    { "node": "analyze-T6", "writes": ["plan/output/analysis/**", "plan/output/summary.md"] }
  ]
}
```

Render as a "File Ownership" panel or per-node card annotation (agentic-worker uses the same dashboard as agentic-app-builder). When `locks` is absent or empty, suppress the UI.

## Acceptance — conflict-injection test

Craft two tasks with a shared write target and no deps:

```json
[
  { "id": "draft-T9",  "scheduler_role": "draft", "writes": ["plan/output/report.md"], "inputs": [] },
  { "id": "draft-T10", "scheduler_role": "draft", "writes": ["plan/output/report.md"], "inputs": [] }
]
```

Both start in `ready_queue`; `dep_graph` shows both immediately ready; `max_concurrent` ≥ 2.

Assert:
1. First FILL SLOTS picks exactly one (e.g. `draft-T9`) → moves to `in_flight`; `locks.json` has one claim for `plan/output/report.md`.
2. Same FILL SLOTS wave skips `draft-T10` (overlap against `claimed`); it stays in `ready_queue`.
3. `in_flight` never simultaneously contains both `draft-T9` and `draft-T10`.
4. When T9 reaches `done_set`, its claim is removed from `locks.json`; next FILL SLOTS picks T10 normally.

Failure mode caught: without this gate, both nodes dispatch together and agents race-write `plan/output/report.md`.
