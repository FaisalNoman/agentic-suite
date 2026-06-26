# agentic-worker — Append-only event log (plan/state/events.jsonl)

Immutable, line-delimited record of every meaningful scheduler transition. Powers the
shared dashboard's Replay tab and provides a tamper-evident audit trail for every run.
Never rewritten or truncated — open in append mode only.

## Event schema

Every line is a JSON object. Required base fields:

```json
{ "seq": 1, "t": "2026-06-26T00:00:00.000Z", "type": "<type>", ...type-specific fields }
```

`seq` — monotonically increasing integer, starts at 1, never reused.  
`t` — ISO 8601 UTC timestamp at moment of append.  
`type` — one of the values below.

| type | additional fields | description |
|------|-------------------|-------------|
| `run.start` | `mode` (flat\|hierarchical), `root`, `tasksTotal` | First line; one per run |
| `agent.start` | `node` (dep_graph key), `agent_id`, `scheduler_role` | Emitted at FILL SLOTS, before Agent call |
| `agent.done` | `node`, `agent_id` | Emitted at PROCESS RETURNS — green |
| `agent.blocked` | `node`, `reason` | Emitted at PROCESS RETURNS — blocked, fix loop exhausted |
| `gate.run` | `milestone`, `passed` | After gate node completes at GATE CHECK |
| `review.run` | `node`, `pass`, `score` | After HIGH_STAKES_AUTO_REVIEW; score ≥ 0.70 = pass |
| `approval.ask` | `id`, `question` | When orchestrator writes a prompt to agents.json |
| `approval.answer` | `id`, `value` | When the prompt is resolved |
| `lock.claim` | `node`, `writes` (array of file paths) | Node acquires file ownership (P0) |
| `lock.release` | `node` | Node releases file ownership |
| `cost.tick` | `tokens_total`, `usd?` | Budget sample after each agent completion (P1) |
| `budget.warn` | `tokens_total`, `cap` | Usage crossed warning threshold |
| `budget.breach` | `tokens_total`, `cap` | Hard cap reached |
| `control` | `action` (`undo`\|`redo`), `milestone` | At CONTROL CHECK when a handled:false request is processed |
| `run.end` | `status` (`done`\|`blocked`), `done` (count), `blocked` (count) | Final line; one per run |

Example lines:

```jsonl
{"seq":1,"t":"2026-06-26T00:00:00.000Z","type":"run.start","mode":"flat","root":"market-analysis","tasksTotal":9}
{"seq":2,"t":"2026-06-26T00:00:01.000Z","type":"agent.start","node":"research-T1","agent_id":"a-001","scheduler_role":"research"}
{"seq":3,"t":"2026-06-26T00:00:01.050Z","type":"lock.claim","node":"research-T1","writes":["plan/outputs/raw-data.json"]}
{"seq":4,"t":"2026-06-26T00:00:14.200Z","type":"agent.done","node":"research-T1","agent_id":"a-001"}
{"seq":5,"t":"2026-06-26T00:00:14.210Z","type":"lock.release","node":"research-T1"}
{"seq":6,"t":"2026-06-26T00:00:14.300Z","type":"cost.tick","tokens_total":8400,"usd":0.02}
{"seq":7,"t":"2026-06-26T00:00:15.000Z","type":"review.run","node":"analysis-T3","pass":true,"score":0.82}
{"seq":8,"t":"2026-06-26T00:01:30.000Z","type":"gate.run","milestone":"m1","passed":true}
{"seq":9,"t":"2026-06-26T00:03:00.000Z","type":"run.end","status":"done","done":9,"blocked":0}
```

## Append discipline

One helper (`appendEvent(obj)`) does `JSON.stringify(obj) + "\n"` and `fs.appendFileSync`
to `plan/state/events.jsonl`. Never truncate or rewrite.

`seq` is an in-memory counter, initialised to 0 before `run.start`, incremented before
each write. On crash-resume, read the last line to find the highest `seq` and continue
from `seq + 1`.

Wrap every `appendEvent` call so a filesystem error never blocks the scheduler loop.

Mapping to scheduler.md loop steps:

| Scheduler step | Events emitted |
|----------------|----------------|
| Before scheduler loop starts | `run.start` |
| CONTROL CHECK — unhandled request processed | `control` |
| FILL SLOTS — task dispatched from ready_queue | `agent.start`, `lock.claim` |
| PROCESS RETURNS — green (done_set) | `agent.done`, `lock.release`, `cost.tick` |
| PROCESS RETURNS — blocked (blocked_set) | `agent.blocked`, `lock.release` |
| HIGH_STAKES_AUTO_REVIEW — review-agent returns | `review.run` |
| GATE CHECK — gate node completes | `gate.run` |
| Prompt written to agents.json | `approval.ask` |
| Prompt resolved | `approval.answer` |
| Budget threshold crossed | `budget.warn` or `budget.breach` |
| TERMINATE | `run.end` |

Node ids follow the `{scheduler_role}-T{N}` convention from scheduler.md (e.g.,
`research-T1`, `code-T4`, `gate-m2`). `scheduler_role` is one of: research / analysis /
content / data / code / coordinator / review.

## Server route

`GET /events-log` — reads `plan/state/events.jsonl` and returns the raw file contents as
`Content-Type: application/x-ndjson`. Returns HTTP 200 with an empty body if the file
does not exist. Never throws; any read error returns an empty string. Already implemented
in the shared `server.mjs`.

The route bulk-reads the file; no filtering, no pagination — the client receives every
line verbatim.

## Replay tab

Already present in the shared dashboard alongside Live, Plan, and Tests tabs.

**Fetch:** On tab activation, `GET /events-log` — parse each newline-delimited JSON
object, sort by `seq`.

**Timeline list:** Events top-to-bottom, oldest first. Each row: `seq`, relative time
from `run.start`, `type`, key type-specific fields. Color by category: agent ops = blue,
gates = purple, review = indigo, approvals = amber, control = orange, budget = red,
lifecycle = grey.

**Scrubber slider:** Range 0..N. Dragging to position P folds events `seq ≤ P` into a
reconstructed snapshot:
- `agents[]` — last observed status per node: `agent.start` → working, `agent.done` →
  done, `agent.blocked` → blocked. Nodes with no event yet are omitted.
- `milestones[]` — derive gate outcomes from `gate.run` events; review outcomes from
  `review.run`.
- Rendered as a frozen DAG card grid with a "⏸ Replay at event N" banner.

Replay is read-only. It complements the live SSE board: live shows real-time state;
Replay reconstructs any past moment from the immutable log.

## Crash-resume + audit value

**Crash diagnosis:** Find `agent.blocked` entries for `node` + `reason`. Trace preceding
`agent.start` / `gate.run` events to confirm dependency order. Compare `lock.claim` /
`lock.release` pairs — an unclosed claim marks a node in-flight at crash time.

**Resume:** The scheduler reads `framework-state.json` (authoritative). The event log
corroborates: every node in `done_set` must have a matching `agent.done`; discrepancies
flag state corruption. Nodes with `lock.claim` but no `lock.release` are re-queued. The
log never supersedes `framework-state.json` — it validates it.

**Audit trail:** `approval.ask` / `approval.answer` pairs record every human decision.
`cost.tick`, `budget.warn`, `budget.breach` give a complete token-spend history. Since the
file is append-only, it can be archived alongside outputs as a verifiable run record.
