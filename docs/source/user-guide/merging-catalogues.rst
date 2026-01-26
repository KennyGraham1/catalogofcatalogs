==================
Merging Catalogues
==================

Learn how to merge multiple earthquake catalogues with intelligent duplicate
detection and configurable conflict resolution strategies.

--------
Overview
--------

Catalogue merging is a powerful feature that allows you to combine earthquake
data from multiple sources into a unified, comprehensive catalogue. This is
essential for:

* Combining regional and national catalogues
* Integrating historical and modern data
* Comparing independent analyses of the same events
* Creating research-ready datasets from multiple sources

Key Features
============

* **Intelligent Duplicate Detection:** Matches events across catalogues using
  time, location, and magnitude criteria
* **Multiple Merge Strategies:** Four approaches for resolving conflicts between
  duplicate events
* **Complete Provenance:** Tracks the source of every event in the merged result
* **Configurable Thresholds:** Adjust matching parameters for different data types

Merge Process Overview
======================

.. mermaid::

   flowchart TD
       subgraph Inputs ["Input Catalogues"]
           A["Catalogue A"]
           B["Catalogue B"]
           C["Catalogue C"]
       end
       
       Combine["COMBINE ALL EVENTS"]
       Detect["DETECT DUPLICATES<br/>(time + location + magnitude)"]
       Resolve["RESOLVE CONFLICTS<br/>(apply selected merge strategy)"]
       Result["MERGED CATALOGUE<br/>(unique events with provenance)"]
       
       A & B & C --> Combine
       Combine --> Detect
       Detect --> Resolve
       Resolve --> Result


--------------------------
Understanding Duplicates
--------------------------

What Makes Events Duplicates?
=============================

Two events are considered duplicates if they likely represent the same
earthquake recorded in different catalogues. The platform uses three criteria:

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Criterion
     - Default Threshold
     - Rationale
   * - Time
     - ± 60 seconds
     - Origin times may differ due to analysis methods
   * - Distance
     - ≤ 50 km
     - Locations vary based on velocity models and data
   * - Magnitude
     - ≤ 0.5
     - Different scales and stations affect magnitude

**All three criteria must be met** for events to be considered duplicates.

Why Duplicates Occur
====================

Different catalogues may have different:

* **Seismic networks:** Regional vs. global station coverage
* **Velocity models:** Affect calculated locations
* **Magnitude scales:** ML, Mw, mb produce different values
* **Analysis procedures:** Automatic vs. manual processing
* **Update schedules:** Preliminary vs. final solutions

Example Duplicate Detection
===========================

.. code-block:: text

   Catalogue A: 2024-01-15 10:30:45, M4.5, -41.50, 174.20
   Catalogue B: 2024-01-15 10:30:47, M4.6, -41.51, 174.21

   Time difference:    2 seconds   (< 60s threshold) ✓
   Distance:           1.4 km      (< 50km threshold) ✓
   Magnitude diff:     0.1         (< 0.5 threshold) ✓

   Result: These are duplicates (same earthquake)

--------------
Merge Strategies
--------------

Choose the strategy that best fits your use case:

Strategy Decision Guide
=======================

.. mermaid::

   flowchart TD
       Start{"Do you have one<br/>authoritative source?"} -- YES --> Priority["Use Priority-Based<br/>(keeps authoritative data)"]
       Start -- NO --> Recent{"Is one catalogue<br/>more recent?"}
       
       Recent -- YES --> Newest["Use Newest Data<br/>(keeps latest revisions)"]
       Recent -- NO --> Matter{"Which matters more?"}
       
       Matter -- "Metadata completeness" --> Complete["Use Most Complete"]
       Matter -- "Statistical accuracy" --> Average["Use Average Values"]


Priority-Based Strategy
=======================

**How it works:**

* You designate one catalogue as "primary"
* When duplicates are found, keep the primary catalogue's event
* Discard the duplicate from other catalogues

**Example:**

.. code-block:: text

   Primary (GeoNet):   M4.5, depth 25 km, 42 phases
   Secondary (USGS):   M4.6, depth 28 km, 15 phases

   Result: Keep GeoNet event (M4.5, depth 25 km, 42 phases)

**Best for:**

* Merging regional data with a trusted national catalogue
* When one source has consistently better quality
* Operational settings where one authority is preferred

**Considerations:**

* Simple and predictable
* May discard valid information from secondary sources
* Assumes primary source is always correct

Average Values Strategy
=======================

**How it works:**

* Calculate the mean of numeric values from all duplicate events
* Combine uncertainties using error propagation
* Preserve metadata from the most complete event

**Example:**

.. code-block:: text

   Catalogue A: M4.5, depth 25 km
   Catalogue B: M4.6, depth 28 km
   Catalogue C: M4.4, depth 24 km

   Result: M4.5 (average), depth 25.7 km (average)

**Best for:**

* Combining multiple independent analyses
* Research where statistical robustness matters
* When no single source is clearly better

**Considerations:**

* Reduces random errors through averaging
* May blur genuine differences
* Works best with similar-quality sources

Newest Data Strategy
====================

**How it works:**

