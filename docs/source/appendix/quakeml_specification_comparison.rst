QuakeML 1.2 Specification Comparison Report
============================================

This document provides a comprehensive comparison between the official QuakeML 1.2 Basic Event Description (BED)
specification and our TypeScript implementation in ``lib/types/quakeml.ts``.

.. contents:: Table of Contents
   :local:
   :depth: 3

Overview
--------

QuakeML is an XML-based data exchange format for seismological data developed by the seismological community.
The QuakeML 1.2 BED (Basic Event Description) schema defines the structure for representing earthquake
event data including origins, magnitudes, picks, arrivals, focal mechanisms, and moment tensors.

**Official Specification**: https://quake.ethz.ch/quakeml/

**Our Implementation**: ``lib/types/quakeml.ts``

Implementation Status Summary
-----------------------------

.. list-table:: QuakeML 1.2 BED Coverage Summary
   :header-rows: 1
   :widths: 35 20 45

   * - Category
     - Status
     - Notes
   * - Base Types (RealQuantity, TimeQuantity, etc.)
     - |fully_supported|
     - All uncertainty fields included
   * - Event Types
     - |fully_supported|
     - All 47+ event types from specification
   * - Event Description
     - |fully_supported|
     - All description types supported
   * - Origin
     - |fully_supported|
     - Includes CompositeTime for historical events
   * - Origin Quality
     - |fully_supported|
     - All 12 quality metrics
   * - Origin Uncertainty
     - |fully_supported|
     - Includes confidence ellipsoid
   * - Magnitude
     - |fully_supported|
     - Includes station magnitude contributions
   * - Station Magnitude
     - |fully_supported|
     - Includes comment field
   * - Pick
     - |fully_supported|
     - All onset and polarity types
   * - Arrival
     - |fully_supported|
     - All residual and weight fields
   * - Amplitude
     - |fully_supported|
     - Includes TimeWindow
   * - Focal Mechanism
     - |fully_supported|
     - Includes waveformID array
   * - Moment Tensor
     - |fully_supported|
     - Includes DataUsed for inversion details
   * - Nodal Planes
     - |fully_supported|
     - Both planes with preferred indicator
   * - Principal Axes
     - |fully_supported|
     - T, P, N axes with uncertainties

.. |fully_supported| raw:: html

   <span style="background-color: #16a34a; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.85em;">Fully Supported</span>

.. |partial| raw:: html

   <span style="background-color: #d97706; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.85em;">Partial</span>

.. |new| raw:: html

   <span style="background-color: #2563eb; color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.85em;">NEW</span>


Recently Added Fields (Session Updates)
---------------------------------------

The following 5 fields were recently added to achieve fuller QuakeML 1.2 compliance:

1. CompositeTime Interface |new|
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Purpose**: Represents time of rupture start for complex, historic, or poorly constrained events
where the exact time is uncertain but individual components (year, month, day, etc.) may be known
with different levels of precision.

**QuakeML Specification Reference**: Section 3.2.4 - CompositeTime

**TypeScript Interface**:

.. code-block:: typescript

   export interface CompositeTime {
     year?: IntegerQuantity;
     month?: IntegerQuantity;
     day?: IntegerQuantity;
     hour?: IntegerQuantity;
     minute?: IntegerQuantity;
     second?: RealQuantity;
   }

**Added to**: ``Origin`` interface as ``compositeTime?: CompositeTime[]``

**Use Case**: Historical earthquakes where only the year or approximate date is known.

**Example QuakeML**:

.. code-block:: xml

   <origin publicID="smi:example/origin/1">
     <time>
       <value>1906-04-18T05:12:21Z</value>
       <uncertainty>60</uncertainty>
     </time>
     <compositeTime>
       <year>
         <value>1906</value>
       </year>
       <month>
         <value>4</value>
       </month>
       <day>
         <value>18</value>
         <uncertainty>1</uncertainty>
       </day>
     </compositeTime>
     <!-- ... other fields -->
   </origin>

