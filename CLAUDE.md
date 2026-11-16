# PolyFinances Datathon 2026 — case "AlphaForge AI"

Polytechnique Montréal, Nov 14–16 2026. Sponsors: National Bank Direct Brokerage (NBDB / BNCD) and AWS.
Official brief and starter data: `data/raw/datathon2026/Datathon2026/` (case PDF EN/FR, participant deck, `alphaforge_starter/`).
User writes in French or English; answer in the language they use.

## The official task (released Nov 14)
Design a **self-explaining agentic solution** that uses **public financial data** to inform investment analysis or
decisions for different investor profiles. Use case, assets, models and architecture are free. Simulation only.

**Evaluation grid (simplified; full grid is jury-only):**
| Criterion | Weight | Meaning |
|---|---|---|
| Solution | 20% | relevance, innovation, creativity, prototype |
| Agentic | 20% | architecture and explainability |
| Data | 20% | rigour, validation, visualisation |
| AWS | 15% | quality of integration |
| Pitch | 15% | presentation, business, marketing |
| UX/UI | 10% | intuitive, ergonomic, clear |

**AWS is an ELIGIBILITY requirement**: it must make a real, demonstrable contribution to how the solution works, or the
project is not evaluated. Do not stack services to impress; justify each one. (Natural fit: Bedrock + Strands/AgentCore
for the agents, Guardrails for the "no personalised advice" boundary, Knowledge Bases for filings/ESG documents.)

**Deliverables** (deadline/platform to be confirmed by organisers — ASK the user when known):
1. Prototype + code repo + README (dependencies, data sources, config, reproduction).
2. Demo video ≈ 5 min, end to end; show **at least two contrasting investor situations**.
3. Technical doc: agent roles/interactions, controls/governance, methods and why, sources/assets/processing/assumptions,
   explainability mechanism with an example linking a conclusion to data or execution traces, validation, limits, next steps.
4. One-pager: problem, agentic approach, originality, data sources, explainability, user benefits.

**Personas (reality tests):**
- **Amira**, 26, software engineer, high risk, 15+ yrs, growth; loves AI/emerging tech, open to crypto, but wants
  diversification and not tech-only. *Test: "high risk" ≠ "anything goes".*
- **Mateo**, 41, partner + 2 kids, moderate risk, 8–12 yrs, balanced growth; strong ESG, avoid companies with significant
  environmental/social controversies, little interest in speculation. *Test: more than return and risk.*
- **Robert**, 59, retiring in a few years, low-to-moderate risk, 3–5 yrs, preserve capital with some growth; likes
  established, understandable businesses, no crypto, but may be tempted by a hyped stock. *Test: the system must
  challenge a request that conflicts with the profile, explain the risk, and not simply agree.*

**Explicitly suggested by the brief:** an explainability agent and a governance agent (checks constraints and the
simulation-only boundary, flags conflicts and missing information). Number of agents is not a goal: each must have a
clear reason to exist. Test sensitivity to assumptions/scenarios. "Explanations faithful to data and observable actions,
without inventing justifications or exposing detailed internal model reasoning." Say when the data cannot support a conclusion.

**Starter data** (optional, 2021-11-12 → 2026-11-12, retrieved 2026-11-13; load with `af.load_starter()`): 31 assets —
10 CA equities, 10 US equities, 9 ETFs (XIU, SPY, QQQ, ESGV, XBB, ZST, AGG, TLT, GLD), BTC, ETH. Column is `ticker`.
Known traps, all documented in its README: prices in listing currency (convert with BoC USD/CAD); no calendar alignment
(crypto trades 7 days); `adj_close` for returns; splits already applied; CNQ.TO 1.021 "split" on 2022-08-22 is probably a
special distribution; monthly macro dated to reference month not release date; **survivorship bias** (universe picked in
2026); **no ESG, news or fundamentals** — Mateo's screen needs outside, documented evidence (issuer ESG methodology
pages, sustainability reports, SEDAR+, EDGAR).

**First findings on the real data** (CAD, 5 yrs): 2022 hit bonds too (TLT max drawdown −40%, XBB −15%); ETH and SHOP
lost money over the window with −77%/−84% drawdowns; NVDA +44%/yr with −64% drawdown. A return-seeking optimiser piles
into past winners (XOM, CNQ, NVDA) — exactly what the brief warns against. Pure max-diversification is too timid for Amira
(≈7% vol): a high-risk profile needs a risk *target*, not only a ceiling.

