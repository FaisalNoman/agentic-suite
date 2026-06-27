// agentic-suite security-surface scanner — zero dependency.
//
// A 192-persona registry + skill/settings/hook files is an injection surface:
// any of those .md bodies is loaded into an agent's prompt, so a poisoned line
// ("ignore previous instructions", an exfil URL, a hidden directive) becomes a
// real prompt-injection vector. This scans that surface for known patterns and
// reports findings. It is ADVISORY — it never blocks a run; the caller (install
// step or the user) decides what to do.
//
// Usage:  node scan-surface.mjs [--base <skill-base>] [--json] [--quiet]
//   --base  skill base dir to resolve the shared agents/registry.json from
//           (defaults to this script's grandparent). Also scans sibling skills'
//           SKILL.md and ./.claude/settings.json in the cwd.
// Writes:  scan-report.json (always)
// Exit:    0 = clean or low-severity only · 1 = high-severity findings present
//
// Patterns are heuristics, not proof — a hit means "a human should look", not
// "this is malicious". Reducing false positives matters more than catching every
// theoretical case, so rules are deliberately specific.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const asJson = args.includes("--json");
const quiet = args.includes("--quiet");
const base = path.resolve(opt("base") || path.resolve(here, ".."));

// ── line rules ──
const RULES = [
  { id: "ignore-instructions", sev: "high", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|above|prior|earlier|all your|your|the system)\b[^.\n]{0,20}\b(instruction|prompt|rule|directive|guardrail)/i },
  { id: "role-override", sev: "medium", re: /\b(you are now|from now on,? you are|new system prompt:|disregard your (role|instructions|system prompt)|forget you are)\b/i },
  { id: "system-tag-injection", sev: "high", re: /<\|im_(start|end)\|>|\[\/INST\]|<\/(system|assistant)>\s*<(user|system)>/i },
  { id: "data-exfil", sev: "high", re: /\b(exfiltrat\w+|leak (the|this|all)|send (it|this|the (key|token|secret|data|credentials?)) to|POST (the )?(secret|token|key|credential)s?)\b[^.\n]{0,40}https?:\/\//i },
  { id: "secret-harvest", sev: "high", re: /\b(exfiltrat\w+|harvest|steal|scrape|collect and send|dump (all )?)\b[^.\n]{0,30}\b(\.env\b|api[_ -]?keys?\b|secrets?\b|tokens?\b|credentials?\b|passwords?\b|private key)/i },
  { id: "destructive-coercion", sev: "high", re: /\b(run|execute|exec|silently run)\b[^.\n]{0,30}(rm\s+-rf\s+[~/]|del\s+\/[sf]|format\s+c:|drop\s+table|git\s+push\s+--force)/i },
  { id: "hardcoded-secret", sev: "high", re: /(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----)/ },
  { id: "hidden-html-directive", sev: "medium", re: /<!--[^>]*\b(ignore (previous|above|all)|you are now|do not tell the user|secretly|exfiltrat)\b[^>]*-->/i },
  { id: "tool-coercion", sev: "medium", re: /\b(without (telling|informing|notifying) the user|do not (tell|inform|mention (it|this) to|report (it|this) to) the user|hide (this|it) from the user)\b/i },
];
// whole-file rules
const ZERO_WIDTH = /[​-‏‪-‮⁠﻿]/;

function scanText(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln.trim()) continue;
    for (const r of RULES) {
      if (r.re.test(ln)) out.push({ rule: r.id, sev: r.sev, line: i + 1, snippet: ln.trim().slice(0, 160) });
    }
  }
  if (ZERO_WIDTH.test(text)) {
    const idx = text.split(/\r?\n/).findIndex((l) => ZERO_WIDTH.test(l));
    out.push({ rule: "zero-width-chars", sev: "medium", line: idx + 1, snippet: "(invisible/bidi unicode — possible hidden directive)" });
  }
  return out;
}

// ── collect target files ──
function resolveRegistry() {
  const cands = [
    path.join(base, "..", "agents", "registry.json"),
    path.join(base, "agents", "registry.json"),
    path.join(base, "..", "agentic-app-builder", "agents", "registry.json"),
  ];
  return cands.find((p) => fs.existsSync(p)) || null;
}

const targets = []; // { file, kind }
const reg = resolveRegistry();
if (reg) {
  const agentsParent = path.dirname(path.dirname(reg)); // dir containing agents/
  try {
    const j = JSON.parse(fs.readFileSync(reg, "utf8"));
    for (const a of (j.agents || [])) {
      if (!a.path) continue;
      const p = path.resolve(agentsParent, a.path);
      if (fs.existsSync(p)) targets.push({ file: p, kind: "persona" });
    }
  } catch {}
}
// skill SKILL.md files near the base
for (const dir of [base, path.join(base, ".."), path.join(base, "..", "agentic-app-builder"), path.join(base, "..", "agentic-worker")]) {
  const sk = path.join(dir, "SKILL.md");
  if (fs.existsSync(sk)) targets.push({ file: sk, kind: "skill" });
}
// settings + cwd .claude
for (const p of [path.join(process.cwd(), ".claude", "settings.json"), path.join(process.cwd(), ".claude", "settings.local.json")]) {
  if (fs.existsSync(p)) targets.push({ file: p, kind: "settings" });
}

// ── scan ──
const findings = [];
const seen = new Set();
for (const t of targets) {
  if (seen.has(t.file)) continue; seen.add(t.file);
  let text = "";
  try { text = fs.readFileSync(t.file, "utf8"); } catch { continue; }
  for (const f of scanText(text)) findings.push({ ...f, file: t.file.split(path.sep).join("/"), kind: t.kind });
}

const high = findings.filter((f) => f.sev === "high");
const medium = findings.filter((f) => f.sev === "medium");
const report = {
  scanned: seen.size, personas: targets.filter((t) => t.kind === "persona").length,
  high: high.length, medium: medium.length, findings,
  scanned_at: new Date().toISOString(),
};
try { fs.writeFileSync(path.join(process.cwd(), "scan-report.json"), JSON.stringify(report, null, 2)); } catch {}

if (asJson) { console.log(JSON.stringify(report, null, 2)); }
else if (!quiet) {
  console.log(`agentic-suite surface scan — ${seen.size} files (${report.personas} personas)`);
  console.log(`  high: ${high.length}   medium: ${medium.length}`);
  for (const f of [...high, ...medium].slice(0, 40)) {
    console.log(`  [${f.sev}] ${f.rule}  ${f.file}:${f.line}\n      ${f.snippet}`);
  }
  if (findings.length > 40) console.log(`  … +${findings.length - 40} more (see scan-report.json)`);
  if (!findings.length) console.log("  clean — no injection patterns found.");
  console.log("  (advisory — heuristic patterns; review hits, this never blocks a run.)");
}
process.exit(high.length ? 1 : 0);
