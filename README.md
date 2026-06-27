# agentic-suite

**BUILD → GROW conductor.** For a single request that needs *both* software built *and* growth work on
top of it (SEO, marketing, sales, research, content, strategy), the suite runs
[agentic-app-builder](https://github.com/FaisalNoman/agentic-builder) to build and ship the product, hands
off a factual product brief, then runs **agentic-worker** to do the growth work — grounded in what was
actually built. One continuous BUILD → GROW flow. In-session, no API key.

## What it does

- **Classifies** the request: build-only → agentic-app-builder; grow-only → agentic-worker; **mixed** → the chain.
- **Splits** a mixed request into a `build_brief` (software) and a `grow_brief` (growth deliverables).
- **BUILD** — runs agentic-app-builder to completion (interview → plan → TDD → impl → review), dashboard on :4317.
- **Handoff** — synthesizes `HANDOFF.json` (product, features, stack, URLs, decisions, shared memory).
- **GROW** — runs agentic-worker with the brief so it doesn't re-interview; its growth agents (and the
  shared 192-persona specialist registry) work against the real product. Dashboard on :4318.

It is deliberately **thin**: it owns no build or growth logic — it only classifies, sequences, and bridges.

## What's bundled (one install gives all three)

This repo ships **all three skills** under `skills/` — `conductor`, `agentic-app-builder`, and
`agentic-worker` — plus a shared **192-persona** library in a single `skills/agents/` folder (a sibling of
the skill dirs). Both agentic-app-builder and agentic-worker resolve it via `../agents/registry.json` — ONE
copy, no duplication, no skill reaching into another's folder. A single install registers everything.

```
agentic-suite/skills/
  agents/            ← shared library: registry.json + 226 persona .md (sibling)
  conductor/         ← the BUILD→GROW orchestrator
  agentic-app-builder/   ← software (P0–P6) — resolves ../agents
  agentic-worker/     ← growth (P0–P6) — resolves ../agents
```

## Install

```
/plugin marketplace add FaisalNoman/agentic-suite
/plugin install agentic-suite@agentic-suite
```

Installs **all three skills** at once. (The standalone `agentic-app-builder` / `agentic-worker` repos remain
available if you want just one.)

> **Sync note:** the bundled `agentic-app-builder` and `agentic-worker` are copies of their standalone repos.
> Re-sync them on each release (or treat this suite as the source of truth and the standalone repos as
> mirrors) to avoid drift.

Then prompt, e.g.:

> Build a photo-manager web app, then write its SEO strategy, a content-marketing plan, and a sales proposal.

The conductor builds the app, hands off, and produces the growth deliverables against it.

**You don't need to run anything first.** On a fresh run the conductor auto-runs a pre-flight check
(`scripts/suite-doctor.mjs` — node, skills, registry, ports, write access, state) and only proceeds if the
environment is sound; on a blocking failure it stops and tells you exactly what to fix. To run it yourself
anytime: `/suite-doctor` (or `node ~/.claude/skills/agentic-suite/scripts/suite-doctor.mjs` from your
project folder).

**Optional guardrails (hooks).** For long/unattended runs you can install an opt-in enforcement pack
(config-protection, dangerous-bash, circuit-breaker, cost-alert, …). The pre-flight tells you if it's not
installed and prints the command. To enable: `node ~/.claude/skills/agentic-suite/scripts/install-hooks.mjs`
**then restart Claude Code** (hooks load at session start). The suite runs fine without it.

## Status

- **Phase 1 (this release):** all three skills bundled in one install; conductor + `HANDOFF.json` bridge; sequential dashboards (:4317 → :4318).
- **Phase 2 (planned):** unified BUILD→GROW dashboard (one board, one timeline).
- **Phase 3 (planned):** extract a shared core (scheduler / registry / memory / dashboard) so both skills
  are thin frontends.

See `SUITE-PLAN.md` in the agentic-app-builder repo for the full plan.

## How chaining works

```
request ─▶ classify ─▶ split ─▶ [BUILD: agentic-app-builder] ─▶ HANDOFF.json ─▶ [GROW: agentic-worker] ─▶ summary
```

Growth depends on the product, so the order is strict: BUILD completes, then GROW. The handoff brief is
what keeps GROW grounded — without it, agentic-worker would re-interview and produce generic work.
