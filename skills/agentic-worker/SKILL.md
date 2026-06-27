---
name: agentic-worker
description: USE THIS FOR ANY general-purpose multi-domain task that benefits from parallel specialist agents — research, analysis, content writing, data processing, and code. Autonomous multi-agent orchestrator: classifies the task domain, routes to specialized agents via a registry, runs them on a global dependency-graph scheduler with milestone gates, validates outputs with a review agent, and produces final results. No API key needed. Runs entirely in your Claude Code session. Trigger on ANY of: "research and analyze", "gather data and produce a report", "investigate and recommend", "analyze and summarize", "research competitors", "produce a competitive intelligence report", "research X and write Y", "analyze my data and", "find and compare", "look into and recommend", or any multi-step task spanning research + analysis + content + data.
---

# agentic-worker — General-Purpose Multi-Agent Orchestrator

Autonomous task decomposition → specialist agent dispatch → validated output pipeline.
Runs in-session under Claude Code. No API key. No separate service. Uses your subscription.

---

## Operating rules (read first, apply always)

1. **Domain-first.** Before any planning, detect the task's domain(s) using `references/domain-detector.md`. The domain controls which agents run and which review criteria apply. Never skip domain detection.

2. **Registry-driven dispatch.** Every agent spawned must be in `references/agent-registry.json`. Never spawn a generalist subagent outside the registry. The registry provides `agent_id`, `prompt_template`, `context_budget_tokens`, `scheduler_role`, and `output_type` for every task.

3. **Persist state.** Write to `plan/state/framework-state.json` after every phase. On re-run, read it, summarise progress, and resume — skip done tasks, re-queue interrupted ones.

4. **Isolated writes + runtime ownership guard.** Each subagent owns exactly ONE output file. Only the orchestrator (you) reads multiple agents' outputs and merges. Never let two agents write the same file — enforced at RUNTIME too: tasks declare `writes:[globs]` and the scheduler defers any ready node whose writes overlap an in-flight node's (claims in `plan/state/locks.json`, mirrored to `agents.json` `locks`). See `references/file-ownership.md`.

5. **Context_slice is mandatory.** Before every Agent tool call, apply `references/context-utils.md` to build the agent's context. Never pass full task descriptions or all prior outputs to a specialist agent.

6. **Bounded loops.** Worker fix loop ≤ 3 attempts. High-stakes review loop ≤ 2 passes. Gate re-work ≤ 1 retry per gap. After limits: write BLOCKED.md, mark blocked, continue independent tasks.

7. **Parallel fan-out is MANDATORY, not optional.** When N tasks are ready simultaneously, emit N Agent tool calls in ONE assistant message. Never spawn one agent, wait, then spawn the next for independent tasks. The DAG encodes dependencies — trust it.

8. **CARD-BEFORE-OP.** Write `agents.json` with `status: "working"` for an agent BEFORE spawning it. No silent gaps on the dashboard. Long operations (domain detection, chromadb init, large merges) get a card BEFORE running.

9. **Dashboard-primary interaction.** All user questions and approvals go to the dashboard FIRST via ONE Bash call: `node plan/dashboard/ask-dashboard.mjs --id … --question … [--options "a,b"] --timeout 600` (Bash `timeout: 600000`). It writes the prompt card AND blocks for the answer — so the modal always appears. Fall back to `AskUserQuestion` ONLY on its non-zero exit. Never call the CLI first while the dashboard is live.

10. **Parse done-signals as JSON.** Every subagent returns a JSON done-signal. Retry once with "Reply with raw JSON only." if parsing fails. Two failures = blocked.

11. **Memory is optional.** If `caps.memory = false` (chromadb unavailable), all agents get `memory_budget_tokens: 0`. Run proceeds normally. Log one notice on the dashboard.

12. **No credentials.** This skill needs no API key. If a task requires external auth, surface it to the user and wait — don't silently fail.

---

## STAGE 0 — Preflight

