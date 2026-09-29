Default Field Mappings
======================


Configure how fields from different file formats automatically map to the standardized earthquake catalogue schema.

Overview
--------


The Default Field Mappings feature allows you to customize how source fields in uploaded files (CSV, JSON, QuakeML, GeoJSON) are automatically mapped to the platform's standardized schema. This reduces manual mapping work during uploads and ensures consistent data processing.

Accessing Field Mappings Settings
---------------------------------


1. Navigate to **Settings** from the main menu
2. Select the **Schema** tab
3. The Default Field Mappings panel is displayed

Features
--------


Global Settings
^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Setting
     - Description
   * - **Auto-detect Field Mappings**
     - When enabled, the system automatically suggests field mappings during file upload based on configured patterns
   * - **Strict Schema Validation**
     - Changes which fields are treated as required. **On:** every required field, including the event ID, must be mapped before upload proceeds. **Off** (the default): only time, latitude, longitude and magnitude must be mapped -- an event ID column is no longer a hard blocker, though the UI still notes when no ID column was mapped.
   * - **Fuzzy Match Threshold**
     - Minimum similarity score (40-100%) required for a **fuzzy** (similarity-guessed) field match. It has no effect on an exact spelling or a known alias -- those apply regardless of this setting, because they are not guesses.


Format-Specific Tabs
^^^^^^^^^^^^^^^^^^^^


Configure mappings for each supported file format:

- **CSV/TXT** - Comma-separated and text files
- **JSON** - Standard JSON files
- **QuakeML** - QuakeML 1.2 XML format
- **GeoJSON** - GeoJSON feature collections

Field Categories
^^^^^^^^^^^^^^^^


Fields are organized into logical categories:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Category
     - Description
     - Example Fields
   * - **Location**
     - Geographic coordinates and depth
     - latitude, longitude, depth
   * - **Time**
     - Temporal information
     - time, originTime
   * - **Magnitude**
     - Magnitude measurements
     - magnitude, magnitudeType
   * - **Source**
     - Origin and identification
     - eventId, source, agency
   * - **Quality**
     - Data quality metrics
     - rms, gap, nst, qualityScore
   * - **Focal Mechanism**
     - Focal mechanism parameters
     - strike, dip, rake


Managing Custom Mappings
------------------------


Adding a New Mapping
^^^^^^^^^^^^^^^^^^^^


1. Click **Add Mapping** button
2. Enter the **Source Field Pattern** (the field name to match in uploaded files; 200 characters or fewer)
3. Select the **Target Field** from the dropdown (only fields a column can actually be mapped to are offered -- complex, assembled structures such as ``origins`` or ``picks`` are not)
4. Optionally enable **Use regex pattern** for pattern matching (the pattern must compile as a valid regular expression, or the rule is rejected). Two further safety limits apply at match time, since a Settings rule runs against every header of every upload: a pattern that repeats a group that itself repeats or alternates (``(\w+_?)*``, ``(a+)+``) can backtrack exponentially on a near miss, so such a pattern is recognised and never matches anything; and no regex pattern (safe or not) is ever run against a header longer than 64 characters.
5. Set the **Priority** (an integer from 1-100, higher = checked first)
6. Click **Add Mapping**

Mapping precedence
^^^^^^^^^^^^^^^^^^^

A column is mapped in this order, and the first match wins:

1. **Your custom mapping rules** (Settings), always applied ahead of the built-in
   table. If several of your rules match the same column, **Priority** breaks
   the tie -- it only orders your own rules against each other, it is not a
   confidence score.
2. **The built-in exact/alias table** (see *Built-in Aliases* below), applied
   in full regardless of the Fuzzy Match Threshold -- an exact spelling or a
   known alias is not a guess.
3. **A fuzzy (similarity) guess**, only when nothing above matched, and only
   if its similarity score meets the **Fuzzy Match Threshold**.

