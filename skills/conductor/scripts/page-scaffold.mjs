// ACT page scaffolder (zero-dep). Generates the BOILERPLATE static pages that
// don't need a full build agent — privacy / terms / security / status / waitlist /
// pricing — as self-contained HTML under <outDir>. Covers the GTM roadmap's
// trust-architecture, waitlist, and pricing tasks cheaply; the complex app/landing
// still goes through Executor A (agentic-app-builder).
//
// Legal pages are TEMPLATES with placeholders + a visible review banner — they are
// a starting point, NOT legal advice. The spec author/founder must review with
// counsel before publishing.
//
// Usage: node page-scaffold.mjs <spec.json|-> [--no-open]
//   spec = { product, url?, company?, contact?, outDir?:"act/pages",
//            pages:[ {kind:"privacy|terms|security|status|waitlist|pricing", ...fields} ] }
//     pricing:  { tiers:[{name, price, period?, features:[], cta?, highlight?}] }
//     waitlist: { headline?, sub?, form_action?, placeholder? }
// Writes: <outDir>/<kind>.html (+ index.html) · Exit 0 ok · 2 bad spec

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const arg = process.argv[2];
const noOpen = process.argv.includes("--no-open");
if (!arg) { console.error("usage: page-scaffold.mjs <spec.json|-> [--no-open]"); process.exit(2); }
let raw = ""; try { raw = arg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(process.cwd(), arg), "utf8"); } catch { raw = arg; }
let spec; try { spec = JSON.parse(raw); } catch { console.error("bad spec JSON"); process.exit(2); }
const product = spec.product || "Your Product";
const company = spec.company || product;
const contact = spec.contact || "privacy@" + product.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com";
const url = spec.url || "";
const outDir = path.resolve(process.cwd(), spec.outDir || "act/pages");
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SHELL = (title, body, banner = "") => `<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(title)} — ${esc(product)}</title><style>
:root{--bg:#0b0e14;--p:#11161f;--ln:#1f2733;--ink:#e6edf3;--ink2:#aeb9c7;--dim:#6b7787;--ac:#7aa2ff;--mono:ui-monospace,Consolas,monospace}
*{box-sizing:border-box;margin:0;padding:0}body{background:var(--bg);color:var(--ink);font-family:-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.65;max-width:780px;margin:0 auto;padding:48px 24px 90px}
a{color:var(--ac)}h1{font-size:28px;letter-spacing:-.4px;margin-bottom:6px}h2{font-size:17px;margin:26px 0 8px}
.meta{color:var(--dim);font:600 12px var(--mono);margin-bottom:24px}p,li{color:var(--ink2);font-size:14.5px;margin-bottom:8px}ul{margin:0 0 8px 20px}
.banner{background:#26210d;border:1px solid #463c10;color:#f0c674;border-radius:9px;padding:12px 16px;font-size:13px;margin-bottom:26px}
.nav{margin-bottom:30px;font:600 12px var(--mono)}.nav a{margin-right:14px}
.card{background:var(--p);border:1px solid var(--ln);border-radius:13px;padding:22px}
</style></head><body><div class="nav"><a href="index.html">← ${esc(product)}</a></div>${banner}<h1>${esc(title)}</h1><div class="meta">${esc(product)} · last updated <em>[DATE]</em></div>${body}</body></html>`;

const LEGAL_BANNER = `<div class="banner">⚠ <b>Template — not legal advice.</b> Generated boilerplate with <code>[PLACEHOLDERS]</code>. Review with counsel and a generator (Termly/Iubenda) before publishing.</div>`;