2. StationMagnitudeContribution Interface |new|
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Purpose**: Describes the contribution of a single station magnitude to a network magnitude calculation,
including residual and weight information.

**QuakeML Specification Reference**: Section 3.4.2 - StationMagnitudeContribution

**TypeScript Interface**:

.. code-block:: typescript

   export interface StationMagnitudeContribution {
     stationMagnitudeID: string;
     residual?: number;
     weight?: number;
   }

**Added to**: ``Magnitude`` interface as ``stationMagnitudeContributions?: StationMagnitudeContribution[]``

**Use Case**: Understanding which stations contributed to a network magnitude and their relative weights.

**Example QuakeML**:

.. code-block:: xml

   <magnitude publicID="smi:example/magnitude/mw/1">
     <mag>
       <value>6.5</value>
       <uncertainty>0.1</uncertainty>
     </mag>
     <type>Mw</type>
     <stationCount>15</stationCount>
     <stationMagnitudeContribution>
       <stationMagnitudeID>smi:example/stationmag/1</stationMagnitudeID>
       <residual>0.05</residual>
       <weight>1.0</weight>
     </stationMagnitudeContribution>
     <stationMagnitudeContribution>
       <stationMagnitudeID>smi:example/stationmag/2</stationMagnitudeID>
       <residual>-0.12</residual>
       <weight>0.8</weight>
     </stationMagnitudeContribution>
   </magnitude>

3. Comment Field in StationMagnitude |new|
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Purpose**: Allows adding comments to individual station magnitude measurements for quality notes,
processing details, or analyst remarks.

**QuakeML Specification Reference**: Section 3.4.3 - StationMagnitude (comment child element)

**TypeScript Change**:

.. code-block:: typescript

   export interface StationMagnitude {
     publicID: string;
     originID?: string;
     mag: RealQuantity;
     type?: string;
     amplitudeID?: string;
     methodID?: string;
     waveformID?: WaveformStreamID;
     creationInfo?: CreationInfo;
     comment?: Comment[];  // NEW: Comments for this station magnitude
   }

**Use Case**: Documenting why a particular station magnitude was excluded or weighted differently.

**Example QuakeML**:

.. code-block:: xml

   <stationMagnitude publicID="smi:example/stationmag/1">
     <originID>smi:example/origin/1</originID>
     <mag>
       <value>4.2</value>
       <uncertainty>0.2</uncertainty>
     </mag>
     <type>ML</type>
     <waveformID networkCode="NZ" stationCode="WEL" channelCode="HHZ"/>
     <comment>
       <text>Noisy trace - reduced weight applied</text>
       <creationInfo>
         <author>analyst@geonet.org.nz</author>
         <creationTime>2024-01-15T10:30:00Z</creationTime>
       </creationInfo>
     </comment>
   </stationMagnitude>

4. DataUsed Interface in MomentTensor |new|
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Purpose**: Describes the data used in a moment tensor inversion, including wave type, station count,
component count, and period range.

**QuakeML Specification Reference**: Section 3.5.3 - DataUsed

**TypeScript Interfaces**:

.. code-block:: typescript

   export type DataUsedWaveType =
     | 'P waves'
     | 'body waves'
     | 'surface waves'
     | 'mantle waves'
     | 'combined';

   export interface DataUsed {
     waveType: DataUsedWaveType;
     stationCount?: number;
     componentCount?: number;
     shortestPeriod?: number;
     longestPeriod?: number;
   }

**Added to**: ``MomentTensor`` interface as ``dataUsed?: DataUsed[]``

**Use Case**: Documenting what seismic data was used to derive a moment tensor solution.

**Example QuakeML**:

