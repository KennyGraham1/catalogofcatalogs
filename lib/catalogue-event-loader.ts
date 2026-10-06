import type { CursorPaginatedResult, EventMapRow, EventSummary } from './db';

/** The loader's error when the event request is refused for want of a session (HTTP 401). */
export const EVENTS_SIGN_IN_MESSAGE = "Sign in to view this catalogue's events.";

/** The loader's error when the server refuses further requests for now (HTTP 429) and gives no reason. */
export const EVENTS_RATE_LIMITED_MESSAGE = 'Too many event requests from your network. Wait a few minutes and try again.';

/**
 * Which rows to load (GET /api/catalogues/[id]/events?view=...):
 * - 'summary' (the default): the event fields tables, analyses and maps use; needs a session;
 * - 'map': only what the maps read (lib/db.ts EVENT_MAP_PROJECTION); public, for signed-out visitors.
 */
export type EventView = 'summary' | 'map';

export interface EventCatalogue {
  id: string;
  name: string;
  event_count?: number;
  modified_at?: string | null;
}

export interface CatalogueEvent extends EventSummary {
  catalogue: string;
  catalogueId: string;
}

/** A map-view row, stamped like CatalogueEvent (every CatalogueEvent is also one). */
export interface CatalogueMapEvent extends EventMapRow {
  catalogue: string;
  catalogueId: string;
}

/** Scoped to the mounted page, bounded by event count, and populated only on success. */
export class CatalogueEventCache {
  private entries = new Map<string, { events: CatalogueMapEvent[]; timestamp: number }>();
  constructor(private maxEvents = 200000, private ttl = 120000) {}

  /** Keyed by view as well: a map-view load never stands in for a summary load, nor the reverse. */
  private key(catalogue: EventCatalogue, view: EventView) {
    return JSON.stringify([view, catalogue.id, catalogue.name, catalogue.event_count, catalogue.modified_at]);
  }

  get(catalogue: EventCatalogue, view?: 'summary'): CatalogueEvent[] | undefined;
  get(catalogue: EventCatalogue, view: EventView): CatalogueMapEvent[] | undefined;
  get(catalogue: EventCatalogue, view: EventView = 'summary'): CatalogueMapEvent[] | undefined {
    const key = this.key(catalogue, view);
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    if (Date.now() - entry.timestamp >= this.ttl) return;
    this.entries.set(key, entry);
    return entry.events;
  }

  set(catalogue: EventCatalogue, events: CatalogueEvent[], view?: 'summary'): void;
  set(catalogue: EventCatalogue, events: CatalogueMapEvent[], view: EventView): void;
  set(catalogue: EventCatalogue, events: CatalogueMapEvent[], view: EventView = 'summary') {
    if (events.length > this.maxEvents) return;
    const key = this.key(catalogue, view);
    this.entries.delete(key);
    this.entries.set(key, { events, timestamp: Date.now() });
    let count = 0;
    this.entries.forEach(entry => { count += entry.events.length; });
    while (count > this.maxEvents || this.entries.size > 3) {
      const oldest = this.entries.keys().next().value as string;
      count -= this.entries.get(oldest)!.events.length;
      this.entries.delete(oldest);
    }
  }

  clear() { this.entries.clear(); }
}

interface LoadOptions<E> {
  signal: AbortSignal;
  cache?: CatalogueEventCache;
  /** Method syntax: the summary overload's callback takes the wider summary rows. */
  onProgress?(loaded: number, preview: E[] | null): void;
  /** Rows to load; 'summary' unless given. */
  view?: EventView;
}

/** The refusal's own `error` text when the response carries one, else `fallback`. */
async function refusalMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === 'string' && body.error.trim()) return body.error.trim();
  } catch {
    // No readable body: use the fallback.
  }
  return fallback;
}

