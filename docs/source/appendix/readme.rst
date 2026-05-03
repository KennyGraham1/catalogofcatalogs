Earthquake Catalogue Platform
=============================


A web application for managing, analyzing, and visualizing earthquake catalogue data with support for multiple data formats, automated imports, and flexible merging capabilities.

🌟 Features
----------


📊 Data Management
^^^^^^^^^^^^^^^^^

- **Multi-format Upload**: Support for CSV, TXT, QuakeML (XML), JSON, and GeoJSON formats
- **Automated Delimiter Detection**: Auto-detects comma, tab, semicolon, pipe, or space delimiters
- **Automated Date Parsing**: Auto-detects US (MM/DD/YYYY) vs International (DD/MM/YYYY) date formats
- **Schema Normalization**: Automatic field mapping and validation
- **Catalogue Merging**: Flexible merging with configurable matching rules
- **QuakeML 1.2 Support**: Full implementation of QuakeML Basic Event Description (BED) specification
- **Large File Support**: Upload files up to 500MB with streaming parser for efficient processing

🌏 GeoNet Integration
^^^^^^^^^^^^^^^^^^^^

- **Automatic Data Import**: Real-time earthquake data from GeoNet FDSN Event Web Service
- **Flexible Filtering**: Filter by magnitude, depth, time range, and geographic bounds
- **Duplicate Detection**: Automated handling of duplicate events with update capabilities
- **Import History**: Complete tracking of all imports with detailed statistics

📈 Visualization & Analysis
^^^^^^^^^^^^^^^^^^^^^^^^^^

- **Interactive Maps**: Leaflet-based map visualization with event clustering
- **Enhanced Map View**: Visualization with uncertainty ellipses, focal mechanisms, and station coverage
- **Charts & Graphs**: Statistical analysis with Recharts
- **Quality Metrics**: Comprehensive quality scoring and filtering with A+ to F grading system
- **Event Filtering**: Filtering by multiple criteria
- **Analytics Dashboard**: Dedicated analytics page with quality distribution and detailed event analysis
- **Advanced Seismological Analytics**:
  - Gutenberg-Richter b-value analysis
  - Completeness magnitude (Mc) estimation
  - Temporal pattern analysis and cluster detection
  - Seismic moment calculations and energy release analysis

🔧 Additional Features
^^^^^^^^^^^^^^^^^^^^^

- **QuakeML Export**: Export catalogues to QuakeML 1.2 XML format
- **Quality-based Filtering**: Filter events by quality metrics (azimuthal gap, phase counts, uncertainties)
- **Uncertainty Tracking**: Full support for time, location, depth, and magnitude uncertainties
- **Uncertainty Visualization**: Visual representation of location uncertainties with ellipses and quality indicators
- **Focal Mechanism Display**: Beach ball diagrams showing fault plane solutions
- **Station Coverage Analysis**: Seismic network geometry and azimuthal gap visualization
- **Evaluation Metadata**: Track evaluation mode (manual/automatic) and status (preliminary/confirmed/reviewed/final)

🚀 Getting Started
-----------------


Prerequisites
^^^^^^^^^^^^^


- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **MongoDB**: Version 6.x or higher (local installation or MongoDB Atlas)

Installation
^^^^^^^^^^^^


1. **Clone the repository**
   ```bash
   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env with your configuration (see Environment Configuration below)
   ```

