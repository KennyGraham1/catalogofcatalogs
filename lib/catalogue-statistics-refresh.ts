/**
 * Background recomputation of stored catalogue statistics after writes.
 *
 * lib/db.ts publishCatalogueWrites, which every committed catalogue write goes
 * through (upload and its finalisation, GeoNet import, merge, event updates, review
 * resolution, catalogue edits and deletion), calls catalogueStatisticsChanged once the
 * shared cache generation has been advanced. The stored statistics of those catalogues
 * are then out of date; this module recomputes them after the write has answered, so
 * the next open of the statistics popover usually finds them stored
 * (lib/catalogue-statistics.ts).
 *
 *  - Debounced per catalogue: a burst of writes (the batches of an upload, an import's
 *    count and status updates) leads to one recomputation, debounceMs after the last
 *    write, and at most maxWaitMs after the first.
 *  - Coalesced: a write during a recomputation queues exactly one more, which starts
 *    from the new generation. A recomputation that has fallen behind a write still
 *    stores nothing over a newer one (the store is conditional on the generation).
 *  - At most `concurrency` recomputations at a time, so a write touching many
 *    catalogues does not start that many full scans at once.
 *  - Never fails, delays or blocks the write that triggered it: every error is logged
 *    and dropped, and the timers do not keep a script's process alive.
 *
 * It has no static imports. lib/db.ts imports it, and the statistics module it runs
 * imports lib/db.ts, so that module is loaded only when a recomputation starts.
 */

export interface CatalogueStatisticsRefreshOptions {
  /** Off under Jest by default, so suites that write catalogues start no background work. */
  enabled: boolean;
  debounceMs: number;
  maxWaitMs: number;
  concurrency: number;
  /** Recompute and store one catalogue's statistics. */
  run: (catalogueId: string) => Promise<unknown>;
  /** Drop the stored statistics of these catalogues. */
  discard: (catalogueIds: string[]) => Promise<unknown>;
}

const DEFAULT_OPTIONS: CatalogueStatisticsRefreshOptions = {
  enabled: typeof window === 'undefined' && process.env.NODE_ENV !== 'test',
  debounceMs: 2_000,
  maxWaitMs: 30_000,
  concurrency: 1,
  run: async (catalogueId) => (await import('./catalogue-statistics')).refreshCatalogueStatistics(catalogueId),
  discard: async (catalogueIds) => (await import('./catalogue-statistics')).discardStoredCatalogueStatistics(catalogueIds),
};

let options: CatalogueStatisticsRefreshOptions = { ...DEFAULT_OPTIONS };

interface Entry {
  state: 'waiting' | 'queued' | 'running';
  timer: ReturnType<typeof setTimeout> | null;
  /** When the first write of the current burst asked for this refresh. */
  firstRequestedAt: number;
  /** A write arrived while running: refresh once more afterwards. */
  again: boolean;
}

const entries = new Map<string, Entry>();
const queue: string[] = [];
let running = 0;
let idleWaiters: Array<() => void> = [];

function log(message: string, error: unknown): void {
  console.warn(`[CatalogueStatistics] ${message}:`, error instanceof Error ? error.message : error);
}

function notifyIfIdle(): void {
  if (entries.size > 0 || running > 0) return;
  const waiters = idleWaiters;
  idleWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function arm(catalogueId: string, entry: Entry, wait: number): void {
  entry.timer = setTimeout(() => {
    entry.timer = null;
    if (entries.get(catalogueId) !== entry) return;
    entry.state = 'queued';
    queue.push(catalogueId);
    drain();
  }, Math.max(0, wait));
  // A refresh is not worth keeping a maintenance script alive for.
  (entry.timer as { unref?: () => void }).unref?.();
}

function drain(): void {
  while (running < options.concurrency && queue.length > 0) {
    const catalogueId = queue.shift()!;
    const entry = entries.get(catalogueId);
    if (!entry || entry.state !== 'queued') continue;
    entry.state = 'running';
    running++;
    const { run } = options;
    Promise.resolve()
      .then(() => run(catalogueId))
      .catch((error) => log(`Background refresh of catalogue ${catalogueId} failed`, error))
      .finally(() => {
        running--;
        if (entries.get(catalogueId) === entry) {
          entries.delete(catalogueId);
          if (entry.again) request(catalogueId);
        }
        drain();
        notifyIfIdle();
      });
  }
}

function request(catalogueId: string): void {
  const now = Date.now();
  const entry = entries.get(catalogueId);
  if (!entry) {
    const created: Entry = { state: 'waiting', timer: null, firstRequestedAt: now, again: false };
    entries.set(catalogueId, created);
    arm(catalogueId, created, Math.min(options.debounceMs, options.maxWaitMs));
    return;
  }
  if (entry.state === 'waiting') {
    // Restart the quiet period, but never past maxWaitMs after the burst began.
    if (entry.timer) clearTimeout(entry.timer);
    arm(catalogueId, entry, Math.min(options.debounceMs, entry.firstRequestedAt + options.maxWaitMs - now));
    return;
  }
  // A queued refresh has not read anything yet, so it will see this write.
  if (entry.state === 'running') entry.again = true;
}

/**
 * Called by lib/db.ts after it has published committed writes to these catalogues.
 * `generationAdvanced` is false when their shared cache generation could not be
 * advanced: their stored statistics would then still look current, so they are
 * dropped first. Returns at once and never throws.
 */
export function catalogueStatisticsChanged(
  catalogueIds: string[],
  { generationAdvanced }: { generationAdvanced: boolean }
): void {
  if (!options.enabled || catalogueIds.length === 0) return;
  try {
    if (!generationAdvanced) {
      const { discard } = options;
      Promise.resolve()
        .then(() => discard(catalogueIds))
        .catch((error) => log('Stored statistics could not be dropped after a write', error));
    }
    for (const catalogueId of Array.from(new Set(catalogueIds))) request(catalogueId);
  } catch (error) {
    log('Background refresh could not be scheduled', error);
  }
}

/** Override the defaults (tests; a deployment that wants no background work). */
export function configureCatalogueStatisticsRefresh(overrides: Partial<CatalogueStatisticsRefreshOptions>): void {
  options = { ...options, ...overrides };
}

/** Cancel every waiting refresh and restore the defaults. Running refreshes finish on their own. */
export function resetCatalogueStatisticsRefresh(): void {
  entries.forEach((entry) => {
    if (entry.timer) clearTimeout(entry.timer);
  });
  entries.clear();
  queue.length = 0;
  options = { ...DEFAULT_OPTIONS };
  notifyIfIdle();
}

/** Resolves once no refresh is waiting, queued or running. */
export function whenCatalogueStatisticsRefreshIdle(): Promise<void> {
  return new Promise((resolve) => {
    idleWaiters.push(resolve);
    notifyIfIdle();
  });
}
