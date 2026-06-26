// Build the domain-agent registry (P6) for agentic-builder / intelli-agent.
//
// Scans every agents/<domain>/*.md, extracts YAML frontmatter, and writes
// agents/registry.json — the index a router uses to pick a specialist persona.
//
// Zero dependencies. Run from anywhere:  node agents/build-registry.mjs
// It resolves the agents/ dir relative to its own location.
//
// Frontmatter parsed: name, description, emoji, color (one line each, the format
// every agent file uses). The markdown body below the frontmatter is the persona
// that the router prepends into a general-purpose subagent at dispatch time —
// it is NOT duplicated into the registry (kept lean); only the file `path` is.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = here;                       // this script lives in agents/
const REPO_ROOT = path.resolve(here, "..");
const OUT = path.join(AGENTS_DIR, "registry.json");

// Non-agent dirs/files to skip (workflow examples, docs, this script, the output).
const SKIP_DIRS = new Set(["examples"]);
const SKIP_FILES = new Set(["README.md", "build-registry.mjs", "registry.json"]);

// Extract the frontmatter block (between the first pair of --- lines) → object.
// Single-line `key: value` pairs only (the agent files' format). Strips wrapping
// quotes. Returns null if there is no frontmatter (then the file is not an agent).
function parseFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = text.slice(3, end);
  const out = {};
  for (const line of block.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (!key) continue;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function walk(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      found.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith(".md") && !SKIP_FILES.has(entry.name)) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function build() {
  const files = walk(AGENTS_DIR);
  const agents = [];
  const skipped = [];
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, "utf8"); } catch { skipped.push(file); continue; }
    const fm = parseFrontmatter(text);
    if (!fm || !fm.name) { skipped.push(file); continue; }
    const rel = path.relative(REPO_ROOT, file).split(path.sep).join("/");
    const domain = path.relative(AGENTS_DIR, file).split(path.sep)[0]; // first dir under agents/
    agents.push({
      name: fm.name,
      domain,
      description: fm.description || "",
      emoji: fm.emoji || "",
      color: fm.color || "",
      path: rel,
    });
  }
  agents.sort((a, b) => (a.domain + a.name).localeCompare(b.domain + b.name));
  const domains = [...new Set(agents.map((a) => a.domain))].sort();
  const registry = {
    schema: 1,
    // Stamp is filled by the caller env if provided, else left null (Date is not
    // used here so the build is reproducible / diff-friendly).
    generated: process.env.AB_REGISTRY_STAMP || null,
    count: agents.length,
    domains,
    agents,
  };
  fs.writeFileSync(OUT, JSON.stringify(registry, null, 2) + "\n");
  return { count: agents.length, domains: domains.length, skipped: skipped.length };
}

const r = build();
console.log(`registry.json: ${r.count} agents across ${r.domains} domains (${r.skipped} non-agent files skipped) → ${path.relative(REPO_ROOT, OUT).split(path.sep).join("/")}`);
