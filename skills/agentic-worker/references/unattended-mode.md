# agentic-worker — Unattended (non-interactive / CI) mode

Same in-session orchestrator, same Agent-tool swarm — no separate program, no API key. Human approval gates (rule 9: write prompt → `wait-answer.mjs` → CLI fallback) are replaced with deterministic rules.

## Config

Add to `plan/state/framework-state.json` at Stage 0, immediately after the capability check (Step 2) and before dashboard launch (Step 3):

```json
{
  "unattended": true,
  "defaults": {
    "domain_confirm": "auto",
    "output_format": "markdown"
  }
}
```

- `unattended: true` — set when the user says "run without me" / "headless" / "unattended" / "CI", or passes `unattended:true` explicitly. Recorded once; never changed mid-run.
- `defaults` (optional) — preset answers for domain-confirmation and output-format gates. Missing keys fall back to auto-picks (see table). Keys must match the gate id the orchestrator would normally prompt for.

**Stage 0 adjustments:**

- Skip Stage 0 Step 4 (foreground vs background question). Unattended implies `display_mode: "background"`. Record it without prompting.
- Dashboard still launches (Step 3) with `--no-open`; it is a passive monitor only — no modal blocks the run.
- Memory cap (rule 11): if `caps.memory = false`, log one notice to `agents.json` and continue. No prompt.
- Write `"unattended": true` to `agents.json` top-level so the dashboard can show an "Unattended" badge.

## Gate auto-resolution

Every gate that normally follows rule 9 (write `prompt` → block on `wait-answer.mjs` → CLI fallback on timeout) is instead resolved by the rule below. No `prompt` is written; no `wait-answer.mjs` is called.

| Gate | Unattended default |
|---|---|
| Bring-your-own-docs / interview (Stage 2) | **REQUIRE** `plan/docs/` or a provided spec. If absent → **ABORT**: write `RESULT.json` (`status:"aborted"`, reason: `"no spec, cannot interview unattended"`). Never start the Q&A interview. |
| Task spec quality (Stage 2) | If goals or deliverable are vague or untestable → **ABORT**: write `RESULT.json` (`status:"aborted"`, reason: `"vague task spec — testable goals required"`). Do NOT build on a vague spec. |
| Domain ambiguity (Stage 1, `ambiguity_flag:true`) | Use detected `primary_domain` and `secondary_domain` as-is. Use `defaults.domain_confirm` if set; else auto-accept. Log: `"unattended: domain auto-confirmed ({domain})"`. |
| Domain confirmation (Stage 1, low ambiguity) | Auto-confirm classification. Log: `"unattended: domain auto-confirmed ({domain})"`. |
| Plan approval (Stage 3) | **Auto-approve.** Log: `"unattended: plan auto-approved"`. |
| Coherence issues in merge (Stage 5) | Auto-accept the first option returned by the coordinator-agent in merge mode. Log the accepted side to `agents.json`. Do NOT surface a prompt. |
| Budget breach (≥ 100 % cap) | **Always ABORT.** Write `RESULT.json` (`status:"aborted"`, reason: `"budget cap breached — unattended mode never auto-continues"`). Never silently overspend. |
| External auth required (rule 12) | **ABORT.** Write `RESULT.json` (`status:"aborted"`, reason: `"external auth required — cannot surface credentials unattended"`). |
| Milestone undo / redo (`control.json`) | **Ignore.** Log: `"unattended: undo/redo request ignored (no destructive auto-ops)"`. Mark request `handled:true` without acting on git. |
| BLOCKED.md (fix loop exhausted ≥ 3 attempts) | **ABORT.** Write `RESULT.json` (`status:"blocked"`, reason: `"fix loop exhausted — {TASK_ID}"`). Continue independent tasks; do not retry the blocked node. |

## RESULT.json

Written to `plan/state/RESULT.json` on every terminal event: normal completion, abort, or block. This is the CI artifact the wrapping script reads.

```json
{
  "status": "done | blocked | aborted",
  "reason": "",
  "domains": ["research", "analysis"],
  "milestones": {
    "m1-gather": "done",
    "m2-analyze": "done",
    "m3-draft": "blocked"
  },
  "tasks_done": ["gather-FEAT-001-T1", "analyze-FEAT-002-T1"],
  "tasks_blocked": ["draft-FEAT-003-T1"],
  "outputs": ["outputs/report.md", "outputs/summary.md"],
  "tokens": { "in": 95000, "out": 32000, "total": 127000 },
  "usd": 0.87
}
```

- `status` — `"done"` (all milestones merged to `outputs/`), `"blocked"` (fix loop exhausted; partial output written), `"aborted"` (precondition failed before build: no spec, vague goals, budget breach, or auth required).
- `reason` — human-readable string; empty when `status:"done"`.
- `domains` — detected domains list from `framework-state.json` `domain_classification`.
- `milestones` — map of milestone id → `"done" | "blocked" | "pending"`. Populated as gates close.
- `tasks_done` / `tasks_blocked` — task ids from the DAG scheduler done/blocked sets.
- `outputs` — paths of files written under `outputs/`; empty on abort before Stage 5.
- `tokens` / `usd` — from `token-report.mjs` at run end (or at abort point).

Write atomically: write to `RESULT.json.tmp` then rename, so a polling script never reads a partial file.

## Exit contract

The in-session orchestrator cannot set a process exit code. The CONTRACT is `RESULT.json` `status`. A CI wrapper reads this file after the session ends:

```sh
# Conceptual CI wrapper (pseudocode — no Engine B; adapt to your runner)
claude-code --print --no-interactive \
  "Research and analyze X per plan/docs/BRIEF.md. unattended:true"

# Session exits → check the artifact:
jq -e '.status == "done"' plan/state/RESULT.json
# exit 0 → job passes   exit 1 (or file missing) → job fails
```

The wrapper does NOT parse log lines or dashboard output — `RESULT.json` is the sole signal. If the file is absent (session crashed before writing it), treat as failure. Always check `outputs[]` to locate deliverables.

## Safety rules

1. **Never auto-approve a budget breach.** A cap exists for a reason; silently exceeding it violates the user's intent. Always abort and let the wrapper signal failure.
2. **Never auto-run undo or redo.** Destructive git operations require explicit human intent. `control.json` requests are logged and ignored without acting.
3. **Require testable task goals or abort.** A vague spec produces unverifiable output. Abort before any agent cost is incurred rather than deliver unvalidatable results.
4. **Require a provided spec.** Cannot conduct an interview without a human present. If `plan/docs/` is empty and no inline spec was given, abort immediately with a clear reason in `RESULT.json`.
5. **Never surface external auth prompts.** If a task requires credentials (rule 12 surface path), abort immediately rather than hanging on `wait-answer.mjs`.
6. **All safety rules apply regardless of `defaults`.** A `defaults` map fills in preferences (domain, format); it cannot override an abort condition.
