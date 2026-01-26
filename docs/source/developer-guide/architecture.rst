============
Architecture
============

This document provides comprehensive architecture information for the Earthquake Catalogue Platform.

--------
Overview
--------

The Earthquake Catalogue Platform is a Next.js 13+ application built with a modern, serverless architecture. It follows a three-tier architecture pattern:

1. **Presentation Layer:** React components with Next.js App Router
2. **Application Layer:** Next.js API Routes (serverless functions)
3. **Data Layer:** MongoDB with optimized schema and indexes

-----------------------
System Architecture
-----------------------

High-Level Components
=====================

.. mermaid::

   flowchart TB
       subgraph Client["🖥️ Client Browser"]
           UI["React UI Components"]
           State["React State Management"]
           Maps["Leaflet Map Visualizations"]
       end
       
       subgraph NextJS["⚡ Next.js 13+ Application"]
           subgraph Frontend["Frontend (App Router)"]
               Pages["Pages & Layouts"]
               Components["React Components"]
               Hooks["Custom Hooks"]
           end
           
           subgraph Backend["Backend (API Routes)"]
               UploadAPI["/api/upload"]
               CataloguesAPI["/api/catalogues"]
               EventsAPI["/api/events"]
               MergeAPI["/api/merge"]
               ImportAPI["/api/import"]
           end
           
           subgraph Libraries["Core Libraries"]
               Parsers["lib/parsers.ts<br/>CSV, JSON, QuakeML"]
               EqUtils["lib/earthquake-utils.ts<br/>Validation & Normalization"]
               QualityCheck["lib/data-quality-checker.ts"]
               CrossField["lib/cross-field-validation.ts"]
               QuakeML["lib/quakeml-parser.ts"]
           end
       end
       
       subgraph Database["💾 MongoDB Database"]
           DB[(earthquake_catalogue)]
           Collections[("Collections")]
           Indexes[("Indexes")]
       end
       
       subgraph External["🌐 External Services"]
           GeoNet["GeoNet API<br/>(NZ Earthquakes)"]
       end
       
       UI --> Pages
       State --> Components
       Maps --> Components
       
       Pages --> Backend
       Components --> Hooks
       
       Backend --> Libraries
       Libraries --> DB
       DB --> Collections
       Collections --> Indexes
       
       ImportAPI --> External

**Key Components:**

* **Frontend:** React components with App Router, state management, and Leaflet map visualizations
* **Backend:** Next.js API routes for upload, catalogues, events, merge, and import
* **Libraries:** Parsers (CSV, JSON, QuakeML), validators, quality checkers
* **Database:** MongoDB with connection pooling for scalable read/write performance
* **External Services:** GeoNet API for importing New Zealand earthquake data

-----------------------
Data Flow Architecture
-----------------------

Upload Data Flow
================

The upload process consists of 7 stages:

**Stage 1: Upload**
   - File selection with drag-and-drop
   - Progress tracking with ETA calculation
   - FormData construction

**Stage 2: Parsing**
   - Format detection (CSV, JSON, QuakeML, GeoJSON)
   - Delimiter detection for CSV/TXT
   - Date format detection
   - Timestamp normalization (15+ formats)

**Stage 3: Validation**
   - Event validation (coordinates, magnitude, depth)
   - Quality checks
   - Cross-field validation
   - Validation results display

**Stage 4: Schema Mapping**
   - Map source fields to target schema
   - Reusable mapping templates
   - Field name suggestions

**Stage 5: Metadata**
   - Catalogue name and description
   - Source information
   - Additional metadata

**Stage 6: Storage**
   - Batch insert to MongoDB
   - Index updates
   - Geographic bounds calculation

**Stage 7: Results**
   - Processing report
   - Event statistics
   - Data quality report
   - Auto-navigation to results

Import Data Flow
================

GeoNet import process:

1. **Configuration:** Time range, magnitude, depth, geographic filters
2. **API Query:** Query GeoNet FDSN Event Web Service
3. **Parsing:** Parse QuakeML response
4. **Duplicate Detection:** Match existing events by time, location, magnitude
5. **Storage:** Insert new events or update existing
6. **History:** Record import metadata and statistics

Merge Data Flow
===============

Catalogue merging process:

1. **Selection:** Choose source catalogues
2. **Configuration:** Set matching rules and merge strategy
3. **Loading:** Load all events from source catalogues
4. **Matching:** Detect duplicates using configurable thresholds
5. **Resolution:** Apply merge strategy (priority, average, newest, complete)
6. **Storage:** Create merged catalogue with source tracking
7. **Reporting:** Generate merge statistics