* Compare modification timestamps or origin time precision
* Keep the most recently updated version
* Useful for getting revised parameters

**Example:**

.. code-block:: text

   Event A: Last updated 2024-01-15 (automatic solution)
   Event B: Last updated 2024-01-20 (reviewed solution)

   Result: Keep Event B (more recent, likely reviewed)

**Best for:**

* Incorporating revised/reprocessed data
* When recent analysis methods are preferred
* Updating catalogues with final solutions

**Considerations:**

* Assumes newer is better
* May not work well if timestamps aren't reliable
* Good for refreshing operational catalogues

Most Complete Strategy
======================

**How it works:**

* Count the number of populated fields in each event
* Keep the event with the most metadata
* Preserves detailed quality information

**Example:**

.. code-block:: text

   Event A: time, lat, lon, depth, magnitude (5 fields)
   Event B: time, lat, lon, depth, magnitude, uncertainty,
            phases, stations, azimuthal_gap (9 fields)

   Result: Keep Event B (more complete metadata)

**Best for:**

* Preserving detailed quality metrics
* Combining sparse and detailed catalogues
* Research requiring comprehensive metadata

**Considerations:**

* More fields doesn't always mean better data
* May prefer verbose but lower-quality data
* Good for maximizing available information

--------------
Merge Process
--------------

Step 1: Navigate to Merge Page
==============================

Click **Merge** in the navigation menu or go to ``/merge``.

Step 2: Select Source Catalogues
================================

Select two or more catalogues to merge:

.. code-block:: text

   Available Catalogues:
   ☑ GeoNet - New Zealand 2024      (15,432 events)
   ☑ USGS - Southwest Pacific       (3,241 events)
   ☑ Local Network Data             (8,756 events)
   ☐ Historical Catalogue 1990-2000 (45,123 events)

   Selected: 3 catalogues, 27,429 total events

.. tip::
   Start with 2-3 catalogues. For complex merges, consider an iterative
   approach (merge two first, then add more).

Step 3: Configure Matching Rules
================================

Set thresholds for duplicate detection:

**Time Window**

.. code-block:: text

   Default: ± 60 seconds

   Stricter: ± 30 seconds (fewer false matches)
   Looser:   ± 120 seconds (catch more duplicates)

**Distance Threshold**

.. code-block:: text

   Default: 50 km

   Stricter: 25 km (regional, well-located events)
   Looser:   100 km (global, poorly-located events)

**Magnitude Difference**

.. code-block:: text

   Default: 0.5

   Stricter: 0.3 (same magnitude scale)
   Looser:   1.0 (different magnitude scales)

**Threshold Guidelines:**

.. list-table::
   :header-rows: 1
   :widths: 25 25 25 25

   * - Scenario
     - Time
     - Distance
     - Magnitude
   * - High-quality regional
     - ± 30s
     - 25 km
     - 0.3
   * - Standard national
     - ± 60s
     - 50 km
     - 0.5
   * - Global catalogues
     - ± 120s
     - 100 km
     - 0.5
   * - Historical data
     - ± 180s
     - 150 km
     - 1.0

Step 4: Choose Merge Strategy
=============================

Select your conflict resolution strategy:

* **Priority-Based** - Select primary catalogue from dropdown
* **Average Values** - Calculate mean values
* **Newest Data** - Keep most recent
* **Most Complete** - Keep most detailed

Step 5: Configure Priority (if applicable)
==========================================

If using Priority-Based strategy, rank your catalogues:

.. code-block:: text

   Priority Order:
   1. GeoNet - New Zealand 2024     (highest priority)
   2. Local Network Data
   3. USGS - Southwest Pacific      (lowest priority)

Step 6: Name the Merged Catalogue
=================================

Provide a descriptive name:

.. code-block:: text

   Good names:
   - "NZ Combined Catalogue 2024 (GeoNet + USGS)"
   - "Canterbury Region - All Sources 2020-2024"
   - "Research Catalogue v2 - Priority Merged"

   Avoid:
   - "merged"
   - "test123"

Step 7: Execute Merge
=====================

Click **Merge Catalogues** to begin processing.

**Processing Steps:**

1. Load events from all source catalogues
2. Index events by time for efficient matching
3. Find candidate duplicates within time windows
4. Apply distance and magnitude criteria
5. Resolve conflicts using selected strategy
6. Record provenance for all events
7. Calculate quality scores for merged events
8. Generate summary statistics

**Progress Display:**

.. code-block:: text

   Merging catalogues...
   [████████████████████░░░░░░░░░░░░] 65%

   Loaded:     27,429 events from 3 catalogues
   Candidates: 1,247 potential duplicate groups
   Processing: Group 812 of 1,247

--------------
Merge Results
--------------

After completion, review the summary:

.. code-block:: text

   Merge Complete!
   ===============

   Source Catalogues:     3
   Total Input Events:    27,429

   Duplicate Analysis:
   -------------------
   Unique Events:         24,891 (retained)
   Duplicate Groups:      1,269
   Total Duplicates:      2,538 (resolved)

   By Source:
   - GeoNet:              15,432 events → 14,210 unique
   - USGS:                3,241 events  → 2,891 unique
   - Local Network:       8,756 events  → 7,790 unique

   Final Catalogue:       24,891 events

   Processing Time:       12.5 seconds

