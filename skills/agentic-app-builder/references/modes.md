# AB — Operating Modes (global-DAG edition)

Load this file during Stage 0 mode detection. It defines what each mode enables and skips.
The orchestrator reads it once, sets `framework-state.mode`, then never re-reads it.

---

## The Three Modes

### GREENFIELD
User is starting a new project from scratch.
Full pipeline: interview → PRD → scaffold → architect → TDD → impl → review → finish.

### FEATURE
User wants to add one or more features to an existing codebase.
Skips: interview, PRD creation, scaffold.
Runs: repo survey → scoped planning → architect (interfaces for new feature only) → TDD → parallel impl → two-stage review → commit.

### SURGICAL
User wants to fix a bug, resolve an error, or make a targeted change to one area.
Skips: interview, PRD, scaffold, architect, TDD setup.
Runs: repo survey → systematic debugging → targeted fix agent(s) → two-stage review → commit.

---

## Mode Detection (Stage 0, Step 1)

Run this detection BEFORE asking the user anything. It uses three signals:

### Signal A — Directory state
```bash
find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" \
  -o -name "*.rs" -o -name "*.rb" -o -name "*.java" -o -name "*.cs" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -name "*.test.*" ! -name "*.spec.*" \
  | wc -l
```
- **0–2 source files** → directory signal: GREENFIELD
- **3+ source files** → directory signal: BROWNFIELD (FEATURE or SURGICAL)

### Signal B — User's request language

SURGICAL signals (any one is enough):
- Contains an error message, stack trace, or test failure output
- "fix", "bug", "broken", "failing", "error", "crash", "not working", "issue"
- References a specific file, function, or line number
- Pastes code that doesn't work

FEATURE signals:
- "add", "implement", "build", "create", "I need X feature", "extend with"
- Describes new behavior that doesn't exist yet
- No error or failure mentioned

GREENFIELD signals:
- "from scratch", "new project", "start a", "build me an app", "create a"
- Empty or near-empty directory

### Signal C — Explicit user override
User says "use surgical mode", "just fix this", "full build", "add feature" → trust them exactly.

### Decision matrix

| Directory state | Request language | Mode |
|---|---|---|
| GREENFIELD | any | GREENFIELD |
| BROWNFIELD | SURGICAL signals | SURGICAL |
| BROWNFIELD | FEATURE signals | FEATURE |
| BROWNFIELD | ambiguous | ask one question (see below) |
| GREENFIELD | SURGICAL/FEATURE signals | ask — user may be in wrong dir |

### Ambiguity resolution (one question only)

When signals conflict or are unclear, ask ONE question:

> "I see an existing codebase here. Which best describes what you need?
> A) Fix a specific bug or error
> B) Add a new feature to the existing code
> C) Build something new from scratch in this folder"

Map A→SURGICAL, B→FEATURE, C→GREENFIELD. Do not ask follow-up questions — proceed.

---

## Per-mode Phase Gates

### GREENFIELD — full pipeline

```
Stage 0:  mode detection → worktree decision → dir setup → dashboard launch
Stage 1:  bring-your-own-docs gate → interview (if no docs) → tech stack
Stage 2:  PRD + FEATURES + ARCHITECTURE + TECH-STACK → global DAG + milestones → doc-quality gate
Stage 2.4: wireframe (UI projects only)
Stage 2.5: scaffold toolchain
Stage 3:  ONE global scheduler run (architect → TDD → impl → fix → milestone gates), no sprint loop
Phase 8:  two-stage review per milestone (review-{M} node)
Phase 9:  finishing (verify → cleanup → BUILD-SUMMARY → final commit)
```

Dashboard cards: interview · prd · planner · doc-check · router · wireframe · scaffold ·
architect · tdd · impl · fix · spec-review · quality-review · finishing

---

### FEATURE — add to existing codebase

```
Stage 0:  mode detection → repo survey → dashboard launch (no worktree question yet)
Stage F1: feature scoping (you do this, not a subagent — 5 minutes max)
Stage F2: impact analysis → scoped DAG + milestones (1–3 milestones typical)
Stage 2.4: wireframe (if the feature has UI)
Stage 3:  ONE global scheduler run (architect → TDD → parallel impl → fix → milestone gates)
          [existing tests must stay green — each milestone gate runs the full suite]
Phase 8:  two-stage review per milestone (review-{M} node)
Phase 9:  finishing (verify full suite → BUILD-SUMMARY delta → commit)
```

