# AB — Agent Result Cache Policy

## Cache file: plan/state/agent-cache.json

Initialize in Stage 0 preflight (alongside other state files):
```json
{ "entries": {}, "hits": 0, "misses": 0 }
```

Also create `plan/state/cache/` directory in Stage 0.

## Cache key construction

Before spawning an architect, tdd, or impl agent, construct a key:
```
key = "{agent_type}|{task_id}|{sorted_input_file_names_joined}|{sum_of_input_file_sizes}"
```
Example: `"impl|FEAT-003-T1|auth.interfaces.ts,auth.test.ts|4821"`

## Cache lookup (before spawning)

1. Compute the key as above.
2. Read `agent-cache.json`. Check `entries[key]`.
3. **HIT** — if entry exists AND `plan/state/cache/{key_hash}.txt` file exists:
   - Read the cached result from that file
   - Increment `hit_count` in the entry and `hits` in root
   - Set dashboard card: `status: "done"`, `detail: "cache hit — reused result from {created_at}"`
   - **Skip spawning the agent entirely**
4. **MISS** — spawn agent normally, then after completion:
   - Write agent output to `plan/state/cache/{key_hash}.txt`
     where `key_hash` = first 32 chars of key (filesystem-safe)
   - Add entry to `agent-cache.json`:
     ```json
     {
       "hash": "{key}",
       "result_path": "plan/state/cache/{key_hash}.txt",
       "created_at": "{iso timestamp}",
       "agent_type": "{type}",
       "task_id": "{id}",
       "hit_count": 0
     }
     ```
   - Increment `misses` in root

## Cache invalidation

When seeding the scheduler (and before dispatching any node), for each task:
- Re-compute the cache key
- If any input file's size has changed since the cached entry, delete the entry
  (read the new size, compare to the size encoded in the key)

## What is NOT cached

- fix agents — their inputs include non-deterministic test environment state
- integration agents — filesystem state varies
- architect agents whose interfaces.lock already exists (they're already skipped by
  the interfaces.lock gate — no need to cache)

## Dashboard logging

On cache hit: log to `agents.json` log array:
`{ "t": "{iso}", "msg": "Cache hit: {task_id} ({agent_type}) — skipped agent spawn" }`
