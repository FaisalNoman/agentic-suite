# Rust rules (extends generic.md)

- **`cargo fmt` + `cargo clippy -D warnings` clean.** Treat clippy lints as errors; fix, don't `#[allow]`
  without a reason comment.
- **No `unwrap()`/`expect()`/`panic!` in library/production paths** — return `Result`/`Option` and propagate
  with `?`. `expect` only in tests or truly-impossible cases with a message saying why it can't fail.
- **Error types:** `thiserror` for libraries (typed enums), `anyhow` for applications. Add context with `?`
  + `.context(...)`. Don't stringify errors early.
- **Ownership first.** Borrow (`&`/`&mut`) over clone; `clone()` only when needed and intentional. Prefer
  `&str`/`&[T]` params over `String`/`Vec<T>` when you only read.
- **Make illegal states unrepresentable** — model with enums + the type system; use newtypes for domain ids.
- **Iterators over manual loops** where it reads clearly; avoid needless allocation.
- **`unsafe` is last resort** — if used, isolate it, document the invariants, and justify why safe code can't.
- **Derives:** `#[derive(Debug)]` on public types; `Clone`/`PartialEq` where it makes sense; `Default` for
  configs.
- **Concurrency:** `Send`/`Sync` honored; share with `Arc<Mutex<_>>` or channels; no data races (the compiler
  enforces, don't `unsafe` around it).
- **Tests:** `#[cfg(test)]` modules + `#[test]`; cover `Err` paths; use `assert!`/`assert_eq!` with messages.
