# Generic coding rules (language-agnostic baseline — always applies)

- **Smallest correct change.** Match the surrounding code's style, naming, and structure. Don't reformat
  unrelated lines or introduce a new pattern when an existing one fits.
- **Names say intent.** No `data`, `tmp`, `doStuff`, `x2`. A reader should understand a name without context.
- **No dead code, no commented-out blocks, no TODO without an issue.** Delete it; git remembers.
- **Errors are values, not surprises.** Handle or propagate every error path. Never swallow with an empty
  catch. Fail loud with a message that says what failed and why.
- **No secrets in code.** Read from env/config. Never hardcode keys, tokens, passwords, or endpoints.
- **Validate at boundaries.** Untrusted input (args, network, files, user) is checked before use.
- **Pure where possible.** Push side effects (I/O, globals, time, randomness) to the edges; keep the core
  logic deterministic and testable.
- **One responsibility per unit.** A function does one thing; if you need "and" to describe it, split it.
- **Tests prove behavior, not implementation.** Test observable outcomes + edge cases (empty, boundary,
  error), not private internals. A test that can't fail is noise.
- **No premature abstraction.** Don't add layers/config/flags for a need that doesn't exist yet.
- **Comments explain WHY, not WHAT.** The code says what; comment only the non-obvious reason.
- **Concurrency is explicit.** Shared mutable state is guarded or avoided. No data races.
