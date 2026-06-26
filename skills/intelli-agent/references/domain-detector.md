# Domain Detector

Used at Stage 0 Step 2. Called as a single fast LLM call before any planning.
Result shapes the entire DAG. If misclassification is detected at planning time,
write a dashboard prompt to confirm before proceeding.

---

## Classifier prompt (sent as user message)

Classify the task below into one or more domains. Return ONLY valid JSON —
no markdown fences, no preamble, no explanation outside the JSON object.

```json
{
  "domains": [
    {
      "domain": "research | code | data_processing | content | analysis",
      "confidence": 0.0,
      "signals": ["exact phrase from task that triggered this"]
    }
  ],
  "primary_domain": "...",
  "secondary_domain": "... or null",
  "tertiary_domain": "... or null",
  "ambiguity_flag": false
}
```

**Rules:**
- Only include domains with confidence ≥ 0.40
- Maximum 3 domains in the array
- `ambiguity_flag` = true when the top two confidences are within 0.05 of each other
- Each `signals` array contains 1–3 verbatim phrases from the task description

**Domain definitions:**
- `research`: gathering information, investigating, sourcing facts, market research,
  competitive analysis, literature review, finding current data about X
- `code`: writing software, fixing bugs, building features, APIs, scripts, CLI tools,
  automation, refactoring, scaffolding, implementing anything in a programming language
- `data_processing`: transforming data, ETL pipelines, schema validation, aggregation,
  SQL queries, parsing CSV/JSON, data cleaning, joining datasets
- `content`: writing documents, reports, articles, blog posts, summaries, drafts,
  presentations, proposals, emails — human-readable prose output
- `analysis`: comparing options, identifying patterns, making recommendations, evaluating
  tradeoffs, ranking, strategic assessment, explaining why something happened

**Task to classify:**
{{task_description}}

---

## Ambiguity handling

After receiving the JSON response:

1. If `ambiguity_flag` is false → proceed with `primary_domain`, log `secondary_domain`
   and `tertiary_domain` to `framework-state.json` under `domain_classification`.

2. If `ambiguity_flag` is true AND both top domains have confidence > 0.65 AND they map
   to very different agent types (e.g. `code` vs `research`) → write a `prompt` entry
   to `agents.json` asking the user to confirm the primary domain before proceeding:
   ```json
   {
     "id": "confirm-domain",
     "title": "Confirm primary domain",
     "question": "This task spans multiple domains equally. Which should run first?",
     "options": ["<domain_A>", "<domain_B>"]
   }
   ```
   Block on `wait-answer.mjs confirm-domain 120`, fall back to CLI if timeout.

3. If `ambiguity_flag` is true BUT confidence delta < 0.05 AND at least one domain is
   below 0.65 → proceed with `primary_domain` without asking. Log ambiguity in
   `framework-state.json` under `domain_classification.ambiguity_note`.

---

## State written after classification

```json
{
  "domain_classification": {
    "primary_domain": "research",
    "secondary_domain": "analysis",
    "tertiary_domain": "content",
    "ambiguity_flag": false,
    "ambiguity_note": null,
    "agent_roster": ["research-agent", "analysis-agent", "content-agent"]
  }
}
```

`agent_roster` is derived by calling `routing_table[domain].default` for each domain
in the result. Written to `framework-state.json` and used by the planner in Stage 2.
