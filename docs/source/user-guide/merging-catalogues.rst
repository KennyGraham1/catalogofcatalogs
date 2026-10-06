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

The platform also applies underlying algorithm improvements. Some run for **every strategy**, others are specific to the Average and Median strategies:

* **Date Line Normalisation** *(all strategies)*: Spatial matching near ±180° uses unit-vector averaging to avoid arithmetic errors in the Pacific region.
* **Validation Gates** *(all strategies)*: Rejects physically inconsistent duplicate groups before any strategy is applied (e.g., an M4.0 matched against an M7.0, or a group spanning > 200 km).
* **Magnitude Type Preference** *(Average and Median strategies)*: Selects (never averages) a magnitude by a size-dependent type preference — Mw always leads; below M6.2 (the group's median Mw-equivalent) the order is ML > mb/mB/mbLg > Ms > Md, and from M6.2 up it is Ms > mB > ML > mb > Md — which avoids saturation errors from mixing incompatible scales. Other strategies keep the winning event's existing magnitude unchanged unless a magnitude rule says otherwise (see :ref:`per-field-rules`).
* **Depth Uncertainty Selection** *(Average and Median strategies)*: Selects the depth from the best-constrained entry that solved for depth (a fixed or operator-assigned depth is used only when no free depth exists), rather than a simple mean. Other strategies inherit depth directly from the winning event unless a depth rule says otherwise (see :ref:`per-field-rules`).
* **Same-Agency Supersession** *(all strategies)*: When two catalogues carry the same agency's solution for one event (the same agency event identifier), only the most recently computed vintage takes part in the merge; the older one is kept as provenance only. Two events from one agency with *different* identifiers are never merged (see :ref:`same-agency-reports`).
* **Review Holds** *(all strategies)*: Groups the preview flags as suspicious can be held for a reviewer's decision instead of being resolved silently (see :ref:`review-holds`).

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

* **Tie-breaking:** when an entry could pair with more than one equally
  close candidate, the pairing with the closer magnitude (converted to a
  common Mw scale where possible) is preferred.
* **Group consistency, after matching:** once a group of matched entries is
  formed, its magnitudes and depths must agree. A group that fails is split
  and re-associated rather than merged as-is (see *Consistency checks* below).

.. _consistency-checks:

Consistency checks
==================

**Magnitude.** The base tolerance T scales with the group's mean magnitude:
0.5 below M4.0, 0.8 below M5.5, 1.2 below M7.0, otherwise 1.5. Two agencies'
magnitudes for one earthquake routinely differ by 0.2–0.3 (one standard
deviation: different station sets, attenuation corrections and ML
definitions), so a fixed 0.5 would split genuine pairs. The tolerance is
therefore widened, by the uncertainties, to

.. math::

   T^{*} = \min\left\{2T,\; \max\left[T,\; 3\sqrt{\sigma_1^2 + \sigma_2^2 + 0.2^2}\right]\right\}

where σ₁ and σ₂ are the entries' reported magnitude uncertainties (0 when
not reported) and 0.2 is the scatter between agencies that no reported
uncertainty describes. The widening applies only when the two solutions agree
closely in time and place — together within a fifth of their matching windows
(for 60 s and 50 km: 12 s at the same epicentre, or 10 km at the same time), and
within three combined standard deviations where both report time and location
uncertainties — and only when the pairing was uncontested. The fifth is a fixed
share of the windows, not a multiple of the reported errors: it limits the
chance that a second earthquake lies as close, which depends on how dense the
seismicity is rather than on how well the solutions are located. In a dense
aftershock sequence, where a refused alternative was nearly as close,
magnitude is the main way to tell neighbours apart and the base tolerance T
applies. The cap of 2T guards against bulletins that report the scatter of
station magnitudes rather than the error of their mean. Magnitudes of
different scales are compared on the common Mw scale, with the conversion
uncertainty added; a raw comparison across scales that cannot be converted
always uses T.

**Depth.** A fixed or operator-assigned depth carries no depth information
and is not compared. Depths that were solved for must agree within the larger
of the depth tier (30 km above 70 km depth below M5, 50 km from M5; 50/100 km
to 300 km depth; 100/150 km deeper) and three times the combined reported
depth uncertainty.

