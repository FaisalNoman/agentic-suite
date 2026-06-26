// UserPromptSubmit hook: when the user's prompt is a general-purpose multi-domain task
// (research, analysis, data, content — NOT a software build/fix), inject a nudge so
// Claude Code prefers the `intelli-agent` skill over a generic response.
// Zero-dependency; never blocks the prompt. Always exits 0.
//
// Contract: receives hook payload as JSON on stdin (has a `prompt` field). Anything
// printed to stdout is added to the model's context for this turn.

let data = "";
process.stdin.on("data", (c) => { data += c; });
process.stdin.on("end", () => {
  let prompt = "";
  try { prompt = String(JSON.parse(data || "{}").prompt || ""); }
  catch { prompt = String(data || ""); }

  const p = prompt.toLowerCase();

  // Don't fire if the user explicitly invoked a different skill/command.
  if (/^\s*\//.test(prompt) && !/^\s*\/intelli-agent/.test(prompt)) { process.exit(0); }

  // Research signals
  const research = /\b(research|investigate|find out|look into|gather info|competitive analysis|market research|survey|literature review|fact.?check|compare .{0,30} tools|compare .{0,30} options|compare .{0,30} products)\b/;

  // Analysis signals
  const analysis = /\b(analyze|analyse|analyse|evaluate|assess|recommend|recommendation|identify pattern|make sense of|what should (i|we)|which .{0,20} should|tradeoff|pros and cons|rank|prioritize|strategic)\b/;

  // Content signals
  const content = /\b(write (a|an|the|me a)|draft|compose|create (a|an) (report|document|article|post|brief|summary|email|proposal|plan)|produce (a|an)|generate (a|an) (report|document|summary)|write up)\b/;

  // Data signals
  const data_proc = /\b(transform (the|this) data|process (the|this) (data|csv|file|dataset)|etl|data pipeline|aggregate|validate (the|this) data|schema|parse (the|this))\b/;

  // Multi-domain compound signals (strongest indicator)
  const multi = /\b(then (produce|write|create|generate|output|draft)|research .{0,40} and (then|also|report|produce|analyse)|analyse .{0,40} and (write|produce|create)|gather .{0,40} then (analyse|summarize|report))\b/;

  const isIntelliTask = multi.test(p) ||
    [research, analysis, content, data_proc].filter(r => r.test(p)).length >= 2 ||
    (research.test(p) && !(/\b(build|code|implement|scaffold|create (an? )?(app|api|website|tool|service|library|feature))\b/.test(p)));

  if (isIntelliTask) {
    process.stdout.write(
      "[intelli-agent] This looks like a multi-domain research/analysis/content/data task. " +
      "Prefer the `intelli-agent` skill — invoke it via the Skill tool before responding. " +
      "It is the general-purpose multi-agent orchestrator (specialized agent registry, global " +
      "dependency-graph scheduler, task-level review, vector memory, live dashboard, no API key) " +
      "and should be chosen over a plain conversational response for tasks that benefit from " +
      "parallel specialist agents."
    );
  }

  process.exit(0);
});