function privacy() {
  return SHELL("Privacy Policy", `
<p>${esc(company)} ("we") operates ${esc(product)}${url ? " at " + esc(url) : ""}. This policy explains what we collect and why. It is written to map to GDPR, CCPA, and the Australian Privacy Act — confirm specifics with counsel.</p>
<h2>1. Data we collect</h2><ul><li>Account data: [email, name]</li><li>Usage data: [analytics events, device/browser]</li><li>Support data: [messages you send us]</li></ul>
<h2>2. How we use it</h2><ul><li>Provide and improve ${esc(product)}</li><li>Communicate about your account</li><li>Legal/security obligations</li></ul>
<h2>3. Sharing</h2><p>We do not sell personal data. We share with processors ([hosting, analytics, email]) under contract.</p>
<h2>4. Your rights</h2><p>Access, correction, deletion, portability, and objection. Contact <a href="mailto:${esc(contact)}">${esc(contact)}</a>. California (CCPA) and EU/UK (GDPR) residents have additional rights; Australian users are covered under the Privacy Act 1988.</p>
<h2>5. Retention & security</h2><p>We retain data while your account is active. Data is encrypted in transit (TLS) and at rest. Data residency: [region].</p>
<h2>6. Contact</h2><p><a href="mailto:${esc(contact)}">${esc(contact)}</a></p>`, LEGAL_BANNER);
}
function terms() {
  return SHELL("Terms of Service", `
<p>By using ${esc(product)} you agree to these terms. [Jurisdiction: governing law].</p>
<h2>1. The service</h2><p>${esc(product)} is provided on a subscription basis. Features may change.</p>
<h2>2. Accounts</h2><p>You are responsible for your account and credentials.</p>
<h2>3. Acceptable use</h2><p>No unlawful, abusive, or infringing use. [Add specifics].</p>
<h2>4. Subscriptions & cancellation</h2><p>Billing is [monthly/annual]. Cancel anytime; access continues to the end of the paid period. [Refund policy].</p>
<h2>5. Data ownership</h2><p>You own your data. We process it per the <a href="privacy.html">Privacy Policy</a>.</p>
<h2>6. Uptime & liability</h2><p>Target uptime [99.9%]. Service provided "as is"; liability limited to [amount/fees paid].</p>
<h2>7. Contact</h2><p><a href="mailto:${esc(contact)}">${esc(contact)}</a></p>`, LEGAL_BANNER);
}
function security() {
  return SHELL("Security", `
<div class="card"><p>${esc(product)} is built with security as a default. This page summarizes our posture — verify each claim is true before publishing.</p>
<h2>Encryption</h2><p>Data encrypted in transit (TLS 1.3) and at rest (AES-256).</p>
<h2>Infrastructure</h2><p>Hosted on [provider]; [region] data centers available for residency.</p>
<h2>Access control</h2><p>Least-privilege access; audit logging; [MFA] for staff.</p>
<h2>Compliance</h2><p>[SOC 2 in progress] · [HIPAA-aware architecture] · GDPR/CCPA/Australian Privacy Act aligned.</p>
<h2>Reporting</h2><p>Report issues to <a href="mailto:security@${esc(product.toLowerCase().replace(/[^a-z0-9]+/g, ""))}.com">security@…</a></p></div>`, `<div class="banner">⚠ <b>Only publish claims that are true.</b> Replace <code>[PLACEHOLDERS]</code> with your actual posture.</div>`);
}
function status() {
  return SHELL("Status", `<div class="card"><p style="font-size:18px;color:#22c55e;font-weight:700">● All systems operational</p><p>This is a static placeholder. For real uptime, use a hosted status page (Instatus/Better Uptime free tier) and link it here.</p><h2>Components</h2><ul><li>API — operational</li><li>Dashboard — operational</li><li>Notifications — operational</li></ul></div>`);
}
function waitlist(p) {
  const action = p.form_action || "https://formspree.io/f/REPLACE_ME";
  return SHELL(p.headline || `Join the ${product} waitlist`, `
<div class="card"><p style="font-size:16px">${esc(p.sub || `Be first to know when ${product} launches. No spam — one email at launch.`)}</p>
<form action="${esc(action)}" method="POST" style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
<input type="email" name="email" required placeholder="${esc(p.placeholder || "you@work.com")}" style="flex:1;min-width:220px;padding:12px 14px;border-radius:9px;border:1px solid var(--ln);background:var(--bg);color:var(--ink);font-size:14px">
<button type="submit" style="padding:12px 22px;border-radius:9px;border:0;background:var(--ac);color:#06122e;font-weight:700;font-size:14px;cursor:pointer">Notify me</button>
</form><p style="margin-top:12px;font-size:12px;color:var(--dim)">Wire <code>action</code> to Formspree/your endpoint to actually collect emails.</p></div>`);
}
function pricing(p) {
  const tiers = Array.isArray(p.tiers) ? p.tiers : [];
  const cards = tiers.map((t) => `<div class="card" style="${t.highlight ? "border-color:var(--ac)" : ""}">
    <div style="font:700 13px var(--mono);color:var(--dim);text-transform:uppercase;letter-spacing:1px">${esc(t.name)}</div>
    <div style="font-size:30px;font-weight:800;margin:8px 0">${esc(t.price)}<span style="font-size:13px;color:var(--dim);font-weight:500">${t.period ? "/" + esc(t.period) : ""}</span></div>
    <ul style="margin:14px 0">${(t.features || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    <a href="#" style="display:block;text-align:center;padding:11px;border-radius:9px;background:${t.highlight ? "var(--ac)" : "var(--bg)"};color:${t.highlight ? "#06122e" : "var(--ink)"};border:1px solid var(--ln);font-weight:700;text-decoration:none">${esc(t.cta || "Get started")}</a></div>`).join("");
  return SHELL("Pricing", `<p>Simple, transparent pricing for ${esc(product)}.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:20px">${cards || "<p>No tiers in spec.</p>"}</div>`);
}

const GEN = { privacy, terms, security, status, waitlist, pricing };
const pages = Array.isArray(spec.pages) ? spec.pages : [];
if (!pages.length) { console.error("no pages in spec"); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const written = [];
for (const pg of pages) {
  const kind = pg.kind; const fn = GEN[kind];
  if (!fn) { console.error(`skip unknown page kind: ${kind}`); continue; }
  const html = fn.length ? fn(pg) : fn();
  fs.writeFileSync(path.join(outDir, `${kind}.html`), html);
  written.push(kind);
}
// index linking the pages
const idx = SHELL(product + " — pages", `<div class="card"><p>Scaffolded pages:</p><ul>${written.map((k) => `<li><a href="${k}.html">${k}</a></li>`).join("")}</ul></div>`);
fs.writeFileSync(path.join(outDir, "index.html"), idx);
console.log(`page-scaffold: ${written.length} page(s) [${written.join(", ")}] → ${outDir.replace(/\\/g, "/")}`);
if (!noOpen) { try { const pl = process.platform, c = pl === "win32" ? "cmd" : pl === "darwin" ? "open" : "xdg-open", a = pl === "win32" ? ["/c", "start", "", path.join(outDir, "index.html")] : [path.join(outDir, "index.html")]; const ch = spawn(c, a, { detached: true, stdio: "ignore" }); ch.on("error", () => {}); ch.unref(); } catch {} }
process.exit(0);
