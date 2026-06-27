// ACT — scan GROW outputs into a deliverable list with a heuristic class guess.
//
// The conductor's ACT stage calls this first; it returns one entry per .md under
// the outputs dir with a title and a *heuristic* class (the orchestrator confirms
// + refines the class, then feeds the structured spec to act-build-artifacts.mjs).
//
// Usage:  node act-scan.mjs [outputsDir=grow/outputs]
// Output (stdout, JSON): { offered, deliverables:[{id,source,title,class_guess,channel_guess}] }
//   offered = true iff >=1 deliverable is software|publishable (the ACT gate).
// Exit: 0 always (offered=false simply means don't run ACT).

import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), process.argv[2] || "grow/outputs");

function walk(d, base, acc) {
  let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith(".") && e.name !== "node_modules") walk(full, base, acc); }
    else if (/\.md$/i.test(e.name) && e.name.toLowerCase() !== "showcase.md") {
      acc.push({ full, rel: path.relative(base, full).split(path.sep).join("/") });
    }
  }
}

function titleOf(text, rel) {
  const m = text.match(/^﻿?#\s+(.+)$/m);
  if (m) return m[1].trim();
  return rel.split("/").pop().replace(/\.md$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// heuristic class + channel — keyed on FILENAME + TITLE only (not body, which bleeds:
// a GTM plan that mentions "landing page" must not classify as software). The
// orchestrator refines per references/act-contract.md. Plan checked before software
// so a "go-to-market" plan that names build artifacts still reads as a plan.
function classify(rel, title) {
  const n = (rel + " " + (title || "")).toLowerCase();
  const planK = /\b(go[- ]?to[- ]?market|gtm|roadmap|strategy|launch[- ]?plan|plan|checklist)\b/;
  const software = /\b(landing[- ]?page|website|web ?app|microsite|signup form|widget|component|prototype|demo page)\b/;
  const social = /\b(tweets?|threads?|x post|linkedin post|social (post|copy))\b/;
  const email = /\b(emails?|outreach|cold email|newsletter|drip)\b/;
  const blog = /\b(blog|article|post draft|cms)\b/;
  if (planK.test(n))    return { class_guess: "plan", channel_guess: null };
  if (software.test(n)) return { class_guess: "software", channel_guess: null };
  if (social.test(n))   return { class_guess: "publishable", channel_guess: "social" };
  if (email.test(n))    return { class_guess: "publishable", channel_guess: "email" };
  if (blog.test(n))     return { class_guess: "publishable", channel_guess: "blog" };
  if (planK.test(n))    return { class_guess: "plan", channel_guess: null };
  return { class_guess: "plan", channel_guess: null };
}

const found = [];
walk(dir, dir, found);
found.sort((a, b) => a.rel.localeCompare(b.rel));

const deliverables = found.map((f, i) => {
  let text = ""; try { text = fs.readFileSync(f.full, "utf8"); } catch {}
  const title = titleOf(text, f.rel);
  const { class_guess, channel_guess } = classify(f.rel, title);
  return { id: `act-${String(i + 1).padStart(3, "0")}`, source: `grow/outputs/${f.rel}`, title, class_guess, channel_guess };
});

const offered = deliverables.some((d) => d.class_guess === "software" || d.class_guess === "publishable");
console.log(JSON.stringify({ offered, count: deliverables.length, deliverables }, null, 2));
