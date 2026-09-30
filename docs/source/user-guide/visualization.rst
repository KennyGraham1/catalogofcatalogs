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
* Colour-coded by depth by default; switch to quality, azimuthal gap or source
  catalogue (see *Map Colour Modes* below)
* Click events for details
* NZ active fault traces, on by default on the Analytics page map
* Colour mode, overlays and map detail live in one **Style** panel (top right,
  under the base-layer button); the legend card sits bottom right and collapses
  to a "Legend" chip; a scale bar and, when not every event is drawn, a
  "*N* of *M* events shown · zoom in for more" chip sit bottom left

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
   * - Point at marker
     - Show the event's summary card (see below)
   * - Click marker
     - View event details popup

Event Summary Card
==================

Pointing at an event shows a compact card in the form seismic observatories use:

* **Title** — where the event is, described against the nearest named place
  (for example "18 km east of Seddon"). Places are the cities, towns,
  villages, localities and islands of the LINZ New Zealand Gazetteer
  that the Gazetteer gives a map label level of 12 or better (about 480
  places, ``public/data/nz-localities.json``, built by
  ``scripts/build-nz-localities.mjs``). Distances are great-circle, directions
  are to the nearest of eight compass points, and the distance is rounded to
  the nearest kilometre below 20 km and to the nearest 5 km beyond. Within
  3 km the card says "Near *place*". Beyond 300 km from every place (or before
  the place list has loaded) the title falls back to the event's stored
  region, then to its epicentre.
* **Magnitude** with its type (e.g. ML 3.5), **depth** (marked "fixed" when
  the depth was held fixed), and the **epicentre**.
* **Azimuthal gap** with a judgement of how well the network surrounds the
  event: well constrained (≤ 90°), moderately constrained (≤ 180°) or poorly
  constrained (> 180°), coloured green, amber and orange.
* **Origin time** in UTC and, for events in the New Zealand region
  (28–53° S, 165° E–175° W), New Zealand local time with its date (NZST or
  NZDT). The two dates often differ.
* The agency's **event ID**.

Clicking the event opens the full record. While the place names are in use,
the map's attribution credits them: "Place names © LINZ (CC BY 4.0)".

Map Colour Modes
=================

A **Colour by** control in the map's Style panel switches what a marker's
colour encodes. Every legend is generated from the same function that colours
the markers, so the legend can never drift out of sync with the map. The
Analytics page map (``UnifiedEarthquakeMap``) and the catalogue and dashboard
map (``EarthquakeCircleMap``) offer the same four modes: Depth (default),
Quality, Azimuthal gap and Source catalogue. There is no Magnitude colour
mode: magnitude is always shown by marker size (a saved Analytics map state
that still names the old Magnitude mode opens in Depth).

**Depth** (default) — six classes sampled from the perceptually ordered,
colour-vision-deficiency-safe *plasma* scale: warm = shallow, dark = deep (the
seismological convention). The dark theme uses fills one step lighter so deep
events stay visible on the dark basemap. The legend draws the classes as a
discrete colour bar with the boundaries 0, 15, 40, 70, 150 and 300 km.

.. list-table::
   :header-rows: 1
   :widths: 30 20 20 30

   * - Depth Range
     - Light theme
     - Dark theme
     - Class
   * - < 15 km
     - ``#FCA636``
     - ``#FDB42F``
     - shallow
   * - 15-40 km
     - ``#E66C5C``
     - ``#F07F4F``
     - shallow
   * - 40-70 km
     - ``#C5407E``
     - ``#DB5C68``
     - shallow
   * - 70-150 km
     - ``#9C179E``
     - ``#B83289``
     - intermediate
   * - 150-300 km
     - ``#6A00A8``
     - ``#8B0AA5``
     - intermediate
   * - ≥ 300 km
     - ``#2A0593``
     - ``#5B02A3``
     - deep
   * - Unknown depth
     - ``#9CA3AF``
     - ``#6B7280``
     - –

The class boundaries at 70 and 300 km are the standard hypocentral depth
classes (ISC/USGS usage): shallow < 70 km, intermediate 70-300 km, deep ≥ 300 km.

