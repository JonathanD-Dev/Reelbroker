import { useLayoutEffect, useRef } from 'react';

/**
 * Reasons of a feed card that fill the room left on the card: every reason that fits is shown in
 * full; the first one that does not fit is cut at its last whole line ("…"); the next ones are
 * hidden (they stay in "See more data"). Recomputed when the card is resized.
 *
 * The list must have a definite height (flex: 1 in its column). The text of each reason is in a
 * span, so the item keeps its bullet when the text is cut. Styles are set on the DOM directly:
 * no re-render, and React never manages them.
 */
export function FitReasons({ reasons, marker }: { reasons: string[]; /** Source reference after each reason, e.g. "①". */ marker?: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const fit = () => {
      const items = [...ul.children] as HTMLElement[];
      for (const li of items) {
        li.style.display = '';
        li.querySelector<HTMLElement>('.reason__text')?.removeAttribute('style');
      }
      const box = ul.getBoundingClientRect();
      if (box.height === 0) return; // no layout (tests, hidden card): show everything
      let full = true;
      for (const li of items) {
        if (!full) {
          li.style.display = 'none';
          continue;
        }
        const r = li.getBoundingClientRect();
        if (r.bottom <= box.bottom + 0.5) continue;
        full = false;
        const text = li.querySelector<HTMLElement>('.reason__text')!;
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 18;
        const lines = Math.floor((box.bottom - r.top) / lineHeight + 0.01);
        if (lines < 1) {
          li.style.display = 'none';
        } else {
          text.style.display = '-webkit-box';
          text.style.setProperty('-webkit-line-clamp', String(lines));
          text.style.setProperty('line-clamp', String(lines));
          text.style.setProperty('-webkit-box-orient', 'vertical');
          text.style.overflow = 'hidden';
        }
      }
    };
    fit();
    // The web font changes how the text wraps without changing the list's own size: measure again then.
    let alive = true;
    document.fonts?.ready.then(() => alive && fit());
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        alive = false;
      };
    }
    // The list (room available), its card body and each text (wrapping) are watched. A pass ends with
    // the same sizes it started from, so it does not trigger itself again.
    const ro = new ResizeObserver(fit);
    ro.observe(ul);
    if (ul.parentElement) ro.observe(ul.parentElement);
    ul.querySelectorAll('.reason__text').forEach((el) => ro.observe(el));
    // Cards are laid out before they scroll into view: measure again when the card is shown.
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && fit());
    io?.observe(ul);
    return () => {
      alive = false;
      ro.disconnect();
      io?.disconnect();
    };
  }, [reasons]);

  return (
    <ul ref={ref} className="reasons reasons--fit">
      {reasons.map((r) => (
        <li key={r}>
          <span className="reason__text">
            {r}
            {marker && (
              <span className="reason__ref" aria-label="source 1">
                {' '}
                {marker}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