## Background from the workshops (still applies)
Build an AI solution that produces a **portfolio proposal suited to an investor persona** and explains itself.
- Personas carry objective, horizon, risk tolerance, preferences, constraints; they are used to *test relevance*.
- The solution must be **self-explanatory**: results tied to sources, assumptions and limitations.
- Data is expected from public sources, in suggested "families": market, company, funds/ETFs, macro, qualitative.
  Quality, traceability, transformations and missing data must be documented.
- The challenge "must not be reduced to picking the best historical return".
- Likely data shape (AWS example): `prices_daily.csv`, long format, columns `symbol`, `adj_close`, tickers like `TECH.TO`.

## What judges were told to value (design every feature against this)
1. Objective before product. Ask "what is the money for?" first; sometimes the right answer is *not* markets.
2. Return, risk and horizon are inseparable. Never show a return without its period, vol and drawdown.
3. Diversification = varied exposures (asset class, geography, sector, style, currency), not number of holdings.
   Look through ETFs for overlap (workshop example: adding XSP to a Canadian-heavy portfolio that already holds ZEQT).
4. The investor sets the boundaries. Tolerance ≠ capacity; horizon ≠ age; horizon ≠ tolerance. Constraints are hard,
   preferences are soft.
5. Explainable: every proposal answers **What data? Why this choice? What limitations? What would change the answer?**
   "Suitable, verifiable, defensible" beats "sophisticated".

## Non-negotiable engineering rules
- **Code calculates, the model explains.** No LLM-generated number ever. Every figure comes from a function in
  `alphaforge/` and carries its source and date window.
- Use **adjusted prices** (`adj_close`). Run `quality_report()` on any new file before analysing it.
- **No look-ahead**: fundamentals are usable from their *publication* date, not period end. Backtests split in time.
- Never report return alone: pair with volatility, max drawdown, Sharpe.
- State source + as-of date + currency + definition for every dataset; log transformations and missing data.
- Wording: this is an analysis aid, not personalised investment advice; past performance ≠ future returns.

