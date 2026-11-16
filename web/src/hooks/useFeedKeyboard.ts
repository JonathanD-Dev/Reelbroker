import { useEffect, useRef } from 'react';

interface FeedKeyboardOptions {
  onNext: () => void;
  onPrev: () => void;
  isBusy: () => boolean;
}

const NEXT = new Set(['ArrowDown', 'PageDown', 'j']);
const PREV = new Set(['ArrowUp', 'PageUp', 'k']);

function canScrollInside(target: Element, key: string): boolean {
  const content = target.closest<HTMLElement>('.reel__content');
  if (!content) return false;
  if (key === 'ArrowUp') return content.scrollTop > 0;
  if (key === 'ArrowDown') return content.scrollTop + content.clientHeight < content.scrollHeight;
  return false;
}

export function useFeedKeyboard(options: FeedKeyboardOptions) {
  const ref = useRef(options);
  useEffect(() => {
    ref.current = options;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const next = NEXT.has(e.key);
      const prev = PREV.has(e.key);
      if (!next && !prev) return;
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (ref.current.isBusy()) return;
      if (target && canScrollInside(target, e.key)) return;
      e.preventDefault();
      if (next) ref.current.onNext();
      else ref.current.onPrev();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