**Skipped vs GREENFIELD:** interview · PRD creation · FEATURES.txt · ARCHITECTURE.md (read existing,
don't rewrite) · scaffold · bring-your-own-docs gate.

**Dashboard cards:** survey · scoping · planner · architect · tdd · impl · fix ·
spec-review · quality-review · finishing

#### Stage F1 — Feature scoping (FEATURE mode only)

Do this yourself — no subagent needed. Takes one pass through the codebase.

1. **Survey the repo** (dashboard card: `survey`, detail: "reading repo structure"):
   ```bash
   find . -type f ! -path "*/node_modules/*" ! -path "*/.git/*" | head -60
   cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || true
   cat README.md 2>/dev/null | head -40
   ```
2. **Identify the entry points** most relevant to the requested feature. Read those files only.
3. **State the feature contract** — write `plan/docs/FEATURE-SPEC.md`:
   ```markdown
   # Feature: {name}
   ## What it does
   {1 paragraph}
   ## Acceptance criteria
   - [ ] {specific, testable criterion 1}
   - [ ] {specific, testable criterion 2}
   ## Files likely affected
   - {file}: {why}
   ## Files must NOT be changed
   - {file}: {reason — don't break this}
   ## Existing tests that must stay green
   {test command} — currently {N} passing
   ```
4. Show `FEATURE-SPEC.md` to user. Ask: "Does this capture what you want? (Yes / adjust)"
   One round of adjustment max — then proceed.

#### Stage F2 — Impact analysis + scoped DAG (FEATURE mode only)

Decompose only the feature's tasks and build a scoped global DAG. If the feature touches ≤5 files →
1 milestone. If it touches 6–15 files → 2 milestones, split by layer (data/logic/UI) — but they still
run as one DAG, so independent layers fan out concurrently rather than waiting on a sprint boundary.
If 15+ files → treat as GREENFIELD and tell the user this is a large rework.

Write `plan/state/milestones.json` with the feature's tasks only.
Read existing `src/types/` interfaces — don't redefine them, extend them.

---

### SURGICAL — fix a bug or targeted change

```
Stage 0:   mode detection → repo survey → dashboard launch (minimal)
Stage S1:  problem capture → reproduction confirmation
Stage S2:  systematic debugging (references/systematic-debugging.md — full protocol)
Stage S3:  targeted fix agent (1 agent, possibly 2 if two independent files affected)
Phase 8:   two-stage review (scoped: spec = did it fix the issue, quality = did it break anything)
           [no milestone review — scoped to changed files + integration suite]
Phase 9:   surgical finish (no cleanup pass, no BUILD-SUMMARY — just commit + confirmation)
```

**Skipped entirely:** interview · PRD · FEATURES · ARCHITECTURE · scaffold · worktree setup ·
architect · TDD (uses existing tests as the gate) · DAG planning · hierarchical orchestration.

**Dashboard cards:** survey · diagnose · fix · spec-review · quality-review · done

#### Stage S1 — Problem capture (SURGICAL mode only)

Do this yourself in 2–3 tool calls. Dashboard card: `diagnose`.

1. **Read the error** — if the user pasted an error/stack trace, read it fully now.
   If not, ask ONE question: "Can you paste the error message or failing test output?"

2. **Confirm reproduction:**
   ```bash
   {test_command} 2>&1 | tail -30    # run the suite, see what's actually failing
   ```
   If no test fails but behavior is wrong, ask the user for the exact reproduction steps.
   Never proceed to fix without confirmed reproduction.

3. **Identify the blast radius** — which files are in scope:
   ```bash
   git log --oneline -5               # recent changes
   git diff HEAD --name-only          # uncommitted changes (if any)
   ```
   List the 1–3 files most likely to contain the root cause based on the stack trace.

4. Write `plan/state/surgical-target.json`:
   ```json
   {
     "problem": "<one sentence: what is failing and how>",
     "reproduction": "<exact command that shows the failure>",
     "failing_tests": ["<test id or description>"],
     "suspect_files": ["<file1>", "<file2>"],
     "blast_radius": "single-file | multi-file",
     "confirmed_reproduction": true
   }
   ```

#### Stage S2 — Systematic debugging dispatch (SURGICAL mode only)

Load `references/systematic-debugging.md`. Dispatch ONE fix agent with:
- Full error output (not truncated — surgical mode, so context is small)
- All suspect files from `surgical-target.json`
- Existing test file(s) covering the failing area
- Instruction to follow the four-phase protocol from systematic-debugging.md

**If `blast_radius: "multi-file"` AND files are independent:**
Dispatch 2 fix agents in ONE message (parallel). Each owns exactly one file.
Merge results: both must pass before proceeding to review.

**If files are dependent** (fix in file A requires reading file B's output):
Serialize — fix file A first, then file B.

#### Stage S3 — Surgical two-stage review (SURGICAL mode only)

Scoped version of Phase 8 — same protocol from `references/code-review-protocol.md` but:

- **Stage 1 (spec compliance):** Did the fix resolve the stated problem? Is there a test that proves it?
  Context: `git diff HEAD` (just the fix) · `surgical-target.json` · failing test output.
- **Stage 2 (code quality):** Did the fix introduce any new issues? Is it the minimal change?
  Context: `git diff HEAD` · relevant file(s) only.

After both stages pass: `git commit -m "fix({area}): {problem one-liner}"`. Done.

---

## framework-state.json mode field

Set immediately after mode detection in Stage 0:

```json
{
  "mode": "greenfield | feature | surgical",
  "mode_reason": "<why this mode was chosen — e.g. 'brownfield + error message in request'>",
  "detected_at": "{iso timestamp}"
}
```

The main loop in `phases.md` checks `framework-state.mode` at every phase gate.
Phases not applicable to the current mode are skipped with a dashboard log entry:
`"skipped — {mode} mode"`.

---

## Dashboard strategy labels by mode

| Mode | strategy.name | strategy.how |
|---|---|---|
| GREENFIELD | Full Build | Interview → PRD → scaffold → TDD → parallel impl → review |
| FEATURE | Feature Addition | Survey → scoped plan → architect → TDD → parallel impl → review |
| SURGICAL | Surgical Fix | Diagnose → systematic debug → targeted fix → scoped review |
