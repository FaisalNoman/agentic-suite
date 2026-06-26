# AB — Runtime file-ownership conflict prevention

Prevents two parallel impl agents from clobbering the same file by blocking overlapping write-sets at dispatch time — no OS/file locks, pure scheduling.

## The `writes` field

Every task entry in `plan/state/tasks/{FEAT}-tasks.json` declares the paths it may write:

```json
{
  "id": "FEAT-001-T1",
  "module": "auth",
  "milestone": "data",
  "writes": ["src/auth/**", "src/db/schema.ts"],
  "deps": ["architect-auth"]
}
```

Glob rules:
- Use directory globs (`src/auth/**`) for tasks that own a whole folder.
- Use exact paths (`src/db/schema.ts`) for shared files the task edits (schema migrations, barrel `index.ts`, shared constants).
- When two tasks logically share a file, the planner either splits responsibility or assigns ownership to one and adds it as a dep for the other.
- The planner derives `writes` from the arch design output: every file the task creates or modifies goes in `writes`.

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
  pa = strip_glob_suffix(ga)   # "src/auth/**" → "src/auth"
  pb = strip_glob_suffix(gb)
  if pa == pb: return True
  if pa.startswith(pb + "/") or pb.startswith(pa + "/"): return True
  return False

# matches(pattern, path): standard minimatch/micromatch semantics
# strip_glob_suffix: remove trailing "/**" or "/*" to get directory prefix
```

Examples:
- `src/auth/**` vs `src/auth/login.ts` → conflict (prefix subsumes concrete path)
- `src/db/schema.ts` vs `src/db/schema.ts` → conflict (identical)
- `src/auth/**` vs `src/api/**` → no conflict
- `src/**` vs `src/auth/login.ts` → conflict (broad glob covers concrete path)

## Scheduler dispatch gate

Slots into scheduler.md's **DISPATCH** step, replacing "Take up to `slots` nodes from ready_queue":

```
DISPATCH:
  slots      = max_concurrent - len(in_flight)
  candidates = ready_queue[:slots * 2]   # oversample; filter below

  # Accumulate claimed write-sets from currently in_flight nodes
  claimed      = union of tasks[n]["writes"] for n in in_flight

  dispatch_batch = []
  batch_writes   = []   # writes claimed within this single dispatch batch

  for node in candidates:
    node_writes = tasks[node].get("writes", [])
    if globs_overlap(node_writes, claimed):
      continue   # conflicts with in_flight — defer; stays in ready_queue
    if globs_overlap(node_writes, batch_writes):
      continue   # conflicts with sibling already picked — defer
    dispatch_batch.append(node)
    batch_writes.extend(node_writes)
    if len(dispatch_batch) == slots:
      break

  for node in dispatch_batch:
    ready_queue.remove(node)

  Move dispatch_batch → in_flight
  Write locks.json  (add claims for dispatch_batch)
  Save framework-state.json; update agents.json
  Emit ALL dispatch_batch Agent tool calls in ONE message   ← mandatory (rule 7)
```

Deferred nodes (skipped for write conflict) remain in `ready_queue` and are reconsidered on the next loop iteration after a blocking task completes.

## locks.json

Live write-claim registry. Path: `plan/state/locks.json`. Source of truth for the dashboard.

```json
{
  "claims": [
    {
      "node": "impl-FEAT-001-T1",
      "writes": ["src/auth/**", "src/db/schema.ts"],
      "since": "2026-06-15T00:00:00.000Z"
    }
  ]
}
```

Lifecycle:
- **Claimed:** node moves `ready_queue → in_flight` at DISPATCH.
- **Released:** node moves to `done_set` or `blocked_set` at COMPLETION or FAILURE.
- **Resume:** regenerate from `scheduler.in_flight` — interrupted tasks re-claim their writes.

## Dashboard surfacing

After every `locks.json` write, the orchestrator mirrors active claims into `agents.json`:

```json
{
  "locks": [
    { "node": "impl-FEAT-001-T1", "writes": ["src/auth/**", "src/db/schema.ts"] }
  ]
}
```

Render as a "File Ownership" panel or per-node card annotation. When `locks` is absent or empty, suppress the UI.

## Acceptance — conflict-injection test

Craft two tasks with a shared write target and no deps:

```json
[
  { "id": "FEAT-X-T1", "writes": ["src/shared.ts"], "deps": [] },
  { "id": "FEAT-X-T2", "writes": ["src/shared.ts"], "deps": [] }
]
```

Both start in `ready_queue`; `dep_graph` shows both immediately ready; `max_concurrent` ≥ 2.

Assert:
1. First DISPATCH picks exactly one (e.g. `FEAT-X-T1`) → moves to `in_flight`; `locks.json` has one claim for `src/shared.ts`.
2. Same DISPATCH iteration skips `FEAT-X-T2` (overlap against `claimed`); it stays in `ready_queue`.
3. `in_flight` never simultaneously contains both `FEAT-X-T1` and `FEAT-X-T2`.
4. When T1 reaches `done_set`, its claim is removed from `locks.json`; next DISPATCH picks T2 normally.

Failure mode caught: without this gate, both nodes dispatch together and agents race-write `src/shared.ts`.
