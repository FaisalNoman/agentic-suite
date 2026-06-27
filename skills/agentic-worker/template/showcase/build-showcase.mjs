// Output showcase generator — zero dependencies.
//
// Scans an outputs directory for *.md deliverables, converts each to HTML at
// BUILD TIME (no CDN, no client-side markdown lib), and writes a single
// self-contained interactive showcase.html that works offline over file://.
//
// The page: searchable sidebar of every doc (grouped by sub-folder), a reading
// pane with a per-doc table of contents, theme toggle, and keyboard nav.
//
// Usage:  node build-showcase.mjs [outputsDir=outputs] [title]
// Output: <outputsDir>/showcase.html   (printed to stdout on success)
// Exit:   0 = wrote showcase · 1 = no markdown found · 2 = bad args

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ─────────────────────────── markdown → HTML ───────────────────────────
   Compact, dependency-free converter covering what agent-written reports use:
   ATX headings, paragraphs, bold/italic/strikethrough, inline + fenced code,
   ordered/unordered lists (one level of nesting), blockquotes, horizontal
   rules, GFM pipe tables, links, and images. Everything is HTML-escaped first;
   only the constructs below re-introduce markup. */

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
}

// Inline spans — run AFTER block-level escaping. Order matters (code first so
// its contents are not re-processed).
function inline(text) {
  const codes = [];
  let t = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `${codes.length - 1}`;
  });
  // images then links (image syntax is a superset prefix of links)
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (_, label, href) => `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
       .replace(/__([^_]+)__/g, "<strong>$1</strong>")
       .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
       .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>")
       .replace(/~~([^~]+)~~/g, "<del>$1</del>");
  t = t.replace(/(\d+)/g, (_, i) => codes[+i]); // restore code spans
  return t;
}

function parseTableRow(line) {
  return line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

// Returns { html, headings:[{id,text,level}] }
function mdToHtml(src) {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const headings = [];
  let i = 0;
  let para = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(escapeHtml(para.join(" ")))}</p>`); para = []; }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      flushPara();
      const lang = fence[1] || "";
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // closing fence
      out.push(`<pre data-lang="${lang}"><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); out.push("<hr>"); i++; continue; }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      const raw = h[2].replace(/\s+#+\s*$/, "").trim();
      let id = slugify(raw) || `h-${headings.length}`;
      if (headings.some((x) => x.id === id)) id = `${id}-${headings.length}`;
      headings.push({ id, text: raw, level });
      out.push(`<h${level} id="${id}">${inline(escapeHtml(raw))}</h${level}>`);
      i++; continue;
    }

    // blockquote (consecutive)
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(escapeHtml(buf.join(" ")))}</blockquote>`);
      continue;
    }

    // GFM table: header row + separator row of ---/:--
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && /-/.test(lines[i + 1])) {
      flushPara();
      const head = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== "") { rows.push(parseTableRow(lines[i])); i++; }
      const th = head.map((c) => `<th>${inline(escapeHtml(c))}</th>`).join("");
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join("")}</tr>`).join("");
      out.push(`<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`);
      continue;
    }

    // lists (ordered / unordered, one nesting level via indent ≥ 2 spaces)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flushPara();
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      let cur = null;
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        const indent = m[1].length;
        const text = inline(escapeHtml(m[3]));
        if (indent >= 2 && cur) { cur.sub = cur.sub || []; cur.sub.push(text); }
        else { cur = { text, sub: null }; items.push(cur); }
        i++;
      }
      const render = (it) => `<li>${it.text}${it.sub ? `<ul>${it.sub.map((s) => `<li>${s}</li>`).join("")}</ul>` : ""}</li>`;
      out.push(`<${tag}>${items.map(render).join("")}</${tag}>`);
      continue;
    }

    // blank line ends a paragraph
    if (line.trim() === "") { flushPara(); i++; continue; }

    // accumulate paragraph text
    para.push(line.trim());
    i++;
  }
  flushPara();
  return { html: out.join("\n"), headings };
}

/* ─────────────────────────── file collection ─────────────────────────── */

function walkMd(dir, base, acc) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      walkMd(full, base, acc);
    } else if (e.isFile() && /\.md$/i.test(e.name) && e.name.toLowerCase() !== "showcase.md") {
      acc.push({ full, rel: path.relative(base, full).split(path.sep).join("/") });
    }
  }
}

function titleFromDoc(rel, html, fallback) {
  const m = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (m) return m[1].replace(/<[^>]+>/g, "").trim();
  const baseName = rel.split("/").pop().replace(/\.md$/i, "");
  return baseName.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || fallback;
}

/* ─────────────────────────── HTML template ─────────────────────────── */

function buildHtml(title, docs) {
  // docs: [{ id, rel, group, title, html, headings, words }]
  const data = JSON.stringify(docs).replace(/</g, "\\u003c");
  const totalWords = docs.reduce((n, d) => n + d.words, 0);
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Showcase</title>
<style>
:root{
  --bg:#0b0e14; --panel:#11161f; --panel-2:#0e131b; --line:#1f2733; --line-2:#2a3441;
  --ink:#e6edf3; --ink-2:#aeb9c7; --dim:#6b7787; --accent:#7aa2ff; --accent-2:#9b8cff;
  --code-bg:#0a0f17; --mark:#3a2f00; --radius:14px; --radius-sm:9px;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
html[data-theme="light"]{
  --bg:#f6f8fc; --panel:#fff; --panel-2:#eef2f8; --line:#e2e8f0; --line-2:#cfd8e3;
  --ink:#10151c; --ink-2:#39434f; --dim:#7a8696; --code-bg:#f0f3f9; --mark:#fff3b0;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.65}
a{color:var(--accent);text-decoration:none} a:hover{text-decoration:underline}
.app{display:grid;grid-template-columns:300px 1fr;min-height:100vh}
/* sidebar */
aside{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--panel-2);border-right:1px solid var(--line);padding:18px 14px;display:flex;flex-direction:column;gap:12px}
.brand{display:flex;align-items:center;gap:9px;padding:2px 6px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));box-shadow:0 0 12px var(--accent)}
.brand h1{font-size:14px;margin:0;letter-spacing:.3px;font-weight:700}
.brand .sub{font-size:11px;color:var(--dim);margin-top:1px}
.search{position:relative}
.search input{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:var(--radius-sm);padding:9px 11px 9px 30px;font-size:13px;outline:none}
.search input:focus{border-color:var(--accent)}
.search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--dim)}
.nav{flex:1;overflow-y:auto;margin:0 -6px}
.grp{font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:var(--dim);padding:12px 10px 5px}
.nav a.item{display:block;padding:7px 10px;border-radius:8px;color:var(--ink-2);font-size:13.5px;cursor:pointer;border:1px solid transparent;line-height:1.35}
.nav a.item:hover{background:var(--panel);text-decoration:none;color:var(--ink)}
.nav a.item.active{background:color-mix(in srgb,var(--accent) 16%,transparent);border-color:color-mix(in srgb,var(--accent) 35%,transparent);color:var(--ink)}
.nav a.item .meta{display:block;font-size:11px;color:var(--dim);margin-top:1px}
.nav .none{padding:14px 10px;color:var(--dim);font-size:12.5px}
.foot{font-size:11px;color:var(--dim);border-top:1px solid var(--line);padding-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--ink-2);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn:hover{border-color:var(--accent);color:var(--ink)}
.btn svg{width:14px;height:14px}
/* main */
main{min-width:0;display:grid;grid-template-columns:1fr 220px;gap:0}
.reader{min-width:0;padding:40px 48px 120px;max-width:900px;margin:0 auto;width:100%}
.crumbs{font-size:12px;color:var(--dim);margin-bottom:6px;font-family:var(--mono)}
.doc h1,.doc h2,.doc h3,.doc h4,.doc h5,.doc h6{line-height:1.25;scroll-margin-top:24px;font-weight:700}
.doc h1{font-size:30px;margin:.2em 0 .5em;letter-spacing:-.4px}
.doc h2{font-size:22px;margin:1.5em 0 .5em;padding-bottom:.25em;border-bottom:1px solid var(--line)}
.doc h3{font-size:18px;margin:1.3em 0 .4em}
.doc h4{font-size:15.5px;margin:1.1em 0 .3em;color:var(--ink-2)}
.doc p{margin:.7em 0}
.doc ul,.doc ol{margin:.6em 0;padding-left:1.5em}
.doc li{margin:.25em 0}
.doc code{font-family:var(--mono);font-size:.88em;background:var(--code-bg);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.doc pre{background:var(--code-bg);border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px 16px;overflow-x:auto;margin:1em 0;position:relative}
.doc pre code{background:none;border:none;padding:0;font-size:13px;line-height:1.55}
.doc pre[data-lang]:not([data-lang=""])::before{content:attr(data-lang);position:absolute;top:8px;right:62px;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:1px}
.copy-btn{position:absolute;top:6px;right:8px;display:inline-flex;align-items:center;gap:5px;background:var(--panel);border:1px solid var(--line);color:var(--ink-2);border-radius:7px;padding:4px 8px;font-size:11px;font-family:var(--sans);cursor:pointer;opacity:0;transition:opacity .15s,border-color .15s,color .15s}
.doc pre:hover .copy-btn,.copy-btn:focus{opacity:1}
.copy-btn:hover{border-color:var(--accent);color:var(--ink)}
.copy-btn.ok{border-color:#3fb950;color:#3fb950}
.copy-btn svg{width:12px;height:12px}
.doc blockquote{margin:1em 0;padding:.4em 1em;border-left:3px solid var(--accent);background:var(--panel);border-radius:0 8px 8px 0;color:var(--ink-2)}
.doc hr{border:none;border-top:1px solid var(--line);margin:2em 0}
.doc img{max-width:100%;border-radius:8px;border:1px solid var(--line)}
.doc .tbl{overflow-x:auto;margin:1em 0}
.doc table{border-collapse:collapse;width:100%;font-size:13.5px}
.doc th,.doc td{border:1px solid var(--line);padding:8px 11px;text-align:left}
.doc th{background:var(--panel);font-weight:700}
.doc tr:nth-child(even) td{background:color-mix(in srgb,var(--panel) 50%,transparent)}
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 2px}
/* TOC */
.toc{position:sticky;top:0;align-self:start;height:100vh;overflow-y:auto;padding:40px 18px;border-left:1px solid var(--line)}
.toc .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:var(--dim);margin-bottom:8px}
.toc a{display:block;font-size:12.5px;color:var(--ink-2);padding:3px 0 3px 10px;border-left:2px solid var(--line);cursor:pointer;line-height:1.4}
.toc a:hover{color:var(--ink);text-decoration:none;border-color:var(--accent-2)}
.toc a.active{color:var(--accent);border-color:var(--accent)}
.toc a.lvl3{padding-left:22px;font-size:12px} .toc a.lvl4{padding-left:34px;font-size:11.5px;color:var(--dim)}
.toc .none{font-size:12px;color:var(--dim)}
@media (max-width:1100px){ main{grid-template-columns:1fr} .toc{display:none} }
@media (max-width:760px){ .app{grid-template-columns:1fr} aside{position:static;height:auto} .reader{padding:24px 18px 80px} }
@media print{ aside,.toc,.crumbs{display:none} .app,main{display:block} .reader{max-width:none;padding:0} }
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--line-2);border-radius:6px}::-webkit-scrollbar-track{background:transparent}
</style>
</head>
<body>
<div class="app">
  <aside>
    <div class="brand"><span class="dot"></span><div><h1>${escapeHtml(title)}</h1><div class="sub" id="sub"></div></div></div>
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="q" type="search" placeholder="Search documents…  ( / )" autocomplete="off">
    </div>
    <nav class="nav" id="nav"></nav>
    <div class="foot">
      <span id="stat"></span>
      <span style="display:flex;gap:6px">
        <button class="btn" id="print" title="Print / Save as PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/></svg></button>
        <button class="btn" id="theme" title="Toggle theme"><svg id="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></svg></button>
      </span>
    </div>
  </aside>
  <main>
    <div class="reader"><div class="crumbs" id="crumbs"></div><article class="doc" id="doc"></article></div>
    <div class="toc"><div class="lbl">On this page</div><div id="toc"></div></div>
  </main>
</div>
<script>
const DOCS = ${data};
const $ = (id) => document.getElementById(id);
const SUN='<path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>';
const MOON='<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z"/>';
let current=null;

function fmtWords(n){ return n>=1000?(n/1000).toFixed(1)+'k':String(n); }

function buildNav(filter){
  const nav=$("nav"); nav.innerHTML="";
  const f=(filter||"").toLowerCase().trim();
  const groups={};
  let shown=0;
  DOCS.forEach(d=>{
    if(f && !(d.title.toLowerCase().includes(f) || d.rel.toLowerCase().includes(f) || d.text.includes(f))) return;
    (groups[d.group]=groups[d.group]||[]).push(d); shown++;
  });
  const keys=Object.keys(groups).sort();
  if(!shown){ nav.innerHTML='<div class="none">No documents match.</div>'; return; }
  keys.forEach(g=>{
    if(keys.length>1 || g!=="") { const h=document.createElement("div"); h.className="grp"; h.textContent=g||"Root"; nav.appendChild(h); }
    groups[g].forEach(d=>{
      const a=document.createElement("a"); a.className="item"+(current===d.id?" active":""); a.dataset.id=d.id;
      a.innerHTML='<span>'+escapeText(d.title)+'</span><span class="meta">'+escapeText(d.rel)+' · '+fmtWords(d.words)+' words</span>';
      a.onclick=()=>{ show(d.id); };
      nav.appendChild(a);
    });
  });
}
function escapeText(s){ const e=document.createElement("div"); e.textContent=s; return e.innerHTML; }

function buildToc(d){
  const toc=$("toc"); toc.innerHTML="";
  const hs=d.headings.filter(h=>h.level>=1 && h.level<=4);
  if(hs.length<2){ toc.innerHTML='<div class="none">—</div>'; return; }
  hs.forEach(h=>{ const a=document.createElement("a"); a.textContent=h.text; a.className="lvl"+h.level; a.dataset.target=h.id;
    a.onclick=()=>{ const el=document.getElementById(h.id); if(el)el.scrollIntoView({behavior:"smooth",block:"start"}); };
    toc.appendChild(a); });
}

function show(id){
  const d=DOCS.find(x=>x.id===id); if(!d)return;
  current=id;
  $("crumbs").textContent=d.rel;
  $("doc").innerHTML=d.html;
  addCopyButtons();
  buildToc(d);
  buildNav($("q").value);
  document.querySelector("main").scrollTop=0; window.scrollTo(0,0);
  location.hash=encodeURIComponent(id);
  observeHeadings(d);
}

const COPY_IC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
const OK_IC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12 5 5L20 6"/></svg>';
function addCopyButtons(){
  document.querySelectorAll("#doc pre").forEach(pre=>{
    if(pre.querySelector(".copy-btn"))return;
    const code=pre.querySelector("code"); if(!code)return;
    const b=document.createElement("button"); b.className="copy-btn"; b.type="button";
    b.innerHTML=COPY_IC+"<span>Copy</span>";
    b.onclick=async()=>{
      const txt=code.innerText;
      try{ await navigator.clipboard.writeText(txt); }
      catch(_){ const ta=document.createElement("textarea"); ta.value=txt; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(__){} ta.remove(); }
      b.classList.add("ok"); b.innerHTML=OK_IC+"<span>Copied</span>";
      setTimeout(()=>{ b.classList.remove("ok"); b.innerHTML=COPY_IC+"<span>Copy</span>"; },1500);
    };
    pre.appendChild(b);
  });
}

let _obs=null;
function observeHeadings(d){
  if(_obs)_obs.disconnect();
  const links=[...document.querySelectorAll("#toc a")];
  if(!links.length)return;
  _obs=new IntersectionObserver(es=>{
    es.forEach(e=>{ if(e.isIntersecting){ const id=e.target.id;
      links.forEach(l=>l.classList.toggle("active", l.dataset.target===id)); } });
  },{rootMargin:"0px 0px -75% 0px"});
  d.headings.forEach(h=>{ const el=document.getElementById(h.id); if(el)_obs.observe(el); });
}

function applyTheme(t){ document.documentElement.dataset.theme=t; $("ti").innerHTML=t==="light"?SUN:MOON; try{localStorage.setItem("showcase-theme",t);}catch(_){} }

// init
(function(){
  const words=DOCS.reduce((n,d)=>n+d.words,0);
  $("sub").textContent=DOCS.length+" document"+(DOCS.length!==1?"s":"");
  $("stat").textContent=fmtWords(words)+" words";
  let t="dark"; try{t=localStorage.getItem("showcase-theme")||"dark";}catch(_){} applyTheme(t);
  $("theme").onclick=()=>applyTheme(document.documentElement.dataset.theme==="light"?"dark":"light");
  $("print").onclick=()=>window.print();
  $("q").addEventListener("input",()=>buildNav($("q").value));
  document.addEventListener("keydown",e=>{ if(e.key==="/"&&document.activeElement!==$("q")){e.preventDefault();$("q").focus();}
    if(e.key==="Escape"){ $("q").value=""; buildNav(""); $("q").blur(); } });
  buildNav("");
  const hash=decodeURIComponent(location.hash.slice(1));
  show(DOCS.some(d=>d.id===hash)?hash:DOCS[0].id);
})();
</script>
</body>
</html>`;
}