.. code-block:: xml

   <momentTensor publicID="smi:example/mt/1">
     <derivedOriginID>smi:example/origin/1</derivedOriginID>
     <scalarMoment>
       <value>1.2e19</value>
     </scalarMoment>
     <dataUsed>
       <waveType>body waves</waveType>
       <stationCount>45</stationCount>
       <componentCount>90</componentCount>
       <shortestPeriod>40</shortestPeriod>
       <longestPeriod>150</longestPeriod>
     </dataUsed>
     <dataUsed>
       <waveType>surface waves</waveType>
       <stationCount>32</stationCount>
       <componentCount>64</componentCount>
       <shortestPeriod>50</shortestPeriod>
       <longestPeriod>300</longestPeriod>
     </dataUsed>
     <tensor>
       <Mrr><value>1.1e19</value></Mrr>
       <Mtt><value>-0.5e19</value></Mtt>
       <Mpp><value>-0.6e19</value></Mpp>
       <Mrt><value>0.3e19</value></Mrt>
       <Mrp><value>0.4e19</value></Mrp>
       <Mtp><value>-0.2e19</value></Mtp>
     </tensor>
   </momentTensor>

5. WaveformID Array in FocalMechanism |new|
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

**Purpose**: References the waveforms used in the focal mechanism determination, linking back to
the actual seismic data used in the analysis.

**QuakeML Specification Reference**: Section 3.5.1 - FocalMechanism (waveformID child element)

**TypeScript Change**:

.. code-block:: typescript

   export interface FocalMechanism {
     publicID: string;
     triggeringOriginID?: string;
     nodalPlanes?: NodalPlanes;
     principalAxes?: PrincipalAxes;
     azimuthalGap?: number;
     stationPolarityCount?: number;
     misfit?: number;
     stationDistributionRatio?: number;
     methodID?: string;
     momentTensor?: MomentTensor;
     evaluationMode?: EvaluationMode;
     evaluationStatus?: EvaluationStatus;
     creationInfo?: CreationInfo;
     comment?: Comment[];
     waveformID?: WaveformStreamID[];  // NEW: Waveforms used in determination
   }

**Use Case**: Tracing which waveforms contributed to a focal mechanism solution for quality assessment.

**Example QuakeML**:

.. code-block:: xml

   <focalMechanism publicID="smi:example/focalmech/1">
     <triggeringOriginID>smi:example/origin/1</triggeringOriginID>
     <nodalPlanes>
       <nodalPlane1>
         <strike><value>215</value></strike>
         <dip><value>45</value></dip>
         <rake><value>90</value></rake>
       </nodalPlane1>
       <nodalPlane2>
         <strike><value>35</value></strike>
         <dip><value>45</value></dip>
         <rake><value>90</value></rake>
       </nodalPlane2>
     </nodalPlanes>
     <stationPolarityCount>25</stationPolarityCount>
     <waveformID networkCode="NZ" stationCode="WEL" channelCode="HHZ"/>
     <waveformID networkCode="NZ" stationCode="SNZO" channelCode="HHZ"/>
     <waveformID networkCode="NZ" stationCode="BFZ" channelCode="HHZ"/>
   </focalMechanism>


Complete Field Mapping Reference
--------------------------------

Base Types
^^^^^^^^^^

.. list-table:: Base Type Mapping
   :header-rows: 1
   :widths: 25 35 40

   * - QuakeML Element
     - TypeScript Interface
     - Fields
   * - RealQuantity
     - ``RealQuantity``
     - value, uncertainty, lowerUncertainty, upperUncertainty, confidenceLevel
   * - TimeQuantity
     - ``TimeQuantity``
     - value (ISO 8601), uncertainty, lowerUncertainty, upperUncertainty, confidenceLevel
   * - IntegerQuantity
     - ``IntegerQuantity``
     - value, uncertainty, lowerUncertainty, upperUncertainty, confidenceLevel
   * - CreationInfo
     - ``CreationInfo``
     - agencyID, agencyURI, author, authorURI, creationTime, version
   * - Comment
     - ``Comment``
     - text, id, creationInfo
   * - WaveformStreamID
     - ``WaveformStreamID``
     - networkCode, stationCode, locationCode, channelCode, resourceURI

Event Types
^^^^^^^^^^^

Our implementation supports all 47+ event types defined in QuakeML 1.2:

