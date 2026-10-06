/**
 * @jest-environment node
 *
 * The background refresh of stored catalogue statistics after writes
 * (lib/catalogue-statistics-refresh.ts): debounced per catalogue, coalesced while a
 * refresh runs, one at a time, and never able to fail the write that asked for it.
 * The refresh itself is replaced by a recording stand-in; the end-to-end path through
 * lib/db.ts is covered in feat-catalogue-statistics-store.test.ts.
 */

import {
  catalogueStatisticsChanged,
  configureCatalogueStatisticsRefresh,
  resetCatalogueStatisticsRefresh,
  whenCatalogueStatisticsRefreshIdle,
} from '@/lib/catalogue-statistics-refresh';

const advanced = { generationAdvanced: true };

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

let run: jest.Mock<Promise<unknown>, [string]>;
let discard: jest.Mock<Promise<unknown>, [string[]]>;

beforeEach(() => {
  jest.useFakeTimers();
  run = jest.fn(async (_catalogueId: string): Promise<unknown> => undefined);
  discard = jest.fn(async (_catalogueIds: string[]): Promise<unknown> => undefined);
  configureCatalogueStatisticsRefresh({ enabled: true, debounceMs: 2_000, maxWaitMs: 30_000, concurrency: 1, run, discard });
});
afterEach(() => {
  resetCatalogueStatisticsRefresh();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('is off under Jest unless a suite turns it on', async () => {
  resetCatalogueStatisticsRefresh(); // the defaults
  catalogueStatisticsChanged(['cat-1'], advanced);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(run).not.toHaveBeenCalled();
});

it('debounces a burst of writes into one refresh per catalogue, after the last write', async () => {
  for (let i = 0; i < 5; i++) {
    catalogueStatisticsChanged(['cat-1'], advanced);
    await jest.advanceTimersByTimeAsync(500);
  }
  catalogueStatisticsChanged(['cat-2', 'cat-2'], advanced);
  expect(run).not.toHaveBeenCalled();

  // The last cat-1 write was at t = 2.0 s and it is now 2.5 s: due at 4.0 s.
  await jest.advanceTimersByTimeAsync(1_499);
  expect(run).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(run.mock.calls).toEqual([['cat-1']]);
  await jest.advanceTimersByTimeAsync(500);
  expect(run.mock.calls).toEqual([['cat-1'], ['cat-2']]);
});

it('refreshes at most maxWaitMs after the first write of a burst that does not stop', async () => {
  configureCatalogueStatisticsRefresh({ debounceMs: 2_000, maxWaitMs: 5_000 });
  for (let elapsed = 0; elapsed < 5_000; elapsed += 1_000) {
    catalogueStatisticsChanged(['cat-1'], advanced);
    await jest.advanceTimersByTimeAsync(1_000);
  }
  expect(run.mock.calls).toEqual([['cat-1']]);
});

it('queues exactly one more refresh for writes made while one runs', async () => {
  const first = deferred();
  run.mockImplementationOnce(() => first.promise);

  catalogueStatisticsChanged(['cat-1'], advanced);
  await jest.advanceTimersByTimeAsync(2_000);
  expect(run).toHaveBeenCalledTimes(1);

  // Three writes land while the first refresh is still reading the old generation.
  catalogueStatisticsChanged(['cat-1'], advanced);
  catalogueStatisticsChanged(['cat-1'], advanced);
  catalogueStatisticsChanged(['cat-1'], advanced);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(run).toHaveBeenCalledTimes(1);

  first.resolve();
  await jest.advanceTimersByTimeAsync(0);
  expect(run).toHaveBeenCalledTimes(1); // debounced again, from the new generation
  await jest.advanceTimersByTimeAsync(2_000);
  expect(run).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(10_000);
  expect(run).toHaveBeenCalledTimes(2);
});

it('runs one refresh at a time', async () => {
  const gates = new Map<string, ReturnType<typeof deferred>>();
  run.mockImplementation((id: string) => {
    const gate = deferred();
    gates.set(id, gate);
    return gate.promise;
  });

  catalogueStatisticsChanged(['cat-1', 'cat-2'], advanced);
  await jest.advanceTimersByTimeAsync(2_000);
  expect(run.mock.calls).toEqual([['cat-1']]);

  gates.get('cat-1')!.resolve();
  await jest.advanceTimersByTimeAsync(0);
  expect(run.mock.calls).toEqual([['cat-1'], ['cat-2']]);
  gates.get('cat-2')!.resolve();
  await jest.advanceTimersByTimeAsync(0);

  const idle = jest.fn();
  void whenCatalogueStatisticsRefreshIdle().then(idle);
  await jest.advanceTimersByTimeAsync(0);
  expect(idle).toHaveBeenCalled();
});

it('logs a failed refresh and carries on; nothing reaches the caller', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  run.mockImplementationOnce(() => { throw new Error('scan failed'); });
  run.mockImplementationOnce(async () => { throw new Error('scan failed again'); });

  expect(() => catalogueStatisticsChanged(['cat-1'], advanced)).not.toThrow();
  await jest.advanceTimersByTimeAsync(2_000);
  catalogueStatisticsChanged(['cat-1'], advanced);
  await jest.advanceTimersByTimeAsync(2_000);
  catalogueStatisticsChanged(['cat-1'], advanced);
  await jest.advanceTimersByTimeAsync(2_000);

  expect(run).toHaveBeenCalledTimes(3);
  expect(warn).toHaveBeenCalledTimes(2);
  expect(String(warn.mock.calls[0][0])).toContain('cat-1');
});

it('drops the stored statistics at once when the shared generation was not advanced, then refreshes', async () => {
  catalogueStatisticsChanged(['cat-1', 'cat-2'], { generationAdvanced: false });
  await jest.advanceTimersByTimeAsync(0);
  expect(discard.mock.calls).toEqual([[['cat-1', 'cat-2']]]);
  expect(run).not.toHaveBeenCalled();

  await jest.advanceTimersByTimeAsync(2_000);
  await jest.advanceTimersByTimeAsync(0);
  expect(run.mock.calls).toEqual([['cat-1'], ['cat-2']]);
});
