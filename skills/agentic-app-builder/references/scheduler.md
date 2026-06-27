# AB — Global Dependency-Graph Scheduler (+ milestone gates)

ONE scheduler over the WHOLE project. No sprint loop, no waves. Every task unlocks the moment its own
dependencies are met — across all features and milestones at once. Milestone integration/review/commit
are ordinary DAG nodes, so they block only their own cluster while sibling work keeps flowing.

## Data structures (stored in framework-state.json under "scheduler")

```json
{
  "dep_graph": {
    "architect-data":        [],
    "tdd-FEAT-001-T1":       ["architect-data"],
    "impl-FEAT-001-T1":      ["tdd-FEAT-001-T1"],
    "architect-api":         ["architect-data"],
    "tdd-FEAT-003-T1":       ["architect-api"],
    "impl-FEAT-003-T1":      ["tdd-FEAT-003-T1", "impl-FEAT-001-T1"],
    "gate-data":             ["impl-FEAT-001-T1"],
    "review-data":           ["gate-data"],
    "commit-data":           ["review-data"],
    "gate-api":              ["impl-FEAT-003-T1"],
    "review-api":            ["gate-api"],
    "commit-api":            ["review-api"]
  },
  "ready_queue": ["architect-data"],
  "in_flight": [],
  "done_set": [],
  "blocked_set": [],
  "max_concurrent": 6
}
```

Node id conventions:
- `architect-{module}` — one per module/cluster (NOT per sprint). Produces that module's interfaces.lock.
- `tdd-{TASK}` / `impl-{TASK}` — one per task file.
- `gate-{M}` — milestone M integration + lint gate. Deps = all `impl-*` tasks in M's features.
- `review-{M}` — two-stage code review for M. Dep = `gate-{M}`.
- `commit-{M}` — git commit for M. Dep = `review-{M}` (or `gate-{M}` if review disabled).

The FINAL milestone's `commit` (or a synthetic `done` node depending on every `commit-{M}`) ending in
done_set means the build is complete → Phase 9 finishing.

## Setup (run once in Stage 2 after the global DAG is built)

1. For every task, add `architect-{module} → tdd-{TASK} → impl-{TASK}` edges.
2. Add cross-feature edges: if FEAT-B's module imports FEAT-A's file, add
   `impl-A-task ∈ deps(architect-B)` (needs the real impl) or `architect-A ∈ deps(architect-B)`
   (needs only the interface) — choose the looser edge that's still correct, to widen the frontier.
3. For each milestone M (the gate clusters from `milestones.json`): add `gate-{M}`, `review-{M}`,
   `commit-{M}` nodes with the deps above. `gate-{M}` depends on every impl task in M's features.
   Do NOT add an edge from `commit-{M1}` to anything in M2 unless M2 genuinely needs M1's committed
   code — milestones are independent unless a real dependency links them.
4. Write the whole graph to `framework-state.json` under `scheduler.dep_graph`.
5. Compute `max_concurrent` (see below). Seed `ready_queue` with every node whose dep list is empty.

## Scheduler loop (the ENTIRE Stage 3 — runs once)

