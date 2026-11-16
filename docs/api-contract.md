# Contrat API — backend Python (FastAPI) ↔ interface React (`web/`)

Base URL in dev: `http://localhost:8000/api` (Vite proxies `/api` → `:8000`). All JSON, UTF-8, French strings.
Every number shown in the UI comes from this API (code calculates). The model only writes text, checked by
`agents.validate_explanation`. Every response that carries figures also carries `source` and `as_of`.

Rules the backend enforces everywhere:
- Simulation only: no endpoint sends an order anywhere. `simulated: true` on every purchase.
- Never the word "prédiction" for a single number: the 5-year view is always three hypothetical scenarios
  (`best`, `central`, `worst`) + method + limits + `disclaimer`.
- Prices in CAD (starter data converted with Bank of Canada USD/CAD), unless `currency` says otherwise.

## Profiles

`GET /api/personas` → `[{id:"amira"|"mateo"|"robert", name, summary}]`

`GET /api/questionnaire/next?answers=<json>&scope=account|portfolio`
→ `{done:false, question:{id, level, type:"single"|"multi"|"number"|"text", element, text, choices:[{code,label}], help?}}`
or `{done:true}`. Text of the risk scenario question uses real drawdowns (questionnaire.question_text).

`POST /api/profile` body `{answers:{...}, name}` or `{persona:"robert"}`
→ `{profile_id, name, declared:{...build_declared}, profile:{objective, horizon_years, risk_tolerance, risk_capacity,
   level, level_label, excluded, preferred, avoided}, reasoning:[str], contradictions:[{...}], notes:[str]}`
Profiles are kept server-side in memory + `outputs/profiles.json` (fictional data only).

## Feed (cards)

`GET /api/feed?profile_id=..&limit=20[&exclude=AAPL,KO,..]` → `{items:[Card], remaining, state:{liked,disliked,neutral,hidden,saved}}`

Progressive feed: the web client asks `limit=5` and passes in `exclude` every ticker it already received, so each page is re-ranked with the current reactions (Pour / Contre). It keeps at least 5 cards loaded ahead of the one on screen. `remaining` is the number of cards still available after this page; at 0 the client replays the cards it has (infinite feed). The Saved and Profile pages ask the rest in one call (`include_seen=true&limit=100&exclude=..`).

`Card` (shape chosen to map 1:1 onto `web/src/types.ts` Product):
```
{ ticker, name, sector, asset_class, currency:"CAD", price, as_of:"2026-11-12",
  brandColor,                          // deterministic from ticker
  fit:{verdict:"compatible"|"tension"|"conflict", label, weight},
  reasons:[str],                       // the "Pourquoi" bullets, from code facts
  history:[{title:"Cours (12 mois)", points:[{label, value}]},
           {title:"Valeur de 10 000 $ sur 5 ans", points:[...]}],
  stats:{cagr, vol, max_drawdown, sharpe, worst_1y, window:[start,end]},
  tags:[str], source:"alphaforge_starter (Yahoo Finance adj_close, BoC FX)" }
```

`POST /api/feed/react` body `{profile_id, ticker, action:"like"|"dislike"|"neutral"|"save"|"unsave"|"hide"|"unhide"}`
→ `{state}`. Likes reorder the feed, never the risk limits.

## Card details ("Voir plus") — the 4-agent pipeline

