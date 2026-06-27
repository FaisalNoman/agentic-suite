// Deterministic BUILD-completion gate for the agentic-suite conductor.
//
// Zero dependencies, cross-platform (Node — guaranteed present; every dashboard
// helper is .mjs). Run by the conductor at Stage 2.5 BEFORE any handoff to GROW.
// It reads the build's own state and proves completion, so a pass cannot be
// hallucinated from prose reasoning — it is a file artifact + exit code.
//
// Usage:  node check-build-gate.mjs [buildDir=build] [outFile=suite-state-gate.json]
//   buildDir = the build working area that contains plan/state/  (under the
//              conductor this is "build"; for a standalone app-builder run, ".")
// Writes:  <outFile> = { passed, reason?, ... }  (always written)
// Exit:    0 = passed · 1 = failed/incomplete · 2 = bad args
//
// Schema it checks (agentic-app-builder/references/state-schema.md):
//   framework-state.json:
//     stage ∈ scaffold|interview|docs|build|done|blocked
//     milestones = MAP { "<id>": { status: done|in_progress|pending, ... } }  (NOT an array)
//     blocked = [], scheduler.blocked_set = []
//   plan/state/RESULT.json (unattended only): status ∈ done|blocked|aborted
//   plan/state/BLOCKED.md  (fix-loop exhausted) → present means a hard block

import fs from "node:fs";
import path from "node:path";

const buildDir = process.argv[2] || "build";
const outFile = process.argv[3] || "suite-state-gate.json";
const stateDir = path.resolve(process.cwd(), buildDir, "plan", "state");
const FW = path.join(stateDir, "framework-state.json");
const RESULT = path.join(stateDir, "RESULT.json");
const BLOCKED = path.join(stateDir, "BLOCKED.md");

function fail(reason, extra = {}) {
  const out = { passed: false, reason, ...extra, checked_at: new Date().toISOString() };
  write(out);
  console.error(`build-gate: FAIL — ${reason}`);
  process.exit(1);
}
function write(obj) {
  try { fs.writeFileSync(outFile, JSON.stringify(obj, null, 2)); }
  catch (e) { console.error(`build-gate: could not write ${outFile}: ${e?.message}`); }
}

// 1. State file must exist.
let fw;
try { fw = JSON.parse(fs.readFileSync(FW, "utf8")); }
catch { fail("framework-state.json missing or unreadable", { path: FW }); }

// 2. Hard-block artifact.
if (fs.existsSync(BLOCKED)) fail("BLOCKED.md present — build hit a hard block", { path: BLOCKED });

// 3. Explicit blocked stage / blocked sets.
if (fw.stage === "blocked") fail("framework-state.stage === 'blocked'");
const blockedList = Array.isArray(fw.blocked) ? fw.blocked : [];
const blockedSet = (fw.scheduler && Array.isArray(fw.scheduler.blocked_set)) ? fw.scheduler.blocked_set : [];
if (blockedList.length || blockedSet.length) {
  fail("build has blocked items", { blocked: blockedList, blocked_set: blockedSet });
}

// 4. Milestone completeness. `milestones` is a MAP keyed by milestone id.
const ms = fw.milestones && typeof fw.milestones === "object" && !Array.isArray(fw.milestones)
  ? fw.milestones : {};
const ids = Object.keys(ms);
const notDone = ids.filter((id) => (ms[id] && ms[id].status) !== "done");

// Completion = either the top-level stage says done, or every milestone is done.
// Require milestones to exist OR stage==="done" so an empty/early state can't pass.
const stageDone = fw.stage === "done";
if (!stageDone) {
  if (!ids.length) {
    fail("build not complete — no milestones recorded and stage !== 'done'", { stage: fw.stage || null });
  }
  if (notDone.length) {
    fail("milestones incomplete", {
      stage: fw.stage || null,
      not_done: notDone.map((id) => ({ id, status: (ms[id] && ms[id].status) || null })),
    });
  }
}

// 5. Authoritative terminal signal, when present (unattended runs).
if (fs.existsSync(RESULT)) {
  let r;
  try { r = JSON.parse(fs.readFileSync(RESULT, "utf8")); }
  catch { fail("RESULT.json present but unreadable", { path: RESULT }); }
  if (r.status !== "done") {
    fail("RESULT.json status is not 'done'", { result_status: r.status || null, result_reason: r.reason || null });
  }
}

// All checks passed.
const out = {
  passed: true,
  stage: fw.stage || null,
  milestones_total: ids.length,
  milestones_done: ids.length - notDone.length,
  result_present: fs.existsSync(RESULT),
  checked_at: new Date().toISOString(),
};
write(out);
console.log(`build-gate: PASS — ${out.milestones_done}/${out.milestones_total} milestones done (stage=${out.stage})`);
process.exit(0);
