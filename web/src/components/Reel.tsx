import { memo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FeedItem, Ticker } from '../types';
import { useDoubleTap } from '../hooks/useDoubleTap';
import { ProductCard } from './ProductCard';
import { FavoriteBurst } from './FavoriteBurst';

interface ReelProps {
  item: FeedItem;
  index: number;
  heavy: boolean;
  active: boolean;
  leaving: boolean;
  isFavorite: boolean;
  registerReel: (el: HTMLElement | null) => void | (() => void);
  onActivate: (key: string) => void;
  onToggleFavorite: (ticker: Ticker) => void;
  onFavoriteOnly: (ticker: Ticker) => void;
  onBuy: (ticker: Ticker, quantity: number) => void;
  onHide: (item: FeedItem) => void;
}

function ReelImpl({
  item,
  index,
  heavy,
  active,
  leaving,
  isFavorite,
  registerReel,
  onActivate,
  onToggleFavorite,
  onFavoriteOnly,
  onBuy,
  onHide,
}: ReelProps) {
  const { product } = item;
  const [burstKey, setBurstKey] = useState(0);
  const doubleTap = useDoubleTap(() => {
    onFavoriteOnly(product.ticker);
    setBurstKey((k) => k + 1);
  });

  return (
    <article
      className={'reel' + (product.live ? ' reel--live' : '') + (leaving ? ' reel--leaving' : '')}
      ref={registerReel}
      data-key={item.key}
      tabIndex={-1}
      aria-label={product.name}
      aria-posinset={index + 1}
      aria-setsize={-1}
      style={{ '--brand': product.brandColor } as CSSProperties}
      onFocusCapture={() => onActivate(item.key)}
      onPointerDown={doubleTap.onPointerDown}
      onPointerUp={doubleTap.onPointerUp}
    >
      {heavy ? (
        <ProductCard
          product={product}
          active={active}
          isFavorite={isFavorite}
          onToggleFavorite={() => onToggleFavorite(product.ticker)}
          onBuy={(quantity) => onBuy(product.ticker, quantity)}
          onHide={() => onHide(item)}
        />
      ) : (
        <div className="reel__placeholder" aria-hidden="true" />
      )}
      {burstKey > 0 && <FavoriteBurst burstKey={burstKey} />}
    </article>
  );
}

export const Reel = memo(ReelImpl);