`GET /api/card/{ticker}?profile_id=..&quantity=10` →
```
{ card:Card,
  impact:{weight, fit:{...}, before:{vol,max_drawdown,...}, after:{...}, notes:[str]},
  outlook:{                             // Predictor output (hypothetical scenarios, NOT a forecast)
    horizon_years:5, start_value, quantity, currency,
    scenarios:{ best:{label:"Scénario favorable", annual, final, path:[{month,value}]},
                central:{label:"Notre scénario central", annual, final, path:[...]},
                worst:{label:"Scénario défavorable", annual, final, path:[...]} },
    share_below_start, method:str, assumptions:[str], limits:[str],
    disclaimer:"Scénarios hypothétiques, pas une prévision ni un conseil financier. Les rendements passés ne garantissent pas les rendements futurs." },
  pipeline:{
    sources:[{id,name,url,kind,license,as_of,chosen_because}],        // Source Finder
    fact_check:{passed, checks:[{name, ok, detail}]},                 // Fact-Checker
    data:{source_id, currency, start, end, n_obs, missing_days, notes:[str]},  // Data Collector
    explanation:{mode:"bedrock"|"offline", short, long, governance:{passed, issues}},
    trace:[{agent, step, tool?, inputs?, outputs?, ms}]
  } }
```
`path` is monthly, 61 points (month 0..60), in currency units for `quantity` shares.

`POST /api/pipeline/run` body `{ticker, force_offline?:bool, use_network?:bool}` → the `pipeline` + `outlook` blocks
(used by the "Comment ce chiffre a été obtenu" panel and by tests).

## Decide / learn

`POST /api/check` body `{profile_id, text}` or `{profile_id, ticker, weight}` → `decide.check_intention` result,
plus `explanation` (same governance as above).

`POST /api/purchase` body `{profile_id, tickers:[..], weight}` → `feed.simulate_purchase` result, `simulated:true`.

`GET /api/profile/{id}/learn` → `learn.compare` result (declared vs revealed).

## Additions made during implementation
- `/api/feed?include_seen=false`: liked / disliked / neutral cards leave the feed (same as Streamlit).
- `/api/check`: `weight` is a fraction (0–1); optional `choice` = keep|adjust|drop records the decision in the learn
  journal; unparseable text → 200 `{ok:false, message}`.
- `/api/purchase` also records in the learn journal. `/api/card?weight=0.05` sets the impact weight.
- `/api/pipeline/run` accepts `quantity`. `unhide` is handled by the API.

## Health

`GET /api/health` → `{ok, data_as_of, bedrock:{connected, region, model}, version}`

## Additions (batch 2)

- `profile_id` is **required** on `GET /api/feed` and `GET /api/card/{ticker}` (404 if unknown). `limit` 1-100 (default 20); optional `exclude` (comma-separated tickers, unknown ones ignored); optional `include_seen` (default false: cards already liked/disliked/neutral are omitted).
- `POST /api/profile` with `{persona}` is idempotent: persona profiles have stable ids `amira`, `mateo`, `robert` and the existing profile (with its feed state) is returned, unless `reset: true` is sent. Creating a profile starts a background warm-up (full feed, then card details of the first 8 cards), so the first `GET /api/feed` is fast; a request that arrives early waits for the same computation.
- `outlook` also carries (from `alphaforge.pipeline.predictor`): `sensitivity:[{shrink, erp, central_annual}]`, `sensitivity_summary:str`, and `history:{cagr, vol_annual, years, window, shrunk_mu_annual, beta, beta_proxy, erp}`, plus `p5_final`, `p95_final`.
- `POST /api/check` also accepts `choice: "keep"|"adjust"|"drop"` (recorded in the learn journal); `weight` is a fraction in (0,1]; unparseable `text` returns 200 `{ok:false, parsed, message}`.
- `POST /api/purchase` appends its decisions to the learn journal. `GET /api/card` accepts `weight` (default 0.05) for the impact block.

## Snapshot (`web/public/snapshot.json`, written by `scripts/export_snapshot.py`)

`{ note, personas: { amira|mateo|robert: { profile: <POST /api/profile response>, feed: [Card], details: { <ticker>: <GET /api/card response> } } } }`
`details` covers every card of `feed`. Pass `--strip-trace` to drop `pipeline.trace` if the file grows past ~3 MB (currently 1.4 MB with traces).

## Tolerance update (batch 4)