Detailed Statistics
===================

View additional merge statistics:

* **Duplicate size distribution:** How many events per duplicate group
* **Match criteria breakdown:** Which criteria matched
* **Source contribution:** Events from each catalogue
* **Quality impact:** How quality scores changed

-----------------
Source Tracking
-----------------

Provenance Metadata
===================

Every event in the merged catalogue includes:

* **source_catalogue_id:** Original catalogue identifier
* **source_event_id:** Original event ID
* **merge_strategy:** How conflicts were resolved
* **duplicate_sources:** Other catalogues with matching events
* **merge_timestamp:** When the merge was performed

Viewing Provenance
==================

In the event detail view:

.. code-block:: text

   Event: 2024-01-15 10:30:45 M4.5

   Source Information:
   -------------------
   Primary Source:  GeoNet - New Zealand 2024
   Original ID:     2024p123456

   Also found in:
   - USGS - Southwest Pacific (ID: us7000abc1)
   - Local Network Data (ID: local-2024-0451)

   Merge Strategy:  Priority-Based (GeoNet primary)
   Merged On:       2024-01-20 14:35:22 UTC

-----------------
Best Practices
-----------------

Before Merging
==============

1. **Review source catalogues:**

   * Check time coverage overlap
   * Verify geographic coverage
   * Compare event counts for same periods

2. **Understand magnitude scales:**

   * ML (local) vs. Mw (moment) differ systematically
   * Consider magnitude conversions before merging

3. **Check data quality:**

   * Review quality distributions
   * Note any known issues

Threshold Selection
===================

**Start conservative, then loosen:**

1. Begin with strict thresholds (30s, 25km, 0.3)
2. Run merge and review matched pairs
3. If too many missed duplicates, loosen thresholds
4. If too many false matches, tighten thresholds

**Document your choices:**

Keep a record of threshold values and reasoning for reproducibility.

Quality Assurance
=================

After merging:

1. **Spot-check matched pairs:**

   * Review some duplicate groups manually
   * Verify they're truly the same event

2. **Check edge cases:**

   * Events near threshold boundaries
   * Very large or very small events

3. **Compare statistics:**

   * Event counts by magnitude
   * Temporal distribution
   * Spatial patterns

-----------------
Advanced Features
-----------------

Filtered Merging
================

Merge subsets of catalogues:

1. Export filtered events from each catalogue
2. Upload filtered data as new catalogues
3. Merge the filtered catalogues

**Example:** Merge only M4+ events from regional catalogues:

.. code-block:: text

   1. Export GeoNet M≥4 events → "GeoNet_M4plus"
   2. Export USGS M≥4 events → "USGS_M4plus"
   3. Merge these filtered catalogues

Iterative Merging
=================

For complex multi-source merges:

.. code-block:: text

   Stage 1: GeoNet + Local Network
            (Priority: GeoNet)
            → "NZ_National_Regional"

   Stage 2: NZ_National_Regional + USGS
            (Priority: NZ_National_Regional)
            → "NZ_Comprehensive"

   Stage 3: NZ_Comprehensive + Historical
            (Strategy: Newest Data)
            → "NZ_Complete_1900-2024"

**Benefits:**

* Better control over conflict resolution
* Easier to troubleshoot issues
* Can use different strategies at each stage

Re-merging with Updated Data
============================

When source catalogues are updated:

1. Delete the old merged catalogue
2. Re-run merge with same parameters
3. Quality scores are recalculated automatically

-----------------
Troubleshooting
-----------------

Too Many Duplicates Found
=========================

**Symptoms:** High duplicate count, unexpected matches

**Solutions:**

1. Tighten time window (try ± 30s)
2. Reduce distance threshold (try 25 km)
3. Reduce magnitude threshold (try 0.3)
4. Review matched pairs for false positives

Too Few Duplicates Found
========================

**Symptoms:** Expected duplicates not matched

**Solutions:**

1. Loosen time window (try ± 120s)
2. Increase distance threshold (try 100 km)
3. Increase magnitude threshold (try 1.0)
4. Check for systematic time or location offsets

Merge Takes Too Long
====================

**Symptoms:** Processing stalls or times out

**Solutions:**

1. Merge fewer catalogues at once
2. Filter to smaller event sets first
3. Increase Node.js memory allocation
4. Run during off-peak hours

Unexpected Results
==================

**Symptoms:** Merged catalogue has incorrect data

**Solutions:**

1. Verify priority order is correct
2. Check that strategy matches your intent
3. Review source catalogue data quality
4. Try a different merge strategy

----------
Next Steps
----------

After merging:

* :doc:`visualization` - View merged catalogue on the map
* :doc:`quality-assessment` - Review quality distributions
* :doc:`exporting-data` - Export for analysis or sharing

.. seealso::

   * :doc:`../api-reference/merge` - Merge API documentation
   * :doc:`../developer-guide/implementation-notes/merge-improvements` - Technical details
