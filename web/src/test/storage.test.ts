import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFlag, readList, writeFlag, writeList } from '../lib/storage';

const K = 'buy-demo:test';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readList', () => {
  it('returns [] when the key is absent', () => {
    expect(readList(K)).toEqual([]);
  });
  it('returns [] for corrupted JSON', () => {
    localStorage.setItem(K, '{not json');
    expect(readList(K)).toEqual([]);
  });
  it.each(['{"a":1}', '"NVDA"', '42', 'null', 'true'])('returns [] for non-array %s', (raw) => {
    localStorage.setItem(K, raw);
    expect(readList(K)).toEqual([]);
  });
  it('filters non-string items from a mixed array', () => {
    localStorage.setItem(K, JSON.stringify(['NVDA', 1, null, { a: 1 }, 'TSLA', ['x']]));
    expect(readList(K)).toEqual(['NVDA', 'TSLA']);
  });
  it('returns [] when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readList(K)).toEqual([]);
  });
});

describe('writeList', () => {
  it('round-trips a list', () => {
    writeList(K, ['NVDA', 'AAPL']);
    expect(localStorage.getItem(K)).toBe('["NVDA","AAPL"]');
    expect(readList(K)).toEqual(['NVDA', 'AAPL']);
  });
  it('does not throw when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeList(K, ['NVDA'])).not.toThrow();
  });
});

describe('readFlag / writeFlag', () => {
  it('is false when the key is absent', () => {
    expect(readFlag(K)).toBe(false);
  });

  it('is true only for the value "1"', () => {
    localStorage.setItem(K, '1');
    expect(readFlag(K)).toBe(true);
    localStorage.setItem(K, 'true');
    expect(readFlag(K)).toBe(false);
  });

  it('writeFlag stores "1" and round-trips', () => {
    writeFlag(K);
    expect(localStorage.getItem(K)).toBe('1');
    expect(readFlag(K)).toBe(true);
  });

  it('readFlag returns false when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readFlag(K)).toBe(false);
  });

  it('writeFlag does not throw when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeFlag(K)).not.toThrow();
  });
});
