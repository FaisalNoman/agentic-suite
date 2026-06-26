# Code Review Criteria

Extends default.md. Apply both files when reviewing code-agent output.

---

## Additional checklist

| # | Question | Severity if No |
|---|---|---|
| C1 | Did the code-agent's self_review show 0 blockers in the done-signal? | 🔴 Blocker |
| C2 | Does the implementation handle all error paths in the task spec? | 🔴 Blocker |
| C3 | Are all inputs validated before use? | 🔴 Blocker |
| C4 | Are parameterised queries used for all database operations? | 🔴 Blocker |
| C5 | Are secrets and credentials never logged or exposed in output? | 🔴 Blocker |
| C6 | Do tests cover the primary path specified in acceptance criteria? | 🟡 Suggestion |
| C7 | Is the public API unchanged from what the task spec defined? | 🔴 Blocker |
| C8 | Are response times within the task spec's performance targets? | 🟡 Suggestion |
| C9 | Is error handling specific (not bare `catch (e) {}` or `except: pass`)? | 🟡 Suggestion |
| C10 | Is code complexity justified (no unnecessary abstractions)? | 💭 Nit |
