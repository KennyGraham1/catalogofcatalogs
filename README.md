# Earthquake Catalogue Platform

A comprehensive web application for managing, analyzing, and visualizing earthquake catalogue data with support for multiple data formats, automated imports, and advanced merging capabilities.

## 🌟 Features

### 📊 Data Management
- **Multi-format Upload**: Support for CSV, TXT, QuakeML (XML), JSON formats
- **Schema Normalization**: Automatic field mapping and validation
- **Catalogue Merging**: Advanced merging with configurable matching rules
- **QuakeML 1.2 Support**: Full implementation of QuakeML Basic Event Description (BED) specification

### 🌏 GeoNet Integration
- **Automatic Data Import**: Real-time earthquake data from GeoNet FDSN Event Web Service
- **Flexible Filtering**: Filter by magnitude, depth, time range, and geographic bounds
- **Duplicate Detection**: Intelligent handling of duplicate events with update capabilities
- **Import History**: Complete tracking of all imports with detailed statistics

### 📈 Visualization & Analysis
- **Interactive Maps**: Leaflet-based map visualization with event clustering
- **Enhanced Map View**: Advanced visualization with uncertainty ellipses, focal mechanisms, and station coverage
- **Charts & Graphs**: Statistical analysis with Recharts
- **Quality Metrics**: Comprehensive quality scoring and filtering with A+ to F grading system
- **Event Filtering**: Advanced filtering by multiple criteria
- **Analytics Dashboard**: Dedicated analytics page with quality distribution and detailed event analysis
- **Advanced Seismological Analytics**:
  - Gutenberg-Richter b-value analysis
  - Completeness magnitude (Mc) estimation
  - Temporal pattern analysis and cluster detection
  - Seismic moment calculations and energy release analysis

### 🔧 Advanced Features
- **QuakeML Export**: Export catalogues to QuakeML 1.2 XML format
- **Quality-based Filtering**: Filter events by quality metrics (azimuthal gap, phase counts, uncertainties)
- **Uncertainty Tracking**: Full support for time, location, depth, and magnitude uncertainties
- **Uncertainty Visualization**: Visual representation of location uncertainties with ellipses and quality indicators
- **Focal Mechanism Display**: Beach ball diagrams showing fault plane solutions
- **Station Coverage Analysis**: Seismic network geometry and azimuthal gap visualization
- **Evaluation Metadata**: Track evaluation mode (manual/automatic) and status (preliminary/confirmed/reviewed/final)

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **SQLite3**: For database storage

### Installation