/* ─────────────────────────── main ─────────────────────────── */

const here = path.dirname(fileURLToPath(import.meta.url));
const rawArgs = process.argv.slice(2);
const NO_OPEN = rawArgs.includes("--no-open");
const pos = rawArgs.filter((a) => !a.startsWith("--"));
const argDir = pos[0] || "outputs";
const outputsDir = path.isAbsolute(argDir) ? argDir : path.resolve(process.cwd(), argDir);
const title = pos[1] || path.basename(path.resolve(outputsDir, "..")) || "Deliverables";

const found = [];
walkMd(outputsDir, outputsDir, found);
if (!found.length) {
  console.error(`build-showcase: no .md files under ${outputsDir}`);
  process.exit(1);
}
// Stable, readable order: root files first, then by path.
found.sort((a, b) => {
  const da = a.rel.includes("/"), db = b.rel.includes("/");
  if (da !== db) return da ? 1 : -1;
  return a.rel.localeCompare(b.rel);
});

const docs = found.map((f, idx) => {
  let raw = "";
  try { raw = fs.readFileSync(f.full, "utf8"); } catch { raw = ""; }
  // strip a leading YAML frontmatter block if present
  raw = raw.replace(/^﻿?---\n[\s\S]*?\n---\n/, "");
  const { html, headings } = mdToHtml(raw);
  const group = f.rel.includes("/") ? f.rel.split("/").slice(0, -1).join("/") : "";
  const words = (raw.match(/\S+/g) || []).length;
  const docTitle = titleFromDoc(f.rel, html, `Document ${idx + 1}`);
  // lowercased plain text for client-side search
  const text = raw.toLowerCase().replace(/\s+/g, " ");
  return { id: `doc-${idx}`, rel: f.rel, group, title: docTitle, html, headings, words, text };
});

const outFile = path.join(outputsDir, "showcase.html");
fs.writeFileSync(outFile, buildHtml(title, docs), "utf8");
console.log(outFile);

// Auto-open in the OS default browser once ready (suppress with --no-open).
// file:// page, so it must be opened by the OS, not navigated to from a tab.
function openInBrowser(file) {
  if (NO_OPEN) { console.log("(auto-open suppressed: --no-open)"); return; }
  try {
    const plat = process.platform;
    const cmd = plat === "win32" ? "cmd" : plat === "darwin" ? "open" : "xdg-open";
    const args = plat === "win32" ? ["/c", "start", "", file] : [file];
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", (e) => console.error(`(auto-open failed: ${e.message} — open manually: ${file})`));
    child.unref();
  } catch (e) {
    console.error(`(auto-open unavailable: ${e?.message} — open manually: ${file})`);
  }
}
openInBrowser(outFile);
