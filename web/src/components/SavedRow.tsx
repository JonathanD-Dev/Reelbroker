import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Product } from '../types';
import { changeOf, formatChange, trendOf } from '../lib/saved';
import { formatUsd } from '../lib/format';
import { TickerLogo } from './TickerLogo';
import { Sparkline } from './Sparkline';
import { bncdQuoteUrl } from '../lib/bncd';
import { RatingBadge } from './Rating';
import { RATING_LABEL, useRatings } from '../hooks/useRatings';

/** Width of the red "Retirer" action revealed by a left swipe. */
export const REVEAL = 96;
const DRAG_START = 8;

interface SavedRowProps {
  product: Product;
  onOpen: () => void;
  onRemove: () => void;
}

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  start: number;
  active: boolean;
}

export function SavedRow({ product, onOpen, onRemove }: SavedRowProps) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const change = changeOf(product);
  const trend = trendOf(change);
  const changeText = formatChange(change);
  const trendWord = trend === 'up' ? 'en hausse' : trend === 'down' ? 'en baisse' : 'stable';

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: offset, active: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > DRAG_START && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // vertical scroll: let the list scroll
        return;
      }
      if (Math.abs(dx) <= DRAG_START) return;
      d.active = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setOffset(Math.min(0, Math.max(-REVEAL * 1.25, d.start + dx)));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;
    // Swallow the click that follows a drag, but never a later tap.
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    setDragging(false);
    const dx = e.clientX - d.x;
    setOffset(d.start + dx < -REVEAL / 2 ? -REVEAL : 0);
  };

  const bncdUrl = bncdQuoteUrl(product);

  /** Returns false when the tap was a swipe or closed an open row (no navigation). */
  const shouldOpen = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return false;
    }
    if (offset !== 0) {
      setOffset(0); // first tap on an open row closes it
      return false;
    }
    return true;
  };

  const rating = useRatings()?.get(product.ticker) ?? null;
  const note = rating ? ` Votre note : ${RATING_LABEL[rating]}.` : '';
  const label = `${product.name} (${product.ticker}), ${formatUsd(product.price)}, ${changeText} sur 12 mois, ${trendWord}.${note} ${
    bncdUrl ? 'Voir sur BNCD (nouvel onglet)' : 'Ouvrir dans le fil'
  }`;
  const content = (
    <>
      <TickerLogo ticker={product.ticker} name={product.name} color={product.brandColor} size={40} />
      <span className="saved-row__id">
        <span className="saved-row__ticker">{product.ticker}</span>
        <span className="saved-row__name">{product.name}</span>
        <RatingBadge ticker={product.ticker} />
      </span>
      <Sparkline series={product.history[0]} trend={trend} />
      <span className="saved-row__price">
        <span className="saved-row__value">{formatUsd(product.price)}</span>
        <span className={`saved-row__pill saved-row__pill--${trend}`}>{changeText}</span>
      </span>
    </>
  );

  return (
    <li className="saved-row">
      <div
        className={'saved-row__slide' + (dragging ? ' saved-row__slide--dragging' : '')}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {bncdUrl ? (
          <a
            className="saved-row__main"
            href={bncdUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            draggable={false}
            onClick={(e) => {
              if (!shouldOpen()) e.preventDefault();
            }}
          >
            {content}
          </a>
        ) : (
          <button
            type="button"
            className="saved-row__main"
            aria-label={label}
            onClick={() => {
              if (shouldOpen()) onOpen();
            }}
          >
            {content}
          </button>
        )}
      </div>
      {/* After the row in tab order; keyboard focus slides the row to reveal it. */}
      <button
        type="button"
        className="saved-row__remove"
        aria-label={`Retirer ${product.name} des sauvegardés`}
        onClick={onRemove}
        onFocus={() => setOffset(-REVEAL)}
        onBlur={() => setOffset(0)}
      >
        Retirer
      </button>
    </li>
  );
}
