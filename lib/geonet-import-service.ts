/**
 * GeoNet Import Service
 * 
 * Handles importing earthquake data from GeoNet API into the database.
 * Supports duplicate detection, event updates, and comprehensive field mapping.
 */

import { geonetClient, GeoNetEventText } from './geonet-client';
import { dbQueries } from './db';
import { v4 as uuidv4 } from 'uuid';

/**
 * Import configuration options
 */
export interface ImportOptions {
  // Time range
  startDate?: Date;
  endDate?: Date;
  hours?: number;  // Fetch last N hours (alternative to date range)
  
  // Filters
  minMagnitude?: number;
  maxMagnitude?: number;
  minDepth?: number;
  maxDepth?: number;
  
  // Geographic bounds
  minLatitude?: number;
  maxLatitude?: number;
  minLongitude?: number;
  maxLongitude?: number;
  
  // Behavior
  updateExisting?: boolean;  // Update existing events if data has changed
  catalogueId?: string;      // Target catalogue ID (auto-created if not provided)
  catalogueName?: string;    // Catalogue name (default: "GeoNet - Automated Import")
}

/**
 * Import result statistics
 */
export interface ImportResult {
  success: boolean;
  catalogueId: string;
  catalogueName: string;
  totalFetched: number;
  newEvents: number;
  updatedEvents: number;
  skippedEvents: number;
  errors: string[];
  startTime: Date;
  endTime: Date;
  duration: number;  // milliseconds
}

/**
 * Import history record
 */
export interface ImportHistory {
  id: string;
  catalogue_id: string;
  start_time: string;
  end_time: string;
  total_fetched: number;
  new_events: number;
  updated_events: number;
  skipped_events: number;
  errors: string | null;  // JSON array
  created_at: string;
}

/**
 * GeoNet Import Service
 */
export class GeoNetImportService {
  private static readonly DEFAULT_CATALOGUE_NAME = 'GeoNet - Automated Import';
  private static readonly DEFAULT_CATALOGUE_DESCRIPTION = 'Automatically imported earthquake events from GeoNet FDSN Event Web Service';
  
