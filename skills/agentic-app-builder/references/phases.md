# AB — Phase agent prompts (global-DAG edition)

Exact prompts/specs for each phase. You (orchestrator) fill in `{placeholders}` from interview +
state. Spawn each subagent with the Agent tool, `subagent_type: "general-purpose"`. Every spec must
name: files to READ, what to PRODUCE, the WRITE PATH, and the DONE SIGNAL file.

---

## Incremental Synthesis Protocol

Do NOT wait for all in-flight agents before synthesizing. Use rolling merge instead.

### Synthesis buffer: plan/state/synthesis-buffer.json

ONE buffer for the whole project (the scheduler runs once). Initialize at scheduler start
(write `{}` if not present):
```json
{
  "scope": "global",
  "merged_tasks": [],
  "pending_tasks": ["FEAT-001-T1", "FEAT-001-T2"],
  "running_manifest": { "files_written": [], "tests_passing": 0, "tests_total": 0 },
  "by_milestone": { "data": { "files_written": [], "tests_passing": 0 } },
  "last_updated": "2026-06-15T00:00:00Z"
}
```

### On each agent completion (in scheduler COMPLETION step)

Immediately after an agent returns:
1. Read its JSON output (per agent-contracts.md)
2. Merge into `running_manifest` AND `by_milestone[its milestone]`:
   - impl: append `files_written`; if `tests_passing=true`, increment `tests_passing`
   - tdd: add `test_count` to `running_manifest.tests_total`
   - architect: note `types_defined` (informational only)
3. Move task from `pending_tasks` → `merged_tasks` in synthesis-buffer.json
4. Update `last_updated`
5. Update `progress.tasksDone` in agents.json
6. Do NOT re-read this agent's output files again in milestone synthesis

### Per-milestone synthesis (when a `gate-{M}` node becomes ready)

The gate fires per milestone, NOT at end-of-sprint. When `gate-{M}` runs:
1. Read `by_milestone[M]` from synthesis-buffer.json — that milestone's accumulated result
2. Run the integration gate against its `files_written` (full suite — catch cross-milestone regressions)
3. Write `plan/state/milestone-{M}-summary.json`:
   ```json
   { "milestone_id": "M", "files_written": [], "tests_passing": 0, "tests_total": 0, "blocked_tasks": [] }
   ```
4. Mark milestone `done` in `milestones.json` + framework-state.json after its `commit-{M}` node.

### Final synthesis (when the whole scheduler loop ends)

After every node is in done_set + blocked_set: write `plan/docs/BUILD-SUMMARY.md` from
`running_manifest` + all `milestone-*-summary.json`, then delete synthesis-buffer.json.

### Exception

review agents always do full synthesis (they need the full diff). Single agent,
not a fan-out — this is acceptable.

---

## Phase 1 — PRD ingestion → backlog (you do this, not a subagent)

Read `plan/docs/PRD.txt` + `FEATURES.txt` in full. For every feature emit a JSON entry:

```json
{ "id": "FEAT-001", "title": "...", "description": "...",
  "acceptance_criteria": ["..."], "dependencies": ["FEAT-000"],
  "complexity": "S|M|L|XL", "domain": "auth|payments|ui|infra|..." }
```

Write all entries → `plan/state/backlog.json`. Validate: no missing ids, deps resolve.

## Phase 2 — Task decomposition + global DAG + milestone gates (you do this, not a subagent)

NO sprint buckets. Decompose every feature into atomic tasks (each maps to exactly ONE file) and
subtasks (each a single function/route/component). Write `plan/state/tasks/{FEAT}-tasks.json`:

```json
{ "task_id": "FEAT-003-T1", "file": "src/auth/login.service.ts", "module": "api",
  "milestone": "api",
  "subtasks": [
    { "id": "ST-1", "fn": "validateCredentials", "depends_on": [] },
    { "id": "ST-2", "fn": "generateJWT", "depends_on": ["ST-1"] } ] }
```

