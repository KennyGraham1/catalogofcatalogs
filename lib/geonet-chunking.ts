/**
 * Generic time-window chunking for the GeoNet / FDSN event service.
 *
 * GeoNet's fdsnws-event service caps a result set at 10,000 events and returns
 * HTTP 413 for any query that would exceed it, so broad imports must be split into
 * smaller time windows (NZ produces well over 10,000 located events per year).
 *
 * This helper fetches a [startDate, endDate) window and, on a 413 (or if a response
 * hits the cap exactly), recursively bisects the window until each sub-query is
 * within the cap, concatenating and de-duplicating results by id (window boundaries
 * may otherwise double-count the boundary event). Kept dependency-free so it is
 * unit-testable in isolation from the import service.
 */

export interface ChunkOptions {
  /** GeoNet hard cap; a response at/above this is subdivided defensively. */
  eventLimit?: number;
  /** Stop subdividing once a window is this short (guards against infinite recursion). */
  minSplitMs?: number;
  /** Hard cap on recursion depth as a backstop. */
  maxDepth?: number;
  /** Called when a window is subdivided (e.g. for logging). */
  onSplit?: (startDate: Date, endDate: Date, depth: number) => void;
}

/** True if the error looks like GeoNet's "result set too large" (HTTP 413). */
export function isPayloadTooLargeError(err: unknown): boolean {
  const e = err as { status?: number; message?: string } | null | undefined;
  if (!e) return false;
  return e.status === 413 || /\b413\b|payload too large|10,?000 events/i.test(e.message || '');
}

export async function fetchTimeWindowChunked<T>(
  fetcher: (starttime: string, endtime: string) => Promise<T[]>,
  getId: (item: T) => string | undefined,
  startDate: Date,
  endDate: Date,
  options: ChunkOptions = {}
): Promise<T[]> {
  const eventLimit = options.eventLimit ?? 10000;
  const minSplitMs = options.minSplitMs ?? 1000;
  const maxDepth = options.maxDepth ?? 16;

  const run = async (start: Date, end: Date, depth: number): Promise<T[]> => {
    const splittable = depth < maxDepth && end.getTime() - start.getTime() > minSplitMs;

    try {
      const items = await fetcher(start.toISOString(), end.toISOString());
      // Defensive: if a response ever returns exactly the cap (rather than 413),
      // subdivide to avoid silently truncating the catalogue.
      if (items.length >= eventLimit) {
        if (splittable) return split(start, end, depth);
        // Cannot subdivide further (min window width / max depth) yet still at the cap:
        // results may be truncated. Surface it rather than returning silently.
        console.warn(
          `[geonet-chunking] window ${start.toISOString()}..${end.toISOString()} still returns >= ${eventLimit} events and cannot be subdivided further; results may be truncated.`
        );
      }
      return items;
    } catch (err) {
      if (isPayloadTooLargeError(err) && splittable) {
        return split(start, end, depth);
      }
      throw err;
    }
  };

  const split = async (start: Date, end: Date, depth: number): Promise<T[]> => {
    options.onSplit?.(start, end, depth);
    const mid = new Date(Math.floor((start.getTime() + end.getTime()) / 2));
    const left = await run(start, mid, depth + 1);
    const right = await run(mid, end, depth + 1);

    const seen = new Set<string>();
    const merged: T[] = [];
    for (const item of left.concat(right)) {
      const id = getId(item);
      if (id !== undefined) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(item);
    }
    return merged;
  };

  return run(startDate, endDate, 0);
}
