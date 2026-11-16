/** Placeholder shown while the feed loads from the API (one card-shaped screen). */
export function FeedSkeleton() {
  return (
    <main className="app-main feed-skeleton" role="status" aria-busy="true" aria-label="Chargement des idées d’investissement">
      <div className="feed-skeleton__card">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line" style={{ width: '80%' }} />
        <div className="skeleton skeleton--line" style={{ width: '65%' }} />
        <div className="skeleton skeleton--chart" />
      </div>
    </main>
  );
}
