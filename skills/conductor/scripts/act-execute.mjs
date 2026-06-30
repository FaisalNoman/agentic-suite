// ACT Phase 2 — execute reversible channels (deterministic core, zero-dep).
//
// Scans the Executor-B artifacts in act/ and builds a list of discrete outward
// ACTIONS (one per tweet / email draft / blog draft / issue), each with a
// dry-run PREVIEW and an idempotency key. The orchestrator then, per action:
// check ledger → show preview → PER-ACTION approval → call the MCP connector →
// `act-execute record`. This script never makes an outward call itself (auth/MCP
// is in-session); it owns scanning, previews, idempotency, and ACT-PLAN status.
//
// Reversible-first: social/email/blog default to DRAFT/SCHEDULE (mode from
// act-executors.json); issues=auto. `web` is excluded (the Deploy stage owns it).
// never_auto channels are excluded entirely.
//
// Subcommands:
//   plan   [--act-dir act]                         → scan → write act/executions.json (+ previews); print
//   record --key K --status executed|failed|skipped [--result R] [--act-dir act]
//   status [--act-dir act]
// Exit: 0 ok · 2 bad args

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cmd = process.argv[2] || "";
const rest = process.argv.slice(3);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const actDir = path.resolve(process.cwd(), opt("act-dir", "act"));
const EXEC = path.join(actDir, "executions.json");
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const keyOf = (channel, action, payload) => "x" + crypto.createHash("sha1")
  .update(`${channel}|${action}|${String(payload || "").trim().toLowerCase().replace(/\s+/g, " ")}`).digest("hex").slice(0, 16);

function registry() {
  const r = rj(path.resolve(here, "..", "references", "act-executors.json")) || { connectors: [], policy: {} };
  const byCh = {}; (r.connectors || []).forEach((c) => byCh[c.channel] = c);
  return { byCh, neverAuto: new Set((r.policy && r.policy.never_auto) || []) };
}

function listFiles(d, re) { try { return fs.readdirSync(d).filter((f) => re.test(f)).map((f) => path.join(d, f)); } catch { return []; } }

if (cmd === "plan") {
  const { byCh, neverAuto } = registry();
  const execs = [];
  const add = (channel, action, payload, preview, src) => {
    const c = byCh[channel]; if (!c) return;                 // no connector for this channel
    if (neverAuto.has(channel) || (c.capability && neverAuto.has(c.capability))) return;
    execs.push({ id: `e${execs.length + 1}`, channel, action, mode: c.mode || "draft",
      connector: c.capability, mcp_hint: c.mcp_hint, src,
      payload, preview, idempotency_key: keyOf(channel, action, payload), status: "planned" });
  };

  // social — one action per tweet (mode: draft/schedule, never auto-publish)
  for (const f of listFiles(actDir, /\.tweets\.json$/i)) {
    const q = rj(f) || []; q.forEach((t) => add("social", "schedule", t.text,
      `schedule tweet (${(t.text || "").length}/280): "${(t.text || "").slice(0, 80)}${(t.text || "").length > 80 ? "…" : ""}"`, path.basename(f)));
  }
  // email — one per .eml draft (create draft, never send)
  for (const f of listFiles(path.join(actDir, "emails"), /\.eml$/i)) {
    const txt = (() => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } })();
    const to = (txt.match(/^To:\s*(.*)$/m) || [])[1] || "", subj = (txt.match(/^Subject:\s*(.*)$/m) || [])[1] || "";
    add("email", "create-draft", `${to}|${subj}`, `create Gmail DRAFT → ${to} · "${subj}"`, path.basename(f));
  }
  // blog — one per post draft
  for (const f of listFiles(path.join(actDir, "posts"), /\.md$/i)) {
    const slug = path.basename(f, ".md");
    add("blog", "create-draft-post", slug, `create CMS draft post: ${slug}`, path.basename(f));
  }
  // issues — automatable gtm rows → create issue
  for (const f of listFiles(actDir, /\.gtm-tasks\.json$/i)) {
    const rows = rj(f) || []; rows.filter((r) => (r.auto || "automatable") === "automatable").forEach((r) =>
      add("issues", "create-issue", r.text, `create issue: "${r.text}"${r.due ? " (due " + r.due + ")" : ""}`, path.basename(f)));
  }

  fs.mkdirSync(actDir, { recursive: true });
  fs.writeFileSync(EXEC, JSON.stringify({ generated_at: new Date().toISOString(), executions: execs }, null, 2));
  if (!execs.length) { console.log("No executable reversible actions found (need act/ artifacts + a matching connector channel)."); process.exit(0); }
  console.log(`${execs.length} reversible action(s) — each needs per-action approval + a live MCP connector:\n`);
  const byChannel = {}; execs.forEach((e) => (byChannel[e.channel] ||= []).push(e));
  for (const ch of Object.keys(byChannel)) { console.log(`  ${ch} (${byChannel[ch][0].mode}):`); byChannel[ch].forEach((e) => console.log(`    [${e.id}] ${e.preview}  · key ${e.idempotency_key}`)); }
  console.log(`\nWritten: ${EXEC}  (web/deploy handled by the Deploy stage; never_auto excluded)`);
  process.exit(0);
}

if (cmd === "record") {
  const key = opt("key"), status = opt("status", "executed"), result = opt("result", null);
  if (!key) { console.error("record: need --key"); process.exit(2); }
  const store = rj(EXEC) || { executions: [] };
  const e = store.executions.find((x) => x.idempotency_key === key);
  if (!e) { console.error(`record: no execution with key ${key}`); process.exit(2); }
  e.status = status; e.result = result; e.recorded_at = new Date().toISOString();
  fs.writeFileSync(EXEC, JSON.stringify(store, null, 2));
  console.log(`execution ${e.id} (${e.channel}/${e.action}) → ${status}${result ? " → " + result : ""}`);
  process.exit(0);
}

if (cmd === "status") {
  const store = rj(EXEC) || { executions: [] };
  const by = {}; store.executions.forEach((e) => by[e.status] = (by[e.status] || 0) + 1);
  console.log(`executions: ${store.executions.length} — ${JSON.stringify(by)}`);
  store.executions.forEach((e) => console.log(`  ${(e.status || "").padEnd(9)} ${e.channel.padEnd(8)} ${e.action}  ${e.idempotency_key}${e.result ? " → " + e.result : ""}`));
  process.exit(0);
}

console.error("usage: act-execute.mjs plan | record --key K --status S [--result R] | status  [--act-dir act]");
process.exit(2);
