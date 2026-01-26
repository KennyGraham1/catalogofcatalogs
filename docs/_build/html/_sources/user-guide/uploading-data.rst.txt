==============
Uploading Data
==============

Learn how to upload earthquake catalogue data in various formats to the platform.

--------
Overview
--------

The Earthquake Catalogue Platform supports multiple data formats and provides intelligent parsing with automatic format detection. You can upload files up to 500MB in size.

-----------------
Supported Formats
-----------------

CSV and TXT Files
=================

**Delimited text files** with automatic delimiter detection:

* Comma (``,``)
* Tab (``\t``)
* Semicolon (``;``)
* Pipe (``|``)
* Space

**Date format detection:**

* US format (MM/DD/YYYY)
* International format (DD/MM/YYYY)
* ISO 8601 (YYYY-MM-DD)

**Example CSV:**

.. code-block:: text

   time,latitude,longitude,depth,magnitude,magnitude_type
   2024-01-15 10:30:45,-41.5,174.2,25.3,4.5,ML
   2024-01-15 11:22:10,-42.1,173.8,15.7,3.2,ML

JSON Files
==========

**Array format:**

.. code-block:: json

   [
     {
       "time": "2024-01-15T10:30:45Z",
       "latitude": -41.5,
       "longitude": 174.2,
       "depth": 25.3,
       "magnitude": 4.5,
       "magnitude_type": "ML"
     }
   ]

**Object format:**

.. code-block:: json

   {
     "events": [
       {
         "time": "2024-01-15T10:30:45Z",
         "latitude": -41.5,
         "longitude": 174.2,
         "depth": 25.3,
         "magnitude": 4.5
       }
     ]
   }

GeoJSON Files
=============

**FeatureCollection format:**

.. code-block:: json

   {
     "type": "FeatureCollection",
     "features": [
       {
         "type": "Feature",
         "geometry": {
           "type": "Point",
           "coordinates": [174.2, -41.5, 25.3]
         },
         "properties": {
           "time": "2024-01-15T10:30:45Z",
           "magnitude": 4.5,
           "magnitude_type": "ML"
         }
       }
     ]
   }

QuakeML Files
=============

Full QuakeML 1.2 BED (Basic Event Description) format support.

.. code-block:: xml

   <?xml version="1.0" encoding="UTF-8"?>
   <quakeml xmlns="http://quakeml.org/xmlns/bed/1.2">
     <eventParameters>
       <event publicID="quakeml:example.org/event/123">
         <origin>
           <time><value>2024-01-15T10:30:45Z</value></time>
           <latitude><value>-41.5</value></latitude>
           <longitude><value>174.2</value></longitude>
           <depth><value>25300</value></depth>
         </origin>
         <magnitude>
           <mag><value>4.5</value></mag>
           <type>ML</type>
         </magnitude>
       </event>
     </eventParameters>
   </quakeml>

--------------
Upload Process
--------------

Step 1: Navigate to Upload Page
================================

Click **Upload** in the navigation menu or go to ``/upload``.

Step 2: Configure Parsing Options (Optional)
=============================================

The platform auto-detects format settings, but you can override:

**Delimiter Selection:**

* Auto-detect (recommended)
* Comma
* Tab
* Semicolon
* Pipe
* Space

**Date Format:**

* Auto-detect (recommended)
* US (MM/DD/YYYY)
* International (DD/MM/YYYY)
* ISO 8601 (YYYY-MM-DD)

Step 3: Select Your File
=========================

Click **Choose File** or drag and drop your file into the upload area.

.. tip::
   Files up to 500MB are supported. Large files are processed using streaming parsers for efficiency.

Step 4: Map Fields to Schema
=============================

After upload, the platform displays detected fields. Map them to the standard schema:

**Required Fields:**

* ``time`` - Event origin time
* ``latitude`` - Latitude in decimal degrees (-90 to 90)
* ``longitude`` - Longitude in decimal degrees (-180 to 180)
* ``magnitude`` - Event magnitude

**Optional Fields:**

* ``depth`` - Depth in kilometers
* ``magnitude_type`` - Magnitude scale (ML, Mw, mb, etc.)
* ``region`` - Geographic region
* ``azimuthal_gap`` - Largest azimuthal gap in degrees
* ``used_phase_count`` - Number of phases used
* ``used_station_count`` - Number of stations used
* And many more...

.. note::
   You can save field mappings as templates for reuse with similar datasets.

Step 5: Name Your Catalogue
============================

Provide a descriptive name for your catalogue:

.. code-block:: text

   Example: "New Zealand Earthquakes 2024"
   Example: "Canterbury Aftershock Sequence"

Step 6: Upload and Create
==========================

Click **Create Catalogue** to process and store your data.

The platform will:

1. Validate all events
2. Check for data quality issues
3. Calculate quality scores
4. Store events in the database
5. Generate catalogue statistics

-----------------
Field Mapping Tips
-----------------

Common Field Names
==================

The platform recognizes common field name variations:

.. list-table::
   :header-rows: 1

   * - Standard Field
     - Common Variations
   * - ``time``
     - datetime, origin_time, event_time, timestamp
   * - ``latitude``
     - lat, y, northing
   * - ``longitude``
     - lon, long, x, easting
   * - ``depth``
     - depth_km, z, focal_depth
   * - ``magnitude``
     - mag, ml, mw, size

Saving Templates
================

After mapping fields, save as a template:

1. Click **Save as Template**
2. Name your template (e.g., "GeoNet Format")
3. Reuse for future uploads with the same format

-----------------
Validation Errors
-----------------

The platform validates data and reports errors:

**Common Issues:**

* Invalid coordinates (outside valid ranges)
* Missing required fields
* Invalid date formats
* Magnitude out of range (-2 to 10)
* Depth negative or > 1000 km

.. warning::
   Events with validation errors are skipped. Review the error report and fix your data file.

----------
Next Steps
----------

After uploading:

* :doc:`visualization` - View your catalogue on the map
* :doc:`quality-assessment` - Review quality scores
* :doc:`merging-catalogues` - Merge with other catalogues
* :doc:`exporting-data` - Export in different formats

