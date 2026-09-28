=============
Visualization
=============

Explore interactive maps, charts, and advanced seismological visualizations for
comprehensive earthquake data analysis.

--------
Overview
--------

The Earthquake Catalogue Platform provides comprehensive visualization tools for
exploring and analyzing earthquake data:

* **Interactive Maps:** Leaflet-based maps with several colour/overlay modes and
  multiple base layers (there is no marker clustering: every plotted event is its
  own marker)
* **Uncertainty Visualization:** Error ellipses showing location confidence
* **Focal Mechanisms:** Beach ball diagrams for fault plane solutions
* **Station Coverage:** Network geometry and azimuthal gap display (no per-event
  station positions are stored, so this is shown as a colour mode and a detail
  card, not station markers on the map)
* **Statistical Charts:** Magnitude-frequency, depth, and temporal distributions
* **Quality Analytics:** Score distributions and filtering by quality grade

Accessing Visualizations
========================

* **Analytics Page** (``/analytics``): Full visualization dashboard
* **Catalogue View**: Click any catalogue, then "View on Map"
* **Event Details**: Click any event marker for detailed information

-----------------
Interactive Maps
-----------------

Basic Map View
==============

Navigate to **Analytics** or **Catalogues** → **View on Map**

**Features:**

* Pan and zoom controls
* Event markers sized by magnitude
* Colour-coded by depth by default; switch to magnitude, quality, azimuthal
  gap or source catalogue (see *Map Colour Modes* below)
* Click events for details
* NZ active fault traces, on by default on the Analytics page map

**Map Controls:**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Control
     - Action
   * - ``+`` / ``-`` buttons
     - Zoom in/out
   * - Click + Drag
     - Pan the map
   * - Scroll wheel
     - Zoom at cursor position
   * - Double-click
     - Zoom in at point
   * - Click marker
     - View event details popup

Map Colour Modes
=================

A **Color By** control switches what a marker's colour encodes. Every legend is
generated from the same function that colours the markers, so the legend can
never drift out of sync with the map. The Analytics page map
(``UnifiedEarthquakeMap``) offers all five modes below; the catalogue and
dashboard map (``EarthquakeCircleMap``) offers Depth (default), Quality,
Azimuthal Gap and Source Catalogue — it has no Magnitude colour mode, since
magnitude is always shown by marker size there.

**Depth** (default) — a cyan-to-dark-teal ramp:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Color
     - Depth Range
   * - Cyan
     - < 15 km
   * - Teal (light)
     - 15-40 km
   * - Teal (medium)
     - 40-100 km
   * - Teal (dark)
     - 100-200 km
   * - Teal (darkest / navy)
     - ≥ 200 km
   * - Grey
     - Unknown depth

Standard hypocentral depth classes (ISC/USGS usage) are shallow < 70 km,
intermediate 70-300 km, deep ≥ 300 km — a different grouping from the colour
bands above, which follow the GeoNet map palette rather than these classes.

**Quality** — coloured by the stored quality score (Q, 0-100), with band edges
aligned to the letter-grade thresholds so the map colour and an event's grade
badge never disagree:

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Color
     - Grade(s)
     - Score Range
   * - Green
     - A+ / A
     - ≥ 85
   * - Lime
     - B+
     - 75-84
   * - Yellow
     - B
     - 65-74
   * - Orange
     - C
     - 45-64
   * - Red
     - D / F
     - < 45

**Azimuthal Gap** — a continuous ramp, not discrete bands: green (small gap,
well constrained) through yellow to red as the gap widens to 180°, then the
ramp continues past red into magenta and violet hues beyond 180° so poorly
constrained events stand out rather than blending into the same red as a
175° gap. An event with no reported gap is grey.

**Source Catalogue** — a categorical palette, one colour per contributing
catalogue. For a merged event the colour follows whichever source's solution
was actually published (the ``source_events`` member marked *selected*); if
none is marked selected (an *average*-strategy merge), every contributing
catalogue shares one "Merged (N sources)" category rather than guessing a
single contributor. A pooled multi-catalogue view (e.g. the Analytics page
loading several catalogues at once) colours each event by its own catalogue.

**Magnitude** (Analytics page map only) — every marker uses one uniform
colour; magnitude is encoded by size only.

