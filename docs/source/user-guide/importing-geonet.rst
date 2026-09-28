=====================
Importing from GeoNet
=====================

Learn how to automatically import earthquake data from GeoNet's FDSN Event Web
Service. This guide covers the import process, configuration options, duplicate
handling, and best practices for maintaining current catalogues.

--------
Overview
--------

The platform provides seamless integration with GeoNet (New Zealand's geological
hazard information system) to automatically import earthquake data. This feature
is ideal for:

* Maintaining up-to-date earthquake catalogues for New Zealand
* Importing historical data for specific regions or time periods
* Updating existing events with revised (reviewed) parameters
* Building baseline catalogues for seismological research
* Comparing local data with the official GeoNet catalogue

Import Process Overview
=======================

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart LR
       Start(["Start import"]):::terminal

       subgraph Retrieve["Retrieve from GeoNet"]
           Query[["/api/import/geonet"]]:::backend
           Fetch[/"Fetch QuakeML response"/]:::process
       end

       subgraph Transform["Transform &amp; validate"]
           Parse[/"Parse: extract events"/]:::process
           Dedupe{"Duplicate match?"}:::decision
           Score[/"Quality grading"/]:::process
           ScoreLib[["lib/quality-scoring.ts"]]:::library
       end

       subgraph Persist["Persist &amp; summarize"]
           Store[("catalogues")]:::datastore
           Skipped("Skipped: duplicate"):::success
           Report("Import summary"):::success
       end

       GeoNet{{"GeoNet FDSN service"}}:::external

       Start --> Query
       Query -. "FDSN query" .-> GeoNet
       GeoNet -. "QuakeML 1.2 BED" .-> Fetch
       Query --> Fetch
       Fetch --> Parse
       Parse --> Dedupe
       Dedupe -->|"new event"| Score
       Dedupe -->|"skip duplicate"| Skipped
       Score --> ScoreLib
       ScoreLib --> Store
       Store --> Report
       Skipped --> Report

       style Retrieve fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style Transform fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style Persist fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

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


-----------
Data Source
-----------

About GeoNet
============

GeoNet is New Zealand's geological hazard monitoring system, operated by GNS
Science on behalf of the New Zealand Government. It provides real-time earthquake
information for New Zealand and the surrounding region.

**Key Facts:**

* **Organization:** GNS Science
* **Coverage:** New Zealand and surrounding oceanic regions
* **Network:** 300+ seismic stations
* **Detection:** Events as small as M 0.5 in well-monitored areas

FDSN Event Web Service
======================

The platform uses the FDSN (International Federation of Digital Seismograph
Networks) Event Web Service standard for data retrieval.

**Service Details:**

.. list-table::
   :widths: 30 70
   :header-rows: 0

   * - **URL**
     - https://service.geonet.org.nz/fdsnws/event/1/query
   * - **Protocol**
     - FDSN Web Service 1.2
   * - **Format**
     - QuakeML 1.2 BED
   * - **Authentication**
     - None required (public access)
   * - **Rate Limits**
     - Reasonable use expected
   * - **License**
     - `CC BY 4.0 <https://creativecommons.org/licenses/by/4.0/>`_

**Data Quality:**

GeoNet provides high-quality earthquake data with:

* Reviewed locations and magnitudes for significant events
* Real-time automatic solutions for recent events
* Comprehensive uncertainty estimates
* Quality metrics (phase counts, azimuthal gaps, RMS)

**Attribution:**

When using GeoNet data, please cite:

  GeoNet Project. (2024). New Zealand Earthquake Catalogue. GNS Science.
  https://www.geonet.org.nz/

Data Fields Imported
====================

The following fields are extracted from GeoNet's QuakeML response:

**Location Parameters:**

* Origin time with uncertainty
* Latitude and longitude with uncertainties
* Depth with uncertainty
* Origin evaluation mode (automatic/manual)
* Origin evaluation status (preliminary/confirmed/reviewed/final)

**Magnitude Parameters:**

* Preferred magnitude value with uncertainty
* Magnitude type (ML, Mw, etc.)
* Station count for magnitude determination

**Quality Metrics:**

* Used phase count
* Used station count
* Standard error (RMS residual)
* Azimuthal gap
* Minimum distance to nearest station

**Event Metadata:**

