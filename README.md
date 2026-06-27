# agentic-suite
<img width="1522" height="802" alt="image" src="https://github.com/user-attachments/assets/18724d2e-3a1d-48d4-9cb9-d8c33ae868ed" />

**BUILD → GROW conductor.** For a single request that needs *both* software built *and* growth work on top
of it (SEO, marketing, sales, research, content, strategy), the suite runs **agentic-app-builder** to build
and ship the product, hands off a factual product brief, then runs **agentic-worker** to do the growth work —
grounded in what was actually built. One continuous BUILD → GROW flow. Runs **in-session** under Claude Code;
**no API key**, uses your subscription.

---

## What it does

```
request ─▶ pre-flight ─▶ classify ─▶ split ─▶ [BUILD] ─▶ gate ─▶ HANDOFF.json ─▶ [GROW] ─▶ showcase + summary
```

- **Pre-flight** — auto-runs `suite-doctor` to check the environment before anything starts.
- **Classifies** the request: build-only → agentic-app-builder; grow-only → agentic-worker; **mixed** → the chain.
- **Splits** a mixed request into a `build_brief` (software) and a `grow_brief` (growth deliverables).
- **BUILD** — agentic-app-builder runs to completion (interview → design/wireframe → plan → TDD → parallel
  impl → two-stage review), live dashboard on **:4317**.
- **Gate** — a deterministic completion gate (`check-build-gate.mjs`) must pass before GROW starts.
- **Handoff** — synthesizes `HANDOFF.json` (product, features, stack, URLs, decisions, build_status, shared memory).
- **GROW** — agentic-worker runs with the brief so it doesn't re-interview; its growth agents + the shared
  192-persona specialist registry work against the real product. Dashboard on **:4318**.
- **Showcase** — generates `grow/outputs/showcase.html` (interactive, auto-opens) of every deliverable.

It is deliberately **thin**: the conductor owns no build or growth logic — it classifies, sequences, gates,
and bridges. The two engines do the real work unchanged.

---

## Install

```
/plugin marketplace add FaisalNoman/agentic-suite
/plugin install agentic-suite@agentic-suite
```

Installs **all three skills** at once. (Standalone `agentic-app-builder` / `agentic-worker` remain available
if you want just one.)

## Quick start

Just prompt — nothing to set up first:

> Build a photo-manager web app, then write its SEO strategy, a content-marketing plan, and a sales proposal.

The conductor pre-flights the environment, builds the app, gates completion, hands off, and produces the
growth deliverables against the real product — then opens the showcase.

- **Build-only** ("build me X") → routes straight to agentic-app-builder.
- **Grow-only** ("research X and write a report") → routes straight to agentic-worker.
- **Mixed** ("build X then market it") → the full BUILD → GROW chain.

---

## Routing — which engine runs

At Stage 0 the conductor classifies intent and routes to one of three paths. The rule of thumb:

- The request produces or edits **runnable code** anywhere → **BUILD** (agentic-app-builder) participates.
- The request produces a **document, dataset, or strategy** deliverable → **GROW** (agentic-worker) participates.
- **Both** → the **BUILD → GROW** chain (build first, then grow against the real product).
- **Neither is clear** → the conductor asks you once (on the dashboard) which you intended.

A marketing-flavoured noun (SEO, sales, brand) does **not** force GROW if the deliverable is software —
e.g. *"an SEO **tool**"* is a BUILD. Conversely, *"landing-page **copy**"* is GROW even though a landing
page is code.

### Common requests

| Prompt | Runs |
|---|---|
| "Build me a todo web app" / "Build a CLI that converts CSV→JSON" | **builder only** |
| "Fix this login bug" / "this test is failing" | **builder only** (surgical) |
| "Add dark mode" / "refactor the API" / "migrate React→Vue" | **builder only** (feature) |
| "Build a landing page / website" | **builder only** (it is code) |
| "Research and compare 5 CRM tools (features + price)" | **worker only** |
| "Write an SEO strategy" / "produce a competitive-intelligence report" | **worker only** |
| "Write landing-page copy + 3 launch tweets" | **worker only** (copy ≠ building the page) |
| "Analyze this sales dataset and recommend actions" | **worker only** |
| "Build a photo manager, then write its SEO + go-to-market plan" | **builder → worker** |
| "Create a SaaS dashboard and a sales deck for it" | **builder → worker** |
| "Ship a habit tracker and market it" | **builder → worker** |

### Edge cases & tie-breakers

