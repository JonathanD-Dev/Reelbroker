import { useState } from 'react';
import type { Product } from '../types';
import { BottomSheet } from './BottomSheet';
import { IdeaCheck } from './IdeaCheck';
import { BookmarkButton } from './BookmarkButton';
import { CartButton } from './CartButton';
import { OverflowMenu } from './OverflowMenu';
import { ExternalIcon } from './Icons';
import { bncdQuoteUrl, bncdViewUrl } from '../lib/bncd';
import { RatingButtons } from './Rating';

interface ActionRailProps {
  product: Product;
  expanded: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBuy: () => void;
  onHide: () => void;
}

export function ActionRail({
  product,
  expanded,
  isFavorite,
  onToggleFavorite,
  onBuy,
  onHide,
}: ActionRailProps) {
  // Real companies open their BNCD quote page directly (new tab).
  const [checkOpen, setCheckOpen] = useState(false);
  const bncdHint = bncdQuoteUrl(product) ? 'Ouvre BNCD dans un nouvel onglet' : undefined;
  // Quote page to look at; products without one (fictional, crypto) keep the simulated purchase.
  const viewUrl = bncdViewUrl(product) ?? undefined;
  return (
    <div className={'action-rail' + (expanded ? ' action-rail--expanded' : '')}>
      <BookmarkButton active={isFavorite} onToggle={onToggleFavorite} label="Favori" />
      <RatingButtons ticker={product.ticker} productName={product.name} />
      {/* "See more data": between "Contre" and "Plus". The rail has a fixed width (global.css), so the
          buttons keep their horizontal place when this wider one appears. */}
      {expanded &&
        (viewUrl ? (
          // "See more data": titles with a BNCD page get a link to the quote (new tab), nothing is bought.
          <a className="rail-btn rail-btn--link" href={viewUrl} target="_blank" rel="noopener noreferrer" aria-label="Voir sur BNCD (nouvel onglet)">
            <ExternalIcon />
            <span aria-hidden="true">Voir sur BNCD</span>
          </a>
        ) : (
          <CartButton onClick={onBuy} label="Simuler" hint={bncdHint} />
        ))}
      <OverflowMenu
        productName={product.name}
        onBuyNow={onBuy}
        onHide={onHide}
        onCheck={product.live ? () => setCheckOpen(true) : undefined}
        buyHint={bncdHint}
        // Titles with a BNCD page: "Voir sur BNCD" (a link to the quote) replaces the purchase item.
        bncdUrl={viewUrl}
      />
      {product.live && (
        <BottomSheet open={checkOpen} label={`Vérifier une idée : ${product.name}`} onClose={() => setCheckOpen(false)}>
          <IdeaCheck initial={{ ticker: product.ticker, weightPct: 5 }} />
          <button type="button" className="sheet__cancel" onClick={() => setCheckOpen(false)}>
            Fermer
          </button>
        </BottomSheet>
      )}
    </div>
  );
}
