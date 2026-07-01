# Competitive-ad research — deliverable contract

A GROW deliverable that grounds the suite's ad copy in **real, currently-running competitor ads** instead of
guesses. The worker gathers ads via the user's **Apify MCP** (Meta/Facebook Ad Library, TikTok Creative
Center, Google Ads Transparency scrapers — discovered at runtime via ToolSearch), fills `ad-research.json`,
and `scripts/ad-research.mjs` renders a report + an interactive board. The extracted **angles** feed ACT's
ad-copy writer (`act-build-artifacts.mjs` `ads[]`), so generated ads copy what's proven to work.

> Data is fetched by the orchestrator via MCP (no scraper code shipped here). Respect each platform's ToS +
> rate limits. If no Apify/ad connector is available, the deliverable degrades to a template the founder fills.

## Why "longevity" is the key signal
A competitor ad that has been **running for weeks/months** is almost certainly profitable (nobody pays to run
a losing ad). So the report ranks + flags **long-running ads** — those are the patterns worth copying.

## JSON schema — `ad-research.json`
```json
{
  "product": "QNext", "niche": "queue management for clinics & salons",
  "sources": ["Meta Ad Library", "Google Ads Transparency", "TikTok Creative Center"],
  "generated_via": "apify: facebook-ad-library-scraper",           // or "template (no connector)"
  "competitors": [ { "name": "Waitwhile", "url": "…", "ad_count": 14 } ],
  "ads": [
    {
      "advertiser": "Waitwhile", "platform": "meta", "format": "video|image|carousel",
      "headline": "Stop losing walk-ins", "primary_text": "…the ad body…", "cta": "Sign Up",
      "running_since": "2026-03-01", "longevity_days": 120, "angle": "loss-aversion",
      "hook": "first 3 seconds: packed waiting room", "link": "https://…ad…"
    }
  ],
  "patterns": [ { "pattern": "Loss-aversion hook", "evidence": "seen in 9/20 ads", "why_it_works": "…" } ],
  "angles": [ { "angle": "Lost revenue from walk-outs", "rationale": "…", "example_hook": "…" } ],
  "gaps": [ "No one advertises the multi-branch dashboard — a wedge" ]
}
```
- `angles[]` is the actionable output — hand these straight to `act-build-artifacts.mjs` `ads[]`.
- `longevity_days` drives ranking (long-runners first = proven).

## Renderer — `scripts/ad-research.mjs`
```
node ad-research.mjs <ad-research.json|-> [--out-dir grow/outputs] [--no-open]
```
Writes `ad-research.md` (report) + `ad-research.html` (interactive: ad cards sorted by longevity with a
"proven" badge on long-runners, a patterns panel, and the recommended angles). Deterministic render; the
content is the worker's.

## Flow
1. GROW detects an ad / paid / competitive-research ask → discovers an Apify ad-library actor via ToolSearch →
   pulls competitor ads for the niche → distils into `ad-research.json` (ads + patterns + angles + gaps).
2. `ad-research.mjs` renders `grow/outputs/ad-research.{md,html}` (surfaced in the showcase).
3. ACT ad-copy (`ads[]`) is written **from the `angles[]`** — evidence-based, not invented. Paid launch stays
   `never_auto` (human presses go on the ad platform).

## User journey
**Prerequisite (one-time):** the user connects an **Apify MCP** (with a Meta/Google/TikTok ad-library actor).
If absent, the degrade path runs — same structure, no live data.

**Happy path (connector present):**
1. **Trigger** — the user includes an ad/competitor ask, e.g. *"…create Meta + Google ad copy, and research what
   competitors are actually running."* (works inside a full suite run or a grow-only run).
2. **Detect** — GROW recognizes the intent; the :4318 board shows "gathering competitor ads…".
3. **Fetch** — worker discovers the Apify ad-library actor via ToolSearch → pulls real running ads (advertiser,
   copy, CTA, how long each has run).
4. **Distil + render** — worker writes `ad-research.json` (ads + patterns + **angles** + gaps) → `ad-research.mjs`
   renders `ad-research.{md,html}`.
5. **User sees the board** — `ad-research.html` opens: ad cards sorted by longevity, ✅ **proven** badge on
   30-day+ runners, repeating **patterns**, **gaps/wedges**, and **▶ recommended angles**.
6. **Angles → copy (ACT)** — the ad-copy writer generates `ads.csv` **from those proven angles**, validated
   (Google ≤30/≤90).
7. **Human launches** — the founder imports `ads.csv` into Google/Meta Ads and presses go. **Paid launch is
   `never_auto`** — the suite never spends ad money.

**Degrade path (no connector):** step 3 finds nothing → worker writes a **template** `ad-research.json` (empty
cards + "paste 5 competitor ads here" prompts); the board renders as a fillable framework. Nothing breaks.

**One line:** find what competitors pay to keep running → copy the winning angles → generate validated ad copy
→ the founder launches it. Evidence in, guessing out; money-spend stays human.
