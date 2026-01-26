GeoNet Quality Score System - Analysis & Implementation Plan
============================================================


**Date**: November 25, 2025  
**Paper**: "A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand"  
**DOI**: 10.1080/00288306.2024.2421309  
**Status**: Analysis Complete - Implementation Plan Ready



Executive Summary
-----------------


The research paper proposes a **Quality Score (QS) system** ranging from **QS0 (unconstrained) to QS6 (best constrained)** for earthquake location quality assessment. This is a **discrete categorical system** based on specific location quality criteria, different from our current **continuous 0-100 scoring system**.

**Key Finding**: The two systems are **complementary** rather than conflicting. We should **integrate** the GeoNet QS system as an additional quality metric alongside our existing scoring.



Paper's Quality Score System
----------------------------


QS Scale (QS0 - QS6)
^^^^^^^^^^^^^^^^^^^^


Based on the abstract and search results, the system uses a **7-level categorical scale**:

- **QS6**: Best constrained locations
- **QS5-QS1**: Progressively less constrained
- **QS0**: Unconstrained locations

Likely Criteria (Based on Standard Seismological Practice)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


While the full paper is behind a paywall, standard earthquake location quality criteria typically include:

1. **Azimuthal Gap** - Angular distribution of stations around the event
   - Excellent: < 90°
   - Good: 90-180°
   - Poor: > 180°
   - Critical: > 270°

2. **Station Count** - Number of seismic stations used
   - Excellent: ≥ 20 stations
   - Good: 10-19 stations
   - Fair: 6-9 stations
   - Poor: < 6 stations

3. **RMS Residual** - Root mean square of travel time residuals
   - Excellent: < 0.3s
   - Good: 0.3-0.5s
   - Fair: 0.5-1.0s
   - Poor: > 1.0s

4. **Horizontal Uncertainty** - Location precision
   - Excellent: < 1 km
   - Good: 1-5 km
   - Fair: 5-10 km
   - Poor: > 10 km

5. **Depth Uncertainty** - Depth precision
   - Excellent: < 2 km
   - Good: 2-5 km
   - Fair: 5-10 km
   - Poor: > 10 km

6. **Minimum Distance** - Distance to nearest station
   - Excellent: < 50 km
   - Good: 50-100 km
   - Fair: 100-200 km
   - Poor: > 200 km



Current Implementation Analysis
-------------------------------


Our Existing Quality Scoring System
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File**: ``lib/quality-scoring.ts``

**Approach**: Continuous 0-100 scoring with weighted components

**Components**:
1. **Location Quality** (35% weight)
   - Horizontal uncertainty
   - Depth uncertainty
   - Time uncertainty

2. **Network Geometry** (25% weight)
   - Azimuthal gap
   - Station count
   - Phase count

3. **Solution Quality** (15% weight)
   - Standard error (RMS)

4. **Magnitude Quality** (15% weight)
   - Magnitude uncertainty
   - Magnitude station count

5. **Evaluation Status** (10% weight)
   - Manual vs automatic
   - Review status

**Grades**: A+, A, B, C, D, F (based on score ranges)

Strengths of Current System
^^^^^^^^^^^^^^^^^^^^^^^^^^^


✅ **Comprehensive** - Covers all major quality aspects  
✅ **Granular** - 0-100 scale provides fine-grained assessment  
✅ **Weighted** - Prioritizes most important factors  
✅ **Detailed feedback** - Provides strengths, weaknesses, recommendations  
✅ **Already implemented** - Fully functional with tests

Limitations vs GeoNet QS
^^^^^^^^^^^^^^^^^^^^^^^^


❌ **Not standardized** - Custom system, not comparable to published research  
❌ **Complex** - Harder to communicate than simple QS0-QS6  
❌ **No discrete categories** - Continuous scores less intuitive than QS levels  
❌ **Missing criteria** - Doesn't include minimum distance to nearest station



Comparison: Our System vs GeoNet QS
-----------------------------------


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Aspect
     - Our System
     - GeoNet QS
   * - **Scale**
     - 0-100 continuous
     - QS0-QS6 discrete
   * - **Grades**
     - A+, A, B, C, D, F
     - QS6, QS5, ..., QS0
   * - **Complexity**
     - High (5 components, weighted)
     - Medium (6-7 criteria)
   * - **Standardization**
     - Custom
     - Published research
   * - **Granularity**
     - Very fine (101 levels)
     - Coarse (7 levels)
   * - **Communication**
     - Technical
     - Simple & clear
   * - **Comparability**
     - Internal only
     - Comparable to GeoNet catalogue
   * - **Implementation**
     - Complete
     - Not implemented




Proposed Integration Strategy
-----------------------------


