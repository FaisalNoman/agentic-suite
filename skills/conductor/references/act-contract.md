# Conductor — ACT-PLAN.json contract (Phase 1, design draft)

The optional **ACT** stage (BUILD → GROW → **ACT**) turns GROW's plans/content into *ship-ready* output.
**Phase 1 is inherently safe**: it only ever writes files under `act/` — nothing is posted, sent, deployed, or
spent. Two executors:

- **Executor A — build** → loops a software deliverable back into **agentic-app-builder** (reuses the whole BUILD
  engine + gate). **Approval-gated** (a build is heavy; never auto-spawned).
- **Executor B — artifact** → transforms a deliverable into ship-ready artifacts + a tagged task checklist. Safe
  (file-only), runs without approval.

> **Status:** design draft. The ACT stage is NOT built yet. This contract is the schema the stage will read/write
> when Phase 1 is greenlit. Phase 2 (opt-in MCP connectors: deploy / schedule / draft-send, behind dry-run +
> per-action approval) and Phase 3 (direct posting / sending / ads) are out of scope here.

## Locked decisions
1. **Gating** — ACT is offered ONLY when GROW produced ≥1 deliverable with `class ∈ {software, publishable}`.
   Pure-`plan`-only output → ACT not offered (the deliverables are simply noted).
2. **Build approval** — `executor:"build"` deliverables require explicit approval before the build spawns.
3. **Executor-B formats** — confirmed defaults:

| Class / channel | Artifacts |
|---|---|
| `publishable` · social | `tweets.json` (queue: text ≤280, order, suggested_time) + `tweets.txt` |
| `publishable` · email | `emails/<n>.eml` drafts (To/Subject/body) — drafts, never sent |
| `publishable` · email-sequence | `sequences/<id>-<seq>-NN.eml` (numbered drafts) + `<seq>.md` index — from `sequences:[{name,steps:[{step,delay,to,subject,body}]}]`; bulk send never auto-run |
| `publishable` · ad-set | `<id>.ads.csv` from `ads:[{platform,campaign,headlines[],descriptions[],keywords[],audience,budget}]` — validated (Google headline ≤30 / desc ≤90); **never auto-launched** (paid-ads) |
| `publishable` · blog/cms | `posts/<slug>.md` (CMS front-matter) + `assets.md` |
| `plan` (GTM/roadmap) | `gtm-tasks.json` + `gtm.csv` (Jira/Linear/Sheets import) |
| **every** deliverable | `<id>.tasks.md` — checklist, each task tagged `automatable` / `human` |

## Schema (illustrative example — not defaults)

`ACT-PLAN.json` lives at the suite top level; the conductor writes it from `grow/outputs/` + `HANDOFF.json`.

```json
{
  "schema": 1,
  "generated_at": "2026-06-28T00:00:00Z",
  "source": "grow/outputs/",
  "act_mode": "artifacts | build+artifacts",

  "gate": {
    "offered": true,
    "reason": "2 software/publishable deliverables found",
    "trigger_rule": "offer ACT only when >=1 deliverable.class in [software, publishable]"
  },

  "formats": {
    "social": ["tweets.json", "tweets.txt"],
    "email": ["eml-drafts"],
    "blog": ["cms-markdown"],
    "plan": ["tasks-json", "tasks-csv"],
    "always": ["tasks-md"]
  },

  "deliverables": [
    {
      "id": "act-001",
      "source": "grow/outputs/landing-page.md",
      "title": "Landing page",
      "class": "software",
      "channel": null,
      "executor": "build",
      "approval": { "required": true, "status": "pending", "at": null },
      "status": "pending",
      "outputs": [],
      "tasks": [],
      "build_ref": { "dir": "act/landing-page/", "framework_state": null, "result": null },
      "error": null, "started_at": null, "completed_at": null
    },
    {
      "id": "act-002",
      "source": "grow/outputs/launch-tweets.md",
      "title": "Launch tweets",
      "class": "publishable",
      "channel": "social",
      "executor": "artifact",
      "approval": { "required": false, "status": "auto", "at": null },
      "status": "done",
      "outputs": [
        { "path": "act/tweets.json", "kind": "post-queue" },
        { "path": "act/tweets.txt", "kind": "copy-paste" },
        { "path": "act/act-002.tasks.md", "kind": "checklist" }
      ],
      "tasks": [
        { "id": "t1", "text": "Post launch thread (5 tweets)", "auto": "automatable", "channel": "social", "status": "ready" },
        { "id": "t2", "text": "Pin tweet 1 to profile", "auto": "human", "channel": "social", "status": "ready" }
      ],
      "build_ref": null,
      "error": null, "started_at": "…", "completed_at": "…"
    },
    {
      "id": "act-003",
      "source": "grow/outputs/go-to-market.md",
      "title": "Go-to-market plan",
      "class": "plan",
      "channel": null,
      "executor": "artifact",
      "approval": { "required": false, "status": "auto", "at": null },
      "status": "done",
      "outputs": [
        { "path": "act/gtm-tasks.json", "kind": "task-list" },
        { "path": "act/gtm.csv", "kind": "import-csv" },
        { "path": "act/act-003.tasks.md", "kind": "checklist" }
      ],
      "tasks": [
        { "id": "g1", "text": "Publish landing page (act-001)", "auto": "automatable", "channel": "web", "status": "ready", "depends_on": "act-001" },
        { "id": "g2", "text": "Set launch-week pricing", "auto": "human", "channel": null, "status": "ready" }
      ],
      "build_ref": null,
      "error": null, "started_at": "…", "completed_at": "…"
    }
  ],

  "summary": {
    "total": 3,
    "by_class": { "software": 1, "publishable": 1, "plan": 1 },
    "by_executor": { "build": 1, "artifact": 2 },
    "automatable_tasks": 2, "human_tasks": 2,
    "pending_approval": ["act-001"]
  },
  "updated_at": "2026-06-28T00:00:00Z"
}
```

