import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { Position } from '../lib/account';
import type { Product } from '../types';
import { getCatalog } from '../lib/catalog';
import { DIRECT_BNCD } from '../lib/bncd';
import { changeOf, formatChange, trendOf } from '../lib/saved';
import { formatUsd } from '../lib/format';
import { TickerLogo } from './TickerLogo';
import { Sparkline } from './Sparkline';
import { BottomSheet } from './BottomSheet';

/** Rows shown when the available height cannot be measured (no layout, e.g. tests). */
export const FALLBACK_ROWS = 3;
const FALLBACK_ROW_HEIGHT = 46;

const catalogByTicker = () => new Map(getCatalog().map((p) => [p.ticker, p]));

interface Row {
  pos: Position;
  product: Product | null;
  change: number;
}

function PositionRow({ pos, product, change }: Row) {
  const trend = trendOf(change);
  return (
    <li className="pos-row">
      {product ? (
        <TickerLogo ticker={product.ticker} name={product.name} color={product.brandColor} size={28} />
      ) : (
        <span className="pos-row__logo-placeholder" aria-hidden="true" />
      )}
      <span className="pos-row__id">
        <span className="pos-row__ticker">
          {pos.ticker} <span className="pos-row__qty">×{pos.quantity}</span>
        </span>
        {pos.unconfirmed && DIRECT_BNCD ? (
          <span className="pos-row__unconfirmed">Achat BNCD non confirmé</span>
        ) : (
          product && <span className="pos-row__name">{product.name}</span>
        )}
      </span>
      {product ? <Sparkline series={product.history[0]} trend={trend} /> : <span aria-hidden="true" />}
      <span className="pos-row__price">
        <span className="pos-row__value">{formatUsd(pos.quantity * pos.price)}</span>
        {product && (
          <span className={`saved-row__pill saved-row__pill--${trend}`}>
            {formatChange(change)}
            <span className="sr-only"> sur 12 mois</span>
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Compact list of a portfolio's positions (saved-list style), sorted by the largest 12-month
 * variation first. It fills the free height of the card and shows only the rows that fit, so
 * the Profile page needs no scrolling on a phone; the full list opens in a bottom sheet.
 */
export function PositionList({ positions, portfolioName }: { positions: Position[]; portfolioName: string }) {
  const id = useId();
  const rowsRef = useRef<HTMLUListElement>(null);
  const [fit, setFit] = useState(FALLBACK_ROWS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const byTicker = catalogByTicker();
  const rows: Row[] = positions
    .map((pos) => {
      const product = byTicker.get(pos.ticker) ?? null;
      return { pos, product, change: product ? changeOf(product) : 0 };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Number of rows that fit in the space the card gives to the list (re-measured on resize).
  useLayoutEffect(() => {
    const el = rowsRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.clientHeight;
      if (height <= 0) return; // not laid out (tests, hidden tab): keep the fallback
      const first = el.querySelector<HTMLElement>('.pos-row');
      const rowHeight = first?.offsetHeight || FALLBACK_ROW_HEIGHT;
      setFit(Math.max(0, Math.floor(height / rowHeight)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = rows.slice(0, fit);
  const hidden = rows.length - shown.length;

  return (
    <div className="pos-list">
      <p className="pos-list__title" id={id}>
        Positions ({positions.length}) · plus fortes variations
      </p>
      <ul className="pos-list__rows" aria-labelledby={id} ref={rowsRef}>
        {shown.map((r) => (
          <PositionRow key={r.pos.ticker} {...r} />
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="pos-list__more"
          aria-haspopup="dialog"
          onClick={() => setSheetOpen(true)}
        >
          Voir toutes les positions ({rows.length})
        </button>
      )}
      <BottomSheet open={sheetOpen} label={`Positions de ${portfolioName}`} onClose={() => setSheetOpen(false)}>
        <div className="pos-sheet">
          <p className="pos-sheet__title">
            {portfolioName} · {rows.length} positions
          </p>
          <ul className="pos-sheet__rows" aria-label={`Positions de ${portfolioName}`}>
            {rows.map((r) => (
              <PositionRow key={r.pos.ticker} {...r} />
            ))}
          </ul>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog */}
          <button type="button" className="sheet__cancel" autoFocus onClick={() => setSheetOpen(false)}>
            Fermer
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