## Team concept (decided Nov 14)
Loop in three steps: **Connaître** (adaptive questionnaire: 5 account + 5 per-portfolio questions, risk scenario on real
data) → **Décider** (2–3 fictional options with explained data, plus checking the user's own intention against the
profile — needed for Robert's test) → **Apprendre** (declared vs revealed profile shown side by side; decisions move only
revealed tolerance, never horizon/objective/capacity). Never "buy X / sell Y" wording.
Done: questionnaire (`alphaforge/questionnaire.py`, spec in `docs/questionnaire.md`), wired in `app.py` with one-click
personas; step 2 (`alphaforge/decide.py`: `options` = prudent / aligned / beyond-profile scenarios, `check_intention` =
governance checks with verdict compatible / tension / conflict, largest weight that still fits, and a trace for the
decision receipt; `parse_intention` is a regex fallback until a Bedrock agent parses free text). UI and explanations are
in French. AWS: `alphaforge/agents.py` — Strands on Bedrock: interpreter (structured output) → analyst (tools =
calculators, every call recorded in a trace) → explainer (no tools, trace only) → governance in code
(`validate_explanation`: every number must exist in the trace, no advice wording; one retry, then deterministic text).
Offline fallback when no AWS credentials. Setup and architecture: `docs/aws.md`; check with `scripts/check_aws.py`.
**Bedrock runs live since Nov 15** (short-term key in `.env`, valid 12 h, region **us-east-1** only; default model
`global.anthropic.claude-sonnet-4-6`). Never type or print the key; regenerate it before demos.
Step 3: `alphaforge/learn.py` — decision journal (idea kept/adjusted/dropped, scenario chosen, reaction to a real
drawdown episode of the aligned scenario); each decision carries a risk-level signal or None (conforming = counts as
declared tolerance); revealed tolerance = median of last 5, no conclusion before 3 decisions; statuses insufficient /
aligned / riskier / more_cautious / exceeds_limits. Only tolerance can be updated, by an explicit click, and it stays
capped by capacity, horizon and objective (Robert stays at level 2 whatever he does). Journal lives in the Streamlit
session only. `tests/test_app.py` runs the whole Robert story headless with Streamlit AppTest — use it instead of
driving the browser pane when the user is clicking in it.
Not done: real Bedrock run, ESG evidence for Mateo, positive interests (Amira's AI/tech), persistence of the journal,
README for the repo, video, technical doc, one-pager.
Streamlit does not reload the `alphaforge` package: restart the preview server after editing it.
An account holds several portfolios: account answers (C*) are shared, portfolio answers (P*) are per portfolio.

## Repo
- `alphaforge/questionnaire.py` questions, adaptive flow, declared profile JSON, contradictions, `to_profile` (capacity
  rules), persona presets · `scripts/build_risk_scenarios.py` real drawdowns for the risk scenario ·
  `data.starter_metadata()` classes/tags/per-title caps (10% per company, 5% per cryptoasset, ZST.TO = cash-like).
- Allocation aims at a volatility band (85–100% of the profile's ceiling), not only a ceiling.
- Preview: `.claude/launch.json` config `alphaforge` (Streamlit on port 8501).
- `alphaforge/data.py` load + quality report + synthetic generator · `metrics.py` risk/return/diversification ·
  `profile.py` persona → risk budget · `allocate.py` constrained optimiser · `explain.py` the 4-question trail ·
  `agents.py` Bedrock agents + governance · `app.py` Streamlit demo · `tests/`.
- Data: `data/raw/` (never edit), `data/processed/`. Deliverables: `outputs/`. Notes: `docs/`.
- Run with the venv: `.venv\Scripts\python -m pytest -q`, `.venv\Scripts\streamlit run app.py`.

## AWS (team account, expires Mon Nov 16 end of day, then deleted with all data)
- Join: catalog.workshops.aws/join → access code from email → "Open AWS console". One account per team.
- Bedrock (Claude, Nova, Llama, Mistral; available in ca-central-1), Knowledge Bases, Guardrails, AgentCore
  (+ Code Interpreter), SageMaker AI Studio JupyterLab, Kiro (credits provided).
- Agent path: `pip install strands-agents`, Bedrock API key in `AWS_BEARER_TOKEN_BEDROCK`.
- **Push code to GitHub and keep data locally before expiry.**

## Working style for this project
- Time-boxed competition: ship the simplest thing that is correct and explainable, then iterate. Verify numbers
  against a hand calculation or a test before they go on a slide.
- Team may present in French or English; keep UI strings easy to translate.

## State after the Nov 14 evening pass (team of Sonnet subagents + engine fixes)
- User asked for delegated work to run on **Sonnet subagents** (Agent tool, `model: "sonnet"`) to save tokens: give each agent
  its own files, a full brief (they start cold; tell them to read this file first), and verify their reports by running code.
- New: `alphaforge/feed.py` (discovery feed: cards, ranking by fit then learned likes, hypothetical 5-year bootstrap scenarios,
  saved list, simulated purchase) · `agents.explain_card` / `summarize_preferences` + stronger `validate_explanation`
  (forecast wording rejected) · `docs/ai-notes.md` · `docs/review.md` (critical review, top-10 table) · `README.md` ·
  `requirements.txt` · swipe UI (`alphaforge/ui_feed.py`, `alphaforge/components/swipe_card/`, new sidebar navigation in
  `app.py`) — check whether that last one is finished and browser-tested before relying on it.
- Compliance rewording of the team's sketch: no "Buy" header (fit verdict instead), "Simuler l'achat" only, 5-year view =
  hypothetical scenario RANGE (p5–p95 + share below start + disclaimer), never the median alone, never a forecast.
  Swipe LEFT = like, RIGHT = dislike, UP = neutral (team's choice). Likes reorder the feed, never the risk limits.
- Engine fixes from the review: second optimisation pass so the volatility band (85–100% of ceiling) is really met;
  sector cap 20% on individual stocks (`data.SECTOR_CAP`, passed through `starter_metadata` group caps); preferred assets
  get a 15% combined floor when feasible (`allocate.PREF_FLOOR`); Sharpe uses the mean Bank of Canada policy rate over the
  window (`metrics.RISK_FREE`, set by `load_starter`, 3.19%); `metrics.portfolio_value` vectorised; new account question
  C6 "thèmes d'intérêt" → `profile.preferred`; revealed tolerance rounds ties down and flags contradictory decisions.
- ESG (Mateo): no ESG data exists, so nothing is ever called compliant. Tags in `starter_metadata`: `esg_screened` (ESGV,
  issuer-described screen, methodology cited in `docs/esg-evidence.md`, read 2026-11-15), `esg_unverified` (individual companies), `esg_unscreened_fund`
  (XIU, SPY, QQQ). Strict "controversies" rule ⇒ individual companies excluded for lack of evidence ("donnée
  insuffisante"), unscreened funds discouraged, ESGV preferred. Consequence to disclose: Mateo's portfolio is ~6 assets
  (ESGV, bonds, gold), worst drawdown about −20%, weaker diversification — the visible cost of the rule. Mateo's preset
  also strictly excludes crypto (our reading of "little interest in highly speculative investments").
- Still open from the review: undisclosed hypotheses need one "Toutes nos hypothèses" panel; CNQ.TO 2022-08-22 artefact not
  disclosed in the UI; short-history assets silently shrink the portfolio window; README install steps never run end to end.

## State after the Nov 15 night pass
- Architecture now: React app `web/` (team's UI: feed/Reel, Saved, Profile) → FastAPI `alphaforge/api.py`
  (contract: `docs/api-contract.md`; run `scripts/serve_api.py`, loads `.env`) → engine `alphaforge/` + 4-agent pipeline
  `alphaforge/pipeline/` (Source Finder [registry only] → Fact-Checker [code] → Data Collector [starter, yfinance optional]
  → Predictor [block bootstrap, CAPM-shrunk drift, best/central/worst = p90/p50/p10 + sensitivity grid] → Bedrock
  explanation checked by `validate_explanation`). Pipeline results cached in `data/cache/pipeline/` (`scripts/warm_pipeline.py`).
- Streamlit `app.py` still works but the demo is the React app. Offline fallback: `web/public/snapshot.json`
  (`scripts/export_snapshot.py`). Launch configs `api` / `web` / `alphaforge` in `.claude/launch.json`.
- Deliverable drafts: `docs/technical.md`, `docs/one-pager.md`, `docs/video-script.md`. Rules: `docs/compliance-checklist.md`.
- Open decisions for the team: `DIRECT_BNCD = true` in `web/src/lib/bncd.ts` (real broker redirect, conflicts with
  simulation-only), English sketch labels ("Buy now", "If I buy"), no git repo yet (push before the AWS account expires).

## State after the Nov 15 day pass
- Universe = 91 assets: starter 31 + 60 extended (`data.load_universe`, files in `data/processed/extended/`, built by
  `scripts/build_extended_universe.py`, yfinance `Adj Close`, same window). API, pipeline and snapshot use it; Streamlit keeps the starter.
  Persona feeds: Amira 90, Mateo 24, Robert 91. All 91 Bedrock explanations cached, 91/91 passed governance on attempt 1.
- Feed (`feed.build_feed`/`rerank`): each title once, ranked (verdict → avoided → interest → likes → `risk_gap` (vol above 2× the
  profile ceiling sinks) → diversification), then `spread_sectors` (≤ 2 of a sector in a row within a verdict). The web feed follows
  that order and ends with an end card (no random repeats). Robert: TSLA 74/91; Robert + 20 % TSLA → conflict, max 7 %.
- Optimiser has exact gradients (same weights, ~4× faster); prices.attrs["extended"] is a count (a list there made pandas deep-copy
  it on every op). New profile's first feed ≈ 4 s; requests during the startup warm-up can wait ~30 s: start the API early.
- `DIRECT_BNCD = false`, labels "Simuler l’achat" / "Si j’achetais". Account without a backend profile shows a questionnaire prompt.
- UI added: 6-step pipeline timeline with traces, scrubbable outlook chart, sensitivity control (API figure only, no UI-drawn path),
  "Si j’achetais X %" slider (re-calls `/api/card?weight=`).
- ESG: ESGV methodology cited from Vanguard's page (`docs/esg-evidence.md`, read 2026-11-15) in `data.ESG_EVIDENCE` and decide's message.
- Pitch deck: Slides artifact https://claude.ai/artifact/2YwcQXJZhPt5QoErAi3niF (11 slides, private until shared).
