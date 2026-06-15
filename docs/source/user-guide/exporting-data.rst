==============
Exporting Data
==============

Learn how to export earthquake catalogues in various formats for analysis,
sharing, and archival.

--------
Overview
--------

The platform supports exporting catalogues in multiple standard formats, each
optimized for different use cases:

* **CSV** - Spreadsheets and statistical analysis
* **QuakeML 1.2** - Seismological software and standards compliance
* **JSON** - Web applications and programming
* **GeoJSON** - GIS and mapping applications
* **KML** - Google Earth and KML-compatible GIS software

All exports preserve complete event metadata, quality metrics, and source
information.

Format Comparison
=================

.. list-table::
   :header-rows: 1
   :widths: 15 20 20 20 25

   * - Feature
     - CSV
     - QuakeML
     - JSON
     - GeoJSON
     - KML
   * - Human readable
     - Yes
     - Somewhat
     - Yes
     - Yes
     - Yes
   * - Excel compatible
     - Yes
     - No
     - No
     - No
     - No
   * - GIS compatible
     - Limited
     - No
     - No
     - Yes
     - Yes
   * - Full metadata
     - Partial
     - Yes
     - Yes
     - Partial
     - Partial
   * - File size
     - Smallest
     - Largest
     - Medium
     - Medium
     - Medium
   * - Best for
     - Analysis
     - Exchange
     - APIs
     - Mapping
     - Google Earth

--------------
Export Formats
--------------

CSV Export
==========

**Format:** Comma-separated text file

**Use cases:**

* Spreadsheet analysis (Excel, Google Sheets)
* Statistical software (R, Python pandas)
* GIS software import
* Data sharing and archival

**Included fields:**

* All standard earthquake parameters
* Quality metrics
* Uncertainty values
* Source information
* Evaluation metadata

**Example:**

.. code-block:: text

   time,latitude,longitude,depth,magnitude,magnitude_type,quality_grade
   2024-01-15T10:30:45Z,-41.5,174.2,25.3,4.5,ML,A
   2024-01-15T11:22:10Z,-42.1,173.8,15.7,3.2,ML,B+

QuakeML Export
==============

**Format:** XML following QuakeML 1.2 BED specification

**Use cases:**

* Seismological software (SeisComP, Antelope)
* Data exchange with other agencies
* Long-term archival
* Standards-compliant workflows

**Features:**

* Full event parameters
* Origin and magnitude details
* Picks and arrivals (if available)
* Focal mechanisms
* Quality metrics
* Evaluation metadata

**Example:**

.. code-block:: xml

   <?xml version="1.0" encoding="UTF-8"?>
   <quakeml xmlns="http://quakeml.org/xmlns/bed/1.2">
     <eventParameters>
       <event publicID="quakeml:catalogofcatalogs/event/123">
         <preferredOriginID>quakeml:catalogofcatalogs/origin/123</preferredOriginID>
         <preferredMagnitudeID>quakeml:catalogofcatalogs/magnitude/123</preferredMagnitudeID>
         <type>earthquake</type>
         <origin publicID="quakeml:catalogofcatalogs/origin/123">
           <time><value>2024-01-15T10:30:45Z</value></time>
           <latitude><value>-41.5</value></latitude>
           <longitude><value>174.2</value></longitude>
           <depth><value>25300</value></depth>
         </origin>
       </event>
     </eventParameters>
   </quakeml>

JSON Export
===========

**Format:** JavaScript Object Notation

**Use cases:**

* Web applications
* API integration
* JavaScript/Node.js processing
* NoSQL database import

**Structure:**

.. code-block:: json

   {
     "catalogue": {
       "id": "550e8400-e29b-41d4-a716-446655440000",
       "name": "GeoNet - New Zealand 2024",
       "event_count": 1234
     },
     "events": [
       {
         "time": "2024-01-15T10:30:45Z",
         "latitude": -41.5,
         "longitude": 174.2,
         "depth": 25.3,
         "magnitude": 4.5,
         "magnitude_type": "ML"
       }
     ]
   }

GeoJSON Export
==============

**Format:** GeoJSON FeatureCollection

**Use cases:**

* GIS software (QGIS, ArcGIS)
* Web mapping (Leaflet, Mapbox)
* Spatial analysis
* Geographic visualization

**Structure:**

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
           "magnitude_type": "ML",
           "quality_grade": "A"
         }
       }
     ]
   }