1. **Clone the repository**
   ```bash
   git clone https://git.gns.cri.nz/earthquake/catalogofcatalogs.git
   cd catalogofcatalogs
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   # Initialize database with schema
   npm run tsx scripts/init-database.ts

   # Run database migrations
   node scripts/migrate-add-source-id.js
   node scripts/migrate-add-geo-bounds.js
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 Key Capabilities

### Quality Assessment System
The platform includes a comprehensive quality scoring system that evaluates earthquake locations based on:
- **Location Quality**: Horizontal and vertical uncertainties
- **Network Geometry**: Azimuthal gap and station distribution
- **Solution Quality**: Phase counts, standard error, and residuals
- **Magnitude Quality**: Station count and uncertainty

Events are graded from **A+** (excellent) to **F** (poor) based on weighted scoring across these components.

### Advanced Visualization Features
- **Uncertainty Ellipses**: Visual representation of location uncertainties on maps
- **Focal Mechanisms**: Beach ball diagrams showing fault plane solutions
- **Station Coverage**: Seismic network geometry and azimuthal gap visualization
- **Quality Color Coding**: Events colored by quality grade
- **Interactive Filtering**: Real-time filtering by magnitude, depth, quality, and time

### Data Integration
- **Duplicate Detection**: Intelligent matching of events across catalogues using time, location, and magnitude
- **Event Updates**: Ability to update existing events with new data from imports
- **Source Tracking**: Complete provenance tracking for merged events
- **Field Mapping**: Flexible field mapping system with reusable templates

## 📖 Usage

### Uploading Data

1. Navigate to the **Upload** page
2. Select your data file (CSV, TXT, QuakeML, JSON)
3. Map fields to the standard schema
4. Upload and create a new catalogue

### Importing from GeoNet

1. Navigate to the **Import** page
2. Configure import parameters:
   - Time range (last N hours or custom date range)
   - Magnitude filters (min/max)
   - Depth filters (min/max)
   - Geographic bounds (optional bounding box)
3. Click "Start Import"
4. View import statistics and history
5. Enable "Update Existing Events" to refresh data for duplicate events

For detailed instructions, see [GEONET_IMPORT_DOCUMENTATION.md](GEONET_IMPORT_DOCUMENTATION.md)

### Merging Catalogues

1. Navigate to the **Merge** page
2. Select source catalogues to merge
3. Configure matching rules:
   - Time window tolerance
   - Distance threshold
   - Magnitude difference threshold
4. Choose conflict resolution strategy
5. Create merged catalogue

### Visualizing Data

1. Navigate to the **Visualize** page to see basic map visualization
2. Navigate to the **Analytics** page for advanced features:
   - Enhanced map with uncertainty ellipses
   - Focal mechanism beach ball diagrams
   - Station coverage visualization
   - Quality score analysis
   - Event detail cards with comprehensive metadata
3. Navigate to the **Advanced Analytics** page for seismological analysis:
   - Gutenberg-Richter b-value calculation
   - Completeness magnitude (Mc) estimation
   - Temporal pattern analysis and cluster detection
   - Seismic moment and energy release calculations

For detailed information, see [ADVANCED_ANALYTICS_DOCUMENTATION.md](ADVANCED_ANALYTICS_DOCUMENTATION.md)

### Exporting Data

1. Navigate to the **Catalogues** page
2. Select a catalogue
3. Click the download icon for CSV export
4. Or use the QuakeML export feature for XML format (supports full QuakeML 1.2 BED specification)

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📁 Project Structure

```
catalogofcatalogs/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── catalogues/   # Catalogue CRUD operations
│   │   ├── import/       # GeoNet import endpoints
│   │   ├── merge/        # Catalogue merging
│   │   └── upload/       # File upload handling
│   ├── advanced-analytics/ # Advanced seismological analytics
│   ├── analytics/         # Quality analytics page
│   ├── catalogues/        # Catalogue management pages
│   ├── dashboard/         # Dashboard page
│   ├── import/            # GeoNet import page
│   ├── merge/             # Catalogue merging page
│   ├── settings/          # Application settings
│   ├── upload/            # Data upload page
│   └── visualize/         # Visualization pages
├── components/            # React components
│   ├── advanced-viz/      # Advanced visualization components
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
│   ├── db.ts              # Database queries and schema
│   ├── earthquake-utils.ts           # Earthquake calculations
│   ├── focal-mechanism-utils.ts      # Focal mechanism parsing
│   ├── geo-bounds-utils.ts           # Geographic bounds utilities
│   ├── geonet-client.ts              # GeoNet API client
│   ├── geonet-import-service.ts      # Import service
│   ├── merge.ts                      # Catalogue merging logic
│   ├── parsers.ts                    # Data format parsers
│   ├── quality-scoring.ts            # Quality assessment algorithms
│   ├── quakeml-exporter.ts           # QuakeML export
│   ├── quakeml-parser.ts             # QuakeML import
│   ├── seismological-analysis.ts     # Advanced seismological analytics
│   ├── station-coverage-utils.ts     # Station coverage analysis
│   ├── uncertainty-utils.ts          # Uncertainty calculations
│   └── types/                        # TypeScript type definitions
├── scripts/               # Utility scripts
│   ├── init-database.ts              # Database initialization
│   ├── migrate-add-source-id.js      # Database migration
│   └── migrate-add-geo-bounds.js     # Geographic bounds migration
└── __tests__/             # Jest test files
```


## 🛠 Technology Stack

### Frontend
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

### Backend
- **Next.js API Routes**: Serverless API endpoints
- **SQLite3**: Lightweight database with full QuakeML 1.2 schema
- **xml2js**: XML parsing for QuakeML
- **uuid**: Unique identifier generation

### Testing
- **Jest**: JavaScript testing framework
- **Testing Library**: React component testing
- **@types packages**: Full TypeScript type coverage

## 📚 Documentation

### 📖 User Documentation

- **[User Guide](docs/USER_GUIDE.md)** - Complete guide for end users
  - Getting started and navigation
  - Managing catalogues
  - Uploading and importing data
  - Visualization and analytics
  - Exporting data
  - Advanced features and best practices

- **[FAQ](docs/FAQ.md)** - Frequently asked questions
  - Common issues and solutions
  - Best practices
  - Troubleshooting guide

### 🔧 Technical Documentation

- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Technical documentation for developers
  - Architecture overview
  - Technology stack and project structure
  - Development workflow
  - Testing and deployment
  - Contributing guidelines

- **[API Reference](docs/API_REFERENCE.md)** - Complete API documentation
  - All endpoints with examples
  - Request/response formats
  - Error handling
  - Authentication (future)

- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md)** - Production deployment instructions
  - Environment setup
  - Docker deployment
  - Manual deployment with systemd
  - Reverse proxy configuration
  - Security hardening
  - Monitoring and backup strategies

- **[Data Validation Guide](docs/DATA_VALIDATION_GUIDE.md)** - Data quality and validation
  - Validation rules and constraints
  - Quality metrics and scoring
  - Best practices for data quality

### 📋 Feature-Specific Documentation

- **[GeoNet Import Documentation](docs/GEONET_IMPORT_DOCUMENTATION.md)** - Complete guide to the GeoNet automatic import feature
- **[GeoNet Baseline Setup](docs/GEONET_BASELINE_SETUP.md)** - Setting up baseline GeoNet data
- **[GeoNet Implementation Summary](docs/GEONET_IMPORT_IMPLEMENTATION_SUMMARY.md)** - Technical implementation details
- **[QuakeML Schema Design](docs/QUAKEML_SCHEMA_DESIGN.md)** - Database schema for QuakeML 1.2 support
- **[QuakeML Testing Report](docs/QUAKEML_TESTING_REPORT.md)** - Comprehensive testing results
- **[Database Management](docs/DATABASE_MANAGEMENT.md)** - Database storage, backups, and maintenance
- **[Quick Test Guide](docs/QUICK_TEST_GUIDE.md)** - Quick reference for testing features

## 🔌 API Endpoints

### Catalogues
- `GET /api/catalogues` - List all catalogues with metadata
- `GET /api/catalogues/[id]` - Get catalogue details
- `PATCH /api/catalogues/[id]` - Update catalogue name
- `DELETE /api/catalogues/[id]` - Delete catalogue and all events
- `GET /api/catalogues/[id]/download` - Download catalogue as CSV
- `GET /api/catalogues/[id]/events` - Get events in catalogue with filtering
- `POST /api/catalogues/[id]/export/quakeml` - Export to QuakeML 1.2 XML format

### Import
- `POST /api/import/geonet` - Import from GeoNet FDSN service
  - Supports time range, magnitude, depth, and geographic filters
  - Handles duplicate detection and event updates
- `GET /api/import/history` - Get import history for a catalogue

### Upload
- `POST /api/upload` - Upload and parse data file
  - Supports CSV, TXT, QuakeML (XML), JSON formats
  - Returns parsed data and suggested field mappings

### Merge
- `POST /api/merge` - Merge multiple catalogues
  - Configurable matching rules (time, distance, magnitude)
  - Multiple merge strategies (priority, average, newest, complete)

## 🌐 Data Sources

### GeoNet (New Zealand)
- **Service**: FDSN Event Web Service
- **URL**: https://service.geonet.org.nz/fdsnws/event/1/query
- **Coverage**: New Zealand and surrounding regions
- **License**: Creative Commons Attribution 4.0 International License
- **Formats**: Text (pipe-delimited), QuakeML XML

## 🗄 Database Schema

The application uses SQLite with the following main tables:

### `merged_catalogues`
Stores catalogue metadata:
- `id` (TEXT PRIMARY KEY)
- `name` (TEXT)
- `created_at` (DATETIME)
- `source_catalogues` (TEXT/JSON)
- `merge_config` (TEXT/JSON)
- `event_count` (INTEGER)
- `status` (TEXT)
- Geographic bounds: `min_latitude`, `max_latitude`, `min_longitude`, `max_longitude`

### `merged_events`
Stores earthquake events with full QuakeML 1.2 support:
- **Basic fields**: `time`, `latitude`, `longitude`, `depth`, `magnitude`
- **QuakeML Event metadata**: `event_public_id`, `event_type`, `event_type_certainty`
- **Origin uncertainties**: `time_uncertainty`, `latitude_uncertainty`, `longitude_uncertainty`, `depth_uncertainty`
- **Magnitude details**: `magnitude_type`, `magnitude_uncertainty`, `magnitude_station_count`
- **Origin quality metrics**: `azimuthal_gap`, `used_phase_count`, `used_station_count`, `standard_error`
- **Evaluation metadata**: `evaluation_mode`, `evaluation_status`
- **Complex nested data** (JSON): `origins`, `magnitudes`, `picks`, `arrivals`, `focal_mechanisms`, `amplitudes`, `station_magnitudes`, `event_descriptions`, `comments`, `creation_info`
- **Source tracking**: `source_id` (original event ID), `source_events` (array of source information)

### `import_history`
Tracks all GeoNet imports:
- `id`, `catalogue_id`, `start_time`, `end_time`
- Statistics: `total_fetched`, `new_events`, `updated_events`, `skipped_events`
- `errors` (TEXT/JSON)
- `created_at` (DATETIME)

### `mapping_templates`
Stores reusable field mapping templates for data uploads

For complete schema details, see [QUAKEML_SCHEMA_DESIGN.md](QUAKEML_SCHEMA_DESIGN.md)

## 🚧 Development

### Running in Development Mode

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

### Database Management

```bash
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
```

For detailed database management instructions, see [DATABASE_MANAGEMENT.md](DATABASE_MANAGEMENT.md)


### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

## 👥 Authors

- Kenny Graham - GNS Science

## � Acknowledgments

- **GeoNet**: For providing real-time earthquake data via FDSN web services
- **QuakeML**: For the standardized earthquake data format specification
- **shadcn/ui**: For the beautiful UI component library
- **Next.js Team**: For the excellent React framework

## �🗺 Roadmap

### Completed Features ✅
- [x] Multi-format data upload (CSV, TXT, QuakeML, JSON)
- [x] GeoNet automatic import with duplicate detection
- [x] Catalogue merging with configurable rules
- [x] QuakeML 1.2 BED specification support
- [x] Interactive map visualization
- [x] Advanced visualization (uncertainty ellipses, focal mechanisms, station coverage)
- [x] Quality scoring and filtering (A+ to F grading)
- [x] Analytics dashboard
- [x] QuakeML export
- [x] Import history tracking
- [x] Geographic bounds filtering

### Planned Features 🚀
- [ ] Scheduled automatic imports with background job scheduler
- [ ] Multi-source import (USGS, IRIS, other FDSN services)
- [ ] Enhanced QuakeML support with full picks and arrivals
- [ ] Advanced data quality validation and anomaly detection
- [ ] Export to additional formats (GeoJSON, KML)
- [ ] User authentication and authorization
- [ ] Collaborative features (sharing, comments, annotations)
- [ ] Performance optimization for large datasets (>100k events)
- [ ] Real-time event notifications
- [ ] Custom quality scoring algorithms

## 📊 Project Status

**Status**: ✅ Production Ready

The application is fully functional with comprehensive features for earthquake catalogue management, including:
- ✅ Data upload and parsing
- ✅ GeoNet automatic import
- ✅ Catalogue merging
- ✅ QuakeML 1.2 support
- ✅ Interactive visualization
- ✅ Advanced analytics
- ✅ Quality-based filtering
- ✅ Complete test coverage
- ✅ Full documentation

---

**Last Updated**: October 29, 2025