### Step 0 — Resume check (always first)

Check for `plan/state/framework-state.json`. If present → **RESUME**: read it, print a progress table (done/in-progress/pending stages), and jump to the right stage. Skip all of Stage 0.

### Step 1 — Directory setup

Create `plan/docs/`, `plan/state/tasks/`, `plan/state/gates/`, `plan/state/memory/`, `outputs/`.
Initialize `plan/state/locks.json` → `{ "claims": [] }` (runtime file-ownership — `references/file-ownership.md`)
and `plan/state/events.jsonl` → empty (append-only replay/audit log — `references/events-log.md`).
**Cross-session memory (see `references/cross-session-memory.md`):** check for `.agentic-builder/memory.json`
at the project root; if present, load it and build the keyword-filtered `PRIOR_RUNS_CONTEXT` slice for the
coordinator + analysis agents (warm start, shared with agentic-app-builder). If absent, skip silently.
**Lessons ledger (warm-start):** also run `node scripts/lessons-merge.mjs warm --domain <primary_domain>` and
inject its output into the coordinator prompt — distilled lessons from prior runs. Skip silently if empty.

### Step 2 — Capability check

Check git availability: `git --version`. Set `caps.git = true|false`.
Check chromadb: attempt `python3 -c "import chromadb"`. Set `caps.memory = true|false`.
If memory unavailable: print one notice. Continue.
If the user asked for an unattended / headless / CI run, set `unattended: true` (see `references/unattended-mode.md`).
Detect the host harness and record `harness` (default `claude-code`); on a non-Claude-Code harness, map
primitives + degrade per `references/harness-adapters.md`.

### Step 3 — Dashboard launch

Copy the dashboard template → `plan/dashboard/`, then start: `node plan/dashboard/server.mjs`.
**Resolve the template from THIS skill's base directory** (absolute path in the skill header): copy
`<skill-base>/template/dashboard/` → `./plan/dashboard/`. Do NOT assume it sits under the cwd — that
breaks when run **nested** (e.g. by the agentic-suite conductor). Mandatory in every run, including nested.
**Order is fixed:** (1) START THE SERVER — `node plan/dashboard/server.mjs` (background); (2) wait for
`plan/state/dashboard.json`, read its `url`; (3) open THAT `http://localhost:<port>` URL. **NEVER open
`index.html` as a file (`file://…`)** — without the server there is no SSE and the board is dead.
It auto-selects a free port (base 4318, steps up if busy) and writes `plan/state/dashboard.json`.
Open it: Windows `cmd /c start "" {url}` · macOS `open {url}` · Linux `xdg-open {url}`.
Print: "Dashboard live: {url}".

**Also copy the showcase generator** the same way: `<skill-base>/template/showcase/` → `./plan/showcase/`
(nothing to start now — it runs once at Stage 5). Same nested-safe base-dir resolution as the dashboard.
Write initial `agents.json` with `detect` card `status: "working"`. **Set `startedAt` to the current ISO timestamp here** — this is the run-start snapshot the dashboard uses to measure real token spend from the session transcript. Without it the Tokens KPI cannot isolate this run. **Also set `cwd` once = the ABSOLUTE path of the directory where `claude` launched (the session CWD, NOT `grow/` or a worktree subdir)** — the server reads it to find the session transcript; without it nested (conductor) and worktree runs show 0 tokens.

### Step 4 — Foreground vs background

Ask once via dashboard-first protocol: watch live (foreground, default) or run quietly (background)?
Set `display_mode` in `agents.json`.

**Budget cap (optional, ask once).** Offer an optional token/USD soft cap (leave blank = unlimited),
stored under `budget` in `framework-state.json`; the scheduler warns at 80% and pauses for approval at
100%. See `references/budget.md`. Model tiering (cheaper models for worker agents) is set per agent in
`references/agent-registry.json`.

---

## STAGE 1 — Domain detection

