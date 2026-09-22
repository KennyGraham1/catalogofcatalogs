/** @jest-environment node */

// Event pages are 500-5000 rows, so an entry-count cap alone let the server cache
// retain hundreds of megabytes. A row budget must evict oldest entries first and never
// evict the entry just written.

import { Cache, eventCache } from '@/lib/cache';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
const page = (n: number) => ({
  data: rows(n),
  pagination: { hasMore: true, nextCursor: 'next', prevCursor: null, limit: n },
});

describe('Cache maxRows', () => {
  it('evicts oldest array entries until the row budget is met', () => {
    const c = new Cache({ maxSize: 100, maxRows: 10_000 });
    c.set('a', rows(4000));
    c.set('b', rows(4000));
    c.set('c', rows(4000)); // 12,000 > 10,000 -> 'a' must go
    expect(c.get('a')).toBeNull();
    expect(c.get('b')).toHaveLength(4000);
    expect(c.get('c')).toHaveLength(4000);
  });

  it('never evicts the entry it just wrote, even if it alone exceeds the budget', () => {
    const c = new Cache({ maxSize: 100, maxRows: 1000 });
    c.set('small', rows(10));
    c.set('big', rows(5000));
    expect(c.get('big')).toHaveLength(5000);
    expect(c.get('small')).toBeNull();
  });

  it('ignores metadata without event rows when counting rows', () => {
    const c = new Cache({ maxSize: 100, maxRows: 100 });
    c.set('meta', { count: 1_000_000 });
    c.set('page', rows(50));
    expect(c.get('meta')).toEqual({ count: 1_000_000 });
    expect(c.get('page')).toHaveLength(50);
  });

  it('counts paginated responses together with arrays and respects recent reads', () => {
    const c = new Cache({ maxRows: 10 });
    c.set('a', page(4));
    c.set('b', rows(4));
    expect(c.get('a')).toEqual(page(4)); // a is now more recent than b
    c.set('c', page(4));
    expect(c.get('b')).toBeNull();
    expect(c.get('a')).toEqual(page(4));
    expect(c.get('c')).toEqual(page(4));
  });

  it('recalculates the row budget when a paginated response is overwritten', () => {
    const c = new Cache({ maxRows: 10 });
    c.set('a', page(4));
    c.set('b', page(4));
    c.set('a', page(7));
    expect(c.get('b')).toBeNull();
    expect(c.get('a')).toEqual(page(7));
    c.set('a', page(2));
    c.set('c', page(8));
    expect(c.get('a')).toEqual(page(2));
    expect(c.get('c')).toEqual(page(8));
  });

  it('limits the event cache to 50,000 rows with the cursor API response shape', () => {
    eventCache.clearAll();
    try {
      for (let i = 0; i < 12; i++) eventCache.set(`page-${i}`, page(5000));
      expect(eventCache.size()).toBe(10);
      expect(eventCache.get('page-0')).toBeNull();
      expect(eventCache.get('page-1')).toBeNull();
      for (let i = 2; i < 12; i++) {
        expect(eventCache.get<ReturnType<typeof page>>(`page-${i}`)?.data).toHaveLength(5000);
      }
    } finally {
      eventCache.clearAll();
    }
  });
});
