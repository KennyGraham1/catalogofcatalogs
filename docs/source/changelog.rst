=========
Changelog
=========

All notable changes to the Earthquake Catalogue Platform are documented here.
This project adheres to `Semantic Versioning <https://semver.org/>`_.

-----------------
Version 1.0.0
-----------------

2026-01 (Current)
=================

**Documentation**

- Complete documentation overhaul for Read the Docs integration
- Added comprehensive Sphinx documentation with RTD theme
- Created user guide, developer guide, API reference, and deployment sections
- Added seismological glossary with 60+ terms
- Implemented Mermaid diagram support for architecture visualization
- Added PDF and ePub export capabilities
- Created contribution guidelines

**API Improvements**

- Removed authentication middleware from catalogue events and statistics routes
- Added cursor-based pagination for large event datasets
- Improved rate limiting with configurable thresholds

**Deployment**

- Added production-ready Docker Compose configuration
- Enhanced health check endpoints with detailed status reporting
- Improved MongoDB Atlas connection pooling

2025-12
=======

**Features**

- Added processing progress indicator during file uploads
- Enhanced validation state management with real-time feedback
- Improved error reporting during data validation

**Bug Fixes**

- Fixed upload progress calculation for large files
- Resolved timeout issues with MongoDB Atlas connections
- Fixed date format detection edge cases

2025-11
=======

**Quality Assessment**

- Implemented comprehensive quality scoring system (A+ to F grades)
- Added quality metrics visualization with interactive charts
- Enhanced b-value and Mc (completeness magnitude) calculations
- Added station coverage analysis with azimuthal gap visualization

**Visualization**

- Added uncertainty ellipse rendering on maps
- Implemented focal mechanism "beach ball" display
- Enhanced event clustering for large catalogues
- Added temporal distribution histograms

**Testing**

- Expanded test coverage to 400+ automated tests
- Added integration tests for API endpoints
- Implemented end-to-end testing for upload workflow
- Added CI/CD pipeline with GitHub Actions

2025-10
=======

**GeoNet Integration**

- Implemented GeoNet FDSN Event Web Service import
- Added intelligent duplicate detection during imports
- Created import history tracking with statistics
- Added configurable time range and magnitude filters
- Implemented incremental import with existing event updates

**Catalogue Merging**

- Added configurable matching rules (time window, distance, magnitude)
- Implemented multiple conflict resolution strategies
- Added source tracking for merged events
- Improved merge performance for large catalogues

**Data Validation**

- Enhanced cross-field validation for seismological consistency
- Added anomaly detection for extreme values
- Implemented depth-magnitude relationship checks
- Added uncertainty consistency validation

2025-09
=======

**Core Features**

- Initial release of the Earthquake Catalogue Platform
- Multi-format file upload (CSV, JSON, GeoJSON, QuakeML)
- Smart delimiter and date format detection
- Field mapping with reusable templates
- Interactive Leaflet-based maps
- Basic quality metrics display

**Database**

- MongoDB integration with connection pooling
- QuakeML 1.2 compatible data schema
- Optimized indexes for query performance

**Authentication**

- User registration and login
- Role-based access control (Admin, Editor, Viewer, Guest)
- Password change functionality
- Session management with NextAuth.js

-----------------
Roadmap
-----------------

Planned features for future releases:

**Version 1.1.0**

- Real-time WebSocket updates for new events
- Batch export with background processing
- Custom alert notifications
- Enhanced filtering with saved views

**Version 1.2.0**

- Multi-language support
- Advanced statistical analysis tools
- Custom visualization templates
- API rate limit management dashboard

**Version 2.0.0**

- Federated catalogue sharing
- Machine learning-based quality assessment
- 3D hypocenter visualization
- Collaborative annotation tools
