import { useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import type { Product } from '../types';
import { DEFAULT_QUANTITY } from '../lib/projections';
import { CardSummary } from './CardSummary';
import { CardHero } from './CardHero';
import { CardDetails } from './CardDetails';
import { CardMeta } from './CardMeta';
import { ActionRail } from './ActionRail';

/** Near the top of the detailed view the header always shows. */
const HEADER_SHOW_ZONE = 40;

interface ProductCardProps {
  product: Product;
  active: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Called with the "If I buy" quantity (also used by "Buy now" in the summary view). */
  onBuy: (quantity: number) => void;
  onHide: () => void;
}

export function ProductCard({
  product,
  active,
  isFavorite,
  onToggleFavorite,
  onBuy,
  onHide,
}: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [quantity, setQuantity] = useState(DEFAULT_QUANTITY);
  // Detailed view: the header band slides away while reading down, and comes back on the way up.
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastTop = useRef(0);
  const onDetailsScroll = (e: UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const delta = top - lastTop.current;
    if (Math.abs(delta) < 6) return; // ignore tiny moves (inertia, rounding)
    lastTop.current = top;
    setHeaderHidden(top > HEADER_SHOW_ZONE && delta > 0);
  };

  // A card leaving the screen goes back to its summary view.
  useEffect(() => {
    if (!active) setExpanded(false);
  }, [active]);
  useEffect(() => {
    lastTop.current = 0;
    setHeaderHidden(false);
  }, [expanded]);

  return (
    <>
      <div
        className={
          'reel__content' + (expanded ? ' reel__content--expanded' : product.live ? ' reel__content--hero' : '')
        }
        onScroll={expanded ? onDetailsScroll : undefined}
      >
        {expanded ? (
          <div className="reel__panel">
            <CardDetails product={product} quantity={quantity} onQuantityChange={setQuantity} />
          </div>
        ) : (
          <>
            {/* Real products: price, curve and statistics on top (option C3); the footer keeps the identity. */}
            {product.live && <CardHero product={product} />}
            <CardSummary product={product} />
          </>
        )}
      </div>
      <CardMeta
        product={product}
        expanded={expanded}
        headerHidden={expanded && headerHidden}
        onToggleExpanded={() => setExpanded((e) => !e)}
      />
      <ActionRail
        product={product}
        expanded={expanded}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onBuy={() => onBuy(quantity)}
        onHide={onHide}
      />
    </>
  );
}
