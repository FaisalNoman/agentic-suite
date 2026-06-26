# Analysis Review Criteria

Extends default.md. Apply both files when reviewing analysis-agent output.

---

## Additional checklist

| # | Question | Severity if No |
|---|---|---|
| A1 | Does every recommendation follow SCQA format (Situation / Complication / Question / Answer)? | 🔴 Blocker |
| A2 | Does each recommendation cite specific evidence from named input files? | 🔴 Blocker |
| A3 | Were all plausible alternatives evaluated and explicitly ranked? | 🔴 Blocker |
| A4 | Is there a scored comparison matrix for any comparison of 3+ options? | 🟡 Suggestion |
| A5 | Does each major conclusion have its own confidence score? | 🟡 Suggestion |
| A6 | Are the confidence scores calibrated to evidence quality (not uniformly high)? | 🟡 Suggestion |
| A7 | Is the ranking cardinal (numerical scores) not just ordinal ("A is better")? | 🟡 Suggestion |
| A8 | Does the output avoid conclusions that go beyond what the input evidence supports? | 🔴 Blocker |
| A9 | Is uncertainty noted where it exists, rather than projected confidence? | 🟡 Suggestion |