Split date/time component columns (``year``, ``month``, ``day``, ``hour`` ...)
and scale-named magnitude columns (``ML``, ``Mw``, ``mb`` ...) are never
resolved by the fuzzy step -- see *Named-magnitude columns* below.

Editing Mappings
^^^^^^^^^^^^^^^^


- Click on any source field pattern to edit it inline
- Changes are tracked but not saved until you click **Save Changes**

Removing Mappings
^^^^^^^^^^^^^^^^^


- Click the trash icon next to any custom mapping to remove it

Reset to Defaults
^^^^^^^^^^^^^^^^^


- Click **Reset to Defaults** to restore the built-in field aliases
- This replaces all custom mappings

Field Definitions
-----------------


Required Fields
^^^^^^^^^^^^^^^


These fields must be mapped for successful data import:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Field
     - Type
     - Description
   * - ``latitude``
     - number
     - Event latitude (-90 to 90)
   * - ``longitude``
     - number
     - Event longitude (-180 to 180)
   * - ``time``
     - datetime
     - Event origin time (ISO 8601)
   * - ``magnitude``
     - number
     - Event magnitude


Location Fields
^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Field
     - Type
     - Unit
     - Description
   * - ``latitude``
     - number
     - degrees
     - Latitude coordinate
   * - ``longitude``
     - number
     - degrees
     - Longitude coordinate
   * - ``depth``
     - number
     - km
     - Depth of the hypocentre below sea level. Accepted range is **-5 to
       1000 km**; negative values are intentionally valid and describe a
       source above sea level (a volcanic event beneath a summit, a mining
       event) -- they are not clamped to zero.
   * - ``depthType`` (``depth_type``)
     - string
     - -
     - Type of depth (e.g., "operator assigned")


Magnitude Fields
^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Field
     - Type
     - Description
   * - ``magnitude``
     - number
     - Primary magnitude value
   * - ``magnitudeType``
     - string
     - Magnitude scale (ML, Mw, mb, Ms, etc.)
   * - ``magnitudeUncertainty``
     - number
     - Magnitude uncertainty
   * - ``magnitudeStationCount``
     - number
     - Stations used for magnitude

Named-magnitude columns
^^^^^^^^^^^^^^^^^^^^^^^^

A file often carries the event magnitude in a column named after its scale
(``Mw``, ``ML``, ``mb`` ...) rather than a generic ``magnitude`` column. The
parser resolves which column becomes the preferred event magnitude in a
fixed order, independent of column order in the file:

1. A scale-named **Mw** column (``Mw``, ``MW``, ``mw``), if present.
2. Otherwise the **generic magnitude** column (``magnitude``, ``mag``, ``m``
   ...), with whatever scale ``magnitudeType``/``magtype`` states.
3. Otherwise a scale-named **ML** column (``ML``, ``ml``).
4. Only if none of the above is present, another scale-named column present
   in the file (``Ms``, ``mb``, ``Md`` ...), in a fixed preference order --
   so an ``mb``-only or ``Ms``-only bulletin still imports with its own
   scale rather than an unlabelled magnitude.

Every value the file reported that was not selected is kept with the event
as an alternative magnitude (visible in ``magnitudes``), never discarded.
Because a scale-named column carries its scale as part of its identity, it
is **never reassigned by fuzzy (similarity) matching** to another field --
only an explicit rule or an explicit choice in the mapping UI can change
what it is mapped to. In the mapping UI such a column shows an origin note
("mapped by the parser"); this is informational, not a lock -- you can
still explicitly remap or unmap it like any other column. Doing so changes
which value becomes the *preferred* magnitude/magnitude type; the previous
selection is not lost, it becomes an alternative (see *Magnitude columns*
in :doc:`/developer-guide/implementation-notes/scientific-conventions`).

