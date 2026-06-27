// ACT — Executor B writer/validator + ACT-PLAN.json (Phase 1, file-only, zero-dep).
//
// The conductor's ACT stage extracts structured content from each GROW deliverable
// (the LLM part) and passes it here as a SPEC; this script does the mechanical,
// deterministic part — write the confirmed artifact formats, validate them, and
// emit ACT-PLAN.json. It NEVER posts/sends/deploys: every path is under actDir.
// (Executor A "build" deliverables are recorded as approval-pending with a
// build_ref; the orchestrator spawns agentic-app-builder for those, not this script.)
//
// Usage:  node act-build-artifacts.mjs <spec.json>      (or '-' for stdin)
// Spec:   { outputsDir?, actDir?, deliverables:[ {
//            id, source, title, class:"software|publishable|plan",
//            channel:"social|email|blog|cms|null", executor:"build|artifact",
//            tweets?:[{text,suggested_time?}], emails?:[{to,subject,body}],
//            posts?:[{slug,title,frontmatter?,body}], gtm?:[task], tasks?:[task] } ] }
//          task = { id?, text, auto:"automatable|human", channel?, owner?, due?, depends_on?, status? }
// Writes:  <actDir>/ artifacts + <actDir>/ACT-PLAN.json
// Exit:    0 = wrote · 1 = no deliverables · 2 = bad spec

import fs from "node:fs";
import path from "node:path";

const arg = process.argv[2];
if (!arg) { console.error("usage: act-build-artifacts.mjs <spec.json|->"); process.exit(2); }
let raw = ""; try { raw = arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(arg, "utf8"); } catch { console.error("cannot read spec"); process.exit(2); }
let spec; try { spec = JSON.parse(raw); } catch { console.error("spec is not valid JSON"); process.exit(2); }

const outputsDir = spec.outputsDir || "grow/outputs";
const actDir = path.resolve(process.cwd(), spec.actDir || "act");
const dels = Array.isArray(spec.deliverables) ? spec.deliverables : [];
if (!dels.length) { console.error("no deliverables in spec"); process.exit(1); }

fs.mkdirSync(actDir, { recursive: true });
const now = () => new Date().toISOString();
const warnings = [];
const W = (p, s) => { fs.mkdirSync(path.dirname(path.join(actDir, p)), { recursive: true }); fs.writeFileSync(path.join(actDir, p), s); return { path: `act/${p}`.replace(/\\/g, "/") }; };
const csvCell = (v) => { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };

function tasksMd(d) {
  const ts = Array.isArray(d.tasks) ? d.tasks : [];
  const lines = [`# ${d.title} — tasks`, "", `> source: \`${d.source}\``, ""];
  if (!ts.length) lines.push("_No discrete tasks extracted._");
  for (const t of ts) {
    const tag = t.auto === "human" ? "human" : "automatable";
    const ch = t.channel ? `·${t.channel}` : "";
    const dep = t.depends_on ? `  ↳ depends on \`${t.depends_on}\`` : "";
    lines.push(`- [ ] (${tag}${ch}) ${t.text}${dep}`);
  }
  return lines.join("\n") + "\n";
}

const planDeliverables = [];
let autoTasks = 0, humanTasks = 0;

