# Conductor — HANDOFF.json contract

The bridge between BUILD (agentic-app-builder) and GROW (agentic-worker). It gives agentic-worker a factual
product brief so its growth agents work against the REAL product and the docs gate skips re-interviewing.

## Schema (illustrative example)

The values below ("Photo Manager", etc.) are a **filled-in example** to show the shape — NOT a default or
hardcoded product. At runtime the conductor populates every field from the actual build (see the synthesis
table under "How the conductor synthesizes it").

```json
{
  "schema": 1,
  "product": "Photo Manager",
  "one_liner": "Web app to organize, tag, and search personal photos.",
  "what_built": "Auth, albums, photo upload + tagging, tag/album search, dashboard UI.",
  "stack": ["TypeScript", "Node/Express", "SQLite", "React + Vite", "Vitest"],
  "features": [
    { "id": "FEAT-001", "name": "Auth", "status": "done" },
    { "id": "FEAT-002", "name": "Albums", "status": "done" }
  ],
  "run_urls": ["http://localhost:5173"],
  "run_instructions": "npm install && npm run dev",
  "file_map": ["src/api/", "src/shared/types.ts", "src/ui/"],
  "decisions": ["Uint8Array chunk store for speed", "JWT sessions"],
  "memory_ref": ".agentic-builder/memory.json",
  "pending_business_tasks": ["SEO strategy", "content-marketing plan", "sales proposal"],
  "build_dashboard": "http://localhost:4317",
  "generated_from": "build/plan/state/framework-state.json + build/plan/docs/"
}
```

## How the conductor synthesizes it (today)

agentic-app-builder does not yet emit `HANDOFF.json` natively, so after BUILD completes, build it from the
run's artifacts:

| Field | Source |
|---|---|
| product, one_liner, what_built | `build/plan/docs/PRD.txt` |
| stack | `build/plan/docs/TECH-STACK.md` |
| features[] | `build/plan/docs/FEATURES.txt` + `framework-state.json` milestones (status) |
| run_urls, run_instructions | TECH-STACK.md commands / scaffold output |
| file_map | the files agentic-app-builder wrote (its impl outputs) |
| decisions | `.agentic-builder/memory.json` milestones[].decisions |
| memory_ref | `.agentic-builder/memory.json` (shared, always) |
| pending_business_tasks | the conductor's `grow_brief` |
| build_dashboard | `build/plan/state/dashboard.json` url |

Write it to the suite top level AND copy to `grow/plan/docs/HANDOFF.json`.

**Follow-up (cleaner):** add a Phase 9 step to agentic-app-builder that writes `HANDOFF.json` directly from
its own state. Then this stage just reads it instead of synthesizing — and the contract becomes native.

## How GROW consumes it

agentic-worker's Stage 2 bring-your-own-docs gate finds `grow/plan/docs/HANDOFF.json`, treats it as the
provided product brief, and SKIPS the interview. Its coordinator-agent decomposes the `grow_brief`
against the product facts; growth agents (content/analysis/research + business personas from the shared
`agents/registry.json`) cite real features, stack, and URLs. The shared `memory_ref` means decisions made
during BUILD are visible to GROW (one `.agentic-builder/memory.json`).

## Why this matters

Without the handoff, agentic-worker would re-interview from scratch and produce generic SEO/marketing/
sales work disconnected from the build. The brief makes BUILD → GROW feel like one continuous product
effort, not two separate tools.
