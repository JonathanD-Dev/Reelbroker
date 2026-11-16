import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function BottomSheet({ open, label, onClose, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // The feed is made inert while the sheet is open (focus and clicks stay inside the dialog).
  useEffect(() => {
    if (!open) return;
    const feed = document.querySelector('.feed');
    feed?.setAttribute('inert', '');
    return () => feed?.removeAttribute('inert');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    const opener = document.activeElement as HTMLElement | null;
    // First enabled control: a menu item, else any enabled button or field.
    (sheet?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])') ??
      sheet?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled])'))?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (!sheet) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      const items = Array.from(sheet.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      const stops = Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled])'));
      const active = document.activeElement as HTMLElement | null;
      let target: HTMLElement | undefined;
      if (e.key === 'Tab' && stops.length > 0) {
        const i = active ? stops.indexOf(active) : -1;
        const delta = e.shiftKey ? -1 : 1;
        target = stops[(i + delta + stops.length) % stops.length];
      } else if (items.length > 0) {
        const i = active ? items.indexOf(active) : -1;
        if (e.key === 'ArrowDown') target = items[(i + 1) % items.length];
        else if (e.key === 'ArrowUp') target = items[(i - 1 + items.length) % items.length];
        else if (e.key === 'Home') target = items[0];
        else if (e.key === 'End') target = items[items.length - 1];
      }
      if (!target) return;
      e.preventDefault();
      target.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Focus goes back to what opened the sheet (after the feed is no longer inert).
      if (opener && document.contains(opener)) setTimeout(() => opener.focus(), 0);
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    // Pointer events must not bubble through the React tree to the reel (double-tap detection).
    <div className="sheet-root" onPointerDown={stop} onPointerUp={stop}>
      <div className="sheet-backdrop" onPointerDown={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={sheetRef}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
