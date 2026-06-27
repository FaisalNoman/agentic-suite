// agentic-suite pre-flight doctor — zero dependency, cross-platform (node).
//
// Catches predictable failures BEFORE a BUILD→GROW run: missing node, corrupt
// state, missing skills/registry, no write access. Advisory — it informs, it
// does not gate the suite.
//
// Usage:  node suite-doctor.mjs [--json]
// Exit:   0 = all clear (or warnings only is still 0-safe? no) →
//         0 = no FAIL · 1 = warnings only · 2 = at least one FAIL
//
// Paths resolve relative to THIS script's install dir (not the user's cwd),
// with the same multi-location fallback the other helpers use, because the
// doctor runs in the user's project while the skills live in the install dir.

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));     // .../conductor/scripts (or installed agentic-suite/scripts)
const base = path.resolve(here, "..");                          // conductor / agentic-suite base
const asJson = process.argv.includes("--json");
const results = [];
const add = (status, name, msg) => results.push({ status, name, msg });

const firstExisting = (cands) => cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
function tryExec(cmd) { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } }
function portFree(port) {
  return new Promise((res) => {
    const t = net.createServer();
    t.once("error", () => res(false));
    t.once("listening", () => t.close(() => res(true)));
    t.listen(port, "127.0.0.1");
  });
}

// resolve a skill SKILL.md across repo + installed layouts
function findSkill(name) {
  return firstExisting([
    path.join(base, "..", name, "SKILL.md"),          // repo: skills/<name>/SKILL.md (base=skills/conductor)
    path.join(base, "..", "skills", name, "SKILL.md"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "skills", name, "SKILL.md"),
  ]);
}
function findRegistry() {
  return firstExisting([
    path.join(base, "..", "agents", "registry.json"),
    path.join(base, "agents", "registry.json"),
    path.join(base, "..", "agentic-app-builder", "agents", "registry.json"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "skills", "agents", "registry.json"),
  ]);
}

async function run() {
  // 1 — node (essential)
  const nodeV = (process.versions && process.versions.node) || (tryExec("node --version") || "").replace(/^v/, "");
  const major = Number(String(nodeV).split(".")[0]) || 0;
  if (!nodeV) add("FAIL", "Node.js", "node not found — dashboards, gate, hooks all need it");
  else if (major < 18) add("WARN", "Node.js", `v${nodeV} — v18+ recommended`);
  else add("PASS", "Node.js", `v${nodeV}`);

  // 2 — Claude Code version (advisory only — suite runs as in-session skills, no hard min)
  const ccv = tryExec("claude --version");
  if (!ccv) add("WARN", "Claude Code", "`claude --version` not on PATH (fine if running inside Claude Code)");
  else add("PASS", "Claude Code", ccv.replace(/\s+/g, " ").slice(0, 60));

  // 3,4 — skills present
  for (const sk of ["agentic-app-builder", "agentic-worker"]) {
    const p = findSkill(sk);
    if (p) add("PASS", `skill: ${sk}`, "found");
    else add("FAIL", `skill: ${sk}`, "SKILL.md not found in repo or ~/.claude/skills — reinstall the suite");
  }

  // 5 — registry
  const reg = findRegistry();
  if (!reg) add("FAIL", "persona registry", "agents/registry.json not found — GROW routing needs it");
  else {
    try {
      const j = JSON.parse(fs.readFileSync(reg, "utf8"));
      const n = (j.agents || []).length;
      const mb = fs.statSync(reg).size / 1e6;
      if (mb > 5) add("WARN", "persona registry", `${n} personas, ${mb.toFixed(1)}MB (large)`);
      else add("PASS", "persona registry", `${n} personas`);
    } catch { add("FAIL", "persona registry", "registry.json is not valid JSON"); }
  }

  // 6 — gate script present (it's .mjs, not .sh)
  const gate = firstExisting([path.join(base, "scripts", "check-build-gate.mjs"), path.join(here, "check-build-gate.mjs")]);
  if (gate) add("PASS", "build gate", "check-build-gate.mjs present");
  else add("FAIL", "build gate", "check-build-gate.mjs missing — Stage 2.5 gate unavailable");

  // 7 — dashboard ports (auto-increment, so busy = info not failure)
  for (const port of [4317, 4318]) {
    const free = await portFree(port);
    if (free) add("PASS", `port :${port}`, "free");
    else add("WARN", `port :${port}`, "in use — dashboard auto-steps to the next free port (not fatal)");
  }

  // 8 — suite-state.json integrity (in cwd)
  const ssp = path.join(process.cwd(), "suite-state.json");
  if (fs.existsSync(ssp)) {
    try {
      const s = JSON.parse(fs.readFileSync(ssp, "utf8"));
      if (s.phase === "build" && !(s.build_status && s.build_status.completed))
        add("WARN", "suite-state", "interrupted BUILD — next run resumes BUILD (see /suite-resume)");
      else if (s.phase === "done") add("WARN", "suite-state", "previous run completed — a new run starts fresh");
      else add("PASS", "suite-state", `valid (phase=${s.phase || "?"})`);
    } catch { add("FAIL", "suite-state", "suite-state.json is corrupt (invalid JSON) — fix or delete it"); }
  } else add("PASS", "suite-state", "none (fresh run)");

  // 9 — write access in cwd
  try {
    const t = path.join(process.cwd(), `.suite-doctor-${process.pid}.tmp`);
    fs.writeFileSync(t, "ok"); fs.unlinkSync(t);
    add("PASS", "write access", "cwd is writable");
  } catch { add("FAIL", "write access", "cannot write to the current directory — fix permissions"); }

  // 10 — git (optional)
  const gitv = tryExec("git --version");
  if (gitv) add("PASS", "git", gitv.replace("git version ", "v"));
  else add("WARN", "git", "not found — suite works, but per-milestone commits/undo are disabled");

  // ── report ──
  const fails = results.filter((r) => r.status === "FAIL");
  const warns = results.filter((r) => r.status === "WARN");
  const pass = results.filter((r) => r.status === "PASS");
  if (asJson) { console.log(JSON.stringify({ pass: pass.length, warn: warns.length, fail: fails.length, results }, null, 2)); }
  else {
    const ic = { PASS: "✅", WARN: "⚠️ ", FAIL: "❌" };
    console.log("agentic-suite pre-flight doctor\n");
    for (const r of results) console.log(`  ${ic[r.status]} ${r.name} — ${r.msg}`);
    console.log(`\n  ✅ ${pass.length} pass   ⚠️  ${warns.length} warn   ❌ ${fails.length} fail`);
    if (fails.length) console.log("  Fix the ❌ items before running the suite.");
    else if (warns.length) console.log("  Runnable — review the ⚠️  items.");
    else console.log("  Environment ready. You can run agentic-suite.");
  }
  process.exit(fails.length ? 2 : warns.length ? 1 : 0);
}
run();
