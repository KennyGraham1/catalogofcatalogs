==============
Uploading Data
==============

Learn how to upload earthquake catalogue data in various formats to the platform.
This guide covers supported formats, the upload workflow, field mapping, validation,
and troubleshooting common issues.

--------
Overview
--------

The Earthquake Catalogue Platform supports multiple data formats and provides
intelligent parsing with automatic format detection. The upload system handles
files up to 500MB and processes them through a seven-stage workflow ensuring
data quality and consistency.

Upload Workflow
===============

.. mermaid::

   flowchart LR
       Upload[UPLOAD] --> Parse[PARSE]
       Parse --> Validate[VALIDATE]
       Validate --> Map[MAP]
       Map --> Meta[METADATA]
       Meta --> Store[STORE]
       Store --> Result[RESULT]
       
       Upload -.-> File[File Selection]
       Parse -.-> Format[Format Detection]
       Validate -.-> Check[Data Constraint Check]
       Map -.-> Field[Field Mapping]
       Meta -.-> Name[Catalogue Name]
       Store -.-> DB[Database Insert]
       Result -.-> Report[Analysis Report]


**Seven Stages:**

1. **Upload** - File selection with drag-and-drop and progress tracking
2. **Parse** - Automatic format detection and content extraction
3. **Validate** - Check all events against validation rules
4. **Map** - Map source fields to standard schema
5. **Metadata** - Add catalogue name, description, and metadata
6. **Store** - Batch insert to MongoDB with index updates
7. **Result** - View processing report and quality statistics

-----------------
Supported Formats
-----------------

CSV and TXT Files
=================

**Delimited text files** with automatic delimiter detection:

* Comma (``,``) - Most common
* Tab (``\t``) - TSV files
* Semicolon (``;``) - European CSV
* Pipe (``|``) - Data interchange
* Space - Fixed-width or space-delimited

**Automatic date format detection:**

* ISO 8601: ``YYYY-MM-DDTHH:MM:SS.sssZ`` or ``YYYY-MM-DD HH:MM:SS``
* US format: ``MM/DD/YYYY HH:MM:SS``
* International format: ``DD/MM/YYYY HH:MM:SS``
* Unix timestamp: ``1705315845`` (seconds since epoch)
* Excel serial date: ``45306.4380`` (days since 1900-01-01)

**Example CSV with common fields:**

.. code-block:: text

   time,latitude,longitude,depth,magnitude,magnitude_type,region
   2024-01-15 10:30:45.123,-41.2865,174.7762,25.3,4.5,ML,Wellington
   2024-01-15 11:22:10.456,-42.1234,173.8765,15.7,3.2,ML,Canterbury
   2024-01-15 14:05:33.789,-43.5321,172.6543,8.2,2.8,ML,Christchurch

**Example CSV with uncertainty data:**

.. code-block:: text

   time,lat,lon,depth,mag,mag_type,lat_err,lon_err,depth_err,azimuthal_gap,stations
   2024-01-15T10:30:45Z,-41.286,174.776,25.3,4.5,ML,0.5,0.5,2.1,85,24
   2024-01-15T11:22:10Z,-42.123,173.876,15.7,3.2,ML,1.2,1.1,5.3,142,12

JSON Files
==========

Two formats are supported:

**Array format** (events as root array):

.. code-block:: json

   [
     {
       "time": "2024-01-15T10:30:45.123Z",
       "latitude": -41.2865,
       "longitude": 174.7762,
       "depth": 25.3,
       "magnitude": 4.5,
       "magnitude_type": "ML",
       "uncertainties": {
         "latitude": 0.5,
         "longitude": 0.5,
         "depth": 2.1
       }
     },
     {
       "time": "2024-01-15T11:22:10.456Z",
       "latitude": -42.1234,
       "longitude": 173.8765,
       "depth": 15.7,
       "magnitude": 3.2,
       "magnitude_type": "ML"
     }
   ]

**Object format** (events nested under key):

.. code-block:: json

   {
     "catalogue_name": "My Earthquake Catalogue",
     "source": "Research Project",
     "events": [
       {
         "time": "2024-01-15T10:30:45Z",
         "latitude": -41.2865,
         "longitude": 174.7762,
         "depth": 25.3,
         "magnitude": 4.5
       }
     ]
   }

GeoJSON Files
=============

Standard GeoJSON FeatureCollection with Point geometries:

