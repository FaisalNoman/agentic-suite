// Remove the agentic-suite hooks pack from a settings.json (reverse of
// install-hooks.mjs). Zero dependency, idempotent — strips every hook entry
// whose command references suite-hook.mjs and leaves all other hooks intact.
//
// Usage:  node uninstall-hooks.mjs [--scope project|user]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const scope = args.includes("--scope") ? (args[args.indexOf("--scope") + 1] || "project") : "project";
const settingsPath = scope === "user"
  ? path.join(os.homedir(), ".claude", "settings.json")
  : path.join(process.cwd(), ".claude", "settings.json");

let settings;
try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); }
catch { console.log(`no settings at ${settingsPath} — nothing to remove`); process.exit(0); }

const isOurs = (h) => h && h.hooks && h.hooks.some((x) => typeof x.command === "string" && x.command.includes("suite-hook.mjs"));
let removed = 0;
if (settings.hooks && typeof settings.hooks === "object") {
  for (const event of Object.keys(settings.hooks)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    const before = settings.hooks[event].length;
    settings.hooks[event] = settings.hooks[event].filter((h) => !isOurs(h));
    removed += before - settings.hooks[event].length;
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
console.log(`agentic-suite hooks removed (${removed} entr${removed === 1 ? "y" : "ies"}) ← ${settingsPath}`);
