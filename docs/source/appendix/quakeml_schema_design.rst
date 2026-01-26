QuakeML 1.2 Database Schema Design
==================================


Overview
--------

This document outlines the expanded database schema to support all fields from the QuakeML 1.2 (Basic Event Description - BED) specification.

Design Principles
-----------------


1. **Frequently Queried Fields**: Store as direct columns for performance
2. **Complex Nested Data**: Store as JSON for flexibility
3. **Nullable Fields**: Most fields are optional since not all catalogues provide all data
4. **Backward Compatibility**: Existing basic fields remain unchanged

QuakeML 1.2 Structure
---------------------


Based on ObsPy implementation and QuakeML BED specification:

.. mermaid::

    erDiagram
        EVENT ||--o{ ORIGIN : "contains"
        EVENT ||--o{ MAGNITUDE : "contains"
        EVENT ||--o{ FOCAL_MECHANISM : "contains"
        EVENT ||--o{ PICK : "contains"
        EVENT ||--o{ AMPLITUDE : "contains"
        
        ORIGIN ||--o{ ARRIVAL : "contains"
        ORIGIN }|..|| EVENT : "preferred for"
        
        MAGNITUDE }|--|| ORIGIN : "derived from"
        MAGNITUDE }|..|| EVENT : "preferred for"
        
        FOCAL_MECHANISM }|--|| ORIGIN : "triggered by"
        FOCAL_MECHANISM }|..|| EVENT : "preferred for"
        
        ARRIVAL }|--|| PICK : "based on"
        
        EVENT {
            string publicID
            string type
            datetime creationTime
        }
        
        ORIGIN {
            datetime time
            float latitude
            float longitude
            float depth
            json quality
        }
        
        MAGNITUDE {
            float mag
            string type
            string methodID
        }
        
        FOCAL_MECHANISM {
            float strike
            float dip
            float rake
            json momentTensor
        }


Event (Top Level)
^^^^^^^^^^^^^^^^^

- ``publicID`` (string) - Unique resource identifier
- ``type`` (string) - Event type (earthquake, explosion, etc.)
- ``typeCertainty`` (string) - Certainty of event type
- ``description`` (array) - Event descriptions (name, region, etc.)
- ``comment`` (array) - Additional comments
- ``creationInfo`` (object) - Author, agency, creation time

Origin (Location Information)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- ``publicID`` (string)
- ``time`` (object) - Origin time with uncertainty
  - ``value`` (datetime)
  - ``uncertainty`` (float)
- ``latitude`` (object) - Latitude with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``longitude`` (object) - Longitude with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``depth`` (object) - Depth with uncertainty
  - ``value`` (float in meters)
  - ``uncertainty`` (float)
- ``depthType`` (string) - How depth was determined
- ``timeFixed`` (boolean) - Whether time was fixed
- ``epicenterFixed`` (boolean) - Whether epicenter was fixed
- ``quality`` (object) - Quality metrics
  - ``associatedPhaseCount`` (int)
  - ``usedPhaseCount`` (int)
  - ``associatedStationCount`` (int)
  - ``usedStationCount`` (int)
  - ``depthPhaseCount`` (int)
  - ``standardError`` (float)
  - ``azimuthalGap`` (float)
  - ``secondaryAzimuthalGap`` (float)
  - ``groundTruthLevel`` (string)
  - ``minimumDistance`` (float)
  - ``maximumDistance`` (float)
  - ``medianDistance`` (float)
- ``evaluationMode`` (string) - manual/automatic
- ``evaluationStatus`` (string) - preliminary/confirmed/reviewed/final
- ``originUncertainty`` (object) - Uncertainty ellipse
  - ``horizontalUncertainty`` (float)
  - ``minHorizontalUncertainty`` (float)
  - ``maxHorizontalUncertainty`` (float)
  - ``azimuthMaxHorizontalUncertainty`` (float)
- ``creationInfo`` (object)

Magnitude
^^^^^^^^^

- ``publicID`` (string)
- ``mag`` (object) - Magnitude value with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``type`` (string) - ML, Mw, mb, Ms, etc.
- ``originID`` (string) - Reference to origin
- ``methodID`` (string) - Method used
- ``stationCount`` (int) - Number of stations used
- ``azimuthalGap`` (float)
- ``evaluationMode`` (string)
- ``evaluationStatus`` (string)
- ``creationInfo`` (object)

Pick (Phase Arrival Time)
^^^^^^^^^^^^^^^^^^^^^^^^^

- ``publicID`` (string)
- ``time`` (object) - Pick time with uncertainty
  - ``value`` (datetime)
  - ``uncertainty`` (float)
- ``waveformID`` (object) - Station/channel info
  - ``networkCode`` (string)
  - ``stationCode`` (string)
  - ``locationCode`` (string)
  - ``channelCode`` (string)
- ``filterID`` (string)
- ``methodID`` (string)
- ``phaseHint`` (string) - P, S, etc.
- ``polarity`` (string) - positive/negative/undecidable
- ``evaluationMode`` (string)
- ``evaluationStatus`` (string)
- ``creationInfo`` (object)

Arrival (Association of Pick with Origin)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- ``publicID`` (string)
- ``pickID`` (string) - Reference to pick
- ``phase`` (string) - Phase identification
- ``timeCorrection`` (float)
- ``azimuth`` (float) - Azimuth from source to station
- ``distance`` (float) - Epicentral distance in degrees
- ``takeoffAngle`` (object) - Angle with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``timeResidual`` (float) - Observed - calculated time
- ``horizontalSlownessResidual`` (float)
- ``backazimuthResidual`` (float)
- ``timeWeight`` (float) - Weight in location
- ``horizontalSlownessWeight`` (float)
- ``backazimuthWeight`` (float)
- ``earthModelID`` (string)
- ``creationInfo`` (object)

