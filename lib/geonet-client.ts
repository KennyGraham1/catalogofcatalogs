/**
 * GeoNet FDSN Event Web Service Client
 *
 * Provides access to GeoNet's earthquake catalogue via the FDSN Event Web Service.
 * API Documentation: https://www.geonet.org.nz/data/access/FDSN
 *
 * Supports both text and QuakeML (XML) formats.
 * Includes automatic retry logic with exponential backoff for resilience.
 */

import { parseStringPromise } from 'xml2js';
import { retryFetchText } from './retry-utils';
import { CircuitBreaker } from './circuit-breaker';
import { NZ_NATIONAL_BOUNDS } from './geo-bounds-utils';

// GeoNet FDSN Event Service base URL
const GEONET_FDSN_EVENT_URL = 'https://service.geonet.org.nz/fdsnws/event/1/query';

/**
 * GeoNet API query parameters
 */
export interface GeoNetQueryParams {
  // Time range
  starttime?: string;  // ISO 8601 format: 2024-10-24T00:00:00
  endtime?: string;    // ISO 8601 format: 2024-10-24T23:59:59

  // Geographic bounds (rectangular)
  minlatitude?: number;  // Southern boundary (-90 to 90)
  maxlatitude?: number;  // Northern boundary (-90 to 90)
  minlongitude?: number; // Western boundary (-180 to 180)
  maxlongitude?: number; // Eastern boundary (-180 to 180)

  // Geographic bounds (circular)
  latitude?: number;   // Center latitude
  longitude?: number;  // Center longitude
  minradius?: number;  // Minimum distance (degrees)
  maxradius?: number;  // Maximum distance (degrees)

  // Depth constraints
  mindepth?: number;   // Minimum depth (km)
  maxdepth?: number;   // Maximum depth (km)

  // Magnitude constraints
  minmagnitude?: number;  // Minimum magnitude
  maxmagnitude?: number;  // Maximum magnitude

  // Sorting
  orderby?: 'time' | 'time-asc' | 'magnitude' | 'magnitude-asc';

  // Event ID
  eventid?: string;  // Specific event ID (e.g., 2024p804906)

  // Event type
  eventtype?: string;  // earthquake, explosion, etc. (comma-separated list)

  // Update filter
  updateafter?: string;  // ISO 8601 format - events updated after this time

  // Response format
  format?: 'xml' | 'text';  // Default: xml (QuakeML)

  // Error handling
  nodata?: '204' | '404';  // HTTP status code when no data found
}

/**
 * GeoNet event in text format (simplified)
 */
export interface GeoNetFetchDiagnostics {
  /** Data lines skipped because they were malformed or failed field validation. */
  skippedRows: number;
  /** The response ended mid-row: the download was cut short. */
  truncatedTail: boolean;
}

export interface GeoNetEventText {
  EventID: string;
  Time: string;
  Latitude: number;
  Longitude: number;
  'Depth/km': number | null;
  Author: string;
  Catalog: string;
  Contributor: string;
  ContributorID: string;
  MagType: string;
  Magnitude: number;
  MagAuthor: string;
  EventLocationName: string;
  EventType: string;
}

/**
 * GeoNet API client with circuit breaker protection
 */
