# AB — State & contract schemas (global-DAG edition)

## agents.json  (live swarm dashboard feed — plan/state/agents.json)

The orchestrator rewrites this whole file on each update; the dashboard server streams it over SSE.

```json
{
  "project": "mini-Minecraft (web)",
  "root": "minecraft-web",
  "phase": "Global DAG · 6 running, 4 queued of 22",
  "mode": "foreground",
  "startedAt": "2026-06-15T00:00:00.000Z",
  "strategy": { "name": "Global DAG", "how": "One dependency graph over the whole project; every task whose deps are green runs now (up to the cap), spanning all milestones at once; milestone gates block only their own cluster." },
  "reasoning": "6 agents in parallel across 2 milestones — data-layer impls and api architect are all dep-satisfied right now, so they run together; the UI milestone's tasks are still waiting on api.interfaces.lock.",
  "progress": { "tasksDone": 4, "tasksTotal": 22, "eta": "~6 min" },
  "updated": "2026-06-15T00:00:00.000Z",
  "agents": [
    { "id": "impl-FEAT-001-T1", "role": "impl", "label": "FEAT-001-T1",
      "file": "src/world/voxelWorld.ts", "status": "working",
      "detail": "implemented setBlock/getBlock; running voxelWorld.test.ts (iter 2/10)",
      "note": "" }
  ],
  "log": [
    { "t": "2026-06-15T00:00:00.000Z", "msg": "Global frontier — spawned 6 agents across 2 milestones" }
  ],
  "dag": {
    "nodes": [ { "id": "impl-FEAT-001-T1", "role": "impl", "label": "F1 store", "milestone": "data", "status": "working" } ],
    "edges": [ ["architect-data","impl-FEAT-001-T1"], ["impl-FEAT-001-T1","gate-data"] ],
    "milestones": [ { "id": "data", "label": "Data layer" } ]
  },
  "prompt": {
    "id": "approve-plan", "title": "Approve the build plan?",
    "question": "Review the DAG in the Plan tab. Start building?",
    "plan": "<optional pre-formatted plan text>",
    "options": ["Approve", "Change scope"], "openPlan": true, "answered": false
  },
  "tests": {
    "status": "done", "runner": "vitest",
    "total": 24, "passed": 23, "failed": 1, "skipped": 0,
    "suites": [
      { "file": "src/streak.test.ts", "total": 6, "passed": 6, "failed": 0, "status": "passed" },
      { "file": "src/stats.test.ts", "total": 5, "passed": 4, "failed": 1, "status": "failed",
        "cases": [ { "title": "median of evens", "status": "failed" } ] }
    ]
  }
}
```

- `dag` (optional) — drives the Plan-tab flowchart. `nodes[].id` should equal the scheduler's
  `dep_graph` keys AND the matching `agents[].id` so live status overlays automatically; `status` ∈
  `ready|working|done|blocked|spawning`. Gate nodes (`gate-*`/`review-*`/`commit-*`) render as ◇.
  Write it once when the planner finishes the graph; refresh node `status` as the build runs.
- `prompt` (optional) — when present + `answered:false`, the page shows a modal (question + optional
  `plan` text + `options` buttons, or a free-text box if no options). `openPlan:true` adds an "Open Plan"
  side button (switches to the Plan tab, no submit); `openUrl:"<file|http>"` adds an "Open Page" side
  button (opens that URL in the OS browser via the server `/open` route, no submit). The user's click
  POSTs to `/answer` → `plan/state/answers.json`. The orchestrator blocks on `wait-answer.mjs <id>` AND
  asks the same via CLI `AskUserQuestion`; first answer wins. Set `answered:true` to close it.
- `tests` (optional) — drives the **Tests tab** for unit/TDD runs (any runner). The gate writes
  `status` (`running|done`), `runner`, `total/passed/failed/skipped`, and `suites[]` (per-file
  `total/passed/failed/status` + optional failing `cases[]`). Written per milestone gate (Phase 6).
  Playwright E2E (when its 7373 server is live) takes over the panel instead; otherwise this renders.
- `caps` (optional) — capability flags from Stage 0, e.g. `{ "git": true|false }`. When `git:false`
  (git not installed), the dashboard greys out the milestone **Undo** button — undo reverts commits, so it
  needs git; Redo still works. Set it at Stage 0 Step 2.
- `locks` (optional) — active write-claims mirrored from `locks.json` (runtime file-ownership, P0):
  `[ { "node": "impl-FEAT-001-T1", "writes": ["src/db/schema.ts"] } ]`. The dashboard renders a
  File-Ownership strip when present; suppress when absent/empty. Source of truth is `locks.json`
  (see `references/file-ownership.md`).