On the platform's synthetic worked example, with known ground truth, these
checks raised the share of true duplicate pairs merged from 93.3 % to 99.0 %
while the share of merged pairs that were truly one earthquake rose from
97.9 % to 98.4 %. The widened magnitude tolerance admitted no false pairings.
When a group is accepted only because of the widening, or because a fixed
depth was left out of the comparison, the QC preview says so in a note that
does not flag the group.

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
       Robust{"Guard against one<br/>outlying entry?"}

       Quality("Use Quality-Based<br/>(Recommended)")
       Priority("Use Priority-Based")
       Newest("Use Most Recent Solution")
       Complete("Use Most Complete")
       Average("Use Average Values")
       Median("Use Median Values")

       Start -->|"yes"| Quality
       Start -->|"no"| Auth
       Auth -->|"yes"| Priority
       Auth -->|"no"| Recent
       Recent -->|"yes"| Newest
       Recent -->|"no"| Matter
       Matter -->|"metadata completeness"| Complete
       Matter -->|"statistical accuracy"| Robust
       Robust -->|"no, use stated uncertainties"| Average
       Robust -->|"yes"| Median

       class Start,Auth,Recent,Matter,Robust decision
       class Quality success
       class Priority,Newest,Complete,Average,Median frontend

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

Choose which entry wins when the same event appears in more than one
catalogue:

* **GeoNet > Others** / **GNS > Others** — keeps the GeoNet entry when the
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
Custom Order, when catalogues tie), the network-authority ranking decides
instead (by default GeoNet, GCMT, ISC, USGS, then other agencies; an
administrator can edit the table — see :ref:`network-authority`). Entries
that are equally authoritative (the same rank, or no ranking applies to
either) are then compared the same way the Quality-Based strategy compares
them: only the metrics every one of the tied entries states, never an
absolute score that would penalise an entry for a field the others simply
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

* **Location:** average every entry's epicentre, weighted by inverse
  variance (1/σ²) when *every* entry in the group states a horizontal
  uncertainty (an entry twice as precise counts four times as much);
  otherwise every entry is weighted equally rather than guessing an
  uncertainty for the ones that stated none
* **Magnitude:** selected, not averaged, by a size-dependent type
  preference — Mw first; below M6.2, ML ranks ahead of mb/mB/mbLg, then
  Ms, then Md; from M6.2 up, Ms leads, then mB, then ML, then mb, then Md;
  a magnitude an agency marked "rejected" is skipped
* **Depth:** taken from the best-constrained entry that actually solved
  for depth (a fixed/operator-assigned depth is used only when no entry
  in the group solved freely for depth)
* **Time:** the earliest reported origin time across the group
* Origin metadata that belongs to one agency's solution alone (agency,
  method, azimuthal gap, station/phase counts, RMS, time uncertainty,
  evaluation status) is **not** carried onto the averaged row — an
  averaged epicentre is not any single agency's solution. The one
  exception is depth: the published depth's own ``depth_type`` and
  ``depth_uncertainty`` *are* carried over, from the specific entry the
  depth was selected from (never blended or reset), since the depth
  itself is a single entry's value, not an average.

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
   * **Location**: Weighted average using inverse-variance (lower uncertainty = higher weight), or equal weights when any entry states no uncertainty.
   * **Magnitude**: Selected by a size-dependent **type preference** (Mw first, then whichever remaining scale is best calibrated and unsaturated at that earthquake's size) rather than averaged, to avoid saturation errors.
   * **Depth**: Selects the depth from the **best-constrained entry that solved for it**, not a simple mean.

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

Median Values Strategy
======================

**How it works:**

* **Location:** the component-wise median of every entry's latitude and of
  every entry's longitude (longitudes are first unwrapped around the date
  line, as the Average strategy does). Every entry counts equally — stated
  uncertainties are not used as weights.
* **Time:** the median of the reported origin times (for two entries, their
  mean)
* **Magnitude:** selected, not averaged, by the same size-dependent type
  preference as the Average strategy
