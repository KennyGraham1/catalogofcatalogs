==================
Merging Catalogues
==================

Learn how to merge multiple earthquake catalogues with automated duplicate
detection and configurable conflict resolution strategies.

--------
Overview
--------

Catalogue merging allows you to combine earthquake
data from multiple sources into a unified, comprehensive catalogue. This is
essential for:

* Combining regional and national catalogues
* Integrating historical and modern data
* Comparing independent analyses of the same events
* Creating research-ready datasets from multiple sources

Key platform features include:

* **🆕 Quality-Based Strategy (Recommended):** A new merge strategy that scores every duplicate event on a 0–100 point index (station count, azimuthal gap, location error, magnitude uncertainty, magnitude type, review status) and keeps the highest-scoring event. This is a user-selectable option — see :ref:`merge-strategies` below.
* **Automated Duplicate Detection:** Matches events across catalogues using time, location, and magnitude criteria.
* **Complete Provenance:** Tracks the source of every event in the merged result.
* **Configurable Thresholds:** Adjust matching parameters for different data types.

The platform also applies underlying algorithm improvements. Some run for **every strategy**, others are specific to the Average strategy:

* **Date Line Normalisation** *(all strategies)*: Spatial matching near ±180° uses unit-vector averaging to avoid arithmetic errors in the Pacific region.
* **Validation Gates** *(all strategies)*: Rejects physically inconsistent duplicate groups before any strategy is applied (e.g., an M4.0 matched against an M7.0, or a group spanning > 200 km).
* **Magnitude Hierarchy** *(Average strategy)*: Uses the ISC standard (Mw > Ms > mb > ML) when computing averages, preventing saturation errors from mixing incompatible scales. Other strategies keep the winning event's existing magnitude unchanged.
* **Depth Uncertainty Selection** *(Average strategy)*: Selects the depth with the lowest reported uncertainty rather than a simple mean. Other strategies inherit depth directly from the winning event.

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
earthquake recorded in different catalogues. The platform uses three criteria,
with default thresholds and association logic based on international standards 
for global and regional earthquake association (Storchak et al., 2013; 
Benz et al., 2019):

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

.. _merge-strategies:

----------------
Merge Strategies
----------------

Choose the strategy that best fits your use case:

Strategy Decision Guide
=======================

.. mermaid::

   flowchart TD
       Start{"Do you want the<br/>best scientific result?"} -- YES --> Quality["Use Quality-Based<br/>(Recommended)"]
       Start -- NO --> Auth{"Do you have one<br/>authoritative source?"}
       
       Auth -- YES --> Priority["Use Priority-Based"]
       Auth -- NO --> Recent{"Is one catalogue<br/>more recent?"}
       
       Recent -- YES --> Newest["Use Newest Data"]
       Recent -- NO --> Matter{"Which matters more?"}
       
       Matter -- "Metadata completeness" --> Complete["Use Most Complete"]
       Matter -- "Statistical accuracy" --> Average["Use Average Values"]


Priority-Based Strategy
=======================

**How it works:**

* You designate one catalogue as "primary"
* When duplicates are found, keep the primary catalogue's event
* Discard the duplicate from other catalogues

This approach follows the principle of network authority, where local 
networks are prioritized for regional events as recommended by Bondár & 
Storchak (2011).

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

.. mermaid::

   graph LR
       subgraph Inputs ["Duplicate Group"]
           E1["USGS (M4.6)"]
           E2["GeoNet (M4.5)"]
           E3["ISC (M4.5)"]
       end
       
       subgraph Logic ["Priority Logic"]
           P1["1. GeoNet (Primary)"]
           P2["2. USGS"]
           P3["3. ISC"]
       end
       
       Result["GeoNet Event Selected"]
       
       Inputs --> Logic
       Logic --> Result
       
       style E2 fill:#f9f,stroke:#333,stroke-width:2px
       style Result fill:#f9f,stroke:#333,stroke-width:2px

Average Values Strategy
=======================

**How it works:**

* Calculate the mean of numeric values from all duplicate events
* Combine uncertainties using error propagation
* Preserve metadata from the most complete event

Statistical averaging and uncertainty propagation follow Bayesian 
principles for combining independent seismic observations (Schorlemmer 
et al., 2024).

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

.. note::
   The Average strategy is actually a **hybrid** approach:
   * **Location**: Weighted average using inverse-variance (lower uncertainty = higher weight).
   * **Magnitude**: Uses the **Magnitude Hierarchy** (Mw > Ms > mb > ML) rather than a simple mean to avoid saturation errors.
   * **Depth**: Selects the depth with the **lowest reported uncertainty**.