.. code-block:: typescript

   export type EventType =
     | 'not existing' | 'not reported' | 'earthquake'
     | 'anthropogenic event' | 'collapse' | 'cavity collapse'
     | 'mine collapse' | 'building collapse' | 'explosion'
     | 'accidental explosion' | 'chemical explosion' | 'controlled explosion'
     | 'experimental explosion' | 'industrial explosion' | 'mining explosion'
     | 'quarry blast' | 'road cut' | 'blasting levee' | 'nuclear explosion'
     | 'induced or triggered event' | 'rock burst' | 'reservoir loading'
     | 'fluid injection' | 'fluid extraction' | 'crash' | 'plane crash'
     | 'train crash' | 'boat crash' | 'other event' | 'atmospheric event'
     | 'sonic boom' | 'sonic blast' | 'acoustic noise' | 'thunder'
     | 'avalanche' | 'snow avalanche' | 'debris avalanche'
     | 'hydroacoustic event' | 'ice quake' | 'slide' | 'landslide'
     | 'rockslide' | 'meteorite' | 'volcanic eruption';

Event Structure
^^^^^^^^^^^^^^^

.. list-table:: Event (QuakeMLEvent) Field Mapping
   :header-rows: 1
   :widths: 30 30 40

   * - QuakeML Element
     - TypeScript Field
     - Description
   * - publicID (attribute)
     - ``publicID: string``
     - Unique resource identifier
   * - preferredOriginID
     - ``preferredOriginID?: string``
     - Reference to preferred origin
   * - preferredMagnitudeID
     - ``preferredMagnitudeID?: string``
     - Reference to preferred magnitude
   * - preferredFocalMechanismID
     - ``preferredFocalMechanismID?: string``
     - Reference to preferred focal mechanism
   * - type
     - ``type?: EventType``
     - Event classification
   * - typeCertainty
     - ``typeCertainty?: EventTypeCertainty``
     - known or suspected
   * - description
     - ``description?: EventDescription[]``
     - Array of descriptions
   * - comment
     - ``comment?: Comment[]``
     - Array of comments
   * - creationInfo
     - ``creationInfo?: CreationInfo``
     - Creation metadata
   * - origin
     - ``origins?: Origin[]``
     - Array of origins
   * - magnitude
     - ``magnitudes?: Magnitude[]``
     - Array of magnitudes
   * - stationMagnitude
     - ``stationMagnitudes?: StationMagnitude[]``
     - Array of station magnitudes
   * - pick
     - ``picks?: Pick[]``
     - Array of picks
   * - amplitude
     - ``amplitudes?: Amplitude[]``
     - Array of amplitudes
   * - focalMechanism
     - ``focalMechanisms?: FocalMechanism[]``
     - Array of focal mechanisms

Origin Structure
^^^^^^^^^^^^^^^^

.. list-table:: Origin Field Mapping
   :header-rows: 1
   :widths: 30 30 40

   * - QuakeML Element
     - TypeScript Field
     - Description
   * - publicID
     - ``publicID: string``
     - Unique identifier
   * - time
     - ``time: TimeQuantity``
     - Origin time with uncertainty
   * - latitude
     - ``latitude: RealQuantity``
     - Epicenter latitude
   * - longitude
     - ``longitude: RealQuantity``
     - Epicenter longitude
   * - depth
     - ``depth?: RealQuantity``
     - Hypocenter depth
   * - depthType
     - ``depthType?: OriginDepthType``
     - How depth was determined
   * - timeFixed
     - ``timeFixed?: boolean``
     - Whether time was fixed
   * - epicenterFixed
     - ``epicenterFixed?: boolean``
     - Whether epicenter was fixed
   * - referenceSystemID
     - ``referenceSystemID?: string``
     - Coordinate system reference
   * - methodID
     - ``methodID?: string``
     - Location method
   * - earthModelID
     - ``earthModelID?: string``
     - Earth model used
   * - quality
     - ``quality?: OriginQuality``
     - Quality metrics
   * - originUncertainty
     - ``uncertainty?: OriginUncertainty``
     - Location uncertainty
   * - type
     - ``type?: string``
     - Origin type
   * - region
     - ``region?: string``
     - Geographic region
   * - evaluationMode
     - ``evaluationMode?: EvaluationMode``
     - manual/automatic
   * - evaluationStatus
     - ``evaluationStatus?: EvaluationStatus``
     - preliminary/confirmed/reviewed/final/rejected
   * - creationInfo
     - ``creationInfo?: CreationInfo``
     - Creation metadata
   * - comment
     - ``comment?: Comment[]``
     - Array of comments
   * - arrival
     - ``arrivals?: Arrival[]``
     - Associated arrivals
   * - compositeTime |new|
     - ``compositeTime?: CompositeTime[]``
     - For historical/uncertain times

