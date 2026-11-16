import type { Product } from '../types';
import { formatDate } from '../lib/format';
import { FitReasons } from './FitReasons';
import { CardInsights } from './CardInsights';
import { SourcesSheet } from './SourcesSheet';

const VERDICT_ICON = { compatible: '✓', tension: '!', conflict: '✕' } as const;

/** Fit verdict of the card for the active profile (compatible / tension / conflit), with its label. */
export function FitBadge({ fit }: { fit: NonNullable<Product['live']>['fit'] }) {
  return (
    <p className={`fit-badge fit-badge--${fit.verdict}`} data-testid="fit-badge">
      <span className="fit-badge__icon" aria-hidden="true">
        {VERDICT_ICON[fit.verdict]}
      </span>
      <span>{fit.label}</span>
    </p>
  );
}

export function CardSummary({ product }: { product: Product }) {
  return (
    <div className="card__body card__body--summary">
      {product.live ? (
        <>
          <h2 className="card__title card__title--fit">Adéquation à votre profil</h2>
          <FitBadge fit={product.live.fit} />
          {product.live.extras && <CardInsights extras={product.live.extras} />}
        </>
      ) : (
        <h2 className="card__title">Buy</h2>
      )}
      <p className="card__why">Pourquoi :</p>
      {product.live && !product.live.extras && (
        // Older snapshot without structured sources: the former plain line.
        <p className="card__source">
          Source : {product.live.source} · au {formatDate(product.live.asOf)} · {product.live.currency}
        </p>
      )}
      {product.live ? (
        <>
          {/* Every reason, filling the room left above the sources (full list also in "See more data").
              The reasons are computed from the prices: source ①. */}
          <FitReasons reasons={product.reasons} marker={product.live.extras ? '①' : undefined} />
          <SourcesSheet
            ticker={product.ticker}
            name={product.name}
            asOf={product.live.asOf}
            currency={product.live.currency}
            source={product.live.source}
            extras={product.live.extras}
          />
        </>
      ) : (
        <ul className="reasons">
          {product.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
