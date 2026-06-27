// Install the agentic-suite opt-in hooks pack into a settings.json.
//
// Zero dependency, idempotent, reversible (see uninstall-hooks.mjs). Merges the
// Core-3 hook entries (config-protection, dangerous-bash, circuit-breaker) into
// the chosen settings file WITHOUT clobbering existing hooks — it removes any
// prior agentic-suite entries first (matched by the suite-hook.mjs path), then
// re-adds, so re-running is safe.
//
// Usage:  node install-hooks.mjs [--scope project|user] [--print]
//   --scope project (default) → ./.claude/settings.json   (contained to this repo)
//   --scope user              → ~/.claude/settings.json    (global, every project)
//   --print                   → show what would change, write nothing
//
// The hooks are DORMANT unless a suite run is active in the cwd, so even the
// user scope is inert outside an agentic-suite build.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// hooks live at <conductor-base>/hooks/suite-hook.mjs ; this script at <base>/scripts/
const HOOK = path.resolve(here, "..", "hooks", "suite-hook.mjs").split(path.sep).join("/");

const args = process.argv.slice(2);
const scope = args.includes("--scope") ? (args[args.indexOf("--scope") + 1] || "project") : "project";
const printOnly = args.includes("--print");

const settingsPath = scope === "user"
  ? path.join(os.homedir(), ".claude", "settings.json")
  : path.join(process.cwd(), ".claude", "settings.json");

const cmd = (name) => `node "${HOOK}" ${name}`;
const isOurs = (h) => h && h.hooks && h.hooks.some((x) => typeof x.command === "string" && x.command.includes("suite-hook.mjs"));

const WANT = {
  PreToolUse: [
    { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: cmd("config-protection") }] },
    { matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: cmd("protect-state") }] },
    { matcher: "Bash", hooks: [{ type: "command", command: cmd("dangerous-bash") }] },
  ],
  PostToolUse: [
    { matcher: "*", hooks: [{ type: "command", command: cmd("circuit-breaker") }] },
    { matcher: "*", hooks: [{ type: "command", command: cmd("cost-persist") }] },
  ],
  SessionStart: [
    { hooks: [{ type: "command", command: cmd("state-verify") }] },
  ],
  PreCompact: [
    { hooks: [{ type: "command", command: cmd("precompact-snapshot") }] },
  ],
};

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch { /* new file */ }
if (!settings.hooks || typeof settings.hooks !== "object") settings.hooks = {};

for (const [event, entries] of Object.entries(WANT)) {
  const existing = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
  const kept = existing.filter((h) => !isOurs(h)); // drop prior suite entries (idempotent)
  settings.hooks[event] = [...kept, ...entries];
}

const out = JSON.stringify(settings, null, 2);
if (printOnly) {
  console.log(`# would write ${settingsPath}\n`);
  console.log(out);
  process.exit(0);
}
fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, out);
console.log(`agentic-suite hooks installed → ${settingsPath}`);
console.log(`  PreToolUse: config-protection, protect-state (Edit/Write), dangerous-bash (Bash)`);
console.log(`  PostToolUse: circuit-breaker, cost-persist (*)`);
console.log(`  SessionStart: state-verify   PreCompact: precompact-snapshot`);
console.log(`  dispatcher: ${HOOK}`);
console.log(`  dormant unless a suite run is active. Remove with: node uninstall-hooks.mjs --scope ${scope}`);
