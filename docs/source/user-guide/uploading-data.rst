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
parsing with automatic format detection. The upload system handles
files up to 500MB and processes them through a seven-stage workflow ensuring
data quality and consistency.

Upload Workflow
===============

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart LR
       Start(["Start"]):::terminal

       subgraph Pipeline["Seven-Stage Upload Workflow"]
           direction LR
           Upload("1. Upload"):::userAction
           Parse[/"2. Parse"/]:::process
           Validate{"3. Validate"}:::decision
           Map[/"4. Map"/]:::process
           Meta[/"5. Metadata"/]:::process
           Store[("6. Store")]:::datastore
       end

       Result(["7. Result"]):::success

       Start --> Upload
       Upload --> Parse
       Parse --> Validate
       Validate --> Map
       Map --> Meta
       Meta --> Store
       Store --> Result

       Upload -. "file selection" .-> File["File Selection"]:::frontend
       Parse -. "format detection" .-> Format[/"Format Detection"/]:::process
       Validate -. "constraint check" .-> Check[/"Data Constraint Check"/]:::process
       Map -. "field mapping" .-> Field[/"Field Mapping"/]:::process
       Meta -. "catalogue name" .-> Name["Catalogue Name"]:::frontend
       Store -. "database insert" .-> DB[/"Database Insert"/]:::process
       Result -. "analysis report" .-> Report("Analysis Report"):::success

       style Pipeline fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF


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

The day/month order (US ``MM/DD/YYYY`` vs. International ``DD/MM/YYYY``) is decided once
for the whole file, from every date-like value in the time column considered together —
not row by row, so a file can never end up with some rows read as US and others as
International.

* ISO 8601 and other year-first dates: ``YYYY-MM-DDTHH:MM:SS.sssZ``, ``YYYY-MM-DD HH:MM:SS``,
  ``YYYY/MM/DD`` and ``YYYY.MM.DD`` (the time part, and seconds within it, are optional)
* US format: ``MM/DD/YYYY HH:MM:SS``
* International format: ``DD/MM/YYYY HH:MM:SS``
* A 12-hour clock with AM/PM, the common spreadsheet default: ``1/15/2024 10:30:00 AM``.
  ``12 AM`` is midnight (``00:00``), ``12 PM`` is noon; an hour of ``0`` or above ``12``
  together with AM/PM is not a valid 12-hour time and is rejected.
* Month names, with an optional weekday, including RFC 2822: ``15 Jan 2024 10:30:00``,
  ``Jan 15, 2024``, ``Mon, 15 Jan 2024 10:30:00 +1300``, and asctime/ctime/Unix ``date``
  output: ``Mon Jan 15 10:30:00 2024``, ``Mon Jan 15 10:30:00 UTC 2024``
* Compact forms: ``20240115``, ``20240115T103000Z``
* Day-of-year: ``YYYY DDD HH:MM:SS`` / ``YYYY-DDD HH:MM:SS`` / ``YYYYDDDHHMMSS``
* Two-digit years on slash, dot and month-name dates (e.g. ``15/01/24``) are read **only**
  when the day/month order is declared, or the file's own dates leave exactly one order
  possible (a lone ``'20/05/17'`` is ambiguous — DD/MM/YY 2017 or YY/MM/DD 2020 alike — so
  it is not read on its own). When they are read, it is as the most recent year ending in
  those digits that is not in the future (currently ``00``-``26`` as 2000-2026, ``27``-``99``
  as 1927-1999; this pivot advances every year), and a file-level warning states the order
  and the pivot used. When they cannot be read, a warning explains why and asks you to
  declare the date format. Plain numeric ``DD-MM-YYYY``-style dates still require a full
  four-digit year.
* Fractional seconds of any number of digits (truncated to millisecond precision)
* Unix timestamp: ``1705315845`` (seconds since epoch) or ``1705315845123`` (milliseconds)

