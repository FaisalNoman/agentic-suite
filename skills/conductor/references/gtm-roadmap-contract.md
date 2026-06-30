# GTM-roadmap deliverable — contract

A flagship GROW deliverable: a **phased, budgeted, channel-tagged go-to-market roadmap** where every task
carries not just a description but **the generated asset AND a human execution playbook**. The worker (LLM)
fills the JSON; `scripts/gtm-roadmap.mjs` (deterministic) renders it to `gtm-roadmap.md` + an interactive
`gtm-roadmap.html`. ACT then turns each task's `asset` into a concrete artifact where it can.

## Why per-task guidelines
Most GTM tasks are **asset-only** for an automated system: the suite can write the cold-email sequence or the
ad copy, but a human (or a gated connector) must actually send/launch it. So every task records an **owner** and
a **guidelines** playbook — the founder is handed the asset *and* exactly how to ship it. Never an orphan asset.

## owner (who executes)
- `suite` 🤖 — the suite produces the finished thing end-to-end (build/deploy/write a shippable file).
- `connector` 🔌 — the asset is ready; an opt-in MCP connector can execute it (reversible only — schedule/draft).
- `human` 🧑 — the asset is ready; a person must act (account creation, a call, a relationship, money, or a
  `never_auto` channel: paid-ads / bulk-email / DMs). The guidelines tell them how.

## JSON schema
```json
{
  "product": "QNext", "markets": ["AU", "USA", "Global"],
  "summary": { "phases": 5, "total_tasks": 30, "budget_total": "≈ $16,900 USD", "day_plan": 90 },
  "phases": [
    {
      "id": "p1", "name": "Pre-Launch Foundation", "window": "Week 1–2", "budget": "~$600 one-time",
      "tasks": [
        {
          "id": "P1-A", "title": "Global-ready landing page with pricing",
          "channel": "seo|email|paid|social|sales|content|product",
          "effort": "high|med|low", "budget": "$0–200", "owner": "suite|connector|human",
          "objective": "One line: what this task achieves.",
          "asset": { "type": "page|copy|email-sequence|ad-set|post|script|doc|plan", "path": "act/…", "note": "optional" },
          "guidelines": ["Step 1 …", "Step 2 …"],          // the human execution playbook
          "tools": ["Framer", "Calendly"], "kpi": "Demo bookings / week",
          "gated": null                                      // or "never_auto: paid-ads" etc.
        }
      ]
    }
  ]
}
```

## Renderer — `scripts/gtm-roadmap.mjs`
```
node gtm-roadmap.mjs <roadmap.json|-> [--out-dir grow/outputs] [--no-open]
```
Writes `<out-dir>/gtm-roadmap.md` (full, with per-task guidelines) + `<out-dir>/gtm-roadmap.html`
(interactive: phase sections, owner badges, channel tags, budgets, done-checkboxes, progress, filter).
Deterministic; the CONTENT is the worker's, the STRUCTURE/RENDER is the script's.

## How it flows
1. GROW (agentic-worker) detects a GTM/launch/marketing-strategy brief → fills the roadmap JSON against the
   real product (`HANDOFF.json`), writing a concrete asset + guidelines per task.
2. `gtm-roadmap.mjs` renders md + html into `grow/outputs/` (surfaced in the showcase).
3. ACT (`act-scan` → Executor B) turns each task's `asset` into a real artifact where the type is supported
   (copy/email-sequence/ad-set/post/page); `human`/`connector` tasks keep their guidelines for the founder.
```
