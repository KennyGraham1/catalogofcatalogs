import { CatalogueEventCache, loadCatalogueEvents, type CatalogueEvent } from '@/lib/catalogue-event-loader';

const catalogue = { id: 'a', name: 'A', event_count: 2 };
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const page = (ids: string[], cursor: string | null = null) => response({
  data: ids.map(id => ({ id, time: '2024-01-01', magnitude: 3, latitude: -41, longitude: 175, depth: 10 })),
  pagination: { hasMore: cursor !== null, nextCursor: cursor },
});

describe('progressive catalogue loading', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn(); });
  afterAll(() => { global.fetch = originalFetch; });

  it('publishes a first-page preview before the final request completes and follows the cursor', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { finish = resolve; });
    (fetch as jest.Mock).mockResolvedValueOnce(page(['one'], 'cursor:encoded')).mockReturnValueOnce(pending);
    const onProgress = jest.fn();
    const result = loadCatalogueEvents([catalogue], { signal: new AbortController().signal, onProgress });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(onProgress).toHaveBeenCalledWith(1, [expect.objectContaining({ id: 'one', catalogue: 'A' })]);
    expect((fetch as jest.Mock).mock.calls[0][0]).toContain('view=summary&limit=500');
    expect((fetch as jest.Mock).mock.calls[1][0]).toContain('limit=5000&cursor=cursor%3Aencoded');
    finish(page(['one', 'two']));
    expect((await result).map(event => event.id)).toEqual(['one', 'two']);
    expect(onProgress).toHaveBeenLastCalledWith(2, null);
  });

  it('limits concurrent catalogues to three', async () => {
    let active = 0;
    let maximum = 0;
    (fetch as jest.Mock).mockImplementation(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return page([]);
    });
    await loadCatalogueEvents(Array.from({ length: 8 }, (_, id) => ({ id: String(id), name: String(id) })), { signal: new AbortController().signal });
    expect(maximum).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(8);
  });

  it('reuses completed catalogues, invalidating when catalogue metadata changes', async () => {
    const cache = new CatalogueEventCache();
    (fetch as jest.Mock).mockResolvedValue(page(['one', 'two']));
    const options = { signal: new AbortController().signal, cache };
    await loadCatalogueEvents([catalogue], options);
    await loadCatalogueEvents([catalogue], options);
    expect(fetch).toHaveBeenCalledTimes(1);
    await loadCatalogueEvents([{ ...catalogue, modified_at: '2024-01-01' }], options);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache failed partial loads or silently accept broken pagination', async () => {
    const cache = new CatalogueEventCache();
    (fetch as jest.Mock).mockResolvedValue(page(['one'], 'same'));
    await expect(loadCatalogueEvents([catalogue], { signal: new AbortController().signal, cache })).rejects.toThrow('pagination did not advance');
    expect(cache.get(catalogue)).toBeUndefined();
  });

  it('aborts outstanding fetches and ignores their late responses', async () => {
    let finish!: (response: Response) => void;
    (fetch as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const onProgress = jest.fn();
    const loading = loadCatalogueEvents([catalogue], { signal: controller.signal, onProgress });
    controller.abort();
    expect((fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    finish(page(['late']));
    await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('propagates HTTP failures and stops sibling requests', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });
    await expect(loadCatalogueEvents([catalogue], { signal: new AbortController().signal })).rejects.toThrow('HTTP 503');
    expect((fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('bounds cache size and expires old entries', () => {
    const cache = new CatalogueEventCache(2, 10);
    const events = [{ id: 'one' }, { id: 'two' }] as CatalogueEvent[];
    cache.set(catalogue, events);
    cache.set({ ...catalogue, id: 'b' }, events);
    expect(cache.get(catalogue)).toBeUndefined();
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 20);
    expect(cache.get({ ...catalogue, id: 'b' })).toBeUndefined();
    now.mockRestore();
  });
});