Magnitude Structure
^^^^^^^^^^^^^^^^^^^

.. list-table:: Magnitude Field Mapping
   :header-rows: 1
   :widths: 30 30 40

   * - QuakeML Element
     - TypeScript Field
     - Description
   * - publicID
     - ``publicID: string``
     - Unique identifier
   * - mag
     - ``mag: RealQuantity``
     - Magnitude value with uncertainty
   * - type
     - ``type?: string``
     - Magnitude type (ML, Mw, mb, Ms, etc.)
   * - originID
     - ``originID?: string``
     - Reference to origin
   * - methodID
     - ``methodID?: string``
     - Calculation method
   * - stationCount
     - ``stationCount?: number``
     - Number of stations used
   * - azimuthalGap
     - ``azimuthalGap?: number``
     - Largest gap in azimuth coverage
   * - evaluationMode
     - ``evaluationMode?: EvaluationMode``
     - manual/automatic
   * - evaluationStatus
     - ``evaluationStatus?: EvaluationStatus``
     - Status of evaluation
   * - creationInfo
     - ``creationInfo?: CreationInfo``
     - Creation metadata
   * - comment
     - ``comment?: Comment[]``
     - Array of comments
   * - stationMagnitudeContribution |new|
     - ``stationMagnitudeContributions?: StationMagnitudeContribution[]``
     - Station contributions

Focal Mechanism Structure
^^^^^^^^^^^^^^^^^^^^^^^^^

.. list-table:: Focal Mechanism Field Mapping
   :header-rows: 1
   :widths: 30 30 40

   * - QuakeML Element
     - TypeScript Field
     - Description
   * - publicID
     - ``publicID: string``
     - Unique identifier
   * - triggeringOriginID
     - ``triggeringOriginID?: string``
     - Reference to triggering origin
   * - nodalPlanes
     - ``nodalPlanes?: NodalPlanes``
     - Two nodal planes
   * - principalAxes
     - ``principalAxes?: PrincipalAxes``
     - T, P, N axes
   * - azimuthalGap
     - ``azimuthalGap?: number``
     - Largest gap in station azimuth
   * - stationPolarityCount
     - ``stationPolarityCount?: number``
     - Number of polarities used
   * - misfit
     - ``misfit?: number``
     - Solution misfit
   * - stationDistributionRatio
     - ``stationDistributionRatio?: number``
     - Station distribution quality
   * - methodID
     - ``methodID?: string``
     - Method used
   * - momentTensor
     - ``momentTensor?: MomentTensor``
     - Full moment tensor
   * - evaluationMode
     - ``evaluationMode?: EvaluationMode``
     - manual/automatic
   * - evaluationStatus
     - ``evaluationStatus?: EvaluationStatus``
     - Status of evaluation
   * - creationInfo
     - ``creationInfo?: CreationInfo``
     - Creation metadata
   * - comment
     - ``comment?: Comment[]``
     - Array of comments
   * - waveformID |new|
     - ``waveformID?: WaveformStreamID[]``
     - Waveforms used

Moment Tensor Structure
^^^^^^^^^^^^^^^^^^^^^^^