4. **Set up MongoDB**
   ```bash
   # Initialize database with collections and indexes
   npx tsx scripts/init-database.ts
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   Navigate to ``http://localhost:3000 <http://localhost:3000>``_

Environment Configuration
^^^^^^^^^^^^^^^^^^^^^^^^^


Create a ``.env`` file in the project root (this file is gitignored and will not be committed):

.. code-block:: bash

   # MongoDB Connection
   # For local MongoDB:
   MONGODB_URI=mongodb://localhost:27017/earthquake_catalogue
   
   # For MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/earthquake_catalogue
   
   # Optional: Override database name (otherwise extracted from URI)
   MONGODB_DATABASE=earthquake_catalogue
   
   # Application
   NODE_ENV=development
   
   # NextAuth (required for authentication)
   # Generate secret with: openssl rand -base64 32
   NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
   NEXTAUTH_URL=http://localhost:3000


MongoDB Atlas Setup
~~~~~~~~~~~~~~~~~~~


If using MongoDB Atlas:

1. Create a cluster at ``MongoDB Atlas <https://www.mongodb.com/atlas>``_
2. Create a database user with read/write permissions
3. Add your IP address to the Network Access list (or allow all IPs for development)
4. Copy the connection string from: **Clusters → Connect → Drivers → Node.js**
5. Replace the placeholder values in your ``.env`` file

The application automatically detects Atlas connections (``mongodb+srv://``) and applies optimized settings:
- Retry logic with exponential backoff (up to 5 retries)
- Longer timeouts for network latency
- Connection pooling (up to 50 connections)
- Automatic retry for reads and writes
- zlib compression for faster data transfer

🎯 Key Capabilities
------------------


Quality Assessment System
^^^^^^^^^^^^^^^^^^^^^^^^^

The platform includes a quality scoring system that evaluates earthquake locations based on:
- **Location Quality**: Horizontal and vertical uncertainties
- **Network Geometry**: Azimuthal gap and station distribution
- **Solution Quality**: Phase counts, standard error, and residuals
- **Magnitude Quality**: Station count and uncertainty

Events are graded from **A+** (excellent) to **F** (poor) based on weighted scoring across these components.

Data Integration
^^^^^^^^^^^^^^^^

- **Duplicate Detection**: Automated matching of events across catalogues using time, location, and magnitude
- **Event Updates**: Ability to update existing events with new data from imports
- **Source Tracking**: Complete provenance tracking for merged events
- **Field Mapping**: Flexible field mapping system with reusable templates

📖 Usage
-------


Uploading Data
^^^^^^^^^^^^^^


1. Navigate to the **Upload** page
2. Configure parsing options (optional):
   - **Delimiter**: Auto-detect or select (comma, tab, semicolon, pipe, space)
   - **Date Format**: Auto-detect or select (US MM/DD/YYYY, International DD/MM/YYYY, ISO)
3. Select your data file (CSV, TXT, QuakeML, JSON, GeoJSON)
4. Map fields to the standard schema
5. Upload and create a new catalogue

Supported File Formats
~~~~~~~~~~~~~~~~~~~~~~


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Format
     - Extensions
     - Description
   * - CSV/TXT
     - ``.csv``, ``.txt``
     - Delimited text with auto-detection
   * - JSON
     - ``.json``
     - Array of events or ``{events: [...]}`` structure
   * - GeoJSON
     - ``.geojson``, ``.json``
     - FeatureCollection with Point geometries
   * - QuakeML
     - ``.xml``, ``.qml``
     - QuakeML 1.2 BED format


Importing from GeoNet
^^^^^^^^^^^^^^^^^^^^^


1. Navigate to the **Import** page
2. Configure import parameters:
   - Time range (last N hours or custom date range)
   - Magnitude filters (min/max)
   - Depth filters (min/max)
   - Geographic bounds (optional bounding box)
3. Click "Start Import"
4. View import statistics and history
5. Enable "Update Existing Events" to refresh data for duplicate events

For detailed instructions, see ``GEONET_IMPORT_DOCUMENTATION.md <GEONET_IMPORT_DOCUMENTATION.md>``_

Merging Catalogues
^^^^^^^^^^^^^^^^^^


1. Navigate to the **Merge** page
2. Select source catalogues to merge
3. Configure matching rules:
   - Time window tolerance
   - Distance threshold
   - Magnitude difference threshold
4. Choose conflict resolution strategy
5. Create merged catalogue

Visualizing Data
^^^^^^^^^^^^^^^^


Navigate to the **Analytics** page for visualization and analysis features:
- Interactive map with event clustering
- Enhanced map with uncertainty ellipses
- Focal mechanism beach ball diagrams
- Station coverage visualization
- Quality score analysis
- Event detail cards with detailed metadata
- Gutenberg-Richter b-value calculation
- Completeness magnitude (Mc) estimation
- Temporal pattern analysis and cluster detection
- Seismic moment and energy release calculations

Exporting Data
^^^^^^^^^^^^^^


1. Navigate to the **Catalogues** page
2. Select a catalogue
3. Click the download icon for CSV export
4. Or use the QuakeML export feature for XML format (supports full QuakeML 1.2 BED specification)

🧪 Testing
---------


Run the test suite:

.. code-block:: bash

   # Run all tests
   npm test
   
   # Run tests in watch mode
   npm run test:watch
   
   # Run tests with coverage
   npm run test:coverage


📁 Project Structure
-------------------


.. code-block:: text

   catalogofcatalogs/
   ├── app/                    # Next.js app directory
   │   ├── api/               # API routes
   │   │   ├── catalogues/   # Catalogue CRUD operations
   │   │   ├── import/       # GeoNet import endpoints
   │   │   ├── merge/        # Catalogue merging
   │   │   └── upload/       # File upload handling
   │   ├── analytics/ # Seismological analytics
   │   ├── analytics/         # Quality analytics page
   │   ├── catalogues/        # Catalogue management pages
   │   ├── dashboard/         # Dashboard page
   │   ├── import/            # GeoNet import page
   │   ├── merge/             # Catalogue merging page
   │   ├── settings/          # Application settings
   │   ├── upload/            # Data upload page
   │   └── visualize/         # Visualization pages
   ├── components/            # React components
   │   ├── viz/      # Visualization components
   │   │   ├── BeachBallMarker.tsx        # Focal mechanism markers
   │   │   ├── EnhancedMapView.tsx        # Enhanced map with all features
   │   │   ├── FocalMechanismCard.tsx     # Focal mechanism display
   │   │   ├── QualityScoreCard.tsx       # Quality assessment
   │   │   ├── StationCoverageCard.tsx    # Station coverage analysis
   │   │   ├── StationMarker.tsx          # Seismic station markers
   │   │   ├── UncertaintyEllipse.tsx     # Uncertainty visualization
   │   │   └── UncertaintyVisualization.tsx
   │   ├── catalogues/        # Catalogue-specific components
   │   ├── import/            # Import form and history
   │   ├── merge/             # Merge configuration components
   │   ├── ui/                # Reusable UI components (shadcn/ui)
   │   └── upload/            # Upload form components
   ├── lib/                   # Core library code
   │   ├── mongodb.ts                    # MongoDB client (Atlas-optimized)
   │   ├── db.ts                         # Database queries and schema
   │   ├── parsers.ts                    # Multi-format file parsers
   │   ├── delimiter-detector.ts         # Automated delimiter detection
   │   ├── date-format-detector.ts       # US/International date detection
   │   ├── earthquake-utils.ts           # Earthquake calculations
   │   ├── focal-mechanism-utils.ts      # Focal mechanism parsing
   │   ├── geo-bounds-utils.ts           # Geographic bounds utilities
   │   ├── geonet-client.ts              # GeoNet API client
   │   ├── geonet-import-service.ts      # Import service
   │   ├── merge.ts                      # Catalogue merging logic
   │   ├── quality-scoring.ts            # Quality assessment algorithms
   │   ├── quakeml-exporter.ts           # QuakeML export
   │   ├── quakeml-parser.ts             # QuakeML import
   │   ├── seismological-analysis.ts     # Seismological analytics
   │   ├── station-coverage-utils.ts     # Station coverage analysis
   │   ├── uncertainty-utils.ts          # Uncertainty calculations
   │   └── types/                        # TypeScript type definitions
   ├── scripts/               # Utility scripts
   │   ├── init-database.ts              # Database initialization
   │   ├── migrate-add-source-id.js      # Database migration
   │   └── migrate-add-geo-bounds.js     # Geographic bounds migration
   └── __tests__/             # Jest test files



🛠 Technology Stack
------------------


Frontend
^^^^^^^^

- **Next.js 13**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality React components (40+ Radix UI components)
- **Recharts**: Data visualization library
- **Leaflet**: Interactive map library with React Leaflet
- **React Hook Form**: Form validation and management
- **Zod**: Schema validation
- **date-fns**: Date manipulation and formatting
- **Lucide React**: Icon library

Backend
^^^^^^^

- **Next.js API Routes**: Serverless API endpoints
- **MongoDB**: Scalable NoSQL database with full QuakeML 1.2 schema
- **xml2js**: XML parsing for QuakeML
- **uuid**: Unique identifier generation

Testing
^^^^^^^

- **Jest**: JavaScript testing framework
- **Testing Library**: React component testing
- **@types packages**: Full TypeScript type coverage

📚 Documentation
---------------


📖 Technical Documentation
^^^^^^^^^^^^^^^^^^^^^^^^^


- **``API Reference <docs/API_REFERENCE.md>``_** - Complete API documentation
- **``Architecture <docs/ARCHITECTURE.md>``_** - System architecture diagrams
- **``Data Validation Guide <docs/DATA_VALIDATION_GUIDE.md>``_** - Data quality and validation

📋 Feature-Specific Documentation
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


- **``GeoNet Baseline Setup <docs/GEONET_BASELINE_SETUP.md>``_** - Setting up baseline GeoNet data
- **``GeoNet Implementation Summary <docs/GEONET_IMPORT_IMPLEMENTATION_SUMMARY.md>``_** - Technical implementation details
- **``QuakeML Schema Design <docs/QUAKEML_SCHEMA_DESIGN.md>``_** - Database schema for QuakeML 1.2 support
- **``Quick Test Guide <docs/QUICK_TEST_GUIDE.md>``_** - Quick reference for testing features

🔌 API Endpoints
---------------


Catalogues
^^^^^^^^^^

- ``GET /api/catalogues`` - List all catalogues with metadata
- ``GET /api/catalogues/[id]`` - Get catalogue details
- ``PATCH /api/catalogues/[id]`` - Update catalogue name
- ``DELETE /api/catalogues/[id]`` - Delete catalogue and all events
- ``GET /api/catalogues/[id]/download`` - Download catalogue as CSV
- ``GET /api/catalogues/[id]/events`` - Get events in catalogue with filtering
- ``POST /api/catalogues/[id]/export/quakeml`` - Export to QuakeML 1.2 XML format

Import
^^^^^^

- ``POST /api/import/geonet`` - Import from GeoNet FDSN service
  - Supports time range, magnitude, depth, and geographic filters
  - Handles duplicate detection and event updates
- ``GET /api/import/history`` - Get import history for a catalogue

Upload
^^^^^^

- ``POST /api/upload`` - Upload and parse data file
  - Supports CSV, TXT, QuakeML (XML), JSON, GeoJSON formats
  - Optional ``delimiter`` parameter: ``comma``, ``tab``, ``semicolon``, ``pipe``, ``space``
  - Optional ``dateFormat`` parameter: ``US``, ``International``, ``ISO``
  - Returns parsed data and suggested field mappings
  - Maximum file size: 500MB

Merge
^^^^^

- ``POST /api/merge`` - Merge multiple catalogues
  - Configurable matching rules (time, distance, magnitude)
  - Multiple merge strategies (priority, average, newest, complete)

🌐 Data Sources
--------------


GeoNet (New Zealand)
^^^^^^^^^^^^^^^^^^^^

- **Service**: FDSN Event Web Service
- **URL**: https://service.geonet.org.nz/fdsnws/event/1/query
- **Coverage**: New Zealand and surrounding regions
- **License**: Creative Commons Attribution 4.0 International License
- **Formats**: Text (pipe-delimited), QuakeML XML

🗄 Database Schema
-----------------


The application uses MongoDB with the following main collections:

`merged_catalogues`
^^^^^^^^^^^^^^^^^^^

Stores catalogue metadata:
- ``id`` (string)
- ``name`` (string)
- ``created_at`` (Date)
- ``source_catalogues`` (JSON array)
- ``merge_config`` (JSON object)
- ``event_count`` (number)
- ``status`` (string)
- Geographic bounds: ``min_latitude``, ``max_latitude``, ``min_longitude``, ``max_longitude``

`merged_events`
^^^^^^^^^^^^^^^

Stores earthquake events with full QuakeML 1.2 support:
- **Basic fields**: ``time``, ``latitude``, ``longitude``, ``depth``, ``magnitude``
- **QuakeML Event metadata**: ``event_public_id``, ``event_type``, ``event_type_certainty``
- **Origin uncertainties**: ``time_uncertainty``, ``latitude_uncertainty``, ``longitude_uncertainty``, ``depth_uncertainty``
- **Magnitude details**: ``magnitude_type``, ``magnitude_uncertainty``, ``magnitude_station_count``
- **Origin quality metrics**: ``azimuthal_gap``, ``used_phase_count``, ``used_station_count``, ``standard_error``
- **Evaluation metadata**: ``evaluation_mode``, ``evaluation_status``
- **Complex nested data** (JSON): ``origins``, ``magnitudes``, ``picks``, ``arrivals``, ``focal_mechanisms``, ``amplitudes``, ``station_magnitudes``, ``event_descriptions``, ``comments``, ``creation_info``
- **Source tracking**: ``source_id`` (original event ID), ``source_events`` (array of source information)

`import_history`
^^^^^^^^^^^^^^^^

Tracks all GeoNet imports:
- ``id``, ``catalogue_id``, ``start_time``, ``end_time``
- Statistics: ``total_fetched``, ``new_events``, ``updated_events``, ``skipped_events``
- ``errors`` (JSON array)
- ``created_at`` (Date)

`mapping_templates`
^^^^^^^^^^^^^^^^^^^

Stores reusable field mapping templates for data uploads

For complete schema details, see ``QUAKEML_SCHEMA_DESIGN.md <QUAKEML_SCHEMA_DESIGN.md>``_

🔒 Security
----------


Environment Variables
^^^^^^^^^^^^^^^^^^^^^


Sensitive credentials are managed through environment variables:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Variable
     - Description
     - Required
   * - ``MONGODB_URI``
     - MongoDB connection string
     - Yes
   * - ``MONGODB_DATABASE``
     - Database name (optional, extracted from URI)
     - No
   * - ``NEXTAUTH_SECRET``
     - Authentication secret
     - Yes
   * - ``NEXTAUTH_URL``
     - Application URL
     - Yes


**Important**:
- The ``.env`` file is gitignored and will never be committed
- Use ``.env.example`` as a template (committed without real values)
- For production, use your hosting platform's environment variable management

Deployment Environment Variables
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Platform
     - Where to Configure
   * - **Vercel**
     - Project Settings → Environment Variables
   * - **Railway**
     - Project → Variables
   * - **Fly.io**
     - ``fly secrets set MONGODB_URI=...``
   * - **Heroku**
     - Settings → Config Vars
   * - **GitHub Actions**
     - Repository Settings → Secrets


🚧 Development
-------------


Running in Development Mode
^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   npm run dev


The application will be available at ``http://localhost:3000 <http://localhost:3000>``_

Building for Production
^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   npm run build
   npm start


Linting
^^^^^^^


.. code-block:: bash

   npm run lint


Database Management
^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   # Clean and reset database
   bash scripts/clean-and-setup-database.sh
   
   # Initialize database
   npm run tsx scripts/init-database.ts
   
   # Run migrations
   node scripts/migrate-add-source-id.js
   node scripts/migrate-add-geo-bounds.js
   
   # Fix missing geographic bounds
   npm run tsx scripts/fix-missing-geo-bounds.ts
   
   # Populate realistic test data
   npm run tsx scripts/populate-realistic-nz-data.ts


For detailed database management instructions, see ``DATABASE_MANAGEMENT.md <DATABASE_MANAGEMENT.md>``_


Code Style
^^^^^^^^^^


- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

👥 Authors
---------


- Kenny Graham - Earth Sciences NZ

🙏 Acknowledgments
-----------------


- **GeoNet**: For providing real-time earthquake data via FDSN web services
- **QuakeML**: For the standardized earthquake data format specification
- **shadcn/ui**: For the beautiful UI component library
- **Next.js Team**: For the excellent React framework

🗺️ Roadmap
----------


Completed Features ✅
^^^^^^^^^^^^^^^^^^^^

- [x] Multi-format data upload (CSV, TXT, QuakeML, JSON, GeoJSON)
- [x] Automated delimiter auto-detection (comma, tab, semicolon, pipe, space)
- [x] Automated date format detection (US vs International)
- [x] Large file support (up to 500MB)
- [x] GeoNet automatic import with duplicate detection
- [x] Catalogue merging with configurable rules
- [x] QuakeML 1.2 BED specification support
- [x] Interactive map visualization with marker clustering
- [x] Visualization (uncertainty ellipses, focal mechanisms, station coverage)
- [x] Quality scoring and filtering (A+ to F grading)
- [x] Analytics dashboard with seismological analysis
- [x] QuakeML export
- [x] Import history tracking
- [x] Geographic bounds filtering
- [x] MongoDB Atlas support with auto-reconnect
- [x] Performance optimizations (memoization, virtualized tables)

Planned Features 🚀
^^^^^^^^^^^^^^^^^^

- [ ] Scheduled automatic imports with background job scheduler
- [ ] Multi-source import (additional FDSN services)
- [ ] Enhanced QuakeML support with full picks and arrivals
- [ ] Data quality validation and anomaly detection
- [ ] Export to additional formats (GeoJSON, KML)
- [ ] Collaborative features (sharing, comments, annotations)
- [ ] Real-time event notifications
- [ ] Custom quality scoring algorithms

📊 Project Status
----------------


**Status**: ✅ Production Ready

The application is fully functional with features for earthquake catalogue management, including:
- ✅ Data upload and parsing (CSV, TXT, JSON, GeoJSON, QuakeML)
- ✅ Automated format detection (delimiters, date formats)
- ✅ GeoNet automatic import
- ✅ Catalogue merging
- ✅ QuakeML 1.2 support
- ✅ Interactive visualization with clustering
- ✅ Seismological analytics
- ✅ Quality-based filtering
- ✅ MongoDB Atlas integration
- ✅ 400+ automated tests
- ✅ Full documentation



**Last Updated**: January 2026
