// Verify-it-runs — post-build smoke check (zero-dep).
//
// "Built code on disk" ≠ "it runs". After BUILD, this detects how to start the
// app + which port it serves, so the orchestrator can boot it and confirm it
// actually responds (HTTP 200) — the founder never debugs setup. The boot itself
// is orchestrator-run (it needs to spawn npm in-session); this owns the
// deterministic detection + the HTTP probe.
//
//   plan  <dir>   → { install, build, start, port, url } (JSON; no side effects)
//   probe <url>   → HTTP 200 (exit 0 ok / 1 not)
// Exit: plan 0 (4 = no runnable start detected) · probe 0/1 · bad args 2

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";

const cmd = process.argv[2] || "";
const pos = process.argv[3];
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

if (cmd === "plan") {
  if (!pos) { console.error("plan: need <dir>"); process.exit(2); }
  const dir = path.resolve(process.cwd(), pos);
  const pkg = rj(path.join(dir, "package.json")) || {};
  const s = pkg.scripts || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const install = exists(path.join(dir, "package-lock.json")) ? "npm ci" : "npm install";
  const build = s.build ? "npm run build" : null;
  // prefer a production-ish start, then preview, then dev
  const startScript = s.start ? "start" : s.preview ? "preview" : s.dev ? "dev" : null;
  const start = startScript ? `npm run ${startScript}` : null;
  // best-effort default port by tool / script
  const tool = deps.next ? "next" : deps.vite ? "vite" : deps["react-scripts"] ? "cra" : (/express|fastify|koa/i.test(Object.keys(deps).join(" ")) ? "node-server" : null);
  const portByTool = { next: 3000, vite: startScript === "preview" ? 4173 : 5173, cra: 3000, "node-server": Number((pkg.config && pkg.config.port) || process.env.PORT || 3000) };
  const port = portByTool[tool] || 3000;
  const out = { dir: pos, install, build, start, start_script: startScript, tool, port, url: `http://localhost:${port}`,
    runnable: !!start, note: start ? "boot then probe the url" : "no start/preview/dev script — likely a static bundle (open dist/index.html) or a library (skip smoke check)" };
  console.log(JSON.stringify(out, null, 2));
  process.exit(start ? 0 : 4);
}

if (cmd === "probe") {
  const url = pos; if (!url) { console.error("probe: need <url>"); process.exit(2); }
  const lib = url.startsWith("https") ? https : http;
  const req = lib.get(url, (res) => { const ok = res.statusCode >= 200 && res.statusCode < 500; console.log(JSON.stringify({ url, status: res.statusCode, ok })); res.resume(); process.exit(ok ? 0 : 1); });
  req.on("error", (e) => { console.log(JSON.stringify({ url, error: e.message, ok: false })); process.exit(1); });
  req.setTimeout(8000, () => { req.destroy(); console.log(JSON.stringify({ url, error: "timeout", ok: false })); process.exit(1); });
}
else if (cmd !== "plan") { console.error("usage: smoke-check.mjs plan <dir> | probe <url>"); process.exit(2); }
