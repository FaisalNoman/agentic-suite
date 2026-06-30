// Launch cockpit — one interactive page summarizing go-live status (zero-dep).
//
// Turns the scattered launch state (ACT-PLAN deploys, executions.json, artifacts)
// into a single LAUNCH.html control board: live deploy URLs, the reversible
// actions and their status, and the remaining manual steps — each with the exact
// command to run. Read-mostly (a static page can't trigger in-session actions),
// but it is the founder's single "is it launched?" view with copy-to-run commands.
//
//   build [--act-dir act] [--no-open]   → writes LAUNCH.html (+ refreshes nothing else)
// Exit: 0

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rest = process.argv.slice(3);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const NO_OPEN = rest.includes("--no-open");
const actDir = path.resolve(process.cwd(), opt("act-dir", "act"));
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const plan = rj(path.join(actDir, "ACT-PLAN.json")) || {};
const execs = (rj(path.join(actDir, "executions.json")) || {}).executions || [];
const suite = rj(path.join(process.cwd(), "suite-state.json")) || {};
const product = plan.product || suite.product || "your product";
const deploys = plan.deploys || [];

const liveCount = deploys.filter((d) => d.verified).length;
const pending = execs.filter((e) => e.status === "planned").length;
const doneEx = execs.filter((e) => e.status === "executed").length;

function row(state, label, detail, cmd) {
  const ico = state === "ok" ? "✅" : state === "warn" ? "⚠️" : "☐";
  return `<div class="r ${state}"><span class="ic">${ico}</span><div class="b"><div class="t">${label}</div>${detail ? `<div class="d">${detail}</div>` : ""}</div>${cmd ? `<button class="cp" data-cmd="${esc(cmd)}">copy cmd</button>` : ""}</div>`;
}

const deployRows = deploys.length
  ? deploys.map((d) => row(d.verified ? "ok" : "warn", `Deploy · ${esc(d.target)}`, d.url ? `<a href="${esc(d.url)}" target="_blank">${esc(d.url)}</a>${d.verified ? " · verified 200" : " · not verified"}` : "not deployed", d.url ? null : `node ~/.claude/skills/agentic-suite/scripts/act-deploy.mjs plan ${esc(d.target)}`)).join("")
  : row("todo", "Deploy", "no live URL yet — run the Deploy stage (ACT)", "node ~/.claude/skills/agentic-suite/scripts/act-deploy.mjs plan <built-dir>");

const byCh = {}; execs.forEach((e) => (byCh[e.channel] ||= []).push(e));
const execRows = Object.keys(byCh).map((ch) => {
  const items = byCh[ch].map((e) => row(e.status === "executed" ? "ok" : "todo", `${ch} · ${esc(e.action)}`, esc(e.preview) + (e.result ? ` · <a href="${esc(e.result)}" target="_blank">result</a>` : ""), e.status === "executed" ? null : `approve in the suite ACT run (per-action) · key ${e.idempotency_key}`)).join("");
  return items;
}).join("");

const manual = row("todo", "Analytics", "not added — drop in Plausible/GA + a working signup", null) +
  row("todo", "Custom domain", "optional — point your domain at the deploy host (DNS)", null);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Launch — ${esc(product)}</title>
<style>
:root{--bg:#0b0e14;--panel:#11161f;--line:#1f2733;--line2:#2a3441;--ink:#e6edf3;--ink2:#aeb9c7;--dim:#6b7787;--accent:#7aa2ff;--green:#22c55e;--amber:#f0c674;--mono:ui-monospace,Consolas,monospace;--sans:-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--ink);font-family:var(--sans);max-width:780px;margin:0 auto;padding:36px 24px 80px}
a{color:var(--accent)}.head{display:flex;align-items:center;gap:11px}.dot{width:11px;height:11px;border-radius:50%;background:linear-gradient(135deg,var(--accent),#9b8cff);box-shadow:0 0 12px var(--accent)}
h1{font-size:26px;letter-spacing:-.4px}.sub{font:600 11px var(--mono);letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);margin:4px 0 20px 22px}
.kpis{display:flex;gap:12px;margin-bottom:22px}.kpi{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:12px 16px;flex:1}
.kpi .v{font:700 24px var(--mono)}.kpi .l{font:600 10px var(--mono);letter-spacing:1px;text-transform:uppercase;color:var(--dim)}
.sec{font:600 11px var(--mono);letter-spacing:2px;text-transform:uppercase;color:var(--accent);margin:18px 0 8px}
.r{display:flex;align-items:flex-start;gap:11px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:11px 14px;margin-bottom:8px}
.r.ok{border-color:color-mix(in srgb,var(--green) 35%,transparent)}.r.warn{border-color:color-mix(in srgb,var(--amber) 35%,transparent)}
.r .ic{font-size:15px;line-height:1.4}.r .b{flex:1;min-width:0}.r .t{font-weight:600;font-size:14px}.r .d{font-size:12.5px;color:var(--ink2);margin-top:2px;word-break:break-all}
.cp{font:600 11px var(--mono);background:var(--bg);border:1px solid var(--line2);color:var(--ink2);border-radius:7px;padding:5px 9px;cursor:pointer;white-space:nowrap}.cp:hover{border-color:var(--accent);color:var(--ink)}.cp.ok{color:var(--green);border-color:var(--green)}
.foot{margin-top:24px;font:600 11px var(--mono);color:var(--dim)}
</style></head><body>
<div class="head"><span class="dot"></span><h1>Launch — ${esc(product)}</h1></div>
<div class="sub">agentic-suite · go-live cockpit</div>
<div class="kpis">
  <div class="kpi"><div class="v" style="color:var(--green)">${liveCount}/${deploys.length || 0}</div><div class="l">live deploys</div></div>
  <div class="kpi"><div class="v" style="color:var(--green)">${doneEx}</div><div class="l">actions done</div></div>
  <div class="kpi"><div class="v" style="color:var(--amber)">${pending}</div><div class="l">pending</div></div>
</div>
<div class="sec">Deploy</div>${deployRows}
<div class="sec">Reversible actions</div>${execRows || row("todo","No reversible actions enumerated","run <code>act-execute.mjs plan</code> after ACT artifacts exist",null)}
<div class="sec">Still manual</div>${manual}
<div class="foot">Static cockpit — approvals + outward calls run inside the suite ACT session. Regenerate: <code>node ~/.claude/skills/agentic-suite/scripts/launch-cockpit.mjs build</code></div>
<script>document.querySelectorAll(".cp").forEach(b=>b.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.cmd);const o=b.textContent;b.textContent="copied";b.classList.add("ok");setTimeout(()=>{b.textContent=o;b.classList.remove("ok")},1200)});</script>
</body></html>`;

const out = path.join(process.cwd(), "LAUNCH.html");
fs.writeFileSync(out, html);
console.log(`wrote ${out.replace(/\\/g, "/")} · ${liveCount} live · ${doneEx} done · ${pending} pending`);
if (!NO_OPEN) { try { const p = process.platform; const c = p === "win32" ? "cmd" : p === "darwin" ? "open" : "xdg-open"; const a = p === "win32" ? ["/c", "start", "", out] : [out]; const ch = spawn(c, a, { detached: true, stdio: "ignore" }); ch.on("error", () => {}); ch.unref(); } catch {} }
process.exit(0);
