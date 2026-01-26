==========
User Guide
==========

Welcome to the Earthquake Catalogue Platform User Guide. This comprehensive guide
will help you master all aspects of uploading, managing, analyzing, and visualizing
earthquake catalogue data.

--------
Overview
--------

The Earthquake Catalogue Platform is a modern, web-based application designed for
seismologists, researchers, and data analysts working with earthquake data. Whether
you're maintaining operational catalogues, conducting research, or analyzing
historical seismicity, this platform provides the tools you need.

Key Capabilities
================

.. list-table::
   :widths: 25 75
   :header-rows: 0

   * - **Data Import**
     - Upload earthquake data in CSV, JSON, GeoJSON, or QuakeML formats with
       automatic format detection and intelligent parsing
   * - **Live Integration**
     - Import real-time earthquake data from GeoNet's FDSN Event Web Service
       with configurable filters and duplicate detection
   * - **Catalogue Merging**
     - Combine multiple catalogues with intelligent duplicate detection and
       four different conflict resolution strategies
   * - **Quality Assessment**
     - Automatic quality scoring (A+ to F grades) based on location uncertainty,
       network geometry, and solution parameters
   * - **Visualization**
     - Interactive Leaflet maps with uncertainty ellipses, focal mechanisms,
       station coverage, and quality color-coding
   * - **Analytics**
     - Gutenberg-Richter b-value analysis, completeness magnitude estimation,
       temporal patterns, and statistical summaries
   * - **Export**
     - Download catalogues in CSV, QuakeML, JSON, or GeoJSON formats with
       complete metadata preservation

-----------
Quick Start
-----------

Already familiar with earthquake catalogues? Here's the fastest path to get started:

1. **Install**: Clone repo, run ``npm install``, configure ``.env``
2. **Start**: Run ``npm run dev``, open http://localhost:3000
3. **Upload**: Go to /upload, drag-drop your CSV/QuakeML file
4. **View**: Navigate to /catalogues to see your data on the map

For detailed instructions, continue to :doc:`getting-started`.

-----------------
What You'll Learn
-----------------

This user guide is organized into seven main sections:

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Section
     - Description
   * - :doc:`getting-started`
     - Installation, configuration, and running your first session
   * - :doc:`uploading-data`
     - Upload earthquake data in various formats with field mapping
   * - :doc:`importing-geonet`
     - Import data from GeoNet's FDSN service with filters
   * - :doc:`merging-catalogues`
     - Combine catalogues with duplicate detection and conflict resolution
   * - :doc:`visualization`
     - Interactive maps, charts, and seismological analytics
   * - :doc:`exporting-data`
     - Download catalogues in CSV, QuakeML, JSON, or GeoJSON
   * - :doc:`quality-assessment`
     - Understand quality grades and filtering by metrics

------------------
Supported Formats
------------------

The platform supports the following earthquake data formats:

.. list-table::
   :header-rows: 1
   :widths: 15 15 70

   * - Format
     - Extensions
     - Description
   * - CSV/TXT
     - ``.csv``, ``.txt``
     - Delimited text files with automatic delimiter detection (comma, tab,
       semicolon, pipe, space). Supports multiple date formats including
       ISO 8601, US (MM/DD/YYYY), and international (DD/MM/YYYY).
   * - JSON
     - ``.json``
     - Array of event objects or ``{events: [...]}`` structure. All standard
       earthquake fields supported with nested uncertainty objects.
   * - GeoJSON
     - ``.geojson``, ``.json``
     - FeatureCollection with Point geometries. Coordinates follow GeoJSON
       convention [longitude, latitude, depth]. Properties contain event metadata.
   * - QuakeML
     - ``.xml``, ``.qml``
     - QuakeML 1.2 BED (Basic Event Description) format. Full support for origins,
       magnitudes, picks, arrivals, and focal mechanisms.

Required Fields
===============

All earthquake events must include these minimum fields:

* **time** - Origin time (ISO 8601 or parseable date/time)
* **latitude** - Decimal degrees (-90 to 90)
* **longitude** - Decimal degrees (-180 to 180)
* **magnitude** - Event magnitude (-2 to 10)

Optional fields like depth, magnitude type, uncertainties, and quality metrics
enhance the usefulness of your data.

------------------------
Platform at a Glance
------------------------

.. mermaid::

   flowchart TD
       subgraph Inputs ["Data Ingestion"]
           Upload["UPLOAD<br/>(CSV, JSON, QuakeML)"]
           Import["IMPORT<br/>(GeoNet FDSN)"]
       end

       subgraph Core ["Core Platform"]
           Merge["MERGE & DEDUPE"]
           Store["MONGODB STORAGE"]
           Quality["QUALITY ASSESSMENT"]
       end

       subgraph Outputs ["Analysis & Export"]
           Analytics["ANALYTICS<br/>(Maps, Charts, Stats)"]
           Export["EXPORT<br/>(CSV, QuakeML, GeoJSON)"]
       end

       Upload --> Quality
       Import --> Quality
       Quality --> Merge
       Merge --> Store
       
       Store --> Analytics
       Store --> Export

-----------
Quick Links
-----------

**Getting Started**

* :doc:`getting-started` - Installation and first steps

**Core Features**

* :doc:`uploading-data` - Upload your earthquake data
* :doc:`importing-geonet` - Import from GeoNet FDSN
* :doc:`merging-catalogues` - Combine multiple catalogues
* :doc:`visualization` - Maps and analytics

**Data Management**

* :doc:`quality-assessment` - Quality grades and filtering
* :doc:`exporting-data` - Download in various formats

**Reference**

* :doc:`../api-reference/index` - REST API documentation
* :doc:`../glossary` - Seismological terminology

----------
Next Steps
----------

Ready to begin? Head over to :doc:`getting-started` to install and configure
the platform, then :doc:`uploading-data` to load your first earthquake catalogue.

.. tip::
   If you're new to earthquake catalogues, start with the :doc:`../glossary`
   to familiarize yourself with seismological terminology used throughout
   this documentation.

.. toctree::
   :hidden:
   :maxdepth: 2

   getting-started
   uploading-data
   importing-geonet
   merging-catalogues
   visualization
   exporting-data
   quality-assessment