-----------------------
Component Architecture
-----------------------

Frontend Components
===================

**Layout Components:**

* ``app/layout.tsx`` - Root layout with providers
* ``components/layout/`` - Navigation, header, footer

**Page Components:**

* ``app/upload/page.tsx`` - Upload wizard
* ``app/import/page.tsx`` - GeoNet import
* ``app/merge/page.tsx`` - Catalogue merging
* ``app/catalogues/page.tsx`` - Catalogue management
* ``app/analytics/page.tsx`` - Visualization and analysis

**Feature Components:**

* ``components/upload/`` - File upload, schema mapping, validation
* ``components/import/`` - Import form, history
* ``components/merge/`` - Merge configuration
* ``components/visualize/`` - Maps, charts, analytics
* ``components/ui/`` - shadcn/ui component library

Backend API Routes
==================

**Catalogues API:**

* ``GET /api/catalogues`` - List catalogues
* ``POST /api/catalogues`` - Create catalogue
* ``GET /api/catalogues/[id]`` - Get catalogue details
* ``PATCH /api/catalogues/[id]`` - Update catalogue
* ``DELETE /api/catalogues/[id]`` - Delete catalogue
* ``GET /api/catalogues/[id]/download`` - Download CSV
* ``GET /api/catalogues/[id]/events`` - Get events with filtering

**Import API:**

* ``POST /api/import/geonet`` - Import from GeoNet
* ``GET /api/import/history`` - Get import history

**Upload API:**

* ``POST /api/upload`` - Upload and parse file

**Merge API:**

* ``POST /api/merge`` - Merge catalogues

**Export API:**

* ``POST /api/catalogues/[id]/export/quakeml`` - Export QuakeML

See :doc:`../api-reference/index` for complete API documentation.

Core Libraries
==============

**Data Parsing:**

* ``lib/parsers.ts`` - Multi-format file parsers (CSV, JSON, QuakeML, GeoJSON)
* ``lib/delimiter-detector.ts`` - Smart delimiter detection
* ``lib/date-format-detector.ts`` - Date format detection
* ``lib/quakeml-parser.ts`` - QuakeML 1.2 parser
* ``lib/geojson-parser.ts`` - GeoJSON parser

**Data Validation:**

* ``lib/validation.ts`` - Event validation rules
* ``lib/data-quality-checker.ts`` - Quality assessment
* ``lib/cross-field-validation.ts`` - Cross-field validation
* ``lib/duplicate-detection.ts`` - Duplicate event detection

**Seismological Analysis:**

* ``lib/earthquake-utils.ts`` - Earthquake calculations
* ``lib/quality-scoring.ts`` - Quality scoring algorithms
* ``lib/seismological-analysis.ts`` - b-value, Mc, temporal analysis
* ``lib/focal-mechanism-utils.ts`` - Focal mechanism parsing
* ``lib/station-coverage-utils.ts`` - Station coverage analysis
* ``lib/uncertainty-utils.ts`` - Uncertainty calculations

**Database:**

* ``lib/mongodb.ts`` - MongoDB client with Atlas optimization
* ``lib/db.ts`` - Database queries and schema

**Utilities:**

* ``lib/merge.ts`` - Catalogue merging logic
* ``lib/geonet-client.ts`` - GeoNet API client
* ``lib/geonet-import-service.ts`` - Import service
* ``lib/exporters.ts`` - Data export utilities
* ``lib/quakeml-exporter.ts`` - QuakeML export

-----------------------
Database Architecture
-----------------------

Collections
===========

**merged_catalogues**

Stores catalogue metadata:

.. code-block:: javascript

   {
     id: "uuid",
     name: "string",
     created_at: Date,
     updated_at: Date,
     status: "active" | "archived",
     event_count: number,
     min_latitude: number,
     max_latitude: number,
     min_longitude: number,
     max_longitude: number,
     min_magnitude: number,
     max_magnitude: number,
     start_time: Date,
     end_time: Date,
     source_catalogues: Array,
     merge_config: Object
   }

**merged_events**

Stores earthquake events with full QuakeML 1.2 support:

.. code-block:: javascript

   {
     id: "uuid",
     catalogue_id: "uuid",
     time: Date,
     latitude: number,
     longitude: number,
     depth: number,
     magnitude: number,
     magnitude_type: "string",

     // Uncertainties
     time_uncertainty: number,
     latitude_uncertainty: number,
     longitude_uncertainty: number,
     depth_uncertainty: number,
     magnitude_uncertainty: number,

     // Quality metrics
     azimuthal_gap: number,
     used_phase_count: number,
     used_station_count: number,
     standard_error: number,
     magnitude_station_count: number,

     // QuakeML fields
     event_public_id: "string",
     event_type: "string",
     evaluation_mode: "manual" | "automatic",
     evaluation_status: "preliminary" | "confirmed" | "reviewed" | "final",

     // Complex nested data
     origins: Array,
     magnitudes: Array,
     picks: Array,
     arrivals: Array,
     focal_mechanisms: Array,

     // Source tracking
     source_id: "string",
     source_events: Array,

     // Computed fields
     quality_score: number,
     quality_grade: "A+" | "A" | "B+" | "B" | "C" | "D" | "F"
   }

**import_history**

Tracks GeoNet imports:

.. code-block:: javascript

   {
     id: "uuid",
     catalogue_id: "uuid",
     start_time: Date,
     end_time: Date,
     total_fetched: number,
     new_events: number,
     updated_events: number,
     skipped_events: number,
     errors: Array,
     created_at: Date
   }

**users**

User accounts and authentication:

.. code-block:: javascript

   {
     id: "uuid",
     email: "string",
     password_hash: "string",
     name: "string",
     role: "admin" | "editor" | "viewer" | "guest",
     created_at: Date,
     updated_at: Date
   }

Indexes
=======

Optimized indexes for query performance:

**merged_catalogues:**

* ``id`` (unique)
* ``name`` (text search)
* ``created_at`` (sorting)

**merged_events:**

* ``id`` (unique)
* ``catalogue_id`` (filtering)
* ``time`` (range queries)
* ``latitude, longitude`` (geospatial queries)
* ``magnitude`` (range queries)
* ``quality_grade`` (filtering)
* Compound index: ``(catalogue_id, time)``
* Compound index: ``(catalogue_id, magnitude)``
* Geospatial index: ``(latitude, longitude)``

**import_history:**

* ``catalogue_id`` (filtering)
* ``created_at`` (sorting)

See :doc:`database-schema` for complete schema documentation.

-----------------------
Security Architecture
-----------------------

Authentication
==============

* **NextAuth.js v4** for authentication
* **Credentials provider** with bcrypt password hashing
* **Session-based** authentication with MongoDB session store
* **JWT tokens** for API authentication

Authorization
=============

Role-based access control (RBAC):

* **Admin:** Full system access
* **Editor:** Create, update, delete catalogues
* **Viewer:** Read-only access, export
* **Guest:** Limited read-only access

API Protection
==============

* **Rate limiting:** 120 req/min (read), 60 req/min (write)
* **Input validation:** Zod schemas for all inputs
* **SQL injection prevention:** MongoDB parameterized queries
* **XSS prevention:** React automatic escaping
* **CSRF protection:** NextAuth CSRF tokens

See :doc:`../administration/authentication` for security details.

-----------------------
Performance Architecture
-----------------------

Optimization Strategies
=======================

**Frontend:**

* React memoization (useMemo, useCallback)
* Virtualized tables for large datasets
* Lazy loading of components
* Image optimization with Next.js Image
* Code splitting with dynamic imports

**Backend:**

* MongoDB connection pooling (up to 50 connections)
* Query optimization with indexes
* Batch operations for bulk inserts
* Streaming parsers for large files
* Caching with in-memory cache

**Database:**

* Compound indexes for common queries
* Geospatial indexes for location queries
* Projection to limit returned fields
* Aggregation pipelines for analytics

Scalability
===========

* **Horizontal scaling:** Serverless API routes auto-scale
* **Database scaling:** MongoDB Atlas auto-scaling
* **CDN:** Static assets served via Vercel Edge Network
* **Caching:** Browser caching, API response caching

-----------------------
Deployment Architecture
-----------------------

Production Environment
======================

* **Platform:** Vercel (recommended) or Docker
* **Database:** MongoDB Atlas (cloud) or self-hosted
* **CDN:** Vercel Edge Network
* **SSL/TLS:** Automatic HTTPS with Vercel
* **Environment:** Node.js 18+ runtime

See :doc:`../deployment/index` for deployment guides.

----------
Next Steps
----------

* :doc:`setup` - Set up development environment
* :doc:`database-schema` - Detailed database schema
* :doc:`api-development` - API development guide
* :doc:`testing` - Testing guide