.. code-block:: json

   {
     "type": "FeatureCollection",
     "features": [
       {
         "type": "Feature",
         "geometry": {
           "type": "Point",
           "coordinates": [174.7762, -41.2865, 25.3]
         },
         "properties": {
           "time": "2024-01-15T10:30:45Z",
           "magnitude": 4.5,
           "magnitude_type": "ML",
           "region": "Wellington"
         }
       }
     ]
   }

.. note::
   GeoJSON coordinates follow the order [longitude, latitude, altitude/depth].
   This differs from the lat/lon order used in other formats.

QuakeML Files
=============

Full QuakeML 1.2 BED (Basic Event Description) format support with comprehensive
parsing of origins, magnitudes, picks, arrivals, and focal mechanisms.

**Basic QuakeML example:**

.. code-block:: xml

   <?xml version="1.0" encoding="UTF-8"?>
   <quakeml xmlns="http://quakeml.org/xmlns/bed/1.2">
     <eventParameters>
       <event publicID="quakeml:example.org/event/2024p123456">
         <preferredOriginID>quakeml:example.org/origin/1</preferredOriginID>
         <preferredMagnitudeID>quakeml:example.org/magnitude/1</preferredMagnitudeID>
         <type>earthquake</type>
         <typeCertainty>known</typeCertainty>

         <origin publicID="quakeml:example.org/origin/1">
           <time>
             <value>2024-01-15T10:30:45.123Z</value>
             <uncertainty>0.5</uncertainty>
           </time>
           <latitude>
             <value>-41.2865</value>
             <uncertainty>0.005</uncertainty>
           </latitude>
           <longitude>
             <value>174.7762</value>
             <uncertainty>0.005</uncertainty>
           </longitude>
           <depth>
             <value>25300</value>
             <uncertainty>2100</uncertainty>
           </depth>
           <quality>
             <usedPhaseCount>42</usedPhaseCount>
             <usedStationCount>24</usedStationCount>
             <standardError>0.28</standardError>
             <azimuthalGap>85</azimuthalGap>
           </quality>
           <evaluationMode>manual</evaluationMode>
           <evaluationStatus>reviewed</evaluationStatus>
         </origin>

         <magnitude publicID="quakeml:example.org/magnitude/1">
           <mag>
             <value>4.5</value>
             <uncertainty>0.1</uncertainty>
           </mag>
           <type>ML</type>
           <stationCount>18</stationCount>
         </magnitude>
       </event>
     </eventParameters>
   </quakeml>

.. tip::
   QuakeML depth values are in **meters**, not kilometers. The platform
   automatically converts to kilometers for consistency.

--------------
Upload Process
--------------

Step 1: Navigate to Upload Page
===============================

Click **Upload** in the navigation menu or go directly to ``/upload``.

Step 2: Configure Parsing Options (Optional)
============================================

The platform auto-detects format settings, but you can override them if needed:

**Delimiter Selection (for CSV/TXT):**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Option
     - When to Use
   * - Auto-detect (default)
     - Works for most files; analyzes first rows to determine delimiter
   * - Comma
     - Standard CSV files
   * - Tab
     - TSV files or data copied from spreadsheets
   * - Semicolon
     - European CSV format (uses comma for decimals)
   * - Pipe
     - Data interchange formats
   * - Space
     - Fixed-width or space-delimited files

**Date Format:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Option
     - Format Example
   * - Auto-detect (default)
     - Analyzes samples to determine format
   * - ISO 8601
     - ``2024-01-15T10:30:45Z`` or ``2024-01-15 10:30:45``
   * - US Format
     - ``01/15/2024 10:30:45`` (MM/DD/YYYY)
   * - International
     - ``15/01/2024 10:30:45`` (DD/MM/YYYY)

Step 3: Select Your File
========================

**Option A: Click to Browse**

Click the **Choose File** button to open a file browser.

**Option B: Drag and Drop**

Drag your file directly onto the upload area.

**File Limits:**

* Maximum size: 500 MB
* Supported extensions: ``.csv``, ``.txt``, ``.json``, ``.geojson``, ``.xml``, ``.qml``

.. tip::
   For very large files (>100MB), the platform uses streaming parsers to process
   data efficiently without loading the entire file into memory.

**Progress Indicator:**

During upload, you'll see:

* Upload progress percentage
* Estimated time remaining
* Current processing stage

Step 4: Review Parsed Data
==========================

After upload, the platform displays a preview:

* **Row count:** Total events detected
* **Column preview:** First 10 rows of data
* **Format detected:** File type and encoding