* **Depth:** taken from the best-constrained entry that solved for depth,
  as the Average strategy does, together with that entry's own
  ``depth_type`` and ``depth_uncertainty``
* Origin metadata that belongs to one agency's solution alone is cleared,
  exactly as for the Average strategy; the published row's source is
  ``merged``, no entry is flagged ``selected`` and no location weights
  are recorded

**Example:**

.. code-block:: text

   Catalogue A: -41.500, 174.200
   Catalogue B: -41.510, 174.215
   Catalogue C: -41.780, 174.640   (an outlier)

   Result: -41.510, 174.215 (the median of each component; the outlier
   moves neither coordinate)

**Best for:**

* Three or more independent entries where one may be badly located
* A consensus epicentre that no single entry can dominate
* Groups whose entries state no usable horizontal uncertainty

**Considerations:**

* With only two entries the median is the equal-weight mean of the pair
* Ignores stated uncertainties entirely — a precise entry and a rough one
  count the same
* Like the Average strategy, the published epicentre is not any single
  agency's solution

Most Recent Solution Strategy
=============================

**How it works:**

* Keep the solution whose origin the reporting agency computed *last*
  (QuakeML ``creationInfo``/``creationTime``, or else the record's creation
  and modification time) — not simply the latest origin (event) time, which
  says nothing about which analysis is newer
* When not every entry in the group states a determination time,
  evaluation status decides instead (final/reviewed beats preliminary),
  then quality score
* An entry its own agency marked "rejected" never wins while another
  entry is available
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

.. _per-field-rules:

---------------
Per-field rules
---------------

The strategy decides whose *solution* — origin time, epicentre and the
origin's own metadata — is published. Three further fields can be resolved by
their own rule on top of whichever strategy you chose: **depth**,
**magnitude** and **focal mechanism**. In the merge request these are the
``config.fieldRules.depth``, ``config.fieldRules.magnitude`` and
``config.fieldRules.mechanism`` settings; leaving a rule unset keeps exactly
the strategy's own behaviour.

