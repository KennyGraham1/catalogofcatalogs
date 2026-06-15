==================
Quality Assessment
==================

Understand the quality scoring system and how to filter events by quality metrics
for reliable seismological analysis.

--------
Overview
--------

The platform implements a comprehensive quality assessment system that evaluates
earthquake locations based on multiple factors. Events are graded from **A+**
(excellent) to **F** (poor), based on international standards (Bondár, 2004; 
Bormann, 2012) and regional quantitative assessments of the GeoNet network 
performance in New Zealand (Warren-Smith et al., 2025). This grading helps 
you identify the most reliable data for your analysis.

Quick Reference
===============

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Grade
     - Recommended Use
   * - **A+/A**
     - Precision studies, location-dependent analysis, publications
   * - **B+/B**
     - General research, statistical analysis, most applications
   * - **C**
     - Completeness studies, broad pattern analysis
   * - **D/F**
     - Avoid for location-dependent analysis; review for errors

**Key Principle:** Higher grades mean more reliable locations and magnitudes.
Always filter by quality appropriate to your research question.

--------------
Quality Grades
--------------

Grade Definitions
=================

.. list-table::
   :header-rows: 1
   :widths: 10 20 70

   * - Grade
     - Score Range
     - Description
   * - A+
     - 95-100
     - Excellent quality with minimal uncertainties
   * - A
     - 85-94
     - Very good quality, reliable parameters
   * - B+
     - 75-84
     - Good quality, suitable for most analyses
   * - B
     - 65-74
     - Good quality with moderate uncertainties
   * - C
     - 45-64
     - Fair quality, use with caution
   * - D
     - 35-44
     - Poor quality, significant uncertainties
   * - F
     - 0-34
     - Very poor quality, unreliable parameters

-----------------
Quality Components
-----------------

The overall quality score is calculated from four weighted components:

1. Location Quality (35%)
==========================

Based on horizontal and vertical uncertainties:

**Horizontal Uncertainty:**

* Excellent: < 1 km
* Good: 1-5 km
* Fair: 5-10 km
* Poor: > 10 km

**Vertical Uncertainty (Depth):**

* Excellent: < 2 km
* Good: 2-10 km
* Fair: 10-20 km
* Poor: > 20 km

2. Network Geometry (25%)
==========================

Based on azimuthal gap and station distribution:

**Azimuthal Gap:**

* Excellent: < 90°
* Good: 90-180°
* Fair: 180-270°
* Poor: > 270°

**Station Distribution:**

* Well-distributed stations around event
* Adequate depth control
* Sufficient near-source stations

These criteria follow the network geometry recommendations of Bondár (2004).

3. Solution Quality (15%)
==========================

Based on phase counts and residuals:

**Used Phase Count:**

* Excellent: > 30 phases
* Good: 20-30 phases
* Fair: 10-20 phases
* Poor: < 10 phases

**Used Station Count:**

* Excellent: > 15 stations
* Good: 10-15 stations
* Fair: 5-10 stations
* Poor: < 5 stations

**Standard Error (RMS):**

* Excellent: < 0.3 s
* Good: 0.3-0.5 s
* Fair: 0.5-1.0 s
* Poor: > 1.0 s

These thresholds align with the International Seismological Centre (ISC)
standards for high-quality locations (Bondár & Storchak, 2011).

4. Magnitude Quality (15%)
===========================

Based on station count and uncertainty:

**Magnitude Station Count:**

* Excellent: > 10 stations
* Good: 5-10 stations
* Fair: 3-5 stations
* Poor: < 3 stations

**Magnitude Uncertainty:**

* Excellent: < 0.1
* Good: 0.1-0.2
* Fair: 0.2-0.3
* Poor: > 0.3

Magnitude type preference (Mw > Ms > mb > ML) is based on the ISC-GEM
standards for magnitude reliability (Storchak et al., 2013).

5. Evaluation Status (10%)
===========================

Based on the review status of the origin and magnitude solution:

* **Final / Reviewed**: Full points — solution has been manually verified.
* **Confirmed**: Partial points — solution has passed automated checks.
* **Preliminary**: Minimal points — automatic solution, not yet reviewed.
* **Rejected / Unknown**: No points.

-----------------
Quality Filtering
-----------------

Filter by Quality Grade
========================

On the Analytics or Catalogues page:

1. Click **Filters**
2. Select **Minimum Quality Grade**
3. Choose grade (e.g., B or better)
4. Apply filter

**Common filters:**

* **A or better:** High-quality events for precise analysis
* **B or better:** Good quality for most research
* **C or better:** Include fair quality events

Filter by Specific Metrics
===========================

Apply custom thresholds:

**Location Uncertainty:**

