# Game plan

## The moment the task drops (first 30 minutes)
1. Drop the statement, rubric and data files into `docs/given/` and `data/raw/`, then tell Claude "the task is out".
2. Extract the **judging criteria and their weights**. Every hour spent should map to a criterion.
3. List the deliverables and their format (demo? slides? notebook? repo? video? time limit?).
4. Run the data quality report on every file. Write down what is missing or odd — that list is slide material.
5. Decide the one-sentence pitch before writing code.

## Our angle (from what the sponsors stressed)
Most teams will build "optimizer + chatbot". The workshops reward the opposite order: **investor first, product last,
and a visible trail of reasoning**. Our differentiators:
- **Capacity vs tolerance, horizon vs age** handled explicitly, with the binding constraint named.
- **"Where the money goes vs where the risk comes from"** chart and ETF look-through for hidden overlap.
- **Honest refusals**: an emergency fund or a 1-year down payment gets "do not put this in the market".
- **Every number is clickable back to data + date window**; the LLM never does arithmetic.
- **"What would change the answer?"** shown as live sensitivity (move horizon slider → see the proposal move).
- A **stress view**: worst 12 months and worst drawdown in dollars for the investor's actual amount.

## Persona test set (build early, reuse in the demo)
| Persona | Trap it tests |
|---|---|
| 24-year-old, down payment in 2 years, "loves risk" | horizon overrides tolerance |
| 60-year-old, retiring at 65, large pension elsewhere | age ≠ horizon; other assets matter |
| Emergency fund, 6 months of expenses | right answer is cash/GIC, not markets |
| High earner, 20-year horizon, tech employee with employer stock | hidden concentration |
| Retiree needing income, low capacity | income objective, sequence risk |
| ESG investor excluding energy | hard exclusion vs soft preference |
| Canadian-heavy portfolio with ZEQT asking about XSP | overlap, home bias, CAD hedging (workshop demo) |

## Pitfalls checklist (AWS cheat sheet + finance workshop)
- [ ] Adjusted prices, not raw (splits)
- [ ] No information used before its publication date
- [ ] Returns always shown with period, volatility, max drawdown
- [ ] Currency stated; CAD vs USD exposure identified
- [ ] Price return vs total return clarified
- [ ] Fees (MER) considered for funds/ETFs
- [ ] Sources, dates, transformations, missing data documented
- [ ] "Past performance ≠ future returns" and "not personalised advice" visible

## Time budget (adapt to the real deadline)
- 10% understand statement + data · 35% core engine on real data · 25% demo app + explanation layer ·
  20% slides, story, rehearsal · 10% buffer. Freeze features 3 hours before submission.

## Commands
```
.venv\Scripts\python -m pytest -q          # sanity check
.venv\Scripts\streamlit run app.py         # demo
.venv\Scripts\jupyter lab                  # exploration
.venv\Scripts\python scripts\check_aws.py --agents   # agents Bedrock (clé dans .env)
```
