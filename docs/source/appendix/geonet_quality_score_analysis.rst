GeoNet Quality Score System - Analysis & Implementation Plan
============================================================


**Date**: November 25, 2025
**Paper**: "A quantitative assessment of GeoNet earthquake location quality in Aotearoa New Zealand"
**DOI**: 10.1080/00288306.2024.2421309 -- this platform's QS0-QS6 heuristic does not reproduce the method behind this DOI; see the notice below
**Status**: Historical planning record -- Phase 1 (the in-house heuristic) was built; see *Document Status* at the end



.. important::
   This page documents the platform's own **in-house QS0-QS6 location-quality
   heuristic**, inspired by but **not a reproduction of** the published
   GeoNet Quality Score (Warren-Smith et al., 2025). The two use different
   methods over different inputs, and a QS0-QS6 number from this platform is
   **not comparable** to a QS number GeoNet would report for the same event.
   See :doc:`/appendix/geonet_qs_implementation_guide` for the full disclaimer and the
   corrected criteria; this page's "Likely Criteria" section below predates
   that guide and describes the published paper's method (now confirmed from
   the code's own provenance note), not this platform's heuristic.

Executive Summary
-----------------


The research paper proposes a **Quality Score (QS) system** ranging from **QS0 (unconstrained) to QS6 (best constrained)** for earthquake location quality assessment. This is a **discrete categorical system** based on specific location quality criteria, different from our current **continuous 0-100 scoring system**.

**Key Finding**: The platform's in-house heuristic (``lib/geonet-quality-score.ts``)
reuses the paper's QS0-QS6 numbering and general spirit as an additional,
internal quality metric alongside the existing 0-100 scoring -- but it is a
**different method over different inputs**, not an integration of the
paper's actual method (see *Relationship to the published GeoNet Quality
Score* in :doc:`/appendix/geonet_qs_implementation_guide`). Treat the two QS scales as
inspired-by, not interchangeable-with, each other.



Paper's Quality Score System
----------------------------


QS Scale (QS0 - QS6)
^^^^^^^^^^^^^^^^^^^^


Based on the abstract and search results, the system uses a **7-level categorical scale**:

- **QS6**: Best constrained locations
- **QS5-QS1**: Progressively less constrained
- **QS0**: Unconstrained locations

Confirmed Criteria (from the implementation's own provenance note)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

This section originally guessed at the paper's criteria because the full
text was behind a paywall. The platform's own code (``lib/geonet-quality-score.ts``,
header comment) now states the published method directly, so the guess
below is replaced with the confirmed description:

The published QS is the **sum** of up to six independent **binary**
(pass/fail) criteria, not a set of graded excellent/good/fair/poor bands:

1. **Azimuthal gap** <= 180°
2. **Arrival count** >= 8 arrivals
3. **P pick** >= 1 P-phase pick
4. **S pick** >= 1 S-phase pick
5. **Nearest-station distance** <= the event's hypocentral depth
6. **Fixed-depth flag** (a QS5 variant of the scale applies when depth was
   not fixed)

None of these six inputs (arrival counts, individual P/S picks, a
depth-fixed flag) are available in this codebase, which only has
network-derived summaries (azimuthal gap, station count, RMS residual,
horizontal/depth uncertainty, nearest-station distance). That is the
reason the platform's own heuristic (see :doc:`/appendix/geonet_qs_implementation_guide`)
computes a **different** thing -- the *minimum* across six *graded*
thresholds on largely different inputs -- rather than this sum of binary
criteria, and why the two QS0-QS6 numbers are not comparable. To reproduce
the published method exactly, see the authors' reference implementation
(github.com/calum-chamberlain/EQ_catalog_location_quality).



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

Limitations vs a Simple QS0-QS6 Scale
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

These are limitations of the 0-100 system relative to a simple discrete
scale in general -- **not** a claim that the platform's own QS0-QS6
heuristic is standardized or comparable to published research either; it
is not (see *Confirmed Criteria* above).

❌ **Complex** - Harder to communicate than a simple QS0-QS6 scale
❌ **No discrete categories** - Continuous scores less intuitive than QS levels
❌ **Missing criteria** - Doesn't include minimum distance to nearest station



Comparison: Our 0-100 System, the Published Paper, and This Platform's Heuristic
---------------------------------------------------------------------------------


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Aspect
     - Our 0-100 System
     - Published GeoNet QS (the paper)
     - This platform's QS0-QS6 heuristic
   * - **Scale**
     - 0-100 continuous
     - QS0-QS6 discrete
     - QS0-QS6 discrete (same numbering, different method)
   * - **Grades**
     - A+, A, B, C, D, F
     - QS6, QS5, ..., QS0
     - QS6, QS5, ..., QS0
   * - **Method**
     - Weighted sum of graded components
     - Sum of six binary pass/fail criteria
     - Minimum of six graded thresholds (different inputs)
   * - **Standardization**
     - Custom
     - Published research
     - Custom, inspired by the published research but not conformant to it
   * - **Granularity**
     - Very fine (101 levels)
     - Coarse (7 levels)
     - Coarse (7 levels)
   * - **Communication**
     - Technical
     - Simple & clear
     - Simple & clear
   * - **Comparability with the published GeoNet QS**
     - Not applicable
     - N/A (it is the reference)
     - **Not comparable** -- different method, different inputs
   * - **Implementation status in this platform**
     - Complete, in production use
     - Not implemented (would need phase-level picks and a fixed-depth flag
       this codebase does not store)
     - Complete (``lib/geonet-quality-score.ts``), not currently called from
       any app route, component or script -- library/test-only today




