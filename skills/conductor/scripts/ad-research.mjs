// Competitive-ad research renderer (zero-dep). Turns an ad-research JSON (worker-
// filled from Apify ad-library data) into a Markdown report + an interactive HTML
// board. Ranks ads by LONGEVITY (long-running = proven profitable) and surfaces
// the reusable patterns + recommended angles that feed ACT's ad-copy writer.
//
// Usage: node ad-research.mjs <ad-research.json|-> [--out-dir grow/outputs] [--no-open]
// Writes: <out-dir>/ad-research.md + ad-research.html   Exit: 0 ok · 2 bad spec

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const arg = process.argv[2];
const rest = process.argv.slice(3);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const noOpen = rest.includes("--no-open");
const outDir = path.resolve(process.cwd(), opt("out-dir", "grow/outputs"));
if (!arg) { console.error("usage: ad-research.mjs <ad-research.json|-> [--out-dir d] [--no-open]"); process.exit(2); }
let raw = ""; try { raw = arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(process.cwd(), arg), "utf8"); } catch { raw = arg; }
let r; try { r = JSON.parse(raw); } catch { console.error("bad ad-research JSON"); process.exit(2); }
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ads = (r.ads || []).slice().sort((a, b) => (b.longevity_days || 0) - (a.longevity_days || 0));
const proven = (a) => (a.longevity_days || 0) >= 30;   // running >= 1 month ≈ profitable

// ---------- Markdown ----------
const md = [`# Competitive Ad Research — ${r.product || "your product"}`];
if (r.niche) md.push(`**Niche:** ${r.niche}`);
md.push(`**${ads.length} ads · ${(r.competitors || []).length} competitors · sources: ${(r.sources || []).join(", ") || "—"}**`);
md.push(`> Data via ${r.generated_via || "manual"}. Long-running ads (≥30d) are flagged **proven** — a competitor keeps paying only for winners.`, "");
if ((r.angles || []).length) { md.push(`## ▶ Recommended angles (feed these to ACT ad-copy)`); r.angles.forEach((a, i) => md.push(`${i + 1}. **${a.angle}** — ${a.rationale || ""}${a.example_hook ? `  _hook: "${a.example_hook}"_` : ""}`)); md.push(""); }
if ((r.patterns || []).length) { md.push(`## Patterns that repeat`); r.patterns.forEach((p) => md.push(`- **${p.pattern}** (${p.evidence || ""}) — ${p.why_it_works || ""}`)); md.push(""); }
if ((r.gaps || []).length) { md.push(`## Gaps / wedges (no one is running this)`); r.gaps.forEach((g) => md.push(`- ${g}`)); md.push(""); }
md.push(`## Top ads (by longevity)`);
ads.forEach((a) => {
  md.push(`\n### ${a.advertiser || "—"} · ${a.platform || ""} · ${a.format || ""}${proven(a) ? "  ✅ proven (" + a.longevity_days + "d)" : a.longevity_days ? "  · " + a.longevity_days + "d" : ""}`);
  if (a.headline) md.push(`**${a.headline}**`);
  if (a.primary_text) md.push(`\n${a.primary_text}`);
  const meta = [a.cta && "CTA: " + a.cta, a.angle && "angle: " + a.angle, a.hook && "hook: " + a.hook].filter(Boolean);
  if (meta.length) md.push(`\n\`${meta.join("` · `")}\``);
  if (a.link) md.push(`\n[view ad ↗](${a.link})`);
});
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "ad-research.md"), md.join("\n") + "\n");

// ---------- HTML ----------
const adCard = (a) => `<div class="ad${proven(a) ? " pv" : ""}">
  <div class="adh"><span class="adv">${esc(a.advertiser || "—")}</span><span class="badges"><span class="b pl">${esc(a.platform || "")}</span><span class="b fmt">${esc(a.format || "")}</span>${a.longevity_days ? `<span class="b lng${proven(a) ? " on" : ""}">${proven(a) ? "✅ proven " : ""}${a.longevity_days}d</span>` : ""}</span></div>
  ${a.headline ? `<div class="hl">${esc(a.headline)}</div>` : ""}
  ${a.primary_text ? `<div class="pt">${esc(a.primary_text)}</div>` : ""}
  <div class="tags">${[a.cta && "CTA: " + a.cta, a.angle && a.angle, a.hook && "hook: " + a.hook].filter(Boolean).map((x) => `<span class="tg">${esc(x)}</span>`).join("")}</div>
  ${a.link ? `<a class="view" href="${esc(a.link)}" target="_blank">view ad ↗</a>` : ""}</div>`;
