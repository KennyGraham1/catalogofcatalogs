import { act, renderHook } from '@testing-library/react';
import { useSeismologicalWorker } from '@/hooks/use-seismological-worker';
import { createSeismologicalWorker } from '@/lib/seismological-worker-client';

jest.mock('@/lib/seismological-worker-client', () => ({ createSeismologicalWorker: jest.fn() }));

const events = Array.from({ length: 60 }, (_, id) => ({
  id, time: '2024-01-01', latitude: -41, longitude: 175, depth: 10, magnitude: 3,
  picks: 'large nested record', focal_mechanisms: 'large nested record',
}));
const workers: Array<{ onmessage: ((event: any) => void) | null; onerror: ((event: any) => void) | null; postMessage: jest.Mock; terminate: jest.Mock }> = [];

beforeEach(() => {
  workers.length = 0;
  (createSeismologicalWorker as jest.Mock).mockImplementation(() => {
    const worker = { onmessage: null, onerror: null, postMessage: jest.fn(), terminate: jest.fn() };
    workers.push(worker);
    return worker;
  });
});

it('sends scalar science inputs and terminates the worker on unmount', () => {
  const { unmount } = renderHook(() => useSeismologicalWorker('moment', events));
  const sent = workers[0].postMessage.mock.calls[0][0];
  expect(sent.events).toHaveLength(60);
  expect(sent.events[0]).toMatchObject({ id: 0, magnitude: 3, depth: 10 });
  expect(sent.events[0].picks).toBeUndefined();
  expect(sent.events[0].focal_mechanisms).toBeUndefined();
  unmount();
  expect(workers[0].terminate).toHaveBeenCalled();
});

it('ignores late messages and errors from replaced requests and clears old results', () => {
  const { result, rerender } = renderHook(({ rows }) => useSeismologicalWorker<{ total: number }>('moment', rows), { initialProps: { rows: events } });
  const oldMessage = workers[0].onmessage!;
  const oldError = workers[0].onerror!;
  act(() => oldMessage({ data: { result: { total: 60 } } }));
  expect(result.current.data?.total).toBe(60);
  rerender({ rows: events.slice(0, 50) });
  expect(result.current.data).toBeNull();
  expect(result.current.loading).toBe(true);
  act(() => {
    oldMessage({ data: { result: { total: 999 } } });
    oldError({ message: 'obsolete failure' });
  });
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(true);
  act(() => workers[1].onmessage!({ data: { result: { total: 50 } } }));
  expect(result.current.data?.total).toBe(50);
});

it('exposes insufficient-complete-sample errors and clears them when disabled', () => {
  const { result, rerender } = renderHook(({ enabled }) => useSeismologicalWorker('gutenberg-richter', events, enabled), { initialProps: { enabled: true } });
  act(() => workers[0].onmessage!({ data: { result: { error: 'Only 9 events above Mc; at least 10 required' } } }));
  expect(result.current.error).toContain('Only 9 events');
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toBeNull();
  rerender({ enabled: false });
  expect(result.current.error).toBeNull();
});

it('clears successful results when inputs fall below the minimum and preserves startup errors', () => {
  const { result, rerender } = renderHook(({ rows }) => useSeismologicalWorker('completeness', rows), { initialProps: { rows: events } });
  act(() => workers[0].onmessage!({ data: { result: { Mc: 3 } } }));
  rerender({ rows: events.slice(0, 49) });
  expect(result.current.data).toBeNull();
  expect(result.current.error).toContain('at least 50');
  expect(workers).toHaveLength(1);
  (createSeismologicalWorker as jest.Mock).mockImplementationOnce(() => { throw new Error('Worker asset unavailable'); });
  rerender({ rows: events });
  expect(result.current.error).toBe('Worker asset unavailable');
  expect(result.current.loading).toBe(false);
});
