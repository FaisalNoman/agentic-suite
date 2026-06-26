# agentic-suite

**BUILD → GROW conductor.** For a single request that needs *both* software built *and* growth work on
top of it (SEO, marketing, sales, research, content, strategy), the suite runs
[agentic-builder](https://github.com/FaisalNoman/agentic-builder) to build and ship the product, hands
off a factual product brief, then runs **intelli-agent** to do the growth work — grounded in what was
actually built. One continuous BUILD → GROW flow. In-session, no API key.

## What it does

- **Classifies** the request: build-only → agentic-builder; grow-only → intelli-agent; **mixed** → the chain.
- **Splits** a mixed request into a `build_brief` (software) and a `grow_brief` (growth deliverables).
- **BUILD** — runs agentic-builder to completion (interview → plan → TDD → impl → review), dashboard on :4317.
- **Handoff** — synthesizes `HANDOFF.json` (product, features, stack, URLs, decisions, shared memory).
- **GROW** — runs intelli-agent with the brief so it doesn't re-interview; its growth agents (and the
  shared 192-persona specialist registry) work against the real product. Dashboard on :4318.

It is deliberately **thin**: it owns no build or growth logic — it only classifies, sequences, and bridges.

## Prerequisites

The `agentic-builder` and `intelli-agent` skills must be installed (the suite invokes them via the Skill
tool). The conductor resolves the shared `agents/registry.json` from the agentic-builder install.

## Install

```
/plugin marketplace add FaisalNoman/agentic-suite
/plugin install agentic-suite@agentic-suite
```

Then prompt, e.g.:

> Build a photo-manager web app, then write its SEO strategy, a content-marketing plan, and a sales proposal.

The conductor builds the app, hands off, and produces the growth deliverables against it.

## Status

- **Phase 1 (this release):** conductor + `HANDOFF.json` bridge; sequential dashboards (:4317 → :4318).
- **Phase 2 (planned):** unified BUILD→GROW dashboard (one board, one timeline).
- **Phase 3 (planned):** extract a shared core (scheduler / registry / memory / dashboard) so both skills
  are thin frontends.

See `SUITE-PLAN.md` in the agentic-builder repo for the full plan.

## How chaining works

```
request ─▶ classify ─▶ split ─▶ [BUILD: agentic-builder] ─▶ HANDOFF.json ─▶ [GROW: intelli-agent] ─▶ summary
```

Growth depends on the product, so the order is strict: BUILD completes, then GROW. The handoff brief is
what keeps GROW grounded — without it, intelli-agent would re-interview and produce generic work.
