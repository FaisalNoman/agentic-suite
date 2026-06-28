# Fix #5 — RESEARCH-first pre-stage (spec, not yet built)

## Problem
The suite order is hard-wired **BUILD → GROW (→ ACT)**: growth depends on the product. But some requests are
the reverse — *research an idea first, then build from the findings, then market it*:

> "Research the market for a habit tracker, then build the app based on that research, then write the sales
> + marketing."

Today this isn't modeled. Workaround: run `agentic-worker` for the research, then start a separate suite/build
run with that doc as bring-your-own-docs input. Fix #5 makes it one flow.

## Design — an optional pre-BUILD research pass
Add a **RESEARCH** stage *before* BUILD when the user signals research-informs-build. The pipeline becomes:

```
request → pre-flight → classify → [RESEARCH (grow, scoped)] → BUILD → gate → HANDOFF → [GROW (growth)] → [ACT] → wrap
```

RESEARCH is just agentic-worker run in **research mode**, but its output is consumed as **BUILD input docs**,
not as final deliverables.

### Classification (Stage 0)
Add `needs_research_first` (distinct from `needs_grow`). True when the order is explicitly research-**then**-build:
- triggers: "research … then build", "based on that research build", "validate the idea then build", "research-led".
- NOT triggered by "build X then research/market it" (that's the normal forward chain).
Resulting shape: `{ needs_research_first, needs_build, needs_grow, needs_act, research_brief, build_brief, grow_brief }`.

### Stage R (new) — RESEARCH → build docs
1. `phase = "research"`. Invoke **agentic-worker** with `research_brief`, working in `research/`
   (board on a free port; or reuse :4318). Domain = research/analysis/market.
2. Worker produces research deliverables in `research/outputs/` (market analysis, competitor matrix,
   recommended stack/feature priorities, risks).
3. **Synthesize a build-input brief**: distil `research/outputs/` into `build/plan/docs/RESEARCH-BRIEF.md`
   (+ feed key findings into `build_brief`). This is the bridge — like HANDOFF.json but research→build.
4. Continue to STAGE 2 (BUILD). agentic-app-builder's bring-your-own-docs gate finds `RESEARCH-BRIEF.md`
   and uses it as planning input (stack/feature decisions come from the research, not a cold interview).

### Then forward as normal
BUILD → gate → HANDOFF → GROW (sales/marketing, grounded in the built product) → ACT (if `needs_act`).

### State / contract
- `suite-state.phase` enum gains `research`.
- New bridge doc `build/plan/docs/RESEARCH-BRIEF.md` (schema: `findings[]`, `recommended_stack`,
  `feature_priorities[]`, `risks[]`, `sources[]`) — analogous to `HANDOFF.json` but pointing the other way.
- Resume: `research` done → skip to BUILD; reuse existing crash-resume.

## Why it's Med-effort (not Low)
- It **inverts the conductor's core assumption** ("BUILD always first"). Touches Stage 0 classify + adds a
  whole pre-stage + a second bridge contract (RESEARCH-BRIEF.md) + agentic-app-builder must read it at its
  docs gate (a small app-builder change, not just conductor).
- Risk: two research-ish passes can blur (pre-build research vs post-build growth) — keep them distinct by
  `research_brief` (idea validation, stack/market) vs `grow_brief` (sell the built product).

## Decisions to lock before building
1. **Trigger precision** — only on explicit "research **then** build" ordering; default forward chain otherwise.
2. **Bridge** — `RESEARCH-BRIEF.md` as a doc (recommended) vs a JSON contract like HANDOFF.
3. **Board** — separate research board/port, or reuse GROW's :4318 sequentially.
4. **app-builder change** — confirm its bring-your-own-docs gate will treat `RESEARCH-BRIEF.md` as authoritative
   planning input.

## Effort / value
- **Effort:** Med (~1–1.5 days: conductor Stage R + classify + RESEARCH-BRIEF bridge + app-builder docs-gate tweak).
- **Value:** High *if* research-led builds are a real use case; otherwise the two-run workaround already covers it.
- **Recommendation:** build only when you actually want idea→research→build→market in one shot. Until then,
  the workaround (worker first, then suite with the doc) is sufficient.
