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
     - When enabled, enforces validation for required fields and rejects uploads with missing required data
   * - **Fuzzy Match Threshold**
     - Minimum similarity score (40-100%) required for fuzzy field name matching


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
2. Enter the **Source Field Pattern** (the field name to match in uploaded files)
3. Select the **Target Field** from the dropdown
4. Optionally enable **Use regex pattern** for pattern matching
5. Set the **Priority** (1-100, higher = checked first)
6. Click **Add Mapping**

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
     - Depth below surface
   * - ``depthType``
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


Quality Fields
^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Field
     - Type
     - Description
   * - ``rms``
     - number
     - Root mean square residual (seconds)
   * - ``gap``
     - number
     - Azimuthal gap (degrees)
   * - ``nst``
     - number
     - Number of stations used
   * - ``dmin``
     - number
     - Distance to nearest station (degrees)
   * - ``qualityScore``
     - number
     - Overall quality score (0-1)


Built-in Aliases
----------------


The system includes built-in aliases for common field name variations:

**Latitude:** ``lat``, ``latitude``, ``Lat``, ``Latitude``, ``LAT``, ``LATITUDE``, ``y``

**Longitude:** ``lon``, ``lng``, ``long``, ``longitude``, ``Lon``, ``Long``, ``Longitude``, ``LON``, ``LONG``, ``x``

**Depth:** ``depth``, ``Depth``, ``DEPTH``, ``dep``, ``z``

**Time:** ``time``, ``datetime``, ``origin_time``, ``origintime``, ``eventTime``, ``date_time``

**Magnitude:** ``mag``, ``magnitude``, ``Magnitude``, ``MAG``, ``ml``, ``mw``, ``mb``

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


Best Practices
--------------


1. **Use high priority (90-100)** for exact field name matches
2. **Use medium priority (50-70)** for common aliases
3. **Use lower priority (30-50)** for regex patterns that might match multiple fields
4. **Test mappings** by uploading a sample file after making changes
5. **Avoid duplicate targets** - the system warns if multiple source patterns map to the same target

Troubleshooting
---------------


Fields not auto-detected
^^^^^^^^^^^^^^^^^^^^^^^^


- Check that Auto-detect is enabled
- Verify the fuzzy match threshold isn't too high
- Add a custom mapping for the specific field name

Duplicate target warnings
^^^^^^^^^^^^^^^^^^^^^^^^^


- Multiple source patterns are mapping to the same target field
- Review mappings and remove or adjust conflicting patterns

Mappings not saving
^^^^^^^^^^^^^^^^^^^


- Ensure you click "Save Changes" after making edits
- Check browser console for API errors



*Last updated: January 2025*
