// GTM-roadmap renderer (zero-dep). Turns a roadmap JSON (worker-filled) into a
// full Markdown deliverable + an interactive self-contained HTML. The CONTENT is
// the worker's; this owns the deterministic STRUCTURE + render. Every task shows
// its asset AND a human execution playbook (guidelines), with an owner badge
// (suite / connector / human) — so no asset is handed over without "how to ship it".
//
// Usage: node gtm-roadmap.mjs <roadmap.json|-> [--out-dir grow/outputs] [--no-open]
// Writes: <out-dir>/gtm-roadmap.md + <out-dir>/gtm-roadmap.html   Exit: 0 ok · 2 bad spec

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const arg = process.argv[2];
const rest = process.argv.slice(3);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const NO_OPEN = rest.includes("--no-open");
const outDir = path.resolve(process.cwd(), opt("out-dir", "grow/outputs"));
if (!arg) { console.error("usage: gtm-roadmap.mjs <roadmap.json|-> [--out-dir d] [--no-open]"); process.exit(2); }

let raw = ""; try { raw = arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(process.cwd(), arg), "utf8"); } catch { raw = arg; }
let r; try { r = JSON.parse(raw); } catch { console.error("bad roadmap JSON"); process.exit(2); }
const phases = r.phases || [];
const allTasks = phases.flatMap((p) => p.tasks || []);
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const OWNER = { suite: ["🤖", "suite-made", "#22c55e"], connector: ["🔌", "needs connector", "#f0c674"], human: ["🧑", "you do this", "#7aa2ff"] };
const ownerOf = (o) => OWNER[o] || OWNER.human;

