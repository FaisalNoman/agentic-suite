# AB — Domain-agent registry & router (P6)

Routes a task to the best-fit specialist persona from the repo's `agents/` library instead of always
spawning a generic `general-purpose` subagent. Shared core (registry + router); each skill applies it to
its own domains.

## Scope split (hybrid — do not cross it)

- **agentic-builder may route ONLY build domains:** `engineering`, `testing`, `design`, `product`.
  These upgrade build nodes (architect/impl/review/UI) from generic to specialist while staying inside
  the SDLC. **Hard scope guard:** agentic-builder must NEVER select a `marketing` / `sales` / `paid-media`
  / `finance` / `support` / `academic` / `strategy` / etc. persona — those are not software-build work.
- **intelli-agent** (separate skill) consumes the SAME `registry.json` for the business/research/content
  domains. Out of scope for this skill; noted so both stay consistent.

`BUILD_DOMAINS = {engineering, testing, design, product}`.

## Registry build

`agents/build-registry.mjs` (zero-dep Node) scans `agents/<domain>/*.md`, reads each file's YAML
frontmatter, and writes `agents/registry.json`. Rebuild after adding/removing agent files:

```
node agents/build-registry.mjs
```

**Registry location (resolution order).** Look for `registry.json`, first hit wins: `agents/registry.json`
(standalone / co-located) → `../agents/registry.json` (suite bundle: a single shared `agents/` folder
sibling to the skill dirs, used by both agentic-builder and intelli-agent). Persona `.md` bodies live
beside it (the index's `path` values are relative to the `agents/` parent). None found → skip routing,
use `general-purpose`.

`registry.json` schema:
```json
{
  "schema": 1,
  "generated": null,
  "count": 192,
  "domains": ["academic","design","engineering","finance","..."],
  "agents": [
    { "name": "Backend Architect", "domain": "engineering",
      "description": "…", "emoji": "🏗️", "color": "#…",
      "path": "agents/engineering/engineering-backend-architect.md" }
  ]
}
```
Only metadata + the file `path` are indexed — the markdown persona body stays in the file and is loaded
lazily at dispatch (keeps the registry small). Files without a `name:` frontmatter (playbooks, READMEs,
the builder, the registry itself) are skipped.

## Router

Given a task (its title, acceptance criteria, domain/module), pick the specialist — keyword overlap only,
no embeddings (same approach as `memory.md`):

```
route(task, allowedDomains):
  cands = registry.agents.filter(a => allowedDomains.has(a.domain))
  kw    = tokenize(task.title + task.acceptance + task.module)   # lowercase, de-stopword
  score(a) = overlap(kw, tokenize(a.name + " " + a.description))
  best = argmax score over cands
  if score(best) >= THRESHOLD (default 2 shared tokens): return best
  else: return null            # → fall back to general-purpose
```

- For **agentic-builder**, `allowedDomains = BUILD_DOMAINS` (the scope guard, enforced here).
- Ties → prefer the more specific description (longer overlap), else first by name.
- Pick ONE persona per node (not a panel) to keep cost flat.

## Persona dispatch

The Agent tool cannot load a repo `.md` as a `subagent_type`, so the mechanism is **persona injection**:

1. Read the chosen agent's file body (everything AFTER the frontmatter).
2. Spawn a `general-purpose` subagent whose prompt is:
   `<persona body>` + `\n\n---\n` + the normal task spec (read/produce/write-path) + `context_slice`
   output + the role's OUTPUT CONTRACT (from `agent-contracts.md`).
3. The persona changes HOW the agent works; it does **not** change the JSON output contract — the
   orchestrator still parses the same schema. Model tiering (`agent-contracts.md`) still applies.

## Integration in agentic-builder (build nodes only)

At dispatch (scheduler `DISPATCH`), for each WORK node, before building its prompt:
- Map node → candidate domain: `architect`/`impl` backend → `engineering`; UI `impl` → `design`;
  `tdd` → `testing`; planning/scoping flavored nodes → `product`. `review` nodes →
  `engineering-code-reviewer`-style personas in `engineering`.
- `route()` within `BUILD_DOMAINS`; on a hit, persona-inject; on a miss/low-confidence, dispatch plain
  `general-purpose` exactly as today (no regression).
- Record the chosen persona on the dashboard card via the `persona` field (see below).

Examples: a backend `impl` → `engineering-backend-architect`; a DB task → `engineering-database-architect`;
a UI page → `design-ui-designer`; a test-suite node → a `testing` specialist; a `review` →
`engineering-code-reviewer`.

## Dashboard

Add a `persona` field to the agent's `agents.json` card: `{ "persona": { "name": "Backend Architect",
"emoji": "🏗️", "domain": "engineering" } }`. The board shows the specialist name + emoji on the card;
absent → the card renders the plain role (today's look).

## Degradation / fallback

- `registry.json` missing → skip routing entirely, all nodes use `general-purpose`.
- No candidate ≥ THRESHOLD → `general-purpose`.
- A node outside `BUILD_DOMAINS` → never routed by agentic-builder (scope guard); plain dispatch.
- Persona file unreadable → drop persona, dispatch plain. Routing is best-effort and never blocks a build.

## Status

Shared core (`build-registry.mjs` + `registry.json`) and the agentic-builder build-domain router are the
P6 deliverable here. intelli-agent's business-domain consumption is tracked in that skill's repo.