Review this to ensure the file was parsed correctly.

Step 5: Map Fields to Schema
============================

The platform attempts to auto-map fields based on common naming conventions.
Review and adjust mappings as needed.

**Required Fields:**

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Standard Field
     - Valid Range
     - Description
   * - ``time``
     - 1900 - present
     - Event origin time (ISO 8601 or parseable format)
   * - ``latitude``
     - -90 to 90
     - Latitude in decimal degrees (WGS84)
   * - ``longitude``
     - -180 to 180
     - Longitude in decimal degrees (WGS84)
   * - ``magnitude``
     - -2 to 10
     - Event magnitude

**Optional Core Fields:**

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - ``depth``
     - Depth in kilometers (0-1000)
   * - ``magnitude_type``
     - Magnitude scale: ML, Mw, mb, Ms, Md, etc.
   * - ``region``
     - Geographic region name
   * - ``source``
     - Data source identifier
   * - ``event_type``
     - Type: earthquake, explosion, quarry blast, etc.

**Optional Uncertainty Fields:**

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - ``time_uncertainty``
     - Origin time uncertainty in seconds
   * - ``latitude_uncertainty``
     - Latitude uncertainty in degrees
   * - ``longitude_uncertainty``
     - Longitude uncertainty in degrees
   * - ``depth_uncertainty``
     - Depth uncertainty in kilometers
   * - ``magnitude_uncertainty``
     - Magnitude uncertainty

**Optional Quality Metrics:**

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - ``azimuthal_gap``
     - Largest azimuthal gap in degrees (0-360)
   * - ``used_phase_count``
     - Number of phases used in location
   * - ``used_station_count``
     - Number of stations used in location
   * - ``standard_error``
     - RMS residual in seconds
   * - ``magnitude_station_count``
     - Stations used for magnitude calculation

**Optional QuakeML Fields:**

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - ``event_public_id``
     - QuakeML public ID
   * - ``evaluation_mode``
     - manual or automatic
   * - ``evaluation_status``
     - preliminary, confirmed, reviewed, or final

Step 6: Review Validation Results
=================================

The platform validates all events and displays:

**Summary Statistics:**

.. code-block:: text

   Validation Results
   ------------------
   Total Events:     1,234
   Valid Events:     1,198 (97.1%)
   Invalid Events:   36 (2.9%)

**Error Details:**

Each validation error shows:

* Event index/row number
* Field with issue
* Error message
* Suggested fix

**Common Validation Errors:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Error
     - Solution
   * - "Invalid latitude: must be between -90 and 90"
     - Check for swapped lat/lon or coordinate system issues
   * - "Invalid timestamp format"
     - Use ISO 8601 format or configure date format manually
   * - "Magnitude out of range"
     - Verify values are actual magnitudes, not intensity
   * - "Depth cannot be negative"
     - Check for elevation vs. depth confusion
   * - "Missing required field: time"
     - Map the time column in field mapping

Step 7: Name and Create Catalogue
=================================

**Provide Catalogue Information:**

* **Name** (required): Descriptive name for your catalogue
* **Description** (optional): Additional context or notes

**Naming Best Practices:**

.. code-block:: text

   Good names:
   - "GeoNet New Zealand 2024"
   - "Canterbury Aftershock Sequence 2010-2012"
   - "Global M6+ Events 2020"

   Avoid:
   - "test"
   - "data1"
   - "upload_20240115"

**Create the Catalogue:**

Click **Create Catalogue** to process and store your data.

The platform will:

1. Store all valid events in MongoDB
2. Calculate quality scores for each event
3. Compute catalogue statistics (bounds, counts, ranges)
4. Update database indexes
5. Generate the results report

Step 8: Review Results
======================

After successful creation, you'll see:

.. code-block:: text

   Catalogue Created Successfully
   ------------------------------
   Name:           Canterbury Aftershocks
   Events:         12,456
   Time Range:     2010-09-04 to 2012-12-31
   Magnitude:      2.0 to 7.1
   Region:         -44.2 to -42.3°S, 171.5 to 173.8°E
   Quality Grades: A: 15%, B: 45%, C: 30%, D: 8%, F: 2%

   Processing Time: 8.3 seconds

-----------------
Field Mapping
-----------------

Auto-Detection
==============