FocalMechanism
^^^^^^^^^^^^^^

- ``publicID`` (string)
- ``triggeringOriginID`` (string)
- ``nodalPlanes`` (object) - Two nodal planes
  - ``nodalPlane1`` (object)
    - ``strike`` (object with value/uncertainty)
    - ``dip`` (object with value/uncertainty)
    - ``rake`` (object with value/uncertainty)
  - ``nodalPlane2`` (object)
    - ``strike`` (object with value/uncertainty)
    - ``dip`` (object with value/uncertainty)
    - ``rake`` (object with value/uncertainty)
  - ``preferredPlane`` (int) - 1 or 2
- ``principalAxes`` (object) - T, N, P axes
  - ``tAxis`` (object with azimuth/plunge/length)
  - ``pAxis`` (object with azimuth/plunge/length)
  - ``nAxis`` (object with azimuth/plunge/length)
- ``momentTensor`` (object) - Full moment tensor
  - ``derivedOriginID`` (string)
  - ``momentMagnitudeID`` (string)
  - ``scalarMoment`` (object with value/uncertainty)
  - ``tensor`` (object) - Mrr, Mtt, Mpp, Mrt, Mrp, Mtp
  - ``variance`` (float)
  - ``varianceReduction`` (float)
  - ``doubleCouple`` (float)
  - ``clvd`` (float)
  - ``iso`` (float)
  - ``sourceTimeFunction`` (object)
- ``evaluationMode`` (string)
- ``evaluationStatus`` (string)
- ``creationInfo`` (object)

Amplitude
^^^^^^^^^

- ``publicID`` (string)
- ``genericAmplitude`` (object) - Amplitude value with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``type`` (string) - A, AML, etc.
- ``category`` (string) - point/mean/duration/period/integral/other
- ``unit`` (string) - m, m/s, m/(s*s), etc.
- ``methodID`` (string)
- ``period`` (object) - Dominant period with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``snr`` (float) - Signal-to-noise ratio
- ``timeWindow`` (object) - Time window used
  - ``reference`` (datetime)
  - ``begin`` (float)
  - ``end`` (float)
- ``pickID`` (string) - Reference to pick
- ``waveformID`` (object) - Station/channel info
- ``filterID`` (string)
- ``scalingTime`` (object) - Time of maximum amplitude
- ``magnitudeHint`` (string)
- ``evaluationMode`` (string)
- ``evaluationStatus`` (string)
- ``creationInfo`` (object)

StationMagnitude
^^^^^^^^^^^^^^^^

- ``publicID`` (string)
- ``originID`` (string)
- ``mag`` (object) - Magnitude value with uncertainty
  - ``value`` (float)
  - ``uncertainty`` (float)
- ``type`` (string)
- ``amplitudeID`` (string)
- ``methodID`` (string)
- ``waveformID`` (object)
- ``creationInfo`` (object)

Proposed Database Schema
------------------------


Core Columns (Frequently Queried)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: sql

   CREATE TABLE merged_events (
     -- Existing basic fields
     id TEXT PRIMARY KEY,
     catalogue_id TEXT NOT NULL,
     time DATETIME NOT NULL,
     latitude REAL NOT NULL,
     longitude REAL NOT NULL,
     depth REAL,
     magnitude REAL NOT NULL,
     source_events TEXT NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     
     -- Event metadata
     event_public_id TEXT,
     event_type TEXT,
     event_type_certainty TEXT,
     
     -- Origin uncertainties (most commonly used)
     time_uncertainty REAL,
     latitude_uncertainty REAL,
     longitude_uncertainty REAL,
     depth_uncertainty REAL,
     
     -- Magnitude details
     magnitude_type TEXT,
     magnitude_uncertainty REAL,
     magnitude_station_count INTEGER,
     
     -- Origin quality metrics (commonly queried)
     azimuthal_gap REAL,
     used_phase_count INTEGER,
     used_station_count INTEGER,
     standard_error REAL,
     
     -- Evaluation metadata
     evaluation_mode TEXT,
     evaluation_status TEXT,
     
     -- Complex nested data as JSON
     origin_quality JSON,           -- Full OriginQuality object
     origins JSON,                  -- Array of all origins
     magnitudes JSON,               -- Array of all magnitudes
     picks JSON,                    -- Array of picks
     arrivals JSON,                 -- Array of arrivals
     focal_mechanisms JSON,         -- Array of focal mechanisms
     amplitudes JSON,               -- Array of amplitudes
     station_magnitudes JSON,       -- Array of station magnitudes
     event_descriptions JSON,       -- Array of event descriptions
     comments JSON,                 -- Array of comments
     creation_info JSON,            -- CreationInfo object
     
     FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
   );


Indexes for Performance
^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: sql

   CREATE INDEX idx_event_type ON merged_events(event_type);
   CREATE INDEX idx_magnitude_type ON merged_events(magnitude_type);
   CREATE INDEX idx_evaluation_status ON merged_events(evaluation_status);
   CREATE INDEX idx_azimuthal_gap ON merged_events(azimuthal_gap);


TypeScript Interfaces
---------------------


See ``lib/types/quakeml.ts`` for comprehensive type definitions.

Migration Strategy
------------------


1. Add new columns with ALTER TABLE statements
2. Existing data remains valid (new columns are nullable)
3. New QuakeML imports populate all fields
4. Merge algorithm preserves detailed information

Benefits
--------


1. **Complete Data Preservation**: All QuakeML 1.2 fields are stored
2. **Query Performance**: Common fields are indexed columns
3. **Flexibility**: JSON columns allow for complex nested structures
4. **Backward Compatibility**: Existing code continues to work
5. **Research Value**: Detailed seismological data available for analysis