// ---------- Markdown ----------
const md = [];
md.push(`# Go-To-Market Roadmap — ${r.product || "your product"}`);
if (r.markets) md.push(`**Markets:** ${r.markets.join(" · ")}`);
const s = r.summary || {};
md.push(`**${s.total_tasks || allTasks.length} tasks · ${phases.length} phases · ${s.day_plan ? s.day_plan + "-day plan" : ""} · budget ${s.budget_total || "—"}**`, "");
md.push(`> Every task lists its **asset** and an **execution playbook**. Owner: 🤖 suite-made · 🔌 needs a connector · 🧑 you do this.`, "");
for (const p of phases) {
  md.push(`\n## ${p.name}${p.window ? " — " + p.window : ""}${p.budget ? " · " + p.budget : ""}`);
  for (const t of (p.tasks || [])) {
    const [ic, lbl] = ownerOf(t.owner);
    md.push(`\n### ${t.id ? t.id + " · " : ""}${t.title}  ${ic} _${lbl}_`);
    const meta = [t.channel, t.effort && t.effort + " effort", t.budget, t.kpi && "KPI: " + t.kpi].filter(Boolean);
    if (meta.length) md.push(`\`${meta.join("` · `")}\``);
    if (t.objective) md.push(`\n${t.objective}`);
    if (t.asset) md.push(`\n**Asset (${t.asset.type || "—"}):** ${t.asset.path ? "`" + t.asset.path + "`" : t.asset.note || "see guidelines"}`);
    if (t.gated) md.push(`\n> ⚠ **${t.gated}** — the suite will not auto-execute this; produce the asset, you launch it.`);
    if (t.guidelines && t.guidelines.length) { md.push(`\n**Execution playbook:**`); t.guidelines.forEach((g, i) => md.push(`${i + 1}. ${g}`)); }
    if (t.tools && t.tools.length) md.push(`\n_Tools: ${t.tools.join(", ")}_`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "gtm-roadmap.md"), md.join("\n") + "\n");

// ---------- HTML ----------
const card = (t) => {
  const [ic, lbl, col] = ownerOf(t.owner);
  const tags = [t.channel, t.effort, t.budget].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join("");
  const steps = (t.guidelines || []).map((g) => `<li>${esc(g)}</li>`).join("");
  const tools = (t.tools || []).length ? `<div class="tools">${t.tools.map((x) => `<span class="tool">${esc(x)}</span>`).join("")}</div>` : "";
  const asset = t.asset ? `<div class="asset"><b>Asset</b> · ${esc(t.asset.type || "")} ${t.asset.path ? `<code>${esc(t.asset.path)}</code>` : esc(t.asset.note || "see playbook")}</div>` : "";
  const gated = t.gated ? `<div class="gated">⚠ ${esc(t.gated)} — produce the asset, you launch it.</div>` : "";
  return `<div class="tc" data-owner="${t.owner || "human"}"><div class="tch"><span class="chk" onclick="this.classList.toggle('on');prog()">✓</span>
    <div><div class="tid">${esc(t.id || "")} <span class="own" style="color:${col}">${ic} ${lbl}</span></div>
    <div class="tt">${esc(t.title)}</div></div></div>
    <div class="tcb">${t.objective ? `<p class="obj">${esc(t.objective)}</p>` : ""}<div class="tags">${tags}</div>${asset}${gated}
    ${steps ? `<div class="pl">Execution playbook</div><ol>${steps}</ol>` : ""}${tools}${t.kpi ? `<div class="kpi">📈 ${esc(t.kpi)}</div>` : ""}</div>`;
};
const sec = phases.map((p) => `<section class="ph"><h2>${esc(p.name)} <span class="win">${esc(p.window || "")} ${p.budget ? "· " + esc(p.budget) : ""}</span></h2><div class="grid">${(p.tasks || []).map(card).join("")}</div></section>`).join("");
const html = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>GTM Roadmap — ${esc(r.product || "")}</title><style>
:root{--bg:#0b0e14;--p:#11161f;--ln:#1f2733;--ink:#e6edf3;--ink2:#aeb9c7;--dim:#6b7787;--ac:#7aa2ff;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--ink);font-family:-apple-system,"Segoe UI",Roboto,sans-serif;max-width:980px;margin:0 auto;padding:32px 22px 80px}
h1{font-size:25px;letter-spacing:-.4px}.sub{color:var(--dim);font:600 12px var(--mono);margin:6px 0 18px}
.bar{position:sticky;top:0;background:var(--bg);padding:10px 0;display:flex;gap:12px;align-items:center;z-index:5;border-bottom:1px solid var(--ln);margin-bottom:18px}
.track{flex:1;height:8px;background:var(--p);border:1px solid var(--ln);border-radius:99px;overflow:hidden}.fill{height:100%;width:0;background:linear-gradient(90deg,var(--ac),#22c55e);transition:width .3s}
.pct{font:700 13px var(--mono);min-width:46px}.fb{font:600 11px var(--mono);background:var(--p);border:1px solid var(--ln);color:var(--ink2);border-radius:7px;padding:5px 9px;cursor:pointer}.fb.on{border-color:var(--ac);color:var(--ink)}
.ph{margin:26px 0}.ph h2{font-size:16px;border-left:3px solid var(--ac);padding-left:10px}.win{font:600 11px var(--mono);color:var(--dim)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:13px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
.tc{background:var(--p);border:1px solid var(--ln);border-radius:12px;overflow:hidden}
.tch{display:flex;gap:10px;padding:13px 15px;border-bottom:1px solid var(--ln)}
.chk{width:20px;height:20px;border:2px solid var(--ln);border-radius:6px;color:transparent;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}.chk.on{background:#22c55e;border-color:#22c55e;color:#06240f}
.tid{font:600 10px var(--mono);color:var(--dim)}.own{font-weight:700}.tt{font-size:13.5px;font-weight:700;margin-top:2px}
.tcb{padding:13px 15px}.obj{font-size:12.5px;color:var(--ink2);line-height:1.6;margin-bottom:9px}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px}.tag{font:600 10px var(--mono);background:var(--bg);border:1px solid var(--ln);color:var(--ink2);border-radius:20px;padding:3px 9px}
.asset{font-size:12px;color:var(--ink2);margin-bottom:8px}.asset code{color:var(--ac);font-size:11px}
.gated{font-size:11.5px;color:#f0c674;background:#26210d;border:1px solid #463c10;border-radius:7px;padding:7px 10px;margin-bottom:9px}
.pl{font:700 10px var(--mono);letter-spacing:1px;text-transform:uppercase;color:var(--ac);margin:6px 0}ol{margin:0 0 8px 18px}ol li{font-size:12.5px;color:var(--ink2);line-height:1.6;margin-bottom:4px}
.tools{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.tool{font:600 10px var(--mono);background:var(--bg);border:1px solid var(--ln);border-radius:6px;padding:3px 8px;color:var(--ink2)}
.kpi{font:600 11px var(--mono);color:var(--dim);margin-top:6px}
</style></head><body>
<h1>Go-To-Market Roadmap — ${esc(r.product || "your product")}</h1>
<div class="sub">${esc((r.markets || []).join(" · "))} ${r.markets ? "·" : ""} ${esc(s.total_tasks || allTasks.length)} tasks · ${phases.length} phases · budget ${esc(s.budget_total || "—")}</div>
<div class="bar"><span class="track"><span class="fill" id=fill></span></span><span class="pct" id=pct>0%</span>
<span class="fb on" data-f=all onclick="flt(this)">all</span><span class="fb" data-f=suite onclick="flt(this)">🤖 suite</span><span class="fb" data-f=connector onclick="flt(this)">🔌 connector</span><span class="fb" data-f=human onclick="flt(this)">🧑 you</span></div>
${sec}
<script>
const tcs=[...document.querySelectorAll('.tc')];
function prog(){const n=tcs.filter(t=>t.querySelector('.chk').classList.contains('on')).length;const p=tcs.length?Math.round(n/tcs.length*100):0;document.getElementById('fill').style.width=p+'%';document.getElementById('pct').textContent=p+'%';}
function flt(b){document.querySelectorAll('.fb').forEach(x=>x.classList.remove('on'));b.classList.add('on');const f=b.dataset.f;tcs.forEach(t=>t.style.display=(f==='all'||t.dataset.owner===f)?'':'none');}
</script></body></html>`;
fs.writeFileSync(path.join(outDir, "gtm-roadmap.html"), html);

const counts = allTasks.reduce((a, t) => (a[t.owner || "human"] = (a[t.owner || "human"] || 0) + 1, a), {});
console.log(`gtm-roadmap: ${allTasks.length} tasks · ${phases.length} phases · owner ${JSON.stringify(counts)}`);
console.log(`wrote ${path.join(outDir, "gtm-roadmap.md")} + gtm-roadmap.html`);
if (!NO_OPEN) { try { const pl = process.platform, c = pl === "win32" ? "cmd" : pl === "darwin" ? "open" : "xdg-open", a = pl === "win32" ? ["/c", "start", "", path.join(outDir, "gtm-roadmap.html")] : [path.join(outDir, "gtm-roadmap.html")]; const ch = spawn(c, a, { detached: true, stdio: "ignore" }); ch.on("error", () => {}); ch.unref(); } catch {} }
process.exit(0);
