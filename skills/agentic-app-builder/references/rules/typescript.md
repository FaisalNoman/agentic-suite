# TypeScript rules (extends generic.md)

- **`strict` is on.** No `any` — use `unknown` + narrowing, generics, or a precise type. No `as` casts to
  silence errors; fix the type. `@ts-ignore`/`@ts-expect-error` only with a one-line justification.
- **Types model the domain.** Prefer discriminated unions over boolean flags; `type`/`interface` for shapes;
  `readonly` for data that shouldn't mutate. Let inference work — annotate public APIs + exported signatures,
  not every local.
- **No `enum`** — use `as const` union (`const X = {...} as const; type X = typeof X[keyof typeof X]`).
- **Nullish-correct.** Use `?.` and `??` (not `||`) for null/undefined; don't conflate with falsy `0`/`""`.
- **Async.** `async/await`, never floating promises (await or `void`). Type errors as values where it aids
  the caller. Don't wrap sync code in needless promises.
- **Imports.** ESM `import`/`export`; `import type {}` for type-only. No default exports for modules with
  multiple members. No deep imports into other modules' internals.
- **Immutability.** Prefer `const`, spread/map/filter over in-place mutation for app data.
- **Runtime validation at edges** (zod or hand-written) — TS types vanish at runtime; validate network/JSON.
- **Tests:** Vitest (or the project's runner). Type the test data; cover the union branches + null cases.
- **No `console.log` in shipped code** — use the project logger or remove.