**Quality** — coloured by the stored quality score (Q, 0-100), one colour per
letter grade so the map colour and an event's grade badge never disagree:

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Color
     - Grade(s)
     - Score Range
   * - Dark teal (``#0F766E``)
     - A+ / A
     - ≥ 85
   * - Teal (``#14B8A6``)
     - B+ / B
     - 65-84
   * - Yellow (``#EAB308``)
     - C
     - 45-64
   * - Orange (``#F97316``)
     - D
     - 35-44
   * - Red (``#DC2626``)
     - F
     - < 35

**Azimuthal Gap** — a continuous ramp, not discrete bands: teal at 0° (stations
all round the event) through pale amber at the 180° usability threshold to red
at 360°, interpolated in the perceptual OKLab space. The legend shows it as a
gradient bar with ticks at 0, 90, 180, 270 and 360°. An event with no reported
gap is grey.

**Source Catalogue** — the colour-vision-deficiency-safe Okabe–Ito palette,
one colour per contributing catalogue (assigned in alphabetical order of name,
from the map's whole event set so colours do not change as you pan; an event
with no catalogue information is grey). For a merged event the colour follows whichever source's solution
was actually published (the ``source_events`` member marked *selected*); if
none is marked selected (an *average*- or *median*-strategy merge), every contributing
catalogue shares one "Merged (N sources)" category rather than guessing a
single contributor. A pooled multi-catalogue view (e.g. the Analytics page
loading several catalogues at once) colours each event by its own catalogue.

**Marker Size:**

Marker radius grows exponentially with magnitude, ×1.5 per unit, so each
magnitude unit is clearly larger: r = 2.2 × 1.5\ :sup:`M−1` px, from 2.2 px
(M ≤ 1) to 28 px (about M7.3 and above) — M2 3.3 px, M3 5.0 px, M4 7.4 px,
M5 11.1 px, M6 16.7 px, M7 25 px. An event with no magnitude is drawn at 3 px.
The legend draws M2-M6 circles at exactly these radii. Larger events are
drawn on top.

Overlays
========

The **Overlays** section of the Style panel on the catalogue map, the
dashboard map, the merge-results map and the Analytics map has three switches.
The duplicate-group map on the merge page and the region selector offer the
**Active faults** switch alone, off by default.


* **Active faults** (on by default) — GNS Science active fault traces (NZ
  Active Faults Database) as thin dark-red lines (light red in the dark
  theme), 1 px and 1.5 px from zoom 9, drawn *under* the events so they never
  hide a marker or take its click. The legend shows the line as "Active faults
  (GNS Science NZ AFDB)". An event's popup lists the nearest mapped faults
  within 50 km.
* **Uncertainty ellipses** (off by default) — draws each plotted event's
  horizontal location uncertainty, preferring (in order) the agency's reported
  QuakeML ``OriginUncertainty`` error ellipse, then the circular
  ``horizontal_uncertainty`` field, then the larger of the latitude/longitude
  uncertainty marginals converted to kilometres at the event's latitude. When
  the ellipse has semi-axes but no reported azimuth, it is drawn as a circle
  of the semi-major axis rather than guessing an orientation. Each ellipse is
  a thin line in its event's own marker colour with a faint fill, under the
  events; the approximate lat/lon-marginal extents are dashed. The legend
  states the confidence level the agencies record for the drawn ellipses
  (e.g. "Error ellipse, 90% confidence", or "confidence not recorded"), and
  an event's popup gives its own error ("Location error 8.0 × 2.0 km, 90%
  confidence").
* **Focal mechanisms** (off by default) — a display mode: while it is on,
  the event circles are hidden and each plotted event with a resolvable nodal
  plane is drawn as its lower-hemisphere beach ball instead, preferring the
  event's ``preferred_focal_mechanism_id``. Beach balls are sized by magnitude
  (19 px at M2 to 45 px at M6, at most 48 px), larger events on top, and
  clicking one opens its event's popup. At most the **300** largest-magnitude
  events with a mechanism are drawn, at any zoom; the status chip says how
  many are shown and zooming in brings in the rest. The legend shows the beach
  ball key in place of the magnitude key, and a notice says when the
  catalogue, or the current view, has no mechanisms. The switch is disabled
  with the reason when the catalogue has none.

The ellipse overlay and the beach balls act only on the events currently
plotted (the spatially sampled set shown at the current view). Ellipses are
capped at the **150** largest-magnitude events; when more qualify, the note
under the switch reads "Showing the 150 largest of *N* plotted events."

There is no "Show Stations" toggle: the platform does not store per-event
station coordinates, so station positions cannot be drawn on the map. Use the
**Azimuthal gap** colour mode for the data-backed view of network coverage, or
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
* **Colour:** the event's own marker colour (so it follows the chosen colour
  mode), thin line and faint fill; dashed when the shape is only the
  approximate lat/lon-marginal extent, which is **not** a confidence region
* **Size:** Proportional to the uncertainty magnitude
* **Confidence label:** the legend states the confidence level QuakeML
  records for the drawn ellipses (e.g. "68% confidence") when present,
  otherwise that it was not recorded; an event's popup gives its own error

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

**Colours:**

* Shaded quadrants: compressional (first motion up); contain the **T**
  (tension) axis. On the Analytics map they take the event's depth colour
  when colouring by depth, dark grey in the other colour modes
* White quadrants: dilatational (first motion down); contain the **P**
  (pressure) axis

When a merged event carries reports from more than one agency, the mechanism
shown follows this preference order: GCMT > USGS/NEIC > GEOFON > GeoNet >
INGV > other moment-tensor solution > first-motion solution with 20 or more
polarities > automatic solution.

Station Coverage
================

The platform does not store per-event station coordinates, so no station
markers or station-to-event lines are drawn on the map. Network geometry is
shown two other ways:

* **Azimuthal gap colour mode:** a continuous teal (small gap) → pale amber
  (180°) → red (360°) ramp, so poorly constrained events stand out; events
  with no reported gap are grey
* **Station coverage card:** an event's detail panel reports its station
  count, azimuthal gap and station distances as a per-event widget, not a
  map overlay

**Quality indicators:**

* Good coverage: small azimuthal gap (teal end of the ramp)
* Poor coverage: large azimuthal gap, especially beyond 180° (towards red)

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

The magnitude filter's **upper** bound, unlike its lower bound, is never
applied to the G-R or Mc fit itself -- only to what is displayed elsewhere on
the page. A maximum-likelihood b-value and an estimated Mc both assume the
sample runs on above the fitted range; truncating it at a filter ceiling
biases the fit (an M ≤ 3 cap on a true b = 1 catalogue was measured to
return b = 1.34). Both tabs show a note to this effect whenever an upper
bound is set.

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
  rather than only in seismicity. A partial first or last bin is scaled up
  to a full bin (count × bin length ÷ days actually covered) only when its
  coverage is actually known: the time filter's window, intersected with the
  catalogue's own declared start/end when every analysed event comes from
  one catalogue that states it (the declared period is end-exclusive, and a
  date-only declared end is read as covering that whole day). Without
  either, a partial bin's true coverage cannot be measured from the data
  alone, so it is drawn at its raw, unscaled count instead, with a note that
  it may understate the rate. Either way a partial bin is shown dashed with
  a hollow marker, and its tooltip gives the raw count and (when known) the
  days covered. Series are labelled by threshold and bin, e.g. "Events ≥
  M2.3 per week".
* **Cumulative Event Time Series** -- running total of analysed events,
  plotted at the **end** of each bin (a UTC calendar day, or an ISO week for
  a span over a year).
* **Magnitude vs Time** -- magnitude plotted against origin time on a UTC
  axis, with a dashed reference line labelled "Mc = x" or "Cut-off M x".
  Above 3,000 analysed events the plot is sampled rather than drawn in full:
  the largest events by magnitude fill a tenth of the point budget, and the
  rest are spread with an even stride through time.
* **Cumulative Moment/Energy Release** -- titled "Cumulative Seismic Moment
  Release" or "Cumulative Radiated Energy Release" depending on a
  **Quantity** menu (Seismic moment, N·m / Radiated energy, J), also
  plotted at each bin's end. Values are summed per bin and accumulated over
  every analysed event, independent of the Seismicity Rate threshold. See
  *Seismic Moment* and *Energy Release* below for the formulas and which
  magnitude types are included.

An event whose origin time cannot be parsed at all takes no place in any of
these series (it would sort nowhere in time) and stays independent in any
declustering pass; it is counted and the count is reported rather than the
event being silently dropped.

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
filter has no lower bound) offers three methods. Every candidate cut-off Mi
is a 0.1-magnitude bin edge and means the events with M >= Mi; b above it
is the Aki-Utsu maximum-likelihood value with the same reporting-resolution
correction the b-value fit uses (half the rounding step for magnitudes
rounded to a fixed step, zero for full-precision magnitudes).

* **b-value stability (MBS)** -- the default (Cao & Gao, 2002, in the form
  of Woessner & Wiemer, 2005). For each Mi with at least 50 events across at
  least 3 populated bins at or above it, the uncertainty of b is Shi & Bolt's
  (1982) db = 2.3 b^2 sqrt(sum((M - mean M)^2) / (N(N-1))), and b_ave is the
  mean b over the six cut-offs Mi, Mi+0.1, ..., Mi+0.5. Mc is the lowest Mi
  with ``|b_ave - b(Mi)| <= db(Mi)``: the lowest cut-off whose b agrees, within
  its uncertainty, with b over the next 0.5 units. If no cut-off qualifies,
  Mc falls back to the goodness-of-fit test, and the page says why ("Too
  few events for b-value stability ..." or "No cut-off had a stable
  b-value ...").
* **Goodness of fit (GFT)** -- following Wiemer & Wyss (2000). Every Mi
  with at least 10 events across at least 3 populated bins at or above it is
  a candidate. With a = log10 N(>= Mi) + b * Mi, the predicted cumulative
  count at every bin edge Mj >= Mi is Sj = N(>= Mi) * 10^(-b(Mj-Mi)),
  compared against the observed Bj = N(>= Mj). The goodness of fit is
  ``R = 100 - 100 * sum(|Bj - Sj|) / sum(Bj)``, summed only up to the bin
  holding the largest analysed magnitude. Mc is the lowest Mi reaching
  R >= 95%, else the lowest reaching R >= 90%. If none reaches 90%, Mc falls
  back to MAXC + the correction ("No cut-off reached a 90% goodness of fit,
  so Mc is maximum curvature + c").
* **Maximum curvature (MAXC)** -- the fullest bin of the non-cumulative
  frequency-magnitude distribution, bins centred on multiples of 0.1 (each
  magnitude rounded to the nearest 0.1, as in ZMAP; the lowest bin on a tie),
  plus a **MAXC correction** from +0.0 to +0.5 (default **+0.2**). The
  correction control appears when MAXC is chosen or a fallback used it.

A magnitude is treated as lying on a reporting step (e.g. the common 0.1 or
0.01 rounding) when it is within 2^-20 of an exact multiple of that step --
enough to absorb floating-point noise without mistaking a genuinely
different value for a rounded one. Coarser common steps (0.5, 0.25, 0.2)
are recognised, and given the same half-step correction, only when at least
95% of the analysed magnitudes fall exactly on that step; the finer steps
have no such threshold, since their contribution is unmixed proportionally
instead (a value on a 0.1 grid also lands on a 0.5 grid one time in five, by
chance alone, and that share is subtracted out rather than gating a
yes/no test).

Every method needs at least 50 analysed events to estimate Mc at all. The
result is shown as "M{mc} +/- 0.1", "Estimated by" the method used (with the
requested method in brackets after a fallback); +/- one bin width is only a
lower bound on the uncertainty. The Mc tab's method card names the method
used ("MBS", "GFT (95%)"/"GFT (90%)" or "MAXC"). Under the frequency-magnitude
distribution (the centred bins MAXC uses, so its tallest bar is the MAXC
peak), a **b-value stability** chart plots b(Mi) with its db error bar and
the b_ave line against the cut-off, with Mc marked, whatever the method: a
check on any Mc. When the goodness-of-fit test ran, a "Goodness-of-Fit Test"
chart plots R against every candidate. The "events at or above Mc" share
uses the same tolerant (2^-20) comparison as the fit itself, so a magnitude
reported exactly at Mc is never excluded by floating-point rounding.

.. note::
   ZMAP's classic goodness-of-fit implementation differs in its search range
   and event floor (it scans MAXC -0.9 to +1.5 and needs 25 events per
   candidate rather than 10); results are not directly comparable between
   the two tools. b-value stability assumes a Gutenberg-Richter law above
   Mc: where b drifts with the cut-off (an excess of large events, mixed
   sequences) or db is very small (tens of thousands of events), it returns
   a higher, more conservative Mc than GFT or MAXC.

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

Switch between different base maps from the layers button in the top-right
corner of the map:

* **Light gray** (default in the light theme) and **Dark gray** (default in the
  dark theme): quiet Esri canvas basemaps so the events read first. Their place
  labels are drawn above the events. Toggling the site theme swaps between the
  two gray bases.
* **Ocean (bathymetry):** Esri ocean basemap, where trenches and the Hikurangi
  margin read clearly.
* **Satellite:** Esri aerial/satellite imagery.
* **Streets (OpenStreetMap):** detailed street map.

A base you pick other than the gray ones stays selected when the theme changes.

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

