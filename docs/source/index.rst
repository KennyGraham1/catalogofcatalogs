.. Earthquake Catalogue Platform documentation master file

========================================
Earthquake Catalogue Platform
========================================

Welcome to the Earthquake Catalogue Platform documentation!

A comprehensive web application for managing, analyzing, and visualizing earthquake catalogue data with support for multiple data formats, automated imports, and flexible merging capabilities.

.. image:: https://img.shields.io/badge/version-1.0.0-blue.svg
   :alt: Version 1.0.0

.. image:: https://img.shields.io/badge/license-MIT-green.svg
   :alt: MIT License

.. image:: https://img.shields.io/badge/Next.js-13+-black.svg
   :alt: Next.js 13+

--------
Features
--------

📊 **Data Management**
   - Multi-format upload (CSV, TXT, QuakeML, JSON, GeoJSON)
   - Smart delimiter and date format detection
   - Schema normalization and validation
   - Catalogue merging with configurable rules
   - Large file support (up to 500MB)

🌏 **GeoNet Integration**
   - Automatic data import from GeoNet FDSN Event Web Service
   - Flexible filtering by magnitude, depth, time, and location
   - Intelligent duplicate detection and event updates
   - Complete import history tracking

📈 **Visualization & Analysis**
   - Interactive Leaflet-based maps with clustering
   - Uncertainty ellipses and focal mechanisms
   - Quality metrics with A+ to F grading
   - Advanced seismological analytics (b-value, Mc, temporal patterns)
   - Station coverage analysis

🔧 **Additional Features**
   - QuakeML 1.2 export/import
   - Quality-based filtering
   - Role-based access control
   - Comprehensive API

-----------
Quick Start
-----------

.. code-block:: bash

   # Clone the repository
   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs

   # Install dependencies
   npm install

   # Configure environment
   cp .env.example .env
   # Edit .env with your MongoDB connection and secrets

   # Initialize database
   npx tsx scripts/init-database.ts

   # Start development server
   npm run dev

Visit http://localhost:3000 to access the application.

-------------
Documentation
-------------

.. toctree::
   :maxdepth: 2
   :caption: User Guide

   user-guide/index
   user-guide/getting-started
   user-guide/uploading-data
   user-guide/importing-geonet
   user-guide/merging-catalogues
   user-guide/visualization
   user-guide/exporting-data
   user-guide/quality-assessment

.. toctree::
   :maxdepth: 2
   :caption: Developer Guide

   developer-guide/index
   developer-guide/architecture
   developer-guide/setup
   developer-guide/database-schema
   developer-guide/api-development
   developer-guide/testing
   developer-guide/contributing

.. toctree::
   :maxdepth: 2
   :caption: API Reference

   api-reference/index
   api-reference/catalogues
   api-reference/events
   api-reference/import
   api-reference/upload
   api-reference/merge
   api-reference/export
   api-reference/authentication

.. toctree::
   :maxdepth: 2
   :caption: Deployment & Administration

   deployment/index
   deployment/environment-setup
   deployment/vercel
   deployment/docker
   deployment/mongodb-atlas
   administration/authentication
   administration/user-management
   administration/monitoring

.. toctree::
   :maxdepth: 1
   :caption: Additional Resources

   data-validation
   troubleshooting
   glossary
   changelog
   contributing

------------------
Indices and tables
------------------

* :ref:`genindex`
* :ref:`search`
* :doc:`glossary`

-------
License
-------

This project is developed by Kenny Graham at GNS Science.

**Last Updated:** January 2026