.. code-block:: text

   Max Horizontal Uncertainty: 5 km
   Max Depth Uncertainty: 10 km

**Network Geometry:**

.. code-block:: text

   Max Azimuthal Gap: 180°
   Min Station Count: 10

**Solution Quality:**

.. code-block:: text

   Min Phase Count: 15
   Max RMS: 0.5 s

-----------------
Quality Visualization
-----------------

Quality Score Distribution
==========================

View distribution of quality grades:

* Bar chart showing event counts per grade
* Percentage of high-quality events
* Identify quality issues in catalogue

Quality on Map
==============

Events color-coded by quality:

* Green: A+, A (excellent/very good)
* Yellow: B+, B (good)
* Orange: C (fair)
* Red: D, F (poor/very poor)

Quality Trends
==============

Analyze quality over time:

* Time series of average quality score
* Identify periods of poor network coverage
* Track improvements in monitoring

-----------------
Improving Quality
-----------------

For Data Uploads
================

To improve quality of uploaded data:

1. Include uncertainty values
2. Provide phase counts and station counts
3. Add azimuthal gap information
4. Include RMS residuals
5. Specify evaluation status

For GeoNet Imports
==================

Import high-quality events:

.. code-block:: text

   Minimum Magnitude: 3.0
   (Larger events generally better located)

Enable "Update Existing Events" to get revised parameters.

For Merged Catalogues
=====================

Use quality-aware merging:

1. Prioritize high-quality catalogues
2. Use "Most Complete" strategy
3. Filter low-quality events before merging

-----------------
Quality Metrics Reference
-----------------

Azimuthal Gap
=============

**Definition:** Largest angle between adjacent stations as seen from the epicenter.

**Interpretation:**

* Small gap (< 90°): Good azimuthal coverage
* Large gap (> 180°): Poor coverage, elongated uncertainty
* Gap > 270°: Very poor coverage, unreliable location

**Impact:** Affects horizontal location uncertainty and reliability.

Phase Count
===========

**Definition:** Number of seismic phases (P-waves, S-waves) used in location.

**Interpretation:**

* More phases = better constrained location
* Minimum 8 phases for reliable location
* 20+ phases for high-quality location

**Impact:** Affects all uncertainty estimates.

Station Count
=============

**Definition:** Number of seismic stations contributing to location.

**Interpretation:**

* More stations = better coverage
* Minimum 8 stations for reliable location in sparse regions (Warren-Smith et al., 2025)
* 10+ stations for good quality globally
* 30+ stations for high-precision studies

**Impact:** Affects network geometry and solution stability.

RMS Residual
============

**Definition:** Root mean square of travel time residuals.

**Interpretation:**

* Low RMS (< 0.3 s): Good fit to data
* High RMS (> 1.0 s): Poor fit, possible errors

**Impact:** Indicates solution quality and data consistency.

-----------------
Best Practices
-----------------

For Analysis
============

* Use A or B grade events for precise studies
* Include C grade for completeness analysis
* Exclude D and F grades for location-dependent studies

For Visualization
=================

* Color-code by quality on maps
* Show uncertainty ellipses for context
* Filter low-quality events for clarity

For Export
==========

* Include quality grades in exports
* Document quality thresholds used
* Preserve all quality metrics

For Reporting
=============

* Report percentage of high-quality events
* Document quality filtering applied
* Include quality distribution statistics

----------
Next Steps
----------

* :doc:`visualization` - Visualize quality metrics
* :doc:`exporting-data` - Export with quality filters
* :doc:`../data-validation` - Data validation guide

----------
References
----------

The quality assessment metrics and scoring system in this platform are based on established seismological literature:

* **Warren-Smith, E., et al. (2025).** *A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand.* New Zealand Journal of Geology and Geophysics. (Specific assessment of regional network performance and station thresholds).
* **Bondár, I. (2004).** *Epicentre Accuracy Based on Seismic Network Criteria.* Geophysical Journal International. (Network geometry and station count requirements).
* **Bondár, I., & Storchak, D. A. (2011).** *Improved Location Procedures at the International Seismological Centre.* Geophysical Journal International. (Quality scoring and azimuthal gap/RMS thresholds).
* **Bormann, P., Ed. (2012).** *IASPEI New Manual of Seismological Observatory Practice (NMSOP-2).* Deutsches GeoForschungsZentrum GFZ. (Standardized quality metrics and reporting).
* **Storchak, D. A., et al. (2013).** *Public Release of the ISC-GEM Global Instrumental Earthquake Catalogue (1900-2009).* Seismological Research Letters. (Parameter selection and magnitude hierarchy).
* **Woessner, J., et al. (2016).** *Seismicity Catalogs.* Community Online Resource for Statistical Seismicity Analysis (CORSSA). (Best practices for catalog quality assessment).

