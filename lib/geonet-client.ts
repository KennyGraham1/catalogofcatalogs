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

      const text = await response.text();
      const lines = text.trim().split('\n');

      if (lines.length === 0) {
        return [];
      }

      // First line is header
      const header = lines[0].replace('#', '').split('|').map(h => h.trim());

      // Parse data lines
      const events: GeoNetEventText[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('|').map(v => v.trim());
        const event: any = {};

        header.forEach((key, index) => {
          const value = values[index];

          // Convert numeric fields
          if (key === 'Latitude' || key === 'Longitude' || key === 'Depth/km' || key === 'Magnitude') {
            event[key] = parseFloat(value);
          } else {
            event[key] = value;
          }
        });

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

      // Parse XML to JSON
      const result = await parseStringPromise(xml, {
        explicitArray: false,
        mergeAttrs: true,
        tagNameProcessors: [(name) => name.replace(/^q:/, '')],
      });

      console.log('[GeoNetClient] Fetched QuakeML data');
      return result;
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