* Public ID (unique GeoNet identifier)
* Event type (earthquake, etc.)
* Geographic region (Flinn-Engdahl region)

GeoNet's own event-type text is kept verbatim in ``source_event_type``. The
normalised ``event_type`` field follows SeisComP's QuakeML event-type
mapping: GeoNet's ``outside of network interest`` and ``induced earthquake``
types map to QuakeML's ``other event`` and ``induced or triggered event``
respectively, and GeoNet's ordinary types (``earthquake``, and so on) pass
through unchanged. GeoNet's ``duplicate``, ``not existing`` and
``not locatable`` types are excluded from the import entirely — see
*Configure Duplicate Handling* below.

--------------
Import Process
--------------

Step 1: Navigate to Import Page
===============================

Click **Import** in the navigation menu or go directly to ``/import``.

Step 2: Configure Time Range
============================

Choose how to specify the time range:

**Quick Select (Recent Events):**

Use preset options for recent seismicity:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Option
     - Use Case
   * - Last 1 hour
     - Monitor recent activity
   * - Last 6 hours
     - Daily review
   * - Last 24 hours
     - Daily update
   * - Last 7 days
     - Weekly review
   * - Last 30 days
     - Monthly update

**Custom Date Range:**

Specify exact start and end dates:

.. code-block:: text

   Start Date: 2024-01-01 00:00:00 UTC
   End Date:   2024-01-31 23:59:59 UTC

.. tip::
   For large date ranges (>1 year), import in smaller chunks (e.g., monthly)
   to avoid timeouts and memory issues.

**Historical Data Tips:**

* GeoNet's digital catalogue extends back to approximately 1843
* High-quality digital data available from 1990s onward
* Best quality data from 2000 onward with GeoNet network deployment

Step 3: Set Magnitude Filters
=============================

Filter events by magnitude range:

.. code-block:: text

   Minimum Magnitude: 2.0
   Maximum Magnitude: 10.0 (or leave empty for no max)

**Magnitude Guidelines:**

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Range
     - Description
   * - M ≥ 5.0
     - Damaging earthquakes; comprehensive global coverage
   * - M ≥ 4.0
     - Significant earthquakes; felt over wide areas
   * - M ≥ 3.0
     - Felt earthquakes; widely recorded
   * - M ≥ 2.0
     - Recorded earthquakes; good network coverage needed
   * - M ≥ 1.0
     - Microearthquakes; limited to well-monitored areas
   * - M ≥ 0.0
     - All events including micro-seismicity (large volume)

.. warning::
   Importing all events (M ≥ 0) for extended periods will result in very large
   catalogues (100,000+ events per year). Consider filtering by region or
   magnitude.

Step 4: Set Depth Filters (Optional)
====================================

Filter by hypocentral depth:

.. code-block:: text

   Minimum Depth: 0 km
   Maximum Depth: 100 km

**New Zealand Depth Context:**

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Depth Range
     - Characteristics
   * - 0-15 km
     - Crustal earthquakes; most common in NZ
   * - 15-40 km
     - Lower crust to upper mantle
   * - 40-100 km
     - Subduction-related (Hikurangi, Puysegur)
   * - 100-300 km
     - Deep subduction zone events
   * - 300-700 km
     - Very deep events (rare in NZ region)

**Typical Filters:**

* **Shallow only (0-40 km):** Most crustal earthquakes
* **Upper 100 km:** Excludes very deep subduction events
* **All depths:** Complete catalogue including deep events

Step 5: Define Geographic Bounds (Optional)
===========================================

Limit imports to a specific region using a bounding box:

.. code-block:: text

   Minimum Latitude:  -53   (South)
   Maximum Latitude:  -28   (North)
   Minimum Longitude: 165   (West)
   Maximum Longitude: -175  (East)

.. note::
   The "All New Zealand" bounds cross the antimeridian (180°): the box runs
   east from 165°E, through 180°, to 175°W, so the minimum longitude (165)
   is numerically *greater* than the maximum longitude (-175). This is the
   platform's ``NZ_NATIONAL_BOUNDS`` and is what the **Use New Zealand
   region** preset button fills in. It covers the main islands, the
   Kermadec Islands, the Chatham Islands, the Bounty/Antipodes Islands and
   the Auckland/Campbell Islands — an older, smaller box (-47.5 to -34.0
   latitude, 165.0 to 179.0 longitude) used to exclude all of those
   offshore territories and has been replaced.

