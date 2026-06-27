// Cross-run "lessons ledger" — deterministic merge + warm-start reader.
//
// Continuous learning, lightweight tier. At run end the orchestrator distills a
// few atomic lessons from the run's signals (gate failures, fix-loop counts,
// BLOCKED.md, and USER OVERRIDES — plan "Change scope", wireframe "Suggest
// changes", interview answers that overrode defaults). It writes them as a JSON
// array and calls `merge`; this script dedupes by normalized trigger (bumping
// seen_count + confidence instead of duplicating) and caps the store. At the
// next run's planning warm-start, `warm` prints the most relevant lessons to
// inject into context — so each run gets smarter without a background model.
//
// Store: <cwd>/.agentic-builder/lessons.json  (shared, beside memory.json)
//
// Usage:
//   node lessons-merge.mjs merge <new-lessons.json>     # or '-' for stdin
//   node lessons-merge.mjs warm [--stack ts] [--domain saas] [--limit 12]
//   node lessons-merge.mjs list
//
// Lesson shape: { id?, scope: "global"|"stack"|"domain", trigger, lesson,
//                 confidence?(0..1), stack?, domain? }
// Stored adds: seen_count, last_seen, first_seen.

import fs from "node:fs";
import path from "node:path";

const STORE = path.join(process.cwd(), ".agentic-builder", "lessons.json");
const MAX = 200;            // hard cap on stored lessons
const DEFAULT_CONF = 0.5;
const cmd = process.argv[2] || "";

const now = () => new Date().toISOString();
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const score = (l) => (Number(l.confidence) || 0) * (1 + Math.log10(1 + (l.seen_count || 1)));

function load() { try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch { return []; } }
function save(arr) {
  arr.sort((a, b) => score(b) - score(a));
  if (arr.length > MAX) arr = arr.slice(0, MAX);
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(arr, null, 2));
  return arr;
}

function readNew(arg) {
  let raw = "";
  if (!arg || arg === "-") { try { raw = fs.readFileSync(0, "utf8"); } catch {} }
  else { try { raw = fs.readFileSync(arg, "utf8"); } catch { console.error(`cannot read ${arg}`); process.exit(2); } }
  let j; try { j = JSON.parse(raw || "[]"); } catch { console.error("new lessons not valid JSON"); process.exit(2); }
  return Array.isArray(j) ? j : (Array.isArray(j.lessons) ? j.lessons : []);
}

if (cmd === "merge") {
  const incoming = readNew(process.argv[3]);
  const store = load();
  const index = new Map(store.map((l) => [`${l.scope}|${norm(l.trigger)}`, l]));
  let added = 0, bumped = 0;
  for (const n of incoming) {
    if (!n || !n.trigger || !n.lesson) continue;
    const scope = ["global", "stack", "domain"].includes(n.scope) ? n.scope : "global";
    const key = `${scope}|${norm(n.trigger)}`;
    const ex = index.get(key);
    if (ex) {
      ex.seen_count = (ex.seen_count || 1) + 1;
      ex.confidence = Math.min(0.95, (Number(ex.confidence) || DEFAULT_CONF) + 0.1);
      ex.last_seen = now();
      if (String(n.lesson).length > String(ex.lesson).length) ex.lesson = n.lesson; // keep richer wording
      bumped++;
    } else {
      const l = {
        id: `L-${norm(n.trigger).replace(/ /g, "-").slice(0, 40)}-${store.length + added + 1}`,
        scope, trigger: n.trigger, lesson: n.lesson,
        confidence: Math.max(0.1, Math.min(0.95, Number(n.confidence) || DEFAULT_CONF)),
        stack: n.stack || null, domain: n.domain || null,
        seen_count: 1, first_seen: now(), last_seen: now(),
      };
      store.push(l); index.set(key, l); added++;
    }
  }
  const out = save(store);
  console.log(`lessons: +${added} new, ${bumped} reinforced, ${out.length} total → ${STORE}`);
  process.exit(0);
}

if (cmd === "warm") {
  const opt = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
  const stack = norm(opt("stack")); const domain = norm(opt("domain"));
  const limit = Number(opt("limit")) || 12;
  const store = load();
  const relevant = store.filter((l) => {
    if (l.scope === "global") return true;
    if (l.scope === "stack") return stack && (norm(l.stack).includes(stack) || stack.includes(norm(l.stack)));
    if (l.scope === "domain") return domain && (norm(l.domain).includes(domain) || domain.includes(norm(l.domain)));
    return false;
  }).sort((a, b) => score(b) - score(a)).slice(0, limit);
  if (!relevant.length) { console.log("(no prior lessons apply)"); process.exit(0); }
  console.log("## Lessons from prior runs (apply where relevant)");
  for (const l of relevant) {
    console.log(`- **${l.trigger}** → ${l.lesson}  _(conf ${l.confidence.toFixed(2)}, seen ${l.seen_count}×)_`);
  }
  process.exit(0);
}

if (cmd === "list") { console.log(JSON.stringify(load(), null, 2)); process.exit(0); }

console.error("usage: lessons-merge.mjs merge <file|-> | warm [--stack s --domain d --limit n] | list");
process.exit(2);
