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
* **Automated Duplicate Detection:** Matches events across catalogues using time and epicentral distance, in windows that automatically widen for larger and deeper events. Magnitude is not itself a matching criterion; it only breaks ties between equally-close candidates.
* **Complete Provenance:** Tracks the source of every event in the merged result.
* **Configurable Thresholds:** Adjust matching parameters for different data types.

The platform also applies underlying algorithm improvements. Some run for **every strategy**, others are specific to the Average strategy:

* **Date Line Normalisation** *(all strategies)*: Spatial matching near ±180° uses unit-vector averaging to avoid arithmetic errors in the Pacific region.
* **Validation Gates** *(all strategies)*: Rejects physically inconsistent duplicate groups before any strategy is applied (e.g., an M4.0 matched against an M7.0, or a group spanning > 200 km).
* **Magnitude Type Preference** *(Average strategy)*: Selects (never averages) a magnitude by a size-dependent type preference — Mw always leads; below M6.2 (the group's median Mw-equivalent) the order is ML > mb/mB/mbLg > Ms > Md, and from M6.2 up it is Ms > mB > ML > mb > Md — which avoids saturation errors from mixing incompatible scales. Other strategies keep the winning event's existing magnitude unchanged.
* **Depth Uncertainty Selection** *(Average strategy)*: Selects the depth from the best-constrained report that solved for depth (a fixed or operator-assigned depth is used only when no free depth exists), rather than a simple mean. Other strategies inherit depth directly from the winning event.

Merge Process Overview
======================

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart TD
       subgraph Inputs ["Input Catalogues"]
           A[("Catalogue A")]
           B[("Catalogue B")]
           C[("Catalogue C")]
       end

       Combine[/"Combine all events"/]
       Detect{"Duplicate?<br/>time + location (adaptive)"}
       Resolve[/"Resolve conflicts<br/>(apply selected merge strategy)"/]
       Result[("Merged catalogue<br/>unique events with provenance")]

       A & B & C --> Combine
       Combine --> Detect
       Detect -->|"yes"| Resolve
       Detect -->|"no, keep as unique"| Result
       Resolve --> Result

       style Inputs fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

       class A,B,C,Result datastore
       class Combine,Resolve process
       class Detect decision

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF


--------------------------
Understanding Duplicates
--------------------------

What Makes Events Duplicates?
=============================

Two events are considered candidate duplicates if they likely represent the
same earthquake recorded in different catalogues. The platform tests two
criteria, with default thresholds and association logic based on
international standards for global and regional earthquake association
(Storchak et al., 2013; Benz et al., 2019):

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
     - ≤ 10 km
     - Locations vary based on velocity models and data

**Both criteria must be met**, and both thresholds automatically widen for
larger and deeper events (see :ref:`Step 3 <configure-matching-rules>`
below). Magnitude is **not** a matching criterion — a candidate pair is
accepted or rejected on time and distance alone. Magnitude is used in two
other ways only:

* **Tie-breaking:** when a report could pair with more than one equally
  close candidate, the pairing with the closer magnitude (converted to a
  common Mw scale where possible) is preferred.
* **Group consistency, after matching:** once a group of matched reports is
  formed, its magnitudes must agree within a tolerance that scales with the
  group's mean magnitude (0.5 below M4.0, 0.8 below M5.5, 1.2 below M7.0,
  otherwise 1.5). A group that fails this check is split and re-associated
  rather than merged as-is.

There is no separate, user-configurable "magnitude difference" threshold.

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

   Time difference:    2 seconds   (within 60s adaptive window) ✓
   Distance:           1.4 km      (within 10km adaptive window) ✓
   Magnitude diff:     0.1         (informational only - not a matching test)

   Result: These are duplicates (same earthquake)

.. _merge-strategies:

----------------
Merge Strategies
----------------

Choose the strategy that best fits your use case:

Strategy Decision Guide
=======================

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart TD
       Start{"Do you want the<br/>best scientific result?"}
       Auth{"Do you have one<br/>authoritative source?"}
       Recent{"Different origin times,<br/>newer = more reliable?"}
       Matter{"Which matters more?"}

       Quality("Use Quality-Based<br/>(Recommended)")
       Priority("Use Priority-Based")
       Newest("Use Most Recent Solution")
       Complete("Use Most Complete")
       Average("Use Average Values")

       Start -->|"yes"| Quality
       Start -->|"no"| Auth
       Auth -->|"yes"| Priority
       Auth -->|"no"| Recent
       Recent -->|"yes"| Newest
       Recent -->|"no"| Matter
       Matter -->|"metadata completeness"| Complete
       Matter -->|"statistical accuracy"| Average

       class Start,Auth,Recent,Matter decision
       class Quality success
       class Priority,Newest,Complete,Average frontend

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF


Priority-Based Strategy
=======================

**How it works:**

Choose which report wins when the same event appears in more than one
catalogue:

* **GeoNet > Others** / **GNS > Others** — keeps the GeoNet report when the
  group has one. GeoNet is recognised by its agency code (e.g. ``WEL``) or
  the catalogue's own provider/import metadata, never by matching words in
  a catalogue's name.
* **Most Recent Solution** — keeps the solution whose origin the reporting
  agency computed last (see the Most Recent Solution strategy below).
* **Quality-Based** — keeps the best-constrained solution, comparing only
  the metrics every catalogue in the group reports (see the Quality Score
  strategy below).
* **Custom Order** — you rank the selected catalogues yourself; the record
  from the highest-ranked catalogue in a group wins.

Whenever the preferred agency/solution is not present in a group (or, for
Custom Order, when catalogues tie), the built-in network-authority ranking
decides instead (GeoNet, GCMT, ISC, USGS, then other agencies). Reports
that are equally authoritative (the same rank, or no ranking applies to
either) are then compared the same way the Quality-Based strategy compares
them: only the metrics every one of the tied reports states, never an
absolute score that would penalise a report for a field the others simply
didn't state.

This approach follows the principle of network authority, where local
networks are prioritized for regional events as recommended by Bondár &
Storchak (2011).

**Example (GeoNet > Others):**

.. code-block:: text

   GeoNet:   M4.5, depth 25 km, 42 phases
   USGS:     M4.6, depth 28 km, 15 phases

   Result: Keep GeoNet event (M4.5, depth 25 km, 42 phases)

**Best for:**

* Merging regional data with a trusted national catalogue
* When one source has consistently better quality
* Operational settings where one authority is preferred

**Considerations:**

* Simple and predictable
* May discard valid information from secondary sources
* Assumes the chosen agency, ordering, or ranking method is reliable for every event in the group

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart LR
       subgraph Inputs ["Duplicate Group"]
           E1[("USGS (M4.6)")]
           E2[("GeoNet (M4.5)")]
           E3[("ISC (M4.5)")]
       end

       subgraph Logic ["Priority Logic"]
           P1[/"1. GeoNet (Primary)"/]
           P2[/"2. ISC"/]
           P3[/"3. USGS"/]
       end

       Result("GeoNet event selected")

       E1 & E2 & E3 --> P1
       P1 --> P2 --> P3
       P1 -->|"highest priority wins"| Result

       style Inputs fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style Logic fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

       class E1,E2,E3 datastore
       class P1,P2,P3 process
       class Result success

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF

Average Values Strategy
=======================

**How it works:**

* **Location:** average every report's epicentre, weighted by inverse
  variance (1/σ²) when *every* report in the group states a horizontal
  uncertainty (a report twice as precise counts four times as much);
  otherwise every report is weighted equally rather than guessing an
  uncertainty for the ones that stated none
* **Magnitude:** selected, not averaged, by a size-dependent type
  preference — Mw first; below M6.2, ML ranks ahead of mb/mB/mbLg, then
  Ms, then Md; from M6.2 up, Ms leads, then mB, then ML, then mb, then Md;
  a magnitude an agency marked "rejected" is skipped
* **Depth:** taken from the best-constrained report that actually solved
  for depth (a fixed/operator-assigned depth is used only when no report
  in the group solved freely for depth)