Proposed Integration Strategy
-----------------------------

.. note::
   This section is kept as the original planning record. **Option 1 (Dual
   System) was the option ultimately built**, via
   ``lib/geonet-quality-score.ts`` and ``lib/integrated-quality-assessment.ts``
   -- but as an in-house heuristic inspired by the paper's QS0-QS6 scale, not
   an implementation of the paper's own method (that would have needed
   phase-level arrival/pick data and a fixed-depth flag this codebase does
   not store; see *Confirmed Criteria* above). Read "standardization" and
   "comparability" below as describing the goal at planning time, not the
   result.


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

.. note::
   Kept as the original planning record; it predates *Confirmed Criteria*
   above. The "obtain full paper" / "define thresholds" tasks below read as
   still open, but the paper's actual criteria are now known directly from
   the code's own provenance note (see above) -- what was never done, and
   is not currently planned, is re-deriving this platform's thresholds
   *from* those confirmed criteria, since the heuristic that was built uses
   different inputs entirely (see the *Method* row two sections up).

Phase 1: Research & Specification
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Tasks**:

1. ✅ Analyze paper (COMPLETE)
2. ✅ Confirm exact QS criteria -- done, from the code's provenance note,
   not the full paper text (see *Confirmed Criteria* above)
3. ✅ Define thresholds for this platform's own QS0-QS6 heuristic -- done;
   see the threshold tables in :doc:`/appendix/geonet_qs_implementation_guide`
4. ✅ Document the heuristic -- done, in :doc:`/appendix/geonet_qs_implementation_guide`

**Estimated Time**: superseded -- complete

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

.. note::
   The two items below that originally motivated obtaining the paper are
   resolved: the paper's actual criteria are confirmed from the code's own
   provenance note (see *Confirmed Criteria* above), and Option 1 (Dual
   System) already has stakeholder-level approval in the form of being
   built and shipped as ``lib/geonet-quality-score.ts`` and
   ``lib/integrated-quality-assessment.ts``. What remains genuinely open is
   Phase 2/3 (database and UI integration) from the plan above, which are
   not yet built.

1. ✅ **Obtain Full Paper** -- superseded; the paper's method is confirmed
   from the code's own provenance note without needing the full text (see
   *Confirmed Criteria* above)
2. ✅ **Validate Criteria** -- superseded for the same reason
3. ✅ **Get Stakeholder Approval** -- the dual-system approach was built

Questions to Resolve
^^^^^^^^^^^^^^^^^^^^


1. ✅ **Exact QS Criteria** -- resolved, see *Confirmed Criteria* above (the
   paper's own thresholds; this platform's heuristic uses different,
   project-chosen thresholds, documented in
   :doc:`/appendix/geonet_qs_implementation_guide`)
2. ✅ **Minimum Distance** -- resolved; ``minimum_distance`` is a stored,
   mappable field (see :doc:`/appendix/default_field_mappings`) and is one of the six
   criteria the in-house heuristic scores
3. **Backward Compatibility** - How to handle existing events without QS?
   (still open -- QS is computed on demand from stored fields, not stored
   itself, so this is more a display/filtering question than a migration one)
4. **Performance** - Impact of calculating two quality scores? (still open)
5. **UI/UX** - How to display both scores without confusion, and without
   implying the in-house heuristic is the published GeoNet QS? (still open)



Conclusion
----------


An in-house QS0-QS6 heuristic was a **valuable addition** to the platform. It:

✅ **Improves communication** with a simple QS0-QS6 scale alongside the 0-100 score
✅ **Complements** the existing detailed scoring system
⚠️ Does **not** standardize against, or enable comparison with, the published
GeoNet Quality Score or the GeoNet catalogue -- see *Confirmed Criteria* and
:doc:`/appendix/geonet_qs_implementation_guide` for why the two scales are not the
same measurement, even though both run QS0-QS6.

**Outcome**: **Option 1 (Dual System)** was implemented, as an in-house
heuristic rather than a reproduction of the paper's method.



**Document Status**: Historical planning record. Superseded by
:doc:`/appendix/geonet_qs_implementation_guide` and :doc:`/appendix/geonet_qs_implementation_summary`,
which describe what was actually built.
