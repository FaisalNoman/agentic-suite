// Persona router preview — see which specialist the suite would pick for a task.
//
// Runs the SAME scoring the live specialist-router uses (references/
// specialist-registry.md): tokenize the task, score each registry persona by
// shared-token overlap with its name+description, return the ranked matches.
// THRESHOLD = 2 shared tokens (below that → no persona, plain generic agent).
//
// This is a read-only demonstrator: give it a requirement, see the routing.
// At a live run the chosen persona also shows as a badge on the dashboard agent
// card (emoji + name) and in agents.json `persona`.
//
// Usage:
//   node route-preview.mjs "design an SEO strategy and keyword plan for a SaaS"
//   node route-preview.mjs "<task text>" --domains marketing,sales,strategy --top 8
//
// --domains limits candidates (default: all domains in the registry).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "..");
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const FLAGS = new Set(["--domains", "--top"]);
// task = positional args only — drop each --flag AND its value
const taskParts = [];
for (let i = 0; i < argv.length; i++) {
  if (FLAGS.has(argv[i])) { i++; continue; }   // skip flag + its value
  if (argv[i].startsWith("--")) continue;       // skip unknown flags
  taskParts.push(argv[i]);
}
const task = taskParts.join(" ").trim();
const top = Number(opt("top")) || 6;
const domainFilter = (opt("domains") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const THRESHOLD = 2;

if (!task) { console.error('usage: route-preview.mjs "<task description>" [--domains a,b] [--top N]'); process.exit(2); }

const STOP = new Set("a an the and or for of to in on with by from as at is are be this that your you it its into over per via using build create design write plan make report analysis analyze".split(" "));
const tok = (s) => [...new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];

function findRegistry() {
  return [
    path.join(base, "..", "agents", "registry.json"),
    path.join(base, "agents", "registry.json"),
    path.join(base, "..", "agentic-app-builder", "agents", "registry.json"),
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "skills", "agents", "registry.json"),
  ].find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

const reg = findRegistry();
if (!reg) { console.error("route-preview: agents/registry.json not found"); process.exit(2); }
const agents = (JSON.parse(fs.readFileSync(reg, "utf8")).agents || []);

const kw = new Set(tok(task));
const scored = agents
  .filter((a) => !domainFilter.length || domainFilter.includes(String(a.domain).toLowerCase()))
  .map((a) => {
    const at = tok(`${a.name} ${a.description}`);
    const shared = at.filter((w) => kw.has(w));
    return { a, score: shared.length, shared };
  })
  .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
  .slice(0, top);

console.log(`Task: "${task}"`);
console.log(`Registry: ${agents.length} personas${domainFilter.length ? ` (domains: ${domainFilter.join(", ")})` : ""}  ·  threshold ${THRESHOLD}\n`);
const best = scored[0];
if (!best || best.score < THRESHOLD) {
  console.log("→ No persona meets threshold — the router would use a plain general-purpose agent.");
} else {
  console.log(`→ SELECTED: ${best.a.emoji || ""} ${best.a.name}  [${best.a.domain}]  (score ${best.score})`);
  console.log(`           matched on: ${best.shared.join(", ") || "—"}\n`);
  console.log("Ranked candidates:");
  scored.forEach((s, i) => {
    const mark = s.score >= THRESHOLD ? (i === 0 ? "►" : " ") : "·";
    console.log(`  ${mark} ${String(s.score).padStart(2)}  ${s.a.emoji || " "} ${s.a.name}  [${s.a.domain}]`);
  });
}
