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

* **Interactive Maps:** Leaflet-based maps with clustering and multiple base layers
* **Uncertainty Visualization:** Error ellipses showing location confidence
* **Focal Mechanisms:** Beach ball diagrams for fault plane solutions
* **Station Coverage:** Network geometry and azimuthal gap display
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
* Color-coded by depth
* Click events for details
* Marker clustering for dense regions

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
   * - Click cluster
     - Zoom to show individual events

**Color Coding (Default - by Depth):**

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Color
     - Depth Range
   * - Red
     - 0-15 km (shallow)
   * - Orange
     - 15-40 km (crustal)
   * - Yellow
     - 40-100 km (upper mantle)
   * - Green
     - 100-300 km (deep)
   * - Blue
     - 300+ km (very deep)

**Marker Size:**

Markers are scaled by magnitude using a logarithmic scale. Larger events
have proportionally larger markers for visual emphasis.

Enhanced Map View
=================

Advanced visualization with:

* **Uncertainty Ellipses:** Visual representation of location uncertainty
* **Focal Mechanisms:** Beach ball diagrams showing fault plane solutions
* **Station Coverage:** Seismic station locations and coverage
* **Azimuthal Gap:** Visual indication of network geometry

Enable enhanced features:

1. Navigate to Analytics page
2. Toggle "Show Uncertainty Ellipses"
3. Toggle "Show Focal Mechanisms"
4. Toggle "Show Stations"

Uncertainty Visualization
==========================

Location uncertainties displayed as:

* **Ellipses:** Horizontal uncertainty (latitude/longitude)
* **Color coding:** Quality grade (A+ = green, F = red)
* **Size:** Proportional to uncertainty magnitude

**Interpretation:**

* Small ellipse = precise location
* Large ellipse = uncertain location
* Circular = equal uncertainty in all directions
* Elongated = directional uncertainty

Focal Mechanisms
================

Beach ball diagrams show:

* Fault plane orientation
* Slip direction
* Earthquake type (normal, reverse, strike-slip)

**Colors:**

* Black quadrants: Compressional
* White quadrants: Tensional

Station Coverage
================

View seismic stations used for event location:

* Station markers on map
* Lines connecting stations to event
* Azimuthal gap visualization
* Station count and distribution

**Quality indicators:**

* Good coverage: Stations surround event, small azimuthal gap
* Poor coverage: Stations on one side, large azimuthal gap

-----------------
Charts and Graphs
-----------------

Magnitude-Frequency Distribution
================================

Gutenberg-Richter plot showing:

* Event counts by magnitude
* b-value calculation
* Completeness magnitude (Mc)

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

Time series plots showing:

* Event rate over time
* Magnitude evolution
* Cumulative seismic moment
* Energy release

**Features:**

* Identify aftershock sequences
* Detect swarms and clusters
* Analyze temporal completeness

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

Estimate the magnitude above which the catalogue is complete:

* Maximum curvature method
* Goodness-of-fit test
* Visual inspection of magnitude-frequency plot

Seismic Moment
==============

Calculate total seismic moment:

.. math::

   M_0 = 10^{(1.5 \cdot M_w + 9.1)}

Where M_w is moment magnitude.

Energy Release
==============

Estimate radiated seismic energy:

.. math::

   E = 10^{(1.5 \cdot M + 4.8)}

Cluster Detection
=================

Identify earthquake clusters and sequences:

* Temporal clustering (aftershocks)
* Spatial clustering (swarms)
* Declustering algorithms

--------------
Filtering Data
--------------

Apply filters to focus visualization:

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

**Quality Grade:**

.. code-block:: text

   Minimum: B (good quality)

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