If a task looks too broad (two subtasks would touch the same file as another task), split it —
broad tasks cause parallel write collisions.

Then build the **global DAG** and **milestone gates** per `references/scheduler.md` § Setup:
1. Group tasks into **modules** (a coherent set of files sharing one interface contract) and into
   **milestones** (2–5 gate clusters for integration/review/commit). Write `plan/state/milestones.json`.
2. Add edges `architect-{module} → tdd-{TASK} → impl-{TASK}` for every task, plus cross-feature
   import edges, plus the `gate-{M}` / `review-{M}` / `commit-{M}` nodes (deps = the milestone's
   impl tasks). Write the graph to `framework-state.json` under `scheduler.dep_graph`.
3. Compute `max_concurrent` globally and seed `ready_queue` with all dep-free nodes.

The aim: maximize the count of nodes whose deps are all satisfied at any instant (the runnable
frontier). Independent modules carry no edges between them → they sit in the frontier together.

## Phase 3 — Architect agent (interfaces first) — ONE agent per MODULE (a DAG node)

There is no per-sprint architect. Each `architect-{module}` is a node in the global DAG; it runs as
soon as its own deps are met (an architect with no cross-module dep is in the initial frontier).
Multiple module-architects can run in parallel if independent.

> - **Context slice first:** apply `context_slice` from `references/context-utils.md`
>   to determine exactly which files to include. Do not add anything not in the slice table.
> You are the architect agent for module {module}. Read the tasks for this module
> (plan/state/tasks/*-tasks.json where module == {module}) and plan/docs/ARCHITECTURE.md + TECH-STACK.md.
> Produce ONLY interfaces, types, and module contracts. Write NO implementation, NO test bodies.
> For each task file define: all exported interfaces/types; every function signature
> (name, params, return type); all error types the module can throw.
> Write to src/types/{module}.interfaces.* and src/types/{module}.errors.* (use the stack's
> language/extension). When fully done, create plan/state/locks/{module}.interfaces.lock
> containing a one-line summary. That lock signals this module's TDD agents may start.
>
> --- OUTPUT CONTRACT ---
> Respond with ONLY a valid JSON object matching the schema below.
> No preamble. No explanation. No markdown fences. Raw JSON only.
> A response that is not valid JSON will be treated as failure → one retry.
> Schema:
> { "status": "done | blocked", "interfaces_file": "<path written>",
>   "types_defined": ["TypeName"], "dependencies_required": ["package@version"],
>   "notes": "<only if blocked or ambiguous, else omit>" }

Edge: `tdd-{TASK}` depends on `architect-{module}` (its `{module}.interfaces.lock`). The scheduler
won't put a TDD node in the ready_queue until that lock exists — no manual phase gate needed.

## Phase 4 — TDD agents (tests before code) — DAG nodes, dispatched by the scheduler

These are NOT a sprint-wide wave. The scheduler emits every ready `tdd-*` node in the current frontier
together (one Agent call per node, all in the SAME message — rule 7); a TDD node is ready as soon as
its module's lock exists, regardless of which milestone it belongs to. Before the calls, write them to
`agents.json` as `working`; the board shows every ready TDD card pulsing at once.

> - **Context slice first:** apply `context_slice` from `references/context-utils.md`
>   to determine exactly which files to include. Do not add anything not in the slice table.
> You are a TDD agent. Task: {TASK_ID}. Its module's interfaces.lock exists — interfaces are frozen.
> Read: src/types/{module}.interfaces.*  and  plan/state/tasks/{FEAT}-tasks.json.
> Write TESTS ONLY — no implementation. Tests must: cover every subtask in {TASK_ID}; test happy
> paths AND all error cases; match the interfaces exactly (invent no types); FAIL when run now
> (implementation doesn't exist yet — red phase).
> Output: {test file path per the stack's convention}.
> Then run the test command for that file. Expect ALL FAIL.
> Write plan/state/tasks/{TASK_ID}-tests.json:
> { "status": "red", "tests_written": <n>, "tests_failing": <n> }
>
> --- OUTPUT CONTRACT ---
> Respond with ONLY a valid JSON object matching the schema below.
> No preamble. No explanation. No markdown fences. Raw JSON only.
> A response that is not valid JSON will be treated as failure → one retry.
> Schema:
> { "status": "done | blocked", "test_file": "<path written>", "test_count": 0,
>   "all_failing": true, "failing_count": 0, "notes": "<optional>" }

Edge: `impl-{TASK}` depends on `tdd-{TASK}` (and any cross-feature impl deps). The scheduler unlocks
each impl node the instant its own deps go green — there is no "wait for every task's red" barrier.

## Phase 5 — Impl agents + TDD fix-loop — DAG nodes, dispatched by the scheduler

The scheduler emits every ready `impl-*` node together (one Agent call per node, SAME message). A
node is ready when its `tdd-{TASK}` is green AND its cross-feature impl deps are green — these can
span milestones, so impls from different milestones often run side by side. Refill freed slots as
agents return; never serialize independent impls.

> - **Context slice first:** apply `context_slice` from `references/context-utils.md`
>   to determine exactly which files to include. Do not add anything not in the slice table.
> You are impl-agent for {TASK_ID}. Read: src/types/{module}.interfaces.* and the test file
> {test path}. Implement {task file} following the interfaces EXACTLY.
> UI TASKS ONLY (when plan/docs/DESIGN-SYSTEM.md was provided): build components for the SELECTED
>   stack ({tech-stack framework — React/Next/Vite/etc.}). Use utility-first CSS ({Tailwind or the
>   project's chosen approach}). Layouts must be mobile-first and responsive across the breakpoints in
>   DESIGN-SYSTEM.md. Implement the design tokens (colors, typography, spacing, motion) from
>   DESIGN-SYSTEM.md — do NOT hardcode hex/px/font values; reference the tokens. Honor the design
>   system's anti-patterns + accessibility rules. Match the approved demo/index.html layout.
> Run the task's test command.
> LOOP until all tests pass: if failing, read the failure output, fix ONLY what's needed, re-run.
> Max 10 iterations. If still failing after 10, write a failure report and HALT (do not fake green).
> BEFORE marking done: run `{lint:fix_command} {task file}` (autofix), then `{lint_command} {task file}`
>   (check). Resolve any remaining lint errors on YOUR file — do not disable rules to pass. Re-run the
>   task tests after lint fixes to confirm still green. (Skip if no linter configured for this stack.)
> On success write plan/state/tasks/{TASK_ID}.done:
> { "status": "green", "tests_passing": <n>, "iterations_needed": <n> }
>
> --- OUTPUT CONTRACT ---
> Respond with ONLY a valid JSON object matching the schema below.
> No preamble. No explanation. No markdown fences. Raw JSON only.
> A response that is not valid JSON will be treated as failure → one retry.
> Schema:
> { "status": "done | blocked", "files_written": ["<path>"], "tests_passing": true,
>   "lint_clean": true, "fix_iterations": 0, "notes": "<optional>" }

On `.done` the scheduler marks `impl-{TASK}` done and unlocks dependents (including a `gate-{M}` once
all of M's impls are green). Any HALT → that node → blocked_set + Phase 7; only its descendants block.

## Phase 6 — Milestone integration gate (`gate-{M}` node — fires per milestone, not end-of-build)

> - **Context slice first:** apply `context_slice` from `references/context-utils.md`
>   to determine exactly which files to include. Do not add anything not in the slice table.

The gate is **two deterministic checks, both must pass** (no LLM judgment here):
1. **Lint gate** — run the project-wide `lint:` command from TECH-STACK.md. If it fails, first run
   `lint:fix` (autofix), re-run `lint`; any errors that remain → route to Phase 7 fix agent (treat like
   a test failure). Skip if no linter is configured. This is mechanical — the linter is the judge.
2. **Test gate** — run the integration/full test command from TECH-STACK.md.
   **Publish progress to the dashboard Tests tab:** card the gate + set `tests.status:"running"` in
   `agents.json` BEFORE running (the board can't update mid-command); after the run, parse the runner
   output and overwrite the `tests` block — `{status:"done", runner, total, passed, failed, skipped,
   suites:[{file,total,passed,failed,status,cases?}]}` (schema in SKILL §C.1 / state-schema). Do this on
   EVERY gate, for ANY runner (vitest/jest/node:test). No Playwright needed for this.

Run the gate scoped to milestone M but executing the FULL suite (cross-milestone regressions must
surface). `gate-{M}` runs the moment all of M's impl tasks are green — sibling milestones keep running.

- Both green → mark `gate-{M}` done; the scheduler unlocks `review-{M}` (Phase 8). Other milestones
  are unaffected and continue in parallel.
- Either fails → Phase 7 fix agent for the offending task (node stays in_flight until green/blocked).

## Phase 7 — Fix agent (systematic debugging) — activated on failure, max 5 rounds

**Before dispatching:** load `references/systematic-debugging.md` into the agent's context.
Context slice per `context-utils.md`: failing test output (last 100 lines) + source file + interfaces.lock ONLY.

Dashboard: add/flip a `fix` card with `detail: "Phase 1 — investigating root cause: {error summary}"`.
Update detail as the agent progresses through phases.

> - **Context slice:** failing test output (last 100 lines) · source file: {file} · interfaces.lock for {task_id}
>   Do NOT include PRD, FEATURES, passing test files, or other tasks' state.
>
> You are a fix agent for {task_id}. You MUST follow the four-phase systematic debugging protocol
> in `references/systematic-debugging.md`. Read it before doing anything else.
>
> Failing test: {test_id} at {test_path}
> Error output:
> {last_100_lines_of_error}
>
> Source file to fix: {source_file}
> Interfaces contract: {interfaces_lock_content}
>
> HARD RULES (from systematic-debugging.md):
> - Phase 1 (root cause investigation) MUST be complete before you propose any fix.
>   You cannot write "I think" or "it might be" — you must have evidence.
> - Change ONLY {source_file}. No refactoring. No new exports. No signature changes.
> - If 3+ fix attempts have failed, output status: "blocked" with architecture escalation.
>   Do not attempt a 4th hypothesis.
> - After your fix: run `{test_command} --testNamePattern "{test_id}"` (must be green),
>   then run `{integration_command}` (must stay green). If integration breaks: revert and report.
> - Then run `{lint:fix_command} {source_file}` + `{lint_command} {source_file}` — leave the file
>   lint-clean (no disabled rules). If the lint gate triggered this fix, the lint error IS the failure
>   to resolve. (Skip if no linter configured.)
>
> --- OUTPUT CONTRACT ---
> Respond with ONLY a valid JSON object matching the schema below.
> No preamble. No explanation. No markdown fences. Raw JSON only.
> A response that is not valid JSON will be treated as failure → one retry.
> Schema:
> {
>   "status": "done | blocked",
>   "root_cause": "<Phase 1 statement: the root cause is X because evidence Y>",
>   "fix_description": "<what was changed and why it addresses the root cause>",
>   "files_changed": ["<path>"],
>   "tests_passing": true,
>   "integration_passing": true,
>   "fix_iterations": 0,
>   "failed_hypotheses": ["<only if blocked — list each attempt>"],
>   "notes": "<optional — include architecture escalation details if blocked>"
> }

**Orchestrator fix-loop (max 5 rounds):**
- Round N: dispatch fix agent → receive JSON.
- If `status: "done"` AND `tests_passing: true` AND `integration_passing: true` → proceed to Phase 8.
- If `status: "blocked"` OR `fix_iterations >= 3` with no resolution → write `plan/state/BLOCKED.md`
  with the `root_cause` and `failed_hypotheses` fields, surface to user, STOP.
- If `tests_passing: false` after a "done" status → treat as failure, increment round, re-dispatch
  with the new error output as context.
- Never auto-retry more than 5 total rounds. After 5: write BLOCKED.md.

---

## Phase 8 — Two-stage code review (`review-{M}` node — per milestone, after its gate green)

**Load:** `references/code-review-protocol.md` before dispatching either review agent.
The `review-{M}` node becomes ready when `gate-{M}` is done. It runs over THAT milestone's diff only,
while other milestones keep building. On success it unlocks `commit-{M}`.

Dashboard: add a `spec-review` card, then after Stage 1 passes add a `quality-review` card.

### Stage 1 — Spec compliance (dispatch first)

Context: the diff for milestone M's files · FEATURES.txt sections for M's features · M's task specs.
Use the prompt template in `references/code-review-protocol.md` § Stage 1.

**Orchestrator action:**
- `pass` → immediately dispatch Stage 2 (flip `spec-review` to done, add `quality-review` card).
- `fail` → dispatch targeted impl fix agents for each `missing` / `untested` item.
  Max 3 fix rounds per item, then escalate to user.
  Re-run Stage 1 after fixes. Do NOT proceed to Stage 2 until Stage 1 passes.

### Stage 2 — Code quality (dispatch only after Stage 1 passes)

Context: milestone M's diff · ARCHITECTURE.md module boundary section for M's domains.
Use the prompt template in `references/code-review-protocol.md` § Stage 2.

**Orchestrator action (this is the `commit-{M}` node):**
- `commit` → `git add -A && git commit -m "milestone({M}): {features} complete"` (rolling commit —
  other milestones may still be in flight). Mark M `done` in milestones.json + framework-state.json.
  **Record the commit sha** (`git rev-parse HEAD`) into that milestone's `commit` field in
  `milestones.json` — the dashboard milestone **undo** (SKILL §D) reverts these shas.
- `fix-before-commit` → dispatch surgical fix agents for `critical` + `important` findings only.
  Log `minor` findings in the milestone summary — do not block commit for them.
  After fixes: re-run M's integration gate only (not full review cycle). Then commit.
- `block` → write `plan/state/BLOCKED.md` with full findings. Surface to user. Do not commit M.

---

## Phase 9 — Finishing (final phase, after the scheduler loop ends)

Run only when every DAG node (tasks + all milestone gate/review/commit nodes) is in done_set +
blocked_set in framework-state.json.
Load `references/branch-lifecycle.md` § Part 2 and follow it completely.

Dashboard: `finishing` card with live detail through each step.

Steps (detail in branch-lifecycle.md):
1. Final full test + build + typecheck verification, THEN run `superpowers:verification-before-completion`
   (evidence-based "did it really work" gate over acceptance criteria — resolve flags before done)
2. Cleanup (debug logs, temp files, wireframe demo/)
3. Write `plan/docs/BUILD-SUMMARY.md`
4. Final commit
5. Worktree merge (if worktrees were used)
6. Dashboard final update + print completion message to user

---

## Phase 10 — State machine / persistence

After EVERY transition write `plan/state/framework-state.json` (schema in state-schema.md) — that
includes the `scheduler` block (ready_queue / in_flight / done_set / blocked_set).
On startup: read it, keep `done_set`, re-queue anything left in `in_flight` (interrupted mid-run),
and skip milestone gate nodes already in done_set.

## Main loop (your control flow)

```
state = load_or_init(plan/state/framework-state.json)
mode  = detect_mode(references/modes.md)   # GREENFIELD | FEATURE | SURGICAL
state.mode = mode

# ── SURGICAL ────────────────────────────────────────────────────────────────
IF mode == SURGICAL:
  launch_dashboard(minimal)               # 3–4 cards: survey · diagnose · fix · review
  survey_repo()                           # read relevant files, identify blast radius
  stage_S1_problem_capture()             # confirm reproduction (modes.md § Stage S1)
  fix_agent = dispatch(systematic_debugging_protocol)   # modes.md § Stage S2
  IF fix_agent.status == blocked: write BLOCKED.md; STOP
  surgical_two_stage_review()            # modes.md § Stage S3 (scoped review)
  git_commit("fix({area}): {problem}")
  print_done(); EXIT

# ── FEATURE ─────────────────────────────────────────────────────────────────
IF mode == FEATURE:
  launch_dashboard()
  worktree_decision()                    # branch-lifecycle.md Part 1
  survey_repo()                          # survey card
  stage_F1_feature_scoping()            # write FEATURE-SPEC.md, get user approval
  stage_F2_impact_analysis()            # scoped DAG: 1-3 milestones, modules + cross-feature edges
  IF feature_has_UI: wireframe_loop()   # Stage 2.4
  dag = build_global_dag(tasks)         # scheduler.md § Setup (architect/tdd/impl + gate nodes)
  run_global_scheduler(dag)             # the SINGLE loop below — same as greenfield
  # Phase 9 finishing
  final_verification(); write_build_summary_delta(); merge_worktree_if_used()
  print_done(); EXIT

# ── GREENFIELD ──────────────────────────────────────────────────────────────
launch_dashboard()
worktree_decision()                      # branch-lifecycle.md Part 1
backlog = phase1(docs)                   # Stage 1: interview/docs → PRD/FEATURES
dag = phase2(backlog)                   # Stage 2: decompose + GLOBAL DAG + milestones + doc gate
IF has_UI: wireframe_loop()             # Stage 2.4
scaffold_toolchain()                     # Stage 2.5

# ── ONE global scheduler run (scheduler.md) — NO per-sprint FOR loop ──────────
run_global_scheduler(dag):
  seed ready_queue with all dep-free nodes; max_concurrent = global cap
  WHILE ready_queue or in_flight:
    # DISPATCH up to (max_concurrent - in_flight) ready nodes, ALL in one message (rule 7)
    work_batch  = ready work nodes (architect/tdd/impl) → context_slice + cache, then spawn together
    gate_nodes  = ready gate/review/commit nodes → orchestrator runs inline:
       gate-{M}   : integration_gate(M)  → fail? fix(...,systematic_debugging); blocked? blocked_set
       review-{M} : two_stage_review(M)  → fix_missing / fix_critical_important as needed
       commit-{M} : git_commit("milestone({M})"); mark M done   # rolling commit
    move dispatched → in_flight; save scheduler state
    WAIT any in_flight node returns
    on return: done_set += node; incremental_synthesis_merge(node)
               unlock every T where deps(T) ⊆ done_set  → ready_queue   # cross-milestone OK
               on terminal failure: blocked_set += node; mark descendants blocked
  # loop ends when all nodes done_set + blocked_set

# Phase 9 finishing
final_verification(); cleanup(); write_build_summary()
final_commit(); merge_worktree_if_used(); print_done()

# (legacy reference — the OLD sprint loop this skill replaces, kept for contrast)
# FOR sprint IN sprints:
#   IF sprint.done: CONTINUE
#   checkpoint(sprint)
#   architect(sprint); WAIT interfaces.lock
#   tdd[]  = parallel(tasks); WAIT all red          # sprint-wide barrier
#   impl[] = parallel(ready tasks); WAIT all .done  # sprint-wide barrier
#   r = integration_tests()
#   IF r.failed: fix(r, systematic_debugging); IF still_failed: BLOCKED; STOP
#   stage1 = spec_compliance_review(sprint); IF stage1.fail: fix; re-run
#   stage2 = code_quality_review(sprint)
#   IF stage2 == "fix-before-commit": fix_critical_important()
#   IF stage2 == "block": BLOCKED; STOP
#   git_commit(sprint); update_state(done)          # commit gated on whole sprint
```
