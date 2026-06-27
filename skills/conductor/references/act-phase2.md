# ACT — Phase 2: outward execution via MCP connectors (opt-in)

Phase 1 produces ship-ready artifacts but performs **no outward action**. Phase 2 lets ACT actually
**deploy / draft / schedule / file issues** — but only behind hard guardrails, and only through whatever
**MCP connectors** the user already has. There is **no vendor-specific code** in the suite: connectors are
discovered at runtime via ToolSearch using `references/act-executors.json` hints. If no connector matches,
ACT degrades to the Phase-1 artifact + a manual note.

> **Default OFF.** Phase 2 never runs unless the user explicitly opts in for a run. It is the high-risk,
> high-maintenance tier — treat every outward action as irreversible until proven otherwise.

## The five guardrails (non-negotiable)
1. **Per-action approval** — each action is approved individually on the dashboard (never a batch "do it all").
2. **Dry-run first** — show the exact action + payload (the tweet text, the deploy target, the issue title)
   and the connector that would run it, *before* executing.
3. **Idempotent** — every action has a deterministic key (`act-ledger.mjs key`); the orchestrator runs
   `act-ledger.mjs check <key>` and only executes if not already `executed`, then `record`s it. Resume/re-run
   never double-fires.
4. **Reversible / draft-first** — channels default to `draft` mode (Gmail draft, social *schedule*, CMS draft).
   Only `reversible:true` channels may `auto`-execute (deploy, issues, sheet) — and still per-action approved.
5. **Hard never-auto list** — `paid-ads`, `bulk-email`, `dm` (in `act-executors.json` `policy.never_auto`) are
   never executed by ACT; they stay Phase-1 artifacts + human task.

## Flow (per automatable task with a target channel)
```
for each task (auto=automatable, channel set):
  connector = lookup act-executors.json[channel]           # mode: auto | draft | manual
  if connector.mode == "manual" OR no MCP tool found via ToolSearch(connector.mcp_hint):
      → leave the Phase-1 artifact, mark task execution.status = "skipped" (manual)
      continue
  key = act-ledger.mjs key {channel, action, payload}
  if act-ledger.mjs check key == executed:  → skip (idempotent)
  DRY-RUN: show {connector, action, payload} on the dashboard  (ask-dashboard)
  approve? (per action)
      no  → execution.status = "skipped"
      yes → call the MCP tool (orchestrator) ; act-ledger.mjs record {key,...,result}
            execution.status = "executed" | "failed"
```

## ACT-PLAN.json — execution extension (Phase 2)
Each `tasks[]` entry that ACT can act on gains an `execution` block; the deliverable may gain `channel_auth`.

```json
{
  "id": "g2", "text": "Publish landing page", "auto": "automatable", "channel": "web",
  "execution": {
    "connector": "deploy-static",
    "mode": "auto",
    "status": "planned|previewed|approved|executed|skipped|failed",
    "dry_run": { "action": "deploy", "target": "act/act-001-landing/", "preview": "netlify deploy --dir …" },
    "idempotency_key": "x74fd2651408251aa",
    "approved_at": null, "executed_at": null, "result": null, "error": null
  }
}
```

- `execution.status` lifecycle: `planned → previewed → approved → executed` (or `skipped` / `failed`).
- `result` = the connector's return (deployed URL, issue link, draft id).
- Top-level `ACT-PLAN.phase2 = { enabled: bool, connectors_found: [...], policy: {...from act-executors.json} }`.

## Files
```
act/
  exec-state.json     idempotency state (key → last record)   [act-ledger.mjs]
  exec-ledger.jsonl   append-only execution log
  ACT-PLAN.json       tasks[].execution blocks added in Phase 2
```

## Tooling
- `scripts/act-ledger.mjs` — `key | check | record | list` (idempotency + audit log). **Built + tested.**
- `references/act-executors.json` — channel → capability/mode registry + policy. **Built.**
- MCP call itself — **orchestrator-driven** via ToolSearch (no vendor code shipped). Degrades to Phase-1 when absent.

## Status
Foundation built (ledger + registry + contract + gated SKILL flow), default-OFF, draft/reversible-first.
What is intentionally NOT shipped: hardcoded vendor integrations, auto-publish of social/email, and anything
on the never-auto list. Those require the user's own MCP connectors + explicit per-action approval.
