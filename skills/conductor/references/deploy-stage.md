# Deploy stage — go-live

> **D1 BUILT.** `scripts/act-deploy.mjs` (`plan | verify | manual | launch`) + the `web` connector in
> `act-executors.json` + the ACT deploy sub-flow in SKILL Stage 4.5 are implemented. Defaults: GitHub Pages
> (zero extra auth), per-action approval, custom domain out of scope, server apps → D2 stop. D2 (server/
> full-stack hosting) remains spec-only below.

The single feature that turns "files on disk" into **a live URL**. Takes what BUILD + ACT produced
(the app, the landing page) and **deploys it**, gated + reversible + idempotent, then verifies it's up and
records the live URL. It is the highest launch-impact step — without it the founder still does the whole
last mile by hand.

Deploy is an **ACT outward action** (Phase 2): it lives under the same 5 guardrails (per-action approval ·
dry-run first · idempotent · reversible-first · never-auto) and reuses `act-ledger.mjs`. This doc fleshes out
the `web · deploy-static` connector from `act-executors.json` into a real stage.

> Default OFF; opt-in like the rest of ACT. Static-first (Phase D1); server/full-stack hosting is Phase D2.

## What gets deployed (deploy targets)
The conductor enumerates deployable targets from the run:
- **Built app** — BUILD's production bundle (e.g. a Vite `dist/`), if the app is static/SPA.
- **Landing page** — ACT Executor-A's `act/<id>-landing/` (or its built `dist/`).
- Each target → one deploy action with its own approval + ledger key.

## Connector resolution (order — first available wins)
No vendor lock; discover at runtime via ToolSearch using `act-executors.json[web].mcp_hint`, then CLI, then degrade:
1. **MCP** deploy tool (Netlify/Vercel) if connected.
2. **CLI** if installed + authed: `npx netlify deploy --prod --dir <dist>` · `vercel --prod` · GitHub Pages via `git`+`gh`.
3. **GitHub Pages (default, lowest-friction)** — needs only existing git/`gh` auth: push the built `dist/` to a `gh-pages` branch / `docs/`, enable Pages. No extra token.
4. **None / no auth** → degrade: write `act/deploy/<target>.deploy.md` with exact manual deploy steps + the built bundle path. Never fail the run.

## Flow (per target)
```
1. PRODUCE the bundle   — run the target's build (npm ci && npm run build) → <dist>; static check
                          (no server entrypoint). If it needs a server → Phase D2 (flag, skip in D1).
2. RESOLVE connector    — ToolSearch(mcp_hint) → CLI → GH Pages → manual (above)
3. IDEMPOTENCY          — key = act-ledger key {channel:"web", action:"deploy", payload:"<target>@<git-sha|dist-hash>"}
                          ; act-ledger check → skip if this exact build already deployed
4. DRY-RUN preview      — show {target, connector, command, est. URL} on the dashboard
5. PER-ACTION APPROVAL  — wait (ask-dashboard); Skip leaves the manual artifact
6. DEPLOY               — run the connector; capture the returned live URL
7. VERIFY               — HTTP GET the URL → expect 200 (+ basic content check); retry briefly
8. RECORD               — act-ledger record {status:"executed", result:"<url>"} ; write URL into
                          ACT-PLAN deliverable.execution.result ; append to LAUNCH.md
```

## Contract — ACT-PLAN execution (deploy)
```json
{
  "id": "act-001", "class": "software", "channel": "web",
  "execution": {
    "connector": "deploy-static", "mode": "auto",
    "status": "planned|previewed|approved|executed|verified|skipped|failed",
    "dry_run": { "action": "deploy", "target": "act/act-001-landing/dist", "command": "netlify deploy --prod --dir …", "connector": "netlify-cli" },
    "idempotency_key": "x…", "url": null, "verified": false,
    "approved_at": null, "executed_at": null, "result": null, "error": null
  }
}
```
New top-level `ACT-PLAN.deploys = [{ target, url, verified, connector }]`, and a `LAUNCH.md` cockpit
(see below).

## LAUNCH.md (the go-live record)
A human-facing summary written after deploy — the "is it live?" answer:
```
# Launch — <product>
- App:     ✅ https://focus-app.netlify.app   (verified 200)
- Landing: ✅ https://focus.example.com        (verified 200)
- Tweets:  ☐ scheduled (act/tweets.json) — approve to post
- Emails:  ☐ drafts (act/emails/) — review + send
- Analytics: ☐ not added
```
(Forms the basis of the future "launch cockpit" — #5 in the value review.)

## Safety
- **Reversible-first** — static deploys are redeployable/rollbackable; that's why `web` is `mode:"auto"` (still
  per-action approved). A custom domain / DNS change is NOT auto (treat as manual/never-auto).
- **Idempotent** — keyed on `target@build-hash`; re-runs/resume never double-deploy the same build.
- **Credentials** — host tokens are the user's (Netlify/Vercel); GH Pages uses existing git auth. Never stored
  in the repo/registry; surface via the user's MCP/CLI. Tie into `scan-surface` for safety.
- **Verify gate** — a deploy isn't "done" until the URL returns 200; else `status:"failed"` + the manual artifact.

## Static vs server (scope)
- **D1 (this spec):** static / SPA / pre-rendered sites (Vite/Next-export, the landing page, localStorage apps).
  Covers the common "launch a marketing site + frontend" case.
- **D2 (later):** apps needing a running server / DB (Render/Fly/Railway, env vars, managed DB). Bigger — needs
  secret handling + a server host connector. Pairs with the "real-stack option" (Supabase/Clerk/Stripe).

## Files (when built)
```
scripts/act-deploy.mjs        produce-bundle + connector-dispatch + verify + ledger/LAUNCH writer
                              (MCP/CLI call itself is orchestrator-driven; script handles build/verify/record)
references/act-executors.json  web connector already present; add vercel/gh-pages rows + per-host commands
LAUNCH.md                      generated at the suite root
```

## Effort / value
- **Effort:** Med (~1–1.5 days for D1: bundle build + GH-Pages default + Netlify/Vercel CLI path + verify + ledger
  + LAUNCH.md). D2 is a separate, larger effort.
- **Value:** **Highest** of the remaining roadmap — it's the file→live jump. Moves the suite from "produces what
  you need to launch" to "launches it."
- **Risk:** Low-Med — gated + reversible + verify; main risk is host auth variance (mitigated by GH-Pages default
  + manual degrade).

## Open decisions (lock before building)
1. **Default host** — GitHub Pages (zero extra auth) as the default, with Netlify/Vercel when their MCP/CLI is present? (recommended)
2. **Auto-deploy vs always-ask** — per-action approval always (recommended), or a one-time "deploy everything" approval per run?
3. **Custom domain** — out of D1 (manual), or attempt DNS via a connector? (recommend out of D1.)
4. **D2 trigger** — when the built app needs a server, stop with a clear "needs D2 / a server host" message vs attempt a server deploy.
