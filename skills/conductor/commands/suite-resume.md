---
description: Resume an interrupted agentic-suite (BUILD→GROW) run from where it stopped
---

Resume the current agentic-suite run.

1. Run the briefing helper from the suite working directory:
   `node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/suite-resume.mjs"` (or the absolute path to the
   agentic-suite skill's `scripts/suite-resume.mjs`). It reads `suite-state.json` + the BUILD/GROW
   `framework-state.json` and prints the current phase, outstanding milestones, dashboards, and the
   exact next action.
2. Then invoke the **agentic-suite** skill and continue the conductor from the reported phase per
   Operating Rule 6 (skip completed phases; resume the interrupted one). Do NOT rebuild a phase whose
   state shows it already completed.
