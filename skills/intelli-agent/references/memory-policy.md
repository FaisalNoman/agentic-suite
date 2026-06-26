# Memory Policy

Vector memory uses chromadb in local mode (zero subscription cost).

> **Two memory layers.** This file covers the **chromadb vector** layer (rich semantic recall, per-project,
> per-agent token budgets). A second **cross-session keyword** layer — the shared `.agentic-builder/memory.json`,
> used for warm-starting planning and shared with agentic-builder — is described in
> `references/cross-session-memory.md`. Both can run; if chromadb is off (`caps.memory=false`) the keyword
> layer still works.
Embeddings generated via the Anthropic API at task completion.
Storage: `plan/state/memory/` — one collection per user session namespace.

---

## Token budget per agent type

These are the maximum tokens that vector store retrieval may inject into
each agent's context. They come out of the agent's `context_budget_tokens`
defined in `agent-registry.json`. The remaining budget goes to task spec
+ prompt template + agent reasoning.

| Agent | Memory budget | Reason |
|---|---|---|
| research-agent | 800 tok | Prior research directly informs current research |
| analysis-agent | 600 tok | Prior conclusions shape new analytical angles |
| content-agent | 400 tok | Style preferences, past report structure |
| coordinator-agent | 400 tok | Prior task decompositions inform new planning |
| code-agent | 200 tok | Architecture decisions and patterns only |
| data-agent | 200 tok | Schema patterns and field name conventions only |
| review-agent | **0 tok** | Must judge fresh — never biased by prior reviews |

---

## Retrieval query formula

```
query = task_description + " " + primary_domain
```

Run against the session namespace collection. Return top-k by cosine similarity
where k = ceil(memory_budget_tokens / 150) — approximate tokens per retrieved chunk.

Truncate retrieved content to exactly `memory_budget_tokens` before injecting.

---

## Storage trigger

After every agent returns a `status: "green"` done-signal:
1. Extract: task_id, agent_id, summary (from done-signal), output_type
2. Embed: summary text
3. Store with metadata: `{ task_id, agent_id, domain, output_type, run_at }`
4. Collection namespace: `ia_{project_slug}` where project_slug is the first
   8 chars of the project name, lowercased, alphanumeric only

Blocked agents (`status: "blocked"`) are NOT stored in memory.

---

## Eviction

LRU eviction. Max 500 entries per namespace collection.
When count > 500, delete the 50 least-recently-accessed entries.

---

## Fallback when chromadb is unavailable

If `import chromadb` fails at startup, set `caps.memory = false` in
`agents.json` and `framework-state.json`. Log one warning on the dashboard
strategy card: "Vector memory unavailable — chromadb not installed. Install
with: pip install chromadb". Continue without memory — all agents receive
`memory_budget_tokens: 0` silently. Do NOT abort the run.
