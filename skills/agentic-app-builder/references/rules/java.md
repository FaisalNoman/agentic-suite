# Java rules (extends generic.md)

- **Modern Java** (17+): `var` for obvious locals, records for immutable data carriers, sealed types +
  pattern-matching `switch` for closed hierarchies, text blocks for multiline strings.
- **Null discipline:** return `Optional<T>` instead of null for "maybe absent"; never return null collections
  (return empty). Annotate with the project's `@Nullable`/`@NonNull` if present. Avoid NPE by design.
- **Exceptions:** throw specific types; never catch-and-swallow; don't catch `Exception`/`Throwable` broadly.
  Wrap with cause (`new XException(msg, e)`). Use unchecked for programmer errors, checked sparingly.
- **Immutability:** `final` fields, immutable collections (`List.of`, `Map.copyOf`); prefer constructor
  injection over field mutation.
- **Streams** for transformations where readable; don't force everything into one giant stream chain.
- **try-with-resources** for anything `Closeable` (streams, connections). Never leak resources.
- **equals/hashCode/toString** together and correct (or use a record). Don't hand-roll if a record fits.
- **Dependency injection** over `new` for collaborators; program to interfaces.
- **No raw types** — always parameterize generics. No unchecked casts without `@SuppressWarnings` + reason.
- **Tests:** JUnit 5 + AssertJ (or project's); arrange-act-assert; cover exception paths with
  `assertThrows`.
