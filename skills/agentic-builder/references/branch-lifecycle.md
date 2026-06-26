# AB — Branch Lifecycle Protocol

Adapted from obra/superpowers `using-git-worktrees` + `finishing-a-development-branch` skills.

The orchestrator reads this file at two points:
1. **Stage 0 (preflight)** — decide whether to use an isolated worktree for this build.
2. **Final completion** — after the scheduler loop ends (every milestone committed & reviewed).

---

## Part 1 — Git Worktrees (optional, recommended for multi-milestone builds)

### When to use

Use a worktree when:
- Build has 3+ milestones (the main branch stays clean during the build)
- User wants to keep `main` deployable while building (brownfield especially)
- Multiple features are built in parallel across teams (hierarchical mode)

Skip worktrees when:
- Greenfield with a single milestone
- User explicitly says "keep it simple"
- The project has no existing git history (`git init` just ran in Stage 0)

### Setup (add to Stage 0 after git init check)

```bash
# Create isolated worktree on a feature branch
BRANCH="ab/build-{timestamp}"
git worktree add ../ab-workspace $BRANCH
cd ../ab-workspace
```

Dashboard: add a `worktree` card (status: working, detail: "creating isolated workspace on {branch}").
Mark done after the worktree is ready and baseline tests pass.

**Baseline check** — before the scheduler starts:
```bash
{install_command}   # from TECH-STACK.md
{test_command}      # must pass (or 0 tests — acceptable for greenfield)
```

If baseline is broken on a brownfield project: STOP. Surface to user before building.
You cannot validate milestone output against a broken baseline.

### State tracking

Add to `framework-state.json`:
```json
{
  "worktree": {
    "enabled": true,
    "branch": "ab/build-{timestamp}",
    "path": "../ab-workspace",
    "baseline_sha": "{sha}"
  }
}
```

---

## Part 2 — Finishing the Build (final phase after the scheduler loop ends)

Run this phase only after EVERY DAG node is in done_set + blocked_set — all milestones committed and
two-stage review passed on each.

Dashboard: add a `finishing` card (status: working). This is real work — not a silent step.

### Step 1 — Final verification

```bash
{test_command}      # full suite — must be green
{build_command}     # if applicable — must succeed
{typecheck_command} # if applicable — must pass
```

If anything fails here: do NOT finish. Route to fix agent with systematic-debugging.md.
A "finished" build that doesn't pass its own tests is not finished.

**Then run the `superpowers:verification-before-completion` skill** (via the Skill tool, as the
orchestrator) as the final gate: it forces an evidence-based "did we actually verify this works —
not assume it" pass over the acceptance criteria, not just a green test count. Resolve anything it
flags (re-open the relevant DAG node / fix agent) before declaring done. This is the second of only
two live superpowers touchpoints (the first is brainstorming at Stage 1); execution patterns stay
embedded.

### Step 2 — Cleanup

Remove debug artifacts:
- Temporary `console.log` / `print` / debug statements added during implementation
- `*.tmp`, `*.debug`, `scratch.*` files
- Any `demo/` wireframe HTML (that was a throwaway — the real UI is in src/)
- Test fixtures that were created inline and should live in `__fixtures__/` instead

**Do NOT remove:**
- `plan/` directory — the user may want the docs and state for reference
- Any file the user explicitly asked to keep

### Step 3 — Summary document

Write `plan/docs/BUILD-SUMMARY.md`:

```markdown
# Build Summary — {project name}

**Completed:** {date}
**Milestones:** {N} milestones, {total_tasks} tasks
**Features built:** {FEAT-001: title, FEAT-002: title, ...}

## How to run
{copy from TECH-STACK.md — dev command, test command, build command}

## Architecture
{1-paragraph summary of what was built and how it's structured}

## What's not included
{anything marked BLOCKED or explicitly out of scope}

## Known issues
{any Minor findings from code review that weren't fixed}
```

### Step 4 — Final commit

```bash
git add -A
git commit -m "build({project}): complete — {N} milestones, {features} features

Orchestrated by Agentic Builder (global-DAG). All tests passing.
Milestones: {milestone list}
Features: {feature list}"
```

### Step 5 — Worktree merge (if worktrees were used)

If `framework-state.json` shows `worktree.enabled: true`:

```bash
cd {original_project_dir}
git merge --no-ff ab/build-{timestamp} -m "merge: ab build complete"
git worktree remove ../ab-workspace
```

Present the user with options:
- **Keep branch** — don't delete `ab/build-{timestamp}`, useful for PR workflow
- **Delete branch** — `git branch -d ab/build-{timestamp}` after merge

### Step 6 — Dashboard final update

Update `agents.json`:
```json
{
  "phase": "complete",
  "progress": { "tasksDone": {N}, "tasksTotal": {N}, "eta": "done" },
  "strategy": { "name": "Complete", "how": "All milestones finished, reviewed, and committed." }
}
```

Mark the `finishing` card as `done`.
Stop the dashboard server: `kill $(cat plan/state/dashboard.pid 2>/dev/null)` (if pid was recorded).

Print to user:
```
✅ Build complete.
   {N} features · {total_tasks} tasks · {N} milestones
   Run: {dev_command}
   Test: {test_command}
   Summary: plan/docs/BUILD-SUMMARY.md
```