`POST /api/profile/{id}/tolerance` body `{level:1..5, confirm?:bool}` -> `{learn:<learn.compare>, profile_id, name, declared, profile, reasoning, contradictions, notes}`.
Only the declared tolerance changes (objective, horizon, capacity untouched), so the retained level stays capped (Robert stays at 2). Allowed only if `level` equals the current `learn.update_to`, or with `confirm:true`; otherwise 409 with a French message. 404 unknown profile, 422 level outside 1-5. The profile's feed is recomputed in the background; the override is persisted.

## Hypotheses (batch 5)

`GET /api/hypotheses` -> `[{group, label, value, value_fr, source:"hypothèse"|"donnée"|"règle", code_ref:"alphaforge/x.py:CONST"}]`, built from the code constants at request time (risk budgets, caps, allocation floors, risk-free rate, scenario parameters, learning window, data window, FX method, CNQ.TO 2022-08-22 artefact, survivorship bias, absence of ESG data). The snapshot carries it as top-level `hypotheses`: `{note, hypotheses:[...], personas:{...}}`.

## Record a decision (batch 6)

`POST /api/check` with `{profile_id, ticker, weight, choice:"keep"|"adjust"|"drop", record_only:true, decision_id?:str<=64, adjusted_weight?:float}` -> `{recorded, duplicate, entry, learn:<learn.compare>}` in under a second: the verdict is recomputed in code, no explanation/Bedrock call. The same `decision_id` is recorded once (second call: `recorded:false, duplicate:true`). For `adjust`, the recorded weight is `adjusted_weight`, else the check's `max_weight_within_profile`. 422 if ticker, weight or choice is missing.

## Daily prices (price chart of the detailed view)

`GET /api/prices/{ticker}` → `{ ticker, currency: "CAD", as_of, source, frequency: "daily", note, points: [{ date: "YYYY-MM-DD", value }] }`

- Every daily close of the dataset for the ticker (adjusted close, converted to CAD like the cards), from the first to the last date of the data (2021-11-12 to 2026-11-12, about 1,280 points).
- No `profile_id`; read-only. It does not call the agents or the pipeline and does not wait for `_COMPUTE` once the data is loaded.
- 404 for an unknown ticker (case-insensitive, like `/api/card`).
- No intraday data: the "1 J" period of the chart compares the last two closes.
- The frontend (`web/src/components/PriceHistoryChart.tsx`) cuts the periods 1 J, 1 S, 1 M, 3 M, 6 M, 1 A, 5 A and Tout from this series. When the route does not answer, it falls back to the 52 weekly points of `history[0]` of the card (1 J and 1 S are then disabled).

## Card extras (feed cards and card details)

Every card (`GET /api/feed` items and `card` of `GET /api/card/{ticker}`) carries `extras`, computed by `alphaforge/card_extras.py` (code only, not the agent pipeline; independent of the profile):

- `income`: `{ window, currency, total, price, dividends, dividend_share, show, n_payments, per_share, yield_12m, method }`. Gain over 5 years split between the price change (close) and the dividends (adjusted close minus close), in listing currency. `show` is false when dividends are less than 10 % of the gain. `n_payments`, `per_share` and `yield_12m` come from `corporate_actions.csv` (starter dataset only; `null` for the extended universe).
- `risk_tags`: `[{ code, label, level, basis }]`, `level` in `high | medium | low | info`. Categories of the workshop (market, concentration, sector, rates, credit, custody, currency); `basis` is the figure or the rule behind the tag (e.g. the card's volatility and the 15 % / 30 % thresholds).
- `sources`: `[{ id, label, detail, url }]`, numbered ① prices (Yahoo Finance, starter or extended universe), ② Bank of Canada USD/CAD for USD-listed assets.

The feed card shows the tags, the price / dividend bar (when `show`), a ① after each reason, and a tappable sources line. It opens a panel with the sources, the method and the pipeline's fact-check (`pipeline.fact_check` of `GET /api/card/{ticker}`, loaded only when the panel is opened).
