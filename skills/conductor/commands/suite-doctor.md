---
description: Pre-flight environment check before running the agentic-suite BUILD→GROW pipeline
---

Validate the environment before a BUILD→GROW run.

1. Run the doctor from the agentic-suite install location:
   `node "<agentic-suite-base>/scripts/suite-doctor.mjs"` (zero-dep node).
2. Show the PASS / WARN / FAIL table it prints.
3. On any ❌ FAIL: explain what each means and how to fix it (e.g. node missing → install Node 18+;
   corrupt suite-state.json → fix or delete it; skill not found → reinstall the suite).
4. On ⚠️ WARN only: list what might be affected; the user decides whether to proceed.
5. On all ✅: confirm "Environment ready — you can run agentic-suite."

Advisory only — never blocks a run.
