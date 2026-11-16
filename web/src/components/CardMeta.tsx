import type { Product } from '../types';
import { TickerLogo } from './TickerLogo';
import { RatingBadge } from './Rating';

interface CardMetaProps {
  product: Product;
  expanded: boolean;
  /** Detailed view scrolled down: the header band slides away (it comes back on the way up). */
  headerHidden?: boolean;
  onToggleExpanded: () => void;
}

export function CardMeta({ product, expanded, headerHidden = false, onToggleExpanded }: CardMetaProps) {
  return (
    // Detailed view: the identity becomes a header band at the top (docs/mockups-see-more-meme-contenu.png, header of C).
    <div
      className={'card-meta' + (expanded ? ' card-meta--header' : '') + (headerHidden ? ' card-meta--hidden' : '')}
      inert={headerHidden || undefined}
    >
      <div className="card-meta__id">
        <TickerLogo ticker={product.ticker} name={product.name} color={product.brandColor} />
        <div className="card-meta__text">
          <span className="card-meta__ticker">
            {product.ticker} <RatingBadge ticker={product.ticker} />
          </span>
          <span className="card-meta__name">{product.name}</span>
        </div>
      </div>
      <button
        type="button"
        className="link-btn"
        aria-expanded={expanded}
        onClick={onToggleExpanded}
      >
        {expanded ? 'See less data' : 'See more data'}
      </button>
    </div>
  );
}
