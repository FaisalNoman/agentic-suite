// ACT Phase 2 — execution ledger + idempotency (zero-dep).
//
// Outward actions (deploy, post, create issue, send) are irreversible and cost
// money/reputation. This ledger makes execution SAFE to resume/retry: every
// action gets a deterministic idempotency key (channel + action + payload hash);
// before executing the orchestrator runs `check`, and only acts if the key is
// not already `executed`. After acting it runs `record`. Resume/re-run therefore
// never double-fires.
//
// The ledger does NOT perform any outward action — it only tracks them. The
// actual call is made by the orchestrator via an MCP connector (see
// references/act-phase2.md). Files live under <actDir>/.
//
// Usage:
//   node act-ledger.mjs key     '{"channel":"social","action":"post","payload":"<text>"}'
//   node act-ledger.mjs check   <key> [--act-dir act]
//   node act-ledger.mjs record  '{"key":"…","channel":"social","action":"post","status":"executed","result":"https://…","dry_run":false}' [--act-dir act]
//   node act-ledger.mjs list    [--act-dir act]
// Exit: check → 0 if already executed, 1 if not (so `&&`/`||` gates work); others → 0.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const cmd = process.argv[2] || "";
const rest = process.argv.slice(3);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const actDir = path.resolve(process.cwd(), opt("act-dir", "act"));
const STATE = path.join(actDir, "exec-state.json");
const LOG = path.join(actDir, "exec-ledger.jsonl");
const now = () => new Date().toISOString();

function keyOf(o) {
  const norm = `${o.channel || ""}|${o.action || ""}|${String(o.payload || "").trim().toLowerCase().replace(/\s+/g, " ")}`;
  return "x" + crypto.createHash("sha1").update(norm).digest("hex").slice(0, 16);
}
function loadState() { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } }

const posArg = rest.find((a) => !a.startsWith("--"));

if (cmd === "key") {
  let o; try { o = JSON.parse(posArg || process.argv[3]); } catch { console.error("key: bad JSON"); process.exit(2); }
  console.log(keyOf(o)); process.exit(0);
}

if (cmd === "check") {
  const k = posArg; if (!k) { console.error("check: need <key>"); process.exit(2); }
  const st = loadState();
  if (st[k] && st[k].status === "executed") { console.log(JSON.stringify(st[k])); process.exit(0); }
  console.log(JSON.stringify({ key: k, status: st[k] ? st[k].status : "new" })); process.exit(1);
}

if (cmd === "record") {
  let r; try { r = JSON.parse(posArg || process.argv[3]); } catch { console.error("record: bad JSON"); process.exit(2); }
  const k = r.key || keyOf(r);
  const entry = { key: k, channel: r.channel || null, action: r.action || null, status: r.status || "executed",
    result: r.result || null, dry_run: !!r.dry_run, at: now() };
  const st = loadState(); st[k] = entry;
  fs.mkdirSync(actDir, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st, null, 2));
  fs.appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(`ledger: ${entry.status} ${entry.channel || ""}/${entry.action || ""} ${k}${entry.dry_run ? " (dry-run)" : ""}`);
  process.exit(0);
}

if (cmd === "list") {
  const st = loadState(); const e = Object.values(st);
  if (!e.length) { console.log("(ledger empty)"); process.exit(0); }
  for (const x of e) console.log(`  ${x.status.padEnd(9)} ${(x.channel || "").padEnd(8)} ${x.action || ""}  ${x.key}${x.dry_run ? " (dry-run)" : ""}${x.result ? "  → " + x.result : ""}`);
  process.exit(0);
}

console.error("usage: act-ledger.mjs key|check|record|list  (see header)");
process.exit(2);