.. mermaid::

   graph TD
       subgraph Sources ["Input Duplicates"]
           S1["Source A: M4.5, ±2km"]
           S2["Source B: M4.7, ±10km"]
       end
       
       subgraph Processing ["Hybrid Averaging"]
           Loc["Location: Weighted Mean<br/>(Source A weighted 5x)"]
           Mag["Magnitude: Hierarchy<br/>(Prefers Mw over ML)"]
           Dep["Depth: Best Uncertainty"]
       end
       
       Result["Merged Hybrid Event"]
       
       Sources --> Processing
       Processing --> Result

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

Quality Score Strategy
======================

The platform's most advanced strategy uses a **100-point composite index** 
to rank events. It evaluates quality across six dimensions, based on 
international standards for network performance and location accuracy 
(Bondár, 2004; Bondár & Storchak, 2011; Bormann, 2012):

* **Station Coverage (25 pts)**: Logarithmic scale (30+ stations = max points). 
  Quality improvement is non-linear with station count (Bondár, 2004).
* **Azimuthal Gap (20 pts)**: Penalizes gaps > 180°; excellent if < 120°. 
  Secondary azimuthal gap is also considered where available.
* **Location Precision (15 pts)**: Based on Standard Error / RMS residuals 
  (ISC standard: < 0.3s is excellent).
* **Magnitude Uncertainty (15 pts)**: Lower uncertainty yields higher scores.
* **Magnitude Type (15 pts)**: Preferred order Mw > Ms > mb > ML > Md 
  (Storchak et al., 2013).
* **Review Status (10 pts)**: "Reviewed" or "Final" status adds points over 
  "Preliminary" solutions.

.. mermaid::

   graph TD
       subgraph Group ["Duplicate Candidates"]
           C1["Event 1: 15 stations, Gap 210°"]
           C2["Event 2: 45 stations, Gap 95°"]
       end
       
       subgraph Scoring ["Quality Engine"]
           S1["Event 1 Score: 45/100"]
           S2["Event 2 Score: 88/100"]
       end
       
       Winner["Event 2 Selected"]
       
       Group --> Scoring
       Scoring --> Winner
       
       style C2 fill:#4CAF50,color:white
       style Winner fill:#4CAF50,color:white

---------------------------
How Metadata is Merged
---------------------------

Beyond the primary fields (time, location, magnitude), the platform performs 
a **Field-Level Union** to ensure the merged catalogue is as comprehensive 
as possible. 

1. **Gaps Filling**: If the selected primary record is missing a field 
   (e.g., azimuthal gap or phase count) but a secondary record has it, 
   the platform automatically fills that gap from the highest-quality 
   secondary source.
2. **Rich Data Preservation**: Complex data types like **Picks**, **Arrivals**, 
   and **Station Magnitudes** are preserved through a ranked inheritance system.
3. **Focal Mechanism Selection**: The platform automatically selects the 
   best focal mechanism across all duplicate sources based on a hierarchy 
   (GCMT > GeoNet > USGS > ISC) and quality metrics including station 
   polarity count and misfit values.

---------------------------
Advanced Quality Control
---------------------------

The platform performs several advanced validation checks during the merge 
process to prevent "over-matching" or physical inconsistencies:

* **Group Size Gate**: Prevents merging groups larger than 15 events, which 
  usually indicates a threshold setting that is too loose.
* **Spatial Spread Analysis**: For groups of 4 or more events, the platform 
  calculates the spatial spread. If it exceeds 100–200 km (depending on 
  magnitude), the match is flagged for review.
* **Network Mismatch**: If the same network reports two different events in 
  the same group, the platform identifies these as likely distinct events 
  (e.g., foreshock/aftershock) and prevents them from being merged.

----------------------------
Scientific Accuracy Features
----------------------------

The platform includes several specialized algorithms to ensure seismological 
rigour:

* **Latitude-Aware Spatial Indexing**: The search grid adjusts its cell 
  dimensions based on latitude to maintain consistent distance thresholds 
  near the poles and the equator.
* **Date Line Normalization**: Merging events near the International Date 
  Line (±180°) uses Cartesian unit-vector averaging to avoid mathematical 
  errors that occur with simple arithmetic means.
* **Uncertainty-Weighted Locations**: When averaging locations, the platform 
  weights the result by the inverse of the reported horizontal uncertainty 
  (geometric mean of latitude/longitude errors).
