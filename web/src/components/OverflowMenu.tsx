import { useEffect, useRef, useState } from 'react';
import { BanIcon, CartIcon, ExternalIcon, MenuDotsIcon } from './Icons';
import { BottomSheet } from './BottomSheet';

interface OverflowMenuProps {
  productName: string;
  /** Simulated purchase: used only when the product has no BNCD page (`bncdUrl` absent). */
  onBuyNow: () => void;
  /**
   * BNCD quote page of the product. When set, the menu shows "Voir sur BNCD" (a link opening the
   * quote in a new tab, nothing is bought or recorded) instead of "Simuler l’achat".
   */
  bncdUrl?: string;
  onHide: () => void;
  /** "Vérifier cette idée" (live products only). */
  onCheck?: () => void;
  /** Extra text for screen readers on "Buy now", e.g. "Ouvre BNCD dans un nouvel onglet". */
  buyHint?: string;
}

export function OverflowMenu({ productName, onBuyNow, onHide, onCheck, buyHint, bncdUrl }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  // Focus returns after the sheet (and the inert state of the feed) is gone.
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  const dismiss = () => {
    restoreFocus.current = true;
    setOpen(false);
  };
  const select = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="rail-btn"
        aria-label="Plus d'actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuDotsIcon />
        <span aria-hidden="true">Plus</span>
      </button>
      <BottomSheet open={open} label={'Actions pour ' + productName} onClose={dismiss}>
        <div role="menu" className="sheet__menu">
          {bncdUrl ? (
            // A real link (not window.open): the new tab is never blocked, and it is only a quote page.
            <a
              role="menuitem"
              className="menu-item"
              href={bncdUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <ExternalIcon />
              <span>Voir sur BNCD</span>
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          ) : (
            <button type="button" role="menuitem" className="menu-item" onClick={select(onBuyNow)}>
              <CartIcon />
              <span>Simuler l’achat</span>
              {buyHint && (
                <span className="menu-item__hint" aria-hidden="true">
                  ↗ BNCD
                </span>
              )}
              {buyHint && ' '}
              {buyHint && <span className="sr-only">{`(${buyHint})`}</span>}
            </button>
          )}
          {onCheck && (
            <button type="button" role="menuitem" className="menu-item" onClick={select(onCheck)}>
              <span aria-hidden="true">✓</span>
              <span>Vérifier cette idée</span>
            </button>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={select(onHide)}>
            <BanIcon />
            <span>Don't show me again</span>
          </button>
        </div>
        <button type="button" className="sheet__cancel" onClick={dismiss}>
          Annuler
        </button>
      </BottomSheet>
    </>
  );
}