* **Time:** the earliest reported origin time across the group
* Origin metadata that belongs to one agency's solution alone (agency,
  method, azimuthal gap, station/phase counts, RMS, time uncertainty,
  evaluation status) is **not** carried onto the averaged row — an
  averaged epicentre is not any single agency's solution. The one
  exception is depth: the published depth's own ``depth_type`` and
  ``depth_uncertainty`` *are* carried over, from the specific report the
  depth was selected from (never blended or reset), since the depth
  itself is a single report's value, not an average.

Statistical averaging and uncertainty propagation follow Bayesian 
principles for combining independent seismic observations (Schorlemmer 
et al., 2024).

**Example:**

.. code-block:: text

   Catalogue A: ML 4.5, depth 25 km (uncertainty 2 km)
   Catalogue B: mb 4.6, depth 28 km (uncertainty 8 km)
   Catalogue C: Mw 4.4, depth 24 km (uncertainty 1 km)

   Result: Mw 4.4 (Mw is preferred over mb/ML), depth 24 km (lowest reported uncertainty)

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
   * **Location**: Weighted average using inverse-variance (lower uncertainty = higher weight), or equal weights when any report states no uncertainty.
   * **Magnitude**: Selected by a size-dependent **type preference** (Mw first, then whichever remaining scale is best calibrated and unsaturated at that earthquake's size) rather than averaged, to avoid saturation errors.
   * **Depth**: Selects the depth from the **best-constrained report that solved for it**, not a simple mean.

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart TD
       subgraph Sources ["Input Duplicates"]
           S1[("Source A: M4.5, ±2km")]
           S2[("Source B: M4.7, ±10km")]
       end

       subgraph Processing ["Hybrid Averaging"]
           Loc[/"Location: weighted mean<br/>(Source A weighted 25x: inverse-variance 1/sigma^2)"/]
           Mag[/"Magnitude: hierarchy<br/>(prefers Mw over ML)"/]
           Dep[/"Depth: best uncertainty"/]
       end

       Result("Merged hybrid event")

       S1 & S2 --> Loc & Mag & Dep
       Loc & Mag & Dep --> Result

       style Sources fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style Processing fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

       class S1,S2 datastore
       class Loc,Mag,Dep process
       class Result success

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF

Most Recent Solution Strategy
=============================

**How it works:**

* Keep the solution whose origin the reporting agency computed *last*
  (QuakeML ``creationInfo``/``creationTime``, or else the record's creation
  and modification time) — not simply the latest origin (event) time, which
  says nothing about which analysis is newer
* When not every report in the group states a determination time,
  evaluation status decides instead (final/reviewed beats preliminary),
  then quality score
* A report its own agency marked "rejected" never wins while another
  report is available
* The platform's own upload time is never used

**Example:**

.. code-block:: text

   Event A: origin computed 2024-01-15 (automatic solution)
   Event B: origin computed 2024-01-20 (reviewed solution)

   Result: Keep Event B (its origin was computed later)

**Best for:**

* Incorporating revised/reprocessed data
* When recent analysis methods are preferred
* Updating catalogues with final solutions

**Considerations:**

* Assumes the most recently computed solution is the best one
* Relies on agencies reporting a determination/creation time
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
* **Azimuthal Gap (20 pts)**: Penalizes gaps > 180°; excellent if < 120°; zero points above 270°.
* **Location Precision (15 pts)**: Based on Standard Error / RMS residuals 
  (ISC standard: < 0.3s is excellent).
* **Magnitude Uncertainty (15 pts)**: Lower uncertainty yields higher scores.
* **Magnitude Type (15 pts)**: Rewards whichever type is best calibrated and
  unsaturated at the group's earthquake size — the same size-dependent
  preference the Average strategy uses to select a magnitude (Mw always
  leads; below M6.2, ML > mb/mB/mbLg > Ms > Md; from M6.2 up,
  Ms > mB > ML > mb > Md) — following the ISC-GEM approach to magnitude
  selection (Storchak et al., 2013).
* **Review Status (10 pts)**: "Reviewed" or "Final" status adds points over 
  "Preliminary" solutions.

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart TD
       subgraph Group ["Duplicate Candidates"]
           C1[("Event 1: 15 stations, Gap 210°")]
           C2[("Event 2: 45 stations, Gap 95°")]
       end

       Engine[["lib/quality-scoring.ts"]]
       S1[/"Event 1 score: 45/100"/]
       S2[/"Event 2 score: 88/100"/]
       Pick{"Highest score?"}
       Winner("Event 2 selected")

       C1 & C2 --> Engine
       Engine --> S1 & S2
       S1 & S2 --> Pick
       Pick -->|"88 > 45"| Winner

       style Group fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B

       class C1,C2 datastore
       class Engine library
       class S1,S2 process
       class Pick decision
       class Winner success

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF

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
3. **Focal Mechanism Selection**: The platform unites every focal mechanism
   reported by every source (by publicID) and selects the best one based on
   an authority hierarchy — GCMT > USGS/NEIC > GEOFON/GFZ > GeoNet > INGV,
   then any other moment-tensor solution, then a first-motion solution from
   at least 20 station polarities, then an automatic solution — with ties
   within a tier broken by variance reduction, then station polarity count,
   then misfit.

---------------------------
Advanced Quality Control
---------------------------

The platform performs several advanced validation checks during the merge 
process to prevent "over-matching" or physical inconsistencies:

* **Group Size Gate**: Prevents merging groups larger than 15 events, which 
  usually indicates a threshold setting that is too loose.
* **Spatial Spread Analysis**: For groups of 4 or more events, the platform
  calculates the spatial spread. If it exceeds the magnitude-scaled threshold
  (100 km for M < 5, 150 km for M 5–6, 200 km for M ≥ 6), the group is
  rejected and each event is kept as a separate unique event.
* **Same-Catalogue Mismatch**: If the same source *catalogue* would
  contribute two different reports to the same group, the platform treats
  them as likely distinct events (e.g., a foreshock/aftershock pair) and
  keeps them separate rather than merging them — one catalogue never
  contributes more than one report to a merged event.

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
* **Uncertainty-Weighted Locations**: When every report in a group states a
  horizontal location uncertainty, the platform weights the averaged
  location by **inverse variance** (1/σ², so a report twice as precise
  counts four times as much) — σ is taken from the report's error ellipse
  or circle where available, otherwise from its latitude/longitude
  uncertainties converted to kilometres (the larger of the two, using
  cos(latitude) for the longitude term). If any report in the group states
  no uncertainty, every report is weighted equally instead.
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

.. note::
   The same catalogue cannot be selected twice: a repeated catalogue can
   never pair with itself, so its events would just be written into the
   merge twice. The request is rejected (``400 Bad Request``) if a source
   catalogue is listed more than once.

.. _configure-matching-rules:

Step 3: Configure Matching Rules
================================

Set the two thresholds used for duplicate detection: a time window and a
distance threshold. There is no separate magnitude threshold — magnitude is
never a pairwise matching criterion (see *Understanding Duplicates* above).
Both thresholds are the values you enter *before* adaptive scaling: the
platform automatically widens them for larger and deeper events (Tanaka et
al., 2022), as larger earthquakes typically have larger location and timing
uncertainties in global reports (Benz et al., 2019). Specifically, your
configured values apply as-is below M4.0 and scale up by magnitude to 1.5×
(M4.0–5.5), 2× time / 2.5× distance (M5.5–7.0), and 3× time / 4× distance at
M7.0 and above; on top of that, distance gets a further 1.2× between 100 and
300 km depth, or 1.5× beyond 300 km.

**Time Window**

.. code-block:: text

   Default: ± 60 seconds

   Stricter: ± 30 seconds (fewer false matches)
   Looser:   ± 120 seconds (catch more duplicates)

**Distance Threshold**

.. code-block:: text

   Default: 10 km

   Stricter: 5 km (regional, well-located events)
   Looser:   25 km (global, poorly-located events)

**Threshold Guidelines:**

.. list-table::
   :header-rows: 1
   :widths: 30 35 35

   * - Scenario
     - Time
     - Distance
   * - High-quality regional
     - ± 30s
     - 5 km
   * - Standard national (default)
     - ± 60s
     - 10 km
   * - Global catalogues
     - ± 120s
     - 25 km
   * - Historical data
     - ± 180s
     - 50 km

Step 4: Choose Merge Strategy
=============================

Select your conflict resolution strategy:

* **Quality-Based (Recommended)** - Scores each duplicate event 0–100 and keeps the highest-scoring one (station count, azimuthal gap, RMS, magnitude uncertainty, magnitude type, review status); falls back to network authority when a report in the group states none of these metrics.
* **Priority-Based** - Choose GeoNet/GNS, Most Recent Solution, Quality-Based, or your own Custom Order to decide which report wins (see :ref:`merge-strategies` above).
* **Average Values** - Computes a weighted-average location, selects (does not average) the magnitude by type preference, and picks the depth from the best-constrained solution.
* **Most Recent Solution** - Keeps the solution whose origin was computed last.
* **Most Complete** - Keeps the event with the most populated fields.

.. note::
   Regardless of the strategy chosen, the platform always applies date line normalisation and validation gates. The magnitude type preference and depth-uncertainty selection described for the Average strategy are specific to it — every other strategy keeps the winning event's own magnitude and depth unchanged. The strategy controls *which event's core parameters win* when duplicates are resolved.

.. tip::
   Use **Quality-Based** for scientific work — it selects the most reliable origin automatically. Use **Priority-Based** when you have a single authoritative source (e.g., always prefer GeoNet for New Zealand events).

.. note::
   Magnitude scales are never rewritten in the published merged event — the
   magnitude shown is always one agency's own reported value, in its own
   reported type. Conversions to a common Mw scale, using the empirical
   relationships of Scordilis (2006) for mb and Ms, are used only
   internally: to check that a duplicate group's magnitudes are mutually
   consistent before merging, and to judge which magnitude type is best
   calibrated at that earthquake's size when the Average strategy selects a
   magnitude. ML has no calibrated conversion to Mw and is instead treated
   as approximately equal to Mw for these purposes.

Step 5: Configure Priority (if applicable)
==========================================

If Priority-Based is set to **Custom Order**, rank the selected catalogues
with the up/down buttons (the list starts in your catalogue-selection
order):

.. code-block:: text

   Catalogue ranking (highest priority first):
   1. GeoNet - New Zealand 2024
   2. Local Network Data
   3. USGS - Southwest Pacific

The record from the highest-ranked catalogue in a duplicate group wins; a
catalogue you have not ranked (or did not select) ranks after every ranked
one, and quality score breaks any remaining tie. The other Priority-Based
options (GeoNet/GNS, Most Recent Solution, Quality-Based) need no ranking.

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
2. Build spatial grid index for efficient geographic lookups
3. Find candidate duplicate pairs within the adaptive time and distance windows
4. Associate pairs one-to-one, closest match first (magnitude only breaks ties), and validate each group — a group that fails validation is split and its members re-offered
5. Resolve remaining conflicts using the selected strategy
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

* **merge_strategy:** How conflicts were resolved (``quality``, ``priority``, ``newest``, ``complete`` or ``average``)
* **merge_parameters:** The effective configuration used — thresholds, priority option, priority order (for Custom Order), and confirmation that adaptive windows were applied
* **source_catalogue_ids:** Every catalogue that contributed a report to this event
* **source_events:** One entry per contributing report, with its original data; the entry whose solution was published is flagged ``selected`` (no entry is flagged for an Average-strategy merge, since no single report's solution is published)
* **quality_score** / **quality_grade:** Computed from the published row at merge time

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

1. Begin with strict thresholds (30s, 5 km)
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
            (Strategy: Most Recent Solution)
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
2. Reduce distance threshold (try 5 km)
3. Review matched pairs for false positives

Too Few Duplicates Found
========================

**Symptoms:** Expected duplicates not matched

**Solutions:**

1. Loosen time window (try ± 120s)
2. Increase distance threshold (try 25 km)
3. Check for systematic time or location offsets

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