| Prompt | Runs | Why |
|---|---|---|
| "Redesign my landing page" | **builder** (feature) | changing UI code, not writing copy |
| "Improve my site's SEO" | **conductor asks** | *technical* SEO (meta/sitemap/perf in the codebase) = builder; SEO *strategy doc* = worker |
| "Audit my codebase for security bugs" | **builder** (diagnose) | code analysis, not business research |
| "Audit my brand's market positioning" | **worker** | business research |
| "Build a tool that generates SEO reports" | **builder only** | it is a *tool* — the SEO flavour does not make it grow |
| "Fix my SEO rankings" (no codebase) | **worker** | strategy/content, no code to change |
| "Scrape competitor prices" | **conductor asks** | a reusable *scraper tool* → builder; the *price data/report* → worker |
| "Translate my app UI to Spanish" | **builder** (feature) | i18n code change |
| "Write API docs for my service" | **borderline** | in-repo README → builder; standalone docs portal → worker |
| "Build a frontend and a backend API" | **builder only** | two code targets, one parallel build run |
| "Build a blog, then write 10 SEO articles for it" | **builder → worker** | build app + bulk content |
| "Build a dashboard that displays a competitor analysis" | **builder → worker** | build the app + produce the analysis content |
| "Give me feature ideas for my app" | **worker** | ideation/research, no code |
| "Build X" (no detail) | **builder**, brainstorming first | vague → a brainstorming gate runs before building |

**Two things people miss:**

1. **Pre-build research is not GROW.** *"Research the best stack, then build the app"* → **builder only** —
   research that *informs* the build is handled inside builder's own interview/planning. GROW is
   *post-product* growth and never runs before BUILD.
2. **Order is hard-wired BUILD → GROW** (growth depends on the product existing). A
   *research-then-build-from-findings* request is not modelled as a chain; run `agentic-worker` for the
   research first, then feed it into a separate `agentic-app-builder` run.

### Invoking directly
`/agentic-suite` classifies and routes any of the above (and chains when mixed). For a known single intent
you can skip the classify hop: build-only → `agentic-app-builder`; grow-only → `agentic-worker`.

---

## Features

**BUILD (agentic-app-builder)**
- Three modes auto-detected: **GREENFIELD** (from scratch), **FEATURE** (add to a codebase), **SURGICAL** (fix bugs).
- Global **dependency-graph scheduler** — parallel agent swarm, milestone gates, not per-sprint barriers.
- **Design routing** → `ui-ux-pro-max` (or best installed design skill) generates the design system first.
- **Wireframe/demo approval on the dashboard** — builds a throwaway `demo/index.html`, shows an **🖼 Open
  Demo** button on the board, loops on Approve / Suggest changes before any real code.
- **TDD** (tests before impl, enforced as DAG edges) + **two-stage review** (spec + quality) per milestone.
- **Per-language coding rules** (`references/rules/`) injected per code agent (ts/js/py/go/rust/java/csharp).
- **Model tiering** — impl agents on the cheap tier, architect/review on the top tier (Agent `model` param).

