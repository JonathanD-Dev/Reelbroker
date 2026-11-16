import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// --- IntersectionObserver: records instances so tests can trigger callbacks ------------------
export interface MockObserverInstance {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit;
  observed: Set<Element>;
  disconnected: boolean;
}

class MockIntersectionObserver {
  static registry: MockObserverInstance[] = [];
  private readonly state: MockObserverInstance;
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly thresholds: number[];

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.state = { callback, options, observed: new Set(), disconnected: false };
    this.root = (options.root as Element | null | undefined) ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    this.thresholds = [options.threshold ?? 0].flat();
    MockIntersectionObserver.registry.push(this.state);
  }
  observe(el: Element) {
    this.state.observed.add(el);
  }
  unobserve(el: Element) {
    this.state.observed.delete(el);
  }
  disconnect() {
    this.state.observed.clear();
    this.state.disconnected = true;
    MockIntersectionObserver.registry = MockIntersectionObserver.registry.filter(
      (o) => o !== this.state,
    );
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// --- matchMedia: prefers-reduced-motion is "reduce" by default ------------------------------
export interface MediaEnv {
  reduce: boolean;
  listeners: Set<(e: { matches: boolean; media: string }) => void>;
}
const media: MediaEnv = { reduce: true, listeners: new Set() };

function matchMediaStub(query: string) {
  const isReduce = query.includes('prefers-reduced-motion');
  const own = new Set<(e: MediaQueryListEvent) => void>();
  const wrapper = (e: { matches: boolean; media: string }) =>
    own.forEach((l) => l(e as MediaQueryListEvent));
  return {
    get matches() {
      return isReduce ? media.reduce : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => {
      own.add(l);
      media.listeners.add(wrapper);
    },
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => {
      own.delete(l);
      if (own.size === 0) media.listeners.delete(wrapper);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  };
}

const scrollIntoView = vi.fn();
const scrollTo = vi.fn();

Object.defineProperty(globalThis, '__testEnv', {
  value: { media, MockIntersectionObserver, scrollIntoView, scrollTo },
  configurable: true,
});

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
window.matchMedia = matchMediaStub as unknown as typeof window.matchMedia;
Element.prototype.scrollIntoView = scrollIntoView;
Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
// jsdom does not implement window.open; "Buy now" opens the BNCD page in a new tab.
const windowOpen = vi.fn(() => null);
window.open = windowOpen as unknown as typeof window.open;

// v22: the app opens on a welcome page until the user enters. Existing tests start inside
// the app, as an already "logged in" session (see src/lib/session.ts).
beforeEach(() => {
  sessionStorage.setItem('buy-demo:session', '1');
});

afterEach(() => {
  windowOpen.mockClear();
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  window.location.hash = '';
  media.reduce = true;
  media.listeners.clear();
  MockIntersectionObserver.registry = [];
  scrollIntoView.mockClear();
  scrollTo.mockClear();
  vi.useRealTimers();
});