for (const d of dels) {
  const id = d.id; const cls = d.class; const ch = d.channel || null;
  const executor = d.executor || (cls === "software" ? "build" : "artifact");
  const outputs = [];
  (d.tasks || []).forEach((t) => { (t.auto === "human" ? (humanTasks++) : (autoTasks++)); });

  if (executor === "build") {
    // file-only: just record the build target; the orchestrator runs the build (approval-gated)
    planDeliverables.push({
      id, source: d.source, title: d.title, class: cls, channel: ch, executor: "build",
      approval: { required: true, status: "pending", at: null },
      status: "pending", outputs: [],
      tasks: d.tasks || [],
      build_ref: { dir: `act/${id}-${(d.title || "build").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}/`, framework_state: null, result: null },
      error: null, started_at: null, completed_at: null,
    });
    continue;
  }

  // ── artifact executor (safe, file-only) ──
  // social → tweets.json + tweets.txt
  if (ch === "social" && Array.isArray(d.tweets) && d.tweets.length) {
    const queue = d.tweets.map((t, i) => {
      const text = String(t.text || "").trim();
      if (text.length > 280) warnings.push(`${id}: tweet ${i + 1} is ${text.length} chars (>280)`);
      return { n: i + 1, text, chars: text.length, suggested_time: t.suggested_time || null };
    });
    outputs.push({ ...W(`${id}.tweets.json`, JSON.stringify(queue, null, 2)), kind: "post-queue" });
    outputs.push({ ...W(`${id}.tweets.txt`, queue.map((q) => `[${q.n}] (${q.chars}/280)\n${q.text}\n`).join("\n")), kind: "copy-paste" });
  }
  // email → .eml drafts (never sent)
  if (ch === "email" && Array.isArray(d.emails) && d.emails.length) {
    d.emails.forEach((m, i) => {
      const eml = `To: ${m.to || ""}\nSubject: ${m.subject || ""}\nContent-Type: text/plain; charset=utf-8\nX-ACT: draft (not sent)\n\n${m.body || ""}\n`;
      outputs.push({ ...W(`emails/${id}-${i + 1}.eml`, eml), kind: "email-draft" });
    });
  }
  // blog/cms → posts/<slug>.md with front-matter
  if ((ch === "blog" || ch === "cms") && Array.isArray(d.posts) && d.posts.length) {
    d.posts.forEach((p) => {
      const fm = { title: p.title || d.title, ...(p.frontmatter || {}) };
      const front = "---\n" + Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") + "\n---\n\n";
      const slug = (p.slug || p.title || id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      outputs.push({ ...W(`posts/${slug}.md`, front + (p.body || "")), kind: "cms-markdown" });
    });
  }
  // plan → gtm-tasks.json + gtm.csv
  if (cls === "plan" && Array.isArray(d.gtm) && d.gtm.length) {
    const rows = d.gtm.map((t, i) => ({ id: t.id || `${id}-g${i + 1}`, text: t.text || "", auto: t.auto || "automatable", channel: t.channel || "", owner: t.owner || "", due: t.due || "", depends_on: t.depends_on || "", status: t.status || "ready" }));
    outputs.push({ ...W(`${id}.gtm-tasks.json`, JSON.stringify(rows, null, 2)), kind: "task-list" });
    const head = ["id", "text", "auto", "channel", "owner", "due", "depends_on", "status"];
    const csv = [head.join(","), ...rows.map((r) => head.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n";
    outputs.push({ ...W(`${id}.gtm.csv`, csv), kind: "import-csv" });
  }
  // always → per-deliverable checklist
  outputs.push({ ...W(`${id}.tasks.md`, tasksMd(d)), kind: "checklist" });

  planDeliverables.push({
    id, source: d.source, title: d.title, class: cls, channel: ch, executor: "artifact",
    approval: { required: false, status: "auto", at: now() },
    status: "done", outputs, tasks: d.tasks || [], build_ref: null,
    error: null, started_at: now(), completed_at: now(),
  });
}

const byClass = {}; const byExec = {};
planDeliverables.forEach((d) => { byClass[d.class] = (byClass[d.class] || 0) + 1; byExec[d.executor] = (byExec[d.executor] || 0) + 1; });
const offered = planDeliverables.some((d) => d.class === "software" || d.class === "publishable");

const plan = {
  schema: 1, generated_at: now(), source: outputsDir,
  act_mode: byExec.build ? "build+artifacts" : "artifacts",
  gate: { offered, reason: offered ? `${(byClass.software || 0) + (byClass.publishable || 0)} software/publishable deliverables` : "no software/publishable deliverables", trigger_rule: "offer ACT only when >=1 deliverable.class in [software, publishable]" },
  formats: { social: ["tweets.json", "tweets.txt"], email: ["eml-drafts"], blog: ["cms-markdown"], plan: ["tasks-json", "tasks-csv"], always: ["tasks-md"] },
  deliverables: planDeliverables,
  summary: { total: planDeliverables.length, by_class: byClass, by_executor: byExec, automatable_tasks: autoTasks, human_tasks: humanTasks, pending_approval: planDeliverables.filter((d) => d.approval.status === "pending").map((d) => d.id) },
  warnings,
  updated_at: now(),
};
fs.writeFileSync(path.join(actDir, "ACT-PLAN.json"), JSON.stringify(plan, null, 2));

const arts = planDeliverables.reduce((n, d) => n + d.outputs.length, 0);
console.log(`ACT: ${planDeliverables.length} deliverables · ${arts} artifacts · build pending: ${plan.summary.pending_approval.length}${warnings.length ? ` · ${warnings.length} warning(s)` : ""}`);
console.log(`wrote ${path.join(actDir, "ACT-PLAN.json").replace(/\\/g, "/")}`);
process.exit(0);