/** Fetch a small first page, then full batches, with at most three requests in flight. */
export function loadCatalogueEvents(
  catalogues: EventCatalogue[], options: LoadOptions<CatalogueEvent> & { view?: 'summary' }
): Promise<CatalogueEvent[]>;
export function loadCatalogueEvents(
  catalogues: EventCatalogue[], options: LoadOptions<CatalogueMapEvent>
): Promise<CatalogueMapEvent[]>;
export async function loadCatalogueEvents(
  catalogues: EventCatalogue[],
  { signal, cache, onProgress, view = 'summary' }: LoadOptions<CatalogueMapEvent>
): Promise<CatalogueMapEvent[]> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const checkCancelled = () => {
    if (controller.signal.aborted) throw new DOMException('Event loading cancelled', 'AbortError');
  };
  const events: CatalogueMapEvent[] = [];
  const seen = new Set<string>();
  let nextCatalogue = 0;
  let previewSent = false;
  let failure: unknown;

  const append = (batch: CatalogueMapEvent[]) => {
    checkCancelled();
    for (const event of batch) {
      if (seen.has(String(event.id))) continue;
      seen.add(String(event.id));
      events.push(event);
    }
    const preview = !previewSent && events.length > 0 ? events.slice(0, 500) : null;
    if (preview) previewSent = true;
    onProgress?.(events.length, preview);
  };

  const worker = async () => {
    try {
      while (nextCatalogue < catalogues.length) {
        checkCancelled();
        const catalogue = catalogues[nextCatalogue++];
        const cached = cache?.get(catalogue, view);
        if (cached) { append(cached); continue; }
        const catalogueEvents: CatalogueMapEvent[] = [];
        const catalogueIds = new Set<string>();
        const cursors = new Set<string>();
        let cursor: string | null = null;
        do {
          checkCancelled();
          const params = new URLSearchParams({ view, limit: cursor ? '5000' : '500' });
          if (cursor) params.set('cursor', cursor);
          const response = await fetch(`/api/catalogues/${encodeURIComponent(catalogue.id)}/events?${params}`, { signal: controller.signal });
          checkCancelled();
          // Summary rows need a signed-in account (the catalogue list and the map view do
          // not): say so, instead of a bare 'HTTP 401' over an empty map that reads as a broken map.
          if (response.status === 401) throw new Error(EVENTS_SIGN_IN_MESSAGE);
          if (response.status === 403) throw new Error(`Your account cannot view the events of ${catalogue.name}.`);
          // Signed-out map requests are rate-limited per network; the server says for how long.
          if (response.status === 429) throw new Error(await refusalMessage(response, EVENTS_RATE_LIMITED_MESSAGE));
          if (!response.ok) throw new Error(`Failed to load ${catalogue.name} (HTTP ${response.status})`);
          const result: CursorPaginatedResult<EventMapRow> | EventMapRow[] = await response.json();
          checkCancelled();
          const rows = Array.isArray(result) ? result : result?.data;
          if (!Array.isArray(rows)) throw new Error(`Invalid event response for ${catalogue.name}`);
          if (!Array.isArray(result) && (!result.pagination || typeof result.pagination.hasMore !== 'boolean')) {
            throw new Error(`Missing event pagination for ${catalogue.name}`);
          }
          const batch: CatalogueMapEvent[] = [];
          for (const row of rows) {
            if (catalogueIds.has(String(row.id))) continue;
            catalogueIds.add(String(row.id));
            const event = { ...row, catalogue: catalogue.name, catalogueId: catalogue.id, region: row.region || 'Unknown' };
            catalogueEvents.push(event);
            batch.push(event);
          }
          append(batch);
          const hasMore = !Array.isArray(result) && result.pagination?.hasMore;
          cursor = hasMore ? result.pagination.nextCursor : null;
          if (hasMore && (!cursor || cursors.has(cursor) || rows.length === 0)) {
            throw new Error(`Event pagination did not advance for ${catalogue.name}`);
          }
          if (cursor) cursors.add(cursor);
        } while (cursor);
        cache?.set(catalogue, catalogueEvents, view);
      }
    } catch (error) {
      // Stop sibling requests; retain the original HTTP/protocol error for the UI.
      if (!controller.signal.aborted) failure = error;
      controller.abort();
      throw error;
    }
  };

  try {
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(3, catalogues.length) }, worker));
    if (failure) throw failure;
    const rejected = outcomes.find(outcome => outcome.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
    checkCancelled();
    return events;
  } finally { signal.removeEventListener('abort', abort); }
}
