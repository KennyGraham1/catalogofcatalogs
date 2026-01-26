GeoNet Baseline Catalogue Setup Guide
=====================================


This guide explains how to set up and use the GeoNet real data import feature to create a baseline/reference catalogue with actual recorded New Zealand earthquake data.



📋 Overview
----------


The **GeoNet Baseline Catalogue** feature allows you to import real earthquake data from the ``GeoNet FDSN Event Web Service <https://service.geonet.org.nz/fdsnws/event/1/>``_ to serve as a reference catalogue for New Zealand seismic activity.

Why Use Real GeoNet Data?
^^^^^^^^^^^^^^^^^^^^^^^^^


- **Baseline Reference**: Compare synthetic/merged catalogues against real recorded data
- **Real-world Testing**: Test your analysis workflows with actual earthquake data
- **Complete Metadata**: Access full QuakeML 1.2 data including picks, arrivals, and focal mechanisms
- **Up-to-date**: Import the latest earthquake events from New Zealand



🚀 Quick Start
-------------


Option 1: Automated Import During Database Setup
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Run the GeoNet baseline population script after setting up the database:

.. code-block:: bash

   # 1. Clean and initialize database with synthetic data
   node scripts/clean-database.js
   
   # 2. Import real GeoNet data (last 30 days, M3.0+)
   npx tsx scripts/populate-geonet-baseline.ts


This will create a catalogue called **"GeoNet - Real Data (Baseline)"** with:
- Events from the last 30 days
- Minimum magnitude: 3.0
- Full QuakeML 1.2 metadata

Option 2: Manual Import via Web Interface
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. **Start the application**:
   ```bash
   npm run dev
   ```

2. **Navigate to the Import page**:
   - Open http://localhost:3000/import
   - The Import link is now in the main navigation menu

3. **Configure your import**:
   - **Time Range**: Select "Last N Hours" or "Custom Date Range"
   - **Hours**: Enter number of hours (e.g., 720 for 30 days)
   - **Minimum Magnitude**: Enter threshold (e.g., 3.0)
   - **Catalogue Name**: Enter a name (e.g., "GeoNet - Real Data")
   - **Update Existing**: Enable if you want to update existing events

4. **Start Import**:
   - Click "Start Import"
   - Wait for completion (typically 1-10 seconds)
   - Review the import results



📊 Import Configuration Options
------------------------------


Time Range Options
^^^^^^^^^^^^^^^^^^


**Last N Hours** (Recommended for recent data):
- Last 24 hours: ``hours: 24``
- Last 7 days: ``hours: 168``
- Last 30 days: ``hours: 720``
- Last 90 days: ``hours: 2160``

**Custom Date Range** (For specific time periods):
- Specify exact start and end dates
- Useful for historical analysis or specific event sequences

Magnitude Filters
^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Magnitude
     - Description
     - Typical Event Count (30 days)
   * - 1.0+
     - All detected events
     - 1000+ events
   * - 2.0+
     - Felt by some people
     - 200-400 events
   * - 3.0+
     - Widely felt
     - 50-100 events
   * - 4.0+
     - Minor damage possible
     - 10-20 events
   * - 5.0+
     - Moderate damage
     - 1-5 events


**Recommendation**: Use **3.0+** for a baseline catalogue to balance completeness with data volume.

Geographic Filters (Optional)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


You can filter by geographic bounds to focus on specific regions:

- **Wellington Region**: 
  - Latitude: -41.5 to -41.0
  - Longitude: 174.5 to 175.0

- **Canterbury Region**:
  - Latitude: -43.8 to -43.2
  - Longitude: 172.0 to 173.0

- **All of New Zealand**:
  - Latitude: -47.5 to -34.0
  - Longitude: 165.0 to 179.0



🔄 Updating the Baseline Catalogue
---------------------------------


Scheduled Updates
^^^^^^^^^^^^^^^^^


To keep your baseline catalogue up-to-date, you can:

1. **Manual Updates**: Visit the Import page and run a new import
2. **Script Updates**: Run the baseline script periodically:
   ```bash
   npx tsx scripts/populate-geonet-baseline.ts
   ```

Update Existing Events
^^^^^^^^^^^^^^^^^^^^^^


Enable the **"Update existing events"** option to:
- Refresh event metadata if GeoNet has updated it
- Add new picks/arrivals that weren't available initially
- Update magnitude or location if revised



📁 Data Structure
----------------


Catalogue Metadata
^^^^^^^^^^^^^^^^^^


The GeoNet baseline catalogue includes:

.. code-block:: json

   {
     "id": "auto-generated-uuid",
     "name": "GeoNet - Real Data (Baseline)",
     "created_at": "2025-10-29T...",
     "source_catalogues": [
       {
         "name": "GeoNet - Real Data (Baseline)",
         "description": "Real earthquake data from GeoNet FDSN Event Web Service"
       }
     ],
     "merge_config": {},
     "event_count": 75,
     "status": "complete"
   }


Event Data
^^^^^^^^^^


Each event includes full QuakeML 1.2 metadata:

- **Basic Fields**: time, latitude, longitude, depth, magnitude
- **Source ID**: Original GeoNet event ID (e.g., "2024p123456")
- **Event Type**: earthquake, quarry blast, sonic boom, etc.
- **Magnitude Type**: ML, Mw, mb, etc.
- **Uncertainties**: time, location, depth, magnitude uncertainties
- **Quality Metrics**: azimuthal gap, phase counts, standard error
- **Picks**: P and S wave arrivals from seismic stations
- **Arrivals**: Phase data with azimuth, distance, residuals
- **Focal Mechanisms**: For significant events (M5.0+)



🧪 Testing the Import
--------------------


Test the GeoNet import functionality:

.. code-block:: bash

   node scripts/test-geonet-import.js


This will:
1. Import events from the last 24 hours (M4.0+)
2. Verify the catalogue was created
3. Check event data structure
4. Display import statistics



📖 API Documentation
-------------------


GeoNet FDSN Event Web Service
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**Base URL**: ``https://service.geonet.org.nz/fdsnws/event/1/query``

**Supported Parameters**:
- ``starttime`` / ``endtime``: ISO 8601 datetime
- ``minmagnitude`` / ``maxmagnitude``: Magnitude range
- ``mindepth`` / ``maxdepth``: Depth range (km)
- ``minlatitude`` / ``maxlatitude``: Latitude bounds
- ``minlongitude`` / ``maxlongitude``: Longitude bounds
- ``format``: ``text`` or ``xml`` (QuakeML)
- ``orderby``: ``time``, ``magnitude``, ``time-asc``

**Documentation**: https://www.geonet.org.nz/data/access/FDSN



🎯 Use Cases
-----------


1. Baseline Reference Catalogue
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Create a reference catalogue to compare against:
- Synthetic test data
- Merged catalogues from multiple sources
- Historical catalogues

2. Real-world Testing
^^^^^^^^^^^^^^^^^^^^^


Test your analysis workflows with actual data:
- Magnitude-frequency distributions
- Spatial clustering analysis
- Temporal patterns (aftershock sequences)

3. Data Quality Comparison
^^^^^^^^^^^^^^^^^^^^^^^^^^


Compare data completeness across catalogues:
- GeoNet (full metadata) vs. Other Networks (moderate) vs. Historic (basic)
- Evaluate pick quality and station coverage
- Assess location uncertainties

4. Recent Seismic Activity
^^^^^^^^^^^^^^^^^^^^^^^^^^


Monitor recent earthquake activity:
- Import last 7 days for current activity
- Track aftershock sequences
- Identify seismic swarms



⚠️ Important Notes
------------------


API Rate Limits
^^^^^^^^^^^^^^^


GeoNet's FDSN service has reasonable rate limits:
- **Recommended**: Limit requests to 1 per second
- **Large imports**: Use date ranges to split large requests
- **Best practice**: Import incrementally (e.g., weekly updates)

Data Availability
^^^^^^^^^^^^^^^^^


- **Real-time data**: Available within minutes of detection
- **Reviewed data**: May be updated hours/days later with improved locations
- **Historical data**: Available back to ~1940s for significant events

Network Connectivity
^^^^^^^^^^^^^^^^^^^^


The import requires internet connectivity to access the GeoNet API:
- Ensure your server can reach ``service.geonet.org.nz``
- Handle network errors gracefully (script will report failures)
- Consider retry logic for production deployments



🔧 Troubleshooting
-----------------


Import Returns No Events
^^^^^^^^^^^^^^^^^^^^^^^^


**Possible causes**:
1. No events in the specified time range/magnitude
2. Network connectivity issues
3. GeoNet API temporarily unavailable

**Solutions**:
- Expand time range or lower magnitude threshold
- Check internet connectivity
- Try again later if API is down

Import Fails with Error
^^^^^^^^^^^^^^^^^^^^^^^


**Check**:
1. Database is initialized: ``node scripts/clean-database.js``
2. Dependencies installed: ``npm install``
3. Network connectivity to GeoNet API

Events Not Appearing in UI
^^^^^^^^^^^^^^^^^^^^^^^^^^


**Solutions**:
1. Refresh the catalogues page
2. Check the catalogue was created: Visit ``/catalogues``
3. Verify events were imported: Check import history tab



📚 Additional Resources
----------------------


- **GeoNet Website**: https://www.geonet.org.nz/
- **FDSN Web Services**: https://www.fdsn.org/webservices/
- **QuakeML Standard**: https://quake.ethz.ch/quakeml/
- **Import Documentation**: See ``GEONET_IMPORT_DOCUMENTATION.md``
- **Implementation Details**: See ``GEONET_IMPORT_IMPLEMENTATION_SUMMARY.md``



🎉 Summary
---------


You now have access to real New Zealand earthquake data through the GeoNet import feature:

1. ✅ **Navigation**: Import link added to main menu
2. ✅ **Automated Script**: ``populate-geonet-baseline.ts`` for quick setup
3. ✅ **Web Interface**: Full-featured import form at ``/import``
4. ✅ **Baseline Catalogue**: Real data for reference and testing
5. ✅ **Flexible Configuration**: Time range, magnitude, and geographic filters

**Next Steps**:
- Run ``npx tsx scripts/populate-geonet-baseline.ts`` to create your baseline catalogue
- Visit http://localhost:3000/import to explore the import interface
- Compare real GeoNet data with your synthetic catalogues