- `root` = the project root folder name (shown as a chip in the header). `project` = human title.
- `startedAt` = run start ISO — the page ticks an elapsed clock from it.
- `strategy` = `{ name, how }` — the agentic orchestration pattern in use right now + a one-line
  explanation of how it works. Names: `Global DAG` (the default for this skill — one graph, frontier
  dispatch across all milestones), `Fan-out / Fan-in` (parallel independent tasks → merge),
  `Pipeline` (staged: each stage's output feeds the next), `Sequential` (one at a time, dependency
  chain), `Competitive / Best-of-N` (multiple agents solve the same task, pick the best),
  `Speculative` (race approaches, cancel losers), `Hierarchical` (orchestrator → sub-orchestrators →
  workers), `Single` (one agent). Set it per phase to match what you're actually doing.
- `reasoning` = the orchestrator's rationale for the CURRENT activity, shown in the bottom status bar
  (e.g. *why* it spawned one agent vs many: "1 agent — this task depends on the DB layer which isn't
  green yet" / "3 agents in parallel — independent files, deps satisfied"). Update it every phase.
- `progress` = `{ tasksDone, tasksTotal, eta?, pct?, step?, indeterminate? }` — drives the effort bar.
  Count work tasks across the whole DAG (each `{FEAT}-T*` = one; gate nodes excluded).
  - `pct` (0–100) — phase-weighted overall progress; the bar uses it when present (else derives from
    tasksDone/tasksTotal). Set it across ALL phases so docs/scaffold move the bar, not just build.
  - `step` = `{ i, n, label }` — sub-step within a single multi-part agent (e.g. docs `{i:2,n:4,label:"FEATURES.txt"}`),
    shown next to the bar.
  - `indeterminate: true` — animate a sweeping bar for an atomic long op (npm install) with no numeric %.
  - `eta` = best estimate of time remaining ("~6 min").
- `mode` ∈ `foreground | background`. In `background`, the page hides the live `detail` line (status only).
- `role` ∈ `interview | prd | planner | doc-check | router | wireframe | scaffold | architect | tdd | impl | fix | review`
  (card colour). `router` = picks the best installed UI/design skill; `wireframe` = the pre-build UI
  mockup/approval step (Stage 2.4).
  EVERY phase is an agent on the board — including ones the orchestrator does directly:
  `interview` (Stage 1 Q&A), `prd` (writing docs), `planner` (backlog + global DAG + milestones), `doc-check` (quality
  gate), `scaffold` (package.json/tsconfig/test-config + `npm install`), then the build agents. No
  step runs off-board.
- `status` ∈ `spawning | working | done | blocked` (drives the card state/animation).
- `label` = task/feature id; `file` = the one file that agent owns.
- `persona` (optional) — the routed specialist `{ name, emoji, domain }` from `agents/registry.json`
  (P6, build domains only — see `references/agent-registry.md`). Card shows name + emoji; absent → plain role.
- `detail` = **live "what it's doing right now"** — update it as the agent progresses (foreground only).
- `note` = short final result line.
- Optional **verbose-only** card fields (rendered only when the user toggles 🔍 Verbose; all best-effort):
  `startedAt` (ISO → page shows elapsed), `context` (one line on the context_slice), `result` (the
  agent's returned JSON object), `iter` (e.g. "3/10"). Omit them on a normal run.
- Keep `agents[]` to the current+recent agents (or all — the page just renders the array).
- `log` is append-only-ish; the page shows the last ~40, newest first.

---


All under `plan/state/`. JSON. Update after every transition.

## framework-state.json  (source of truth for resume)

Init at scaffold:
```json
{
  "project": "{name or null}",
  "stage": "scaffold|interview|docs|build|done|blocked",
  "autonomy": "checkpoint|full",
  "mode": "flat | hierarchical",
  "milestones": {},
  "blocked": [],
  "total_tests_written": 0,
  "total_tests_passing": 0,
  "scheduler": {
    "dep_graph": {},
    "ready_queue": [],
    "in_flight": [],
    "done_set": [],
    "blocked_set": [],
    "max_concurrent": 6
  },
  "budget": { "max_tokens": null, "max_usd": null, "warn_pct": 0.8, "prices": {}, "state": "ok" },
  "updated_at": "{date}"
}
```

The `scheduler` block is the source of truth for resume (NOT a sprint pointer). After build starts,
`milestones` fills in (gate/commit status per cluster — scheduling is driven by `scheduler`, not this):
```json
"milestones": {
  "data": {
    "status": "done|in_progress|pending",
    "committed_at": "{date|null}",
    "features": ["FEAT-001"],
    "tasks": {
      "FEAT-001-T1": { "status": "green",       "iterations": 2 },
      "FEAT-001-T2": { "status": "in_progress",  "iteration": 3 }
    }
  }
}
```

Task status values: `pending → red → in_progress → green` (or `halted`).
Resume rule: keep `scheduler.done_set`; re-queue anything left in `scheduler.in_flight` (interrupted);
skip milestone gate nodes already in `done_set`; restart `in_progress`/`red`/`halted` tasks.

## backlog.json
Array of feature entries — see phases.md Phase 1.

## milestones.json  (gate clusters — NOT scheduling buckets)
```json
{ "milestones": [
  { "id": "data", "features": ["FEAT-001"],            "modules": ["data"], "status": "pending", "commit": null },
  { "id": "api",  "features": ["FEAT-003","FEAT-004"], "modules": ["api"],  "status": "done",    "commit": "a1b2c3d" },
  { "id": "ui",   "features": ["FEAT-005"],            "modules": ["ui"],   "status": "pending", "commit": null } ] }
```
A milestone only adds `gate-{id}`/`review-{id}`/`commit-{id}` nodes to the DAG; it imposes NO ordering
between milestones beyond the real dependency edges the planner drew. `commit` = the sha written by
`commit-{M}` (Phase 6) — the dashboard milestone **undo** (SKILL §D) git-reverts these.

## control.json  (dashboard → orchestrator: milestone undo/redo — written by server `/control`)
```json
{ "requests": [
  { "id": "undo-ui-1", "action": "undo", "milestone": "ui", "notes": "", "at": "<iso>", "handled": false },
  { "id": "redo-api-2", "action": "redo", "milestone": "api", "notes": "use a Map not an array", "at": "<iso>", "handled": false } ] }
```
The scheduler reads this at each loop top (see SKILL §D + scheduler.md CONTROL step): for the first
`handled:false` request it confirms, then git-reverts (undo) or resets-to-ready + re-runs (redo) the
milestone **and its DAG-descendant milestones**, and sets `handled:true`. Milestone-granular only.

## tasks/{FEAT}-tasks.json
Task + subtask decomposition (incl. `module` + `milestone` + `writes:[globs]` fields) — see phases.md
Phase 2 and `references/file-ownership.md` (the `writes` field drives the runtime conflict guard).

## Per-task signal files (one file per agent — never shared, all under plan/state/)
- `locks/{module}.interfaces.lock`   — module architect done; that module's TDD may NOT start until this exists
- `tasks/{TASK_ID}-tests.json`       — `{ "status":"red", "tests_written":n, "tests_failing":n }`
- `tasks/{TASK_ID}.done`             — `{ "status":"green", "tests_passing":n, "iterations_needed":n }`

## answers.json  (dashboard reverse channel — written by the server, read by wait-answer.mjs)
```json
{ "approve-plan": { "value": "Approve", "at": "2026-06-18T00:00:00Z" } }
```
Keyed by `prompt.id`. The server's `POST /answer` writes it; `wait-answer.mjs <id>` polls + prints
the value. Orchestrator pairs every dashboard prompt with a CLI `AskUserQuestion` fallback.

## test-result contract (parsed by orchestrator)
```json
{ "command": "...", "passed": 12, "failed": 0, "failures": [
  { "test": "validateCredentials rejects empty", "file": "...", "error": "..." } ] }
```

## BLOCKED.md  (written only on unrecoverable failure)
```
# BLOCKED — milestone {M}, task {TASK_ID}
Failing tests:   {list}
Files touched:   {list}
Attempts:        {what fix-agent tried, n rounds}
Suspected cause: {best guess}
Options:         debug together | skip task | abort
```

## locks.json  (runtime file-ownership — written by the scheduler at dispatch)
```json
{ "claims": [ { "node": "impl-FEAT-001-T1", "writes": ["src/db/schema.ts"], "since": "<iso>" } ] }
```
A claim is added when a node moves `ready_queue → in_flight`, removed when it reaches `done_set`/
`blocked_set`. The scheduler defers any ready node whose `writes` overlap an existing claim. Mirrored
into `agents.json` `locks` for the dashboard. Full algorithm + overlap test in `references/file-ownership.md`.

## events.jsonl  (append-only replay/audit log — see references/events-log.md)
One JSON object per line, never rewritten: `{ "seq", "t", "type", ...payload }`. Types: `run.start`,
`agent.start`, `agent.done`, `agent.blocked`, `gate.run`, `approval.ask`, `approval.answer`, `commit`,
`lock.claim`, `lock.release`, `cost.tick`, `budget.warn`, `budget.breach`, `control`, `run.end`. Served
to the dashboard Replay tab via `GET /events-log`.

## .agentic-builder/memory.json  (cross-session memory — PROJECT ROOT, not plan/state — see references/memory.md)
Persistent across runs: `{ "version", "project", "runs":[…], "milestones":{ "<id>":{ built, decisions,
failures, files } }, "glossary":{} }`. Loaded at Stage 0; a keyword-filtered slice is injected into the
planner + architect agents as warm-start context. Updated at `commit-{M}`, on fix resolution, and Phase 9.

## agents/registry.json  (domain-agent index — repo `agents/`, generated — see references/agent-registry.md)
Built by `agents/build-registry.mjs` from `agents/<domain>/*.md` frontmatter:
`{ schema, count, domains, agents:[{ name, domain, description, emoji, color, path }] }`. The Stage 3
build router selects a specialist persona (build domains only) to inject into a general-purpose subagent.
