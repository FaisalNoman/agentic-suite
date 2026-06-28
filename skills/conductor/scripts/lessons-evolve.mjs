// /suite-evolve — promote mature lessons into durable, human-gated rules (zero-dep).
//
// The lessons ledger (.agentic-builder/lessons.json, written by lessons-merge.mjs)
// warm-starts runs passively. This makes promotion ACTIVE + reviewable: surface
// lessons that have proven themselves (high confidence + seen repeatedly) and
// propose appending them to a PROJECT-LOCAL .agentic-builder/learned-rules.md that
// the planner loads as durable rules. Append-only + git-reversible; never edits
// the shipped skill files; promoted lessons are flagged so they never re-propose.
//
// Usage:
//   node lessons-evolve.mjs propose [--min-conf 0.8] [--min-seen 3]
//   node lessons-evolve.mjs apply <proposal-id|all>
//   node lessons-evolve.mjs list
// Exit: 0 ok · 2 bad args/usage

import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".agentic-builder");
const LESSONS = path.join(dir, "lessons.json");
const RULES = path.join(dir, "learned-rules.md");
const PROPOSALS = path.join(dir, "evolve-proposals.json");
const now = () => new Date().toISOString();
const cmd = process.argv[2] || "";
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

const load = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return dflt; } };
const sectionOf = (l) => l.scope === "stack" ? `stack:${(l.stack || "general")}` : l.scope === "domain" ? `domain:${(l.domain || "general")}` : "global";
const lineOf = (l) => `- **${l.trigger}** → ${l.lesson}  _(conf ${Number(l.confidence).toFixed(2)}, seen ${l.seen_count || 1}×)_`;

if (cmd === "propose") {
  const minConf = Number(opt("min-conf", 0.8)), minSeen = Number(opt("min-seen", 3));
  const lessons = load(LESSONS, []);
  const mature = lessons.filter((l) => !l.promoted && (Number(l.confidence) || 0) >= minConf && (l.seen_count || 1) >= minSeen);
  const proposals = mature.map((l, i) => ({
    pid: `P${String(i + 1).padStart(2, "0")}`, lesson_id: l.id, section: sectionOf(l),
    target: ".agentic-builder/learned-rules.md", line: lineOf(l),
    trigger: l.trigger, confidence: l.confidence, seen_count: l.seen_count || 1,
  }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROPOSALS, JSON.stringify({ generated_at: now(), min_conf: minConf, min_seen: minSeen, proposals }, null, 2));
  if (!proposals.length) { console.log(`No mature lessons to promote (need conf ≥ ${minConf} & seen ≥ ${minSeen}).`); process.exit(0); }
  console.log(`${proposals.length} promotion candidate(s) → review, then \`apply <id|all>\`:\n`);
  for (const p of proposals) console.log(`  [${p.pid}] (${p.section})  ${p.line}`);
  console.log(`\nWritten: ${PROPOSALS}`);
  process.exit(0);
}

if (cmd === "apply") {
  const which = process.argv[3];
  if (!which) { console.error("apply: need <proposal-id|all>"); process.exit(2); }
  const pf = load(PROPOSALS, { proposals: [] });
  const lessons = load(LESSONS, []);
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const todo = which === "all" ? pf.proposals : pf.proposals.filter((p) => p.pid === which);
  if (!todo.length) { console.error(`no proposal ${which} (run propose first)`); process.exit(2); }
  // group by section, append under headings
  let rules = "";
  try { rules = fs.readFileSync(RULES, "utf8"); } catch { rules = "# Learned rules (promoted from the lessons ledger)\n\n> Auto-promoted by /suite-evolve, human-approved. Loaded at planning warm-start.\n"; }
  let applied = 0;
  for (const p of todo) {
    const l = lessonById.get(p.lesson_id);
    if (l && l.promoted) continue;                         // idempotent
    if (rules.includes(p.line)) { if (l) l.promoted = true; continue; } // already present
    const heading = `\n## ${p.section}\n`;
    if (rules.includes(heading.trim())) rules = rules.replace(heading.trim() + "\n", heading.trim() + "\n" + p.line + "\n");
    else rules += `${heading}${p.line}\n`;
    if (l) { l.promoted = true; l.promoted_at = now(); l.promoted_to = p.target; }
    applied++;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(RULES, rules);
  fs.writeFileSync(LESSONS, JSON.stringify(lessons, null, 2));
  // drop applied from proposals
  const appliedPids = new Set(todo.map((p) => p.pid));
  pf.proposals = pf.proposals.filter((p) => !appliedPids.has(p.pid));
  fs.writeFileSync(PROPOSALS, JSON.stringify(pf, null, 2));
  console.log(`Promoted ${applied} lesson(s) → ${RULES}`);
  process.exit(0);
}

if (cmd === "list") {
  const lessons = load(LESSONS, []);
  const prom = lessons.filter((l) => l.promoted), cand = lessons.filter((l) => !l.promoted);
  console.log(`promoted: ${prom.length} · unpromoted: ${cand.length}`);
  prom.forEach((l) => console.log(`  ✓ (${sectionOf(l)}) ${l.trigger}`));
  process.exit(0);
}

console.error("usage: lessons-evolve.mjs propose [--min-conf 0.8 --min-seen 3] | apply <id|all> | list");
process.exit(2);
