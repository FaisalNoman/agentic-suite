// /suite-resume helper — deterministic resume briefing for the conductor.
//
// Reads suite-state.json + the BUILD/GROW framework-state + dashboards and
// prints exactly where the run stands and what the next action is, so resuming
// after a crash or a fresh session is one command instead of re-explaining.
// Read-only. Zero dependency.
//
// Usage:  node suite-resume.mjs   (run from the suite working dir)

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const suite = readJson(path.join(cwd, "suite-state.json"));
if (!suite) {
  console.log("No suite-state.json here. Not inside an agentic-suite run — start the suite fresh with your request.");
  process.exit(0);
}

const L = [];
L.push("=== agentic-suite — resume briefing ===");
L.push(`phase: ${suite.phase || "?"}   (classify → build → handoff → grow → done)`);
if (suite.needs_build != null) L.push(`needs_build: ${suite.needs_build}   needs_grow: ${suite.needs_grow}`);
if (suite.build_brief) L.push(`build_brief: ${String(suite.build_brief).slice(0, 160)}`);
if (suite.grow_brief)  L.push(`grow_brief:  ${String(suite.grow_brief).slice(0, 160)}`);

function phaseSummary(label, dir) {
  const fw = readJson(path.join(cwd, dir, "plan", "state", "framework-state.json"));
  if (!fw) return;
  const ms = fw.milestones && typeof fw.milestones === "object" ? fw.milestones : {};
  const ids = Object.keys(ms);
  const done = ids.filter((k) => ms[k] && ms[k].status === "done").length;
  L.push(`\n[${label}] stage=${fw.stage || "?"}  milestones ${done}/${ids.length} done`);
  const pending = ids.filter((k) => ms[k] && ms[k].status !== "done").map((k) => `${k}(${ms[k].status})`);
  if (pending.length) L.push(`  outstanding: ${pending.join(", ")}`);
  const dash = readJson(path.join(cwd, dir, "plan", "state", "dashboard.json"));
  if (dash && dash.url) L.push(`  dashboard: ${dash.url}`);
  if (fs.existsSync(path.join(cwd, dir, "plan", "state", "BLOCKED.md"))) L.push(`  ⚠ BLOCKED.md present`);
}
phaseSummary("BUILD", "build");
phaseSummary("GROW", "grow");

if (suite.build_status) {
  const b = suite.build_status;
  L.push(`\nbuild_status: completed=${b.completed} gate_script_passed=${b.gate_script_passed}` +
    (b.error ? ` error=${b.error}` : ""));
}

// Next action
let next;
switch (suite.phase) {
  case "classify": case undefined: next = "Re-run classification / split, then continue."; break;
  case "build": next = "Resume BUILD (agentic-app-builder crash-resumes from framework-state.json). When it finishes, run the Stage 2.5 gate: node scripts/check-build-gate.mjs build"; break;
  case "handoff": next = "BUILD done. Synthesize/confirm HANDOFF.json, then start GROW."; break;
  case "grow": next = "Resume GROW (agentic-worker crash-resumes from its framework-state.json). Outputs land in grow/outputs/ + showcase.html."; break;
  case "done": next = "Run complete. See grow/outputs/showcase.html and both dashboards' Replay tabs."; break;
  default: next = "Read suite-state.json and continue from the reported phase.";
}
L.push(`\n▶ NEXT: ${next}`);
L.push("\nThen invoke the agentic-suite skill to continue the conductor from this phase.");
console.log(L.join("\n"));
