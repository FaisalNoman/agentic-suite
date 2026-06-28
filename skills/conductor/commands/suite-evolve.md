---
description: Review mature lessons from past runs and promote them into durable project rules
---

Promote what the suite has learned into durable, project-local rules — human-gated.

1. Run `node "<agentic-suite-base>/scripts/lessons-evolve.mjs" propose` — lists mature lessons
   (high confidence, seen repeatedly) as numbered promotion candidates and writes
   `.agentic-builder/evolve-proposals.json`.
2. Show the candidates **on the dashboard** (or CLI) and let the user **Approve / Skip each** — these become
   durable rules the planner follows by default, so confirm intent.
3. For approved ones run `node "…/scripts/lessons-evolve.mjs" apply <id>` (or `apply all`). It appends them to
   `.agentic-builder/learned-rules.md` (append-only, git-reversible) and flags the lessons `promoted` so they
   never re-propose.
4. Report what was promoted. `learned-rules.md` is loaded at the next run's planning warm-start.

Never promotes without per-candidate approval. Never edits the shipped skill files — promotions are
project-local.