Write `detect` card to `agents.json` with `status: "working"` and `detail: "classifying task domain"`.

Run the domain classifier from `references/domain-detector.md`. This is a fast internal LLM call — not a subagent, not an Agent tool call. Parse the JSON response.

Write `domain_classification` to `framework-state.json`:
```json
{
  "primary_domain": "research",
  "secondary_domain": "analysis",
  "tertiary_domain": "content",
  "ambiguity_flag": false,
  "agent_roster": ["research-agent", "analysis-agent", "content-agent"]
}
```

If `ambiguity_flag` is true and threshold is met (see domain-detector.md): write dashboard prompt, block on `wait-answer.mjs confirm-domain 120`, update classification with user's choice.

Mark `detect` card `done`. Write `reasoning` to `agents.json` explaining the classification and why.

---

## STAGE 2 — Requirements and bring-your-own-docs gate

### Bring-your-own-docs gate

Tell the user: "I created `plan/docs/`. If you have requirement documents or briefs, copy them there now. Have you added your own files? (Yes / No)"

Ask via dashboard-first protocol. If Yes and files are present → read them and skip the interview. If No → run the interview below.

### Interview (only when no docs provided)

Keep it brief. One round of questions via dashboard. Cover:
- What is the end deliverable? (report / analysis / dataset / code / combination)
- What are the key questions to answer or goals to achieve?
- Any constraints (format, length, sources to use or avoid, deadline)?
- Any context the agents need that isn't in the task prompt?

Write a `TASK.md` to `plan/docs/` with the task description, goals, constraints, and deliverable format. This is the coordinator-agent's input.

---

## STAGE 3 — Task decomposition and DAG planning

**Dashboard:** `plan` card `status: "working"`.

Spawn `coordinator-agent` in **decompose mode**. Pass: `TASK.md` + domain classification + agent roster.

Coordinator-agent produces `plan/state/tasks/` files with FEAT-xxx task entries per `references/agent-contracts.md` (coordinator decompose mode).

**Build global DAG:**
- Each task entry becomes a DAG node with `agent_id`, `scheduler_role`, `output_type`
- `inputs: []` = no deps = ready at start (parallel candidates)
- `inputs: [task_id, ...]` = deps = must wait
- Milestone gates (`gate-m1`, `gate-m2`, ...) added as DAG nodes depending on all tasks in their cluster
- High-stakes tasks: check `agent_registry[agent_id].high_stakes_auto_review`. If true, auto-insert `review-{task_id}` node as dep before the downstream gate

**Concurrency cap:**
```
MAX_CONCURRENT = min(total_task_count, max(4, ceil(total_task_count / 3)))
```
Clamp: `min(MAX_CONCURRENT, 16)`.

**Hierarchical threshold:** if total_task_count ≥ 12, set `mode: "hierarchical"` in framework-state. Partition DAG into 2–4 sub-graphs.

**Write DAG to `agents.json`** (the `dag` field — written ONCE, structure locked):
```json
{
  "summary": "{{N}} milestones · {{M}} tasks. {{one-line flow description}}",
  "nodes": [ ... ],
  "edges": [ ... ],
  "milestones": [ ... ]
}
```

**Plan approval via dashboard:** ONE Bash call (Bash `timeout: 600000`): `node plan/dashboard/ask-dashboard.mjs --id approve-plan --title "Approve the plan?" --question "Open the Plan tab to review the flow. Start?" --options "Approve,Change scope" --open-plan --timeout 600`. It pops the modal AND waits — never hand-write the card or skip it. Fall back to `AskUserQuestion` only on its non-zero exit. Never build without approval.

Mark `plan` card `done`.

---

## STAGE 4 — Build loop (global scheduler)

Load `references/scheduler.md`. Run the scheduler loop exactly as specified there.

Before each Agent dispatch batch:
1. Apply `references/context-utils.md` per agent type
2. Select a specialist persona for the task via `references/specialist-registry.md` and inject it into the
   generic agent's prompt (none / low-confidence → plain generic agent). Pass the agent's tier `model`.
