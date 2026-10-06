/**
 * Load states of the shared catalogue list (contexts/CatalogueContext.tsx).
 *
 * Kept outside the context module so pages and tests that replace the context with a
 * stub can still use these helpers.
 *
 *  - loading: no successful response yet and a request is in flight
 *  - loaded:  the most recent request succeeded and returned at least one catalogue
 *  - empty:   the most recent request succeeded and returned no catalogues
 *  - failed:  the most recent request failed and there is no earlier successful response
 *  - stale:   the most recent request failed; the list from an earlier success is kept
 */
export type CatalogueLoadStatus = 'loading' | 'loaded' | 'empty' | 'failed' | 'stale';

export interface CatalogueLoadState {
  /** A request is in flight. */
  inFlight: boolean;
  /** When a request last succeeded; null when none has. */
  lastSuccessAt: Date | null;
  /** The most recent completed request failed. */
  lastAttemptFailed: boolean;
  /** Catalogues held from the most recent successful response. */
  count: number;
}

export function deriveCatalogueLoadStatus({
  inFlight,
  lastSuccessAt,
  lastAttemptFailed,
  count,
}: CatalogueLoadState): CatalogueLoadStatus {
  if (lastSuccessAt === null) {
    // A retry after a failure shows as loading until it completes.
    return lastAttemptFailed && !inFlight ? 'failed' : 'loading';
  }
  if (lastAttemptFailed) return 'stale';
  return count > 0 ? 'loaded' : 'empty';
}

/**
 * Whether the list and its totals come from a successful response. When false, totals are
 * unknown and must be shown as unavailable, never as zero.
 */
export function hasCatalogueData(status: CatalogueLoadStatus | undefined): boolean {
  return status === 'loaded' || status === 'empty' || status === 'stale';
}

/** A plain description of why the catalogue list request failed. */
export function describeCatalogueLoadFailure(cause: { status?: number; kind: 'http' | 'network' | 'format' }): string {
  switch (cause.kind) {
    case 'http':
      return `The server returned an error (HTTP ${cause.status}).`;
    case 'network':
      return 'The server could not be reached. Check your connection.';
    default:
      return 'The server returned a response that could not be read.';
  }
}

/** "14:05 on 05/10/2026" for a stale-data notice. */
export function formatLastSuccess(date: Date, timeZone?: string): string {
  // The reader's local time, with its zone named (the event times elsewhere are UTC, so an
  // unlabelled time would be ambiguous), and an ISO date rather than a locale-ordered one.
  // The reader's locale names the zone as they know it (for example NZDT); the numbers are
  // reassembled in a fixed order, so the locale never changes the date's layout.
  const parts = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZoneName: 'short', ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('timeZoneName')} on ${get('year')}-${get('month')}-${get('day')}`;
}
