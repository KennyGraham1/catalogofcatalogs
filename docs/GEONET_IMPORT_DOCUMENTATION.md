# GeoNet Automatic Data Import Feature

## Overview

The GeoNet Automatic Data Import feature allows you to automatically import earthquake events from the GeoNet FDSN Event Web Service into your Earthquake Catalogue Platform. This feature provides a seamless way to keep your catalogue up-to-date with the latest seismic data from New Zealand and surrounding regions.

## Features

### ✅ Implemented Features

1. **Flexible Time Range Selection**
   - Import events from the last N hours (1, 6, 12, 24, 48 hours, 7 days, 30 days)
   - Custom date range selection with start and end dates

2. **Advanced Filtering**
   - Magnitude filters (minimum and maximum)
   - Depth filters (minimum and maximum)
   - Geographic bounds (latitude/longitude)

3. **Intelligent Data Management**
   - Automatic duplicate detection by event ID
   - Option to update existing events with revised data
   - Tracks import statistics (fetched, new, updated, skipped)

4. **Import History Tracking**
   - Complete history of all imports for each catalogue
   - Detailed statistics for each import
   - Error logging and reporting

5. **User-Friendly Interface**
   - Intuitive form-based import configuration
   - Real-time import progress and results
   - Visual display of import statistics
   - Tabbed interface for import, history, and information

## Data Source

**GeoNet FDSN Event Web Service**
- **URL**: https://service.geonet.org.nz/fdsnws/event/1/query
- **Provider**: GeoNet (New Zealand)
- **Coverage**: New Zealand and surrounding regions
- **Data Format**: Text (pipe-delimited) and QuakeML (XML)
- **License**: Creative Commons Attribution 4.0 International License
- **Authentication**: None required
- **Rate Limits**: No explicit limits (please be respectful)

## Imported Fields

The following fields are imported from GeoNet:

### Basic Event Data
- **Event ID** (GeoNet public ID) - Stored as `source_id`
- **Time** - Origin time of the earthquake
- **Latitude** - Geographic latitude in degrees
- **Longitude** - Geographic longitude in degrees
- **Depth** - Depth in kilometers
- **Magnitude** - Magnitude value
- **Magnitude Type** - Type of magnitude (e.g., MLv, mB, Mw)
- **Event Type** - Type of event (earthquake, quarry blast, etc.)

### Additional Metadata
- **Public ID** - GeoNet public identifier
- **Source Events** - JSON array of source event information

## Usage Guide

### Manual Import

1. **Navigate to the Import Page**
   - Go to http://localhost:3001/import
   - Click on the "Import" tab

2. **Configure Import Parameters**
   - **Time Range**: Choose "Last N Hours" or "Custom Date Range"
     - For quick imports, use "Last 24 hours"
     - For historical data, use custom date range
   - **Magnitude Filters** (Optional):
     - Set minimum magnitude (e.g., 3.0) to filter out small events
     - Set maximum magnitude if needed
   - **Catalogue Name**: Enter a name for the catalogue (default: "GeoNet - Automated Import")
   - **Update Existing**: Enable to update events that have been revised by GeoNet

3. **Start Import**
   - Click "Start Import" button
   - Wait for the import to complete (typically 1-5 seconds for 24 hours of data)

4. **Review Results**
   - View import statistics (total fetched, new events, updated events, skipped events)
   - Check for any errors
   - Note the catalogue ID for future reference

### Viewing Import History

1. **Navigate to the History Tab**
   - Go to http://localhost:3001/import
   - Click on the "History" tab

2. **Select a Catalogue**
   - Choose a catalogue from the dropdown
   - The GeoNet catalogue will be auto-selected if it exists

3. **Review Import History**
   - View all past imports for the selected catalogue
   - See statistics for each import
   - Check for errors in previous imports

## API Endpoints

### POST /api/import/geonet

Trigger a GeoNet import.

**Request Body:**
```json
{
  "hours": 24,                    // Last N hours (alternative to date range)
  "startDate": "2024-10-24T00:00:00Z",  // Start date (ISO 8601)
  "endDate": "2024-10-25T00:00:00Z",    // End date (ISO 8601)
  "minMagnitude": 4.0,            // Minimum magnitude filter
  "maxMagnitude": 9.0,            // Maximum magnitude filter
  "minDepth": 0,                  // Minimum depth in km
  "maxDepth": 700,                // Maximum depth in km
  "minLatitude": -47.0,           // Minimum latitude
  "maxLatitude": -34.0,           // Maximum latitude
  "minLongitude": 165.0,          // Minimum longitude
  "maxLongitude": 179.0,          // Maximum longitude
  "updateExisting": false,        // Update existing events
  "catalogueId": "uuid",          // Target catalogue ID (optional)
  "catalogueName": "GeoNet - Automated Import"  // Catalogue name
}
```