The mapping UI distinguishes three cases by how locked-down they are. A column the
parser *derives a value from* rather than reads directly -- a separate date and time
column combined into one origin time, or the auto-assembled focal-mechanism columns --
is shown fully read-only, with a badge such as "Origin Time (assembled by the parser)"
and no dropdown at all: unlike the winning scale-named column above, there is no raw
per-column value here to remap, since no single column holds it. A scale-named column
that lost out to a higher-priority one in step 4 above (e.g. an ``ML`` column when the
file also has ``Mw``) defaults to "Alternative magnitude (ML)" and, like the winning
column, remains fully remappable if you want it read into a different field instead.

One current gap: ``mb`` is not in the built-in alias table (see
*Built-in Aliases* below), so it is not matched by the generic alias
mechanism at all -- it is recognised only through the scale-named-column
priority above (step 4), which does correctly preserve it as the magnitude
and its scale when it is the only magnitude column present.

Quality Fields
^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Field
     - Type
     - Description
   * - ``standard_error`` (alias ``rms``)
     - number
     - Root mean square residual (seconds)
   * - ``azimuthal_gap`` (alias ``gap``)
     - number
     - Largest azimuthal gap between stations (degrees)
   * - ``used_station_count`` (alias ``nst``)
     - number
     - Number of stations used in the location
   * - ``used_phase_count`` (alias ``nph``)
     - number
     - Number of seismic phases used in the location
   * - ``minimum_distance`` (alias ``dmin``)
     - number
     - Epicentral distance to the nearest station used (degrees)

There is no stored, mappable ``qualityScore`` field -- quality grades and
scores are computed by the platform from the fields above, not supplied by
an uploaded file. A column with a name like that is left for you to map
explicitly, or ignored.


Built-in Aliases
----------------

The parser and the schema-mapping UI share one built-in alias table
(``FIELD_ALIASES`` in ``lib/field-definitions.ts``), so a column resolves
the same way whether you look at the upload preview or the Settings page.
Each field has *exact spellings* (case-sensitive, e.g. ``Lat``, ``LAT``)
and *aliases* (matched case- and punctuation-insensitively, e.g.
``lat_error`` also matches ``LatError``). The list below groups fields the
way the Field Categories table above does; it is a summary of the current
alias table, not the full, literal list of every spelling it accepts.

**Basic fields**

* ``id`` -- ``id``, ``eventid``, ``event_id``, ``publicid``, ``public_id``, ``evid``, ``eid``, ``quakemlid``
* ``time`` -- ``time``, ``datetime``, ``date``, ``origintime``, ``origin_time``, ``timestamp``, ``origin``, ``ot``, ``otime``
* ``latitude`` -- ``latitude``, ``lat``, ``y``, ``ylat``, ``originlat``, ``origin_latitude``, ``evla``
* ``longitude`` -- ``longitude``, ``lon``, ``lng``, ``long``, ``x``, ``xlon``, ``originlon``, ``origin_longitude``, ``evlo``
* ``depth`` -- ``depth``, ``dep``, ``z``, ``depth_km``, ``evdp``, ``origin_depth``, ``cd``/``centroid_depth``, plus the same set of spellings in metres (``depth_m``, ``depth (m)``, ``depth_metres`` ...) -- see *Depth units* below
* ``magnitude`` -- ``magnitude``, ``mag``, ``m``, ``mpref``, ``prefmag``, ``pref_magnitude`` (scale-named columns such as ``Mw``/``ML`` are handled separately -- see *Named-magnitude columns* above)
* ``region`` -- ``region``, ``flinnengdahl``, ``flinn_engdahl``, ``fe_region``, ``geo_region``, ``area``

**Event metadata**

