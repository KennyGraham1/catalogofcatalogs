GeoNet Quality Score Implementation Guide
=========================================


**Status**: ✅ Core Implementation Complete  
**Date**: November 25, 2025  
**Version**: 1.0



Overview
--------


This guide documents the implementation of the **GeoNet Quality Score (QS) system** alongside our existing quality scoring system, creating a **dual-system approach** that provides both detailed analysis and standardized quality classification.



What Has Been Implemented
-------------------------


✅ Phase 1: Core Implementation (COMPLETE)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. GeoNet QS Calculation Module
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

**File**: ``lib/geonet-quality-score.ts``

**Features**:
- QS0-QS6 scoring based on 6 quality criteria
- Detailed criteria breakdown for each event
- Limiting factor identification
- Color coding for visualization
- Badge variants for UI display

**Criteria Evaluated**:
1. **Azimuthal Gap** - Station distribution (0-360°)
2. **Station Count** - Number of recording stations
3. **RMS Residual** - Travel time fit quality (seconds)
4. **Horizontal Uncertainty** - Location precision (km)
5. **Depth Uncertainty** - Depth precision (km)
6. **Minimum Distance** - Distance to nearest station (km)

**Scoring Logic**:
- Each criterion scored independently (0-6)
- Final QS = **minimum** of all criteria scores
- Ensures all quality aspects meet standards

2. Integrated Quality Assessment Module
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

**File**: ``lib/integrated-quality-assessment.ts``

**Features**:
- Combines 0-100 detailed scoring with QS0-QS6 standardized scoring
- Overall quality classification (Excellent → Unconstrained)
- Use case suitability guidance
- Actionable recommendations
- Formatted output for display

**Use Case Guidance**:
- **Scientific Research**: Requires QS4+ and 70+ score
- **Hazard Assessment**: Requires QS3+ and 60+ score
- **Public Information**: Requires QS2+ and 50+ score
- **Real-time Monitoring**: Requires QS1+ and 40+ score

3. Comprehensive Test Suite
~~~~~~~~~~~~~~~~~~~~~~~~~~~

**File**: ``__tests__/lib/geonet-quality-score.test.ts``

**Coverage**:
- ✅ 13 tests, all passing
- Tests for all QS levels (QS0-QS6)
- Limiting factor identification
- Missing data handling
- Criteria breakdown validation
- Badge and formatting functions



Quality Score Thresholds
------------------------


Azimuthal Gap Thresholds
^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - QS Level
     - Range
     - Description
   * - QS6
     - ≤ 90°
     - Excellent coverage
   * - QS5
     - 90-120°
     - Very good coverage
   * - QS4
     - 120-150°
     - Good coverage
   * - QS3
     - 150-180°
     - Fair coverage
   * - QS2
     - 180-240°
     - Poor coverage
   * - QS1
     - 240-300°
     - Very poor coverage
   * - QS0
     - > 300°
     - Unconstrained


Station Count Thresholds
^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - QS Level
     - Count
     - Description
   * - QS6
     - ≥ 30
     - Excellent
   * - QS5
     - 20-29
     - Very good
   * - QS4
     - 12-19
     - Good
   * - QS3
     - 8-11
     - Fair
   * - QS2
     - 5-7
     - Poor
   * - QS1
     - 3-4
     - Very poor
   * - QS0
     - < 3
     - Unconstrained


RMS Residual Thresholds
^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - QS Level
     - Range (seconds)
     - Description
   * - QS6
     - ≤ 0.2
     - Excellent fit
   * - QS5
     - 0.2-0.3
     - Very good fit
   * - QS4
     - 0.3-0.5
     - Good fit
   * - QS3
     - 0.5-0.8
     - Fair fit
   * - QS2
     - 0.8-1.2
     - Poor fit
   * - QS1
     - 1.2-2.0
     - Very poor fit
   * - QS0
     - > 2.0
     - Unconstrained


Horizontal Uncertainty Thresholds
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - QS Level
     - Range (km)
     - Description
   * - QS6
     - ≤ 1
     - Excellent precision
   * - QS5
     - 1-2
     - Very good precision
   * - QS4
     - 2-5
     - Good precision
   * - QS3
     - 5-10
     - Fair precision
   * - QS2
     - 10-20
     - Poor precision
   * - QS1
     - 20-50
     - Very poor precision
   * - QS0
     - > 50
     - Unconstrained


Depth Uncertainty Thresholds
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - QS Level
     - Range (km)
     - Description
   * - QS6
     - ≤ 2
     - Excellent constraint
   * - QS5
     - 2-5
     - Very good constraint
   * - QS4
     - 5-10
     - Good constraint
   * - QS3
     - 10-20
     - Fair constraint
   * - QS2
     - 20-40
     - Poor constraint
   * - QS1
     - 40-80
     - Very poor constraint
   * - QS0
     - > 80
     - Unconstrained


Minimum Distance Thresholds
^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - QS Level
     - Range (km)
     - Description
   * - QS6
     - ≤ 30
     - Excellent
   * - QS5
     - 30-50
     - Very good
   * - QS4
     - 50-100
     - Good
   * - QS3
     - 100-200
     - Fair
   * - QS2
     - 200-400
     - Poor
   * - QS1
     - 400-800
     - Very poor
   * - QS0
     - > 800
     - Unconstrained




Usage Examples
--------------


