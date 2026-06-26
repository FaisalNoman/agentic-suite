# AB — Document templates

Fill from interview. Keep concrete; no placeholder fluff in the final files.

## plan/docs/PRD.txt

```
# PRODUCT REQUIREMENTS — {Project Name}
Generated: {date}  ·  Owner: {user}

## 1. Overview
{2-4 sentences: what it is, who it's for, why it exists.}

## 2. Goals
- {measurable goal}

## 3. Scope (in)
- {what's included}

## 4. Non-goals (out)
- {explicitly excluded}

## 5. Success criteria
- {how we know it's done / working}

## 6. High-level features
- FEAT-001 {name} — {one line}
- FEAT-002 {name} — {one line}
```

## plan/docs/FEATURES.txt

One block per feature (mirrors backlog.json):

```
### FEAT-001 — {Title}
Domain:       {auth|payments|ui|infra|...}
Complexity:   {S|M|L|XL}
Dependencies: {FEAT-xxx, none}
Description:  {what it does}
User stories:
  - As a {role}, I want {goal}, so that {benefit}.
Acceptance criteria:
  - {testable condition}
Edge cases:
  - {boundary / error condition}
Must NOT:
  - {explicit constraint}
```

## plan/docs/TECH-STACK.md

```
# TECH STACK
Language/runtime: {e.g. TypeScript / Node 20}
Framework:        {e.g. Express}
Database:         {e.g. PostgreSQL / none}
Test framework:   {e.g. Jest / Vitest / pytest}
Package manager:  {npm | pnpm | yarn | pip | ...}
Target:           {CLI | web | API | library}
Constraints:      {no X, must use Y}

## Commands  (the loop runs these verbatim)
install:     {e.g. pnpm install}
test (unit): {e.g. pnpm test}
test (file): {e.g. pnpm test {path}}
integration: {e.g. pnpm test:integration}
run:         {e.g. pnpm dev}
lint:        {e.g. pnpm lint        — check only, used as the gate}
lint:fix:    {e.g. pnpm lint --fix  — autofix, run by impl/fix agents on their file}
```

## plan/docs/ARCHITECTURE.md

```
# ARCHITECTURE
## Module map
{dir/}  — {responsibility}
## Boundaries / contracts
{which module owns which interface}
## Data flow
{request → ... → response, or pipeline stages}
```

## plan/docs/DESIGN-SYSTEM.md  (written at Stage 2.4 by the design router — UI projects only)

The router persists the chosen design skill's output here. Shared contract for wireframe + UI impl +
review. Capture exactly what the chosen skill produced (don't invent):

```
# DESIGN SYSTEM — {project}
Source: {ui-ux-pro-max | awesome-design-md:<preset> | taste-skill | built-in}   ·  Generated: {date}

## Style
{named style + one-line rationale, e.g. "Bento grid + soft neumorphism — SaaS dashboard"}

## Color palette
{role → hex: bg / surface / text / primary / accent / success / warning / danger / border}

## Typography
{display + body font pairing · the @import / font links · base size + scale}

## Spacing & layout
{spacing unit, container widths, responsive breakpoints (e.g. 375/768/1024/1440)}

## Motion
{transition durations/easings; honor prefers-reduced-motion}

## Anti-patterns (do NOT do)
- {e.g. purple-gradient-on-white, generic Inter-everywhere, cramped cards}

## Accessibility checklist (review gate uses this)
- [ ] WCAG AA contrast on text/controls
- [ ] keyboard navigable + visible focus states
- [ ] reduced-motion respected
- [ ] semantic markup / labels / alt text

## Stack guidance
{framework-specific notes the impl agents follow, e.g. shadcn tokens, Tailwind config keys}
```

## plan/docs/DESIGN-BRIEF.md  (written at Stage 1 Phase D — UI projects only)

Interview output. The Stage 2.4 router turns this into the design skill's query → DESIGN-SYSTEM.md.

```
# DESIGN BRIEF — {project}

Product type:   {admin dashboard | landing page | SaaS app | marketing site | mobile app | internal tool}
Industry:       {fintech | healthcare | e-commerce | dev-tool | social | education | …}
Demographic:    {who uses it, e.g. "enterprise ops teams" / "Gen-Z consumers"}
Aesthetic:      {Minimalist | Linear/Notion | Brutalist | Soft-expensive | Glass | Bento | custom: …
                 | "let the design skill choose"}
Dials:          variance {LOW|MED|HIGH} · density {COMPACT|COZY|SPACIOUS} · motion {NONE|SUBTLE|RICH}
Dark mode:      {yes | no | both}
Stack:          {from Phase C — React | Next.js | Vite | … + utility CSS choice}

Router query (assembled): "Design a {product type} for a {industry} product targeting {demographic}.
Aesthetic {aesthetic}. Variance {x}, density {y}, motion {z}, dark-mode {…}. Generate tokens first."
```

FEATURE mode with an existing design system: replace the body with `Reuse existing design system —
{path to tokens/theme}; do not regenerate.`
