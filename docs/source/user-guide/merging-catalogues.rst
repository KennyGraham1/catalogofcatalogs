==================
Merging Catalogues
==================

Learn how to merge multiple earthquake catalogues with intelligent duplicate detection and configurable conflict resolution.

--------
Overview
--------

Catalogue merging allows you to combine data from multiple sources into a unified catalogue. The platform provides:

* Intelligent duplicate detection based on time, location, and magnitude
* Multiple merge strategies for handling conflicts
* Complete source tracking and provenance
* Configurable matching thresholds

--------------
Merge Strategies
--------------

Priority-Based
==============

Select a primary catalogue. When duplicates are found:

* Keep data from the priority catalogue
* Discard conflicting data from other catalogues
* Useful when one source is more authoritative

**Use case:** Merging regional catalogues with a trusted national catalogue

Average Values
==============

For duplicate events, calculate average values:

* Average location (latitude, longitude, depth)
* Average magnitude
* Combine uncertainty estimates
* Merge quality metrics

**Use case:** Combining multiple independent analyses of the same events

Newest Data
===========

Keep the most recently updated version:

* Compare event modification timestamps
* Retain the newest data
* Useful for incorporating revised parameters

**Use case:** Updating catalogues with reprocessed data

Most Complete
=============

Select the event with the most complete information:

* Count populated fields
* Keep the event with more metadata
* Preserve detailed quality metrics

**Use case:** Combining sparse and detailed catalogues

--------------
Merge Process
--------------

Step 1: Navigate to Merge Page
===============================

Click **Merge** in the navigation menu.

Step 2: Select Source Catalogues
=================================

Choose 2 or more catalogues to merge:

.. code-block:: text

   ☑ GeoNet - New Zealand 2024
   ☑ USGS - Southwest Pacific
   ☐ Local Network Data

Step 3: Configure Matching Rules
=================================

Set thresholds for duplicate detection:

**Time Window:**

.. code-block:: text

   ± 60 seconds (default)

Events within this time window may be duplicates.

**Distance Threshold:**

.. code-block:: text

   50 km (default)

Maximum distance between event locations to be considered duplicates.

**Magnitude Difference:**

.. code-block:: text

   0.5 (default)

Maximum magnitude difference for duplicate matching.

.. tip::
   Tighter thresholds (smaller values) reduce false matches but may miss true duplicates.

Step 4: Choose Merge Strategy
==============================

Select how to handle conflicts:

* Priority (select primary catalogue)
* Average
* Newest
* Most Complete

Step 5: Name Merged Catalogue
==============================

Provide a descriptive name:

.. code-block:: text

   Example: "Combined NZ Catalogue 2024"
   Example: "Merged Regional Data"

Step 6: Execute Merge
======================

Click **Merge Catalogues** to start the process.

The platform will:

1. Load all events from source catalogues
2. Detect duplicates using matching rules
3. Apply merge strategy to resolve conflicts
4. Create new merged catalogue
5. Track source information for all events

--------------
Merge Results
--------------

After merging, view the summary:

.. code-block:: text

   Merge Summary
   ──────────────────────────────
   Source Catalogues:     3
   Total Input Events:    5,432
   Unique Events:         4,891
   Duplicate Groups:      541
   Final Event Count:     4,891
   
   Duration: 8.3 seconds

-----------------
Source Tracking
-----------------

Every merged event retains source information:

* Original catalogue ID
* Source event ID
* Merge strategy used
* Conflict resolution details

View source information in event details:

.. code-block:: text

   Event Sources:
   • GeoNet - New Zealand 2024 (primary)
   • USGS - Southwest Pacific (merged)

-----------------
Best Practices
-----------------

Catalogue Selection
===================

* Merge catalogues covering similar regions and time periods
* Ensure compatible magnitude scales
* Verify coordinate systems match (decimal degrees)

Threshold Tuning
================

For regional catalogues:

.. code-block:: text

   Time Window: ± 30 seconds
   Distance: 25 km
   Magnitude: 0.3

For global catalogues:

.. code-block:: text

   Time Window: ± 120 seconds
   Distance: 100 km
   Magnitude: 0.5

Quality Considerations
======================

* Prioritize catalogues with better quality metrics
* Use "Most Complete" strategy to preserve detailed metadata
* Review merged events for consistency

-----------------
Advanced Features
-----------------

Partial Merges
==============

Merge subsets of catalogues:

1. Filter catalogues before merging (by magnitude, region, time)
2. Export filtered data
3. Upload and merge filtered catalogues

Iterative Merging
=================

Merge in stages:

1. Merge high-quality catalogues first
2. Add regional catalogues
3. Incorporate supplementary data last

----------
Next Steps
----------

After merging:

* :doc:`visualization` - View merged catalogue
* :doc:`quality-assessment` - Assess merged data quality
* :doc:`exporting-data` - Export merged catalogue

