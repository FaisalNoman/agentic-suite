# JavaScript rules (extends generic.md)

- **Modern ESM.** `import`/`export`, `const`/`let` (never `var`), arrow fns for callbacks. Target current
  Node/browser; no transpiler-only syntax unless the project has a build.
- **Strict equality** `===`/`!==` always. Use `??`/`?.` for null/undefined, not `||` (which trips on `0`/`""`).
- **No floating promises.** `await` or explicitly `.catch()`/`void`. Don't mix callbacks and promises.
- **Immutable data flow.** `map`/`filter`/`reduce`/spread over in-place mutation for app state.
- **Validate input** — JS has no compile-time types, so guard function args and external data at runtime;
  fail fast with clear errors.
- **Small modules, named exports.** Avoid giant util files; no deep reaching into other modules' internals.
- **No `console.log`** in shipped code; use the project logger or remove. No `debugger`.
- **JSDoc on public functions** (`@param`/`@returns`) since there are no types — it's the contract.
- **Tests:** the project's runner (Vitest/Jest/node:test). Cover edge cases: empty, null, boundary, throw.
- **Avoid the footguns:** no `==`, no implicit globals (`'use strict'`/ESM), no mutating function args, no
  `for...in` over arrays.
