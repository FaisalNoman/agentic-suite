// Deploy stage D1 — go-live for static sites (zero-dep).
//
// Turns a built target (the app's dist, or an ACT landing page) into a LIVE URL.
// Defaults: GitHub Pages (zero extra auth) → auto-use Netlify/Vercel CLI if present.
// Static-only (D1); apps needing a server are flagged for D2. Gated + idempotent +
// verify-200; the orchestrator runs this behind per-action approval (ACT Phase 2).
//
// Subcommands:
//   plan   <targetDir>                 → detect static/server, build cmd, dist, connector, idempotency key (JSON; no side effects)
//   verify <url>                       → HTTP GET, expect 200 (exit 0 ok / 1 not)
//   launch [--act-dir act]            → (re)write LAUNCH.md from ACT-PLAN deploys + outputs
//   manual <targetDir> [--act-dir act] → write act/deploy/<name>.deploy.md with manual steps (degrade path)
// The actual deploy command is run by the orchestrator (build + connector) so auth/MCP is handled in-session;
// this script owns detection, idempotency, verify, and the LAUNCH/manual records — the deterministic parts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { execSync } from "node:child_process";

const cmd = process.argv[2] || "";
const rest = process.argv.slice(3);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d; };
const pos = rest.find((a) => !a.startsWith("--"));
const rj = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

// hash a dist dir's file manifest (names+sizes) → stable idempotency input
function distHash(dir) {
  if (!exists(dir)) return "prebuild";
  const files = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { try { files.push(path.relative(dir, f) + ":" + fs.statSync(f).size); } catch {} } } })(dir);
  files.sort();
  return crypto.createHash("sha1").update(files.join("|")).digest("hex").slice(0, 12);
}

