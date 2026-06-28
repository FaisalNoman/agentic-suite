---
name: agentic-suite
description: Conductor that chains BUILD → GROW for a SINGLE request needing BOTH software built AND business/growth work on top of it (SEO, marketing, sales, research, content, strategy). It runs agentic-app-builder to build and ship the software, synthesizes a product handoff brief, then runs agentic-worker to do the growth work grounded in what was actually built — sequentially, with a handoff in between. Trigger on prompts that mix an SDLC task with non-engineering deliverables, e.g. "build X then market it", "create the app and write the SEO/marketing/sales strategy", "ship it and grow it", "build a photo manager then produce a go-to-market plan", or any request combining build/fix/extend software with research/content/marketing/sales/strategy outputs. Runs in-session under Claude Code. No API key.
---

# agentic-suite — BUILD → GROW conductor

A THIN orchestrator. It owns no build or growth logic of its own — it splits a mixed request, runs
**agentic-app-builder** (BUILD), hands off a product brief, then runs **agentic-worker** (GROW). Both skills
do the real work unchanged; the conductor only classifies, sequences, and bridges.

Bundled: this suite ships all three skills (`conductor` + `agentic-app-builder` + `agentic-worker`) plus the
shared `agents/registry.json` under `skills/`, so a single install registers everything and the
conductor's Skill-tool invocations always resolve. (If a skill is somehow missing, say so and fall back
to running whichever is present.)

## Operating rules

1. **Mixed-intent only.** Use the conductor ONLY when a request needs BOTH software AND business/growth
   deliverables. Build-only → hand to `agentic-app-builder` and stop. Grow-only → hand to `agentic-worker`
   and stop. (Decision in `references/prompt-split.md`.)
2. **Sequence BUILD → GROW.** Growth work almost always depends on the product existing (SEO needs the
   site, a sales proposal needs features). Default order is strict: BUILD completes, THEN GROW.
3. **Bridge with a handoff brief.** After BUILD, synthesize `HANDOFF.json` (`references/handoff-contract.md`)
   and feed it to GROW so agentic-worker does NOT re-interview — it grows the REAL product.
4. **Namespace state.** BUILD runs in `build/` (its own `plan/state`, dashboard port 4317); GROW runs in
   `grow/` (its own `plan/state`, dashboard port 4318). The conductor keeps `suite-state.json` at the top.
5. **Thin.** No build/growth logic here. Delegate everything to the two skills. The conductor never
   spawns task subagents itself.
6. **Resume.** On re-run (including a deliberate fresh session after BUILD), read `suite-state.json`; skip
   a completed phase; resume the interrupted one. If `build_status.gate_script_passed === true` and `phase`
   is `build`/`handoff`, skip straight to handoff/GROW using the existing `HANDOFF.json` — do NOT rebuild.
   Otherwise re-run the Stage 2.5 gate (it is cheap + deterministic); on fail, resume BUILD
   (agentic-app-builder crash-resumes from its own state).

## STAGE 0 — Pre-flight + classify intent (read `references/prompt-split.md`)

