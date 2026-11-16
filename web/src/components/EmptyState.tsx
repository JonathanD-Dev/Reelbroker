import { useEffect, useRef } from 'react';

interface EmptyStateProps {
  onReset: () => void;
  focusOnMount?: boolean;
}

export function EmptyState({ onReset, focusOnMount = false }: EmptyStateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);
  return (
    <div className="empty-state">
      <h2 tabIndex={-1} ref={headingRef}>
        Plus aucun produit à afficher
      </h2>
      <button type="button" className="primary-btn" onClick={onReset}>
        Réafficher les produits masqués
      </button>
    </div>
  );
}
