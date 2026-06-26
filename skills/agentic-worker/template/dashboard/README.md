# agentic-worker dashboard

The live dashboard is the same zero-dependency Node.js server used by agentic-app-builder.

**At install time, copy from the agentic-app-builder skill:**
```
cp -r <agentic-app-builder-install>/template/dashboard/ ./template/dashboard/
```

Or if both skills are in the same repo:
```
cp -r ../../agentic-app-builder/template/dashboard/ ./template/dashboard/
```

The dashboard polls `plan/state/agents.json` over SSE and renders:
- Live agent cards (role, status, detail, note)
- DAG flowchart in the Plan tab (written once at Stage 3, structure locked)
- Progress bar with phase-weighted pct
- Tokens KPI — **real whole-run spend**, auto-measured by the server from the Claude Code session transcript (`token-report.mjs` sums `message.usage` since the run's `startedAt`); falls back to state `tokens {in,out,total}` / per-agent `agents[].tokens` if no transcript is found
- Interactive approval modals (plan approval, domain confirmation)
- Milestone undo/redo controls (requires git)

Port: auto-selected starting at 4318 (one above agentic-app-builder's 4317 default,
so both skills can run simultaneously without port conflict).

Written to `plan/state/dashboard.json` on start: `{ "port": N, "url": "http://localhost:N" }`
