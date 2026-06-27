// Open the live dashboard in the OS default browser — deterministic, one call.
//
// The server's own auto-open is unreliable when the server is started as a
// BACKGROUND process (its detached child often can't reach the user's desktop
// session). So the orchestrator starts the server with --no-open and then runs
// THIS as a single FOREGROUND Bash call — a foreground open reliably surfaces a
// window, and it's one cross-platform command instead of read-json + OS-branch.
//
// Usage:  node plan/dashboard/open-dashboard.mjs           (resolves ../state/dashboard.json)
//         node plan/dashboard/open-dashboard.mjs <url>     (open an explicit URL)
// Waits briefly for dashboard.json (the server writes it on listen). Prints the
// URL. Exit 0 on success (or after printing the URL to open manually), 1 if no URL.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DJSON = path.resolve(here, "..", "state", "dashboard.json");

function getUrl() {
  const explicit = process.argv[2];
  if (explicit && /^https?:\/\//.test(explicit)) return explicit;
  try { return JSON.parse(fs.readFileSync(DJSON, "utf8")).url || null; } catch { return null; }
}

// poll up to ~6s for the server to write dashboard.json
let tries = 0;
function go() {
  const url = getUrl();
  if (!url) {
    if (tries++ < 12) { setTimeout(go, 500); return; }
    console.error("open-dashboard: no dashboard.json url yet — start the server first, then open manually.");
    process.exit(1);
  }
  try {
    const plat = process.platform;
    const cmd = plat === "win32" ? "cmd" : plat === "darwin" ? "open" : "xdg-open";
    const args = plat === "win32" ? ["/c", "start", "", url] : [url];
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", (e) => console.error(`open-dashboard: auto-open failed (${e.message}) — open manually: ${url}`));
    child.unref();
  } catch (e) {
    console.error(`open-dashboard: ${e?.message} — open manually: ${url}`);
  }
  console.log(`Dashboard: ${url}`);
  process.exit(0);
}
go();
