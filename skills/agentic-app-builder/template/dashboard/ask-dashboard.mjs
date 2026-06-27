// One-call dashboard ASK — write the prompt card AND block for the answer.
//
// This collapses the old two-step dance (hand-write a `prompt` into agents.json,
// THEN run wait-answer.mjs) into a single command. That matters for reliability:
// the SCRIPT writes the card, so the modal ALWAYS appears on the board — the
// orchestrator can no longer "forget" step 1 and silently fall back to the CLI.
// The orchestrator runs exactly one blocking Bash call per question/approval.
//
// Usage:
//   node plan/dashboard/ask-dashboard.mjs --id approve-plan --title "Approve the build plan?" \
//        --question "Open the Plan tab to review the flow. Start building?" \
//        --options "Approve,Change scope" --open-plan --timeout 600
//   (free-text answer if --options is omitted)
//
// IMPORTANT: run it as a Bash call with the tool timeout >= --timeout*1000 ms
//   (e.g. --timeout 600 → Bash timeout: 600000). The Bash default is 120000ms,
//   which would kill the wait at 2 min and force a false CLI fallback.
//
// Output (stdout, on success): the raw JSON value the user submitted.
// Exit: 0 = answered · 2 = timed out (→ orchestrator falls back to AskUserQuestion) · 3 = bad args

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.resolve(here, "..", "state", "agents.json");
const ANS = path.resolve(here, "..", "state", "answers.json");

// ── parse args ──
const a = process.argv.slice(2);
function opt(name) { const i = a.indexOf(`--${name}`); return i >= 0 ? a[i + 1] : undefined; }
const flag = (name) => a.includes(`--${name}`);
const id = opt("id");
const title = opt("title") || "Orchestrator needs your input";
const question = opt("question");
const optionsRaw = opt("options");
const openUrl = opt("open-url");
const openPlan = flag("open-plan");
const timeoutS = Number(opt("timeout")) || 600;
if (!id || !question) { console.error('usage: ask-dashboard.mjs --id <id> --question <q> [--title t] [--options "a,b"] [--open-plan] [--open-url u] [--timeout 600]'); process.exit(3); }
const options = optionsRaw ? optionsRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

// ── 1. write the prompt card into agents.json (merge, never clobber the rest) ──
function readState() { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; } }
function writeState(s) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }

const s0 = readState();
s0.prompt = { id, title, question, ...(options ? { options } : {}), ...(openPlan ? { openPlan: true } : {}), ...(openUrl ? { openUrl } : {}), answered: false };
writeState(s0);

// ── 2. poll answers.json until the user clicks (the orchestrator is blocked here
//        on this Bash call, so it cannot overwrite agents.json mid-wait → no race) ──
const deadline = Date.now() + timeoutS * 1000;
const POLL_MS = 500;

function finish(value) {
  // close the modal: mark the prompt answered so the board stops showing it
  const s = readState();
  if (s.prompt && s.prompt.id === id) { s.prompt.answered = true; writeState(s); }
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}

function check() {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(ANS, "utf8")); } catch { /* not written yet */ }
  if (store && Object.prototype.hasOwnProperty.call(store, id)) finish(store[id].value);
  if (Date.now() > deadline) {
    console.error(`ask-dashboard: timed out after ${timeoutS}s waiting for "${id}" — fall back to AskUserQuestion`);
    process.exit(2);
  }
  setTimeout(check, POLL_MS);
}
check();