**Marker Size:**

Markers use a stepped pixel radius keyed to the floor of the magnitude, not a
logarithmic scale: 8 px, 12 px, 20 px and 24 px diameters at M2, M4, M6 and
M7+ respectively (the size stops growing above M7).

Overlays (Analytics Page Map)
==============================

An **Overlays** panel offers two toggles, both **off by default**:

* **Uncertainty Ellipses** — draws each plotted event's horizontal location
  uncertainty, preferring (in order) the agency's reported QuakeML
  ``OriginUncertainty`` error ellipse, then the circular
  ``horizontal_uncertainty`` field, then the larger of the latitude/longitude
  uncertainty marginals converted to kilometres at the event's latitude. When
  the ellipse has semi-axes but no reported azimuth, it is drawn as a circle
  of the semi-major axis rather than guessing an orientation. Hovering an
  ellipse shows "*N*\ % confidence ellipse" when the origin's QuakeML
  confidence level is recorded, otherwise a note that the agency's confidence
  level was not recorded.
* **Focal Mechanisms** — draws a lower-hemisphere SVG beach-ball icon for
  each plotted event with a resolvable nodal plane, preferring the event's
  ``preferred_focal_mechanism_id``.

Both overlays act only on the events currently plotted (the spatially sampled
set shown at the current view) and are capped at the **150** largest-magnitude
events; when more than 150 qualifying events are plotted, a badge reads
"Showing … for the 150 largest of *N* plotted events …".

A separate **NZ Active Faults** toggle (on by default) draws known active
fault traces near the map view from local fault data, alongside a "Nearby
Faults" panel.

There is no "Show Stations" toggle: the platform does not store per-event
station coordinates, so station positions cannot be drawn on the map. Use the
**Azimuthal Gap** colour mode for the data-backed view of network coverage, or
open an event's detail panel for its station-coverage card (station count,
gap, distances).

Uncertainty Visualization
==========================

Location uncertainty is drawn as an ellipse (or circle) around each event.
The source is the best available of, in order: the agency's reported QuakeML
``OriginUncertainty`` error ellipse; the circular ``horizontal_uncertainty``
field; or the larger of the latitude/longitude uncertainty marginals,
converted to kilometres at the event's latitude. When axes are reported
without an azimuth, the shape drawn is a circle of the semi-major axis.

* **Ellipses:** Horizontal uncertainty (latitude/longitude)
* **Color coding:** A network-geometry heuristic derived from the azimuthal
  gap (green ≥ 0.9, yellow ≥ 0.7, orange ≥ 0.5, red below) — **not** the
  event's quality grade and not a statistical confidence level
* **Size:** Proportional to the uncertainty magnitude
* **Confidence label:** hovering an ellipse shows the confidence level
  QuakeML records for it (e.g. "68% confidence ellipse") when present,
  otherwise a note that the agency's confidence level was not recorded

**Interpretation:**

* Small ellipse = precise location
* Large ellipse = uncertain location
* Circular = equal uncertainty in all directions
* Elongated = directional uncertainty

Focal Mechanisms
================

Beach ball diagrams (lower-hemisphere, SVG) show:

* Fault plane (nodal plane) orientation and slip direction
* Faulting style, classified from the P/T/B axis plunges (Zoback, 1992 World
  Stress Map regimes): **normal**, **oblique-normal**, **strike-slip**,
  **oblique-reverse** or **reverse**; mechanisms the WSM scheme does not
  classify are labelled **oblique**

**Colors:**

* Blue, shaded quadrants: compressional (first motion up); contain the
  **T** (tension) axis
* Unshaded quadrants (background colour): dilatational (first motion down);
  contain the **P** (pressure) axis

When a merged event carries reports from more than one agency, the mechanism
shown follows this preference order: GCMT > USGS/NEIC > GEOFON > GeoNet >
INGV > other moment-tensor solution > first-motion solution with 20 or more
polarities > automatic solution.

Station Coverage
================

The platform does not store per-event station coordinates, so no station
markers or station-to-event lines are drawn on the map. Network geometry is
shown two other ways:

* **Azimuthal Gap colour mode:** a continuous green (small gap) → yellow →
  red ramp up to 180°, continuing into magenta/violet beyond 180° so poorly
  constrained events stand out; events with no reported gap are grey
* **Station coverage card:** an event's detail panel reports its station
  count, azimuthal gap and station distances as a per-event widget, not a
  map overlay

**Quality indicators:**

* Good coverage: small azimuthal gap (ramp stays green/yellow)
* Poor coverage: large azimuthal gap, especially beyond 180°

-----------------
Charts and Graphs
-----------------

Magnitude-Frequency Distribution
================================

Gutenberg-Richter plot showing:

* Event counts by magnitude
* b-value calculation
* Completeness magnitude (Mc)

The G-R tab shows the Mc settings (see *Completeness Magnitude* below) only
when the magnitude filter has no lower bound. Once a lower bound is set, the
tab uses it as an explicit cut-off instead and states that the Mc settings
no longer apply. A magnitude-type table above the tabs (see *Filtering
Data*) shows the type mix behind the fit, since mixing magnitude scales
(including GeoNet's bare ``"M"``, its own type family) biases both the
b-value and Mc.

**Interpretation:**

* b-value ≈ 1.0: Normal seismicity
* b-value > 1.0: More small events (aftershocks, swarms)
* b-value < 1.0: More large events (unusual)

Depth Distribution
==================

Histogram of event depths:

* Identify depth clusters
* Distinguish shallow vs. deep seismicity
* Detect subduction zone signatures

Temporal Patterns
=================

The Temporal tab (hidden when several catalogues are pooled together) has
four panels, all sharing a **Time bins** control: **Auto** (daily bins up to
a year of analysed data, weekly beyond that), **Day (UTC)**, **Week (ISO,
Monday-Sunday)** or **Month (calendar, UTC)**.

* **Seismicity Rate** -- counts events at or above a threshold per bin, over
  bins spanning the first to the last analysed UTC day (empty bins count as
  zero). The threshold is the magnitude filter's lower bound when one is
  set, otherwise the estimated Mc under the current Mc settings. With fewer
  than 50 analysed events (too few to estimate Mc) every event is counted
  instead, with a note that the rate then also tracks changes in detection
  rather than only in seismicity. A partial first or last bin is drawn
  scaled up to a full bin (count × bin length ÷ days actually covered),
  shown dashed with a hollow marker; its tooltip gives the raw count and the
  number of days covered. Series are labelled by threshold and bin, e.g.
  "Events ≥ M2.3 per week".
* **Cumulative Event Time Series** -- running total of analysed events over
  time.
* **Magnitude vs Time** -- magnitude plotted against origin time on a UTC
  axis, with a dashed reference line labelled "Mc = x" or "Cut-off M x".
  Above 3,000 analysed events the plot is sampled rather than drawn in full:
  the largest events by magnitude fill a tenth of the point budget, and the
  rest are spread with an even stride through time.
* **Cumulative Moment/Energy Release** -- titled "Cumulative Seismic Moment
  Release" or "Cumulative Radiated Energy Release" depending on a
  **Quantity** menu (Seismic moment, N·m / Radiated energy, J). Values are
  summed per bin and accumulated over every analysed event, independent of
  the Seismicity Rate threshold. See *Seismic Moment* and *Energy Release*
  below for the formulas and which magnitude types are included.

The **Daily Rate**/**Monthly Rate** summary cards elsewhere on the page
count all analysed magnitudes (they are not limited by the Seismicity Rate
threshold above). A separate Timeline view keeps simple automatic binning
(up to 365 points); the Auto/Day/Week/Month control described here belongs
to the Temporal tab specifically.

Quality Score Distribution
==========================

Bar chart showing event counts by quality grade:

.. code-block:: text

   A+  ████████████ 450 events
   A   ██████████ 380 events
   B+  ████████ 290 events
   B   ██████ 210 events
   C   ████ 150 events
   D   ██ 80 events
   F   █ 40 events

-----------------------
Seismological Analytics
-----------------------

b-value Analysis
================

Gutenberg-Richter b-value calculation:

.. math::

   \log_{10} N = a - b \cdot M

Where:

* N = number of events ≥ magnitude M
* b = b-value (typically ~1.0)
* a = productivity parameter

Completeness Magnitude
======================

The **Mc method** control (Mc tab, and the G-R tab when its magnitude
filter has no lower bound) offers:

* **Maximum curvature (MAXC)** -- the default. Mc is the lower edge of the
  fullest 0.1-magnitude bin of the non-cumulative frequency-magnitude
  distribution (the lowest such bin on a tie), plus a **MAXC correction**
  chosen from a menu of +0.0 to +0.5 in 0.1 steps (default **+0.2**). The
  same correction is applied when the goodness-of-fit test below falls back
  to MAXC.
* **Goodness-of-fit test (GFT, 95% / 90%)** -- following Wiemer & Wyss
  (2000) and Woessner & Wiemer (2005). Every 0.1-magnitude bin edge Mi
  (ascending) is a candidate once it has at least 10 events at or above it
  across at least 3 populated bins. For each candidate, b is fitted by
  Aki-Utsu maximum likelihood on events with M >= Mi, with the same
  reporting-resolution correction the b-value fit itself uses (half the
  rounding step for magnitudes rounded to a fixed step, zero for
  full-precision magnitudes); a = log10 N(>= Mi) + b * Mi; the predicted
  cumulative count at every bin edge Mj >= Mi is Sj = N(>= Mi) *
  10^(-b(Mj-Mi)), compared against the observed cumulative count Bj = N(>=
  Mj). The goodness of fit is R = 100 - 100 * sum(|Bj - Sj|) / sum(Bj); Mc
  is the lowest Mi reaching R >= 95%, else the lowest reaching R >= 90%.
  If no candidate reaches even 90%, Mc falls back to MAXC + the same
  correction, with the message "No cut-off reached a 90% goodness of fit,
  so Mc is maximum curvature + c".

Either method needs at least 50 analysed events to estimate Mc at all. The
result is shown as "M{mc} +/- 0.1" with one of three explanations
("Estimated by maximum curvature + c" / "...the goodness-of-fit test at the
95%/90% level" / "...maximum curvature + c (the goodness-of-fit test
reached no 90% fit)"), each ending with the reminder that the +/- one bin
width shown is only a lower bound on the true uncertainty. The Mc tab's
method card names the method used ("MAXC" or "GFT (95%)"/"GFT (90%)") with
its R value, and a request for GFT adds a "Goodness-of-Fit Test" chart
plotting R against every candidate cut-off, with the 95%/90% reference
lines and the chosen Mc marked.

.. note::
   ZMAP's classic implementation of this test differs in its search range
   and event floor (it scans MAXC -0.9 to +1.5 and needs 25 events per
   candidate rather than 10); results are not directly comparable between
   the two tools.

Seismic Moment
==============

Calculate total seismic moment:

.. math::

   M_0 = 10^{(1.5 \cdot M_w + 9.1)}

Where M_w is moment magnitude, in N*m.

**Eligibility** (also governs the Temporal tab's cumulative-moment series):
Mw magnitudes are summed exactly as reported. ML, GeoNet's bare ``"M"`` type
and untyped magnitudes are treated as approximately Mw and included. mb/mB,
Ms, Md and any other stated magnitude type are excluded, since they are not
on a moment-equivalent scale without a type-specific conversion this
platform does not apply. The count of included and excluded events is shown
alongside the total.

Energy Release
==============

Estimate radiated seismic energy:

.. math::

   \log_{10} E = 1.5 \cdot M + 4.8

E is in joules, using the same magnitude-eligibility rule as *Seismic
Moment* above. For an eligible (Mw-equivalent) magnitude, E and M0 are
related by E = M0 / (2x10^4), so the energy curve is always the moment
curve scaled by 5x10^-5 -- the two are not independent estimates.

Cluster Detection
=================

Temporal (aftershock sequences) and spatial (swarm) clustering are visible
directly in the Temporal Patterns and map views above. Formal declustering
(Gardner & Knopoff, 1974) is available as an **export-time option**, not an
interactive on-page detection tool: the catalogue page's export menu has an
"Include Gardner-Knopoff declustering tags" checkbox (off by default, see
:doc:`exporting-data`) that adds a ``ClusterID`` (the mainshock's event id,
or none for an independent event) and ``IsMainshock`` flag to the exported
rows. There is currently no way to write a declustered partition back into
the platform as its own catalogue -- declustering only annotates an export.

--------------
Filtering Data
--------------

The Analytics page's **Filters** card applies to every tab except the raw
Events list, and shows a scope note on each tab stating how many of the
loaded events survived the active filters, e.g. "Computed from 3 of 9
loaded events (filters: Q >= 50; 4 agency-flagged records excluded)."

**Magnitude Range:**

.. code-block:: text

   Min: 3.0, Max: 8.0

**Depth Range:**

.. code-block:: text

   Min: 0 km, Max: 40 km

**Time Range:**

.. code-block:: text

   Start: 2024-01-01
   End: 2024-12-31

**Minimum quality:**

A slider, 0-100 in steps of 5, labelled "Q >= n (grade X or better)". It
reads the event's stored quality score, or computes one on the fly for
older rows that predate the stored field.

.. code-block:: text

   Minimum quality: Q >= 65 (grade B or better)

**Azimuthal gap:**

A slider, 0-360 degrees in steps of 10, labelled "Azimuthal gap <= n°" and
applying the same rule the server-side event filter uses: events are kept
only while their gap is between 0 and the chosen value inclusive. Setting
this filter excludes every event with no reported azimuthal gap (there is
no "unknown" allowance once the filter is active). The published bias
guidance's "< 180°" threshold corresponds to roughly "<= 170°" in this UI's
step size.

.. code-block:: text

   Azimuthal gap: <= 180 deg

**Magnitude types:**

One checkbox per magnitude type actually present in the loaded events, each
labelled with its event count; leaving every box unticked keeps all types
(it is not an "exclude everything" state). A magnitude-type table sits
above the tabs at all times, listing each type's event count and share of
the total, largest type first -- described as "the G-R and Mc fit sample"
on the G-R and Mc tabs, and as "the filtered events" everywhere else. Use
it alongside the type checkboxes to catch a mixed-scale catalogue before
reading too much into a single b-value or Mc.

**Include agency-flagged records:**

Off by default. A "flagged" record is one whose raw agency event type
(``source_event_type``, case-insensitively) is ``duplicate``, ``not
existing`` or ``not locatable``, or whose normalised ``event_type`` is
"not existing". Turning this on includes them in the map, charts and every
analysis below; leaving it off excludes them and shows how many were
excluded, e.g. "Include agency-flagged records (12)".

**Geographic Bounds:**

Draw a bounding box on the map or enter coordinates.

----------------
Map Base Layers
----------------

Switch between different base maps:

* **OpenStreetMap:** Default, detailed street and terrain
* **Satellite:** Aerial/satellite imagery
* **Terrain:** Topographic with elevation shading
* **Dark:** Dark theme for presentations

Access via the layer control icon in the top-right corner of the map.

-----------------------
Export Visualizations
-----------------------

Save your visualizations for reports and presentations:

**Map Export:**

* Use browser screenshot (Print Screen or browser extension)
* Enable "Hide UI" toggle for clean capture

**Chart Export:**

* Click the download icon on each chart
* Available formats: PNG, SVG
* SVG recommended for publications (scalable)

**Data Export:**

* Apply filters to select events
* Click "Export Filtered Data"
* Choose format: CSV, QuakeML, JSON, GeoJSON

See :doc:`exporting-data` for complete export options.

-----------------
Best Practices
-----------------

Effective Visualization
=======================

1. **Start zoomed out:** Get the big picture first
2. **Apply magnitude filter:** Reduce clutter for dense catalogues
3. **Use quality filters:** Focus on well-located events for analysis
4. **Toggle features:** Turn on uncertainty ellipses for location studies

Presentation Tips
=================

* Use dark base layer for contrast
* Filter to show only relevant events
* Export charts as SVG for publications
* Include scale bar in map screenshots

----------
Next Steps
----------

* :doc:`quality-assessment` - Understand quality metrics
* :doc:`exporting-data` - Export visualization data
* :doc:`../api-reference/index` - API for custom visualizations

.. seealso::

   * :doc:`../glossary` - Seismological terminology
   * :doc:`quality-assessment` - Quality grade definitions