The platform recognizes these common field name variations:

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Standard Field
     - Recognized Variations
   * - ``time``
     - time, datetime, origin_time, event_time, timestamp, date, origin,
       origintime, eventtime
   * - ``latitude``
     - latitude, lat, y, northing, lat_wgs84, event_lat
   * - ``longitude``
     - longitude, lon, long, lng, x, easting, lon_wgs84, event_lon
   * - ``depth``
     - depth, depth_km, z, focal_depth, hypocentral_depth
   * - ``magnitude``
     - magnitude, mag, ml, mw, mb, ms, md, size, event_mag
   * - ``magnitude_type``
     - magnitude_type, mag_type, magtype, type, scale

Saving Templates
================

Save field mappings for reuse with similar datasets:

1. Complete field mapping for your file
2. Click **Save as Template**
3. Enter a template name (e.g., "GeoNet CSV Format")
4. Template is saved for future uploads

**Using Templates:**

1. Upload a new file
2. Click **Load Template**
3. Select your saved template
4. Mappings are applied automatically

.. tip::
   Create templates for each data provider or format you regularly use.
   This speeds up future uploads significantly.

-----------------
Validation Rules
-----------------

Required Field Validation
=========================

* **time**: Must be a valid date/time, not in the future, after 1900
* **latitude**: Must be between -90 and 90 degrees
* **longitude**: Must be between -180 and 180 degrees
* **magnitude**: Must be between -2 and 10

Optional Field Validation
=========================

* **depth**: 0 to 1000 km (warning if > 700 km)
* **azimuthal_gap**: 0 to 360 degrees
* **used_phase_count**: Positive integer
* **used_station_count**: Positive integer, ≤ used_phase_count
* **standard_error**: 0 to 100 seconds

Cross-Field Validation
======================

The platform checks for logical consistency:

* Station count cannot exceed phase count
* Very shallow events (< 5 km) with large magnitudes (> 8) trigger warnings
* Very deep events (> 300 km) with small magnitudes (< 3) trigger warnings
* Location uncertainty should not exceed 10 degrees

-----------------
Troubleshooting
-----------------

Upload Fails to Start
=====================

**Symptoms:** File doesn't upload, no progress shown

**Solutions:**

1. Check file size (max 500 MB)
2. Verify file extension is supported
3. Try a different browser
4. Check network connection
5. Clear browser cache

Parse Errors
============

**Symptoms:** "Failed to parse file" or incorrect data preview

**Solutions:**

1. Verify file encoding is UTF-8
2. For CSV, manually select the delimiter
3. Check for special characters in headers
4. Ensure consistent column counts across rows
5. Remove any blank rows at start of file

Date/Time Issues
================

**Symptoms:** Events have wrong times or invalid timestamp errors

**Solutions:**

1. Manually select the date format in options
2. Ensure times include timezone or are in UTC
3. Check for mixed date formats in file
4. Convert times to ISO 8601 format

Missing Data After Upload
=========================

**Symptoms:** Fewer events stored than in source file

**Solutions:**

1. Review validation error report
2. Check for duplicate events (same time, location, magnitude)
3. Verify required fields are mapped correctly
4. Look for filtered events in error log

-----------------
Best Practices
-----------------

Data Preparation
================

Before uploading:

1. **Clean your data:**

   * Remove header rows (keep only column names)
   * Remove summary rows or footers
   * Fix obvious errors

2. **Standardize formats:**

   * Use ISO 8601 for dates: ``YYYY-MM-DDTHH:MM:SSZ``
   * Use decimal degrees for coordinates
   * Use kilometers for depth

3. **Include quality data:**

   * Uncertainty estimates improve quality scoring
   * Phase and station counts help assess reliability
   * Azimuthal gap indicates location quality

File Naming
===========

Use descriptive file names:

.. code-block:: text

   Good: GeoNet_NZ_2024_M3plus.csv
   Good: Canterbury_aftershocks_2010-2012.json
   Bad:  data.csv
   Bad:  upload123.txt

Batch Uploads
=============

For very large datasets:

1. Split into time-based chunks (e.g., monthly files)
2. Upload each chunk to the same catalogue
3. Or upload separately and merge later

----------
Next Steps
----------

After uploading your data:

* :doc:`visualization` - View your catalogue on the interactive map
* :doc:`quality-assessment` - Review quality scores and filter events
* :doc:`merging-catalogues` - Combine with other catalogues
* :doc:`exporting-data` - Export in different formats

.. seealso::

   * :doc:`../data-validation` - Detailed validation rules and quality checks
   * :doc:`../api-reference/upload` - Upload API documentation