**GROW (agentic-worker)**
- Classifies domain, decomposes the brief, runs specialists in **parallel** on its own DAG scheduler.
- **192-persona specialist registry** (15 domains) — scored, scoped routing (loads only what's needed).
- Coherence merge across tasks → combined `grow/outputs/` + interactive **showcase.html** (copy-code buttons).

**Live dashboards** (one per phase, http on :4317 / :4318)
- Two-way: **interview questions + plan approval happen on the board** (modal), not the CLI.
- **Animated flow** — the plan renders as a live DAG flowchart; nodes animate ready → working → done.
- **Model badge** on each agent card + a model-mix summary (predict spend), plus a **real-token KPI**.
- **Replay** tab — scrub the event log to reconstruct any past moment.

**Safety / cost (opt-in hooks — see below)**
- config-protection, dangerous-bash, protect-state, circuit-breaker, cost-persist + budget alert.

**Cross-run learning**
- A **lessons ledger** (`.agentic-builder/lessons.json`) distils each run's signals + user overrides and
  warm-starts the next run.

**Resilience**
- Crash-resume at every level (`framework-state.json` / `suite-state.json`); deterministic build gate;
  `/suite-resume` for a one-command briefing of where an interrupted run stands.

---

## Pre-flight (automatic)

On a fresh run the conductor auto-runs `suite-doctor` — node, both skills, the registry, dashboard ports,
write access, `suite-state.json` integrity, git, and whether the optional hooks are installed. It proceeds
only if the environment is sound; on a blocking failure it stops and tells you exactly what to fix.

Run it yourself anytime:
```
/suite-doctor
# or:
node ~/.claude/skills/agentic-suite/scripts/suite-doctor.mjs
```

## Optional guardrails (hooks)

For long or unattended runs, install an **opt-in enforcement pack** that turns prose rules into deterministic
guards the swarm (incl. subagents) cannot skip — config-protection (no weakening test/lint configs),
dangerous-bash (no `rm -rf /`, `push --force`, `curl|sh`), protect-state (no editing `.git`/settings/hooks),
circuit-breaker (stop after repeated failures), cost-persist (budget alert), and state snapshots.

```
node ~/.claude/skills/agentic-suite/scripts/install-hooks.mjs      # --scope user for global
# then RESTART Claude Code (hooks load at session start)
```

Hooks are **dormant unless a suite run is active**, **fail-open** (a hook bug never breaks your session), and
removable with `uninstall-hooks.mjs`. The suite runs fine without them; the pre-flight reminds you they exist.

## Commands & scripts

| Command / script | What it does |
|---|---|
| `/suite-doctor` | Pre-flight environment check (auto-runs at Stage 0; also manual). |
| `/suite-resume` | Briefing of an interrupted run + where to continue. |
| `scripts/install-hooks.mjs` / `uninstall-hooks.mjs` | Install / remove the opt-in enforcement hooks. |
| `scripts/check-build-gate.mjs` | Deterministic BUILD-completion gate (run by Stage 2.5). |
| `scripts/scan-surface.mjs` | Advisory security scan of the persona registry + skill/settings/hook files. |
| `scripts/suite-resume.mjs` | The resume briefing helper behind `/suite-resume`. |

All scripts are **zero-dependency Node** (`.mjs`) — cross-platform, no install step.

---

## What's bundled (one install gives all three)

This repo ships **all three skills** under `skills/` — `conductor`, `agentic-app-builder`, and
`agentic-worker` — plus a shared specialist library in a single `skills/agents/` folder (a sibling of the
skill dirs). Both engines resolve it via `../agents/registry.json` — ONE copy, no duplication.

```
agentic-suite/skills/
  agents/                ← shared library: registry.json (192 registered personas, 15 domains) + persona .md
  conductor/             ← the BUILD→GROW orchestrator (this skill = "agentic-suite")
    scripts/             ← suite-doctor, check-build-gate, install/uninstall-hooks, scan-surface, suite-resume
    hooks/               ← suite-hook.mjs (opt-in enforcement dispatcher)
    commands/            ← /suite-doctor, /suite-resume
  agentic-app-builder/   ← software engine — resolves ../agents
  agentic-worker/        ← growth engine — resolves ../agents
```

> **Sync note:** the bundled `agentic-app-builder` and `agentic-worker` are copies of their standalone repos.
> Treat this suite as the source of truth; re-sync the standalone mirrors on release to avoid drift.

## State & resume

`suite-state.json` (conductor) and `framework-state.json` (each engine) are the source of truth. On a re-run
or a fresh session, state is read and the run resumes from where it stopped — completed phases are skipped,
the build gate is re-checked, GROW resumes from its own DAG. `/suite-resume` prints the briefing. State files
and run artifacts (`build/`, `grow/`, `outputs/`, `.agentic-builder/`, `.claude/settings.json`) are gitignored.

## How chaining works

```
request ─▶ classify ─▶ split ─▶ [BUILD: agentic-app-builder] ─▶ gate ─▶ HANDOFF.json ─▶ [GROW: agentic-worker] ─▶ summary
```

Growth depends on the product, so the order is strict: BUILD completes and passes the gate, then GROW. The
handoff brief is what keeps GROW grounded — without it, agentic-worker would re-interview and produce generic
work. For a large build the conductor offers a clean session boundary (resume into GROW from `HANDOFF.json`).

## Status / roadmap

- **Now:** all three skills bundled; conductor + `HANDOFF.json` bridge + deterministic gate; dashboard
  prompts/approval/flow/model-badges; opt-in enforcement hooks; security scan; per-language rules; model
  tiering; lessons ledger; pre-flight doctor; showcase.
- **Planned:** unified BUILD→GROW dashboard (one board, one timeline); shared core (scheduler / registry /
  memory / dashboard) so both engines become thin frontends.

In-session, no API key. MIT.
