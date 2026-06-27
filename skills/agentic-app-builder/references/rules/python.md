# Python rules (extends generic.md)

- **Type hints everywhere** (PEP 484) on function signatures + public attrs. Run clean under the project's
  type checker (mypy/pyright). Use `X | None`, not bare `Optional` ambiguity; `list[str]` not `List[str]`.
- **PEP 8 / the project's formatter** (black/ruff). 4-space indent. Don't fight the formatter.
- **Specific exceptions.** Raise/catch precise types, never bare `except:` or `except Exception` without
  re-raise. No silent `pass` in except. Use `raise ... from e` to keep the chain.
- **No mutable default args** (`def f(x=[])` is a bug) — use `None` + init inside.
- **Pythonic constructs.** Comprehensions over manual loops where readable; context managers (`with`) for
  files/locks/connections; `pathlib.Path` over `os.path`; f-strings over `%`/`.format`.
- **Dataclasses / pydantic** for structured data, not loose dicts. `@dataclass(frozen=True)` for value types.
- **No globals for state.** Pass dependencies; keep functions pure where possible.
- **Stdlib first** — don't add a dependency for what `itertools`/`functools`/`collections` already do.
- **Tests:** pytest. Use fixtures + `parametrize` for edge cases; `pytest.raises` for error paths.
- **`if __name__ == "__main__":`** guards script entry. No top-level side effects on import.
- **No `print` for logging** — use the `logging` module.