## Field reference
- **`gate`** — decision 1. ACT is only written/offered when `deliverables` has ≥1 `class ∈ {software, publishable}`.
- **`class`** — `software` (build-type) · `publishable` (content with a target channel) · `plan` (task list/strategy).
- **`executor`** — `build` (→ agentic-app-builder) or `artifact` (→ Executor B). Exactly one per deliverable.
- **`channel`** — for `publishable`: `social | email | blog | cms | null`. Selects the Executor-B format set.
- **`approval`** — decision 2. `executor:"build"` ⇒ `required:true`, `status:"pending"`; the build never spawns until
  `status:"approved"`. `executor:"artifact"` ⇒ `required:false`, `status:"auto"` (file-only, no outward action).
- **`tasks[].auto`** — `automatable` vs `human`, so plans stay honest (org tasks listed, not pretended).
  `depends_on` may reference another deliverable id (e.g. a GTM task that needs the built landing page).
- **`build_ref`** — for `build` deliverables: pointer to the spawned build's `dir` + `framework-state.json` + gate
  `result` (so ACT tracks/resumes it like Stage 2.5 tracks the main build).
- **`status`** (per deliverable) — `pending | running | done | blocked | skipped`. **Idempotent resume** keys off `done`.
- **Phase-1 invariant** — every `outputs[].path` is under `act/`. No credentials, nothing posted/sent/deployed.
  (Phase 2 would add `channel_auth`, `dry_run`, and per-task `executed_at`.)

## How it's produced / consumed
- **Produced** — the conductor's ACT stage scans `grow/outputs/`, classifies each `.md`, writes `ACT-PLAN.json`.
  If `gate.offered` is false → stop (decision 1).
- **Approval** — for `build` deliverables, the conductor surfaces a dashboard approval prompt; on Approve it flips
  `approval.status`, spawns the build, and fills `build_ref`.
- **Artifacts** — `artifact` executors run immediately (safe), writing the confirmed formats + each `<id>.tasks.md`.
- **Consumed** — the showcase gains an ACT section linking every `outputs[].path`; `/suite-resume` reads
  `ACT-PLAN.json` to report what's built / ready / pending-approval.

## File layout (Phase 1)
```
act/
  ACT-PLAN.json          (top-level, alongside suite-state.json / HANDOFF.json)
  landing-page/          Executor A — a built site (its own plan/ + dashboard, gated)
  tweets.json  tweets.txt
  emails/<n>.eml
  gtm-tasks.json  gtm.csv
  <id>.tasks.md          per-deliverable checklists
```

## Effort / maintenance (Phase 1)
- Executor A: **Low** — a `deliverable → build_brief` synthesizer + conductor routing; reuses BUILD wholesale.
- Executor B: **Low-Med** — per-type artifact templates + 1–2 zero-dep `.mjs` formatters/validators (tweets/csv/eml).
  No external APIs → **low maintenance**, no credential surface.
