# AB — Context Compression Utilities

Apply `context_slice` before constructing EVERY sub-agent prompt.
Never pass full docs to build agents. Only the orchestrator reads everything.

## context_slice procedure

Before each Agent tool call, build the agent's context by this table ONLY:

| Agent type   | Include                                                                 | Exclude                                    |
|--------------|-------------------------------------------------------------------------|--------------------------------------------|
| architect    | FEATURES.txt section for THIS module's features only · TECH-STACK.md   | PRD.txt · other modules · ARCHITECTURE.md |
| tdd          | its module's interfaces.lock · FEATURES.txt acceptance_criteria for THIS task only  · TECH-STACK.md test section only | PRD.txt · other tasks' specs · impl files |
| impl         | its module's interfaces.lock · its test file path + content · TECH-STACK.md runtime/framework section only · relevant type definitions (only types this task imports) · **UI tasks only: DESIGN-SYSTEM.md tokens for this component/page** | PRD.txt · other tasks' test files · unrelated type defs · DESIGN-SYSTEM.md for non-UI tasks |
| fix          | Failing test output (last 100 lines) · source file that failed · its module's interfaces.lock · systematic-debugging.md | PRD.txt · FEATURES.txt · passing test files |
| integration  | Integration test command from TECH-STACK.md · last 50 lines of failing output only | Everything else |
| spec-review  | git diff for THIS milestone · FEATURES.txt acceptance_criteria for milestone features · milestone task specs | Full file contents · PRD.txt · other milestones · ARCHITECTURE.md |
| quality-review | git diff for THIS milestone · ARCHITECTURE.md module boundary section for milestone domains · **UI milestones: DESIGN-SYSTEM.md accessibility + anti-pattern checklist** | PRD.txt · FEATURES.txt · passing test files · other milestones |

## Extraction rules

**FEATURES.txt:** Use `grep -A 30 "### FEAT-{id}"` to extract only the relevant
feature block. Never pass the whole file to build agents.

**TECH-STACK.md sections:**
- "test section only" = the `## Commands` block only
- "runtime/framework section" = Language/runtime + Framework lines only

**ARCHITECTURE.md:** Extract only the module boundary lines relevant to the task's
domain. Use the `domain` field from the task's `-tasks.json` to identify which
module section applies.

**Type definitions:** From `src/types/`, include only `{domain}.interfaces.*` for the
task's own domain. Never pass all type files.

**DESIGN-SYSTEM.md** (present only when the router chose a design skill in Stage 2.4):
include it ONLY for UI-rendering tasks, and only the section relevant to the component/page being
built (tokens: colors, type, spacing, motion + the a11y rules). Never pass it to backend/logic/data
tasks or to architect/tdd. For `quality-review` on a UI milestone, include its accessibility +
anti-pattern checklist so the reviewer can score against it.

## PRIOR RUNS injection (cross-session memory, P2)

When `.agentic-builder/memory.json` exists (loaded at Stage 0), inject a keyword-filtered
`PRIOR_RUNS_CONTEXT` slice AFTER the normal context_slice — but ONLY for these agents:
- **planner / architect** — relevant prior `decisions[]` + `failures[]` (symptom+fix) + `glossary`, as a
  `## PRIOR RUNS` block.
- **impl / fix** — ONLY a prior `failures[]` entry whose `file` matches the task's owned file (one max),
  as a `## PRIOR FAILURE` block.
- **tdd / integration / spec-review / quality-review** — none (keep lean).

Never pass the whole `memory.json` to any agent. Full retrieval + injection rules in `references/memory.md`.

## Logging in dashboard

In the agent's dashboard `detail` field, log what was included and excluded:
`"context: auth-interfaces.lock + auth.test.ts (PRD excluded, payment spec excluded)"`

This makes context decisions visible and auditable.
