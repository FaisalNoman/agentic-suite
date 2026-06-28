// Unified suite dashboard (U1) — thin aggregator over BUILD / GROW / ACT.
// Zero-dependency. One URL + one timeline across all phases; the per-phase boards
// (:4317 / :4318) keep running for deep views — this overlays a combined picture.
//
// Runs from <suiteRoot>/suite-dashboard/server.mjs; reads sibling phase state:
//   build/plan/state · grow/plan/state · act/ACT-PLAN.json
// Serves: /suite-state (merged JSON, SSE on /events) · /timeline (merged events) · index.html
// Usage: node suite-dashboard/server.mjs [port=4316] [--no-open]

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");                 // suite working root (build/ grow/ act/ are siblings)
const HTML = path.join(here, "index.html");
const args = process.argv.slice(2);
const PORT = Number(args.find((a) => /^\d+$/.test(a))) || 4316;
const NO_OPEN = args.includes("--no-open");
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

function phaseSummary(key, dir) {
  const st = rj(path.join(ROOT, dir, "agents.json"));
  const fw = rj(path.join(ROOT, dir, "framework-state.json"));
  const dash = rj(path.join(ROOT, dir, "dashboard.json"));
  if (!st && !fw && !dash) return { key, present: false };
  const agents = (st && st.agents) || [];
  const c = { working: 0, done: 0, blocked: 0, total: agents.length };
  agents.forEach((a) => { if (a.status === "working") c.working++; else if (a.status === "done") c.done++; else if (a.status === "blocked") c.blocked++; });
  const tok = st && st.tokens && typeof st.tokens === "object" ? st.tokens : null;
  return { key, present: true, stage: (fw && fw.stage) || (st && st.phase) || null, url: dash && dash.url || null, counts: c, tokens: tok };
}

function actSummary() {
  const p = rj(path.join(ROOT, "act", "ACT-PLAN.json"));
  if (!p) return { key: "ACT", present: false };
  const s = p.summary || {};
  return { key: "ACT", present: true, stage: "act", url: null,
    counts: { total: s.total || 0, done: (p.deliverables || []).filter((d) => d.status === "done").length, working: 0, blocked: 0 },
    pending_approval: s.pending_approval || [], by_executor: s.by_executor || {} };
}

function suiteState() {
  const suite = rj(path.join(ROOT, "suite-state.json")) || {};
  const phases = [phaseSummary("BUILD", "build/plan/state"), phaseSummary("GROW", "grow/plan/state"), actSummary()];
  let tin = 0, tout = 0, ttot = 0, measured = false;
  phases.forEach((p) => { if (p.tokens) { tin += p.tokens.in || 0; tout += p.tokens.out || 0; ttot += p.tokens.total || 0; if (p.tokens.measured) measured = true; } });
  return JSON.stringify({ phase: suite.phase || null, needs: { build: suite.needs_build, grow: suite.needs_grow, act: suite.needs_act },
    phases, tokens: ttot ? { in: tin, out: tout, total: ttot, measured } : null, updated: new Date().toISOString() });
}

// merged, phase-tagged events for the unified Replay
function timeline() {
  const out = [];
  for (const [key, f] of [["BUILD", "build/plan/state/events.jsonl"], ["GROW", "grow/plan/state/events.jsonl"]]) {
    let txt = ""; try { txt = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
    txt.split("\n").forEach((l) => { l = l.trim(); if (l[0] !== "{") return; try { const e = JSON.parse(l); e.phase = key; out.push(e); } catch {} });
  }
  out.sort((a, b) => (a.t || "").localeCompare(b.t || "") || (a.seq || 0) - (b.seq || 0));
  return out.map((e) => JSON.stringify(e)).join("\n");
}

function openBrowser(url) {
  if (NO_OPEN) return;
  try { const plat = process.platform; const cmd = plat === "win32" ? "cmd" : plat === "darwin" ? "open" : "xdg-open";
    const a = plat === "win32" ? ["/c", "start", "", url] : [url]; const ch = spawn(cmd, a, { detached: true, stdio: "ignore" }); ch.on("error", () => {}); ch.unref(); } catch {}
}

const clients = new Set();
let last = "";
setInterval(() => { const s = suiteState(); if (s !== last) { last = s; for (const r of clients) { try { r.write(`data: ${s.replace(/\n/g, " ")}\n\n`); } catch { clients.delete(r); } } } }, 700);

const server = http.createServer((req, res) => {
  try {
    if (req.url === "/events") { res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); res.write(`data: ${suiteState().replace(/\n/g, " ")}\n\n`); clients.add(res); const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch {} }, 15000); req.on("close", () => { clearInterval(ka); clients.delete(res); }); return; }
    if (req.url === "/suite-state") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(suiteState()); return; }
    if (req.url === "/timeline") { res.writeHead(200, { "Content-Type": "application/x-ndjson" }); res.end(timeline()); return; }
    res.writeHead(200, { "Content-Type": "text/html" }); res.end(fs.readFileSync(HTML));
  } catch (e) { try { res.writeHead(500); res.end(String(e?.message || e)); } catch {} }
});

function isFree(p) { return new Promise((r) => { const t = net.createServer(); t.once("error", () => r(false)); t.once("listening", () => t.close(() => r(true))); t.listen(p, "0.0.0.0"); }); }
(async () => { let port = PORT; for (let i = 0; i < 50; i++) { if (await isFree(port)) break; port++; }
  server.listen(port, () => { const url = `http://localhost:${port}`; console.log(`Suite dashboard: ${url} (BUILD+GROW+ACT)`);
    try { fs.writeFileSync(path.join(ROOT, "suite-dashboard.json"), JSON.stringify({ port, url, pid: process.pid }, null, 2)); } catch {}
    setTimeout(() => openBrowser(url), 300); });
})();
setInterval(() => {}, 1 << 30);
