import { useId, useState } from 'react';
import type { CardExtras, RiskTag } from '../lib/api';
import { formatPct } from '../lib/format';

/**
 * Feed card, under the fit verdict: risk categories (tap one to read the rule or the figure behind
 * it) and, when dividends are a meaningful part of it, where the gain over 5 years came from.
 * Data: backend alphaforge/card_extras.py (code only).
 */
const DOT: Record<RiskTag['level'], string> = { high: '●', medium: '●', low: '○', info: '●' };
const signed = (x: number) => formatPct(x, 0, true).replace('-', '−');

export function CardInsights({ extras }: { extras: CardExtras }) {
  const uid = useId();
  const [open, setOpen] = useState<string | null>(null);
  const tags = extras.risk_tags ?? [];
  const inc = extras.income;
  const shown = tags.find((t) => t.code === open) ?? null;

  return (
    <div className="card-insights" data-testid="card-insights">
      {tags.length > 0 && (
        <>
          <ul className="risk-tags" aria-label="Risques à comprendre">
            <li className="risk-tags__title" aria-hidden="true">
              Risques :
            </li>
            {tags.map((t) => (
              <li key={t.code}>
                <button
                  type="button"
                  className={`risk-tag risk-tag--${t.level}` + (open === t.code ? ' risk-tag--open' : '')}
                  aria-expanded={open === t.code}
                  aria-controls={`${uid}-basis`}
                  onClick={() => setOpen((o) => (o === t.code ? null : t.code))}
                >
                  <span aria-hidden="true">{DOT[t.level]}</span> {t.label}
                </button>
              </li>
            ))}
          </ul>
          <p id={`${uid}-basis`} className="risk-tags__basis" aria-live="polite" hidden={!shown}>
            {shown?.basis}
          </p>
        </>
      )}
      {inc?.show && (
        <div className="income-split" data-testid="income-split">
          <p className="income-split__head">
            <span>Gain 5 ans</span>
            <strong style={{ color: inc.total >= 0 ? '#3e6246' : '#ba1218' }}>{signed(inc.total)}</strong>
          </p>
          <IncomeBar price={inc.price} dividends={inc.dividends} note={incomeNote(inc)} />
        </div>
      )}
    </div>
  );
}

/** One sentence on the split (also shown in the sources panel). */
export function incomeNote(inc: NonNullable<CardExtras['income']>): string {
  const head =
    inc.price < 0
      ? `Les dividendes (${signed(inc.dividends)}) ont compensé la baisse du prix (${signed(inc.price)})`
      : `${Math.round(inc.dividend_share * 100)} % du gain vient des dividendes`;
  return (
    head +
    (inc.n_payments ? `, ${inc.n_payments} versements` : '') +
    (inc.yield_12m ? `, 12 derniers mois : ${formatPct(inc.yield_12m, 1)} du cours` : '') +
    (inc.currency !== 'CAD' ? `, calcul en ${inc.currency}` : '') +
    '.'
  );
}

/** Price part and dividend part side by side; a falling price is drawn in red, left of the dividends. */
function IncomeBar({ price, dividends, note }: { price: number; dividends: number; note: string }) {
  const p = Math.abs(price);
  const d = Math.max(dividends, 0);
  const sum = p + d || 1;
  const pw = price === 0 ? 0 : Math.max(6, (p / sum) * 100);
  // Bar without text; the figures sit under it, price at the left end and dividends at the right end.
  return (
    <div className="income-bar-wrap" role="img" aria-label={`Prix ${signed(price)}, dividendes ${signed(dividends)}. ${note}`} title={note}>
      <div className="income-bar" aria-hidden="true">
        {price !== 0 && (
          <span className={'income-bar__price' + (price < 0 ? ' income-bar__price--down' : '')} style={{ width: `${pw}%` }} />
        )}
        <span className="income-bar__div" style={{ width: `${100 - pw}%` }} />
      </div>
      <p className="income-bar__legend" aria-hidden="true">
        <span className={'income-bar__lprice' + (price < 0 ? ' income-bar__lprice--down' : '')}>Prix {signed(price)}</span>
        <span className="income-bar__ldiv">Dividendes {signed(dividends)}</span>
      </p>
    </div>
  );
}