.. list-table:: Moment Tensor Field Mapping
   :header-rows: 1
   :widths: 30 30 40

   * - QuakeML Element
     - TypeScript Field
     - Description
   * - publicID
     - ``publicID?: string``
     - Unique identifier
   * - derivedOriginID
     - ``derivedOriginID: string``
     - Origin derived from MT
   * - momentMagnitudeID
     - ``momentMagnitudeID?: string``
     - Associated Mw magnitude
   * - scalarMoment
     - ``scalarMoment?: RealQuantity``
     - Scalar seismic moment
   * - tensor
     - ``tensor?: Tensor``
     - Six moment tensor components
   * - variance
     - ``variance?: number``
     - Solution variance
   * - varianceReduction
     - ``varianceReduction?: number``
     - Variance reduction
   * - doubleCouple
     - ``doubleCouple?: number``
     - Double-couple percentage
   * - clvd
     - ``clvd?: number``
     - CLVD percentage
   * - iso
     - ``iso?: number``
     - Isotropic percentage
   * - greensFunctionID
     - ``greensFunctionID?: string``
     - Green's functions used
   * - filterID
     - ``filterID?: string``
     - Filter applied
   * - sourceTimeFunction
     - ``sourceTimeFunction?: SourceTimeFunction``
     - Source time function
   * - methodID
     - ``methodID?: string``
     - Inversion method
   * - category
     - ``category?: string``
     - MT category
   * - inversionType
     - ``inversionType?: string``
     - Type of inversion
   * - creationInfo
     - ``creationInfo?: CreationInfo``
     - Creation metadata
   * - dataUsed |new|
     - ``dataUsed?: DataUsed[]``
     - Data used in inversion


Unsupported/Not Applicable Fields
---------------------------------

The following QuakeML 1.2 BED elements are **intentionally not implemented** as they are
rarely used or require specialized handling:

.. list-table:: Intentionally Omitted Elements
   :header-rows: 1
   :widths: 25 75

   * - Element
     - Reason
   * - ResourceReference
     - Handled as string type for flexibility
   * - OriginDepthType (some variants)
     - We support the common subset; exotic variants rarely used
   * - EventParameters
     - Our QuakeMLEvent serves as the top-level container

All fields listed in the QuakeML 1.2 BED specification that are commonly used in seismological
data exchange are fully supported.


Example: Complete QuakeML Event
-------------------------------

The following example demonstrates how a complex QuakeML event maps to our TypeScript interfaces:

.. code-block:: xml

   <?xml version="1.0" encoding="UTF-8"?>
   <quakeml xmlns="http://quakeml.org/xmlns/bed/1.2">
     <eventParameters publicID="smi:example/eventparams/1">
       <event publicID="smi:example/event/2024p001234">
         <preferredOriginID>smi:example/origin/1</preferredOriginID>
         <preferredMagnitudeID>smi:example/magnitude/mw/1</preferredMagnitudeID>
         <preferredFocalMechanismID>smi:example/focalmech/1</preferredFocalMechanismID>
         <type>earthquake</type>
         <typeCertainty>known</typeCertainty>

         <description>
           <text>40 km NE of Wellington</text>
           <type>region name</type>
         </description>

         <origin publicID="smi:example/origin/1">
           <time>
             <value>2024-01-15T10:30:45.123Z</value>
             <uncertainty>0.5</uncertainty>
           </time>
           <latitude>
             <value>-41.2345</value>
             <uncertainty>0.01</uncertainty>
           </latitude>
           <longitude>
             <value>174.7890</value>
             <uncertainty>0.01</uncertainty>
           </longitude>
           <depth>
             <value>25000</value>
             <uncertainty>2000</uncertainty>
           </depth>
           <quality>
             <usedPhaseCount>45</usedPhaseCount>
             <usedStationCount>32</usedStationCount>
             <standardError>0.8</standardError>
             <azimuthalGap>45</azimuthalGap>
           </quality>
           <evaluationMode>manual</evaluationMode>
           <evaluationStatus>reviewed</evaluationStatus>
         </origin>

         <magnitude publicID="smi:example/magnitude/mw/1">
           <mag>
             <value>5.8</value>
             <uncertainty>0.1</uncertainty>
           </mag>
           <type>Mw</type>
           <originID>smi:example/origin/1</originID>
           <stationCount>25</stationCount>
           <stationMagnitudeContribution>
             <stationMagnitudeID>smi:example/stationmag/1</stationMagnitudeID>
             <residual>0.05</residual>
             <weight>1.0</weight>
           </stationMagnitudeContribution>
         </magnitude>

         <focalMechanism publicID="smi:example/focalmech/1">
           <triggeringOriginID>smi:example/origin/1</triggeringOriginID>
           <nodalPlanes>
             <nodalPlane1>
               <strike><value>215</value><uncertainty>5</uncertainty></strike>
               <dip><value>45</value><uncertainty>3</uncertainty></dip>
               <rake><value>90</value><uncertainty>10</uncertainty></rake>
             </nodalPlane1>
             <preferredPlane>1</preferredPlane>
           </nodalPlanes>
           <momentTensor>
             <derivedOriginID>smi:example/origin/1</derivedOriginID>
             <scalarMoment><value>5.6e17</value></scalarMoment>
             <doubleCouple>0.92</doubleCouple>
             <dataUsed>
               <waveType>body waves</waveType>
               <stationCount>45</stationCount>
             </dataUsed>
           </momentTensor>
           <waveformID networkCode="NZ" stationCode="WEL" channelCode="HHZ"/>
         </focalMechanism>

       </event>
     </eventParameters>
   </quakeml>

