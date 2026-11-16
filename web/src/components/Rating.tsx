import type { Ticker } from '../types';
import { RATING_LABEL, useRatings } from '../hooks/useRatings';
import type { Rating } from '../hooks/useRatings';

// Double chevrons (option B of docs/mockups/rating). Change the glyphs here only.
const GLYPH: Record<Rating, string> = {
  up: 'M7 11l5-5 5 5M7 18l5-5 5 5',
  down: 'M7 6l5 5 5-5M7 13l5 5 5-5',
};

export function RatingIcon({ rating, size = 22 }: { rating: Rating; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={GLYPH[rating]} />
    </svg>
  );
}

/** "Pour" / "Contre" buttons of the card rail. Mutually exclusive; a second tap clears. */
export function RatingButtons({ ticker, productName }: { ticker: Ticker; productName: string }) {
  const api = useRatings();
  if (!api) return null;
  const current = api.get(ticker);
  return (
    <div className="rating-buttons" role="group" aria-label={`Votre note sur ${productName}`}>
      {(['up', 'down'] as const).map((r) => {
        const on = current === r;
        return (
          <button
            key={r}
            type="button"
            className={`rail-btn rating-btn rating-btn--${r}` + (on ? ' rating-btn--on' : '')}
            aria-pressed={on}
            aria-label={RATING_LABEL[r]}
            onClick={() => api.rate(ticker, r)}
          >
            <span className="rating-btn__icon">
              <RatingIcon rating={r} />
            </span>
            <span aria-hidden="true">{RATING_LABEL[r]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Small note shown on the product (card identity, saved list row). Nothing when unrated. */
export function RatingBadge({ ticker }: { ticker: Ticker }) {
  const rating = useRatings()?.get(ticker) ?? null;
  if (!rating) return null;
  return (
    <span className={`rating-badge rating-badge--${rating}`}>
      <RatingIcon rating={rating} size={13} />
      <span>
        <span className="sr-only">Votre note : </span>
        {RATING_LABEL[rating]}
      </span>
    </span>
  );
}
