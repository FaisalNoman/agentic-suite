# Per-language coding rules — scoped injection

Compact, high-signal coding standards the BUILD impl agents follow. **Load only the file that matches the
task's language** (by the file extension the agent will write) — exactly like design-system routing, but for
code. Never dump all of them into context; inject the one relevant `<lang>.md` into the impl agent's
`context_slice`, alongside `DESIGN-SYSTEM.md` for UI tasks.

## Resolver (at impl-agent dispatch — Stage 3)

Map the task's primary `writes:` extension → rules file:

| Extensions | File |
|---|---|
| `.ts .tsx` | `typescript.md` |
| `.js .jsx .mjs .cjs` | `javascript.md` |
| `.py` | `python.md` |
| `.go` | `go.md` |
| `.rs` | `rust.md` |
| `.java` | `java.md` |
| `.cs` | `csharp.md` |
| anything else / mixed | `generic.md` |

Steps:
1. Determine the task's language from its `writes` glob (the dominant extension).
2. Read the matching `references/rules/<lang>.md` (fall back to `generic.md`).
3. Prepend its rules to the impl agent's prompt as a **CODING RULES** block, after the task spec and before
   the OUTPUT CONTRACT. Keep TS/UI tasks also getting `DESIGN-SYSTEM.md`.
4. The `review` agent checks the diff against the same `<lang>.md` rules.

These are deliberately short — principles + the few mistakes agents actually make, not a style encyclopedia.
`generic.md` always applies (it's the language-agnostic baseline); a `<lang>.md` extends it.
