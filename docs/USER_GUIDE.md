# Earthquake Catalogue Platform - User Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Managing Catalogues](#managing-catalogues)
5. [Uploading Data](#uploading-data)
6. [Importing from GeoNet](#importing-from-geonet)
7. [Merging Catalogues](#merging-catalogues)
8. [Visualization & Analytics](#visualization--analytics)
9. [Exporting Data](#exporting-data)
10. [Advanced Features](#advanced-features)

---

## Introduction

The Earthquake Catalogue Platform is a comprehensive web application designed for managing, analyzing, and visualizing earthquake catalogue data. It supports multiple data formats, automated imports from GeoNet, advanced merging capabilities, and sophisticated visualization tools.

### Key Features

- **Multi-format Data Support**: CSV, TXT, JSON, QuakeML (XML)
- **Automated GeoNet Import**: Real-time earthquake data from New Zealand
- **Advanced Merging**: Intelligent catalogue merging with duplicate detection
- **Interactive Visualization**: Maps, charts, and advanced seismological analysis
- **Quality Assessment**: Comprehensive quality scoring system (A+ to F grades)
- **Export Capabilities**: CSV, JSON, GeoJSON, KML, QuakeML formats

---

## Getting Started

### Accessing the Platform

1. Open your web browser
2. Navigate to the platform URL (e.g., `http://localhost:3000`)
3. You'll see the Dashboard as the home page

### Navigation

The platform uses a sidebar navigation menu with the following sections:

- **Dashboard**: Overview of all catalogues and recent activity
- **Catalogues**: View and manage all earthquake catalogues
- **Upload**: Upload new earthquake data files
- **Import**: Import data from GeoNet FDSN service
- **Merge**: Merge multiple catalogues together
- **Visualize**: Basic map visualization of earthquake data
- **Analytics**: Advanced visualization and quality analysis
- **Settings**: Platform configuration options

---

## Dashboard Overview

The Dashboard provides a quick overview of your earthquake data:

### Statistics Cards

- **Total Catalogues**: Number of catalogues in the system
- **Total Events**: Total number of earthquake events across all catalogues
- **Recent Imports**: Number of imports in the last 7 days
- **Data Quality**: Average quality score across all events

### Recent Catalogues

View your most recently created or updated catalogues with:
- Catalogue name and status
- Event count
- Creation date
- Quick action buttons (View, Download, Delete)

### Quick Actions

- **Upload New Data**: Jump directly to the upload page
- **Import from GeoNet**: Start a new GeoNet import
- **View Analytics**: Access advanced visualization tools

---

## Managing Catalogues

### Viewing Catalogues

1. Click **Catalogues** in the sidebar
2. Browse the list of all catalogues
3. Use the search bar to find specific catalogues
4. Sort by name, event count, or creation date

### Catalogue Details

Click on any catalogue to view:

- **Statistics**: Total events, average magnitude, average depth, quality metrics
- **Event List**: Sortable table of all events with:
  - Origin time
  - Location (latitude/longitude)
  - Magnitude and depth
  - Region
  - Quality score (if available)
- **Map View**: Geographic visualization of events
- **Export Options**: Download in various formats

### Editing Catalogues

- **Rename**: Click the edit icon next to the catalogue name
- **Delete**: Click the delete button (requires confirmation)
- **Update Events**: Re-import or merge to update event data

---

## Uploading Data

### Supported Formats

The platform supports the following file formats:

1. **CSV** (Comma-Separated Values)
   - Standard spreadsheet format
   - Requires header row with field names

2. **TXT** (Tab or Space-Delimited Text)
   - Plain text with delimiters
   - Flexible column structure

3. **JSON** (JavaScript Object Notation)
   - Structured data format
   - Supports nested objects

4. **QuakeML** (XML)
   - Standard seismological format
   - Full QuakeML 1.2 BED specification support

### Upload Process

1. **Navigate to Upload Page**
   - Click **Upload** in the sidebar

2. **Select File**
   - Click "Choose File" or drag and drop
   - File is automatically parsed and previewed

3. **Map Fields**
   - Review the field mapping interface
   - Map your file's columns to standard fields:
     - **Required**: time, latitude, longitude, magnitude
     - **Optional**: depth, magnitude_type, region, uncertainties, etc.
   - Use the field definitions panel for guidance

4. **Save Mapping Template** (Optional)
   - Save your field mapping for reuse
   - Name the template for easy identification

5. **Create Catalogue**
   - Enter a catalogue name
   - Click "Create Catalogue"
   - Wait for upload confirmation

### Field Mapping Tips

- **Time Format**: ISO 8601 format (YYYY-MM-DDTHH:MM:SS.sssZ) is preferred
- **Coordinates**: Decimal degrees (latitude: -90 to 90, longitude: -180 to 180)
- **Magnitude**: Numeric value (typically -2 to 10)
- **Depth**: Kilometers below surface (0 to 1000)

---

## Importing from GeoNet

GeoNet is New Zealand's geological hazard monitoring system. The platform can automatically import earthquake data from GeoNet's FDSN Event Web Service.

### Starting an Import

1. **Navigate to Import Page**
   - Click **Import** in the sidebar

2. **Configure Import Parameters**

   **Time Range**:
   - Select from preset options (Last 24 hours, Last 7 days, etc.)
   - Or choose "Custom Range" for specific dates

   **Magnitude Filters**:
   - Set minimum magnitude (e.g., 3.0 for M3.0+)
   - Set maximum magnitude (optional)

   **Depth Filters**:
   - Set minimum depth in kilometers
   - Set maximum depth in kilometers

   **Geographic Bounds** (Optional):
   - Define a bounding box with min/max latitude and longitude
   - Useful for focusing on specific regions

3. **Import Options**

   - **Update Existing Events**: Enable to update events that already exist in the catalogue
   - **Catalogue Selection**: Choose existing catalogue or create new one

4. **Start Import**
   - Click "Start Import"
   - Monitor progress in real-time
   - View import statistics upon completion

### Import Results

After import completes, you'll see:

- **Total Fetched**: Number of events retrieved from GeoNet
- **New Events**: Events added to the catalogue
- **Updated Events**: Existing events that were updated
- **Skipped Events**: Duplicate events (when update is disabled)
- **Errors**: Any errors encountered during import

### Viewing Import History

1. Click the **History** tab on the Import page
2. Select a catalogue from the dropdown
3. View all past imports with:
   - Import timestamp
   - Statistics (fetched, new, updated, skipped)
   - Duration
   - Error messages (if any)

### Best Practices

- **Start Small**: Test with a small time range first (e.g., last 24 hours)
- **Use Magnitude Filters**: Filter out small events to reduce database size
- **Enable Updates**: Keep data synchronized with GeoNet's latest revisions
- **Regular Imports**: Schedule periodic imports to stay up-to-date
- **Monitor History**: Check for errors and verify import success

---

## Merging Catalogues

The merge feature allows you to combine multiple catalogues into a single unified catalogue with intelligent duplicate detection.

### Merge Process

1. **Navigate to Merge Page**
   - Click **Merge** in the sidebar

2. **Select Source Catalogues**
   - Choose 2 or more catalogues to merge
   - View event counts for each selected catalogue

3. **Configure Matching Rules**

   **Time Window**:
   - Maximum time difference for matching events (seconds)
   - Default: 60 seconds
   - Events within this window are considered potential duplicates

   **Distance Threshold**:
   - Maximum distance for matching events (kilometers)
   - Default: 50 km
   - Events within this distance are considered potential duplicates

   **Magnitude Difference**:
   - Maximum magnitude difference for matching events
   - Default: 0.5
   - Events within this difference are considered potential duplicates

4. **Choose Conflict Resolution Strategy**

   - **Prefer First**: Use values from the first catalogue when conflicts occur
   - **Prefer Last**: Use values from the last catalogue
   - **Prefer Largest Magnitude**: Use event with largest magnitude
   - **Prefer Best Quality**: Use event with highest quality score

5. **Create Merged Catalogue**
   - Enter a name for the merged catalogue
   - Click "Merge Catalogues"
   - Wait for merge completion

### Merge Results

After merging, you'll see:

- **Total Events**: Number of events in merged catalogue
- **Unique Events**: Events that didn't match across catalogues
- **Merged Events**: Events that were matched and combined
- **Source Tracking**: Each event retains information about its source catalogue(s)

---

## Visualization & Analytics

The platform provides multiple visualization tools for exploring earthquake data.

### Basic Visualization (Visualize Page)

1. **Interactive Map**
   - View all earthquakes on a map
   - Color-coded by magnitude or depth
   - Click markers for event details
   - Toggle NZ Active Faults layer

2. **Filtering**
   - Filter by magnitude range
   - Filter by depth range
   - Filter by date range
   - Filter by region

### Advanced Analytics (Analytics Page)

The Analytics page provides comprehensive visualization and analysis tools across multiple tabs:

#### Map Tab

- **Interactive Earthquake Map**: Advanced map with filtering
- **Filters Sidebar**:
  - Magnitude range slider
  - Depth range slider
  - Time period selection
  - Region selection
  - Catalogue selection
- **Color Modes**: Magnitude, Depth, or Quality
- **NZ Active Faults**: Toggle fault lines overlay

#### Charts Tab

- **Magnitude Distribution**: Histogram of event magnitudes
- **Depth Distribution**: Histogram of event depths
- **Magnitude vs Depth**: Scatter plot showing relationship

#### Distribution Tab

- **Magnitude Bins**: Bar chart of magnitude ranges
- **Depth Bins**: Bar chart of depth ranges
- **Regional Distribution**: Pie chart of events by region

#### Timeline Tab

- **Events Over Time**: Line chart showing temporal distribution
- **Identify patterns**: Swarms, aftershock sequences, background seismicity

#### Events Tab

- **Sortable Event Table**: Complete list of filtered events
- **Export Options**: Download filtered events

#### Details Tab

- **Event Information**: Detailed view of selected event
- **Quality Metrics**: Comprehensive quality assessment
- **Uncertainty Information**: Location, depth, magnitude uncertainties
- **Metadata**: Source, evaluation mode, evaluation status

#### Quality Tab

- **Quality Distribution**: Pie chart of quality grades (A+ to F)
- **Quality Metrics**: Detailed breakdown of quality components
- **Quality Filtering**: Filter events by quality grade

#### Gutenberg-Richter Tab

- **Frequency-Magnitude Distribution**: Log-linear plot
- **b-value Calculation**: Slope of the frequency-magnitude relationship
- **Seismological Interpretation**: Assess catalogue completeness

#### Completeness (Mc) Tab

- **Completeness Magnitude Estimation**: Determine minimum complete magnitude
- **Maximum Curvature Method**: Automated Mc calculation
- **Catalogue Quality Assessment**: Evaluate detection capabilities

#### Temporal Tab

- **Temporal Pattern Analysis**: Identify clusters and swarms
- **Inter-event Time Analysis**: Time between consecutive events
- **Cluster Detection**: Automated identification of event sequences

#### Moment Tab

- **Seismic Moment Calculations**: Total energy release
- **Cumulative Moment**: Energy release over time
- **Moment-Magnitude Relationship**: Verify magnitude scaling

---

## Exporting Data

Export your earthquake catalogues in multiple formats for use in other applications.

### Export Formats

1. **CSV** (Comma-Separated Values)
   - Standard spreadsheet format
   - Compatible with Excel, Google Sheets
   - All event fields included

2. **JSON** (JavaScript Object Notation)
   - Structured data format
   - Easy to parse programmatically
   - Preserves data types

3. **GeoJSON** (Geographic JSON)
   - Standard geographic data format
   - Compatible with GIS software
   - Includes geometry and properties

4. **KML** (Keyhole Markup Language)
   - Google Earth format
   - Visualize in Google Earth/Maps
   - Includes placemarks and descriptions

5. **QuakeML** (XML)
   - Standard seismological format
   - Full QuakeML 1.2 BED specification
   - Includes all metadata and uncertainties

### Export Process

1. **Navigate to Catalogue Details**
   - Go to Catalogues page
   - Click on the catalogue you want to export

2. **Select Export Format**
   - Click the "Export" dropdown button
   - Choose your desired format

3. **Download File**
   - File is automatically downloaded
   - Filename includes catalogue name and format

### Export Tips

- **CSV**: Best for spreadsheet analysis
- **JSON**: Best for programmatic access
- **GeoJSON**: Best for GIS applications
- **KML**: Best for Google Earth visualization
- **QuakeML**: Best for sharing with other seismological systems

---

## Advanced Features

### Quality Scoring System

The platform includes a comprehensive quality scoring system that evaluates earthquake locations based on multiple factors:

**Quality Components**:

1. **Location Quality** (30% weight)
   - Horizontal uncertainty (latitude/longitude)
   - Vertical uncertainty (depth)

2. **Network Geometry** (25% weight)
   - Azimuthal gap (station distribution)
   - Minimum distance to nearest station

3. **Solution Quality** (25% weight)
   - Number of phases used
   - RMS residual (standard error)

4. **Magnitude Quality** (20% weight)
   - Number of stations used for magnitude
   - Magnitude uncertainty

**Quality Grades**:

- **A+** (95-100): Excellent quality
- **A** (90-94): Very good quality
- **B** (80-89): Good quality
- **C** (70-79): Fair quality
- **D** (60-69): Poor quality
- **F** (0-59): Very poor quality

### Uncertainty Visualization

View location uncertainties as ellipses on maps:

- **Ellipse Size**: Represents horizontal uncertainty
- **Color**: Indicates quality grade
- **Transparency**: Shows confidence level

### Focal Mechanisms

Display fault plane solutions as beach ball diagrams:

- **Nodal Planes**: Two possible fault orientations
- **Compression/Tension**: Quadrant colors show stress
- **Strike/Dip/Rake**: Fault geometry parameters

### Station Coverage

Visualize seismic network geometry:

- **Station Markers**: Triangular markers for seismic stations
- **Azimuthal Gap**: Largest gap in station distribution
- **Coverage Quality**: Assess location quality based on network

### Dark Mode

Toggle between light and dark themes:

- Click the theme toggle in the top navigation
- Preference is saved automatically
- Maps adapt to theme automatically

---

## Troubleshooting

### Common Issues

**Upload Fails**:
- Check file format is supported
- Verify required fields are present
- Ensure data values are within valid ranges

**Import Returns No Events**:
- Broaden filter criteria (lower magnitude threshold)
- Check date range is within GeoNet's coverage
- Verify internet connection

**Merge Creates Duplicates**:
- Adjust matching thresholds (tighter time/distance windows)
- Review conflict resolution strategy
- Check source catalogues for data quality

**Map Not Loading**:
- Check internet connection (map tiles require network)
- Clear browser cache
- Try refreshing the page

**Slow Performance**:
- Large catalogues (>10,000 events) may be slow
- Use filters to reduce displayed events
- Consider splitting large catalogues

### Getting Help

For additional support:

- Check the documentation files in the repository
- Review the README.md for technical details
- Contact your system administrator

---

## Keyboard Shortcuts

- **Ctrl/Cmd + K**: Quick search
- **Ctrl/Cmd + /**: Toggle sidebar
- **Esc**: Close modals and dialogs

---

## Data Privacy & Security

- All data is stored locally in SQLite database
- No data is sent to external servers (except GeoNet imports)
- Regular backups are recommended
- Export your data regularly for safekeeping

---

## Best Practices

1. **Organize Catalogues**: Use descriptive names and maintain separate catalogues for different sources
2. **Regular Imports**: Keep GeoNet data up-to-date with periodic imports
3. **Quality Assessment**: Review quality scores before using data for analysis
4. **Backup Data**: Export catalogues regularly as backup
5. **Document Changes**: Keep notes on merges and data modifications
6. **Validate Data**: Check for anomalies and outliers before analysis

---

*Last Updated: October 2024*

