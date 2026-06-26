# intelli-agent — Multi-harness portability adapter contract (P4b)

Abstract the Claude-Code-specific primitives behind named adapter operations so the orchestrator, registry-driven dispatch, and DAG scheduler remain harness-agnostic.

---

## Adapter primitives

Each row is an abstract operation the orchestrator calls by name. Claude Code is the only fully-implemented adapter today; other harnesses show the intended mapping.

| Abstract op | Claude Code impl | Other-harness mapping | Degradation when unavailable |
|---|---|---|---|
| `spawn_subagent(prompt, model)` | Agent tool with `subagent_type:"general-purpose"` and optional `model` param | Harness-native subagent API (e.g. Codex task, Gemini subtask) | Run inline / sequentially inside the orchestrator; registry routing still applies, frontier narrows to width 1 |
| `parallel_fanout(prompts[])` | N Agent tool calls in ONE assistant message (rule 7) | Harness batch-subagent call if supported; else loop with `spawn_subagent` | Sequential dispatch — log once to `agents.json`: "parallel fan-out unavailable"; global-DAG scheduler still works, frontier narrows to width 1 |
| `ask_user(prompt, options, id)` | Write `prompt` to `agents.json`, block on `node plan/dashboard/wait-answer.mjs <id> <timeout>`; fall back to `AskUserQuestion` on non-zero exit (rule 9) | Harness-native interactive input (CLI readline, workspace prompt, etc.) | Non-interactive harness: skip prompt, apply unattended defaults (auto-approve plan, skip domain ambiguity gate, continue with primary domain classification) |
| `measure_tokens()` | Dashboard server reads `~/.claude/projects/<slug>/*.jsonl` via `token-report.mjs`, sums `message.usage` since `startedAt` | Harness-specific usage log or API usage counters at an equivalent path | Disable the Tokens KPI chip; skip all budget cap checks; log once to `agents.json`: "token measurement unavailable — budget caps disabled" |
| `open_url(url)` | Windows: `cmd /c start "" {url}` · macOS: `open {url}` · Linux: `xdg-open {url}` | Same OS-level commands — portable, not harness-specific | Print URL for user to open manually; no further degradation |
| `spawn_background_process(cmd)` | Bash tool with `run_in_background: true` | Shell escape available in most harnesses | Log that background launch failed; offer foreground fallback or skip dashboard auto-open |
| `read_file` / `write_file` / `edit_file` | Read / Write / Edit tools | Filesystem access present in every serious coding harness | Hard requirement — abort with a clear error if absent; no graceful degradation |

> **Key degradation:** `measure_tokens()` is the most CC-specific primitive. On any harness that cannot read the CC transcript path, the Tokens KPI and budget caps must be disabled for the run. All other primitives degrade gracefully. Registry dispatch and the 6 agent types are unaffected.

---

## Harness detection + selection

Perform once at Stage 0 Step 1, immediately after capability checks, before dashboard setup.

**Detection order (feature probe — first match wins):**

1. `process.env.CLAUDE_CODE` set, or `process.env.TERM_PROGRAM === "claude-code"` → `"claude-code"`
2. `process.env.CODEX_SESSION` or `process.env.OPENAI_CODEX` set → `"codex"`
3. `process.env.GEMINI_CLI` or `process.env.GOOGLE_AI_STUDIO` set → `"gemini-cli"`
4. `process.env.CURSOR_EDITOR` or similar Cursor env set → `"cursor"`
5. No match → `"unknown"` (treat as `"claude-code"` but with `token_source: null`)

Write result to `plan/state/framework-state.json` alongside mode:

```json
{
  "harness": "claude-code",
  "harness_caps": {
    "parallel_subagents": true,
    "interactive_ui":     true,
    "token_source":       "~/.claude/projects/<slug>/*.jsonl"
  }
}
```

Load adapter mappings by switching on `harness`. Default = `"claude-code"`. Unknown harnesses inherit CC mappings except `token_source` is set to `null`, which disables budget caps and the Tokens KPI automatically.

---

## Degradation rules

Apply when a `harness_caps` flag is `false` or `null`:

- **Missing `parallel_subagents`** → dispatch sequentially via repeated `spawn_subagent` calls; log a one-time warning at scheduler start; the global DAG scheduler continues, frontier narrows to width 1. Registry routing (rule 2) is unaffected.
- **Missing `token_source`** → disable the Tokens KPI chip; skip all budget cap checks; do not surface token estimates in `agents.json` cards; log once.
- **Missing `interactive_ui`** → skip all `wait-answer.mjs` blocks and dashboard prompts; auto-apply unattended defaults for every gate (auto-approve domain classification, auto-approve plan, skip domain ambiguity clarification); still write `agents.json` for state persistence (rule 8 CARD-BEFORE-OP still fires).
- **Missing subagents entirely** → orchestrator runs all 6 agent-type roles inline in topological DAG order; registry-driven prompt templates still apply per role; milestone gates and review nodes still fire; build degrades to single-threaded execution but does not abort.
- **Missing background shell spawn** → run the dashboard server foreground if possible, or skip it and write state files only; the build continues without a live board.

---

## What is already portable

These components have no CC-specific dependencies and run unchanged under any harness:

- **Dashboard server** (`template/dashboard/server.mjs`) — zero-dependency Node HTTP + SSE server; reads and writes plain JSON state files; runs anywhere Node ≥ 18 is present. The `token-report.mjs` import returns `null` when the CC transcript path is absent — the server still renders the board without the Tokens KPI.
- **State schema** (`references/state-schema.md`) — pure JSON; no CC primitives.
- **Scheduler logic** (`references/scheduler.md`) — dependency-graph evaluation over JSON state files; no CC primitives.
- **Agent registry** (`references/agent-registry.json`) — 6 agent types with prompt templates, context budgets, and scheduler roles; pure data; harness-agnostic.
- **All reference docs** — markdown instruction sets interpreted by whatever model the harness runs.
- **Domain detection** (`references/domain-detector.md`) — in-orchestrator LLM call; no tool dependency.
- **OS-open commands** — `cmd /c start` / `open` / `xdg-open` are OS-level, not harness-level; identical across harnesses on the same OS.

The **only CC-specific piece** is the transcript path `~/.claude/projects/<slug>/*.jsonl` consumed by `token-report.mjs`. Every other component — scheduler, registry, state schema, 6 agent prompts, dashboard server — is either pure Node, plain JSON, or markdown.

---

## Status

This document is the **portability contract** for the intelli-agent skill.

- **Claude Code** is the only fully-implemented adapter. All primitives map to concrete tool calls; the columns above describe live, tested behavior.
- **Codex, Gemini CLI, Cursor, and others** are forward-looking mappings only. The adapter rows show design intent; no code has been written or tested for those harnesses.
- Promotion from "mapping" to "implemented" requires: (1) a concrete `harness_caps` probe verified in that harness, (2) confirmed `spawn_subagent` and `parallel_fanout` behavior, and (3) a confirmed `token_source` path or an explicit `null` disabling budget caps.

Until a harness is promoted, its mappings are design intent only. Do not claim portability to an untested harness.