const angles = (r.angles || []).map((a, i) => `<div class="ang"><span class="n">${i + 1}</span><div><b>${esc(a.angle)}</b><div class="ar">${esc(a.rationale || "")}${a.example_hook ? ` · hook: "${esc(a.example_hook)}"` : ""}</div></div></div>`).join("");
const patterns = (r.patterns || []).map((p) => `<li><b>${esc(p.pattern)}</b> <span class="ev">${esc(p.evidence || "")}</span> — ${esc(p.why_it_works || "")}</li>`).join("");
const gaps = (r.gaps || []).map((g) => `<li>${esc(g)}</li>`).join("");
const html = `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Ad Research — ${esc(r.product || "")}</title><style>
:root{--bg:#0b0e14;--p:#11161f;--ln:#1f2733;--ink:#e6edf3;--ink2:#aeb9c7;--dim:#6b7787;--ac:#7aa2ff;--gr:#22c55e;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--ink);font-family:-apple-system,"Segoe UI",Roboto,sans-serif;max-width:1040px;margin:0 auto;padding:32px 22px 80px}
h1{font-size:24px}.sub{color:var(--dim);font:600 12px var(--mono);margin:6px 0 4px}.note{color:var(--ink2);font-size:13px;margin-bottom:22px}
.sec{font:700 11px var(--mono);letter-spacing:2px;text-transform:uppercase;color:var(--ac);margin:22px 0 10px}
.angwrap{background:color-mix(in srgb,var(--ac) 8%,var(--p));border:1px solid color-mix(in srgb,var(--ac) 30%,transparent);border-radius:12px;padding:14px 16px}
.ang{display:flex;gap:11px;padding:8px 0;border-bottom:1px solid var(--ln)}.ang:last-child{border:0}.ang .n{width:22px;height:22px;flex-shrink:0;border-radius:6px;background:var(--ac);color:#06122e;font:800 12px var(--mono);display:flex;align-items:center;justify-content:center}
.ang b{font-size:14px}.ar{font-size:12.5px;color:var(--ink2);margin-top:2px}
ul{margin:0 0 6px 20px}li{color:var(--ink2);font-size:13px;line-height:1.6;margin-bottom:5px}.ev{font:600 11px var(--mono);color:var(--dim)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
.ad{background:var(--p);border:1px solid var(--ln);border-radius:12px;padding:14px 15px}.ad.pv{border-color:color-mix(in srgb,var(--gr) 45%,transparent)}
.adh{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}.adv{font-weight:700;font-size:13.5px}
.badges{display:flex;gap:5px;flex-wrap:wrap}.b{font:600 10px var(--mono);border-radius:20px;padding:2px 8px;background:var(--bg);border:1px solid var(--ln);color:var(--ink2)}
.b.lng.on{background:color-mix(in srgb,var(--gr) 18%,var(--bg));border-color:var(--gr);color:var(--gr)}
.hl{font-size:14px;font-weight:700;margin-bottom:5px}.pt{font-size:12.5px;color:var(--ink2);line-height:1.55;margin-bottom:8px}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px}.tg{font:600 10px var(--mono);background:var(--bg);border:1px solid var(--ln);border-radius:6px;padding:3px 8px;color:var(--ink2)}
.view{font:600 11px var(--mono);color:var(--ac)}
</style></head><body>
<h1>Competitive Ad Research — ${esc(r.product || "your product")}</h1>
<div class="sub">${esc(r.niche || "")} · ${ads.length} ads · ${(r.competitors || []).length} competitors</div>
<div class="note">Sources: ${esc((r.sources || []).join(", ") || "—")} · via ${esc(r.generated_via || "manual")}. Ads running ≥30 days are flagged <b style="color:var(--gr)">proven</b> — competitors only keep paying for winners.</div>
${angles ? `<div class="sec">▶ Recommended angles → feed to ACT ad-copy</div><div class="angwrap">${angles}</div>` : ""}
${patterns ? `<div class="sec">Patterns that repeat</div><ul>${patterns}</ul>` : ""}
${gaps ? `<div class="sec">Gaps / wedges</div><ul>${gaps}</ul>` : ""}
<div class="sec">Top ads (by longevity)</div><div class="grid">${ads.map(adCard).join("") || "<p style=color:var(--dim)>No ads in data.</p>"}</div>
</body></html>`;
fs.writeFileSync(path.join(outDir, "ad-research.html"), html);

console.log(`ad-research: ${ads.length} ads · ${(r.angles || []).length} angles · ${ads.filter(proven).length} proven (≥30d) → ${path.join(outDir, "ad-research.md")} + .html`);
if (!noOpen) { try { const pl = process.platform, c = pl === "win32" ? "cmd" : pl === "darwin" ? "open" : "xdg-open", a = pl === "win32" ? ["/c", "start", "", path.join(outDir, "ad-research.html")] : [path.join(outDir, "ad-research.html")]; const ch = spawn(c, a, { detached: true, stdio: "ignore" }); ch.on("error", () => {}); ch.unref(); } catch {} }
process.exit(0);
