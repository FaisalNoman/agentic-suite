# Real stack + Deploy D2 — server/full-stack apps (spec, not built)

D1 ships **static** apps to a live URL. But a real launchable product often needs **accounts, payments, and
shared data** — a backend, a database, secrets, and a server host. That's D2: build on managed services, then
deploy to a server host. This is the "turn a toy into a product" gap from the value review.

> Large + decision-heavy + credential-bearing. Spec only. Pairs with Deploy D2 (server host) in
> `deploy-stage.md`. Default OFF / opt-in like the rest.

## 1. Detect the need (BUILD interview)
Add an explicit interview question set — the app's *backend shape*:
- **Accounts / auth?** (login, roles) → auth service
- **Payments?** (subscriptions, one-off) → payments service
- **Persistent / shared data?** (not just localStorage) → database
- **File storage?** (uploads) → object storage
- **Transactional email?** (verify, receipts) → email service
If all "no" → it's a static app → D1 path (today). Any "yes" → real-stack build (D2).

## 2. Managed-service routing (no hand-rolled infra)
Map each need to a **managed service** (least-effort, launchable), preferring one provider that covers several:
| Need | Default service | Alt |
|---|---|---|
| auth + db + storage | **Supabase** (Postgres + Auth + Storage in one) | Firebase |
| auth only | Clerk | Auth0 |
| payments | **Stripe** | Lemon Squeezy |
| email | Resend | Postmark |
- BUILD integrates the SDK + env vars + a minimal schema/migration, behind interfaces (so a service swap is local).
- A `STACK.md` records chosen services + the env vars they need.

## 3. Secrets handling (the hard, non-negotiable part)
- **Never** commit keys. Generate `.env.example` with the required vars + where to get each.
- The user supplies real keys at deploy time (prompted, or via the host's env UI / an MCP secrets tool).
- Ties into `scan-surface` (no keys land in the repo/registry) and the hooks (`protect-state` blocks `.env`
  edits leaking secrets into tracked files).

## 4. Deploy D2 — server host
- Static parts (landing, SPA) → D1 (GitHub Pages) as today.
- The server/app → a **server host**: Render / Fly.io / Railway (free tiers, git-deploy, env vars, managed DB).
- Flow extends `act-deploy.mjs`: detect `needsServer` (already done — D1 exits 3) → instead of stopping,
  resolve a server-host connector (CLI/MCP) → set env vars (from `.env.example` + user keys) → deploy →
  run DB migrations → verify health endpoint (200) → record URL. Idempotent on commit+env-hash.
- Degrade (no connector/keys) → write `act/deploy/server.deploy.md` with exact host steps + the env var list.

## 5. Guardrails
- Provisioning a DB / deploying a server = **billable + stateful**. Per-action approval + a clear cost/plan note.
- Migrations are **forward-only by default**; destructive migrations require explicit confirmation (never auto).
- Idempotent: don't re-provision or re-migrate the same state on resume.

## Files (when built)
```
agentic-app-builder: interview backend-shape questions + managed-service integration + STACK.md + .env.example
scripts/act-deploy.mjs : add server-host path (env + migrate + health-verify) behind the existing needsServer branch
references/act-executors.json : add server-host connectors (render/fly/railway) + a secrets/env capability
```

## Effort / value / risk
- **Effort:** High (2–4 days). Spans agentic-app-builder (interview + real integrations + schema) AND the
  server-deploy path AND secrets — the biggest single item on the roadmap.
- **Value:** Highest for *real* launches — it's the difference between a demo and a sellable product.
- **Risk:** Med-High — secrets, billing, stateful provisioning, migration safety. Must be heavily gated.

## Decisions to lock before building
1. **Default provider** — Supabase (auth+db+storage in one) as the default, Stripe for payments? (recommended)
2. **Server host default** — Render vs Fly vs Railway as the D2 default?
3. **Secrets channel** — `.env` + host UI (manual, safe) vs an MCP secrets connector (smoother, more surface)?
4. **Scope of v1** — auth + db only first (defer payments/storage/email), or the full set?
5. **Migrations** — own a tiny migration runner, or rely on the service's (e.g. Supabase migrations)?

**Recommendation:** build D2 in slices — **auth + db via Supabase + Render deploy** first (covers most
"need accounts + saved data" apps), payments/email/storage as follow-ups. Don't attempt the full matrix at once.