**Regions:**

Only **All New Zealand** is a one-click preset (the **Use New Zealand
region** button, which fills in ``NZ_NATIONAL_BOUNDS``). The other rows
below are example boxes for sub-regions you can type into the four
coordinate fields by hand; the platform does not currently offer a button
for them.

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Region
     - Coordinates
   * - All New Zealand (preset button)
     - Lat: -53 to -28, Lon: 165 to -175 (crosses the antimeridian)
   * - North Island (manual entry)
     - Lat: -42.0 to -34.0, Lon: 172.0 to 179.0
   * - South Island (manual entry)
     - Lat: -47.5 to -40.0, Lon: 165.0 to 175.0
   * - Canterbury (manual entry)
     - Lat: -44.5 to -42.0, Lon: 170.5 to 174.0
   * - Wellington (manual entry)
     - Lat: -42.0 to -40.5, Lon: 174.0 to 176.5
   * - Auckland (manual entry)
     - Lat: -37.5 to -36.0, Lon: 174.0 to 175.5
   * - Taupo Volcanic Zone (manual entry)
     - Lat: -39.5 to -37.5, Lon: 175.5 to 177.0

.. note::
   Leave bounds empty to import all events within the time and magnitude range
   for the entire GeoNet coverage area.

Step 6: Configure Duplicate Handling
====================================

Choose how to handle events that already exist in your catalogue:

**Skip Duplicates (Default)**

Events already in the catalogue are skipped. Use this when:

* Building a new catalogue from scratch
* Adding events for a new time period
* You want to preserve local modifications

**Update Existing Events**

Rewrite the stored fields that GeoNet has actually revised since the last
import (fields that have not changed are left alone). Use this when:

* Refreshing automatic solutions with reviewed parameters
* Updating preliminary data with final solutions
* Syncing with GeoNet's latest revisions

**How Duplicates Are Detected:**

The platform matches an incoming GeoNet event to a stored one **only** by
its GeoNet EventID (``source_id``) — there is no time, distance or
magnitude proximity matching. This means:

* Re-importing the same time range from GeoNet always dedupes correctly,
  because the EventID is always the same.
* Importing the *same* earthquake a second time from a source that carries
  no GeoNet EventID (e.g. a plain CSV upload, or a different catalogue) is
  **not** detected as a duplicate and will insert a second copy of it.

**Excluded Event Types**

Separately from the skip/update choice above, GeoNet records typed
``duplicate``, ``not existing`` or ``not locatable`` are never imported at
all — they are counted as "Excluded" in the import results (see
*Import Results* below) rather than stored under any event type.

Step 7: Select or Create Catalogue
==================================

**Create New Catalogue:**

Provide a descriptive name:

.. code-block:: text

   Good examples:
   - "GeoNet NZ 2024"
   - "Canterbury Earthquakes M3+ 2020-2024"
   - "Taupo Volcanic Zone - All Events"

**Add to Existing Catalogue:**

Select an existing catalogue from the dropdown. Only catalogues this
importer created are offered as targets, since duplicate detection matches
on the GeoNet EventID that only a GeoNet import stamps on its own events;
adding GeoNet events to an unrelated catalogue would sit them beside
that catalogue's own copies of the same earthquakes with no way to
reconcile them. Events already stored are compared with GeoNet's current
solution, and only the fields GeoNet has actually revised are rewritten.

Step 8: Start Import
====================

Click **Start Import** to begin.

**Processing Steps:**

1. **Query:** Send request to GeoNet FDSN service
2. **Fetch:** Download QuakeML response
3. **Parse:** Extract events and metadata
4. **Deduplicate:** Compare with existing events
5. **Score:** Calculate quality grades
6. **Store:** Insert new/updated events
7. **Report:** Generate import summary

**Progress Indicator:**

During import, you'll see:

* Events fetched count
* Events processed count
* Current processing stage

--------------
Import Results
--------------

After import completes, review the summary:

.. code-block:: text

   Import Summary
   ==============

   Source:            GeoNet FDSN Event Web Service
   Time Range:        2024-01-01 to 2024-01-31
   Magnitude Range:   M ≥ 3.0

   Results:
   --------
   Total Fetched:       1,234 events
   New Events:          1,120 events
   Updated Events:      45 events
   Skipped (unchanged): 39 events
   Collided:            2 events   (EventID written by a concurrent import)
   Invalid:             15 events  (unusable or failed validation)
   Excluded:            10 events  (GeoNet type: 6 duplicate, 4 not locatable)
   Failed:              3 events   (database write failed)
   Errors:              0

   Quality Distribution:
   A+/A: 342 (28%)
   B+/B: 521 (42%)
   C:    287 (23%)
   D/F:  85 (7%)

   Processing Time:   12.5 seconds

Every fetched row lands in exactly one of New/Updated/Skipped/Collided/
Invalid/Excluded/Failed, so those counts sum to Total Fetched.

--------------
Import History
--------------

Track all imports for data provenance:

**View Import History:**

1. Navigate to **Catalogues** page
2. Select a catalogue
3. Click **Import History** tab

**History Record Contains:**

* Import date and time
* Time range imported
* Filter parameters (magnitude, depth, bounds)
* Event counts (new, updated, skipped, collided, invalid, excluded, failed)
* User who performed import
* Processing duration

.. tip::
   Use import history to verify catalogue completeness and track when
   data was last refreshed.

-------------------
Duplicate Detection
-------------------

Understanding Duplicates
========================

When importing from GeoNet, some events may already exist in your catalogue
from a previous GeoNet import. The platform detects these duplicates by
identity, not by proximity.

**Matching Algorithm:**

.. code-block:: text

   Event A (incoming) matches Event B (stored) if and only if:

   A.EventID == B.source_id

There is no time, distance or magnitude proximity test. This is reliable
for GeoNet-to-GeoNet re-imports, because GeoNet always assigns the same
EventID to the same earthquake. It also means an earthquake already in your
catalogue from a *different* source (one with no GeoNet EventID, such as a
plain CSV upload) is **not** recognised as a duplicate, and importing it
from GeoNet will add a second copy rather than merge with it — use the
:doc:`merging-catalogues` workflow afterwards to reconcile such cases.

**Why Match on EventID Alone?**

A GeoNet EventID identifies one specific earthquake for the life of that
event, even as its location, magnitude and evaluation status are revised —
so it is the one field guaranteed to still match after GeoNet updates an
event's parameters, which time/distance/magnitude proximity is not.

Handling Strategies
===================

**Skip (Preserve Local):**

.. code-block:: text

   Existing (EventID 2024p123456): M4.5, -41.5, 174.2 (automatic)
   GeoNet now reports (same EventID): M4.6, -41.51, 174.21 (reviewed)

   Result: Keep the stored event unchanged; GeoNet's revision is not fetched in

**Update (Use GeoNet):**

.. code-block:: text

   Existing (EventID 2024p123456): M4.5, -41.5, 174.2 (automatic)
   GeoNet now reports (same EventID): M4.6, -41.51, 174.21 (reviewed)

   Result: Overwrite the stored fields that changed (magnitude, location, evaluation status)

-----------------
Best Practices
-----------------

Building a Baseline Catalogue
=============================

For new projects, establish a comprehensive baseline:

1. **Import Historical Data:**

   .. code-block:: text

      Time Range: Past 10-20 years
      Magnitude: M ≥ 2.0 (or your analysis threshold)
      Import in yearly chunks to avoid timeouts

2. **Document Your Criteria:**

   Record the filters used for reproducibility:

   .. code-block:: text

      Catalogue: NZ Baseline 2010-2024
      Source: GeoNet FDSN
      Filters: M ≥ 2.0, All depths, NZ region
      Import Date: 2024-01-15

Maintaining Current Catalogues
==============================

For ongoing monitoring, establish a regular update schedule:

**Daily Updates:**

.. code-block:: text

   Frequency: Every 24 hours
   Time Range: Last 7 days (overlap catches revisions)
   Duplicate Mode: Update existing
   Magnitude: M ≥ 2.0

**Weekly Updates:**

.. code-block:: text

   Frequency: Weekly
   Time Range: Last 30 days (catches all revisions)
   Duplicate Mode: Update existing

**Why Overlap?**

GeoNet frequently updates event parameters:

* Automatic locations refined within hours
* Manual review within 1-7 days for significant events
* Magnitude updates may occur weeks later

Importing overlapping time periods with "Update" mode ensures you get
the latest revised parameters.

