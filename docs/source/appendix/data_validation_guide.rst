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
     - 1900-01-01 to present
     - Event origin time
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
     - -2 to 10
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
     - 0 to 1000 km
     - Depth below surface
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
     - 0 to 60 s
     - Time uncertainty
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
     - 0 to 1000
     - Number of phases used
   * - ``used_station_count``
     - Integer
     - 0 to 500
     - Number of stations used
   * - ``standard_error``
     - Number
     - 0 to 100 s
     - RMS residual
   * - ``magnitude_station_count``
     - Integer
     - 0 to 500
     - Stations used for magnitude


Validation Rules
^^^^^^^^^^^^^^^^


Time Validation
~~~~~~~~~~~~~~~

- Must be a valid ISO 8601 datetime or parseable date string
- Cannot be in the future
- Should be after 1900-01-01 (instrumental seismology era)
- Warning if before 1900 (pre-instrumental era)

Location Validation
~~~~~~~~~~~~~~~~~~~

- Latitude must be between -90° and 90°
- Longitude must be between -180° and 180°
- Warning if coordinates are (0, 0) - "Null Island"
- Warning if coordinates are very close to (0, 0)

Magnitude Validation
~~~~~~~~~~~~~~~~~~~~

- Must be between -2 and 10
- Warning if magnitude > 9 (extremely rare)
- Warning if magnitude < -1 (unusual)

Depth Validation
~~~~~~~~~~~~~~~~

- Must be >= 0 km (cannot be negative)
- Must be <= 1000 km (maximum observed depth)
- Warning if depth > 700 km (very deep, rare)
- Info if depth = 0 (may indicate missing data)



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
- -10 points: Duplicate timestamps found
- -5 points: Suspicious shallow large-magnitude events
- -5 points: Other consistency issues

3. Accuracy Score (0-100%)
^^^^^^^^^^^^^^^^^^^^^^^^^^


Based on uncertainty values and quality metrics:

- **High accuracy**: Small uncertainties, good station coverage
- **Medium accuracy**: Moderate uncertainties
- **Low accuracy**: Large uncertainties, poor station coverage

**Deductions**:
- -30 points: >50% of events have high location uncertainty (>10km)
- -20 points: >50% of events have high depth uncertainty
- -10 points: Poor quality metrics overall

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
   * - 90-94
     - A
     - Excellent
     - High-quality, reliable data
   * - 80-89
     - B
     - Good
     - Good quality, suitable for most analyses
   * - 70-79
     - C
     - Fair
     - Acceptable quality, some limitations
   * - 60-69
     - D
     - Poor
     - Marginal quality, use with caution
   * - <60
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
   - **Error**: Magnitude uncertainty > |Magnitude|
   - Indicates unreliable magnitude

3. **Location Uncertainty Asymmetry**
   - **Warning**: Ratio of lat/lon uncertainties > 10:1
   - Indicates poor station distribution

Quality Metrics Consistency
^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Rules**:

1. **Station vs Phase Count**
   - **Error**: Station count > Phase count (impossible)
   - **Info**: Phase count < 1.2 × Station count (unusual)

2. **Magnitude Stations**
   - **Warning**: Magnitude stations > Location stations

3. **Azimuthal Gap vs Station Count**
   - **Warning**: Gap > 180° with >= 10 stations
   - **Info**: Gap < 90° with < 6 stations

4. **RMS Residual (Standard Error)**
   - **Warning**: RMS > 5.0 seconds (poor fit)
   - **Info**: RMS < 0.01 seconds (unusually good)



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


For data to be accepted:

- **Completeness**: >= 50% (all required fields)
- **No Critical Errors**: No validation errors
- **Overall Score**: >= 60/100

Recommended for high-quality analysis:

- **Completeness**: >= 90%
- **Overall Score**: >= 80/100 (Grade B or better)
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
   * - "Station count > Phase count"
     - Error
     - Impossible relationship
     - Check quality metrics
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
