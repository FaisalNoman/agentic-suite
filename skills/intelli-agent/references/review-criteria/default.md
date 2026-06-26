# Default Review Criteria

Used when domain-specific criteria don't apply or as the base for all reviews.

---

## Checklist

Answer each question. Anything answered "No" generates an issue at the
appropriate severity level.

| # | Question | Severity if No |
|---|---|---|
| 1 | Does the output address all items in the task spec's acceptance criteria? | 🔴 Blocker |
| 2 | Are factual claims supported by evidence from the task's input files? | 🔴 Blocker |
| 3 | Is the output format correct per `output_type` in the task spec? | 🔴 Blocker |
| 4 | Are gaps or missing data flagged explicitly rather than silently omitted? | 🔴 Blocker |
| 5 | Are proxy or estimated values clearly labelled as such? | 🔴 Blocker |
| 6 | Is the done-signal JSON valid and parseable? | 🔴 Blocker |
| 7 | Is the confidence score calibrated to the actual evidence quality? | 🟡 Suggestion |
| 8 | Is the output length appropriate (not padded, not truncated)? | 🟡 Suggestion |
| 9 | Is terminology consistent throughout the output? | 💭 Nit |
| 10 | Is the output free of hallucinated URLs, names, or statistics? | 🔴 Blocker |

---

## Pass threshold

`score ≥ 0.70` AND `blocker count = 0`

Score formula: start at 1.0, deduct per issue:
- Each 🔴 blocker: −0.25
- Each 🟡 suggestion: −0.08
- Each 💭 nit: −0.02
Floor at 0.0.
