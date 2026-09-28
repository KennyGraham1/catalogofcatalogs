/**
 * Finding #11: the page's magnitude filter truncated the sample and the G-R and Mc
 * workers then re-ran MAXC on it; minMagnitude was never passed although the worker
 * supports it. The real useSeismologicalAnalyses must route the fit sample and the
 * cut-off to the right workers. Only the Worker constructor is stubbed.
 */
import { renderHook } from '@testing-library/react';
import { useSeismologicalAnalyses } from '@/hooks/use-seismological-worker';
import { createSeismologicalWorker } from '@/lib/seismological-worker-client';

jest.mock('@/lib/seismological-worker-client', () => ({ createSeismologicalWorker: jest.fn() }));

const posted: any[] = [];
beforeEach(() => {
  posted.length = 0;
  (createSeismologicalWorker as jest.Mock).mockImplementation(() => ({
    onmessage: null, onerror: null, terminate: jest.fn(),
    postMessage: (message: any) => posted.push(message),
  }));
});

const event = (id: number, magnitude: number) => ({
  id, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 175, depth: 10, magnitude,
});
// 80 events M1.0-8.9; the page's cut-off at M2.5 keeps 65 of them for display.
const all = Array.from({ length: 80 }, (_, i) => event(i, Number((1.0 + i * 0.1).toFixed(1))));
const cut = all.filter(e => e.magnitude >= 2.5);

it('fits G-R on the untruncated sample above the explicit cut-off', () => {
  renderHook(() => useSeismologicalAnalyses(cut, 'gutenberg-richter', { fitEvents: all, minMagnitude: 2.5 }));
  expect(posted).toHaveLength(1);
  expect(posted[0].type).toBe('gutenberg-richter');
  expect(posted[0].minMagnitude).toBe(2.5);
  expect(posted[0].events).toHaveLength(80);
});

it('estimates Mc on the untruncated sample and never with the cut-off', () => {
  renderHook(() => useSeismologicalAnalyses(cut, 'completeness', { fitEvents: all, minMagnitude: 2.5 }));
  expect(posted[0].type).toBe('completeness');
  expect(posted[0].minMagnitude).toBeUndefined();
  expect(posted[0].events).toHaveLength(80);
});

it('runs rates and moment on the displayed (cut) set', () => {
  renderHook(() => useSeismologicalAnalyses(cut, 'temporal', { fitEvents: all, minMagnitude: 2.5 }));
  renderHook(() => useSeismologicalAnalyses(cut, 'moment', { fitEvents: all, minMagnitude: 2.5 }));
  // The Temporal tab also runs the rate / cumulative-release series (A2), above the
  // same cut-off.
  expect(posted.map(m => [m.type, m.events.length])).toEqual([['temporal', 65], ['time-series', 65], ['moment', 65]]);
  expect(posted[1].minMagnitude).toBe(2.5);
});
