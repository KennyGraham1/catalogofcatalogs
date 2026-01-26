==========
User Guide
==========

Welcome to the Earthquake Catalogue Platform User Guide. This guide will help you get started with uploading, managing, analyzing, and visualizing earthquake catalogue data.

--------
Overview
--------

The Earthquake Catalogue Platform is a comprehensive web application designed for seismologists, researchers, and data analysts to:

* Upload and parse earthquake data in multiple formats
* Import real-time data from GeoNet and other FDSN services
* Merge catalogues with intelligent duplicate detection
* Visualize events on interactive maps with quality metrics
* Perform advanced seismological analysis
* Export data in standard formats (CSV, QuakeML)

-----------------
What You'll Learn
-----------------

This user guide covers:

1. **Getting Started** - Installation, setup, and first steps
2. **Uploading Data** - How to upload earthquake data in various formats
3. **Importing from GeoNet** - Automatic data import from FDSN services
4. **Merging Catalogues** - Combining multiple catalogues with configurable rules
5. **Visualization** - Interactive maps, charts, and quality analysis
6. **Exporting Data** - Downloading catalogues in CSV and QuakeML formats
7. **Quality Assessment** - Understanding quality scores and filtering

------------------
Supported Formats
------------------

The platform supports the following data formats:

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Format
     - Extensions
     - Description
   * - CSV/TXT
     - ``.csv``, ``.txt``
     - Delimited text with automatic delimiter detection
   * - JSON
     - ``.json``
     - Array of events or ``{events: [...]}`` structure
   * - GeoJSON
     - ``.geojson``, ``.json``
     - FeatureCollection with Point geometries
   * - QuakeML
     - ``.xml``, ``.qml``
     - QuakeML 1.2 BED (Basic Event Description) format

-----------
Quick Links
-----------

* :doc:`getting-started` - Set up and run the application
* :doc:`uploading-data` - Upload your first catalogue
* :doc:`importing-geonet` - Import data from GeoNet
* :doc:`visualization` - Explore visualization features
* :doc:`quality-assessment` - Understand quality metrics

----------
Next Steps
----------

Ready to get started? Head over to :doc:`getting-started` to install and configure the platform.

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