* ``event_type`` -- ``event_type``, ``eventtype``, ``etype``, ``seismic_type``, and a bare ``type`` column. ``type`` is mapped here (not left unmapped) because it is the event-type column in the most widely copied catalogue schema (USGS ComCat). A file whose ``type`` column actually holds magnitude-scale codes (``ML``, ``Mw`` ...) is still stored correctly: the platform moves a scale code found there to ``magnitude_type`` based on the *value*, not the header.
* ``event_type_certainty`` -- ``typecertainty``, ``eventcertainty``, ``type_certainty``, ``eventtypecertainty``
* ``location_name`` -- ``location``, ``locationname``, ``place``, ``placename``, ``description``, ``event_description``
* ``event_public_id`` -- ``publicid``, ``quakemlid``, ``quakeml_id``, ``resourceid``, ``resource_id``
* ``agency_id`` -- ``agency``, ``agencyid``, ``source_agency``, ``contributor``, ``network``, ``net``, ``locsource``, ``origsource``
* ``author`` -- ``author``, ``analyst``, ``created_by``, ``reporter``, ``originator``
* ``depth_type`` -- ``depthtype``, ``depth_method``, ``depthflag``, ``depth_determination``, ``depthfixed``, ``fixed_depth``
* ``earth_model_id`` -- ``earthmodelid``, ``velocity_model``, ``velmodel``, ``vmodel``
* ``method_id`` -- ``methodid``, ``location_method``, ``locmethod``, ``algorithm``, ``method``, ``invmethod``, ``inversion_method``
* Lineage/export columns of the platform's own CSV export, recognised so a re-imported export keeps its identifiers: ``source_id``, ``source_event_type``, ``preferred_origin_id``, ``preferred_magnitude_id``, ``preferred_focal_mechanism_id``, ``source_events``

**Origin uncertainties**

* ``time_uncertainty`` -- ``timeerror``, ``time_error``, ``oterror``, ``ot_uncertainty``, ``stime``
* ``latitude_uncertainty`` -- ``laterror``, ``lat_error``, ``lat_uncertainty``, ``slat`` (**degrees**, not km)
* ``longitude_uncertainty`` -- ``lonerror``, ``lon_error``, ``long_error``, ``lon_uncertainty``, ``slon`` (**degrees**, not km)
* ``depth_uncertainty`` -- ``deptherror``, ``depth_error``, ``sdepth``, ``sdep``, ``z_error`` (km)
* ``horizontal_uncertainty`` -- ``horizontalerror``, ``horiz_unc``, ``h_uncertainty``, ``herr``, ``seh`` (km, circular)
* ``min_horizontal_uncertainty`` / ``max_horizontal_uncertainty`` -- error-ellipse semi-minor/semi-major axis: ``semi_minor_axis``/``smin``, ``semi_major_axis``/``smaj`` (km)
* ``azimuth_max_horizontal_uncertainty`` -- ``ellipse_azimuth``, ``sazimuth``, ``saz`` (degrees, clockwise from north)
* ``confidence_level`` -- ``confidencelevel``, ``conf_level``, ``ellipse_confidence`` (percent)

**Magnitude details**

* ``magnitude_type`` -- ``magtype``, ``mag_type``, ``mtype``, ``magnitudeclass``
* ``magnitude_uncertainty`` -- ``magerror``, ``mag_error``, ``smag``, ``magnitude_error``
* ``magnitude_station_count`` -- ``magstationcount``, ``mag_nst``, ``nstmag``, ``magnitude_nsta``
* ``magnitude_method_id`` -- ``magmethod``, ``mag_method``, ``magsource``
* ``magnitude_evaluation_mode`` / ``magnitude_evaluation_status`` -- ``magevalmode``/``magevalstatus`` and similar

**Quality metrics**

* ``azimuthal_gap`` -- ``azgap``, ``az_gap``, ``gap``, ``azimuthgap``
* ``used_phase_count`` -- ``nph``, ``ndef``, ``phases_used``, ``numphases``, ``phasecount``
* ``used_station_count`` -- ``nst``, ``nsta``, ``stations_used``, ``numstations``, ``stationcount``, ``ns``
* ``standard_error`` -- ``rms``, ``rmserror``, ``rms_error``, ``residual``, ``sres``
* ``minimum_distance`` / ``maximum_distance`` -- ``mindist``/``maxdist``, ``dmin``/``dmax``, ``nearest_station``/``farthest_station`` (degrees)
* ``associated_phase_count`` / ``associated_station_count`` -- ``nass``, ``total_phases`` / ``station_count``, ``total_stations``
* ``depth_phase_count`` -- ``depthphasecount``, ``depth_phases``, ``ndepthphases``

