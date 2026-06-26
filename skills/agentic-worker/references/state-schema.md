# agentic-worker — State & Schema Reference

All state files live under `plan/state/`. JSON. Updated after every transition.
The dashboard reads `plan/state/agents.json` over SSE.

---

## agents.json (live dashboard feed)

```json
{
  "project": "AI coding assistant competitive intelligence",
  "root": "project-slug",
  "phase": "Global DAG · 4 running, 3 queued of 11",
  "mode": "foreground",
  "startedAt": "2026-06-21T10:00:00.000Z",
  "strategy": {
    "name": "Global DAG",
    "how": "One dependency graph over all tasks; every task whose deps are green runs now (up to cap), spanning all domains at once; milestone gates block only their own cluster."
  },
  "reasoning": "4 agents in parallel — gather-T1 through T4 are all dep-satisfied; T5 queued for next free slot.",
  "progress": {
    "tasksDone": 4,
    "tasksTotal": 11,
    "pct": 36,
    "eta": "~8 min",
    "indeterminate": false
  },
  "updated": "2026-06-21T10:04:00.000Z",
  "caps": {
    "git": true,
    "memory": true
  },
  "tokens": {
    "in": 18240,
    "out": 7610,
    "total": 25850
  },
  "agents": [
    {
      "id": "gather-T1",
      "role": "gather",
      "label": "GitHub Copilot research",
      "agent_id": "research-agent",
      "status": "done",
      "detail": "context: memory(412 tok) + spec(280 tok) | web search complete, 3 sources",
      "note": "Copilot pricing confirmed: $19/seat Business, $39 Enterprise",
      "tokens": { "in": 4120, "out": 1830 }
    }
  ],
  "log": [
    { "t": "2026-06-21T10:00:00Z", "msg": "Stage 0 complete — domain: research + analysis + content" }
  ],
  "dag": {
    "summary": "3 milestones · 11 tasks. Research 5 products → analyze pricing + gaps → draft report sections.",
    "nodes": [
      { "id": "gather-T1", "role": "gather", "label": "Copilot research", "milestone": "m1", "status": "done" }
    ],
    "edges": [["gather-T1", "gate-m1"], ["gate-m1", "analyze-T6"]],
    "milestones": [
      { "id": "m1", "label": "Research" },
      { "id": "m2", "label": "Analysis" },
      { "id": "m3", "label": "Report" }
    ]
  },
  "prompt": {
    "id": "approve-plan",
    "title": "Approve the task plan?",
    "question": "Review the DAG in the Plan tab. Start running?",
    "options": ["Approve", "Change scope"],
    "openPlan": true,
    "answered": false
  }
}
```

**Field notes:**
- `role` values: `detect | plan | gather | transform | draft | analyze | review | coordinate | gate`
- `status` values: `spawning | working | done | blocked`
- `caps.memory: false` → dashboard shows memory-unavailable notice
- `prompt` → when present + `answered: false`, shows modal on dashboard
- `dag` → written ONCE at Stage 2, structure locked; only node `status` updates thereafter
- `progress.indeterminate: true` → animated sweep bar (use during domain detection + chromadb init)
- `tokens` (run-level) → drives the dashboard Tokens KPI. `{in, out, total}`. **Auto-measured:** the dashboard server reads the Claude Code session transcript (`~/.claude/projects/<slug>/*.jsonl`, slug = project root with non-alphanumerics → `-`) and sums real `message.usage` for every assistant message stamped at/after `startedAt` — the run-start snapshot. This overlays whatever the state file carries, so the KPI shows true whole-run spend (`in` = input+cache_read+cache_creation, `out` = output) even when no per-agent estimate was written. Requires `startedAt` to be set. The manual sum of done-signal `tokens` is now only a fallback when no transcript is found.
- `agents[].tokens` → per-agent consumption `{in, out}` copied from that agent's done-signal; shown in the card's verbose row and summed as the KPI fallback.
- `agents[].persona` (optional) → routed specialist `{ name, emoji, domain }` from the shared `agents/registry.json` (P6 — see `references/specialist-registry.md`); card shows name + emoji.
- `locks` (optional) → active write-claims mirrored from `locks.json` (P0): `[{ node, writes }]`; dashboard shows a 🔒 file-ownership strip. Source of truth is `locks.json` (see `references/file-ownership.md`).

---

## framework-state.json (crash-resume source of truth)

