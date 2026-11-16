import { BookmarkIcon } from './Icons';

// `burstKey` remounts the element so the CSS animation restarts on every double-tap.
export function FavoriteBurst({ burstKey }: { burstKey: number }) {
  return (
    <div className="burst" key={burstKey} aria-hidden="true">
      <BookmarkIcon filled />
    </div>
  );
}
