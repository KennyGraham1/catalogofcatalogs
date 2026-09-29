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

Every CSV export has the same fixed header row, grouped below in emission order:

* **Core fields:** ``ID``, ``CatalogueID``, ``Time``, ``CreatedAt``, ``Latitude``,
  ``Longitude``, ``Depth``, ``Magnitude``, ``MagnitudeType``, ``EventType``,
  ``EventTypeCertainty``, ``Region``, ``LocationName``, ``Source``, ``SourceEventsJSON``,
  ``SourceID``, ``PublicID``
* **Location uncertainties:** ``TimeUncertainty``, ``LatitudeUncertainty``,
  ``LongitudeUncertainty``, ``DepthUncertainty``, ``HorizontalUncertainty``,
  ``MagnitudeUncertainty``
* **Origin metadata:** ``DepthType``, ``EarthModelID``, ``MethodID``, ``AgencyID``,
  ``Author``
* **Magnitude details:** ``MagnitudeStationCount``, ``MagnitudeMethodID``,
  ``MagnitudeEvaluationMode``, ``MagnitudeEvaluationStatus``
* **Quality metrics:** ``AzimuthalGap``, ``UsedStationCount``, ``UsedPhaseCount``,
  ``StandardError``, ``MinimumDistance``, ``MaximumDistance``, ``AssociatedPhaseCount``,
  ``AssociatedStationCount``, ``DepthPhaseCount``
* **Evaluation metadata:** ``EvaluationMode``, ``EvaluationStatus``, ``PreferredOriginID``,
  ``PreferredMagnitudeID``
* **Error ellipse:** ``MinHorizontalUncertainty``, ``MaxHorizontalUncertainty``,
  ``AzimuthMaxHorizontalUncertainty``, ``ConfidenceLevel``, ``PreferredFocalMechanismID``
* **Source event type:** ``SourceEventType`` — the event type exactly as the source agency
  reported it, before any mapping onto the platform's own controlled vocabulary
* **Lineage and provenance** (per event): ``SourceCatalogueIDs``, ``MergeStrategy``,
  ``MergeParameters``, ``SelectedSource``, ``SelectedSourceCatalogueID``, ``QualityScore``,
  ``QualityGrade``
* **Catalogue version:** ``CatalogueVersion`` — the catalogue's MAJOR.MINOR.PATCH version
  this row was exported from, carried on every row so it survives filtering and
  concatenating several exports

When the export was declustered (see *Declustering* below), two further columns are
appended after ``CatalogueVersion``: ``ClusterID`` and ``IsMainshock``.

.. note::
   Column names and order are fixed. The lineage columns are empty for events stored
   before per-event lineage tracking existed.

**Source column:** for a plain (non-merged) event, ``Source`` is simply the event's own
data source. For a merged event it is: the source (or agency) of the contributing member
the merge selected to publish that event's solution, when one was selected; ``merged``
when the row came from an Average-strategy merge with no single selected member; and
otherwise the source whose agency label qualifies the row's ``SourceID`` (in the form
``<source>:<id>``), falling back to whichever contributing member's own stored solution
matches the row's published hypocentre.

**Example** (a representative excerpt — not the full column set above):

.. code-block:: text

   Time,Latitude,Longitude,Depth,Magnitude,MagnitudeType,Source,QualityScore,QualityGrade,CatalogueVersion
   2024-01-15T10:30:45Z,-41.5,174.2,25.3,4.5,ML,GeoNet,87,A,1.2.0
   2024-01-15T11:22:10Z,-42.1,173.8,15.7,3.2,ML,merged,74,B+,1.2.0

.. note::
   ``QualityScore`` is always an integer from 0-100 (e.g. ``87``), never a decimal like
   ``85.5``. ``QualityGrade`` is the corresponding letter grade (A+, A, B+, B, C, D or F).

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

A QuakeML export is **streamed**: the server writes it a chunk at a time as it is
generated rather than building the whole document in memory first, so exporting a very
large catalogue does not need memory proportional to its size.

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

.. rubric:: Event identity and lineage

* Each event's ``publicID`` prefers the event's own stored public ID; failing that, a
  GeoNet-sourced event gets ``smi:nz.org.geonet/<EventID>``; failing that, an identity
  built from the source ID (``smi:local/source/<id>``); and only as a last resort the
  row's own database ID.
* For a merged event, the preferred origin's ``publicID`` is
  ``smi:local/origin/<id>-merged`` when no single contributing member's own solution
  matches the published hypocentre; otherwise the contributing agency's own origin ID is
  kept.
* Per-event lineage — contributing source catalogues, merge strategy, selected source,
  quality score/grade and, when the export was declustered, the cluster tag — is recorded
  as an XML comment on the event: a ``Lineage: {...}`` JSON blob. Any event-type
  relabelling applied to fit the QuakeML BED vocabulary is recorded in a separate comment.
* Arrivals and moment tensors stored without their own ID get a derived, deterministic ID
  (an ``#arrival-N``-style fragment of their parent's ID, and similarly for moment
  tensors), so re-exporting the same event produces the same IDs.
* ``creationInfo/version`` on the exported document is the catalogue's own version string,
  not a placeholder, and ``QualityGrade`` in the lineage comment is the event's real
  computed grade.

