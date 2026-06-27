# C# rules (extends generic.md)

- **Nullable reference types ON** (`<Nullable>enable</Nullable>`). Honor `?` annotations; don't `!`
  null-forgive to silence — fix the flow. Guard public args (`ArgumentNullException.ThrowIfNull`).
- **Modern C#** (10+): `record`/`record struct` for immutable data, pattern matching + switch expressions,
  target-typed `new()`, file-scoped namespaces, `var` for obvious locals.
- **Async all the way:** `async`/`await`, return `Task`/`Task<T>` (or `ValueTask`), never `async void`
  (except event handlers), never `.Result`/`.Wait()` (deadlocks). Pass `CancellationToken` through.
- **Exceptions:** specific types; no empty catch; `throw;` to rethrow (not `throw ex;`). Don't use exceptions
  for control flow.
- **LINQ** for queries/transforms where readable; beware multiple enumeration of `IEnumerable` (materialize
  with `ToList()` when iterating twice).
- **`IDisposable`** via `using`/`await using` for every disposable. Implement the dispose pattern correctly
  when owning unmanaged/disposable fields.
- **Immutability + DI:** `readonly` fields, constructor injection, program to interfaces. Prefer expression
  members for one-liners.
- **Naming:** PascalCase public, camelCase locals, `_camelCase` private fields. Async methods end in `Async`.
- **Tests:** xUnit (or project's) + FluentAssertions; `[Theory]`/`[InlineData]` for cases; assert thrown
  exceptions.
