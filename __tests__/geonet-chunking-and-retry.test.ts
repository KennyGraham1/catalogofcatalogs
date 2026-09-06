/**
 * Regression tests for the GeoNet time-window chunker and the retry helper it runs on
 * (cluster: geonet).
 *
 *  - a window that is still at GeoNet's result-set cap but can no longer be subdivided
 *    is TRUNCATED, and must be reported to the caller rather than only logged;
 *  - `minSplitMs` - not a fixed recursion depth - is the width floor it is documented
 *    to be, so a decades-wide request is not silently stopped at hours-wide windows;
 *  - `retry()`'s per-attempt timeout actually cancels the attempt it gave up on, and
 *    leaves no pending timer behind on success.
 */

import { fetchTimeWindowChunked } from '@/lib/geonet-chunking';
import { retry, retryFetch, retryFetchText } from '@/lib/retry-utils';

type Ev = { EventID: string };
const getId = (e: Ev) => e.EventID;

const make413 = () => {
  const err: any = new Error('HTTP 413: Payload Too Large');
  err.status = 413;
  return err;
};

describe('fetchTimeWindowChunked truncation reporting', () => {
  it('reports a window that stays at the cap and cannot be subdivided', async () => {
    const onTruncate = jest.fn();
    // A 1-second window equals the default minSplitMs, so it is not splittable.
    const start = new Date('2024-01-01T00:00:00.000Z');
    const end = new Date('2024-01-01T00:00:01.000Z');
    const fetcher = jest.fn(async () =>
      Array.from({ length: 5 }, (_, i) => ({ EventID: `e${i}` }))
    );

    const events = await fetchTimeWindowChunked(fetcher, getId, start, end, {
      eventLimit: 5,
      onTruncate,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(5); // the truncated page is still returned
    expect(onTruncate).toHaveBeenCalledTimes(1);
    expect(onTruncate.mock.calls[0][0]).toEqual(start);
    expect(onTruncate.mock.calls[0][1]).toEqual(end);
    expect(onTruncate.mock.calls[0][2]).toBe(5);
  });

  it('does not report truncation when every window is under the cap', async () => {
    const onTruncate = jest.fn();
    const fetcher = jest.fn(async () => [{ EventID: 'a' }, { EventID: 'b' }]);

    await fetchTimeWindowChunked(
      fetcher,
      getId,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-01T06:00:00Z'),
      { eventLimit: 10, onTruncate }
    );

    expect(onTruncate).not.toHaveBeenCalled();
  });
});

describe('fetchTimeWindowChunked width floor', () => {
  it('keeps subdividing a decades-wide request down to minSplitMs', async () => {
    const start = new Date('1960-01-01T00:00:00Z');
    const end = new Date('2026-01-01T00:00:00Z');
    const spanMs = end.getTime() - start.getTime();
    const minSplitMs = 1000; // the documented default floor

    // Only the left-hand spine keeps hitting the cap, so the recursion descends one
    // path instead of fanning out over 2^d leaves.
    const widths: number[] = [];
    const fetcher = jest.fn(async (starttime: string, endtime: string): Promise<Ev[]> => {
      const width = new Date(endtime).getTime() - new Date(starttime).getTime();
      widths.push(width);
      if (new Date(starttime).getTime() === start.getTime() && width > minSplitMs) {
        throw make413();
      }
      return [];
    });

    await fetchTimeWindowChunked(fetcher, getId, start, end);

    const narrowest = Math.min.apply(null, widths);

    // Independent expectation: bisection halves the window each level, so reaching a
    // width of minSplitMs takes ceil(log2(span/minSplitMs)) levels and the narrowest
    // window tried is span/2^levels, which lies in (minSplitMs/2, minSplitMs].
    const levels = Math.ceil(Math.log2(spanMs / minSplitMs));
    expect(narrowest).toBeLessThanOrEqual(minSplitMs);
    expect(narrowest).toBeGreaterThan(minSplitMs / 2);
    expect(Math.abs(narrowest - spanMs / Math.pow(2, levels))).toBeLessThan(2);

    // A fixed depth cap of 16 would have bottomed out at span/2^16 (~8.8 h here),
    // hours short of the documented floor.
    expect(narrowest).toBeLessThan(spanMs / Math.pow(2, 16));

    // The one-path descent must stay cheap: ~2 requests per level.
    expect(fetcher.mock.calls.length).toBeLessThan(4 * levels);
  });

  it('still honours an explicit maxDepth backstop', async () => {
    const onTruncate = jest.fn();
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-02T00:00:00Z');
    const fetcher = jest.fn(async () => [{ EventID: 'a' }, { EventID: 'b' }]);

    await fetchTimeWindowChunked(fetcher, getId, start, end, {
      eventLimit: 2,
      maxDepth: 2,
      onTruncate,
    });

    // depth 0 and 1 split, depth 2 is the backstop: 1 + 2 + 4 windows are fetched and
    // only the 4 leaves are truncated.
    expect(fetcher).toHaveBeenCalledTimes(7);
    expect(onTruncate).toHaveBeenCalledTimes(4);
  });

  it('stops subdividing once the request budget is spent', async () => {
    const onTruncate = jest.fn();
    // A service that returns the cap however narrow the window is would otherwise be
    // bisected 2^depth times; the budget is what bounds the work.
    const fetcher = jest.fn(async () =>
      Array.from({ length: 4 }, (_, i) => ({ EventID: `${Math.random()}-${i}` }))
    );

    await fetchTimeWindowChunked(
      fetcher,
      getId,
      new Date('1960-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
      { eventLimit: 4, maxRequests: 100, onTruncate }
    );

    // Budget is checked before each split, so the count cannot run far past it.
    expect(fetcher.mock.calls.length).toBeGreaterThan(100);
    expect(fetcher.mock.calls.length).toBeLessThan(300);
    expect(onTruncate).toHaveBeenCalled();
  });
});

describe('retry() timeout cancellation', () => {
  it('aborts the attempt it timed out on', async () => {
    let captured: AbortSignal | undefined;

    await expect(
      retry(
        (signal) => {
          captured = signal;
          return new Promise<never>(() => {
            /* never settles */
          });
        },
        { timeout: 20, maxAttempts: 1 }
      )
    ).rejects.toThrow('Request timeout after 20ms');

    expect(captured).toBeDefined();
    expect(captured!.aborted).toBe(true);
  });

  it('cancels the abandoned attempt before issuing the retry', async () => {
    const signals: Array<AbortSignal | undefined> = [];

    await expect(
      retry(
        (signal) => {
          signals.push(signal);
          return new Promise<never>(() => {
            /* never settles */
          });
        },
        { timeout: 20, maxAttempts: 2, initialDelay: 1, jitter: false }
      )
    ).rejects.toThrow('Request timeout after 20ms');

    // Two attempts were made, and the first was not left running alongside the second.
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(true);
  });

  it('leaves no pending timer behind after a fast success', async () => {
    jest.useFakeTimers();
    try {
      await expect(retry(async () => 'ok', { timeout: 30000 })).resolves.toBe('ok');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('retryFetch abort wiring', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('passes an abort signal into fetch', async () => {
    const seen: RequestInit[] = [];
    global.fetch = jest.fn(async (_url: any, init: any) => {
      seen.push(init);
      return { ok: true, status: 200 } as Response;
    }) as any;

    await retryFetch('https://service.geonet.org.nz/fdsnws/event/1/query', {
      headers: { 'User-Agent': 'test' },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].signal).toBeDefined();
    expect(seen[0].signal!.aborted).toBe(false);
    // Caller-supplied init is preserved alongside the injected signal.
    expect((seen[0].headers as Record<string, string>)['User-Agent']).toBe('test');
  });

  it('retryFetchText reads the body inside the retried attempt', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h === 'content-type' ? 'text/plain; charset=utf-8' : null) },
      text: async () => '#EventID|Time\n2016p858055|2016-11-13T11:32:07',
    })) as any;

    const result = await retryFetchText('https://service.geonet.org.nz/fdsnws/event/1/query');

    expect(result.status).toBe(200);
    expect(result.contentType).toContain('text/plain');
    expect(result.text).toContain('2016p858055');
  });

  it('retryFetchText times out on a body that never arrives', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    global.fetch = jest.fn(async (_url: any, init: any) => {
      signals.push(init?.signal);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        // Headers arrived, body never does: with retryFetch this read would be
        // unbounded because the attempt timeout has already been cleared.
        text: () =>
          new Promise<string>(() => {
            /* never settles */
          }),
      } as any;
    }) as any;

    await expect(
      retryFetchText('https://service.geonet.org.nz/fdsnws/event/1/query', undefined, {
        timeout: 20,
        maxAttempts: 1,
      })
    ).rejects.toThrow('Request timeout after 20ms');

    expect(signals[0]!.aborted).toBe(true);
  });

  it('aborts the fetch of an attempt that times out', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    global.fetch = jest.fn((_url: any, init: any) => {
      signals.push(init?.signal);
      return new Promise<Response>(() => {
        /* never settles */
      });
    }) as any;

    await expect(
      retryFetch('https://service.geonet.org.nz/fdsnws/event/1/query', undefined, {
        timeout: 20,
        maxAttempts: 1,
      })
    ).rejects.toThrow('Request timeout after 20ms');

    expect(signals).toHaveLength(1);
    expect(signals[0]!.aborted).toBe(true);
  });
});