**Response:**
```json
{
  "success": true,
  "catalogueId": "uuid",
  "catalogueName": "GeoNet - Automated Import",
  "totalFetched": 5,
  "newEvents": 5,
  "updatedEvents": 0,
  "skippedEvents": 0,
  "errors": [],
  "startTime": "2024-10-25T02:14:16.000Z",
  "endTime": "2024-10-25T02:14:16.490Z",
  "duration": 490
}
```

### GET /api/import/history

Get import history for a catalogue.

**Query Parameters:**
- `catalogueId` (required) - Catalogue ID
- `limit` (optional, default: 10) - Number of records to return

**Response:**
```json
[
  {
    "id": "uuid",
    "catalogue_id": "uuid",
    "start_time": "2024-10-25T02:14:16.000Z",
    "end_time": "2024-10-25T02:14:16.490Z",
    "total_fetched": 5,
    "new_events": 5,
    "updated_events": 0,
    "skipped_events": 0,
    "errors": null,
    "created_at": "2024-10-25T02:14:16.000Z"
  }
]
```

## Best Practices

### 1. Start Small
- Begin with a small time range (e.g., last 24 hours) to test the import
- Verify the data looks correct before importing larger datasets

### 2. Use Magnitude Filters
- Filter out small events (e.g., M3.0+) to reduce database size
- Focus on events of interest to your research or application

### 3. Enable Update Existing
- Enable "Update existing events" to keep data synchronized with GeoNet
- GeoNet may revise event parameters as more data becomes available

### 4. Monitor Import History
- Regularly check import history for errors
- Investigate any failed imports

### 5. Scheduled Imports (Future Feature)
- Consider setting up scheduled imports for regular data updates
- Recommended frequency: every 6-24 hours

## Troubleshooting

### No Events Imported

**Possible Causes:**
- No events match the specified filters
- Date range is outside GeoNet's data coverage
- Network connectivity issues

**Solutions:**
- Broaden your filters (lower minimum magnitude, wider date range)
- Check GeoNet's website for data availability
- Verify internet connection

### Import Errors

**Possible Causes:**
- Database connection issues
- Invalid data from GeoNet API
- Duplicate event IDs

**Solutions:**
- Check the error messages in the import results
- Review import history for patterns
- Contact support if errors persist

### Slow Imports

**Possible Causes:**
- Large date range
- Network latency
- Database performance

**Solutions:**
- Import smaller date ranges
- Use magnitude filters to reduce event count
- Check network connection speed

## Technical Details

### Architecture

```
┌─────────────────┐
│   Import UI     │
│  (React Page)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Import API     │
│  (Next.js API)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Import Service  │
│  (TypeScript)   │
└────────┬────────┘
         │
         ├──────────────┐
         ▼              ▼
┌─────────────┐  ┌──────────────┐
│ GeoNet API  │  │   Database   │
│   Client    │  │   (SQLite)   │
└─────────────┘  └──────────────┘
```

### Database Schema

**merged_events table** (with source_id column):
```sql
CREATE TABLE merged_events (
  id TEXT PRIMARY KEY,
  catalogue_id TEXT NOT NULL,
  source_id TEXT,              -- GeoNet event ID
  time DATETIME NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  depth REAL,
  magnitude REAL NOT NULL,
  magnitude_type TEXT,
  event_type TEXT,
  source_events TEXT NOT NULL,  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- ... additional QuakeML fields
);
```

**import_history table**:
```sql
CREATE TABLE import_history (
  id TEXT PRIMARY KEY,
  catalogue_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  total_fetched INTEGER NOT NULL,
  new_events INTEGER NOT NULL,
  updated_events INTEGER NOT NULL,
  skipped_events INTEGER NOT NULL,
  errors TEXT,                  -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
);
```

## Future Enhancements

### Planned Features

1. **Scheduled Automatic Imports**
   - Background job scheduler
   - Configurable import frequency
   - Email notifications on import completion/failure

2. **Enhanced QuakeML Support**
   - Import full QuakeML XML format
   - Extract all available metadata fields
   - Support for picks, arrivals, focal mechanisms

3. **Multi-Source Import**
   - Support for additional FDSN web services
   - Unified import interface for multiple sources
   - Source-specific field mapping

4. **Import Validation**
   - Data quality checks
   - Anomaly detection
   - Automatic error correction

5. **Performance Optimization**
   - Batch processing for large imports
   - Parallel API requests
   - Database indexing improvements

## Support and Resources

- **GeoNet Website**: https://www.geonet.org.nz/
- **FDSN Web Services Specification**: https://www.fdsn.org/webservices/
- **QuakeML Documentation**: https://quake.ethz.ch/quakeml/
- **Platform Documentation**: See other documentation files in this repository

## License

This feature integrates with GeoNet data, which is provided under the Creative Commons Attribution 4.0 International License. Please ensure you comply with the license terms when using this data.

The import feature code itself is part of the Earthquake Catalogue Platform and follows the platform's license.