Depth rule
==========

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Rule
     - Published depth
   * - ``strategy`` (default)
     - What the strategy would publish anyway: the best-constrained entry's
       depth for Average and Median, otherwise the winning entry's own depth
   * - ``best-constrained``
     - The entry that solved freely for depth with the smallest reported
       uncertainty (a fixed depth only when no entry solved for depth)
   * - ``quality``
     - The depth of the entry ranked first by the quality score
   * - ``authority``
     - The depth of the entry ranked first by network authority
   * - ``newest``
     - The depth of the most recently computed solution (the Most Recent
       Solution ordering)
   * - ``catalogue``
     - The depth reported by the catalogue you name (``catalogueId``, which
       must be one of the merge's source catalogues)

Magnitude rule
==============

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Rule
     - Published magnitude
   * - ``strategy`` (default)
     - What the strategy would publish anyway: the type-preference selection
       for Average and Median, otherwise the winning entry's own magnitude
   * - ``type-preference``
     - The size-dependent magnitude type preference applied across every
       entry in the group (as the Average strategy does)
   * - ``quality`` / ``authority`` / ``newest`` / ``catalogue``
     - The entry chosen as for the depth rule of the same name; its own
       preferred magnitude is published — value, type, uncertainty and
       preferred magnitude ID together

Focal mechanism rule
====================

.. list-table::
   :header-rows: 1
   :widths: 22 78

   * - Rule
     - Published focal mechanisms
   * - ``hierarchy`` (default)
     - Every mechanism reported by every entry in the group is united, and
       the preferred one is chosen by the authority hierarchy described under
       *How Metadata is Merged* below
   * - ``strategy``
     - Only the winning entry's own mechanisms and its own preferred
       mechanism
   * - ``catalogue``
     - Only the mechanisms reported by the catalogue you name

Rules that apply to every field
===============================

* A rule that cannot be honoured falls back rather than failing: when the
  named catalogue has no entry in the group, or the chosen entry has no
  depth (or no focal mechanism), the depth and magnitude rules fall back to
  ``strategy`` and the mechanism rule to ``hierarchy``.
* Metadata always travels with the quantity it describes. A published depth
  carries its *own* ``depth_type`` and ``depth_uncertainty`` (from the
  entry's preferred QuakeML origin, in kilometres, or its
  ``depth_uncertainty`` column); a published magnitude carries its own
  metadata. One entry's metadata is never attached to another entry's
  value.
* An entry superseded by a newer vintage of the same agency's solution
  (see :ref:`same-agency-reports`) takes no part in any rule.
* The choice is recorded. In each merged event's ``source_events``, the
  entry whose depth was published is flagged ``depthSelected``, the entry
  whose magnitude was published ``magnitudeSelected``, and the entry whose
  focal mechanism was published ``mechanismSelected`` (one entry each, and
  only when one entry's value was chosen). The rules themselves are stored
  in ``merge_parameters.fieldRules``.

.. _review-holds:

------------------------------------------
Flagged groups: resolve or hold for review
------------------------------------------

The QC preview flags a matched group when it was salvaged from a larger
cluster that failed consistency validation, when its pairing was ambiguous
(another entry was nearly as close), or when its magnitudes or depths fail the
consistency checks (the group's warnings). Exactly the same test decides what
the merge writes, so the preview's counts equal the stored result.

An entry the windows matched but the validation split off is not a flagged
*merge* — it is published as its own event — but it is listed as **kept
apart**, with the reason the group failed (for example a magnitude
disagreement, or two different events of one agency). The preview counts these
entries separately (*N entries were matched but kept apart*), and its **Kept
apart** tab shows the parts of one split together on one card (*Published as
N separate events*), so a split is never mistaken for unrelated events. With
*hold*, kept-apart entries are held too; the only resolution for a
single-entry row is to keep it.

The ``config.onConflict`` setting chooses what happens to a flagged group:

* ``resolve`` (default) — the strategy resolves it like any other group.
* ``hold`` — the strategy still produces a merged row (a *provisional*
  solution, so that the event has coordinates and can be mapped), but the
  row is marked ``review_status: pending`` with the group's warnings stored
  in ``review_reasons``. Every other row has ``review_status: null``.

Reviewing held events
=====================

A merged catalogue's page shows a **Needs review (N)** tab or section
listing the pending events. Each entry shows the reasons it was held and a
table of the contributing catalogue entries — catalogue/source, time,
latitude, longitude, depth, magnitude and type, station count and azimuthal
gap — with the provisional ``selected`` entry marked and any superseded entry
greyed out (it cannot be published). Editors see two actions; viewers can inspect
the queue but not resolve it:

* **Publish this solution** — the chosen entry's solution is published
  wholesale: its time, epicentre, depth, magnitude and *all* of its own
  metadata, with focal mechanisms per the merge's mechanism rule. The
  ``source_events`` flags are rewritten so that this entry is ``selected``
  (and supplies the depth and magnitude), the quality score and grade are
  recomputed, and the event records ``review_choice: report:<index>``.
* **Keep provisional solution** — the row stays as the strategy produced it
  and records ``review_choice: keep``.

Either way the event becomes ``review_status: resolved`` with ``reviewed_by``
and ``reviewed_at`` set, and moves to the collapsed **Resolved** list. The
catalogue's version is bumped on every resolution: a **major** bump when the
published time, latitude, longitude, depth or magnitude changed, otherwise a
**patch** bump. The action is audit-logged as ``merge.review``.

Held events in exports
======================

CSV, JSON and GeoJSON lineage carries the review status (the ``ReviewStatus``
CSV column; ``reviewStatus`` in the JSON/GeoJSON lineage), empty for rows that
were never held. A QuakeML export adds a ``comment`` reading
``Merge review: pending — <reasons>`` to each event still awaiting review, and
nothing to any other event.

.. _same-agency-reports:

----------------------------
Entries from the same agency
----------------------------

One *catalogue* never contributes two entries to a merged event (see
*Same-Catalogue Mismatch* below). Two *different* catalogues can, however,
carry the same agency's solution — a GeoNet download from 2023 and another
from 2025, say, or a QuakeML file and an FDSN import of the same bulletin.
Before any strategy runs, the entries in a group are compared agency by
agency. The rule is deliberately conservative: an entry takes part only when
its catalogue is recognised as that agency's (from its provider, data source,
import source or name) and the entry's own origin author, if it states one,
is the same agency. An ISC bulletin row whose prime hypocentre was authored by
GeoNet is therefore not a GeoNet entry here, and rows of an earlier merge
never take part. Agency event identifiers (the QuakeML event ``publicID``, else
the source ID) are compared in their bare form: ``smi:nz.org.geonet/2024p100000``,
``2024p100000`` and a merge-qualified ``GeoNet:2024p100000`` are one identifier.

* **Equal identifiers → supersession.** The entries are vintages of one
  solution. The most recently computed one (the Most Recent Solution
  ordering) stays in play; every older vintage is flagged ``superseded`` in
  ``source_events`` and takes no part in selection, averaging, the quality
  ranking, the per-field rules or the validity checks (so a preliminary and a
  reviewed magnitude of one event are not split for disagreeing). Superseded
  entries are kept for provenance, and their catalogues still appear in
  ``source_catalogue_ids``.
* **Different identifiers of the same kind → split.** Two public IDs, or two
  source IDs, of one network namespace that differ are two different
  earthquakes (ComCat's ``us…`` and ``nc…`` IDs are different namespaces: one
  earthquake carries both, so they decide nothing). The group fails
  validation with the reason *Two different <agency> events in one group*;
  each entry the split leaves on its own is flagged *separated* with that
  reason.
* **No comparable identifiers → neither.** Both entries take part in the
  merge as independent entries, as they would from two agencies. An
  identifier this platform generated from a row ID (a re-imported export of a
  row that had no agency ID) is not an agency identifier.

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
3. **Focal Mechanism Selection**: By default the platform unites every focal
   mechanism reported by every source (by publicID) and selects the best one
   based on an authority hierarchy — GCMT > USGS/NEIC > GEOFON/GFZ > GeoNet
   > INGV, then any other moment-tensor solution, then a first-motion
   solution from at least 20 station polarities, then an automatic solution
   — with ties within a tier broken by variance reduction, then station
   polarity count, then misfit. The focal mechanism rule
   (:ref:`per-field-rules`) can restrict this to one entry's mechanisms.

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
* **Magnitude and Depth Consistency**: Every matched group must pass the
  :ref:`consistency-checks`: magnitudes within a tolerance widened by the
  reported uncertainties for closely agreeing, uncontested pairs; solved-for
  depths within the depth tier or three combined uncertainties (fixed depths
  are not compared). A failing group is split and its members re-offered.
* **Same-Catalogue Mismatch**: If the same source *catalogue* would
  contribute two different entries to the same group, the platform treats
  them as likely distinct events (e.g., a foreshock/aftershock pair) and
  keeps them separate rather than merging them — one catalogue never
  contributes more than one entry to a merged event. The same *agency*
  reported by two different catalogues is handled separately: see
  :ref:`same-agency-reports`.

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
* **Uncertainty-Weighted Locations**: When every entry in a group states a
  horizontal location uncertainty, the platform weights the averaged
  location by **inverse variance** (1/σ², so an entry twice as precise
  counts four times as much) — σ is taken from the entry's error ellipse
  or circle where available, otherwise from its latitude/longitude
  uncertainties converted to kilometres (the larger of the two, using
  cos(latitude) for the longitude term). If any entry in the group states
  no uncertainty, every entry is weighted equally instead.
* **Regional Authority Hierarchy**: The platform recognizes regional
  boundaries. By default it prioritizes GeoNet for events within New
  Zealand and JMA for events in Japan. This preference is supported by
  regional quality assessments that show local network superiority for
  inland and near-shore events (Warren-Smith et al., 2025). The table is
  editable — see :ref:`network-authority`.

.. _network-authority:

Network authority table
=======================

The network-authority ranking that the Priority-Based strategy falls back to,
that breaks ties in the Quality-Based strategy, and that the ``authority``
per-field rule uses, is a table of two parts:

* a **global hierarchy** — ordered entries, each with the name patterns that
  identify an agency (matched as lower-case words), a priority, an optional
  agency key, a description and an optional region; by default GeoNet, GCMT,
  ISC, USGS, then the other recognised agencies; and
* **regional overrides** — named regions with latitude/longitude bounds
  (a region may cross the date line) and their own ordered entries; by
  default New Zealand (GeoNet first) and Japan (JMA first).

An administrator can edit both parts in **Settings › Merge authority**:
change, add or remove hierarchy rows and regional overrides, **Save**, or
**Reset to defaults** to discard the custom table. Every signed-in user can
view the effective table. A merge reads the table once when it starts, and
each merged event records which one it used in ``merge_parameters.authority``:
``default`` for the built-in table, or ``custom@<timestamp>`` — the time the
custom table was last saved — so that a merge can be reproduced against the
same ranking.

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
uncertainties in global bulletins (Benz et al., 2019). Specifically, your
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

* **Quality-Based (Recommended)** - Scores each duplicate event 0–100 and keeps the highest-scoring one (station count, azimuthal gap, RMS, magnitude uncertainty, magnitude type, review status); falls back to network authority when an entry in the group states none of these metrics.
* **Priority-Based** - Choose GeoNet/GNS, Most Recent Solution, Quality-Based, or your own Custom Order to decide which entry wins (see :ref:`merge-strategies` above).
* **Average Values** - Computes a weighted-average location, selects (does not average) the magnitude by type preference, and picks the depth from the best-constrained solution.
* **Median Values** - Takes the component-wise median epicentre and median origin time, with magnitude and depth resolved as for Average Values (see :ref:`merge-strategies` above).
* **Most Recent Solution** - Keeps the solution whose origin was computed last.
* **Most Complete** - Keeps the event with the most populated fields.

Two further settings refine any strategy:

* **Per-field rules** for depth, magnitude and focal mechanism (see
  :ref:`per-field-rules`); each defaults to the strategy's own behaviour.
* **On conflict** — *Resolve with the strategy* (``resolve``, the default) or
  *Hold for review* (``hold``), which keeps flagged groups back for a reviewer
  (see :ref:`review-holds`).

.. note::
   Regardless of the strategy chosen, the platform always applies date line normalisation, validation gates and same-agency supersession. The magnitude type preference and depth-uncertainty selection described for the Average strategy are shared by the Median strategy — every other strategy keeps the winning event's own magnitude and depth unchanged unless a per-field rule overrides it. The strategy controls *which event's core parameters win* when duplicates are resolved.

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

Step 7: Review the QC Preview and Merge
=======================================

On the **Preview & Merge** step, click **Generate QC Preview**. The preview
runs the complete merge without writing anything and shows the merge QC
summary (see :ref:`merge-qc-summary`) above the matched groups. **Start
Merge** becomes available only once a preview exists for the current
selection and settings; changing either invalidates the preview, so a merge is
never committed unseen.

The groups are listed in three tabs:

* **Flagged** — groups that failed or only narrowly passed the checks (see
  *Flagged groups* below), with their warnings.
* **Kept apart** — entries the matching windows paired but the consistency
  checks split, one card per split (*Published as N separate events*) with
  the reason.
* **Matched** — the remaining matched groups, largest disagreement first;
  they can also be sorted by origin time, filtered by catalogue, and are
  shown 50 per page. For a large merge the preview lists every flagged and
  kept-apart group and the 2,000 matched groups with the largest
  disagreement; the summary covers every group.

Each group card lists its entries — catalogue, origin time (ISO 8601, UTC),
epicentre, depth and its uncertainty, magnitude and type, station count,
azimuthal gap, quality score Q and offset from the published solution — and
says which solution is published and why, for example *Published: Agency B
catalogue · highest quality score (Q 82 vs 64)*. **View on map** shows the
entries around the published solution. Groups are measured from the
published solution (or, for the Average and Median strategies, from the
computed epicentre); a group's disagreement is the largest offset of an entry
in units of its matching window.

**Processing steps** (the same for the preview and the merge):

1. Load events from all source catalogues
2. Build spatial grid index for efficient geographic lookups
3. Find candidate duplicate pairs within the adaptive time and distance windows
4. Associate pairs one-to-one, closest match first (magnitude only breaks ties), and apply the :ref:`consistency-checks` to each group — a group that fails (including two different events from one agency) is split and its members re-offered
5. Within each group, mark older vintages of the same agency's solution as superseded
6. Resolve remaining conflicts using the selected strategy and per-field rules; with *hold*, flagged groups are written as provisional solutions awaiting review
7. Record provenance for all events
8. Calculate quality scores for merged events
9. Compute the merge QC summary; a saved merge stores it with the catalogue, in the same database transaction as its events

.. _merge-qc-summary:

-----------------
Merge QC Summary
-----------------

Every merge produces a QC summary: in the preview, again after the merge is
written (for the merge actually performed), and permanently with the saved
catalogue, whose page shows it in a collapsible **Merge QC summary** card.
It can be downloaded as JSON (the whole summary) or as CSV (the flagged,
kept-apart and held groups, one row per entry: group, kinds, reasons,
published or not, catalogue, source ID, origin time, latitude, longitude,
depth, magnitude, magnitude type, quality score). The same files are served at
``GET /api/catalogues/{id}/merge-qc`` and ``?format=csv``. Catalogues merged
before the summary existed have none.

The summary records the merge settings, the source catalogues, the time and
the platform version, and:

* **Totals** — entries before, events after, matched groups, entries combined
  (kept as provenance of the event they joined, not deleted), flagged groups,
  kept-apart entries and splits, events held for review, and superseded
  entries.
* **Per catalogue** — entries, matched (with the share), only in this
  catalogue, published from it (matched groups whose published solution is
  this catalogue's entry), and superseded.
* **Per catalogue pair** — how the matched solutions differ, second catalogue
  minus first: origin time and depth as the median, the robust standard
  deviation (1.4826 × the median absolute deviation) and the 5th–95th
  percentile range; epicentral separation as the median, 90th and 95th
  percentiles and maximum; and magnitude, overall and for every
  magnitude-type pair with at least 10 pairs. Depth differences use only
  solved-for depths. A systematic magnitude offset between two agencies shows
  here, and the summary points it out when the median difference is at least
  0.1 over 30 or more pairs.
* **Window use** — matched pairs that used more than 80 % of their (adaptive)
  time or distance window. A large share means the result depends on the
  thresholds; try the preview with wider and narrower windows.
* **Listed groups** — the flagged, kept-apart and held groups with their
  reasons, most severe first, up to 5,000 groups (the total is stated).

-----------------
Source Tracking
-----------------

Provenance Metadata
===================

Every event in the merged catalogue includes:

* **merge_strategy:** How conflicts were resolved (``quality``, ``priority``, ``newest``, ``complete``, ``average`` or ``median``)
* **merge_parameters:** The effective configuration used — thresholds, priority option, priority order (for Custom Order), confirmation that adaptive windows were applied, the per-field rules (``fieldRules``, when given), the conflict setting (``onConflict``) and the network-authority table used (``authority``: ``default`` or ``custom@<timestamp>``)
* **source_catalogue_ids:** Every catalogue that contributed an entry to this event, superseded entries included
* **source_events:** One entry per contributing entry, with its original data and flags: ``selected`` on the entry whose solution was published (none for an Average- or Median-strategy merge, since no single entry's solution is published); ``depthSelected``, ``magnitudeSelected`` and ``mechanismSelected`` on the entries whose depth, magnitude or focal mechanism was published when one entry's was chosen; ``superseded`` on an older vintage of the same agency's solution; and ``locationWeight`` on each entry of an averaged epicentre
* **review_status**, **review_reasons**, **reviewed_by**, **reviewed_at**, **review_choice:** Present on every merged event; ``null`` unless the group was held for review (see :ref:`review-holds`)
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
* **Merge Strategies**: Verifies the correct behavior of the quality, priority, average, median, newest, and complete merge strategies.
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
