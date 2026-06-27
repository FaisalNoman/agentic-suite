// agentic-suite hooks — single dispatcher (zero dependency).
//
// Claude Code invokes:  node suite-hook.mjs <handler>   with the hook payload on
// STDIN (JSON) and expects either exit 0 (allow / no-op) or exit 2 (block —
// stderr is fed back to the model). One entry point keeps wiring + debugging
// simple and mirrors the clean dispatcher pattern from comparable harnesses.
//
// Handlers (v1, opt-in): config-protection · dangerous-bash · circuit-breaker
//
// DORMANCY: every handler exits 0 immediately unless an agentic-suite run is
// active in the cwd (a plan/state/framework-state.json with stage != done in
// ., build/, or grow/). So these hooks never interfere with normal Claude Code
// use in the same repo — that is what makes the pack safe to install.

import fs from "node:fs";
import path from "node:path";

const handler = process.argv[2] || "";

// ── read stdin payload ──
async function readInput() {
  const chunks = [];
  try { for await (const c of process.stdin) chunks.push(c); } catch { /* no stdin */ }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function allow() { process.exit(0); }
function block(reason) { process.stderr.write(String(reason)); process.exit(2); }

// ── find the active run's plan/state dir, if any ──
function findRun(cwd) {
  const roots = ["", "build", "grow"];
  for (const r of roots) {
    const stateDir = path.join(cwd, r, "plan", "state");
    const fwPath = path.join(stateDir, "framework-state.json");
    if (fs.existsSync(fwPath)) {
      let fw = {};
      try { fw = JSON.parse(fs.readFileSync(fwPath, "utf8")); } catch { /* mid-write */ }
      if (fw.stage !== "done") return { stateDir, fw };
    }
  }
  return null;
}

function marker(stateDir, name) { return fs.existsSync(path.join(stateDir, name)); }

// ── handlers ──

// Block edits to test/lint/format/build config files during a run — an agent
// must fix the CODE to go green, not weaken the tooling that judges it.
const CONFIG_RE = new RegExp(
  "^(" +
  "tsconfig[\\w.-]*\\.json|jsconfig\\.json|" +
  "\\.eslintrc[\\w.]*|eslint\\.config\\.[mc]?[jt]s|" +
  "\\.prettierrc[\\w.]*|prettier\\.config\\.[mc]?[jt]s|" +
  "biome\\.jsonc?|" +
  "vitest\\.config\\.[mc]?[jt]s|jest\\.config\\.[mc]?[jt]s|jest\\.setup\\.[mc]?[jt]s|" +
  "\\.babelrc[\\w.]*|babel\\.config\\.[mc]?[jt]s|" +
  "playwright\\.config\\.[mc]?[jt]s|karma\\.conf\\.[mc]?[jt]s|\\.mocharc[\\w.]*|" +
  "pytest\\.ini|tox\\.ini|setup\\.cfg|ruff\\.toml|\\.ruff\\.toml|\\.flake8" +
  ")$", "i");

function configProtection(input, stateDir) {
  if (input.hook_event_name && input.hook_event_name !== "PreToolUse") allow();
  const tool = input.tool_name || "";
  if (!/^(Edit|Write|MultiEdit)$/.test(tool)) allow();
  const fp = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || "";
  if (!fp) allow();
  if (marker(stateDir, ".allow-config-edit")) allow();
  if (CONFIG_RE.test(path.basename(fp))) {
    block(`[agentic-suite] config-protection: editing "${path.basename(fp)}" during a build can mask ` +
      `failures by weakening the tooling that gates green. Fix the code under test instead. ` +
      `If this config change is genuinely required, create "${path.join(stateDir, ".allow-config-edit")}" and retry.`);
  }
  allow();
}

// Block irreversible / outward-facing shell during a run.
const DANGER = [
  { re: /\brm\s+-[a-z]*[rf][a-z]*\s+(?:-[a-z]+\s+)*(\/(?:\s|$)|~|\$HOME|\.\.(?:\/|\s|$)|\*\s*$)/i,
    msg: "rm -rf on an absolute/home/parent/glob path" },
  { re: /\bgit\s+push\b[^\n]*--force(?!-with-lease)\b|\bgit\s+push\b[^\n]*\s-f(?:\s|$)/i,
    msg: "git push --force (use --force-with-lease if a force push is truly needed)" },
  { re: /\bgit\s+reset\s+--hard\b/i, msg: "git reset --hard (discards work irreversibly)" },
  { re: /\bgit\s+clean\s+-[a-z]*f[a-z]*d|\bgit\s+clean\s+-[a-z]*d[a-z]*f/i, msg: "git clean -fd (deletes untracked files)" },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:/i, msg: "fork bomb" },
  { re: /\bchmod\s+-R\s+777\b/i, msg: "chmod -R 777" },
  { re: /\bcurl\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b|\bwget\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba)?sh\b/i,
    msg: "piping a remote download straight into a shell (supply-chain risk)" },
];

function dangerousBash(input, stateDir) {
  if (input.hook_event_name && input.hook_event_name !== "PreToolUse") allow();
  if ((input.tool_name || "") !== "Bash") allow();
  const cmd = (input.tool_input && input.tool_input.command) || "";
  if (!cmd) allow();
  if (marker(stateDir, ".allow-danger")) allow();
  for (const d of DANGER) {
    if (d.re.test(cmd)) {
      block(`[agentic-suite] dangerous-bash: blocked ${d.msg}. This is hard to reverse during an ` +
        `unattended build. If you truly intend it, create "${path.join(stateDir, ".allow-danger")}" and retry, ` +
        `or run it yourself outside the suite.`);
    }
  }
  allow();
}

// Backstop for the suite's "bounded loops" rule: trip after N consecutive
// tool failures so a stuck agent stops thrashing and reassesses root cause.
const THRESHOLD = 5;
function circuitBreaker(input, stateDir) {
  if (input.hook_event_name && input.hook_event_name !== "PostToolUse") allow();
  const resp = input.tool_response;
  const blob = JSON.stringify(resp || {});
  const isErr = /"is_error"\s*:\s*true/.test(blob) ||
    (resp && typeof resp === "object" && (resp.error || resp.is_error === true));
  const file = path.join(stateDir, "breaker.json");
  let st = { count: 0 };
  try { st = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* none yet */ }
  if (!isErr) {
    if (st.count) { try { fs.writeFileSync(file, JSON.stringify({ count: 0, last: null })); } catch {} }
    allow();
  }
  st.count = (st.count || 0) + 1;
  st.last = new Date().toISOString();
  try { fs.writeFileSync(file, JSON.stringify(st)); } catch {}
  if (st.count >= THRESHOLD) {
    try { fs.writeFileSync(file, JSON.stringify({ count: 0, last: st.last })); } catch {} // reset so it nudges once, not every call
    block(`[agentic-suite] circuit-breaker: ${THRESHOLD} consecutive tool failures. Stop retrying — ` +
      `the loop limit is reached. Diagnose the ROOT CAUSE (read the actual error, form one hypothesis, ` +
      `verify it) before any further attempts, or write BLOCKED.md and move to independent work.`);
  }
  allow();
}

// ── route ──
const HANDLERS = { "config-protection": configProtection, "dangerous-bash": dangerousBash, "circuit-breaker": circuitBreaker };

(async () => {
  const fn = HANDLERS[handler];
  if (!fn) allow(); // unknown handler → never block
  const input = await readInput();
  const cwd = input.cwd || process.cwd();
  const run = findRun(cwd);
  if (!run) allow();            // dormant — no active suite run
  try { fn(input, run.stateDir); } catch { allow(); } // never let a hook bug break the session
})();
