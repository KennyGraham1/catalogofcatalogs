/**
 * Regression test for GeoNet 10,000-event / HTTP 413 pagination (audit finding #11).
 *
 * The importer must subdivide a too-large time window (GeoNet returns HTTP 413
 * above 10,000 events) and de-duplicate boundary events by id. Tests the
 * dependency-free chunking helper directly.
 */

import { fetchTimeWindowChunked, isPayloadTooLargeError } from '@/lib/geonet-chunking';

const make413 = () => {
  const err: any = new Error('HTTP 413: Payload Too Large');
  err.status = 413;
  return err;
};

type Ev = { EventID: string; starttime: string };
const getId = (e: Ev) => e.EventID;

describe('isPayloadTooLargeError', () => {
  it('detects 413 by status and by message', () => {
    expect(isPayloadTooLargeError(make413())).toBe(true);
    expect(isPayloadTooLargeError(new Error('HTTP 413: Payload Too Large'))).toBe(true);
    expect(isPayloadTooLargeError(new Error('HTTP 500'))).toBe(false);
    expect(isPayloadTooLargeError(null)).toBe(false);
  });
});

describe('fetchTimeWindowChunked', () => {
  it('subdivides on 413 and de-duplicates boundary events by id', async () => {
    const TWO_DAYS = 2 * 24 * 3600 * 1000;
    const fetcher = jest.fn(async (starttime: string, endtime: string): Promise<Ev[]> => {
      const span = new Date(endtime).getTime() - new Date(starttime).getTime();
      if (span > TWO_DAYS + 1) throw make413(); // too wide -> cap exceeded
      return [
        { EventID: `E-${starttime}`, starttime },
        { EventID: 'SHARED', starttime },
      ];
    });

    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date('2024-01-05T00:00:00Z'); // 4 days -> split into 2x 2-day windows
    const events = await fetchTimeWindowChunked(fetcher, getId, start, end);

    expect(fetcher).toHaveBeenCalled();
    const ids = events.map((e) => e.EventID);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids.filter((id) => id === 'SHARED')).toHaveLength(1); // boundary deduped
    expect(ids.filter((id) => id.startsWith('E-'))).toHaveLength(2); // both halves contributed
  });

  it('rethrows a 413 when the window can no longer be subdivided', async () => {
    const fetcher = jest.fn(async () => {
      throw make413();
    });
    const start = new Date('2024-01-01T00:00:00.000Z');
    const end = new Date('2024-01-01T00:00:00.400Z'); // 400 ms < minSplitMs default (1000)
    await expect(fetchTimeWindowChunked(fetcher, getId, start, end)).rejects.toThrow('413');
  });

  it('returns results directly when within the cap (no subdivision)', async () => {
    const fetcher = jest.fn(async (starttime: string) => [{ EventID: 'A', starttime }]);
    const events = await fetchTimeWindowChunked(
      fetcher,
      getId,
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-01T06:00:00Z')
    );
    expect(events).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('subdivides defensively when a response hits the cap exactly', async () => {
    let calls = 0;
    const fetcher = jest.fn(async (starttime: string, endtime: string): Promise<Ev[]> => {
      calls++;
      const span = new Date(endtime).getTime() - new Date(starttime).getTime();
      // First (full) window returns exactly the cap; sub-windows return one event each.
      if (span > 3600_000) return Array.from({ length: 3 }, (_, i) => ({ EventID: `full-${i}`, starttime }));
      return [{ EventID: `sub-${starttime}`, starttime }];
    });
    const events = await fetchTimeWindowChunked(fetcher, getId, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T04:00:00Z'), {
      eventLimit: 3,
    });
    // The full window hit the cap (3) and was subdivided rather than returned as-is.
    expect(events.every((e) => e.EventID.startsWith('sub-'))).toBe(true);
    expect(calls).toBeGreaterThan(1);
  });
});