Option 1: Dual System (RECOMMENDED)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Implement both systems side-by-side**:

- **Keep existing 0-100 system** for detailed internal quality assessment
- **Add GeoNet QS (QS0-QS6)** for standardized comparison and communication

**Benefits**:
- Best of both worlds
- Maintains existing functionality
- Adds standardization and comparability
- Simple communication with QS levels
- Detailed analysis with 0-100 scores

**Implementation**:
- Add new ``calculateGeoNetQS()`` function
- Store both scores in database
- Display both in UI
- Use QS for filtering, 0-100 for detailed analysis

Option 2: Replace with GeoNet QS
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Replace our system entirely with GeoNet QS**

**Benefits**:
- Simpler system
- Standardized
- Easier to communicate

**Drawbacks**:
- Loss of granularity
- Loss of existing functionality
- Breaking change for users

**Recommendation**: ❌ **Not recommended** - too disruptive

Option 3: Map Our Scores to QS Levels
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Keep 0-100 system, map to QS levels**

**Benefits**:
- No new calculations needed
- Adds QS compatibility

**Drawbacks**:
- Mapping may not align with true QS criteria
- Not truly implementing the research methodology

**Recommendation**: ⚠️ **Acceptable but not ideal**



Implementation Plan (Option 1 - Dual System)
--------------------------------------------


Phase 1: Research & Specification
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Tasks**:
1. ✅ Analyze paper (COMPLETE)
2. ⏳ Obtain full paper text to confirm exact QS criteria
3. ⏳ Define precise thresholds for QS0-QS6
4. ⏳ Document GeoNet QS algorithm

**Estimated Time**: 2-3 days (pending paper access)

Phase 2: Core Implementation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Files to Create**:
- ``lib/geonet-quality-score.ts`` - GeoNet QS calculation logic

**Files to Modify**:
- ``lib/db.ts`` - Add ``geonet_qs`` column to events table
- ``lib/types/earthquake.ts`` - Add GeoNet QS types
- ``lib/quality-scoring.ts`` - Integrate with existing system

**Database Migration**:
.. code-block:: sql

   ALTER TABLE earthquake_events ADD COLUMN geonet_qs INTEGER CHECK(geonet_qs >= 0 AND geonet_qs <= 6);
   ALTER TABLE earthquake_events ADD COLUMN geonet_qs_details TEXT; -- JSON with criteria breakdown
   CREATE INDEX idx_events_geonet_qs ON earthquake_events(geonet_qs);


**Estimated Time**: 3-4 days

Phase 3: UI Integration
^^^^^^^^^^^^^^^^^^^^^^^


**Components to Update**:
- Event detail pages - Show both scores
- Event lists - Add QS filter
- Quality reports - Include QS distribution
- Import validation - Calculate QS on import
- Dashboard - QS statistics

**Estimated Time**: 2-3 days

Phase 4: Testing & Documentation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Testing**:
- Unit tests for QS calculation
- Integration tests with real GeoNet data
- Validation against published QS values (if available)

**Documentation**:
- User guide for QS interpretation
- API documentation
- Developer guide for QS algorithm

**Estimated Time**: 2 days

**Total Estimated Time**: 9-12 days



Next Steps
----------


Immediate Actions
^^^^^^^^^^^^^^^^^


1. **Obtain Full Paper** - Need complete methodology to implement correctly
   - Try institutional access
   - Contact authors directly
   - Check preprint servers (ResearchGate, arXiv)

2. **Validate Criteria** - Confirm exact thresholds for each QS level
   - May need to contact GeoNet directly
   - Review GeoNet documentation

3. **Get Stakeholder Approval** - Confirm dual system approach
   - Present this analysis to team
   - Get buy-in for implementation effort

Questions to Resolve
^^^^^^^^^^^^^^^^^^^^


1. **Exact QS Criteria** - What are the precise thresholds?
2. **Minimum Distance** - Should we add this metric to our data model?
3. **Backward Compatibility** - How to handle existing events without QS?
4. **Performance** - Impact of calculating two quality scores?
5. **UI/UX** - How to display both scores without confusion?



Conclusion
----------


The GeoNet Quality Score system is a **valuable addition** to our platform that would:

✅ **Standardize** our quality assessment with published research  
✅ **Improve communication** with simpler QS0-QS6 scale  
✅ **Enable comparison** with GeoNet catalogue  
✅ **Complement** our existing detailed scoring system  

**Recommendation**: Implement **Option 1 (Dual System)** to gain benefits of both approaches.

**Next Step**: Obtain full paper text to confirm exact QS criteria and thresholds.



**Document Status**: Analysis Complete - Awaiting Paper Access for Implementation
