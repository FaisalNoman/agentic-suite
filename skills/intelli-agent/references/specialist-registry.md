# IA — Specialist-registry consumer (P6)

Routes intelli-agent domain tasks through the shared `agents/registry.json` persona library
(192 specialist personas built by agentic-builder). Extends the existing dispatch model:
domain-detector → routing_table → **specialist router** → persona-injected generic agent.
Nothing in the existing flow is removed; this layer adds a persona prepend only.

---

## Scope

**intelli-agent owns:** `research`, `analysis`, `content`, `data_processing`, and the business
domains: `marketing`, `sales`, `paid-media`, `finance`, `strategy`, `support`, `academic`,
`product`, `project-management`.

**agentic-builder owns (build domains):** `engineering`, `testing`, `design`, `product` (SDLC
context). In **suite** context intelli must never select a build-domain persona — the routing
guard filters them from candidates. In **standalone** context (no agentic-builder sibling) intelli
MAY still use `code-agent` for code tasks; the specialist router will skip build-domain personas
unless `ALLOW_BUILD_PERSONAS=true` is set in `framework-state.json`.

`INTELLI_DOMAINS = {research, analysis, content, data_processing, marketing, sales,
paid-media, finance, strategy, support, academic, product, project-management}`.

---

## Registry path resolution

Look for the shared registry in this order; stop at the first hit:

1. `framework-state.json` → `specialist_registry_path` (absolute or relative to skill root).
2. **Shared-sibling layout (suite bundle):** `../agents/registry.json` — ONE `agents/` folder sibling to
   the skill dirs, shared by agentic-builder and intelli-agent (no duplication). Preferred.
3. Cross-skill layout: `../agentic-builder/agents/registry.json`.
4. Co-located / standalone: `agents/registry.json`.
5. Local index copy: `references/specialist-registry.json` (index only — names personas but cannot
   inject bodies; last resort).
6. **None found** → skip persona injection entirely; dispatch plain generic agent. No crash.

Persona `.md` bodies live beside the resolved `registry.json` (its `path` values are relative to the
`agents/` parent). Whichever location wins, the bodies must sit next to it.

Registry schema (from agentic-builder):
```json
{ "schema": 1, "agents": [
  { "name": "SEO Specialist", "domain": "marketing",
    "description": "...", "emoji": "🔍", "color": "#...",
    "path": "agents/marketing/marketing-seo-specialist.md" }
]}
```
Only metadata + `path` are indexed. Persona body is loaded lazily on a hit.

---

## Specialist router

Called after `routing_table` returns a generic agent key. Receives the task and the resolved
registry. Returns one specialist entry or null.

```
route(task, registry, allowedDomains):
  cands = registry.agents.filter(a => allowedDomains.has(a.domain))
  kw    = tokenize(task.title + " " + task.description)  # lowercase, de-stopword
  score(a) = overlap(kw, tokenize(a.name + " " + a.description))
  best  = argmax score over cands
  if score(best) >= THRESHOLD (default 2 shared tokens): return best
  else: return null   # → plain generic agent, no persona
```

- `allowedDomains` enforces the scope guard (INTELLI_DOMAINS; excludes build domains in suite).
- Ties: prefer longer description overlap, then alphabetical by name.
- One persona per task node — never a panel.

**Example mappings:**

| Task signal | Generic agent | Specialist persona |
|---|---|---|
| SEO audit, keyword ranking | content-agent | `marketing-seo-specialist` |
| Sales proposal, pitch deck | content-agent | sales persona |
| Competitor analysis, SWOT | analysis-agent | strategy/research persona |
| Financial model, budget | analysis-agent | finance persona |
| Academic literature review | research-agent | academic persona |
| Customer churn analysis | analysis-agent | support/strategy persona |

---

## Persona injection

On a specialist hit:

1. Read the file at `entry.path` (relative to the registry's sibling directory).
   Body = everything after the YAML frontmatter (`---` block).
2. Build the agent prompt:
   ```
   <persona body>

   ---

   <task spec>
   <context_slice from framework-state.json>
   <OUTPUT CONTRACT from agent-contracts.md for this agent's output_type>
   ```
3. Dispatch a `general-purpose` subagent with the assembled prompt.
4. The persona changes HOW the agent reasons; it does **not** alter `output_type`,
   `done_signal`, `context_budget_tokens`, or any contract field from `agent-registry.json`.
   Model tiering (`agent-contracts.md`) still applies without modification.

---

## Integration with the routing_table

The existing flow is preserved; the specialist layer slots in after generic-agent selection:

```
Stage 0 → domain-detector → primary_domain
         → routing_table[primary_domain].default  →  generic_agent_key
         → specialist_router(task, registry)       →  persona (or null)
         → build prompt (persona-injected or plain)
         → dispatch
```

`routing_table` fallback logic is unchanged: if `default` agent errors, `fallback` takes over
before the specialist layer runs again on the retry.

`agent_roster` in `framework-state.json` continues to list generic agent keys (no change to
planner contract). Specialist persona metadata is written separately (see Dashboard).

---

## Dashboard

Add a `persona` field to the relevant card in `agents.json`:

```json
{
  "persona": {
    "name": "SEO Specialist",
    "emoji": "🔍",
    "domain": "marketing"
  }
}
```

Board renders `<emoji> <name>` on the card when present; absent → renders plain generic role
(today's look, no regression). Field is optional; the dashboard must tolerate it missing.

---

## Degradation / fallback

| Condition | Behavior |
|---|---|
| Registry file not found (all 3 paths) | Skip persona layer; dispatch plain generic agent |
| No candidate meets THRESHOLD | Dispatch plain generic agent |
| Task domain outside INTELLI_DOMAINS (suite) | Skip routing; plain dispatch |
| Persona `.md` file unreadable | Drop persona; dispatch plain generic agent |
| Registry malformed JSON | Log warning; skip persona layer |

Specialist routing is best-effort and never blocks a task. No regression on any failure path.

---

## Status

P6 deliverable for intelli-agent: specialist-router logic, registry path resolution, and
persona injection. The shared registry (`agents/registry.json`) and its builder
(`agents/build-registry.mjs`) are owned by agentic-builder and consumed read-only here.
Local copy at `references/specialist-registry.json` is the offline fallback; keep it synced
when adding new intelli-relevant personas.
