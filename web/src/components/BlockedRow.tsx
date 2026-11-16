import type { Product } from '../types';
import { changeOf, formatChange, trendOf } from '../lib/saved';
import { formatUsd } from '../lib/format';
import { TickerLogo } from './TickerLogo';

/** Row of the "Bloqués" tab: a product hidden with "Don't show me again", with "Débloquer". */
export function BlockedRow({ product, onUnblock }: { product: Product; onUnblock: () => void }) {
  const change = changeOf(product);
  const trend = trendOf(change);
  return (
    <li className="saved-row blocked-row">
      <div className="blocked-row__main">
        <TickerLogo ticker={product.ticker} name={product.name} color={product.brandColor} size={40} />
        <span className="saved-row__id">
          <span className="saved-row__ticker">{product.ticker}</span>
          <span className="saved-row__name">{product.name}</span>
        </span>
        <span className="saved-row__price">
          <span className="saved-row__value">{formatUsd(product.price)}</span>
          <span className={`saved-row__pill saved-row__pill--${trend}`}>
            {formatChange(change)}
            <span className="sr-only"> sur 12 mois</span>
          </span>
        </span>
        <button type="button" className="blocked-row__unblock" aria-label={`Débloquer ${product.name}`} onClick={onUnblock}>
          Débloquer
        </button>
      </div>
    </li>
  );
}
