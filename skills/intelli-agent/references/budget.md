# intelli-agent — Soft budget caps & cost tracking (P1)

Adds optional token/USD soft caps to the scheduler: warn at a configurable threshold,
pause and prompt for approval when the cap is reached.

---

## Budget config

Add a `budget` block to `plan/state/framework-state.json` at Stage 0 (init alongside `scheduler`):

```json
"budget": {
  "max_tokens": null,
  "max_usd":    null,
  "warn_pct":   0.8,
  "prices": {
    "claude-opus-4":    { "in": 15.00, "out": 75.00 },
    "claude-sonnet-4":  { "in":  3.00, "out": 15.00 },
    "claude-haiku-4":   { "in":  0.80, "out":  4.00 }
  },
  "state": "ok"
}
```

- `max_tokens` / `max_usd` — soft cap; `null` = unlimited (default).
- `warn_pct` — fraction of cap at which a warning is logged (default 0.8 = 80%).
- `prices` — per-model USD per million tokens (see `## Pricing`); values above are PLACEHOLDERS.
- `state` ∈ `ok | warned | paused` — set by the scheduler hook each loop.

---

## Pricing

**IMPORTANT:** The `prices` table above contains placeholder values only. Do NOT rely on
them for billing. Always verify current rates via the `claude-api` skill (the authoritative
live source for Anthropic pricing).

USD cost formula (applied to the totals returned by `token-report.mjs`):

```
usd = (in_tokens  / 1_000_000) * prices[model].in
    + (out_tokens / 1_000_000) * prices[model].out
```

`in_tokens` includes cache-creation and cache-read tokens (already summed by `token-report.mjs`).
`model` defaults to the model id in `framework-state.json` (`model` field, if set) or the
detected run model. If the model key is absent from `prices`, skip the USD check and log a warning.

When both `max_tokens` and `max_usd` are set, whichever cap is reached first triggers the breach.

---

## Scheduler hook

Insert as **step 0 at the very top of the LOOP** in `scheduler.md`, before step 1 CONTROL CHECK:

```
BUDGET CHECK (every loop iteration — skip if max_tokens and max_usd are both null):

  raw = exec(`node plan/dashboard/token-report.mjs <projectRoot> <startedAt>`)
  // raw → JSON { in, out, total } or null (transcript not yet written)
  if raw is null → skip this iteration's check

  tokens = raw.total
  usd    = (raw.in / 1e6) * prices[model].in + (raw.out / 1e6) * prices[model].out

  cap_tokens = budget.max_tokens  // null = ∞
  cap_usd    = budget.max_usd     // null = ∞

  pct = max(
    cap_tokens ? tokens / cap_tokens : 0,
    cap_usd    ? usd    / cap_usd    : 0
  )

  if pct >= 1.0 and budget.state != "paused":
    budget.state = "paused"
    → PAUSE (see "Breach pause protocol")
    // do NOT fall through to CONTROL CHECK until resolved

  elif pct >= warn_pct and budget.state == "ok":
    budget.state = "warned"
    log { t: now, msg: `Budget warning — ${(pct*100).toFixed(0)}% of cap used (${tokens} tokens / $${usd.toFixed(4)})` }
    // continue normally

  elif pct < warn_pct:
    budget.state = "ok"

  Save plan/state/framework-state.json (budget.state + updated_at)
```

`<projectRoot>` = absolute path in `framework-state.json` under `root` (or `process.cwd()`).
`<startedAt>` = `agents.json` `startedAt` ISO string — the run baseline used by the dashboard.

---

## Breach pause protocol

When `pct >= 1.0` (cap exceeded):

1. **Write a `prompt` to `plan/state/agents.json`:**
```json
{
  "id": "budget-breach",
  "title": "Budget cap reached — run paused",
  "question": "Token/USD cap exceeded.\n\nSpend so far: {tokens} tokens / ${usd}\nCap: {cap_tokens} tokens / ${cap_usd}\n\nHow do you want to proceed?",
  "options": ["Raise cap & continue", "Continue once (ignore)", "Abort run"],
  "answered": false
}
```

2. **Block:** `node plan/dashboard/wait-answer.mjs budget-breach 600`

3. **On answer:**
   - `"Raise cap & continue"` — re-ask for new `max_tokens` and/or `max_usd` (Stage 0 wording
     below), write updated values to `budget` in `framework-state.json`, set `budget.state = "ok"`,
     mark prompt `answered: true`, resume LOOP.
   - `"Continue once (ignore)"` — set `budget.state = "ok"` for this iteration only (threshold
     re-triggers next loop if still over cap). Resume LOOP.
   - `"Abort run"` — write BLOCKED.md entry (`Reason: budget cap hard-stop; spend ${usd} vs cap
     ${cap_usd}`), finish via the Phase 9 finishing sequence with a BLOCKED-style summary. Do NOT commit.

**Background / unattended mode** (`mode: background` or non-interactive session): skip the
dashboard modal. Log the breach to `agents.json` `log`; wait up to 60 s for a reply via
`wait-answer.mjs`; if no reply, log `"Budget cap exceeded — aborting (unattended)"` and abort.

---

## Stage 0 preflight wording

Ask this question during Stage 0 setup (after domain detection, before DAG scaffold):

> **Optional: set a token/cost soft cap for this run.**
>
> You can set a maximum token count and/or USD spend. The run will pause and ask for approval
> if the cap is reached, and warn you at 80% of the limit.
>
> Leave either field blank for no cap (unlimited).
>
> • Max tokens (e.g. 500000): ___  [leave blank = no limit]
> • Max USD     (e.g. 2.50):   ___  [leave blank = no limit]

Store non-blank answers as numbers in `plan/state/framework-state.json` under `budget.max_tokens`
and `budget.max_usd`. Leave as `null` if blank. Do not ask again on resume (values already stored).
