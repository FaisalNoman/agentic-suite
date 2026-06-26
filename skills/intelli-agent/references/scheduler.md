# intelli-agent — Global DAG Scheduler

This is the heart of intelli-agent. One global dependency graph over the whole
task set. No sprint barriers. Every task whose dependencies are met runs now
(up to the concurrency cap), across all domains and milestones at once.

---

## Core data structure (in framework-state.json)

```json
{
  "scheduler": {
    "dep_graph": {
      "gather-T1": [],
      "gather-T2": [],
      "analyze-T6": ["gate-m1"],
      "gate-m1": ["gather-T1", "gather-T2", "gather-T3"],
      "draft-T9": ["gate-m2"]
    },
    "ready_queue": ["gather-T1", "gather-T2"],
    "in_flight": [],
    "done_set": [],
    "blocked_set": [],
    "max_concurrent": 4
  }
}
```

---

## Concurrency cap formula

Compute ONCE after the global DAG is finalized in Stage 2. Store in
`scheduler.max_concurrent`. Never recompute mid-run.

```
MAX_CONCURRENT = min(total_task_count, max(4, ceil(total_task_count / 3)))
```

Also clamp: `min(MAX_CONCURRENT, 16)` — hard ceiling regardless of task count.

For the hierarchical threshold (≥ 12 tasks), the root orchestrator's
`max_concurrent` governs sub-orchestrator team dispatch, not individual tasks.

---

## Scheduler loop (run once, drains the whole DAG)

```
SEED: ready_queue = all nodes with empty dep_graph entry (no dependencies)

LOOP:
  0. BUDGET CHECK — if a cap is set, run token-report.mjs, estimate USD; warn at warn_pct, pause +
     approval at 100% (do NOT dispatch until resolved). See references/budget.md. Emit budget.warn/breach.

  1. CONTROL CHECK — read plan/state/control.json for any unhandled undo/redo
     requests. Process at loop boundary (never mid-wave). See SKILL.md §D.

  2. FILL SLOTS — dispatch up to MAX_CONCURRENT tasks from ready_queue in ONE
     assistant message (all Agent tool calls in a single message — MANDATORY).
     SKIP any ready task whose `writes` overlap an in_flight task's writes or a sibling picked this wave
       (file-ownership guard — deferred tasks stay queued; references/file-ownership.md); claim taken
       tasks in plan/state/locks.json (mirror to agents.json `locks`).
     For each task: select a specialist persona via references/specialist-registry.md (inject it; none →
       plain generic agent) and pass the agent's tier `model` from agent-registry.json.
     Move dispatched tasks: ready_queue → in_flight.
     Write agents.json card per task with status: "working" (incl. `persona`) BEFORE the Agent calls.
     Append agent.start + lock.claim events to events.jsonl (references/events-log.md).

  3. AWAIT — wait for all in_flight agents to return.

  4. PROCESS RETURNS — for each returned agent:
     a. Parse done-signal JSON (retry once with "Reply with raw JSON only." if needed)
     b. status: "green"  → move to done_set; release its locks.json claim; check high_stakes_auto_review;
        append agent.done + lock.release + cost.tick events
     c. status: "blocked" → move to blocked_set; release its locks.json claim; write BLOCKED.md; mark DAG
        descendants blocked; append agent.blocked + lock.release events
     d. For green: check if any waiting task's ALL deps are now in done_set
        → add to ready_queue
     e. For blocked: mark descendant nodes blocked immediately (don't wait)

  5. HIGH_STAKES_AUTO_REVIEW — if agent.high_stakes_auto_review=true AND task is green:
     auto-insert review-T{N} node into dep_graph as dependency BEFORE the task's
     downstream gate. Spawn review-agent immediately (counts against MAX_CONCURRENT).
     If review passes (pass: true, score ≥ 0.70) → proceed normally.
     If review fails (pass: false) → spawn fix iteration (bounded: max 2 retries total).
     After 2 failed reviews → write BLOCKED.md for that task, mark blocked.

  6. UPDATE STATE — write framework-state.json (scheduler block) + agents.json
     (card statuses + progress + reasoning).

  7. GATE CHECK — for each milestone gate node in dep_graph: if all its listed
     dependencies are in done_set → dispatch gate agent (coordinator-agent in gate mode).
     Gate is a regular DAG node — it unlocks its own downstream tasks when it completes.

  8. TERMINATE when ready_queue is empty AND in_flight is empty.
     If blocked_set is non-empty: surface BLOCKED.md, offer debug/skip/abort.

PERSIST: write framework-state.json after every iteration.
```

---

## Hierarchical threshold

After the global DAG is finalized, count total tasks (gate nodes excluded):

**< 12 tasks:** flat mode. You (orchestrator) run the single global scheduler
above. Set `framework-state.json: { "mode": "flat" }`.

**≥ 12 tasks:** hierarchical mode. Set `{ "mode": "hierarchical" }`.
Partition the DAG into 2–4 weakly-connected sub-graphs (cut on sparsest edges,
minimise cross-partition dependencies). Spawn one sub-orchestrator Agent per
partition. Each sub-orchestrator runs the scheduler above on its sub-graph.
Cross-partition edges are the only synchronisation you (root) enforce.
Root max: 4 sub-orchestrators. Merge if partitioning would produce more.

---

## Milestone gates

A gate is a DAG node with id `gate-{M}` (or `review-{M}`, `commit-{M}`).
It blocks only its own cluster's downstream tasks — NOT the whole DAG.
Sibling milestones whose deps are met continue running through any gate.

Gate agent is always `coordinator-agent` in gate mode. It:
1. Reads all output files from the milestone's tasks
2. Checks completeness against the milestone's acceptance criteria
3. Flags gaps (proxy data, missing fields, low confidence)
4. Returns a done-signal — gate node moves to done_set if green
5. If blocked: writes a gap report, spawns targeted re-work (bounded: 1 retry)

---

## Bounded fix loops

- Worker agent fix loop: ≤ 3 total attempts (initial + 2 retries)
- High-stakes review fix loop: ≤ 2 total review passes
- Gate gap fix loop: ≤ 1 targeted re-work per gap
- After limits: mark blocked, write BLOCKED.md, continue independent tasks

---

## Crash-resume rule

On startup, read `plan/state/framework-state.json`. If present:
- `done_set` tasks → skip
- `in_flight` tasks → treat as interrupted, re-queue in `ready_queue`
- `blocked_set` tasks → surface on dashboard, offer to skip/retry/abort
- `ready_queue` tasks → dispatch immediately

Print a resume summary to the dashboard before continuing.