--------------
Export Process
--------------

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart TD
       Start(["Start"])
       Select["Select Catalogue"]
       Filter{"Apply Filters?"}
       Apply[/"Apply Filters (Time, Mag, Region)"/]
       Format{"Choose Format"}

       subgraph Formats["Export Formats"]
           CSV[/"CSV (Analysis)"/]
           QML[/"QuakeML (Exchange)"/]
           JSON[/"JSON (Web / API)"/]
           Geo[/"GeoJSON (GIS / Map)"/]
       end

       Download[/"Download File"/]
       Validate{"Data Valid?"}
       Done(["Done"])
       Fix("Re-export or correct source")

       Start --> Select
       Select --> Filter
       Filter -->|"yes"| Apply
       Apply --> Format
       Filter -->|"no"| Format

       Format --> CSV
       Format --> QML
       Format --> JSON
       Format --> Geo

       CSV --> Download
       QML --> Download
       JSON --> Download
       Geo --> Download

       Download --> Validate
       Validate -->|"pass"| Done
       Validate -->|"issues found"| Fix
       Fix -. "retry" .-> Format

       style Formats fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

       class Start terminal
       class Done terminal
       class Select frontend
       class Filter,Format,Validate decision
       class Apply,CSV,QML,JSON,Geo,Download process
       class Fix warning

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

Via Web Interface
=================

**Step 1:** Navigate to **Catalogues** page

**Step 2:** Select a catalogue

**Step 3:** Click the download icon or **Export** button

**Step 4:** Choose format:

* CSV
* QuakeML
* JSON
* GeoJSON
* KML

**Step 5:** Download file

Via API
=======

Use the API for programmatic exports. All formats are available through a single
``GET`` endpoint with a ``format`` query parameter:

**CSV Export:**

.. code-block:: bash

   curl -X GET "http://localhost:3000/api/catalogues/{id}/export?format=csv" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -o catalogue.csv

**QuakeML Export:**

.. code-block:: bash

   curl -X GET "http://localhost:3000/api/catalogues/{id}/export?format=quakeml" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -o catalogue.xml

**Other formats:** Replace ``format=csv`` with ``format=json``, ``format=geojson``, or ``format=kml``.

See :doc:`../api-reference/export` for complete API documentation.

-----------------
Filtered Exports
-----------------

Export subsets of catalogues:

**Step 1:** Apply filters on the Analytics or Catalogues page:

* Magnitude range
* Depth range
* Time range
* Quality grade
* Geographic bounds

**Step 2:** Click **Export Filtered Data**

**Step 3:** Choose format

Only events matching the filters will be exported.

.. tip::
   Use filtered exports to create specialized catalogues for specific analyses.

-----------------
Best Practices
-----------------

Format Selection
================

Choose the appropriate format:

* **CSV:** General analysis, spreadsheets
* **QuakeML:** Seismological software, archival
* **JSON:** Web applications, APIs
* **GeoJSON:** GIS, mapping

Data Validation
===============

After export:

1. Verify event count matches expected value
2. Check for missing or null values
3. Validate coordinate ranges
4. Confirm magnitude and depth values

Large Catalogues
================

For catalogues with >10,000 events:

* Use filtered exports to reduce size
* Export in batches by time period
* Consider compression (gzip)
* Use streaming for very large datasets

Metadata Preservation
=====================

Ensure exports include:

* Source information
* Quality metrics
* Uncertainty values
* Evaluation metadata
* Processing history

-----------------
File Naming
-----------------

Exported files use descriptive names:

.. code-block:: text

   {catalogue_name}_{date}.{format}
   
   Examples:
   GeoNet_New_Zealand_2024_20240115.csv
   Canterbury_Aftershocks_20240115.xml
   Merged_Regional_Data_20240115.geojson

-----------------
Troubleshooting
-----------------

Export Fails
============

If export fails:

* Check catalogue size (very large catalogues may timeout)
* Try filtered export with smaller subset
* Verify sufficient disk space
* Check network connection for API exports

Invalid Data
============

If exported data has issues:

* Verify source data quality
* Check field mappings
* Review validation errors
* Re-upload with corrections

Format Compatibility
====================

If software can't read exported file:

* Verify format specification compliance
* Check character encoding (UTF-8)
* Validate XML/JSON syntax
* Try alternative format

----------
Next Steps
----------

* :doc:`../api-reference/export` - API documentation
* :doc:`quality-assessment` - Quality metrics in exports
* :doc:`../developer-guide/index` - Custom export formats