3. Skip any task whose `writes` overlap an in-flight task's (file-ownership; claim `locks.json`) — `references/file-ownership.md`
4. Write `agents.json` cards for all about-to-dispatch agents (`status: "working"`, incl. `persona` if set)
5. Emit all Agent tool calls in ONE message (mandatory fan-out)
6. Append `agent.start` + `lock.claim` events to `events.jsonl` (`references/events-log.md`)

The scheduler also checks the budget cap at each loop top and releases locks + appends `agent.done`/
`agent.blocked` + `cost.tick` events as agents return (see `references/scheduler.md`, `budget.md`, `events-log.md`).

After each batch returns:
1. Parse all done-signal JSONs
2. Update `agents.json` cards (status, note, detail). Copy each done-signal's `tokens {in,out}` onto its card for the per-agent verbose row. The run-level `tokens` KPI is now **auto-measured** by the dashboard server from the session transcript since `startedAt` (set it once at run start) — you no longer need to maintain the run-level aggregate by hand; the per-agent estimates are just a fallback.
3. Update `framework-state.json` scheduler block (done_set, ready_queue, blocked_set)
4. Handle high-stakes auto-review (spawn review-agent if triggered)
5. Check for newly unblocked tasks → add to ready_queue
6. Check for ready gate nodes → dispatch coordinator-agent in gate mode

Continue until `ready_queue` empty AND `in_flight` empty.

---

## STAGE 5 — Final assembly and output

**Dashboard:** `coordinate` card `status: "working"`, `detail: "merging final output"`.

Spawn `coordinator-agent` in **merge mode**. Pass: all final task output files from `plan/state/tasks/`, the merge sequence from the milestone order.

Coordinator-agent writes the final output to `outputs/`.

If contradictions found in merge (done-signal `coherence_issues` non-empty):
1. Surface contradictions on dashboard via prompt
2. Ask user to resolve or accept one side
3. Re-run merge with resolution applied

Write final summary to `agents.json` log:
```
{ "t": "...", "msg": "Run complete. Output: outputs/{file}. Tasks: {N} done, {K} blocked." }
```

### Showcase — interactive HTML of all deliverables (auto, every run)

After the merge writes `outputs/`, build a single self-contained showcase page from every `.md` under it:

```
node plan/showcase/build-showcase.mjs outputs "<product/run title>"
```

- Zero-dependency, build-time render — converts each `.md` → HTML and inlines it, so `outputs/showcase.html`
  works offline over `file://` (no CDN, no server). It scans `outputs/` recursively, builds a searchable
  sidebar (grouped by sub-folder), a reading pane with per-doc table of contents, and a theme toggle.