* **Regional Authority Hierarchy**: The platform recognizes regional 
  boundaries. For example, it automatically prioritizes GeoNet for events 
  within New Zealand and JMA for events in Japan. This preference is 
  supported by regional quality assessments that show local network 
  superiority for inland and near-shore events (Warren-Smith et al., 2025).

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

Set thresholds for duplicate detection. These thresholds are adaptively 
scaled based on event magnitude and depth (Tanaka et al., 2022), as larger 
earthquakes typically have larger location and timing uncertainties in 
global reports (Benz et al., 2019):

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

* **Quality-Based (Recommended)** - Scores each duplicate event 0–100 and keeps the highest-scoring one (station count, azimuthal gap, RMS, magnitude uncertainty, magnitude type, review status).
* **Priority-Based** - Select a primary catalogue; its events always win.
* **Average Values** - Computes a weighted-average location, applies magnitude hierarchy, and picks the lowest-uncertainty depth.
* **Newest Data** - Keeps the most recently updated event.
* **Most Complete** - Keeps the event with the most populated fields.

.. note::
   Regardless of the strategy chosen, the platform always applies magnitude hierarchy, date line normalisation, depth uncertainty selection, and validation gates. The strategy only controls *which event's core parameters win* when duplicates are resolved.

.. tip::
   Use **Quality-Based** for scientific work — it selects the most reliable origin automatically. Use **Priority-Based** when you have a single authoritative source (e.g., always prefer GeoNet for New Zealand events).

.. note::
   During the merge process, different magnitude scales (ML, mb, Ms) are 
   automatically converted to a common Moment Magnitude (Mw) scale using 
   the empirical relationships of Scordilis (2006) to ensure 
   comparability across catalogues.

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

----------------------
Testing and Validation
----------------------

The merging algorithms are rigorously tested to ensure data integrity and accurate conflict resolution. The core test suite (located in ``__tests__/lib/merge.test.ts``) covers:

* **Spatial Indexing & Grid Operations**: Validates geographic bounds handling, including complex Date Line crossing scenarios.
* **Adaptive Threshold Matching**: Ensures distance and time thresholds scale appropriately across magnitude and depth ranges.
* **Merge Strategies**: Verifies the correct behavior of the quality, priority, average, newest, and complete merge strategies.
* **Validation of Event Groups**: Ensures anomalous clusters (e.g., highly divergent depths or magnitudes) are correctly flagged and handled.
* **Magnitude Hierarchy**: Validates that standard magnitude scales are correctly prioritized (e.g., Mw over ML).

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
   * :doc:`../developer-guide/testing` - Developer testing guide and strategies

----------
References
----------

The merging algorithms and conflict resolution strategies in this platform are based on established seismological literature:

* **Warren-Smith, E., et al. (2025).** *A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand.* New Zealand Journal of Geology and Geophysics. (Regional network performance and station thresholds).
* **Bondár, I. (2004).** *Epicentre Accuracy Based on Seismic Network Criteria.* Geophysical Journal International. (Network geometry and station count requirements).
* **Bormann, P., Ed. (2012).** *IASPEI New Manual of Seismological Observatory Practice (NMSOP-2).* Deutsches GeoForschungsZentrum GFZ. (Standardized quality metrics and reporting).
* **Bondár, I., & Storchak, D. A. (2011).** *Improved Location Procedures at the International Seismological Centre.* Geophysical Journal International. (Quality scoring and azimuthal gap/RMS thresholds).
* **Storchak, D. A., et al. (2013).** *Public Release of the ISC-GEM Global Instrumental Earthquake Catalogue (1900-2009).* Seismological Research Letters. (Parameter selection and magnitude hierarchy).
* **Benz, H. M., et al. (2019).** *Improving Automated Earthquake Association with NEIC Hydra.* Bulletin of the Seismological Society of America. (Graph-theoretic event association and group validation).
* **Tanaka, M., et al. (2022).** *Discrimination of Seismic Catalogue Duplicates During Aftershock Sequences Using the Nearest-Neighbour Method.* Frontiers in Earth Science. (Adaptive thresholds for dense sequences).
* **Schorlemmer, D., et al. (2024).** *A Bayesian Merging of Earthquake Magnitudes from Multiple Networks.* Seismological Research Letters. (Principles of magnitude averaging).
* **Scordilis, E. M. (2006).** *Empirical Global Relations Converting Ms and mb to Moment Magnitude.* Journal of Seismology. (Magnitude conversion formulas).