**Evaluation**

* ``evaluation_mode`` -- ``evalmode``, ``mode``, ``analysismode``
* ``evaluation_status`` -- ``evalstatus``, ``status``, ``reviewstatus``

This list can drift as the schema grows; ``FIELD_ALIASES`` in
``lib/field-definitions.ts`` is the definitive source.

Depth units
^^^^^^^^^^^

The depth unit (metres or kilometres) is decided once for the whole file,
from the column name if it states a unit (e.g. ``depth_m`` vs ``depth_km``)
or otherwise from the reported values; it is never decided per cell. See
*CSV numeric fields* in
:doc:`/developer-guide/implementation-notes/scientific-conventions` for
how this holds even when a column is explicitly remapped after parsing.

API Reference
-------------


Get Field Mappings Configuration
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: text

   GET /api/settings/field-mappings


**Response:**
.. code-block:: json

   {
     "autoDetectEnabled": true,
     "strictValidation": false,
     "fuzzyMatchThreshold": 0.6,
     "formats": {
       "csv": { "enabled": true, "mappings": [] },
       "json": { "enabled": true, "mappings": [] },
       "quakeml": { "enabled": true, "mappings": [] },
       "geojson": { "enabled": true, "mappings": [] }
     },
     "customMappings": [
       {
         "id": "custom-1",
         "sourcePattern": "lat",
         "targetField": "latitude",
         "isRegex": false,
         "priority": 100
       }
     ],
     "lastUpdated": "2024-01-15T10:30:00Z"
   }


Save Field Mappings Configuration
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: text

   PUT /api/settings/field-mappings


**Request Body:** Same structure as GET response

**Response:**
.. code-block:: json

   {
     "success": true,
     "config": { ... }
   }

The saved configuration is validated in full before it is written, since it
is applied to every subsequent upload -- one malformed rule must not break
the schema step for everyone. A save is rejected if any rule has a source
pattern longer than 200 characters, a regex pattern that does not compile,
a target that is not a known, mappable scalar field (a JSON structure such
as ``origins`` cannot be a target), a priority that is not an integer from
1-100, or a fuzzy-match threshold outside 0.4-1.0.


Best Practices
--------------


1. **Use high priority (90-100)** for exact field name matches
2. **Use medium priority (50-70)** for common aliases
3. **Use lower priority (30-50)** for regex patterns that might match multiple fields
4. **Test mappings** by uploading a sample file after making changes
5. **Avoid ambiguous patterns** - several source patterns mapping to the *same*
   target is normal and expected (``lat``, ``Lat`` and ``evla`` all mapping to
   ``latitude`` is not flagged); what the system warns about is the *same*
   source pattern mapped to two *different* targets, which is genuinely
   contradictory

Troubleshooting
---------------


Fields not auto-detected
^^^^^^^^^^^^^^^^^^^^^^^^


- Check that Auto-detect is enabled
- Verify the fuzzy match threshold isn't too high
- Add a custom mapping for the specific field name

Conflicting mapping rules
^^^^^^^^^^^^^^^^^^^^^^^^^


- The same source pattern is sent to two different target fields, either
  within one format's rules or between a custom rule and a format rule -- this
  is what the "Conflicting mappings" notice on the Settings page reports.
  Several *different* patterns mapping to the same target (``lat``, ``Lat``,
  ``evla`` all mapping to ``latitude``) is normal and is not reported.
- Review mappings and remove or adjust the contradictory pattern.

Built-in alias override notices
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


- A separate notice lists any custom rule whose source pattern the built-in
  alias table would already have sent somewhere else. This is not an error --
  your explicit rule wins over the built-in alias -- but it is shown so an
  accidental override is easy to spot.

Mappings not saving
^^^^^^^^^^^^^^^^^^^


- Ensure you click "Save Changes" after making edits
- Check browser console for API errors



*Last updated: January 2025*