- Title: use the product name (under the conductor, the `HANDOFF.json` `product`); else the run/folder name.
- It prints the written path on stdout and exits 1 if no `.md` were found (skip silently in that case).
- **It auto-opens the page in the OS default browser when ready** (it's a `file://` page, opened via the OS).
  For **unattended/CI** runs pass `--no-open` to suppress: `node plan/showcase/build-showcase.mjs outputs "<title>" --no-open`.
- Best-effort — never fail the run if generation/opening errors; just note it in the log.

Add the path to the final `agents.json` log and the CLI summary.

**Capture lessons (cross-run learning).** Before finishing, distill 3–8 atomic lessons from this run's
signals — review-gate gaps, fix-loop counts, BLOCKED.md, domain-classification corrections, and user
amendments — as `{scope:"global"|"domain", trigger, lesson, confidence, domain?}`, write to a temp JSON
array, and run `node scripts/lessons-merge.mjs merge <file>` (dedupes + warms the next run). Best-effort;
keep lessons general + reusable.

Mark `coordinate` card `done`.

Print to CLI: "Done. Output: `outputs/{file}` · Showcase: `outputs/showcase.html`"

---

## Live dashboard

Drives the same dashboard used by agentic-app-builder (template/dashboard/ is the same zero-dependency Node server). You drive it by writing `plan/state/agents.json`.

Key differences from agentic-app-builder dashboard behaviour:
- `role` values reflect agentic-worker roles: `detect | plan | gather | transform | draft | analyze | review | coordinate | gate`
- `strategy.name` uses: `Global DAG | Fan-out / Fan-in | Pipeline | Sequential | Hierarchical | Single`
- `reasoning` explains domain routing decisions, not SDLC phase choices
- DAG node labels show domain: "Copilot research (research)" not "impl-FEAT-001-T1"

Progress bar weights (GREENFIELD equivalent):
`detect 5 · plan 10 · build 70 · merge 10 · done 5`

Update `progress.pct` and `progress.step` at every sub-phase within `plan` and `merge` to prevent 0%→jump freezes.

---

## Dashboard interaction (identical to agentic-app-builder)

**Asking questions / approvals:**
1. **One Bash call** writes the card AND waits: `node plan/dashboard/ask-dashboard.mjs --id {id} --title "{t}" --question "{q}" [--options "a,b"] [--open-plan] [--open-url {url}] --timeout {sec}` — **pass the Bash tool `timeout` ≥ {sec}×1000 ms** (e.g. `600` → `timeout: 600000`; the 120000ms default kills the wait at 2 min). It pops the modal so you can no longer forget to write the card (the reported silent-dashboard bug).
2. Exit 0 → the chosen value is on stdout (JSON); the helper already set `answered:true` (modal closes). Parse + proceed.
3. Exit 2 (timeout) or error → ONLY THEN fall back to `AskUserQuestion` CLI. Never call the CLI before the helper returns non-zero.

**Milestone undo/redo:** same `control.json` → `control` route mechanism as agentic-app-builder. Check at scheduler loop boundary. Undo requires `caps.git: true`.

---

## Reference files (load when you reach that stage)

- `references/domain-detector.md` — classifier prompt (Stage 1)
- `references/agent-registry.json` — agent catalogue and routing table (Stages 3–4)
- `references/memory-policy.md` — vector memory rules (Stages 3–4)
- `references/scheduler.md` — global DAG scheduler (Stage 4)
- `references/context-utils.md` — context_slice per agent type (Stage 4, every dispatch)
- `references/agent-contracts.md` — done-signal JSON schemas (Stage 4)
- `references/state-schema.md` — all JSON file schemas (Stages 0–5)
- `references/file-ownership.md` — runtime write-conflict guard (Stage 4 dispatch)
- `references/budget.md` — token/USD soft caps (Stage 0 + scheduler loop top)
- `references/cross-session-memory.md` — shared `.agentic-builder/memory.json` warm-start (Stage 0)
- `scripts/lessons-merge.mjs` — cross-run lessons ledger (`.agentic-builder/lessons.json`): warm at planning, merge at Stage 5; shared with agentic-app-builder
- `references/events-log.md` — append-only events.jsonl → dashboard Replay tab (Stage 4)
- `references/unattended-mode.md` — no-human-in-the-loop / CI runs (Stage 0)
- `references/harness-adapters.md` — multi-harness primitive mapping (Stage 0)
- `references/specialist-registry.md` — route to a specialist persona from the shared `agents/registry.json` (Stage 4 dispatch)
- `template/showcase/build-showcase.mjs` — zero-dep generator: all `outputs/**/*.md` → one interactive `outputs/showcase.html` (Stage 5, auto)
- `references/review-criteria/default.md` — base review checklist (review-agent)
- `references/review-criteria/research.md` — research domain additions
- `references/review-criteria/analysis.md` — analysis domain additions
- `references/review-criteria/code.md` — code domain additions
- `references/prompts/{agent}.md` — loaded per agent at dispatch time, not upfront

Load each reference file only when you reach the stage that needs it. Do not pre-load all references at Stage 0.
