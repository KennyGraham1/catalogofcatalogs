/**
 * A2 items 1, 2 and 3(d): the Mc settings (method, MAXC correction) and the time-series
 * interval reach the workers that use them, and changing the interval reruns only the
 * cheap time-series analysis, not the declustering. Only the Worker constructor is
 * stubbed.
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
const events = Array.from({ length: 80 }, (_, i) => event(i, Number((1.0 + i * 0.1).toFixed(1))));

it.each(['gutenberg-richter', 'completeness'])('sends the Mc method and MAXC correction to %s', tab => {
  renderHook(() => useSeismologicalAnalyses(events, tab, { mcMethod: 'GFT', maxcCorrection: 0.3 }));
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ type: tab, mcMethod: 'GFT', maxcCorrection: 0.3 });
});

it('sends the interval and the Mc settings to the time-series analysis on the Temporal tab', () => {
  renderHook(() => useSeismologicalAnalyses(events, 'temporal', { mcMethod: 'MAXC', maxcCorrection: 0.1, rateInterval: 'month' }));
  const series = posted.find(m => m.type === 'time-series');
  expect(series).toMatchObject({ interval: 'month', mcMethod: 'MAXC', maxcCorrection: 0.1 });
  expect(series.events).toHaveLength(80);
});

it('reruns only the time-series analysis when the interval changes', () => {
  const { rerender } = renderHook(({ interval }) => useSeismologicalAnalyses(events, 'temporal', { rateInterval: interval }),
    { initialProps: { interval: 'auto' as 'auto' | 'week' } });
  expect(posted.map(m => m.type).sort()).toEqual(['temporal', 'time-series']);
  rerender({ interval: 'week' });
  expect(posted.map(m => m.type).slice(2)).toEqual(['time-series']);
  expect(posted[2].interval).toBe('week');
});

it('exposes the time-series result and counts it in anyLoading', () => {
  const { result } = renderHook(() => useSeismologicalAnalyses(events, 'temporal'));
  expect(result.current.timeSeriesAnalysis.loading).toBe(true);
  expect(result.current.anyLoading).toBe(true);
});
