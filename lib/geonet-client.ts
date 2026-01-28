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
import { retryFetch } from './retry-utils';
import { CircuitBreaker } from './circuit-breaker';

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
export interface GeoNetEventText {
  EventID: string;
  Time: string;
  Latitude: number;
  Longitude: number;
  'Depth/km': number;
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
      isFailure: (error: any) => {
        // Don't count 404/204 (no data) as failures
        if (error.status === 404 || error.status === 204) {
          return false;
        }
        // Count 5xx errors and network errors as failures
        return true;
      },
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

      const response = await retryFetch(url, undefined, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        timeout: 30000,
        onRetry: (error, attempt, delay) => {
          console.log(`[GeoNetClient] Retry attempt ${attempt} for text fetch: ${error.message}. Waiting ${delay}ms...`);
        },
      });

      if (response.status === 204 || response.status === 404) {
        console.log('[GeoNetClient] No data found');
        return [];
      }

      // Validate Content-Type header to ensure we're getting the expected format
      const contentType = response.headers.get('content-type') || '';
      const isTextFormat = contentType.includes('text/plain') ||
                           contentType.includes('text/csv') ||
                           contentType.includes('application/csv');

      const text = await response.text();

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

      const lines = text.trim().split('\n');

      if (lines.length === 0) {
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
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue; // Skip empty lines

        const values = line.split('|').map(v => v.trim());

        // Skip malformed lines that don't have enough values
        if (values.length < header.length / 2) {
          console.warn(`[GeoNetClient] Skipping malformed line ${i}: ${line.substring(0, 100)}`);
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
              event[key] = key === 'Depth/km' ? 0 : numValue; // Default depth to 0 if invalid
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
          continue;
        }

        // Validate EventID and Time are present
        if (!event.EventID || !event.Time) {
          console.warn(`[GeoNetClient] Skipping event on line ${i} due to missing EventID or Time`);
          continue;
        }

        events.push(event as GeoNetEventText);
      }

      console.log(`[GeoNetClient] Fetched ${events.length} events`);
      return events;
    });
  }
  
  /**
   * Fetch events in QuakeML format (complete metadata)
   * Includes circuit breaker protection and automatic retry with exponential backoff
   */
  async fetchEventsQuakeML(params: GeoNetQueryParams): Promise<any> {
    return this.circuitBreaker.execute(async () => {
      const queryParams = { ...params, format: 'xml' as const };
      const url = this.buildQueryUrl(queryParams);

      console.log('[GeoNetClient] Fetching events (QuakeML format):', url);

      const response = await retryFetch(url, undefined, {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        timeout: 30000,
        onRetry: (error, attempt, delay) => {
          console.log(`[GeoNetClient] Retry attempt ${attempt} for QuakeML fetch: ${error.message}. Waiting ${delay}ms...`);
        },
      });

      if (response.status === 204 || response.status === 404) {
        console.log('[GeoNetClient] No data found');
        return null;
      }

      const xml = await response.text();

      // Check for error responses that may come with 200 status
      const trimmedXml = xml.trim().toLowerCase();
      if (trimmedXml.startsWith('an error') ||
          trimmedXml.startsWith('error:') ||
          (trimmedXml.startsWith('<!doctype') && !trimmedXml.includes('quakeml'))) {
        const errorPreview = xml.substring(0, 200).replace(/\s+/g, ' ');
        console.error('[GeoNetClient] GeoNet returned an error response:', errorPreview);
        throw new Error(`GeoNet API returned an error: ${errorPreview}`);
      }

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
   * Fetch events in New Zealand region
   * Approximate bounds: -47.5 to -34.0 lat, 165.0 to 179.0 lon
   */
  async fetchNZEvents(
    startDate: Date,
    endDate: Date,
    minMagnitude?: number
  ): Promise<GeoNetEventText[]> {
    return this.fetchEventsText({
      starttime: startDate.toISOString(),
      endtime: endDate.toISOString(),
      minlatitude: -47.5,
      maxlatitude: -34.0,
      minlongitude: 165.0,
      maxlongitude: 179.0,
      minmagnitude: minMagnitude,
      orderby: 'time',
    });
  }
}

/**
 * Default GeoNet client instance
 */
export const geonetClient = new GeoNetClient();

