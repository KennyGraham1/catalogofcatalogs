Data Validation & Quality Assurance Guide
=========================================


Overview
--------


The Earthquake Catalogue Platform implements a comprehensive data validation and quality assurance system to ensure the integrity, accuracy, and reliability of earthquake data. This guide explains all validation rules, quality metrics, and best practices.

Table of Contents
-----------------


1. ``Input Validation <#input-validation>``_
2. ``Data Quality Assessment <#data-quality-assessment>``_
3. ``Cross-Field Validation <#cross-field-validation>``_
4. ``Quality Metrics <#quality-metrics>``_
5. ``Completeness Metrics <#completeness-metrics>``_
6. ``Anomaly Detection <#anomaly-detection>``_
7. ``Best Practices <#best-practices>``_



Input Validation
----------------


Required Fields
^^^^^^^^^^^^^^^


All earthquake events must include the following required fields:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Field
     - Type
     - Range
     - Description
   * - ``time``
     - DateTime
     - 1000-01-01 to present
     - Event origin time (supports historical events back to year 1000 CE)
   * - ``latitude``
     - Number
     - -90 to 90
     - Latitude in decimal degrees
   * - ``longitude``
     - Number
     - -180 to 180
     - Longitude in decimal degrees
   * - ``magnitude``
     - Number
     - -3 to 10
     - Event magnitude


Optional Fields with Validation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Field
     - Type
     - Range
     - Description
   * - ``depth``
     - Number
     - -5 to 1000 km
     - Depth of the hypocentre below sea level. Negative values are
       intentionally valid: they describe a source above sea level (a
       volcanic event beneath a summit, a mining event), not an error.
   * - ``magnitude_type``
     - String
     - Max 10 chars
     - Magnitude scale (ML, Mw, mb, etc.)
   * - ``region``
     - String
     - Max 255 chars
     - Geographic region name
   * - ``source``
     - String
     - Max 100 chars
     - Data source identifier
   * - ``latitude_uncertainty``
     - Number
     - 0 to 10°
     - Latitude uncertainty
   * - ``longitude_uncertainty``
     - Number
     - 0 to 10°
     - Longitude uncertainty
   * - ``depth_uncertainty``
     - Number
     - 0 to 100 km
     - Depth uncertainty
   * - ``time_uncertainty``
     - Number
     - 0 to 86400 s
     - Time uncertainty (the wide upper bound covers pre-instrumental origin
       times known only to the nearest hour or day)
   * - ``magnitude_uncertainty``
     - Number
     - 0 to 5
     - Magnitude uncertainty
   * - ``azimuthal_gap``
     - Number
     - 0 to 360°
     - Largest azimuthal gap
   * - ``used_phase_count``
     - Integer
     - 0 to 10000
     - Number of phases used
   * - ``used_station_count``
     - Integer
     - 0 to 5000
     - Number of stations used
   * - ``standard_error``
     - Number
     - 0 to 100 s
     - RMS residual
   * - ``magnitude_station_count``
     - Integer
     - 0 to 5000
     - Stations used for magnitude


Validation Rules
^^^^^^^^^^^^^^^^


Time Validation
~~~~~~~~~~~~~~~

- Must be a valid ISO 8601 datetime or parseable date string
- Cannot be in the future
- Must be after year 1000 CE (minimum supported date for historical seismology)
- Informational note for pre-1900 events (pre-instrumental era)

**Historical Events Support**: The system supports historical earthquake catalogues dating
back to year 1000 CE. Events before 1900 are flagged with an informational note (not an
error or warning) to indicate they are from the pre-instrumental era and may have higher
location/magnitude uncertainties. This enables importing historical seismology catalogues
that document earthquakes from written records, archaeological evidence, and other
historical sources.

Location Validation
~~~~~~~~~~~~~~~~~~~

- Latitude must be between -90° and 90°
- Longitude must be between -180° and 180°
- Warning if coordinates are (0, 0) - "Null Island"
- Warning if coordinates are very close to (0, 0)

Magnitude Validation
~~~~~~~~~~~~~~~~~~~~

- Must be between -3 and 10
- Warning if magnitude > 9 or magnitude < -1 (extreme, unusual -- flagged together as one check)

Depth Validation
~~~~~~~~~~~~~~~~

- Must be between -5 and 1000 km. **Negative depth is intentionally valid**:
  QuakeML measures origin depth from sea level, so a source above sea level
  (a volcanic event beneath a summit, a mining event) is a negative depth,
  not an error -- it is never clamped to zero.
- Warning if depth > 700 km (very deep, rare)
- Warning if more than 10% of a catalogue's events have exactly zero depth
  (may indicate a missing-data placeholder rather than genuine surface
  events; a single zero-depth event is not flagged)



