====================
Importing from GeoNet
====================

Learn how to automatically import earthquake data from GeoNet's FDSN Event Web Service.

--------
Overview
--------

The platform provides seamless integration with GeoNet (New Zealand's geological hazard information system) to automatically import earthquake data. This feature is ideal for:

* Maintaining up-to-date earthquake catalogues
* Importing historical data for specific regions
* Updating existing events with revised parameters
* Building baseline catalogues for research

-----------
Data Source
-----------

**Service:** GeoNet FDSN Event Web Service

**URL:** https://service.geonet.org.nz/fdsnws/event/1/query

**Coverage:** New Zealand and surrounding regions

**License:** Creative Commons Attribution 4.0 International License

**Update Frequency:** Real-time (events typically available within minutes)

--------------
Import Process
--------------

Step 1: Navigate to Import Page
================================

Click **Import** in the navigation menu or go to ``/import``.

Step 2: Configure Time Range
=============================

Choose how to specify the time range:

**Recent Events (Quick Import):**

Select from preset time ranges:

* Last 1 hour
* Last 6 hours
* Last 24 hours
* Last 7 days
* Last 30 days

**Custom Date Range:**

Specify exact start and end dates:

.. code-block:: text

   Start Date: 2024-01-01 00:00:00
   End Date: 2024-01-31 23:59:59

.. tip::
   For large date ranges, consider importing in smaller batches to avoid timeouts.

Step 3: Set Magnitude Filters
==============================

Filter events by magnitude:

.. code-block:: text

   Minimum Magnitude: 2.0
   Maximum Magnitude: 10.0

**Common magnitude ranges:**

* ``M ≥ 4.0`` - Significant earthquakes
* ``M ≥ 3.0`` - Felt earthquakes
* ``M ≥ 2.0`` - Recorded earthquakes
* ``M ≥ 0.0`` - All events (including microseismicity)

Step 4: Set Depth Filters (Optional)
=====================================

Filter by depth range:

.. code-block:: text

   Minimum Depth: 0 km
   Maximum Depth: 100 km

**Depth categories:**

* ``0-40 km`` - Shallow earthquakes (most common)
* ``40-70 km`` - Intermediate depth
* ``70-300 km`` - Deep earthquakes
* ``300+ km`` - Very deep (subduction zones)

Step 5: Define Geographic Bounds (Optional)
============================================

Limit imports to a specific region using a bounding box:

.. code-block:: text

   Minimum Latitude: -47.5
   Maximum Latitude: -34.0
   Minimum Longitude: 165.0
   Maximum Longitude: 179.0

**Example regions:**

* **All New Zealand:** Lat: -47.5 to -34.0, Lon: 165.0 to 179.0
* **North Island:** Lat: -42.0 to -34.0, Lon: 172.0 to 179.0
* **South Island:** Lat: -47.5 to -40.0, Lon: 165.0 to 175.0
* **Canterbury:** Lat: -44.5 to -42.5, Lon: 171.0 to 173.5

.. note::
   Leave bounds empty to import all events within the time and magnitude range.

Step 6: Configure Duplicate Handling
=====================================

Choose how to handle duplicate events:

**Skip Duplicates (Default):**

Events already in the catalogue are skipped.

**Update Existing Events:**

Enable this option to update existing events with new data from GeoNet. Useful for:

* Getting revised locations and magnitudes
* Updating preliminary events with reviewed parameters
* Refreshing quality metrics

Step 7: Name Your Catalogue
============================

If creating a new catalogue, provide a descriptive name:

.. code-block:: text

   Example: "GeoNet - New Zealand 2024"
   Example: "Canterbury Earthquakes M4+"

Or select an existing catalogue to add events to.

Step 8: Start Import
=====================

Click **Start Import** to begin the import process.

The platform will:

1. Query the GeoNet FDSN service
2. Fetch matching events
3. Parse QuakeML data
4. Check for duplicates
5. Validate and store events
6. Update catalogue statistics

--------------
Import Results
--------------

After import completes, you'll see a summary:

.. code-block:: text

   Import Summary
   ──────────────────────────────
   Total Fetched:     1,234 events
   New Events:        1,150 events
   Updated Events:    45 events
   Skipped (Duplicates): 39 events
   Errors:            0 events
   
   Duration: 12.5 seconds

--------------
Import History
--------------

View all past imports for a catalogue:

1. Navigate to the **Catalogues** page
2. Select a catalogue
3. Click **Import History**

Each import record shows:

* Import date and time
* Time range imported
* Filter parameters used
* Event counts (new, updated, skipped)
* Any errors encountered

.. tip::
   Use import history to track data provenance and verify catalogue completeness.

-------------------
Duplicate Detection
-------------------

The platform uses intelligent matching to detect duplicates:

**Matching Criteria:**

* Time window: ±60 seconds
* Distance: ≤50 km
* Magnitude difference: ≤0.5

Events matching all three criteria are considered duplicates.

**Duplicate Handling:**

* **Skip:** Leave existing event unchanged
* **Update:** Replace with new data from GeoNet
* **Merge:** Combine information (future feature)

-----------------
Best Practices
-----------------

Regular Updates
===============

For ongoing monitoring:

1. Create a baseline catalogue with historical data
2. Schedule regular imports (e.g., daily or weekly)
3. Enable "Update Existing Events" to get revised parameters

Quality Filtering
=================

Import high-quality events:

.. code-block:: text

   Minimum Magnitude: 3.0
   Minimum Used Station Count: 10
   Maximum Azimuthal Gap: 180°

Large Imports
=============

For importing years of data:

1. Break into smaller time ranges (e.g., monthly)
2. Import during off-peak hours
3. Monitor import history for errors
4. Verify event counts match expected values

-----------------
Troubleshooting
-----------------

No Events Found
===============

If import returns zero events:

* Verify time range is correct
* Check magnitude and depth filters aren't too restrictive
* Ensure geographic bounds include seismically active areas
* Confirm GeoNet service is accessible

Timeout Errors
==============

For large imports:

* Reduce time range
* Increase minimum magnitude
* Use geographic bounds to limit area

Duplicate Issues
================

If too many duplicates:

* Check if catalogue already contains this data
* Verify time range doesn't overlap previous imports
* Review duplicate detection thresholds

----------
Next Steps
----------

After importing:

* :doc:`visualization` - View imported events on the map
* :doc:`quality-assessment` - Review quality scores
* :doc:`merging-catalogues` - Merge with other catalogues
* :doc:`exporting-data` - Export in different formats

