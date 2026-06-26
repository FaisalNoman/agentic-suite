# Conductor — intent classifier & prompt split

Decide whether a request is BUILD-only, GROW-only, or MIXED, then split a MIXED request into two scoped
briefs. Lightweight keyword + intent reasoning — no subagents.

## Signals

**BUILD (→ agentic-builder, SDLC):**
- verbs: build, create, scaffold, prototype, ship, implement, develop, code, fix, debug, refactor, extend
- nouns: app, web app, website, dashboard, API, CLI, library, tool, service, feature, bug

**GROW (→ intelli-agent, business/research/content):**
- SEO, marketing, content, blog, social, campaign, go-to-market, GTM, launch plan
- sales, sales proposal, pitch, outreach, pricing strategy
- research, competitive analysis, market analysis, report, brief, strategy
- analyze (non-code data), summarize, write (non-code copy)

## Classification

```
needs_build = any BUILD signal present AND the deliverable includes software
needs_grow  = any GROW signal present AND the deliverable includes a non-engineering output
```

- `needs_build && !needs_grow` → run `agentic-builder` on the whole request; conductor stops.
- `needs_grow && !needs_build` → run `intelli-agent` on the whole request; conductor stops.
- both → MIXED → split (below) and run the BUILD → GROW chain.
- neither clear → ask the user once.

Edge cases:
- "build an app **that does** marketing" → the marketing is a PRODUCT FEATURE, not a GROW deliverable →
  BUILD-only. GROW is about producing growth ARTIFACTS (a strategy doc, copy, a plan), not app features.
- "write a script to scrape SEO data" → that's software → BUILD (code), not GROW.
- A pure data-analysis/report with no software → GROW-only (intelli-agent), conductor not needed.

## Split (MIXED only)

Produce two briefs, preserving the user's wording:

- `build_brief` — only the software scope: the product, its features, stack, constraints. Drop the growth
  asks. This is what agentic-builder interviews/plans against.
- `grow_brief` — only the growth scope: the SEO/marketing/sales/research/content/strategy deliverables.
  Phrase each as a concrete output. The product context is NOT duplicated here — it arrives via
  `HANDOFF.json` (see `handoff-contract.md`), so GROW stays grounded in what was actually built.

Example — "Build a photo-manager web app, then write its SEO strategy, a content-marketing plan, and a
sales proposal":
```json
{
  "needs_build": true,
  "needs_grow": true,
  "build_brief": "Build a photo-manager web app (albums, photo upload + tagging, search, dashboard UI).",
  "grow_brief": "Produce: (1) an SEO strategy, (2) a content-marketing plan, (3) a sales proposal — for the photo-manager product described in HANDOFF.json."
}
```

Confirm the split with the user once (dashboard-first if a board is up, else AskUserQuestion), then
persist to `suite-state.json` and proceed.
