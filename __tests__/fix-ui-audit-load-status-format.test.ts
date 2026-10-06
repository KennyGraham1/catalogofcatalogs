/**
 * UI audit 2026-10-05, finding 4 (stale data): the "last loaded" time names its zone and
 * uses an ISO date, since the platform's event times are UTC and a bare "14:05 on 05/10/2026"
 * was ambiguous on both counts.
 */
import { formatLastSuccess } from '@/contexts/catalogue-load-status';

describe('formatLastSuccess', () => {
  const instant = new Date('2026-10-05T01:05:00Z');
  it('gives the local time with its zone and an ISO date', () => {
    expect(formatLastSuccess(instant, 'UTC')).toBe('01:05 UTC on 2026-10-05');
    expect(formatLastSuccess(instant, 'Pacific/Auckland')).toMatch(/^14:05 (NZDT|GMT\+13) on 2026-10-05$/);
  });
});