**Step 0 — Pre-flight (AUTOMATIC, first run only — no `suite-state.json` yet). The conductor runs this
itself; the user does NOT need to know about it.** As your FIRST action, run the doctor as a Bash call
(resolve the path from THIS skill's base dir, the same way the dashboard template is resolved — nested-safe):
```
node "<agentic-suite-base>/scripts/suite-doctor.mjs"
```
Announce it: "Pre-flight check…". Then act on the exit code / table:
- **exit 2 (❌ FAIL)** → **STOP. Do not classify or build.** Report the failing checks + how to fix each
  (the doctor prints them), and wait for the user to fix + retry.
- **exit 1 (⚠️ WARN)** → note the warnings in one line, then continue.
- **exit 0 (✅)** → continue silently.
On a resume (`suite-state.json` exists) skip Step 0 — the environment already ran once. The user can also
run `/suite-doctor` manually anytime, but they never have to: this step makes it automatic.

**Step 1 — Classify** the request into `{ needs_build, needs_grow, needs_act, build_brief, grow_brief }`.
`needs_act` is true when the user asks to **implement / execute / ship / publish / make ship-ready** the
deliverables or findings (e.g. "…then implement it", "build the landing page from the spec", "make them
ship-ready").

- `needs_build && !needs_grow` → invoke the `agentic-app-builder` skill with the whole request. Stop.
- `needs_grow && !needs_build` → invoke the `agentic-worker` skill with the whole request. **Then, if
  `needs_act`, run STAGE 4.5 (ACT) over `grow/outputs/`** (fix #4 — research/docs → implement, no BUILD
  phase; ACT's Executor A is itself a build loop for software deliverables). Else stop.
- `needs_build && needs_grow` → this is a suite run. Continue to Stage 1 (ACT, if `needs_act`, runs at 4.5).
- Neither clearly → ask the user once which they want (dashboard-first if a board is up, else `AskUserQuestion`).

Write `suite-state.json`:
```json
{ "phase": "classify|build|handoff|grow|act|done", "needs_build": true, "needs_grow": true, "needs_act": false,
  "build_brief": "…", "grow_brief": "…", "build_status": null, "handoff": null, "updated_at": "<iso>" }
```

## STAGE 1 — Split

Produce two scoped briefs from the one request (`references/prompt-split.md`):
- `build_brief` — the SDLC portion (what software to build/fix/extend), verbatim where possible.
- `grow_brief` — the growth portion (SEO / marketing / sales / research / content / strategy tasks).

Confirm the split with the user once (dashboard-first), then persist both to `suite-state.json`.

## STAGE 2 — BUILD (invoke agentic-app-builder)

Set `suite-state.phase = "build"`. Tell the user: "Phase 1/2 — BUILD. Handing the software scope to
agentic-app-builder; its dashboard opens on :4317."

Invoke the **agentic-app-builder** skill (Skill tool) with `build_brief`. Let it run its full pipeline
(interview/plan/TDD/impl/review) to completion — the conductor does not interfere. Direct its work into
a `build/` working area so its `plan/` is isolated.

**Dashboard safety net.** agentic-app-builder must launch its board on :4317 by copying the template from
**its own skill base dir** (`<agentic-app-builder-base>/template/dashboard/`) → `build/plan/dashboard/`.
If `build/plan/state/dashboard.json` doesn't appear shortly after it starts (a nested-run path slip),
copy the template yourself from the agentic-app-builder skill base, run `node build/plan/dashboard/server.mjs --no-open`,
then open it with the helper (foreground): `node build/plan/dashboard/open-dashboard.mjs` — **never open
`index.html` as a file (`file://`)**; the file has no server, so the board is dead. Never let the BUILD
phase proceed with no live board.

When agentic-app-builder finishes (its Phase 9), capture where it wrote outputs and state.

## STAGE 2.5 — BUILD completion gate (BLOCKING — never skip)

GROW must NOT start on a failed or partial build. The gate is **script-enforced** — a deterministic
check, not prose you reason about — so a pass cannot be hallucinated. **This is a hard gate, never skip.**

1. **Run the gate script** (resolve from THIS skill's base dir, nested-safe like the dashboard):
   ```
   node <conductor-base>/scripts/check-build-gate.mjs build suite-state-gate.json
   ```
   It reads `build/plan/state/` (framework-state.json milestone map + scheduler, `BLOCKED.md`, and
   `RESULT.json` if present), writes `suite-state-gate.json`, and exits `0` (passed) or `1` (failed).
2. **Read both the exit code AND `suite-state-gate.json`.** Trust the script's verdict, not your own
   reading of the state files — that is the whole point of the gate.
3. **`passed === false` / non-zero exit** → **STOP. Do NOT proceed to handoff or GROW.** Leave
   `suite-state.phase` at `"build"`, copy the gate's `reason` + offending items into
   `suite-state.build_status`, set `build_status.gate_script_passed = false`, report to the user what
   failed and where (the gate `reason`/`not_done` + the build dashboard URL), and offer to **resume BUILD**
   (re-invoke agentic-app-builder — it crash-resumes from `framework-state.json`) or abort the suite.
   Never silently move on.
4. **`passed === true` / exit 0** → set `build_status.gate_script_passed = true`, record the rest of
   `build_status`, and continue.

```json
"build_status": {
  "completed": true,
  "gate_script_passed": true,  // ONLY true when check-build-gate.mjs exited 0 — the deterministic proof
  "last_successful_phase": "P9_finish",
  "milestones_done": 5, "milestones_total": 5,
  "result": "done",            // mirrors RESULT.json status when present, else "done"
  "error": null,
  "resumable": true,
  "checked_at": "<iso>"
}
```

### Session boundary (recommended for large builds)

A full BUILD + GROW in ONE session can crowd the context window on big projects. The handoff is already
a clean cold-start doc, so a fresh session for GROW is safe and often sharper. After the gate passes:

- **Default (small/medium builds):** continue to Stage 3 → 4 in the same session.
- **Recommend a split when the build was large** (heuristic: many milestones, a long run, or measured
  tokens already high on the dashboard): tell the user "BUILD complete + verified. `HANDOFF.json` is
  written. For best GROW quality you can **start a fresh session and re-run the suite** — it reads
  `suite-state.json` (phase `build` done) + `HANDOFF.json` and resumes straight into GROW — or continue
  here." Ask once (dashboard-first if a board is up, else `AskUserQuestion`). Either choice is valid;
  never force the split (it would break the one-flow promise). On "fresh session", persist state and stop
  cleanly; on "continue", proceed to Stage 3.

## STAGE 3 — Handoff (synthesize the product brief)

Set `phase = "handoff"`. Build `HANDOFF.json` per `references/handoff-contract.md`.

agentic-app-builder does not yet emit `HANDOFF.json` natively, so the conductor SYNTHESIZES it from the
build's artifacts: `build/plan/state/framework-state.json` (milestones, features), `build/plan/docs/`
(PRD/FEATURES/TECH-STACK), the run dashboard URL, the produced file map, and the shared
`.agentic-builder/memory.json` (decisions). (Follow-up: have agentic-app-builder write `HANDOFF.json` at
Phase 9 directly — then this stage just reads it.)

Include the `build_status` block (from Stage 2.5) as a top-level field in `HANDOFF.json` so GROW — and any
fresh session — can confirm the product is real and complete before working on it.

Write `HANDOFF.json` to the top level AND copy it into `grow/plan/docs/HANDOFF.json` so agentic-worker's
bring-your-own-docs gate picks it up as the product brief.

## STAGE 4 — GROW (invoke agentic-worker)

Set `phase = "grow"`. Tell the user: "Phase 2/2 — GROW. Handing the growth scope to agentic-worker with
the product brief; its dashboard opens on :4318."

Invoke the **agentic-worker** skill (Skill tool) with `grow_brief`, working in `grow/`. **Dashboard safety
net:** agentic-worker must launch its board on :4318 by copying the template from its own skill base dir
(`<agentic-worker-base>/template/dashboard/`) → `grow/plan/dashboard/`; if `grow/plan/state/dashboard.json`
doesn't appear, copy it yourself, run `node grow/plan/dashboard/server.mjs --no-open`, then open it with
`node grow/plan/dashboard/open-dashboard.mjs` (**never the `index.html` file**). Because
`grow/plan/docs/HANDOFF.json` is present, agentic-worker's docs gate uses it as the product context and
SKIPS re-interviewing — its SEO/marketing/sales/research agents work against the real product (features,
stack, URLs). Its specialist-registry router (P6) picks the business personas from the shared
`agents/registry.json`. Let it run to completion.

## STAGE 4.5 — ACT (optional, opt-in) — make GROW deliverables ship-ready

Phase 1 is **file-only** — it writes under `act/`, never posts/sends/deploys. Full schema in
`references/act-contract.md`.

1. **Gate (offer only when it applies).** Run `node <conductor-base>/scripts/act-scan.mjs grow/outputs`. If
   `offered` is false (no `software`/`publishable` deliverables) → skip ACT silently. Else **ask the user
   on the dashboard** ("GROW produced N deliverables — run ACT to make them ship-ready?"). Skip on No.
2. **Classify + extract.** For each deliverable, confirm its `class` (software | publishable | plan) and
   `channel`, and extract the structured content the writer needs — `tweets[]`, `emails[]`, `posts[]`,
   `gtm[]`, and a tagged `tasks[]` (`auto: automatable|human`). Build the spec JSON
   (`{outputsDir, actDir:"act", deliverables:[…]}`) per `references/act-contract.md`.
3. **Executor B — artifacts (safe, no approval).** Run
   `node <conductor-base>/scripts/act-build-artifacts.mjs <spec.json>`. It writes the confirmed formats
   (tweets.json/txt · .eml drafts · posts · gtm-tasks.json/csv · per-deliverable `.tasks.md`), validates
   (≤280, CSV/eml), and emits `act/ACT-PLAN.json`. Surface any `warnings`.
4. **Executor A — build (APPROVAL-GATED).** For each `executor:"build"` deliverable (status `pending` in
   ACT-PLAN), **ask on the dashboard before building** (it spawns a full build). On Approve: synthesize a
   `build_brief` from the deliverable `.md` + `HANDOFF.json`, invoke **agentic-app-builder** in the
   deliverable's `build_ref.dir` (FEATURE if a repo exists there, else GREENFIELD), then update its
   ACT-PLAN entry (`approval.status`, `status`, `build_ref.result`). Never auto-build.
5. **Phase 2 — outward execution (OPT-IN, off by default; see `references/act-phase2.md`).** Only if the user
   explicitly opts in. For each `automatable` task with a target `channel`: look up
   `references/act-executors.json[channel]` → discover a matching MCP tool via ToolSearch (`mcp_hint`); if
   none, or `mode:"manual"`, leave the Phase-1 artifact and mark the task `skipped`. Otherwise: compute the
   idempotency key (`act-ledger.mjs key …`), `act-ledger.mjs check` it (skip if already `executed`), show a
   **dry-run preview on the dashboard and get PER-ACTION approval**, then call the MCP tool and
   `act-ledger.mjs record` the result. **Five guardrails are mandatory:** per-action approval · dry-run first ·
   idempotent · draft/reversible-first (`mode:"draft"` channels only stage drafts — never auto-publish) ·
   never touch `policy.never_auto` (paid-ads/bulk-email/dm). Write each result into the task's `execution` block.
6. Set `suite-state.phase = "act"`; add an ACT section to the showcase linking every `outputs[].path`
   (and any Phase-2 `execution.result` links).

ACT is **off by default**; only run it when the user opts in at step 1. Phase 1 is file-only. Phase 2 outward
actions (deploy/draft/schedule/issues) run ONLY with the five guardrails above; posting/sending without
approval, and anything on `never_auto`, are forbidden.

## STAGE 5 — Wrap up

Set `phase = "done"`. Print a combined summary: what was BUILT (with run instructions) + what GROW
produced (the growth deliverables and where they live). Point the user at both dashboards' Replay tabs
for the full audit trail. agentic-worker also generates `grow/outputs/showcase.html` — an interactive page
of every GROW deliverable; surface that path prominently as the one-stop view of the growth work.

## Optional hardening (hooks) — opt-in, off by default

The suite runs hook-free by default (zero-config, in-session). For a long or unattended run, the user can
install an **opt-in enforcement pack** that turns prose rules into deterministic guards the swarm (incl.
subagents) cannot skip:

- **config-protection** (PreToolUse) — blocks edits to test/lint/format/tsconfig configs mid-run, so an
  agent fixes the code to go green instead of weakening the tooling.
- **protect-state** (PreToolUse) — blocks edits to `.git/`, `.claude/settings.json`, and the hook/dashboard
  infra so a subagent can't silence the guards or corrupt the repo (does NOT touch `plan/state/*.json`,
  which the orchestrator owns).
- **dangerous-bash** (PreToolUse) — blocks `rm -rf` on absolute/home paths, `git push --force`,
  `git reset --hard`, `curl|sh`, etc. during a run.
- **circuit-breaker** (PostToolUse) — trips after 5 consecutive tool failures, enforcing the "bounded
  loops" rule.
- **cost-persist** (PostToolUse) — appends real token spend to `plan/state/telemetry/session-costs.jsonl`
  (throttled) and hard-alerts when `framework-state.budget.max_tokens` is exceeded.
- **state-verify** (SessionStart) — if a run is mid-flight, injects a resume nudge into context.
- **precompact-snapshot** (PreCompact) — snapshots `framework-state.json` before compaction so resume
  survives a mid-write compaction.

Install (project-scoped, reversible): `node <conductor-base>/scripts/install-hooks.mjs` (add `--scope user`
for global). The hooks are **dormant unless a suite run is active** in the cwd, and escape hatches exist
(`plan/state/.allow-config-edit`, `plan/state/.allow-danger`). Remove with `scripts/uninstall-hooks.mjs`.
Only offer/run this when the user opts in — never auto-install.

**Security-surface scan (advisory).** The 192-persona registry + skill/settings/hook files are an injection
surface (each persona body is loaded into an agent prompt). `node <conductor-base>/scripts/scan-surface.mjs`
scans them for prompt-injection patterns (ignore-instructions, exfil URLs, secret-harvest, hidden
directives, hardcoded secrets, zero-width unicode), writes `scan-report.json`, and exits 1 on a high finding.
It NEVER blocks a run — it's a heads-up, useful after adding your own personas or third-party skills. Offer
it at setup or when the user adds to the registry.

## Resume an interrupted run

On a crash or a fresh session, run `node <conductor-base>/scripts/suite-resume.mjs` (or the `/suite-resume`
command) for a deterministic briefing — current phase, outstanding milestones, dashboards, next action —
then continue per Operating Rule 6. Resume; do not rebuild a completed phase.

## Dashboards

Per-phase boards (deep view): BUILD = agentic-app-builder's (:4317), GROW = agentic-worker's (:4318);
the conductor announces the transition at Stage 4.

**Unified suite board (U1, recommended for multi-phase runs):** at Stage 0, copy
`<conductor-base>/template/suite-dashboard/` → `./suite-dashboard/` and start it:
`node suite-dashboard/server.mjs --no-open` then open it with the same foreground helper pattern (read
`suite-dashboard.json` → open the `url`, base port 4316). It aggregates BUILD + GROW + ACT into one page —
a phase rail (status + task counts + a link to each per-phase board), a combined token KPI, and a merged
phase-tagged Replay timeline — reading the sibling `build/` · `grow/` · `act/` state read-only. The per-phase
boards keep running for detail; the unified board is the single-pane overview. (Roadmap U2: one fully merged
board once both engines share a core.)

## Reference files

- `references/prompt-split.md` — intent classifier + how to split one request into build_brief + grow_brief.
- `references/handoff-contract.md` — `HANDOFF.json` schema, how to synthesize it from the build, how GROW consumes it.
- `scripts/check-build-gate.mjs` — deterministic Stage 2.5 BUILD-completion gate (zero-dep node); writes `suite-state-gate.json`, exits 0/1.
- `hooks/suite-hook.mjs` + `scripts/install-hooks.mjs` / `uninstall-hooks.mjs` — opt-in Core-3 enforcement pack (config-protection, dangerous-bash, circuit-breaker); dormant unless a run is active.
- `scripts/suite-resume.mjs` + `commands/suite-resume.md` — deterministic resume briefing for an interrupted run.
- `scripts/scan-surface.mjs` — advisory security scan of the persona registry + skill/settings/hook files for injection patterns; writes `scan-report.json`.
- `scripts/route-preview.mjs` — preview which specialist persona the router would pick for a requirement (mirrors the live specialist-router scoring); read-only demonstrator.
- `references/act-contract.md` + `scripts/act-scan.mjs` + `scripts/act-build-artifacts.mjs` — optional **ACT** stage (Stage 4.5, Phase 1): scan/gate GROW outputs, write ship-ready artifacts (file-only), build-deliverables approval-gated. Schema = `ACT-PLAN.json`.
- `references/act-phase2.md` + `references/act-executors.json` + `scripts/act-ledger.mjs` — **ACT Phase 2** (opt-in, off by default): outward execution via the user's MCP connectors behind 5 guardrails (per-action approval · dry-run · idempotency ledger · draft/reversible-first · never-auto list).
- `scripts/lessons-evolve.mjs` + `commands/suite-evolve.md` — **`/suite-evolve`**: promote mature lessons → durable project-local `.agentic-builder/learned-rules.md` (human-gated, append-only). Loaded at planning warm-start.
- `references/research-first.md` — spec for fix #5 (optional RESEARCH-first pre-stage: research → BUILD → GROW → ACT). Not built.
- `template/suite-dashboard/` — unified suite board (U1): aggregates BUILD+GROW+ACT into one page (phase rail · combined tokens · merged Replay), read-only over the sibling phase state.
- `scripts/suite-doctor.mjs` + `commands/suite-doctor.md` — pre-flight environment check (node, skills, registry, ports, state, write access); PASS/WARN/FAIL, exit 0/1/2. Advisory.
