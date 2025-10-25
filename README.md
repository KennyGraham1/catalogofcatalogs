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
- **Charts & Graphs**: Statistical analysis with Recharts
- **Quality Metrics**: Comprehensive quality scoring and filtering
- **Event Filtering**: Advanced filtering by multiple criteria

### 🔧 Advanced Features
- **QuakeML Export**: Export catalogues to QuakeML 1.2 XML format
- **Quality-based Filtering**: Filter events by quality metrics (azimuthal gap, phase counts, uncertainties)
- **Uncertainty Tracking**: Full support for time, location, depth, and magnitude uncertainties
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
   # Run database migrations
   node scripts/migrate-add-source-id.js

   # (Optional) Populate test data
   node scripts/populate-test-data.js
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

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
   - Geographic bounds (optional)
3. Click "Start Import"
4. View import statistics and history

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

### Exporting Data

1. Navigate to the **Catalogues** page
2. Select a catalogue
3. Click the download icon for CSV export
4. Or use the QuakeML export feature for XML format

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

Test specific features:

```bash
# Test GeoNet import
node scripts/test-geonet-import.js

# Test QuakeML features
node scripts/test-quakeml-features.js
```

## 📁 Project Structure

```
catalogofcatalogs/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── catalogues/        # Catalogue management pages
│   ├── dashboard/         # Dashboard page
│   ├── import/            # GeoNet import page
│   ├── merge/             # Catalogue merging page
│   ├── upload/            # Data upload page
│   └── visualize/         # Visualization pages
├── components/            # React components
│   ├── catalogues/        # Catalogue-specific components
│   ├── import/            # Import form and history
│   ├── merge/             # Merge configuration components
│   ├── ui/                # Reusable UI components (shadcn/ui)
│   └── upload/            # Upload form components
├── lib/                   # Core library code
│   ├── db.ts              # Database queries and schema
│   ├── geonet-client.ts   # GeoNet API client
│   ├── geonet-import-service.ts  # Import service
│   ├── parsers.ts         # Data format parsers
│   ├── quakeml-exporter.ts       # QuakeML export
│   ├── quakeml-parser.ts         # QuakeML import
│   ├── merge.ts           # Catalogue merging logic
│   └── types/             # TypeScript type definitions
├── scripts/               # Utility scripts
│   ├── migrate-add-source-id.js  # Database migration
│   ├── test-geonet-import.js     # GeoNet import tests
│   └── populate-test-data.js     # Test data generation
├── __tests__/             # Jest test files
└── test-data/             # Sample data files
```


## 🛠 Technology Stack

### Frontend
- **Next.js 13**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **shadcn/ui**: High-quality React components
- **Recharts**: Data visualization library
- **Leaflet**: Interactive map library
- **React Hook Form**: Form validation and management
- **Zod**: Schema validation

### Backend
- **Next.js API Routes**: Serverless API endpoints
- **SQLite3**: Lightweight database
- **xml2js**: XML parsing for QuakeML

### Testing
- **Jest**: JavaScript testing framework
- **Testing Library**: React component testing

## 📚 Documentation

- **[GeoNet Import Documentation](GEONET_IMPORT_DOCUMENTATION.md)**: Complete guide to the GeoNet automatic import feature
- **[GeoNet Implementation Summary](GEONET_IMPORT_IMPLEMENTATION_SUMMARY.md)**: Technical implementation details
- **[QuakeML Schema Design](QUAKEML_SCHEMA_DESIGN.md)**: Database schema for QuakeML 1.2 support
- **[QuakeML Testing Report](QUAKEML_TESTING_REPORT.md)**: Comprehensive testing results
- **[Catalogues Page Fixes](CATALOGUES_PAGE_FIXES.md)**: Bug fixes and improvements

## 🔌 API Endpoints

### Catalogues
- `GET /api/catalogues` - List all catalogues
- `GET /api/catalogues/[id]` - Get catalogue details
- `PATCH /api/catalogues/[id]` - Update catalogue name
- `DELETE /api/catalogues/[id]` - Delete catalogue
- `GET /api/catalogues/[id]/download` - Download catalogue as CSV
- `GET /api/catalogues/[id]/events` - Get events in catalogue
- `POST /api/catalogues/[id]/export/quakeml` - Export to QuakeML format

### Import
- `POST /api/import/geonet` - Import from GeoNet FDSN service
- `GET /api/import/history` - Get import history for a catalogue

### Upload
- `POST /api/upload` - Upload and parse data file

### Merge
- `POST /api/merge` - Merge multiple catalogues

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

### `merged_events`
Stores earthquake events with full QuakeML 1.2 support:
- Basic fields: `time`, `latitude`, `longitude`, `depth`, `magnitude`
- QuakeML fields: 29 additional fields for uncertainties, quality metrics, evaluation metadata
- `source_id` (TEXT) - Original event ID from data source
- `source_events` (TEXT/JSON) - Array of source event information

### `import_history`
Tracks all GeoNet imports:
- `id`, `catalogue_id`, `start_time`, `end_time`
- Statistics: `total_fetched`, `new_events`, `updated_events`, `skipped_events`
- `errors` (TEXT/JSON)

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

# Run migrations
node scripts/migrate-add-source-id.js

# Populate test data
node scripts/populate-test-data.js
```

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Merge Request

### Code Style

- Use TypeScript for all new code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

## 📝 License

This project is developed for earthquake research and monitoring purposes.

## 👥 Authors

- GNS Science Earthquake Team

## 🙏 Acknowledgments

- **GeoNet**: For providing real-time earthquake data via FDSN web services
- **QuakeML**: For the standardized earthquake data format specification
- **shadcn/ui**: For the beautiful UI component library
- **Next.js Team**: For the excellent React framework

## 📞 Support

For questions, issues, or feature requests:
- Open an issue in the GitLab repository
- Contact the GNS Science Earthquake Team

## 🗺 Roadmap

### Planned Features
- [ ] Scheduled automatic imports with background job scheduler
- [ ] Enhanced QuakeML support with picks, arrivals, and focal mechanisms
- [ ] Multi-source import (USGS, IRIS, other FDSN services)
- [ ] Advanced data quality validation and anomaly detection
- [ ] Export to additional formats (GeoJSON, KML)
- [ ] User authentication and authorization
- [ ] Collaborative features (sharing, comments)
- [ ] Performance optimization for large datasets

## 📊 Project Status

**Status**: ✅ Production Ready

The application is fully functional with comprehensive features for earthquake catalogue management, including:
- ✅ Data upload and parsing
- ✅ GeoNet automatic import
- ✅ Catalogue merging
- ✅ QuakeML 1.2 support
- ✅ Interactive visualization
- ✅ Quality-based filtering
- ✅ Complete test coverage
- ✅ Full documentation

---

**Last Updated**: October 25, 2025

