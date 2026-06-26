# AB — Unattended (non-interactive / CI) mode

Same in-session orchestrator, same Agent-tool swarm — no Engine B, no API keys; human approval gates are replaced with deterministic rules.

## Config

Add to `framework-state.json` at Stage 0, immediately after mode detection and before Step 3 (dir setup):

```json
{
  "unattended": true,
  "defaults": {
    "tech_stack": "TypeScript + Node.js + Vitest",
    "ui_framework": "React + Tailwind",
    "db": "Postgres"
  }
}
```

- `unattended: true` — set when the user says "run without me" / "headless" / "unattended" / "CI", or passes `unattended:true` explicitly. Recorded once; never changed mid-run.
- `defaults` (optional) — preset answers for tech-stack / design-pref gates. Keys match the questions the orchestrator would normally ask. Missing keys fall back to sensible auto-picks (see table below).

Do NOT ask the foreground/background question — unattended implies `display_mode: "background"`.
Dashboard still launches with `--no-open`; it is a passive monitor only (no modal blocks the run).

## Gate auto-resolution

Every gate that normally follows rule 12 (write `prompt` → `wait-answer.mjs` → `AskUserQuestion`) is instead resolved by the rule below. No `prompt` is written; no `AskUserQuestion` is called.

| Gate | Unattended default |
|---|---|
| Bring-your-own-docs / interview | **REQUIRE** `plan/docs/` or a provided spec. If absent → **ABORT**: write `RESULT.json` (`status:"aborted"`, reason: `"no spec, cannot interview unattended"`). Never start the Q&A interview. |
| Tech stack / design prefs | Use `defaults` value if set; else auto-pick: TypeScript + Node.js + Vitest (backend), React + Tailwind (UI), Postgres (data). Log the choice to `agents.json` `log`. |
| Plan approval | **Auto-approve.** Log: `"unattended: plan auto-approved"`. |
| Wireframe approval (Stage 2.4) | **Skip wireframe entirely.** Log: `"unattended: wireframe skipped"`. |
| Feature spec approval (FEATURE mode Stage F1) | **Auto-approve** `FEATURE-SPEC.md`. Log: `"unattended: FEATURE-SPEC.md auto-approved"`. |
| Doc-quality gate | If any acceptance criterion is vague or untestable → **ABORT**: write `RESULT.json` (`status:"aborted"`, reason: `"vague acceptance criteria — testable spec required"`). Do NOT build on a vague spec. |
| Budget breach (≥ 100 % cap) | **Always ABORT.** Write `RESULT.json` (`status:"aborted"`, reason: `"budget cap breached — unattended mode never auto-continues"`). Never silently overspend. |
| Milestone undo / redo (`control.json`) | **Ignore.** Log: `"unattended: undo/redo request ignored (no destructive auto-ops)"`. Mark request `handled:true` without acting. |
| BLOCKED.md (fix-loop exhausted) | **ABORT.** Write `RESULT.json` (`status:"blocked"`, reason: `"fix loop exhausted — {TASK_ID}"`). |

## RESULT.json

Written to `plan/state/RESULT.json` on every terminal event: normal completion, abort, or block. This is the CI artifact the wrapping script reads.

```json
{
  "status": "done | blocked | aborted",
  "reason": "",
  "milestones": {
    "data": "done",
    "api": "done",
    "ui": "blocked"
  },
  "tasks_done": ["impl-FEAT-001-T1", "impl-FEAT-002-T1"],
  "tasks_blocked": ["impl-FEAT-003-T1"],
  "commit_shas": {
    "data": "a1b2c3d",
    "api": "e4f5a6b"
  },
  "tokens": { "in": 120000, "out": 45000, "total": 165000 },
  "usd": 1.23
}
```

- `status` — `"done"` (all milestones committed), `"blocked"` (fix loop exhausted; partial build), `"aborted"` (precondition failed before build: no spec, vague criteria, or budget breach).
- `reason` — human-readable string; empty when `status:"done"`.
- `milestones` — map of milestone id → `"done" | "blocked" | "pending"`.
- `commit_shas` — sha per committed milestone; omitted when git is unavailable.
- `tokens` / `usd` — from `token-report.mjs` at run end.

Write atomically: write to `RESULT.json.tmp` then rename, so a polling script never reads a partial file.

## Exit contract

The in-session orchestrator cannot set a process exit code. The CONTRACT is `RESULT.json` `status`. A CI wrapper reads this file after the session ends:

```sh
# Conceptual CI wrapper (pseudocode — no Engine B; adapt to your runner)
claude-code --print --no-interactive \
  "Build the project described in plan/docs/SPEC.md. unattended:true"

# Session exits → check the artifact:
jq -e '.status == "done"' plan/state/RESULT.json
# exit 0 → job passes   exit 1 (or file missing) → job fails
```

The wrapper does NOT parse log lines or dashboard output — `RESULT.json` is the sole signal. If the file is absent (session crashed before writing it), treat as failure.

## Safety rules

1. **Never auto-approve a budget breach.** A cap exists for a reason; silently exceeding it violates the user's intent. Always abort and let the wrapper signal failure.
2. **Never auto-run undo or redo.** Destructive git operations require explicit human intent. `control.json` requests are logged and ignored without acting.
3. **Require testable acceptance criteria or abort.** A vague spec produces untestable code. Abort before any build cost is incurred rather than deliver unverifiable output.
4. **Require a provided spec for GREENFIELD.** Cannot conduct an interview without a human present. If `plan/docs/` is empty and mode is GREENFIELD, abort immediately with a clear reason in `RESULT.json`.
5. **FEATURE + SURGICAL modes are safe unattended** — they operate on an existing codebase with existing tests as the acceptance gate. If the gate fails after the fix loop, write `status:"blocked"` and stop.
6. **All safety rules apply regardless of `defaults`.** A `defaults` map fills in preferences; it cannot override an abort condition.
