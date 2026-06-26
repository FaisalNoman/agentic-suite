# Changelog

All notable changes to **intelli-agent** are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0]

Parity with agentic-builder P0–P6, adapted to intelli-agent's multi-domain model.

### Added
- **Specialist registry consumer (P6)** — after the routing_table picks a generic agent, a specialist
  persona is selected from the shared 192-persona `agents/registry.json` and injected into the generic
  agent's prompt (persona-injection; output contract unchanged). Covers research/analysis/content/data +
  business domains (marketing/sales/finance/strategy/…); engineering/testing reserved for agentic-builder
  in suite context. Path resolves to a configured path, the sibling agentic-builder repo, or the bundled
  `references/specialist-registry.json` copy; no match/absent → plain generic agent. (`references/specialist-registry.md`)
- **Runtime file-ownership guard (P0)** — tasks declare `writes:[globs]`; FILL SLOTS defers any node whose
  writes overlap an in-flight node's; claims in `locks.json`, mirrored to a dashboard 🔒 strip. (`references/file-ownership.md`)
- **Cost control (P1)** — per-role model tiering in `agent-registry.json` (`model` field: haiku workers,
  sonnet research/analysis/code/review, opus coordinator) + optional token/USD soft budget caps (warn 80%,
  pause+approve 100%) off the real transcript via the shared `token-report.mjs`. (`references/budget.md`)
- **Cross-session memory (P2)** — a shared `.agentic-builder/memory.json` keyword layer warm-starts the
  coordinator + analysis agents, complementing the existing chromadb vector memory. (`references/cross-session-memory.md`)
- **Session replay / audit (P3)** — append-only `plan/state/events.jsonl` feeding the dashboard Replay tab
  (the dashboard is shared with agentic-builder). (`references/events-log.md`)
- **Unattended / CI mode (P4)** — run the in-session orchestrator with no human in the loop; gates
  auto-resolve, results land in `plan/state/RESULT.json`. (`references/unattended-mode.md`)
- **Multi-harness adapter contract (P4)** — isolates Claude-Code-specific primitives with explicit
  degradations for future Codex/Gemini/Cursor hosts. (`references/harness-adapters.md`)

### Changed
- Scheduler loop gains a budget check (loop top), the file-ownership dispatch gate + persona selection
  (FILL SLOTS), and event emission + lock release (PROCESS RETURNS).
- `framework-state.json` adds `budget`, `unattended`, `harness`, `specialist_registry_path`.
- `agents.json` cards add `persona`; top-level `locks` for the file-ownership strip.

## [1.0.0]

- Initial release: general-purpose multi-agent orchestrator — domain detection, registry-driven dispatch
  (research/analysis/content/data/code/coordinator/review), global dependency-graph scheduler with
  milestone gates, chromadb vector memory, task-level review, hierarchical sub-orchestration, and a live
  dashboard. Runs in-session under Claude Code with no API key.
