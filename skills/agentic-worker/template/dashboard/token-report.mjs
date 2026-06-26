// Real token accounting for the swarm dashboard.
//
// The orchestrator runs in-session under Claude Code, so the only ground-truth
// token ledger is the session transcript JSONL that Claude Code writes to
//   ~/.claude/projects/<slug>/*.jsonl
// where <slug> is the project root path with every non-alphanumeric char → "-".
// Each assistant line carries message.usage {input_tokens, output_tokens,
// cache_creation_input_tokens, cache_read_input_tokens}.
//
// "Snapshot start → end": pass the run's startedAt ISO as `sinceISO`; we sum the
// usage of every assistant message stamped at/after that instant across the
// project's transcripts (main session + any subagent sidechains in the same
// project dir). The delta from the empty baseline at start IS the spend.
//
// Zero dependencies. Safe to import (computeTokens) or run as a CLI:
//   node token-report.mjs <projectRoot> [sinceISO]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function projectSlug(cwd) {
  return String(cwd || "").replace(/[^a-zA-Z0-9]/g, "-");
}

export function transcriptDir(projectRoot) {
  return path.join(os.homedir(), ".claude", "projects", projectSlug(projectRoot));
}

// Sum usage across all *.jsonl in the project's transcript dir.
// `sinceISO` (optional) restricts to messages at/after that timestamp — the
// run-start snapshot, so prior history and other runs don't leak in.
// Returns { in, out, total } or null if no transcript dir exists.
export function computeTokens(projectRoot, sinceISO) {
  const dir = transcriptDir(projectRoot);
  let files;
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); }
  catch { return null; }
  if (!files.length) return null;

  let sinceMs = sinceISO ? Date.parse(sinceISO) : 0;
  if (Number.isNaN(sinceMs)) sinceMs = 0;

  let inp = 0, out = 0;
  for (const f of files) {
    let txt;
    try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
    for (const line of txt.split("\n")) {
      if (!line || line[0] !== "{") continue;
      let j;
      try { j = JSON.parse(line); } catch { continue; }
      const u = j && j.message && j.message.usage;
      if (!u) continue;
      if (sinceMs) {
        const t = Date.parse(j.timestamp || "");
        if (!Number.isNaN(t) && t < sinceMs) continue;
      }
      // input side bills fresh input + cache creation + (cheap) cache reads —
      // include all three so the figure reflects true throughput, like ccusage.
      inp += (Number(u.input_tokens) || 0)
           + (Number(u.cache_read_input_tokens) || 0)
           + (Number(u.cache_creation_input_tokens) || 0);
      out += Number(u.output_tokens) || 0;
    }
  }
  return { in: inp, out, total: inp + out };
}

// CLI — guard works cross-platform (Windows file:// URL vs backslash argv path)
if (process.argv[1] &&
    path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const [, , root, since] = process.argv;
  const r = computeTokens(root || process.cwd(), since);
  console.log(JSON.stringify(r));
}