  /**
   * Import events from GeoNet
   */
  async importEvents(options: ImportOptions = {}): Promise<ImportResult> {
    const startTime = new Date();
    const errors: string[] = [];
    
    console.log('[GeoNetImportService] Starting import with options:', options);
    
    try {
      // 1. Fetch events from GeoNet API
      const events = await this.fetchEvents(options);
      console.log(`[GeoNetImportService] Fetched ${events.length} events from GeoNet`);
      
      if (events.length === 0) {
        return {
          success: true,
          catalogueId: options.catalogueId || '',
          catalogueName: options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
          totalFetched: 0,
          newEvents: 0,
          updatedEvents: 0,
          skippedEvents: 0,
          errors: [],
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        };
      }
      
      // 2. Get or create catalogue
      const catalogueId = await this.getOrCreateCatalogue(
        options.catalogueId,
        options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME
      );
      console.log(`[GeoNetImportService] Using catalogue: ${catalogueId}`);
      
      // 3. Process events
      let newEvents = 0;
      let updatedEvents = 0;
      let skippedEvents = 0;
      
      for (const event of events) {
        try {
          const result = await this.processEvent(event, catalogueId, options.updateExisting || false);
          
          if (result === 'new') {
            newEvents++;
          } else if (result === 'updated') {
            updatedEvents++;
          } else {
            skippedEvents++;
          }
        } catch (error) {
          const errorMsg = `Failed to process event ${event.EventID}: ${error instanceof Error ? error.message : String(error)}`;
          console.error(`[GeoNetImportService] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }
      
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      
      // 4. Save import history
      await this.saveImportHistory({
        catalogueId,
        startTime,
        endTime,
        totalFetched: events.length,
        newEvents,
        updatedEvents,
        skippedEvents,
        errors,
      });
      
      console.log(`[GeoNetImportService] Import complete: ${newEvents} new, ${updatedEvents} updated, ${skippedEvents} skipped, ${errors.length} errors`);
      
      return {
        success: errors.length === 0,
        catalogueId,
        catalogueName: options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
        totalFetched: events.length,
        newEvents,
        updatedEvents,
        skippedEvents,
        errors,
        startTime,
        endTime,
        duration,
      };
    } catch (error) {
      const errorMsg = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[GeoNetImportService] ${errorMsg}`);
      errors.push(errorMsg);
      
      return {
        success: false,
        catalogueId: options.catalogueId || '',
        catalogueName: options.catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME,
        totalFetched: 0,
        newEvents: 0,
        updatedEvents: 0,
        skippedEvents: 0,
        errors,
        startTime,
        endTime: new Date(),
        duration: Date.now() - startTime.getTime(),
      };
    }
  }
  
  /**
   * Fetch events from GeoNet API
   */
  private async fetchEvents(options: ImportOptions): Promise<GeoNetEventText[]> {
    // Determine time range
    let startDate: Date;
    let endDate: Date;
    
    if (options.hours) {
      endDate = new Date();
      startDate = new Date(endDate.getTime() - options.hours * 60 * 60 * 1000);
    } else if (options.startDate && options.endDate) {
      startDate = options.startDate;
      endDate = options.endDate;
    } else {
      // Default: last 24 hours
      endDate = new Date();
      startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }
    
    // Fetch events
    const events = await geonetClient.fetchEventsText({
      starttime: startDate.toISOString(),
      endtime: endDate.toISOString(),
      minmagnitude: options.minMagnitude,
      maxmagnitude: options.maxMagnitude,
      mindepth: options.minDepth,
      maxdepth: options.maxDepth,
      minlatitude: options.minLatitude,
      maxlatitude: options.maxLatitude,
      minlongitude: options.minLongitude,
      maxlongitude: options.maxLongitude,
      orderby: 'time',
    });
    
    return events;
  }
  
  /**
   * Get existing catalogue or create new one
   */
  private async getOrCreateCatalogue(catalogueId?: string, catalogueName?: string): Promise<string> {
    if (catalogueId) {
      // Check if catalogue exists
      const catalogue = await dbQueries.getCatalogueById(catalogueId);
      if (catalogue) {
        return catalogueId;
      }
    }
    
    // Create new catalogue
    const newId = uuidv4();
    const name = catalogueName || GeoNetImportService.DEFAULT_CATALOGUE_NAME;

    await dbQueries.insertCatalogue(
      newId,
      name,
      JSON.stringify([{ source: 'GeoNet', description: GeoNetImportService.DEFAULT_CATALOGUE_DESCRIPTION }]),
      JSON.stringify({ source: 'GeoNet', importDate: new Date().toISOString() }),
      0,  // Initial event count
      'complete'
    );

    console.log(`[GeoNetImportService] Created new catalogue: ${name} (${newId})`);
    return newId;
  }
  
  /**
   * Process a single event (insert or update)
   * Returns: 'new', 'updated', or 'skipped'
   */
  private async processEvent(
    event: GeoNetEventText,
    catalogueId: string,
    updateExisting: boolean
  ): Promise<'new' | 'updated' | 'skipped'> {
    // Check if event already exists
    const existingEvent = await dbQueries.getEventBySourceId(catalogueId, event.EventID);
    
    if (existingEvent) {
      if (updateExisting) {
        // Update existing event
        await this.updateEvent(existingEvent.id, event);
        return 'updated';
      } else {
        // Skip existing event
        return 'skipped';
      }
    } else {
      // Insert new event
      await this.insertEvent(event, catalogueId);
      return 'new';
    }
  }
  
  /**
   * Insert new event into database
   */
  private async insertEvent(event: GeoNetEventText, catalogueId: string): Promise<void> {
    const eventId = uuidv4();

    await dbQueries.insertEvent({
      id: eventId,
      catalogue_id: catalogueId,
      source_id: event.EventID,
      time: event.Time,
      latitude: event.Latitude,
      longitude: event.Longitude,
      depth: event['Depth/km'],
      magnitude: event.Magnitude,
      source_events: JSON.stringify([{
        source: 'GeoNet',
        eventId: event.EventID,
        publicId: event.PublicID
      }]),
      magnitude_type: event.MagType || null,
      event_type: event.EventType || null,
    });
  }
  
  /**
   * Update existing event
   */
  private async updateEvent(eventId: string, event: GeoNetEventText): Promise<void> {
    // For now, just update basic fields
    // In the future, we could compare and only update if data has changed
    await dbQueries.updateEvent(eventId, {
      time: event.Time,
      latitude: event.Latitude,
      longitude: event.Longitude,
      depth: event['Depth/km'],
      magnitude: event.Magnitude,
      magnitude_type: event.MagType || null,
      event_type: event.EventType || null,
    });
  }
  
  /**
   * Save import history
   */
  private async saveImportHistory(data: {
    catalogueId: string;
    startTime: Date;
    endTime: Date;
    totalFetched: number;
    newEvents: number;
    updatedEvents: number;
    skippedEvents: number;
    errors: string[];
  }): Promise<void> {
    const historyId = uuidv4();
    
    await dbQueries.insertImportHistory(
      historyId,
      data.catalogueId,
      data.startTime.toISOString(),
      data.endTime.toISOString(),
      data.totalFetched,
      data.newEvents,
      data.updatedEvents,
      data.skippedEvents,
      data.errors.length > 0 ? JSON.stringify(data.errors) : null
    );
  }
  
  /**
   * Get import history for a catalogue
   */
  async getImportHistory(catalogueId: string, limit: number = 10): Promise<ImportHistory[]> {
    return await dbQueries.getImportHistory(catalogueId, limit);
  }
  
  /**
   * Get last import time for a catalogue
   */
  async getLastImportTime(catalogueId: string): Promise<Date | null> {
    const history = await this.getImportHistory(catalogueId, 1);
    if (history.length > 0) {
      return new Date(history[0].end_time);
    }
    return null;
  }
}

/**
 * Default import service instance
 */
export const geonetImportService = new GeoNetImportService();