function detect(target) {
  const pkg = rj(path.join(target, "package.json")) || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts || {};
  // server need: an express/fastify/koa/nest dep, or a server entrypoint, or next without static export
  const serverDep = /express|fastify|koa|@nestjs|hapi|next-server/i.test(Object.keys(deps).join(" "));
  const serverEntry = ["server.js", "server.mjs", "server.ts", "app.js", "index.js"].some((f) => exists(path.join(target, f)) && !exists(path.join(target, "index.html")));
  const isNext = !!deps.next;
  const nextStatic = isNext && /output\s*[:=]\s*["']export["']/.test((() => { try { return fs.readFileSync(path.join(target, "next.config.js"), "utf8") + fs.readFileSync(path.join(target, "next.config.mjs"), "utf8"); } catch { return ""; } })());
  const needsServer = serverDep || serverEntry || (isNext && !nextStatic);
  // dist dir: existing, else conventional by tool
  const distGuess = ["dist", "build", "out", "public"].find((d) => exists(path.join(target, d, "index.html")) || exists(path.join(target, d)));
  const tool = deps.vite ? "vite" : deps.next ? "next" : (deps["react-scripts"] ? "cra" : null);
  const dist = distGuess || (tool === "vite" ? "dist" : tool === "cra" ? "build" : tool === "next" ? "out" : "dist");
  const buildCmd = scripts.build ? "npm ci && npm run build" : (exists(path.join(target, "index.html")) ? null : null); // null = already static / no build
  const staticAlready = exists(path.join(target, "index.html")) && !scripts.build;
  return { needsServer, tool, dist, buildCmd, staticAlready };
}

function connector() {
  // orchestrator confirms via ToolSearch too; here just a CLI-presence hint
  const has = (c) => { try { execSync(process.platform === "win32" ? `where ${c}` : `command -v ${c}`, { stdio: "ignore" }); return true; } catch { return false; } };
  if (has("netlify")) return { name: "netlify-cli", cmd: "netlify deploy --prod --dir <dist>" };
  if (has("vercel")) return { name: "vercel-cli", cmd: "vercel --prod --cwd <dist>" };
  return { name: "github-pages", cmd: "npx gh-pages -d <dist>" }; // default, uses existing git auth
}

if (cmd === "plan") {
  if (!pos) { console.error("plan: need <targetDir>"); process.exit(2); }
  const target = path.resolve(process.cwd(), pos);
  const d = detect(target);
  const distPath = path.join(target, d.dist);
  const conn = connector();
  const key = "dep-" + crypto.createHash("sha1").update(`${pos}@${distHash(distPath)}`).digest("hex").slice(0, 12);
  const plan = {
    target: pos, needsServer: d.needsServer, static: !d.needsServer, tool: d.tool,
    build_cmd: d.staticAlready ? null : d.buildCmd, dist: d.dist, dist_exists: exists(distPath),
    connector: conn.name, command: conn.cmd.replace("<dist>", `${pos}/${d.dist}`.replace(/\\/g, "/")),
    idempotency_key: key,
    note: d.needsServer ? "NEEDS A SERVER → Deploy D2 (not built). Deploy static targets only; flag this one." : "static — D1 can deploy",
  };
  console.log(JSON.stringify(plan, null, 2));
  process.exit(d.needsServer ? 3 : 0);   // exit 3 = needs D2
}

if (cmd === "verify") {
  const url = pos; if (!url) { console.error("verify: need <url>"); process.exit(2); }
  const lib = url.startsWith("https") ? https : http;
  const req = lib.get(url, (res) => {
    const ok = res.statusCode >= 200 && res.statusCode < 400;
    console.log(JSON.stringify({ url, status: res.statusCode, ok }));
    res.resume(); process.exit(ok ? 0 : 1);
  });
  req.on("error", (e) => { console.log(JSON.stringify({ url, error: e.message, ok: false })); process.exit(1); });
  req.setTimeout(8000, () => { req.destroy(); console.log(JSON.stringify({ url, error: "timeout", ok: false })); process.exit(1); });
  // async — exits in the callbacks above; do not fall through to usage
}

if (cmd === "manual") {
  if (!pos) { console.error("manual: need <targetDir>"); process.exit(2); }
  const actDir = path.resolve(process.cwd(), opt("act-dir", "act"));
  const d = detect(path.resolve(process.cwd(), pos));
  const name = pos.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "target";
  const md = `# Deploy manually — ${pos}\n\nNo deploy connector was available/authed, so here are the steps:\n\n` +
    (d.staticAlready ? `This target is already static (\`${pos}/index.html\`).\n\n` : `1. Build: \`cd ${pos} && ${d.buildCmd || "npm ci && npm run build"}\` → produces \`${d.dist}/\`\n\n`) +
    `2. Deploy the \`${d.staticAlready ? pos : pos + "/" + d.dist}\` folder to a static host:\n` +
    `   - GitHub Pages: \`npx gh-pages -d ${d.staticAlready ? pos : pos + "/" + d.dist}\` (needs a git remote)\n` +
    `   - Netlify: \`netlify deploy --prod --dir ${d.staticAlready ? pos : pos + "/" + d.dist}\`\n` +
    `   - Vercel:  \`vercel --prod\`\n\n3. Note the live URL.\n`;
  fs.mkdirSync(path.join(actDir, "deploy"), { recursive: true });
  const out = path.join(actDir, "deploy", `${name}.deploy.md`);
  fs.writeFileSync(out, md);
  console.log(`wrote ${out.replace(/\\/g, "/")}`);
  process.exit(0);
}

if (cmd === "launch") {
  const actDir = path.resolve(process.cwd(), opt("act-dir", "act"));
  const plan = rj(path.join(actDir, "ACT-PLAN.json")) || {};
  const deploys = plan.deploys || [];
  const L = [`# Launch — ${plan.product || (rj(path.join(process.cwd(), "suite-state.json")) || {}).product || "your product"}`, ""];
  if (deploys.length) deploys.forEach((d) => L.push(`- ${d.verified ? "✅" : "⚠️ "} ${d.target}: ${d.url || "(not deployed)"}${d.verified ? "  (verified 200)" : ""}`));
  else L.push("- _No deploys yet._");
  // surface the other ACT outputs as remaining launch tasks
  const dels = plan.deliverables || [];
  const tweets = dels.find((d) => d.channel === "social"), emails = dels.find((d) => d.channel === "email");
  if (tweets) L.push(`- ☐ Tweets: ${(tweets.outputs || []).map((o) => o.path).join(", ") || "act/*.tweets.json"} — review + post`);
  if (emails) L.push(`- ☐ Emails: act/emails/ — review + send`);
  L.push(`- ☐ Analytics: not added`);
  fs.mkdirSync(path.dirname(path.join(process.cwd(), "LAUNCH.md")), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), "LAUNCH.md"), L.join("\n") + "\n");
  console.log("wrote LAUNCH.md");
  process.exit(0);
}

if (!["plan", "verify", "manual", "launch"].includes(cmd)) {
  console.error("usage: act-deploy.mjs plan <dir> | verify <url> | manual <dir> | launch [--act-dir act]");
  process.exit(2);
}
