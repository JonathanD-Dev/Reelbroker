import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEED_SESSION_KEY, readFeedSession, writeFeedSession } from '../lib/feedSession';

const valid = { keys: ['NVDA#0', 'AAPL#1'], activeKey: 'AAPL#1', nextPage: 1, nextSeq: 2 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('feedSession', () => {
  it('returns null when nothing is stored', () => {
    expect(readFeedSession()).toBeNull();
  });

  it('round-trips a session, including a null activeKey', () => {
    writeFeedSession(valid);
    expect(readFeedSession()).toEqual(valid);
    writeFeedSession({ ...valid, activeKey: null });
    expect(readFeedSession()).toEqual({ ...valid, activeKey: null });
  });

  it('returns null for invalid JSON', () => {
    sessionStorage.setItem(FEED_SESSION_KEY, '{nope');
    expect(readFeedSession()).toBeNull();
  });

  it.each([
    ['not an object', '42'],
    ['null', 'null'],
    ['keys not an array', JSON.stringify({ ...valid, keys: 'x' })],
    ['keys with a non-string', JSON.stringify({ ...valid, keys: ['a', 1] })],
    ['activeKey of wrong type', JSON.stringify({ ...valid, activeKey: 3 })],
    ['missing nextPage', JSON.stringify({ keys: [], activeKey: null, nextSeq: 0 })],
    ['negative nextSeq', JSON.stringify({ ...valid, nextSeq: -1 })],
    ['fractional nextPage', JSON.stringify({ ...valid, nextPage: 1.5 })],
  ])('returns null for an invalid shape: %s', (_label, raw) => {
    sessionStorage.setItem(FEED_SESSION_KEY, raw);
    expect(readFeedSession()).toBeNull();
  });

  it('never throws when storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeFeedSession(valid)).not.toThrow();
    expect(readFeedSession()).toBeNull();
  });
});
