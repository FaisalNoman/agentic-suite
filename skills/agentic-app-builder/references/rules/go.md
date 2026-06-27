# Go rules (extends generic.md)

- **`gofmt`/`goimports` clean** — non-negotiable. `go vet` passes.
- **Errors:** return `error` as the last value; check every one. Wrap with context `fmt.Errorf("doing X: %w", err)`
  (use `%w` so callers can `errors.Is`/`As`). Never `_ = err`. No panics for ordinary errors — panic only for
  truly unrecoverable programmer bugs.
- **Accept interfaces, return structs.** Keep interfaces small (1–3 methods) and defined by the consumer.
- **Zero values are useful** — design types so the zero value works; avoid needless constructors.
- **Concurrency:** goroutines must have a clear lifetime + exit path; pass `context.Context` as the first arg
  for cancellation. Guard shared state with a mutex or use channels. Run with `-race` in tests.
- **`defer` for cleanup** (Close/Unlock) right after acquisition.
- **No naked returns** in non-trivial functions. Short, lower-case, no-stutter names (`user.New`, not
  `user.NewUser`). Exported identifiers have doc comments starting with the name.
- **Slices/maps:** preallocate with `make([]T, 0, n)` when size is known; nil slice is a valid empty slice.
- **Tests:** standard `testing`, table-driven with subtests (`t.Run`). `t.Helper()` in helpers. No external
  assert lib unless the project uses one.
- **Don't ignore `context` deadlines.** No `time.Sleep` in production logic for synchronization.