Data Quality Assessment
-----------------------


The system calculates three primary quality scores:

1. Completeness Score (0-100%)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Measures the presence of required and optional fields:

- **100%**: All required fields present, most optional fields populated
- **90-99%**: All required fields, some optional fields
- **70-89%**: All required fields, few optional fields
- **50-69%**: Some required fields missing
- **<50%**: Many required fields missing

**Formula**: ``(Required × 0.7 + Optional × 0.3)``

2. Consistency Score (0-100%)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Checks for internal consistency and logical relationships:

- Duplicate timestamps
- Suspicious magnitude-depth relationships
- Inconsistent quality metrics
- Geographic bounds validity

**Deductions**:

- Duplicate timestamps: proportional, not a flat penalty --
  ``100 x extraCopies / totalEvents``, where ``extraCopies`` is the number
  of events beyond one in each group that shares a timestamp. One
  coincident pair in a catalogue of thousands costs almost nothing; a file
  where every row repeats the same timestamp costs close to 100 points.
- -5 points: suspicious shallow (< 5 km) large-magnitude (> 8) events found
  (the same check as the Magnitude-Depth Relationships warning below)
- The consistency score is clamped at a minimum of 0; there is no separate
  flat deduction for "other consistency issues".

3. Accuracy Score (0-100%)
^^^^^^^^^^^^^^^^^^^^^^^^^^


Based on uncertainty values and quality metrics:

- **High accuracy**: Small uncertainties, good station coverage
- **Medium accuracy**: Moderate uncertainties
- **Low accuracy**: Large uncertainties, poor station coverage

**Deductions**:

Proportional across the whole catalogue, not a flat penalty past a 50%
threshold: ``accuracyScore = 100 - round(30 x (missing + highUncertainty) /
totalEvents)``, where ``missing`` is the count of events that report no
horizontal location uncertainty at all and ``highUncertainty`` is the count
of events whose *reported* horizontal uncertainty exceeds 10 km (uncertainty
in degrees is converted to km at the event's latitude before comparing).
A missing uncertainty is scored exactly as harshly as a bad one, so a
catalogue can never raise its score by omitting uncertainty metadata
instead of honestly reporting a poor one. There is no separate deduction
for depth uncertainty or for "poor quality metrics overall" in this score.

Overall Quality Grade
^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Score
     - Grade
     - Label
     - Description
   * - 95-100
     - A+
     - Excellent
     - Publication-quality data
   * - 85-94
     - A
     - Excellent
     - High-quality, reliable data
   * - 75-84
     - B+
     - Good
     - Good quality, suitable for most analyses
   * - 65-74
     - B
     - Good
     - Good quality with moderate uncertainties
   * - 45-64
     - C
     - Fair
     - Acceptable quality, some limitations
   * - 35-44
     - D
     - Poor
     - Marginal quality, use with caution
   * - <35
     - F
     - Failing
     - Insufficient quality, not recommended




Cross-Field Validation
----------------------


Magnitude-Depth Relationships
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Rule**: Very shallow events with large magnitudes are extremely rare

- **Warning**: Depth < 5 km AND Magnitude > 8
- **Warning**: Depth > 300 km AND Magnitude < 3
- **Warning**: Depth > 700 km AND Magnitude < 4

**Rationale**: 
- Shallow large earthquakes are rare (requires special conditions)
- Small deep earthquakes are difficult to detect
- Very deep small earthquakes are almost never detected

Uncertainty-Value Relationships
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Rules**:

1. **Depth Uncertainty vs Depth**

   - **Warning**: Depth uncertainty > 2 × Depth
   - **Info**: Depth uncertainty > Depth
   - Indicates poorly constrained depth

2. **Magnitude Uncertainty**

   - **Warning**: Magnitude uncertainty > 1.0
   - **Warning**: Magnitude uncertainty > \|Magnitude\|, but only when
     \|Magnitude\| >= 1 -- magnitude is logarithmic, so this comparison is
     meaningless near zero (an M0.1 +/- 0.2 microearthquake is routine and
     correctly raises nothing here). This was previously an unconditional
     Error; it is a Warning, and only fires at or above M1.
   - Indicates unreliable magnitude

3. **Location Uncertainty Asymmetry**

   - **Warning**: Ratio of the lat/lon uncertainties, converted to physical
     (km) distances at the event's latitude, exceeds 10:1
   - Comparing physical distances rather than raw degree values matters
     away from the equator: a degree of longitude is ``cos(latitude)``
     shorter than a degree of latitude, so at high latitude a genuinely
     isotropic (circular) uncertainty would misreport as asymmetric under a
     raw-degree comparison
   - Indicates poor station distribution

Quality Metrics Consistency
^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Rules**:

1. **Station vs Phase Count**

   - **Warning**: Station count > Phase count -- each station should
     contribute at least one phase, so this suggests the station and phase
     count fields may be swapped (this was previously an Error; it is a
     Warning)
   - **Info**: Phase count < 1.2 × Station count (unusual)

2. **Azimuthal Gap vs Station Count**

   - **Warning**: Gap > 180° -- this fires on the gap alone and is **not**
     conditioned on any station count (a large gap is diagnostic whether or
     not a station count was even reported); when a station count is
     present it is only added to the message text, not used as a trigger.
   - **Warning**: Gap below the geometric floor ``360/N - 0.5`` degrees,
     where N is the used station count (the 0.5-degree allowance absorbs
     gap values agencies round to whole degrees). The N azimuthal
     separations between N stations sum to 360°, so the largest of them
     (the reported gap) can never be smaller than 360/N; a reported gap
     below that floor is geometrically impossible and indicates a corrupt,
     mis-scaled or swapped field, not "station clustering" -- clustering
     makes the gap *larger*, never smaller. This replaces an older, backwards
     "gap < 90° with < 6 stations = clustering" framing.

   There is no separate rule comparing magnitude-station count against
   location-station count: in QuakeML, ``Magnitude.stationCount`` and
   ``OriginQuality.usedStationCount`` are independent quantities (a
   magnitude routinely uses amplitudes or waveforms from stations the
   location itself did not use), so a magnitude count above the location
   count is ordinary and is not flagged.

3. **RMS Residual (Standard Error)**
   - **Warning**: RMS > 5.0 seconds (poor fit)
   - **Info**: RMS < 0.001 seconds (unusually good -- verify this is not a
     rounding or calculation artefact)



Quality Metrics
---------------


Location Quality
^^^^^^^^^^^^^^^^


Based on uncertainties and network geometry:

- **Horizontal Uncertainty**: < 1 km excellent, > 10 km poor
- **Depth Uncertainty**: < 5 km excellent, > 20 km poor
- **Azimuthal Gap**: < 120° excellent, > 240° poor

Network Geometry
^^^^^^^^^^^^^^^^


- **Station Count**: >= 10 excellent, < 6 poor
- **Phase Count**: >= 30 excellent, < 8 poor
- **Azimuthal Gap**: < 120° excellent, > 240° poor

Solution Quality
^^^^^^^^^^^^^^^^


- **RMS Residual**: < 0.3s excellent, > 1.0s poor
- **Evaluation Status**: final > reviewed > confirmed > preliminary

Magnitude Quality
^^^^^^^^^^^^^^^^^


- **Magnitude Uncertainty**: < 0.1 excellent, > 0.3 poor
- **Station Count**: >= 10 excellent, < 3 poor



Completeness Metrics
--------------------


Required Fields Coverage
^^^^^^^^^^^^^^^^^^^^^^^^


Tracks presence of essential fields:

- ``time``, ``latitude``, ``longitude``, ``magnitude``
- Must be 100% for valid catalogue

Optional Fields Coverage
^^^^^^^^^^^^^^^^^^^^^^^^


Tracks presence of quality-enhancing fields:

- Uncertainties (location, depth, magnitude)
- Quality metrics (gap, phase count, station count)
- Metadata (region, source, magnitude type)

Missing Data Patterns
^^^^^^^^^^^^^^^^^^^^^


Identifies systematic gaps:

- Fields with >50% missing data
- Events with no uncertainty information
- Events with no quality metrics



Anomaly Detection
-----------------


Extreme Values
^^^^^^^^^^^^^^


**Magnitude Anomalies**:
- Magnitude > 9 (extremely rare, verify)
- Magnitude < -1 (unusual, verify)

**Depth Anomalies**:
- Depth > 700 km (very deep, rare but possible)
- Depth = 0 for >10% of events (may indicate missing data)

Temporal Clustering
^^^^^^^^^^^^^^^^^^^


**Duplicate Detection**:
- Events within 1 second of each other
- May indicate duplicates or require review

Geographic Anomalies
^^^^^^^^^^^^^^^^^^^^


**Null Island**:
- Coordinates at (0°, 0°)
- Almost always a data error

**Extreme Bounds**:
- Bounds > 180° latitude or 360° longitude
- Bounds < 0.01° (very small area)



Best Practices
--------------


Data Preparation
^^^^^^^^^^^^^^^^


1. **Ensure Required Fields**: All events must have time, location, and magnitude
2. **Include Uncertainties**: Provide uncertainty estimates when available
3. **Add Quality Metrics**: Include azimuthal gap, phase counts, station counts
4. **Specify Magnitude Type**: Indicate ML, Mw, mb, etc.
5. **Provide Metadata**: Include region, source, evaluation status

Quality Improvement
^^^^^^^^^^^^^^^^^^^


1. **Location Accuracy**:
   - Use more seismic stations
   - Improve station distribution (reduce azimuthal gap)
   - Use better velocity models
   - Include both P and S phases

2. **Magnitude Accuracy**:
   - Use more stations for magnitude calculation
   - Apply appropriate magnitude scale
   - Include magnitude uncertainty estimates

3. **Depth Accuracy**:
   - Use depth phases (pP, sP)
   - Include nearby stations
   - Consider fixing depth if poorly constrained

Data Validation Workflow
^^^^^^^^^^^^^^^^^^^^^^^^


1. **Upload Data**: Use supported formats (CSV, JSON, QuakeML)
2. **Review Validation Results**: Check errors and warnings
3. **Assess Quality Report**: Review completeness, consistency, accuracy scores
4. **Check Anomalies**: Investigate flagged events
5. **Review Recommendations**: Follow suggested improvements
6. **Fix Issues**: Correct errors before final import
7. **Re-validate**: Ensure all issues resolved

Minimum Quality Standards
^^^^^^^^^^^^^^^^^^^^^^^^^


Data is not rejected or blocked for a low quality score. What actually
gates whether an upload proceeds is narrower:

- **Completeness**: >= 50% (all required fields) -- enforced.
- **No Critical Errors**: no validation errors -- enforced.

A 60/100 threshold does exist in the code, but it is easy to misread as an
acceptance gate and is not one in the current upload flow. It applies only
to the **data-integrity** sub-score -- the average of completeness,
consistency and accuracy, deliberately excluding the mean per-event quality
index Q, which depends on optional solution metadata (uncertainties,
azimuthal gap, station/phase counts) that a plain CSV catalogue can never
be expected to supply. Even that 60%-data-integrity figure is not wired up
to block the upload in the current flow: the headline "Overall Quality
Score" shown after upload (data-integrity averaged together with the mean
event quality Q) is purely informational, an indication of what to review,
never an admission gate.

