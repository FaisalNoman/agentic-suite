---
name: agentic-suite
description: Conductor that chains BUILD → GROW for a SINGLE request needing BOTH software built AND business/growth work on top of it (SEO, marketing, sales, research, content, strategy). It runs agentic-app-builder to build and ship the software, synthesizes a product handoff brief, then runs agentic-worker to do the growth work grounded in what was actually built — sequentially, with a handoff in between. Trigger on prompts that mix an SDLC task with non-engineering deliverables, e.g. "build X then market it", "create the app and write the SEO/marketing/sales strategy", "ship it and grow it", "build a photo manager then produce a go-to-market plan", or any request combining build/fix/extend software with research/content/marketing/sales/strategy outputs. Runs in-session under Claude Code. No API key.
---

# agentic-suite — BUILD → GROW conductor

A THIN orchestrator. It owns no build or growth logic of its own — it splits a mixed request, runs
**agentic-app-builder** (BUILD), hands off a product brief, then runs **agentic-worker** (GROW). Both skills
do the real work unchanged; the conductor only classifies, sequences, and bridges.

Bundled: this suite ships all three skills (`conductor` + `agentic-app-builder` + `agentic-worker`) plus the
shared `agents/registry.json` under `skills/`, so a single install registers everything and the
conductor's Skill-tool invocations always resolve. (If a skill is somehow missing, say so and fall back
to running whichever is present.)

## Operating rules

1. **Mixed-intent only.** Use the conductor ONLY when a request needs BOTH software AND business/growth
   deliverables. Build-only → hand to `agentic-app-builder` and stop. Grow-only → hand to `agentic-worker`
   and stop. (Decision in `references/prompt-split.md`.)
2. **Sequence BUILD → GROW.** Growth work almost always depends on the product existing (SEO needs the
   site, a sales proposal needs features). Default order is strict: BUILD completes, THEN GROW.
3. **Bridge with a handoff brief.** After BUILD, synthesize `HANDOFF.json` (`references/handoff-contract.md`)
   and feed it to GROW so agentic-worker does NOT re-interview — it grows the REAL product.
4. **Namespace state.** BUILD runs in `build/` (its own `plan/state`, dashboard port 4317); GROW runs in
   `grow/` (its own `plan/state`, dashboard port 4318). The conductor keeps `suite-state.json` at the top.
5. **Thin.** No build/growth logic here. Delegate everything to the two skills. The conductor never
   spawns task subagents itself.
6. **Resume.** On re-run, read `suite-state.json`; skip a completed phase; resume the interrupted one.

## STAGE 0 — Classify intent (read `references/prompt-split.md`)

Classify the request into `{ needs_build, needs_grow, build_brief, grow_brief }`.

- `needs_build && !needs_grow` → invoke the `agentic-app-builder` skill with the whole request. Stop.
- `needs_grow && !needs_build` → invoke the `agentic-worker` skill with the whole request. Stop.
- `needs_build && needs_grow` → this is a suite run. Continue to Stage 1.
- Neither clearly → ask the user once which they want (dashboard-first if a board is up, else `AskUserQuestion`).

Write `suite-state.json`:
```json
{ "phase": "classify|build|handoff|grow|done", "needs_build": true, "needs_grow": true,
  "build_brief": "…", "grow_brief": "…", "handoff": null, "updated_at": "<iso>" }
```

## STAGE 1 — Split

Produce two scoped briefs from the one request (`references/prompt-split.md`):
- `build_brief` — the SDLC portion (what software to build/fix/extend), verbatim where possible.
- `grow_brief` — the growth portion (SEO / marketing / sales / research / content / strategy tasks).

Confirm the split with the user once (dashboard-first), then persist both to `suite-state.json`.

## STAGE 2 — BUILD (invoke agentic-app-builder)

Set `suite-state.phase = "build"`. Tell the user: "Phase 1/2 — BUILD. Handing the software scope to
agentic-app-builder; its dashboard opens on :4317."

Invoke the **agentic-app-builder** skill (Skill tool) with `build_brief`. Let it run its full pipeline
(interview/plan/TDD/impl/review) to completion — the conductor does not interfere. Direct its work into
a `build/` working area so its `plan/` is isolated.

**Dashboard safety net.** agentic-app-builder must launch its board on :4317 by copying the template from
**its own skill base dir** (`<agentic-app-builder-base>/template/dashboard/`) → `build/plan/dashboard/`.
If `build/plan/state/dashboard.json` doesn't appear shortly after it starts (a nested-run path slip),
copy the template yourself from the agentic-app-builder skill base and run `node build/plan/dashboard/server.mjs`.
Then read the `url` from `build/plan/state/dashboard.json` and open THAT http URL — **never open
`index.html` as a file (`file://`)**; the file has no server, so the board is dead. Never let the BUILD
phase proceed with no live board.

When agentic-app-builder finishes (its Phase 9), capture where it wrote outputs and state.

## STAGE 3 — Handoff (synthesize the product brief)

Set `phase = "handoff"`. Build `HANDOFF.json` per `references/handoff-contract.md`.

agentic-app-builder does not yet emit `HANDOFF.json` natively, so the conductor SYNTHESIZES it from the
build's artifacts: `build/plan/state/framework-state.json` (milestones, features), `build/plan/docs/`
(PRD/FEATURES/TECH-STACK), the run dashboard URL, the produced file map, and the shared
`.agentic-builder/memory.json` (decisions). (Follow-up: have agentic-app-builder write `HANDOFF.json` at
Phase 9 directly — then this stage just reads it.)

Write `HANDOFF.json` to the top level AND copy it into `grow/plan/docs/HANDOFF.json` so agentic-worker's
bring-your-own-docs gate picks it up as the product brief.

## STAGE 4 — GROW (invoke agentic-worker)

Set `phase = "grow"`. Tell the user: "Phase 2/2 — GROW. Handing the growth scope to agentic-worker with
the product brief; its dashboard opens on :4318."

Invoke the **agentic-worker** skill (Skill tool) with `grow_brief`, working in `grow/`. **Dashboard safety
net:** agentic-worker must launch its board on :4318 by copying the template from its own skill base dir
(`<agentic-worker-base>/template/dashboard/`) → `grow/plan/dashboard/`; if `grow/plan/state/dashboard.json`
doesn't appear, copy it yourself and run `node grow/plan/dashboard/server.mjs`, then open the http `url`
from `grow/plan/state/dashboard.json` (**never the `index.html` file**). Because
`grow/plan/docs/HANDOFF.json` is present, agentic-worker's docs gate uses it as the product context and
SKIPS re-interviewing — its SEO/marketing/sales/research agents work against the real product (features,
stack, URLs). Its specialist-registry router (P6) picks the business personas from the shared
`agents/registry.json`. Let it run to completion.

## STAGE 5 — Wrap up

Set `phase = "done"`. Print a combined summary: what was BUILT (with run instructions) + what GROW
produced (the growth deliverables and where they live). Point the user at both dashboards' Replay tabs
for the full audit trail.

## Dashboards (v1 — sequential takeover)

BUILD uses agentic-app-builder's board (:4317); GROW uses agentic-worker's (:4318). The conductor announces
the transition at Stage 4. (Roadmap: a unified BUILD→GROW board once both skills share a core — see the
suite's SUITE-PLAN.)

## Reference files

- `references/prompt-split.md` — intent classifier + how to split one request into build_brief + grow_brief.
- `references/handoff-contract.md` — `HANDOFF.json` schema, how to synthesize it from the build, how GROW consumes it.