/** True for an HTTP 404 on a request that asked GeoNet to signal "no data" with 404. */
function isExplicitNoData(error: unknown, params: GeoNetQueryParams): boolean {
  return params.nodata === '404' && typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

/**
 * Whether an error says something about GeoNet's HEALTH, and so should count towards
 * opening the shared circuit breaker: a network, timeout or parse failure (no HTTP
 * status), a 5xx, or 429 (GeoNet shedding load). Any other 4xx is a problem with the
 * request itself; counting it let five rejected requests (e.g. a malformed window
 * GeoNet answers with 400) cut every user off from a healthy GeoNet for a minute.
 * 413 is also a 4xx: the time-window chunker answers it by subdividing
 * (lib/geonet-chunking.ts), and a broad import provokes many of them on purpose.
 */
export function isGeoNetHealthFailure(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
  if (typeof status !== 'number') return true;
  return status >= 500 || status === 429;
}

export class GeoNetClient {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor(baseUrl: string = GEONET_FDSN_EVENT_URL) {
    this.baseUrl = baseUrl;

    // Initialize circuit breaker for GeoNet API
    this.circuitBreaker = new CircuitBreaker({
      name: 'GeoNetAPI',
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute
      windowSize: 60000, // 1 minute window
      isFailure: isGeoNetHealthFailure,
      onStateChange: (oldState, newState) => {
        console.log(`[GeoNetClient] Circuit breaker state changed: ${oldState} -> ${newState}`);
      },
      onOpen: () => {
        console.warn('[GeoNetClient] Circuit breaker OPENED - GeoNet API appears to be down');
      },
      onClose: () => {
        console.log('[GeoNetClient] Circuit breaker CLOSED - GeoNet API has recovered');
      },
    });
  }

  /**
   * Get circuit breaker statistics
   */
  /** Rows the last text fetch could not use, so an importer can report an incomplete window. */
  private lastFetchDiagnostics: GeoNetFetchDiagnostics = { skippedRows: 0, truncatedTail: false };

  getLastFetchDiagnostics(): GeoNetFetchDiagnostics {
    return { ...this.lastFetchDiagnostics };
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Manually reset circuit breaker (for admin/testing)
   */
  resetCircuitBreaker() {
    this.circuitBreaker.forceReset();
  }

  /**
   * Build query URL with parameters
   */
  private buildQueryUrl(params: GeoNetQueryParams): string {
    const url = new URL(this.baseUrl);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, value.toString());
      }
    });

    return url.toString();
  }

  /**
   * Fetch events in text format (simplified, faster)
   * Includes circuit breaker protection and automatic retry with exponential backoff
   */
  async fetchEventsText(params: GeoNetQueryParams): Promise<GeoNetEventText[]> {
    return this.circuitBreaker.execute(async () => {
      const queryParams = { ...params, format: 'text' as const };
      const url = this.buildQueryUrl(queryParams);

      console.log('[GeoNetClient] Fetching events (text format):', url);

      // retryFetchText reads the body inside the retried attempt, so the 30 s timeout
      // (and the abort behind it) covers the download and not just the headers.
      let fetched: { status: number; contentType: string; text: string };
      try {
        fetched = await retryFetchText(url, {
          headers: {
            'User-Agent': 'CatalogOfCatalogs/1.0 (https://github.com/KennyGraham1/catalogofcatalogs)',
          },
        }, {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          timeout: 30000,
          onRetry: (error, attempt, delay) => {
            console.log(`[GeoNetClient] Retry attempt ${attempt} for text fetch: ${error.message}. Waiting ${delay}ms...`);
          },
        });
      } catch (error) {
        // FDSN lets the caller choose 404 as the "no data" code; only then is a 404
        // an empty result rather than a transport failure.
        if (isExplicitNoData(error, params)) {
          console.log('[GeoNetClient] No data found (nodata=404)');
          this.lastFetchDiagnostics = { skippedRows: 0, truncatedTail: false };
          return [];
        }
        throw error;
      }
      const { status, contentType, text } = fetched;

      if (status === 204 || status === 404) {
        console.log('[GeoNetClient] No data found');
        this.lastFetchDiagnostics = { skippedRows: 0, truncatedTail: false };
        return [];
      }

      // Validate Content-Type header to ensure we're getting the expected format
      const isTextFormat = contentType.includes('text/plain') ||
        contentType.includes('text/csv') ||
        contentType.includes('application/csv');

      // Check for error responses that may come with 200 status
      // GeoNet API may return error messages as plain text even with 200 OK
      const trimmedText = text.trim().toLowerCase();
      if (trimmedText.startsWith('an error') ||
        trimmedText.startsWith('error:') ||
        trimmedText.startsWith('<!doctype') ||
        trimmedText.startsWith('<html') ||
        (trimmedText.startsWith('<?xml') && trimmedText.includes('<error'))) {
        const errorPreview = text.substring(0, 200).replace(/\s+/g, ' ');
        console.error('[GeoNetClient] GeoNet returned an error response:', errorPreview);
        throw new Error(`GeoNet API returned an error: ${errorPreview}`);
      }

      // Log warning if Content-Type doesn't match expected format but continue
      if (!isTextFormat && contentType) {
        console.warn(`[GeoNetClient] Unexpected Content-Type: ${contentType}. Expected text/plain or text/csv.`);
      }

      // FDSN event-text permits '#' comment lines; the column header is the first
      // pipe-delimited line, which may itself start with '#'.
      const allLines = text.split('\n').map(l => l.replace(/\r$/, ''));
      // The column header is the pipe-delimited line naming the columns; prefer one
      // that names EventID/Time over an earlier '#' comment that merely contains a pipe.
      const namedHeader = allLines.findIndex(l => l.includes('|') && /eventid|\btime\b/i.test(l));
      const headerIndex = namedHeader >= 0 ? namedHeader : allLines.findIndex(l => l.includes('|'));
      const lines = headerIndex >= 0
        ? allLines.slice(headerIndex).filter((l, i) => i === 0 || !l.trim().startsWith('#'))
        : allLines.filter(l => l.trim() !== '');

      if (lines.length === 0) {
        this.lastFetchDiagnostics = { skippedRows: 0, truncatedTail: false };
        return [];
      }

      // First line is header - validate it has the expected pipe-delimited format
      const headerLine = lines[0];
      if (!headerLine.includes('|')) {
        // Response doesn't have expected pipe-delimited format
        const errorPreview = text.substring(0, 200).replace(/\s+/g, ' ');
        console.error('[GeoNetClient] Response is not in expected pipe-delimited format:', errorPreview);
        throw new Error(`GeoNet API returned unexpected format. Expected pipe-delimited text, got: ${errorPreview}`);
      }

      const header = headerLine.replace('#', '').split('|').map(h => h.trim());

      // Validate that we have the required fields in the header
      const requiredFields = ['EventID', 'Time', 'Latitude', 'Longitude', 'Magnitude'];
      const missingFields = requiredFields.filter(field => !header.includes(field));
      if (missingFields.length > 0) {
        console.warn(`[GeoNetClient] Response header missing expected fields: ${missingFields.join(', ')}. Header: ${header.join(', ')}`);
      }

      // Parse data lines
      const events: GeoNetEventText[] = [];
      let skippedRows = 0;
      let lastDataIndex = lines.length - 1;
      while (lastDataIndex > 0 && lines[lastDataIndex].trim() === '') lastDataIndex--;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = line.split('|').map(v => v.trim());

        // GeoNet writes every column on every row (empty ones included), so a FINAL
        // row with fewer columns than the header is a body cut off mid-row: everything
        // after it is missing and the window must not be reported as a clean success.
        // Any earlier short row is skipped as malformed.
        if (i === lastDataIndex && values.length < header.length) {
          this.lastFetchDiagnostics = { skippedRows: skippedRows + 1, truncatedTail: true };
          throw new Error(
            `GeoNet response ended mid-row (${events.length} complete rows before it); the download was truncated`
          );
        }
        if (values.length < header.length / 2) {
          console.warn(`[GeoNetClient] Skipping malformed line ${i}: ${line.substring(0, 100)}`);
          skippedRows++;
          continue;
        }

        const event: any = {};
        let hasValidRequiredFields = true;

        header.forEach((key, index) => {
          const value = values[index];

          // Convert numeric fields with NaN handling
          if (key === 'Latitude' || key === 'Longitude' || key === 'Depth/km' || key === 'Magnitude') {
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
              // Critical fields must be valid
              if (key === 'Latitude' || key === 'Longitude' || key === 'Magnitude') {
                console.warn(`[GeoNetClient] Invalid ${key} value "${value}" on line ${i}`);
                hasValidRequiredFields = false;
              }
              event[key] = key === 'Depth/km' ? null : numValue; // unparseable depth -> null (don't fabricate a surface event)
            } else {
              event[key] = numValue;
            }
          } else {
            event[key] = value;
          }
        });

        // Skip events with invalid required numeric fields
        if (!hasValidRequiredFields) {
          console.warn(`[GeoNetClient] Skipping event on line ${i} due to invalid required fields`);
          skippedRows++;
          continue;
        }

        // Validate EventID and Time are present
        if (!event.EventID || !event.Time) {
          console.warn(`[GeoNetClient] Skipping event on line ${i} due to missing EventID or Time`);
          skippedRows++;
          continue;
        }

        events.push(event as GeoNetEventText);
      }

      this.lastFetchDiagnostics = { skippedRows, truncatedTail: false };
      console.log(`[GeoNetClient] Fetched ${events.length} events`);
      return events;
    });
  }

  /**
   * Fetch a QuakeML document as text: null when GeoNet reports no data, otherwise the
   * body as served. Runs inside the caller's circuit-breaker execution.
   */
  private async requestQuakeMLText(params: GeoNetQueryParams): Promise<string | null> {
    const queryParams = { ...params, format: 'xml' as const };
    const url = this.buildQueryUrl(queryParams);

    console.log('[GeoNetClient] Fetching events (QuakeML format):', url);

    // Body read inside the retried attempt (see fetchEventsText) so the timeout
    // covers the QuakeML download, which is far larger than the text format.
    let fetched: { status: number; text: string };
    try {
      fetched = await retryFetchText(url, {
        headers: {
          'User-Agent': 'CatalogOfCatalogs/1.0 (https://github.com/KennyGraham1/catalogofcatalogs)',
        },
      }, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        timeout: 30000,
        onRetry: (error, attempt, delay) => {
          console.log(`[GeoNetClient] Retry attempt ${attempt} for QuakeML fetch: ${error.message}. Waiting ${delay}ms...`);
        },
      });
    } catch (error) {
      if (isExplicitNoData(error, params)) {
        console.log('[GeoNetClient] No data found (nodata=404)');
        return null;
      }
      throw error;
    }
    const { status, text: xml } = fetched;

    if (status === 204 || status === 404) {
      console.log('[GeoNetClient] No data found');
      return null;
    }

    // Check for error responses that may come with 200 status
    const trimmedXml = xml.trim().toLowerCase();
    if (trimmedXml.startsWith('an error') ||
      trimmedXml.startsWith('error:') ||
      (trimmedXml.startsWith('<!doctype') && !trimmedXml.includes('quakeml'))) {
      const errorPreview = xml.substring(0, 200).replace(/\s+/g, ' ');
      console.error('[GeoNetClient] GeoNet returned an error response:', errorPreview);
      throw new Error(`GeoNet API returned an error: ${errorPreview}`);
    }

    return xml;
  }

  /**
   * Fetch one event's QuakeML document as the XML text GeoNet served.
   *
   * The importer reads it with lib/quakeml-parser. The parsed object from
   * fetchEventById cannot stand in for it: xml2js with mergeAttrs turns attributes
   * (publicID, nodalPlanes/@preferredPlane) into child properties, so a document
   * rebuilt from it carries them as child elements, which a QuakeML reader does not
   * take for attributes - the preferred plane and every publicID were lost that way.
   */
  async fetchEventQuakeMLText(eventId: string): Promise<string | null> {
    return this.circuitBreaker.execute(() => this.requestQuakeMLText({ eventid: eventId }));
  }

  /**
   * Fetch events in QuakeML format (complete metadata)
   * Includes circuit breaker protection and automatic retry with exponential backoff
   */
  async fetchEventsQuakeML(params: GeoNetQueryParams): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      const xml = await this.requestQuakeMLText(params);
      if (xml === null) return null;

      // Parse XML to JSON
      try {
        const result = await parseStringPromise(xml, {
          explicitArray: false,
          mergeAttrs: true,
          tagNameProcessors: [(name) => name.replace(/^q:/, '')],
        });

        console.log('[GeoNetClient] Fetched QuakeML data');
        return result;
      } catch (parseError) {
        const errorPreview = xml.substring(0, 200).replace(/\s+/g, ' ');
        console.error('[GeoNetClient] Failed to parse XML response:', errorPreview);
        throw new Error(`Failed to parse GeoNet XML response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    });
  }

  /**
   * Fetch a single event by ID in QuakeML format
   */
  async fetchEventById(eventId: string): Promise<any> {
    return this.fetchEventsQuakeML({ eventid: eventId });
  }

  /**
   * Fetch recent events (last N hours)
   */
  async fetchRecentEvents(hours: number = 24, minMagnitude?: number): Promise<GeoNetEventText[]> {
    const endtime = new Date();
    const starttime = new Date(endtime.getTime() - hours * 60 * 60 * 1000);

    return this.fetchEventsText({
      starttime: starttime.toISOString(),
      endtime: endtime.toISOString(),
      minmagnitude: minMagnitude,
      orderby: 'time',
    });
  }

  /**
   * Fetch events updated since a specific time
   */
  async fetchUpdatedEvents(since: Date, minMagnitude?: number): Promise<GeoNetEventText[]> {
    return this.fetchEventsText({
      updateafter: since.toISOString(),
      minmagnitude: minMagnitude,
      orderby: 'time',
    });
  }

  /**
   * Fetch events in a date range
   */
  async fetchEventsByDateRange(
    startDate: Date,
    endDate: Date,
    minMagnitude?: number
  ): Promise<GeoNetEventText[]> {
    return this.fetchEventsText({
      starttime: startDate.toISOString(),
      endtime: endDate.toISOString(),
      minmagnitude: minMagnitude,
      orderby: 'time',
    });
  }

  /**
   * Fetch events in the New Zealand region: NZ_NATIONAL_BOUNDS, which includes the
   * Kermadec and Chatham Islands and so crosses 180 degrees. FDSN requires
   * minlongitude <= maxlongitude, so the box is requested as its two halves and merged
   * (the old 165-179 E, 34 S box dropped everything east of 179 E and the Kermadecs).
   */
  async fetchNZEvents(
    startDate: Date,
    endDate: Date,
    minMagnitude?: number
  ): Promise<GeoNetEventText[]> {
    const { minLatitude, maxLatitude, minLongitude, maxLongitude } = NZ_NATIONAL_BOUNDS;
    const query = (minlongitude: number, maxlongitude: number) => this.fetchEventsText({
      starttime: startDate.toISOString(),
      endtime: endDate.toISOString(),
      minlatitude: minLatitude,
      maxlatitude: maxLatitude,
      minlongitude,
      maxlongitude,
      minmagnitude: minMagnitude,
      orderby: 'time',
    });
    if (minLongitude <= maxLongitude) return query(minLongitude, maxLongitude);

    const west = await query(minLongitude, 180);
    const east = await query(-180, maxLongitude);
    // An event exactly on 180 degrees is in both halves; keep one copy, newest first
    // like a single orderby=time query. The FDSN Time column is ISO 8601 in UTC, so
    // comparing the strings orders the instants without a timezone-dependent parse.
    const seen = new Set<string>();
    return [...west, ...east]
      .filter((event) => (seen.has(event.EventID) ? false : (seen.add(event.EventID), true)))
      .sort((a, b) => (a.Time < b.Time ? 1 : a.Time > b.Time ? -1 : 0));
  }
}

/**
 * Default GeoNet client instance
 */
export const geonetClient = new GeoNetClient();