A time with no UTC offset or zone letter is read as **UTC**. A shape the detector does not
recognise, or a named local zone abbreviation (e.g. ``EST``, ``NZDT``), is **rejected**
rather than guessed, since it cannot be placed exactly. Excel serial date numbers (e.g.
``45306.4380``, days since 1900) are **not** supported or converted — export dates as text
first if your spreadsheet stores them as serial numbers.

If, after all of the above, an event's origin time is still date-only (no time of day
found anywhere in that row), it is stored at midnight UTC, and the file gets a warning
stating how many rows this happened to.

**Header rules:**

* A leading block of comment lines (starting ``#`` or ``%``) is skipped. If one of those
  comment lines actually names the columns, it is used as the header instead of being
  discarded: the **last** comment line with at least two cells that resolve to known
  field names (the FDSN event-text layout ``#EventID|Time|Latitude|...``, or an ISC-GEM
  ``#  date , lat , ...`` line) is chosen, so a units line after it (``#UTC,deg,deg,km``)
  is correctly skipped rather than mistaken for the header.
* A time-of-day column is found by its **values** as well as its name, so a column named
  e.g. ``hhmmss`` next to a date-only ``date`` column is still recognised.
* Repeated header names (e.g. two columns both literally called ``mm``) are kept apart
  with a numeric suffix (``mm``, ``mm_2``) rather than one overwriting the other; a column
  literally named ``mm`` immediately after an hour column is read as minutes.
* A column's original letter case is kept for values read from it verbatim, so a magnitude
  type column written ``mB`` is stored ``mB``, not lower-cased.
* Header names longer than 64 characters are read (and matched against the last 64
  characters, so a long descriptive prefix does not defeat matching) but are otherwise
  used as given.

**Other parsing notes:**

* Separate date and time columns (e.g. ``date`` + ``time``) are combined into a single
  origin time.
* Longitude values outside -180..180 are wrapped into a consistent -180..180 range, so
  events reported on the 0-360 convention (e.g. east of the antimeridian) are not rejected.
* A negative value in a column that cannot be negative (uncertainties, counts, azimuthal
  gap, distances) is read as a "not determined" sentinel (e.g. ``-1``, ``-999``) rather
  than a literal negative measurement.
* A confidence-level column for the horizontal error ellipse is recognised.
* Rake, for focal mechanism data, is normalised to the range -180° (exclusive) to 180°
  (inclusive).
* Magnitude descriptor classes used across the platform (e.g. in chart tooltips): Great
  ≥ 8, Major 7-7.9, Strong 6-6.9, Moderate 5-5.9, Light 4-4.9, Minor 2-3.9, Micro < 2.

QuakeML and GeoJSON files have their origin times normalised to UTC ISO 8601 at parse
time as well (GeoJSON honours the same declared/detected day/month order as CSV).

**Example CSV with common fields:**

.. code-block:: text

   time,latitude,longitude,depth,magnitude,magnitude_type,region
   2024-01-15 10:30:45.123,-41.2865,174.7762,25.3,4.5,ML,Wellington
   2024-01-15 11:22:10.456,-42.1234,173.8765,15.7,3.2,ML,Canterbury
   2024-01-15 14:05:33.789,-43.5321,172.6543,8.2,2.8,ML,Christchurch

**Example CSV with uncertainty data:**

.. code-block:: text

   time,lat,lon,depth,mag,mag_type,lat_error,lon_error,depth_err,azimuthal_gap,stations
   2024-01-15T10:30:45Z,-41.286,174.776,25.3,4.5,ML,0.022,0.030,2.1,85,24
   2024-01-15T11:22:10Z,-42.123,173.876,15.7,3.2,ML,0.015,0.020,5.3,142,12

.. important::
   ``lat_error``/``lon_error`` map to ``latitude_uncertainty``/``longitude_uncertainty``,
   which the platform reads in **decimal degrees**, not kilometres. A degree of latitude is
   about 111 km, so a value like ``0.5`` does not mean "0.5 km" — it is read as roughly
   55 km of uncertainty, which is almost certainly not what was intended. The values above
   (``0.015``-``0.030``) correspond to roughly 1.5-2.5 km at these latitudes (multiply by
   ~111 km/degree for latitude, and by ~111 km/degree x cos(latitude) for longitude). If
   your source data reports uncertainty in kilometres, either convert it to degrees before
   uploading, or map it to the kilometre-based ``horizontal_uncertainty`` field instead.

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
         "latitude": 0.022,
         "longitude": 0.030,
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

.. note::
   ``uncertainties.latitude``/``uncertainties.longitude`` are in decimal degrees, the same
   as the CSV ``lat_error``/``lon_error`` columns above — see the note there on why a
   kilometre value should not be placed here directly.

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

.. note::
   ``time`` may also be a JSON number. A number written as a bare integer date in the
   range 18000101-21001231 (e.g. ``20240115``) is read as ``YYYYMMDD``, since no origin
   time is ever given as a Unix epoch that lands in that range; any other number is read
   as an epoch (seconds if its magnitude is small enough to be a plausible date since
   1970, otherwise milliseconds).

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
* Supported extensions: ``.csv``, ``.txt``, ``.dat``, ``.json``, ``.geojson``, ``.xml``,
  ``.qml``, ``.quakeml`` (``.xml``, ``.qml`` and ``.quakeml`` are all parsed as QuakeML)

.. tip::
   For very large files (>100MB), the platform uses streaming parsers to process
   data efficiently without loading the entire file into memory.

.. note::
   Large files are uploaded to the server in chunks from your browser. The upload session
   belongs to your account, and its expiry is refreshed every time a chunk is received, so
   a slow connection does not by itself cause the session to expire mid-upload. The delimiter
   and date-format overrides available for a regular upload apply here too: a delimiter name
   is matched case-insensitively (``auto`` or none means auto-detect; anything else must be
   ``comma``, ``tab``, ``semicolon``, ``pipe`` or ``space``), and a date format must be
   ``US``, ``International``, ``ISO`` or ``auto``/empty — anything else is rejected up front
   rather than silently falling back to auto-detection.

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

.. note::
   The upload response carries a bounded sample of parsed events — at most 1,000 events or
   1.5 MB, whichever is smaller — rather than the full file, so the response stays under
   Vercel's response-size limit. For a file larger than that, the preview and any
   correctness checks shown at this stage run on that sample only; the interface labels
   results as sample-based when the file is bigger than the preview. Within each previewed
   event, bulky structures the preview never needs (QuakeML picks, arrivals, amplitudes,
   station magnitudes, origins, focal mechanisms) are left out entirely, and any other
   field longer than 2,000 characters is left out too, so one oversized event cannot by
   itself crowd the rest of the sample out of the byte budget.

Step 5: Map Fields to Schema
============================

For CSV, TXT, JSON and GeoJSON files, the mapping shown on this step starts from what the
parser itself already resolved for each column — including magnitude-scale priority, the
depth unit and date format it inferred for that file, and any longitude wrapping — rather
than a blank or independent guess. A fuzzy, auto-detected suggestion may be shown for a
column the parser could not resolve, but it is never applied on its own: only an explicit
change you make to a specific file's mapping is applied on top of the parser's baseline.

A column the parser actually **consumed** to produce a value — a date column combined with
a separate time column into one origin time, or a magnitude type derived from a named
scale column — can never be remapped here: it is shown greyed out with a read-only badge,
e.g. "Origin Time (assembled by the parser)". A scale-named magnitude column that lost out
to a higher-priority one (e.g. an ``ML`` column when the file also has ``Mw``) is different:
it defaults to "Alternative magnitude (ML)" but you can still remap it if you want it read
into a different field. Whenever you do explicitly remap a column, the new target's value
is read straight from that column's raw cell text (not from whatever the parser had already
derived for it); a column remapped onto a length/distance field with no stated unit in its
own name falls back to the parser's default metres rule.

Review and adjust mappings as needed.

.. note::
   QuakeML files are not shown on this step: they are already structured, so their fields
   need no mapping.

**Required Fields:**

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Standard Field
     - Valid Range
     - Description
   * - ``time``
     - Year 1000 CE - present
     - Event origin time (ISO 8601 or parseable format)
   * - ``latitude``
     - -90 to 90
     - Latitude in decimal degrees (WGS84)
   * - ``longitude``
     - -180 to 180
     - Longitude in decimal degrees (WGS84)
   * - ``magnitude``
     - -3 to 10
     - Event magnitude

**Optional Core Fields:**

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Field
     - Description
   * - ``depth``
     - Depth in kilometers (-5 to 1000). Negative values are valid and mean above sea
       level (e.g. volcanic events); QuakeML measures depth from sea level.
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
     - Latitude uncertainty in **decimal degrees**, not kilometres (multiply by
       ~111 km/degree; values are capped at 10°, a ~1100 km sanity bound)
   * - ``longitude_uncertainty``
     - Longitude uncertainty in **decimal degrees**, not kilometres (multiply by
       ~111 km/degree x cos(latitude); also capped at 10°)
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
   * - "Depth outside -5 to 1000 km"
     - Not a rejection: the event is kept and its depth is set to "unknown" (a warning).
       Negative depth (down to -5 km) is valid and means above sea level, e.g. volcanic
       events — check for a metres/kilometres mix-up only if the value looks unexpected.
   * - "Missing required field: time"
     - Map the time column in field mapping

Step 7: Name and Create Catalogue
=================================

**Provide Catalogue Information:**

* **Name** (required): Descriptive name for your catalogue
* **Description** (optional): Additional context or notes

Further metadata — data source, provider, geographic region, a **Source dataset version**
label (the depositor's own release label, separate from the platform-managed catalogue
version described in :doc:`exporting-data`), time period coverage (entered and stored as
UTC), contact details, licensing and keywords — can be filled in on the **Basic Info**,
**Quality & Coverage**, **Contact & License** and **Additional** tabs of this same step.

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

Behind the scenes, **Create Catalogue** does not re-send every parsed event: it references
the files you already uploaded (each held server-side as a pending upload tied to your
account) and is validated as a dry run — counting and checking every event across all the
files — before anything is written. If a pending upload has expired, or its event count no
longer matches what was originally parsed, catalogue creation is rejected and you are
asked to upload the files again.

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

* **time**: Must be a valid date/time, not in the future, no earlier than year 1000 CE
* **latitude**: Must be between -90 and 90 degrees
* **longitude**: Must be between -180 and 180 degrees
* **magnitude**: Must be between -3 and 10

Optional Field Validation
=========================

* **depth**: -5 to 1000 km. Negative values (down to -5 km) are valid and represent events
  above sea level (e.g. volcanic events); QuakeML measures depth from sea level. A depth
  outside this range is not rejected — it is set to "unknown" and the event is kept, with
  a warning, on every input format (CSV, TXT, JSON, GeoJSON and QuakeML alike). Very deep
  events (> 700 km) are separately flagged as an informational note, since they are rare
  but do occur in subduction zones. Every field left empty this way (unreadable or
  out-of-range, on any field, not only depth) is tallied by field name in the import
  report shown after the catalogue is created, e.g. "3 depth values were unreadable or
  out of range and left empty."
* **azimuthal_gap**: 0 to 360 degrees
* **used_phase_count**: Positive integer
* **used_station_count**: Positive integer, ≤ used_phase_count
* **standard_error**: 0 to 100 seconds

Cross-Field Validation
======================

The platform checks for logical consistency:

* Station count cannot exceed phase count
* Very shallow events (< 5 km) with large magnitudes (> 8) trigger warnings
* Very deep events (> 300 km) with small magnitudes (< 3) trigger warnings, and events
  deeper than 700 km with magnitude < 4 trigger a further warning
* Latitude and longitude uncertainty are compared as physical distances (~111 km/degree
  for latitude, adjusted by cos(latitude) for longitude, so the comparison stays accurate
  away from the equator); an asymmetry ratio greater than 10:1 between them triggers a
  warning, which may indicate poor station distribution or a systematic error

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