Recommended (not enforced) for high-quality analysis:

- **Completeness**: >= 90%
- **Data-integrity score** (completeness, consistency and accuracy,
  averaged): >= 75%, i.e. Grade B+ or better on the same A+-F scale used
  elsewhere
- **Uncertainties**: Present for >= 50% of events
- **Quality Metrics**: Present for >= 50% of events



Error Messages Reference
------------------------


Common Errors
^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Error
     - Severity
     - Meaning
     - Solution
   * - "Invalid timestamp format"
     - Error
     - Time field not parseable
     - Use ISO 8601 format
   * - "Latitude must be >= -90"
     - Error
     - Invalid latitude
     - Check coordinate system
   * - "Magnitude must be <= 10"
     - Error
     - Unrealistic magnitude
     - Verify magnitude value
   * - "Event time is in the future"
     - Error
     - Invalid timestamp
     - Verify time zone and date


Common Warnings
^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Warning
     - Meaning
     - Recommendation
   * - "High location uncertainty"
     - Poor location constraint
     - Add more stations or fix depth
   * - "Station count exceeds phase count"
     - Each station should contribute at least one phase; this is unusual,
       not impossible
     - Verify the station and phase count fields are not swapped
   * - "Large azimuthal gap"
     - Poor station distribution
     - Use more distant stations
   * - "Very shallow large magnitude"
     - Unusual event
     - Verify depth and magnitude
   * - "Duplicate timestamps"
     - Possible duplicates
     - Review events with same time
   * - "Missing uncertainty data"
     - Limited quality assessment
     - Add uncertainty estimates




API Reference
-------------


Validation Functions
^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   // Validate single event
   validateEarthquakeEvent(data: unknown): {
     success: boolean;
     data?: EarthquakeEvent;
     errors?: ZodError;
   }
   
   // Validate multiple events
   validateEarthquakeEvents(data: unknown[]): {
     validEvents: EarthquakeEvent[];
     invalidEvents: Array<{ index: number; errors: ZodError }>;
   }
   
   // Assess data quality
   assessDataQuality(events: any[]): DataQualityReport
   
   // Perform comprehensive quality check
   performQualityCheck(events: any[]): QualityCheckResult
   
   // Cross-field validation
   validateEventCrossFields(event: any): CrossFieldValidationResult




Support
-------


For questions or issues with data validation:

1. Review this guide
2. Check validation error messages
3. Consult the quality report recommendations
4. Contact the development team



**Last Updated**: October 31, 2025
**Version**: 1.0.0