Example 1: Calculate GeoNet QS for an Event
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { calculateGeoNetQS } from '@/lib/geonet-quality-score';
   
   const criteria = {
     azimuthalGap: 95,
     usedStationCount: 28,
     rmsResidual: 0.22,
     horizontalUncertainty: 1.3,
     depthUncertainty: 3.5,
     minimumDistance: 42,
   };
   
   const result = calculateGeoNetQS(criteria);
   
   console.log(result.qualityScore);  // 5
   console.log(result.label);         // "QS5 - Very Well Constrained"
   console.log(result.limitingFactor); // "Azimuthal Gap" (if that's the limiting factor)


Example 2: Integrated Quality Assessment
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { assessEventQuality } from '@/lib/integrated-quality-assessment';
   
   const event = {
     latitude: -41.5,
     longitude: 174.0,
     depth: 25,
     magnitude: 4.5,
     azimuthal_gap: 110,
     used_station_count: 22,
     standard_error: 0.28,
     latitude_uncertainty: 0.015,
     longitude_uncertainty: 0.018,
     depth_uncertainty: 4.2,
     minimum_distance: 38,
   };
   
   const assessment = assessEventQuality(event);
   
   console.log(assessment.summary.overallQuality);        // "Very Good"
   console.log(assessment.summary.primaryScore);          // 85
   console.log(assessment.summary.standardizedScore);     // 5
   console.log(assessment.summary.recommendation);        // Detailed recommendation
   console.log(assessment.summary.useCaseGuidance);       // Use case suitability


Example 3: Display Quality Information
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { formatIntegratedAssessment } from '@/lib/integrated-quality-assessment';
   
   const formatted = formatIntegratedAssessment(assessment);
   console.log(formatted);
   
   // Output:
   // Overall Quality: Very Good
   // Detailed Score: 85/100 (B)
   // GeoNet QS: QS5 - Very Well Constrained
   //
   // Recommendation: High-quality location suitable for all applications...
   //
   // Suitable for:
   //   Scientific Research: ✓
   //   Hazard Assessment: ✓
   //   Public Information: ✓
   //   Real-time Monitoring: ✓




Next Steps: Database & UI Integration
-------------------------------------


Phase 2: Database Integration (TODO)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Tasks**:
1. Add ``geonet_qs`` column to ``earthquake_events`` table
2. Add ``geonet_qs_details`` JSON column for criteria breakdown
3. Create database migration script
4. Update event import logic to calculate QS
5. Add indexes for QS filtering

**Migration SQL**:
.. code-block:: sql

   -- Add GeoNet QS columns
   ALTER TABLE earthquake_events 
     ADD COLUMN geonet_qs INTEGER CHECK(geonet_qs >= 0 AND geonet_qs <= 6);
   
   ALTER TABLE earthquake_events 
     ADD COLUMN geonet_qs_details TEXT; -- JSON with criteria breakdown
   
   -- Add index for filtering
   CREATE INDEX idx_events_geonet_qs ON earthquake_events(geonet_qs);
   
   -- Add minimum_distance column if not exists
   ALTER TABLE earthquake_events 
     ADD COLUMN minimum_distance REAL;


Phase 3: UI Integration (TODO)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Components to Create/Update**:

1. **Event Detail Page**
   - Display both quality scores side-by-side
   - Show QS badge with color coding
   - Display criteria breakdown with visual indicators
   - Show limiting factor prominently
   - Display use case guidance

2. **Event List/Table**
   - Add QS column
   - Add QS filter dropdown (QS0-QS6)
   - Color-code rows by QS
   - Sort by QS

3. **Quality Dashboard**
   - QS distribution chart
   - Comparison of detailed vs QS scores
   - Limiting factors analysis
   - Quality trends over time

4. **Import Validation**
   - Calculate QS during import
   - Show QS in preview
   - Warn if many events have low QS

5. **Filters Component**
   - Add "Minimum QS" filter
   - Add "Use Case" filter (auto-filters by QS)



Testing
-------


Run GeoNet QS Tests
^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   npm test -- __tests__/lib/geonet-quality-score.test.ts


**Expected Result**: ✅ 13 tests passing



Documentation
-------------


For Users
^^^^^^^^^


**Interpreting Quality Scores**:
- **QS6-QS5**: Excellent quality, suitable for all applications
- **QS4**: Good quality, suitable for most applications
- **QS3**: Fair quality, use with caution for critical applications
- **QS2-QS1**: Poor quality, preliminary analysis only
- **QS0**: Unconstrained, insufficient data

**Limiting Factors**:
- The QS shows which criterion is limiting the quality
- Focus on improving the limiting factor to increase QS

For Developers
^^^^^^^^^^^^^^


**Adding New Criteria**:
1. Add to ``GeoNetQSCriteria`` interface
2. Create scoring function (e.g., ``scoreNewCriterion()``)
3. Add to ``calculateGeoNetQS()`` scores array
4. Update tests
5. Update documentation

**Adjusting Thresholds**:
- Modify threshold values in scoring functions
- Update tests to match new thresholds
- Document changes in this guide



References
----------


- **Research Paper**: "A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand"
- **DOI**: 10.1080/00288306.2024.2421309
- **Analysis Document**: ``docs/GEONET_QUALITY_SCORE_ANALYSIS.md``



Summary
-------


✅ **Core implementation complete** with:
- GeoNet QS calculation (QS0-QS6)
- Integrated quality assessment
- Comprehensive test suite (13 tests passing)
- Detailed documentation

⏳ **Next steps**:
- Database schema updates
- UI component integration
- Import workflow updates

**Estimated time for Phase 2 & 3**: 5-7 days



**Document Version**: 1.0  
**Last Updated**: November 25, 2025
