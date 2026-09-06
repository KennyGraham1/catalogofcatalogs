/**
 * Generic time-window chunking for the GeoNet / FDSN event service.
 */

export interface ChunkOptions {
  /** GeoNet hard cap; a response at/above this is subdivided defensively. */
  eventLimit?: number;
  /** Stop subdividing once a window is this short (guards against infinite recursion). */
  minSplitMs?: number;
  /**
   * Hard cap on recursion depth as a backstop. Defaults to the depth at which
   * bisection reaches `minSplitMs` (bounded by ABSOLUTE_MAX_DEPTH) so that
   * `minSplitMs` - not the depth - is the width floor it is documented to be.
   */
  maxDepth?: number;
  /**
   * Safety budget on the total number of fetcher calls for one chunked fetch. This,
   * not the recursion depth, is what bounds the work: a service that keeps returning
   * the cap however narrow the window would otherwise be bisected 2^depth times.
   * Once the budget is spent, windows stop being subdivided and any that are still at
   * the cap are reported through `onTruncate`.
   */
  maxRequests?: number;
  /** Called when a window is subdivided (e.g. for logging). */
  onSplit?: (startDate: Date, endDate: Date, depth: number) => void;
  /**
   * Called when a window is still at/over `eventLimit` but can no longer be
   * subdivided, i.e. its results are knowingly TRUNCATED. Callers must surface this
   * (a truncated fetch is an incomplete catalogue, not a successful import); the
   * helper itself only logs.
   */
  onTruncate?: (startDate: Date, endDate: Date, count: number) => void;
}

/**
 * Absolute recursion backstop, whatever `minSplitMs` implies. 32 levels of bisection
 * reach a 1 s window from a span of 1000 * 2^32 ms (~136 years), i.e. wider than any
 * instrumental catalogue, so in practice `minSplitMs` is the binding width floor.
 * The work itself is bounded by DEFAULT_MAX_REQUESTS, not by this.
 */
const ABSOLUTE_MAX_DEPTH = 32;

/**
 * Default fetcher-call budget for one chunked fetch. A real 1960-2026 NZ import needs
 * a few hundred windows, so this leaves ample headroom while bounding a service that
 * pathologically returns the cap at every width (which would otherwise cost 2^depth
 * requests). Serial HTTP round trips make anything near this budget time out first.
 */
const DEFAULT_MAX_REQUESTS = 20000;

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

  // `maxDepth` is a DEPTH cap, not a width cap: with a fixed default the smallest
  // window ever tried is span/2^maxDepth, so a wide request (1960..2026 = 66 yr)
  // bottomed out at 8.8 h rather than at the documented `minSplitMs`. Derive the
  // depth that actually reaches `minSplitMs` (ceil(log2(span/minSplitMs))); the
  // runaway protection that a small depth cap used to provide is now `maxRequests`,
  // which bounds the work directly instead of via an arbitrary window width.
  const spanMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const depthForMinSplit =
    spanMs > minSplitMs ? Math.ceil(Math.log2(spanMs / minSplitMs)) : 0;
  const maxDepth = options.maxDepth ?? Math.min(depthForMinSplit, ABSOLUTE_MAX_DEPTH);
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  let requestCount = 0;

  const run = async (start: Date, end: Date, depth: number): Promise<T[]> => {
    const splittable =
      depth < maxDepth &&
      end.getTime() - start.getTime() > minSplitMs &&
      requestCount < maxRequests;

    try {
      requestCount++;
      const items = await fetcher(start.toISOString(), end.toISOString());
      // Defensive: if a response ever returns exactly the cap (rather than 413),
      // subdivide to avoid silently truncating the catalogue.
      if (items.length >= eventLimit) {
        if (splittable) return split(start, end, depth);
        // Cannot subdivide further (min window width / max depth) yet still at the cap:
        // results ARE truncated. Report it to the caller as well as logging, so an
        // incomplete fetch cannot be reported downstream as a successful import.
        console.warn(
          `[geonet-chunking] window ${start.toISOString()}..${end.toISOString()} still returns >= ${eventLimit} events and cannot be subdivided further; results may be truncated.`
        );
        options.onTruncate?.(start, end, items.length);
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