Quality Considerations
======================

**Import High-Quality Events Only:**

For precise analysis, apply quality filters:

.. code-block:: text

   Minimum Magnitude: 3.0 (better located)
   After import, filter by: Minimum Quality Score (Q) >= 65 (approximately grade B)

**Import All, Filter Later:**

For completeness studies:

.. code-block:: text

   Import: All events (M ≥ 0)
   Analysis: Filter by quality as needed
   Benefit: Complete catalogue, flexible analysis

Large Historical Imports
========================

For multi-year imports:

1. **Chunk by Time:**

   .. code-block:: text

      2020: Import Jan-Dec separately
      2021: Import Jan-Dec separately
      ...

2. **Start with Recent Data:**

   Import recent years first (better quality), then historical.

3. **Verify Counts:**

   Compare with GeoNet's published statistics to verify completeness.

4. **Monitor Memory:**

   Very large imports (>50,000 events) may require:

   * Increased Node.js memory
   * Smaller time chunks
   * Import during low-usage periods

-----------------
API Access
-----------------

For programmatic imports, use the REST API:

**Trigger Import:**

.. code-block:: bash

   curl -X POST "http://localhost:3000/api/import/geonet" \
     -H "Content-Type: application/json" \
     -d '{
       "catalogueId": "existing-geonet-import-catalogue-id",
       "startDate": "2024-01-01T00:00:00Z",
       "endDate": "2024-01-31T23:59:59Z",
       "minMagnitude": 3.0,
       "updateExisting": true
     }'

``startDate``/``endDate`` accept ISO 8601; a date-time with no UTC offset
(e.g. ``2024-01-01T00:00:00``) is read as UTC. Supply both or neither —
supplying only one is rejected.

**Error responses:**

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Status
     - Meaning
   * - 400
     - Invalid parameters (bad dates, only one of start/end supplied,
       out-of-range filters), or ``catalogueId`` names a catalogue that was
       not created by the GeoNet importer
   * - 404
     - ``catalogueId`` does not match any existing catalogue
   * - 409
     - Another import into the same ``catalogueId`` is already running

See :doc:`../api-reference/import` for complete API documentation.

-----------------
Troubleshooting
-----------------

No Events Found
===============

**Symptoms:** Import returns zero events

**Solutions:**

1. Verify time range is in the past (not future dates)
2. Check magnitude filter isn't too restrictive
3. Ensure geographic bounds include seismic areas
4. Test GeoNet service directly:

   .. code-block:: bash

      curl "https://service.geonet.org.nz/fdsnws/event/1/count?\
      starttime=2024-01-01&endtime=2024-01-31&minmagnitude=3"

Timeout Errors
==============

**Symptoms:** "Request timeout" or incomplete import

**Solutions:**

1. Reduce time range (import in monthly chunks)
2. Increase minimum magnitude
3. Add geographic bounds to limit results
4. Import during off-peak hours

Too Many Duplicates
===================

**Symptoms:** Most events skipped as duplicates

**Solutions:**

1. Check if time range overlaps previous imports
2. Use "Update" mode if refreshing existing data
3. Verify you're importing to the correct catalogue

Incomplete Data
===============

**Symptoms:** Missing fields (uncertainties, quality metrics)

**Explanation:**

Not all GeoNet events have complete metadata:

* Automatic solutions may lack uncertainty estimates
* Older events may have less detailed quality metrics
* Very small events may have minimal metadata

This is normal; quality scoring handles missing fields appropriately.

GeoNet Service Unavailable
==========================

**Symptoms:** Connection refused or service errors

**Solutions:**

1. Check GeoNet status: https://www.geonet.org.nz/
2. Wait and retry (service may be under maintenance)
3. Check your internet connection
4. Verify URL hasn't changed

----------
Next Steps
----------

After importing:

* :doc:`visualization` - View imported events on the map
* :doc:`quality-assessment` - Review quality scores and distributions
* :doc:`merging-catalogues` - Combine with other data sources
* :doc:`exporting-data` - Export in various formats

.. seealso::

   * :doc:`../api-reference/import` - Import API documentation
   * :doc:`../deployment/geonet-baseline` - Setting up baseline imports
   * `GeoNet FDSN Documentation <https://www.geonet.org.nz/data/tools/FDSN>`_
