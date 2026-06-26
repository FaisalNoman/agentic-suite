# AB — Append-only event log (plan/state/events.jsonl)

Immutable, line-delimited record of every meaningful orchestrator transition; enables post-mortem diagnosis and full session replay without touching any other state file.

## Event schema

Every line is a JSON object. Required base fields on every event:

```json
{ "seq": 1, "t": "2026-06-26T00:00:00.000Z", "type": "<type>", ...type-specific fields }
```

`seq` — monotonically increasing integer, starts at 1, never reused.  
`t` — ISO 8601 UTC timestamp at moment of append.  
`type` — one of the values below.

| type | additional fields | description |
|------|-------------------|-------------|
| `run.start` | `mode` (greenfield/feature/surgical), `root`, `tasksTotal` | First line written; one per run |
| `agent.start` | `node` (dep_graph key), `role`, `file` | Emitted at DISPATCH, before Agent tool call |
| `agent.done` | `node`, `role`, `iters?` | Emitted at COMPLETION |
| `agent.blocked` | `node`, `reason` | Emitted at FAILURE after fix loop exhausted |
| `gate.run` | `milestone`, `kind` (`lint`\|`test`), `passed`, `total?`, `failed?` | After each deterministic check in gate-{M} |
| `approval.ask` | `id` (prompt id), `question` | When orchestrator writes a `prompt` to agents.json |
| `approval.answer` | `id`, `value` | When wait-answer.mjs resolves |
| `commit` | `milestone`, `sha` | After `git commit` in commit-{M} node |
| `lock.claim` | `node`, `writes` (array of file paths) | When a node acquires file ownership (file-ownership P0) |
| `lock.release` | `node` | When node finishes and releases its locked files |
| `cost.tick` | `tokens_total`, `usd?` | Periodic budget sample; after each agent completion (budget P1) |
| `budget.warn` | `tokens_total`, `cap` | Usage crossed warning threshold |
| `budget.breach` | `tokens_total`, `cap` | Hard cap reached |
| `control` | `action` (`undo`\|`redo`), `milestone` | At CONTROL step when a handled:false request is processed |
| `run.end` | `status` (`done`\|`blocked`), `done` (count), `blocked` (count) | Final line; one per run |

Example lines:

```jsonl
{"seq":1,"t":"2026-06-26T00:00:00.000Z","type":"run.start","mode":"greenfield","root":"minecraft-web","tasksTotal":22}
{"seq":2,"t":"2026-06-26T00:00:01.100Z","type":"agent.start","node":"architect-data","role":"architect","file":"plan/interfaces/data.interfaces.lock"}
{"seq":3,"t":"2026-06-26T00:00:08.400Z","type":"agent.done","node":"architect-data","role":"architect","iters":1}
{"seq":4,"t":"2026-06-26T00:00:08.500Z","type":"lock.claim","node":"impl-FEAT-001-T1","writes":["src/world/voxelWorld.ts"]}
{"seq":5,"t":"2026-06-26T00:00:09.000Z","type":"cost.tick","tokens_total":14200,"usd":0.04}
{"seq":6,"t":"2026-06-26T00:02:14.800Z","type":"gate.run","milestone":"data","kind":"test","passed":true,"total":12,"failed":0}
{"seq":7,"t":"2026-06-26T00:02:15.000Z","type":"commit","milestone":"data","sha":"a1b2c3d"}
{"seq":8,"t":"2026-06-26T00:05:00.000Z","type":"run.end","status":"done","done":22,"blocked":0}
```

## Append discipline

One helper function (`appendEvent(obj)`) does `JSON.stringify(obj) + "\n"` and `fs.appendFileSync` to
`plan/state/events.jsonl`. Never truncate or rewrite — open in append mode only.

`seq` is an in-memory counter, initialised to 0 at `run.start`, incremented before each write.
On crash-resume, read the file's last line to find the highest `seq` and continue from `seq + 1`.

Logging is best-effort: wrap every `appendEvent` call so a filesystem error never blocks the build.

Mapping to scheduler.md transitions:

| Scheduler step | Events emitted |
|----------------|----------------|
| Before scheduler loop starts | `run.start` |
| CONTROL — handled:false request processed | `control` |
| DISPATCH — work node taken from ready_queue | `agent.start`, `lock.claim` |
| COMPLETION — node moves in_flight → done_set | `agent.done`, `lock.release`, `cost.tick` |
| FAILURE — node enters blocked_set | `agent.blocked`, `lock.release` |
| Gate execution — lint check | `gate.run` (kind:"lint") |
| Gate execution — test check | `gate.run` (kind:"test") |
| Gate execution — commit-{M} git commit | `commit` |
| Prompt written to agents.json | `approval.ask` |
| wait-answer.mjs resolves | `approval.answer` |
| Budget threshold crossed | `budget.warn` or `budget.breach` |
| Scheduler loop END | `run.end` |

## Server route

`GET /events-log` — reads `plan/state/events.jsonl` and returns the raw file contents as
`Content-Type: application/x-ndjson`. Returns an empty string (HTTP 200) if the file does not exist.
Never throws; any read error returns an empty string. Implemented in `server.mjs`.

The route bulk-reads the file; no filtering, no pagination — the client receives every line verbatim.

## Replay tab

The dashboard gains a **Replay** tab (alongside Live, Plan, Tests).

**Fetch:** On tab activation, `GET /events-log` — parse each newline-delimited JSON object, sort by `seq`.

**Timeline list:** Render events top-to-bottom, oldest first. Each row: `seq`, relative time from
`run.start`, `type`, and key type-specific fields. Color by category: agent ops = blue,
gates = purple, approvals = amber, control = orange, budget = red, run lifecycle = grey.

**Scrubber slider:** Range 0..N (N = last `seq`). Dragging to position P folds events `seq ≤ P`
into a reconstructed board snapshot:
- `agents[]` — for each node, its last observed status: `agent.start` → working,
  `agent.done` → done, `agent.blocked` → blocked. Nodes with no event yet are omitted.
- `milestones[]` — derive `commit` (sha present) and gate outcomes from `gate.run` events.
- Render as a frozen DAG card grid (same layout as live board) with a "⏸ Replay at event N" banner.

Replay is read-only — no control actions (undo/redo) are available while scrubbing.
It complements the live SSE board: live shows real-time state; Replay reconstructs any past moment
from the immutable log.

## Crash-resume + audit value

**Crash diagnosis:** When a run ends in BLOCKED, inspect `events.jsonl`:
1. Find `agent.blocked` entries — `node` and `reason` pinpoint exactly which tasks failed.
2. Trace preceding `agent.start` / `gate.run` events to confirm dependency order and gate outcomes.
3. Compare `lock.claim` / `lock.release` pairs — an unclosed claim marks a node in-flight at crash time.

**Resume:** On restart the orchestrator reads `framework-state.json` (authoritative scheduler state)
for `done_set` / `in_flight`. The event log corroborates: every node in `done_set` must have a
matching `agent.done` or `commit` event; discrepancies flag state corruption. Nodes with `lock.claim`
but no `lock.release` are re-queued. The log never supersedes `framework-state.json` — it validates it.

**Audit trail:** `approval.ask` / `approval.answer` pairs provide a tamper-evident record of every
human decision. `cost.tick`, `budget.warn`, `budget.breach` give a complete token-spend history.
Since the file is append-only and never rewritten, it can be archived alongside build artifacts as a
verifiable audit record of the entire run.