```
INIT:
  ready_queue = all nodes with empty dep_graph entries (architects with no deps, etc.)
  in_flight = []; done_set = []; blocked_set = []
  Save framework-state.json

LOOP (until ready_queue empty AND in_flight empty):

  BUDGET CHECK (skip if no cap set — full protocol in references/budget.md):
    Run `node plan/dashboard/token-report.mjs <root> <startedAt>`; estimate USD via budget.prices.
    ≥ warn_pct → log a warning. ≥ 100% → set budget.state="paused" and PAUSE: write a `budget-breach`
    prompt + block on wait-answer.mjs; do NOT dispatch until the user resolves it.

  CONTROL (dashboard undo/redo — see SKILL §D):
    Read plan/state/control.json. For the first request with handled:false:
      target = milestone M + all its DAG-descendant milestones.
      Confirm via a `prompt` (list milestones/commits/files) + wait-answer; proceed only on approval.
      undo → git revert (reverse-topo) the target shas from milestones.json; reset their nodes to
             ready/pending; drop from done_set. redo → reset target nodes to ready; if notes, append to
             their agent prompts. Mark request handled:true. (This is safe here — no nodes are in flight
             at the loop top; never do it mid-wave.)

  DISPATCH:
    slots = max_concurrent - len(in_flight)
    Take up to `slots` nodes from ready_queue, SKIPPING any node whose `writes` globs overlap an
      in_flight node's writes OR a node already picked this batch (runtime file-ownership guard —
      deferred nodes stay queued; glob-overlap test + full gate in references/file-ownership.md).
      For each taken node: add its claim to plan/state/locks.json and mirror active claims into
      agents.json `locks`.
    Partition them by node type:
      - WORK nodes (architect / tdd / impl): for each
          · apply context_slice (Improvement 1)
          · select a specialist persona via references/agent-registry.md (build domains only; scope
            guard) → inject it; no match → plain general-purpose
          · resolve the model TIER for the node's role from references/agent-contracts.md §Model tiering
            (architect/planner → top · spec-review/quality-review → sonnet+ · fix → sonnet · tdd →
            sonnet/haiku · impl → haiku · role absent → inherit session model) and set it as the Agent
            tool `model` param at dispatch. Record it on the agent's card as `model` (for the dashboard).
          · check cache (Improvement 2) → HIT: mark done now, add to done_set, unlock dependents, skip
          · MISS: add to dispatch_batch
      - GATE nodes (gate-/review-/commit-): these are run by YOU (orchestrator), not subagents —
          see "Milestone gate execution" below. A gate node may dispatch its own fix/review subagents.
    Move taken nodes ready_queue → in_flight
    Save scheduler state; update agents.json (all dispatch_batch → "working")
    Emit ALL dispatch_batch Agent tool calls in ONE assistant message   ← mandatory (rule 7)
      (each Agent call carries its resolved `model` tier param — impl agents on the cheap tier are the bulk)
    (Gate nodes that came up this turn: execute them inline; they don't count against the agent cap
     unless they spawn subagents.)

  WAIT:
    Wait for ANY in_flight node to finish (not all).

  COMPLETION (per finished node):
    Move in_flight → done_set; update agents.json (status "done"); incremental-synthesis merge.
    Release the node's claim from locks.json (refresh agents.json `locks`).
    For each node T where dep_graph[T] ⊆ done_set and T not already queued/flight/done/blocked:
      add T to ready_queue   ← speculative unlock (cross-milestone unlocks are normal here)
      log "Unlocked {T} — dep {just_completed} satisfied"
    Save framework-state.json

  FAILURE:
    Work node fails after its bounded fix loop → blocked_set; write BLOCKED.md entry.
    Release the node's claim from locks.json (refresh agents.json `locks`).
    Mark every DAG descendant of the failed node `blocked` too (they can never become ready).
    Independent nodes are unaffected — keep looping. Halt only if blocked_set blocks ALL remaining.

END:
  All nodes in done_set + blocked_set → build complete → Phase 9 finishing.
```

## Event log (audit / replay — see references/events-log.md)

At each transition above, append ONE line to `plan/state/events.jsonl` (append-only, monotonic `seq`,
best-effort — never block the build): loop start/end → `run.start`/`run.end`; DISPATCH → `agent.start`
+ `lock.claim`; COMPLETION → `agent.done` + `lock.release` + `cost.tick`; FAILURE → `agent.blocked` +
`lock.release`; gates → `gate.run` / `commit`; prompts → `approval.ask` / `approval.answer`; budget →
`budget.warn` / `budget.breach`; CONTROL → `control`. Schema in references/events-log.md.

## Milestone gate execution (when a gate node becomes ready)

`gate-{M}` ready (all its cluster's impls done):
1. Run the two deterministic checks from phases.md Phase 6 — lint gate, then test gate — scoped to
   M's files but running the FULL suite (cross-milestone regressions must surface).
2. Pass → mark `gate-{M}` done (unlocks `review-{M}`). Fail → spawn a fix agent (Phase 7, ≤5 rounds)
   as an in_flight node; on green, mark done; on blocked, blocked_set.

`review-{M}` ready: run the two-stage review (phases.md Phase 8) over M's diff. Outcome routes to
fix agents or marks done (unlocks `commit-{M}`).

`commit-{M}` ready: `git commit -m "milestone({M}): {features} complete"`; mark M done in
`milestones.json` + framework-state. This is a rolling commit — other milestones may still be running.

Gates block only their own cluster. While `gate-data` runs, `impl-*` tasks of the API milestone whose
deps are met keep executing — no global pause.

## Adaptive max_concurrent (GLOBAL — computed once)

```
total = total task count across the WHOLE project (work nodes; gate nodes excluded)
max_concurrent = min(total, max(4, ceil(total / 3)))
clamp to real in-session ceiling: max_concurrent = min(max_concurrent, 16, cpu_cores - 2)
```

| Project size | raw | clamped (8-core) |
|--------------|-----|-------------------|
| 3 tasks      | 3   | 3                 |
| 12 tasks     | 4   | 4                 |
| 30 tasks     | 10  | 6                 |
| 60 tasks     | 20  | 6                 |

Show in dashboard `strategy.how`:
`"Global DAG — {len(in_flight)} running, {len(ready_queue)} queued of {total}"`.

## Why this beats the sprint loop

- Frontier = the whole project's independent surface, not one sprint's width → more agents at once.
- No idle dead-time: while one milestone gates/reviews/commits, unrelated tasks keep running.
- Earlier unlocking: a low-dependency task in "milestone 3" can start the moment its single dep (in
  "milestone 1") goes green — it never waits for the rest of milestone 1.
- Failure isolation: a blocked task freezes only its descendants; sibling milestones finish.
