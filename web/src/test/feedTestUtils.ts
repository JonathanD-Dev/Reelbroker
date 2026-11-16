import { act, screen } from '@testing-library/react';
import type { MockObserverInstance, MediaEnv } from './setup';

interface TestEnv {
  media: MediaEnv;
  MockIntersectionObserver: { registry: MockObserverInstance[] };
  scrollIntoView: ReturnType<typeof import('vitest').vi.fn>;
  scrollTo: ReturnType<typeof import('vitest').vi.fn>;
}

const env = () => (globalThis as unknown as { __testEnv: TestEnv }).__testEnv;

export const scrollIntoViewMock = () => env().scrollIntoView;
export const scrollToMock = () => env().scrollTo;

export function setReducedMotion(reduce: boolean): void {
  const media = env().media;
  media.reduce = reduce;
  act(() => {
    media.listeners.forEach((l) => l({ matches: reduce, media: '(prefers-reduced-motion: reduce)' }));
  });
}

function fire(observer: MockObserverInstance, el: Element, isIntersecting: boolean, ratio: number) {
  const entry = {
    target: el,
    isIntersecting,
    intersectionRatio: ratio,
  } as IntersectionObserverEntry;
  observer.callback([entry], {} as IntersectionObserver);
}

/** Triggers every live observer that currently observes `el`. */
export function intersect(
  el: Element,
  { isIntersecting, ratio }: { isIntersecting: boolean; ratio: number },
): void {
  const observers = env().MockIntersectionObserver.registry.filter((o) => o.observed.has(el));
  act(() => {
    observers.forEach((o) => fire(o, el, isIntersecting, ratio));
  });
}

export const articles = (): HTMLElement[] => screen.queryAllByRole('article');

export const keys = (): string[] => articles().map((a) => a.dataset.key ?? '');

export const names = (): string[] => articles().map((a) => a.getAttribute('aria-label') ?? '');

/** Makes the reel with the given key the active one (as the observer would). */
export function activate(key: string): void {
  const el = articles().find((a) => a.dataset.key === key);
  if (!el) throw new Error(`No reel with key ${key}`);
  intersect(el, { isIntersecting: true, ratio: 0.8 });
}

export function activateIndex(index: number): void {
  activate(keys()[index]);
}

/** Makes the feed sentinel visible, which appends one page. */
export function reachSentinel(): void {
  const sentinel = document.querySelector('.feed__sentinel');
  if (!sentinel) throw new Error('No sentinel in the DOM');
  intersect(sentinel, { isIntersecting: true, ratio: 1 });
}