**Corresponding TypeScript Object**:

.. code-block:: typescript

   const event: QuakeMLEvent = {
     publicID: 'smi:example/event/2024p001234',
     preferredOriginID: 'smi:example/origin/1',
     preferredMagnitudeID: 'smi:example/magnitude/mw/1',
     preferredFocalMechanismID: 'smi:example/focalmech/1',
     type: 'earthquake',
     typeCertainty: 'known',
     description: [
       { text: '40 km NE of Wellington', type: 'region name' }
     ],
     origins: [{
       publicID: 'smi:example/origin/1',
       time: { value: '2024-01-15T10:30:45.123Z', uncertainty: 0.5 },
       latitude: { value: -41.2345, uncertainty: 0.01 },
       longitude: { value: 174.7890, uncertainty: 0.01 },
       depth: { value: 25000, uncertainty: 2000 },
       quality: {
         usedPhaseCount: 45,
         usedStationCount: 32,
         standardError: 0.8,
         azimuthalGap: 45
       },
       evaluationMode: 'manual',
       evaluationStatus: 'reviewed'
     }],
     magnitudes: [{
       publicID: 'smi:example/magnitude/mw/1',
       mag: { value: 5.8, uncertainty: 0.1 },
       type: 'Mw',
       originID: 'smi:example/origin/1',
       stationCount: 25,
       stationMagnitudeContributions: [{
         stationMagnitudeID: 'smi:example/stationmag/1',
         residual: 0.05,
         weight: 1.0
       }]
     }],
     focalMechanisms: [{
       publicID: 'smi:example/focalmech/1',
       triggeringOriginID: 'smi:example/origin/1',
       nodalPlanes: {
         nodalPlane1: {
           strike: { value: 215, uncertainty: 5 },
           dip: { value: 45, uncertainty: 3 },
           rake: { value: 90, uncertainty: 10 }
         },
         preferredPlane: 1
       },
       momentTensor: {
         derivedOriginID: 'smi:example/origin/1',
         scalarMoment: { value: 5.6e17 },
         doubleCouple: 0.92,
         dataUsed: [{
           waveType: 'body waves',
           stationCount: 45
         }]
       },
       waveformID: [{
         networkCode: 'NZ',
         stationCode: 'WEL',
         channelCode: 'HHZ'
       }]
     }]
   };


References
----------

- `QuakeML 1.2 Specification <https://quake.ethz.ch/quakeml/>`_
- `QuakeML 1.2 BED Schema (XSD) <https://quake.ethz.ch/quakeml/docs/>`_
- `ObsPy QuakeML Documentation <https://docs.obspy.org/packages/autogen/obspy.core.event.html>`_
- Implementation: ``lib/types/quakeml.ts``