The export has been validated against the QuakeML-BED-1.2.xsd schema (with lxml) and
round-tripped through ObsPy 1.5.0 offline.

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

.. note::
   This structure round-trips: a file produced by this export can be re-uploaded and
   parsed correctly (see :doc:`uploading-data`).

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

Exports accept the same filter query parameters as the catalogue's event-filter API, so
any export format (``csv``, ``json``, ``geojson``, ``kml`` or ``quakeml``) can be scoped to
a subset of events:

* Magnitude range, depth range (km) and time range (UTC)
* Geographic bounding box, including a box that crosses the antimeridian
* Event type, magnitude type, evaluation status
* Azimuthal gap, station count, phase count, standard error (origin RMS)
* Per-field uncertainty maxima (horizontal, depth, time, magnitude)
* A minimum quality score

**Via the web interface:** on a catalogue's page, set filters with the event filter
controls above the events table. Once a filter is active, an **Export filtered events
(CSV)** button appears next to the filter controls (it is not shown when no filter is
active). Only events matching the filters are exported.

**Via the API:** append the filter parameters directly to the export URL's query string,
e.g. ``?format=csv&minMagnitude=4&startTime=2020-01-01T00:00:00Z``. A filtered export's
metadata, and its ``X-Export-Filter`` response header, record exactly which filters were
applied.

.. tip::
   Use filtered exports to create specialized catalogues for specific analyses.

--------------------
Declustering
--------------------

Add ``decluster=gardner-knopoff`` to the export query string, on any format, to tag every
exported event with its Gardner-Knopoff (1974) cluster:

* ``ClusterID`` — the ID of the event's cluster (its mainshock's event ID), or empty for
  an event assigned to no cluster
* ``IsMainshock`` — ``true`` for a cluster's mainshock (and for an event in no cluster);
  ``false`` for a dependent event that a full declustering pass would remove

The export's metadata records the algorithm name, the time/distance windows it used, and
cluster counts (mainshocks, dependents, cluster count). Without ``decluster``, the export
metadata records declustering as ``none``, and the ``X-Export-Declustering`` response
header reads ``none`` too.

On the catalogue page, the **Export** dropdown menu has an **Include Gardner-Knopoff
declustering tags** checkbox. When checked, it adds ``decluster=gardner-knopoff`` to
whichever export format you then choose from that same menu (CSV, JSON, GeoJSON, KML or
QuakeML), and it also applies when you use the **Export filtered events (CSV)** button —
the two can be combined. Outside the web interface, request it directly as the
``decluster`` query parameter on the export API.

-------------------------------------
Version, Timestamp and Checksum
-------------------------------------

Every export, in every format, records:

* The catalogue's id and its **MAJOR.MINOR.PATCH version** (the platform-managed version
  number — distinct from the depositor-supplied **Source dataset version** label set in
  the catalogue's own metadata) and when that version was last updated
* The export timestamp, in UTC
* A SHA-256 checksum of the exported event rows

The checksum is computed over the canonical CSV rendering of the selected rows (the plain
``format=csv`` body: header record plus one record per event, LF-separated) — **not** each
format's own serialization. This means a CSV, JSON, GeoJSON, KML and QuakeML export of the
same selection (same filter and declustering option) all carry the *same* checksum value,
so it can be used to confirm two exports in different formats cover identical data.

These values are also sent as response headers on every export:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Header
     - Meaning
   * - ``X-Catalogue-Version``
     - The catalogue's MAJOR.MINOR.PATCH version at export time
   * - ``X-Export-Rows-SHA256``
     - The SHA-256 checksum described above
   * - ``X-Export-Filter``
     - The filter query string that was applied, or ``none``
   * - ``X-Export-Declustering``
     - ``gardner-knopoff`` or ``none``

The downloaded filename also carries the catalogue version and, for a filtered export, a
``_filtered`` suffix — see *File Naming* below.

.. important::
   There is no snapshot store: retrieving a **past** version of a catalogue through the
   platform is not possible. If you need to preserve a specific data state permanently,
   make an archival deposit with a DOI, as recommended elsewhere in this guide — do not
   rely on the catalogue version number as a way to roll back to, or re-fetch, older data.

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
5. Compare the ``X-Export-Rows-SHA256`` checksum if you need to confirm two exports (or
   two formats of the same export) cover exactly the same rows

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
* Lineage and provenance (source catalogues, merge strategy, quality score) for merged
  catalogues
* The catalogue version and rows checksum, if you need to verify data integrity later

-----------------
File Naming
-----------------

Exported files use descriptive names that also carry the catalogue version and, for a
filtered export, a ``_filtered`` suffix:

.. code-block:: text

   {catalogue_name}_v{version}_{date}[_filtered].{format}

   Examples:
   GeoNet_New_Zealand_v1.2.0_20240115.csv
   Canterbury_Aftershocks_v2.0.1_20240115_filtered.csv
   Merged_Regional_Data_v1.0.0_20240115.geojson

.. note::
   A QuakeML export's filename additionally starts with a ``quakeml_`` prefix, e.g.
   ``quakeml_Canterbury_Aftershocks_v2.0.1_20240115.xml``.

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