```json
{
  "project": "string",
  "stage": "preflight | detect | plan | build | done | blocked",
  "mode": "flat | hierarchical",
  "domain_classification": {
    "primary_domain": "research",
    "secondary_domain": "analysis",
    "tertiary_domain": "content",
    "ambiguity_flag": false,
    "ambiguity_note": null,
    "agent_roster": ["research-agent", "analysis-agent", "content-agent"]
  },
  "scheduler": {
    "dep_graph": {},
    "ready_queue": [],
    "in_flight": [],
    "done_set": [],
    "blocked_set": [],
    "max_concurrent": 4
  },
  "budget": { "max_tokens": null, "max_usd": null, "warn_pct": 0.8, "prices": {}, "state": "ok" },
  "unattended": false,
  "harness": "claude-code",
  "specialist_registry_path": null,
  "milestones": {},
  "blocked": [],
  "updated_at": "ISO timestamp"
}
```

---

## milestones.json (gate clusters)

```json
{ "milestones": [
  {
    "id": "m1",
    "label": "Research",
    "tasks": ["gather-T1", "gather-T2", "gather-T3", "gather-T4", "gather-T5"],
    "status": "done",
    "commit": null
  }
]}
```

---

## tasks/{FEAT}-tasks.json (per-feature task decomposition)

```json
[
  {
    "id": "gather-T1",
    "feature": "FEAT-001",
    "description": "Research GitHub Copilot — current pricing, features, IDE integrations, team plan",
    "agent_id": "research-agent",
    "scheduler_role": "gather",
    "output_type": "markdown_report",
    "output_file": "plan/state/tasks/gather-T1.md",
    "inputs": [],
    "milestone": "m1",
    "high_stakes": false,
    "acceptance_criteria": [
      "Current pricing tiers for individual and team plans documented",
      "Supported IDEs listed",
      "Team plan minimum seats noted",
      "Data recency within 30 days or flagged as stale"
    ],
    "domain": "research",
    "status": "pending"
  }
]
```

---

## answers.json (dashboard reverse channel)

Written by dashboard server `/answer` endpoint. Read by `wait-answer.mjs`.

```json
{ "approve-plan": { "value": "Approve", "at": "2026-06-21T10:01:00Z" } }
```

---

## control.json (undo/redo from dashboard)

```json
{ "requests": [
  { "id": "undo-m2-1", "action": "undo", "milestone": "m2", "notes": "", "at": "ISO", "handled": false }
]}
```

Checked at every scheduler loop boundary (never mid-wave).

---

## BLOCKED.md (written only on unrecoverable failure)

```markdown
# BLOCKED — {milestone_id}, task {task_id}

**Agent:** {agent_id}
**Attempts:** {n}/3
**Reason:** {blocked_reason from done-signal}
**Output file:** none written

**Files referenced:**
- {input files}

**What was tried:**
1. {attempt 1 summary}
2. {attempt 2 summary}

**Affected downstream tasks:** {list}

**Options:** debug together | skip task | abort run
```

---

## locks.json (runtime file-ownership — written by the scheduler at FILL SLOTS)

```json
{ "claims": [ { "node": "draft-T9", "writes": ["outputs/section-3.md"], "since": "ISO" } ] }
```
Claimed when a task enters `in_flight`, released on `done_set`/`blocked_set`; mirrored to `agents.json` `locks`. See `references/file-ownership.md`.

## events.jsonl (append-only replay/audit — see references/events-log.md)

One JSON object per line: `{ seq, t, type, ... }`. Types: `run.start`, `agent.start`, `agent.done`, `agent.blocked`, `gate.run`, `review.run`, `approval.ask`, `approval.answer`, `lock.claim`, `lock.release`, `cost.tick`, `budget.warn`, `budget.breach`, `control`, `run.end`. Served to the dashboard Replay tab via `GET /events-log`.

## .agentic-builder/memory.json (cross-session — PROJECT ROOT — see references/cross-session-memory.md)

Shared keyword memory (same file + schema as agentic-app-builder): `{ version, project, runs[], milestones{}, glossary }`. Loaded at Stage 0; a slice warm-starts the coordinator + analysis agents. Complements the chromadb vector memory (`memory-policy.md`), which stays per-project.

## specialist registry (shared — see references/specialist-registry.md)

The shared `agents/registry.json` (192 personas) is resolved via `agent-registry.json` → `specialist_registry.resolution_order`; the dispatcher injects a matched persona into the generic agent. No match / absent → plain generic agent.
