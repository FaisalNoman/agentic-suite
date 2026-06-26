// Blocking bridge: wait for a dashboard answer, then print it and exit.
// The orchestrator runs this as a Bash tool call AFTER writing a `prompt` card to
// agents.json. It blocks the turn until the page POSTs /answer (server writes
// plan/state/answers.json) — that blocking IS the "await" the session model can't
// do natively. On timeout it exits non-zero so the orchestrator falls back to the
// CLI AskUserQuestion.
//
// Usage:  node plan/dashboard/wait-answer.mjs <promptId> [timeoutSeconds=600]
// Output (stdout, on success): the raw JSON value the user submitted.
// Exit codes: 0 = answered · 2 = timed out · 3 = bad args

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ANS = path.resolve(here, "..", "state", "answers.json");

const id = process.argv[2];
const timeoutS = Number(process.argv[3]) || 600;
if (!id) { console.error("usage: wait-answer.mjs <promptId> [timeoutSeconds]"); process.exit(3); }

const deadline = Date.now() + timeoutS * 1000;
const POLL_MS = 500;

function check() {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(ANS, "utf8")); } catch { /* not written yet */ }
  if (store && Object.prototype.hasOwnProperty.call(store, id)) {
    // Print the value as JSON so the orchestrator can parse it deterministically.
    process.stdout.write(JSON.stringify(store[id].value));
    process.exit(0);
  }
  if (Date.now() > deadline) {
    console.error(`wait-answer: timed out after ${timeoutS}s waiting for "${id}"`);
    process.exit(2);
  }
  setTimeout(check, POLL_MS);
}
check();
