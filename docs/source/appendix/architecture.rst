Earthquake Catalogue Management Application - Architecture Documentation
========================================================================


This document provides comprehensive architecture diagrams for the Earthquake Catalogue Management Application, a Next.js 13+ application for uploading, parsing, validating, and managing seismic event catalogues.

Table of Contents
-----------------


- ``1. System Architecture Overview <#1-system-architecture-overview>``_
- ``2. Catalogue Upload Data Flow <#2-catalogue-upload-data-flow>``_
- ``3. React Component Hierarchy <#3-react-component-hierarchy>``_
- ``4. Database Schema <#4-database-schema>``_
- ``5. File Parsing Pipeline <#5-file-parsing-pipeline>``_
- ``Viewing the Diagrams <#viewing-the-diagrams>``_



1. System Architecture Overview
-------------------------------


This diagram shows the complete application structure including the frontend (React/Next.js), backend (API routes), database (MongoDB), core libraries, and external seismic data services.

**Key Components:**
- **Frontend**: React components with App Router, state management, and Leaflet map visualizations
- **Backend**: Next.js API routes for upload, catalogues, events, merge, and import
- **Libraries**: Parsers (CSV, JSON, QuakeML), validators, quality checkers
- **Database**: MongoDB with connection pooling for scalable read/write performance
- **External Services**: GeoNet API for importing New Zealand earthquake data

.. code-block:: mermaid

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




2. Catalogue Upload Data Flow
-----------------------------


This diagram illustrates the complete 7-stage upload process from file selection through database storage to results display.

**Stages:**
1. **Upload**: File selection with drag-and-drop, progress tracking, and ETA calculation
2. **Parsing**: Format detection and parsing (CSV, JSON, QuakeML)
3. **Validation**: Event validation, quality checks, and cross-field validation
4. **Schema Mapping**: Map source fields to target schema with reusable templates
5. **Metadata**: Collect catalogue name, description, and source information
6. **Storage**: Batch insert to MongoDB database with index updates
7. **Results**: Display processing report with auto-navigation to Results tab

.. code-block:: mermaid

   flowchart TD
       subgraph User["👤 User Actions"]
           Upload["Select File(s)<br/>Drag & Drop"]
       end
       
       subgraph Stage1["📤 Stage 1: Upload"]
           FileUploader["FileUploader Component"]
           Progress["Progress Tracking<br/>• Bytes uploaded<br/>• ETA calculation<br/>• Stage indicators"]
           FormData["FormData Construction"]
       end
       
       subgraph Stage2["🔍 Stage 2: Parsing"]
           API["/api/upload"]
           Detect{"Format<br/>Detection"}
           CSV["parseCSV()"]
           JSON["parseJSON()"]
           XML["parseQuakeML()"]
           Normalize["Timestamp<br/>Normalization<br/>15+ formats"]
       end
       
       subgraph Stage3["✅ Stage 3: Validation"]
           Validate["validateEvent()"]
           QualityCheck["performQualityCheck()"]
           CrossField["validateEventsCrossFields()"]
           Results["ValidationResults<br/>Component"]
       end
       
       subgraph Stage4["🗺️ Stage 4: Schema Mapping"]
           SchemaMapper["EnhancedSchemaMapper"]
           FieldMap["Map source fields<br/>to target schema"]
           Templates["Mapping Templates<br/>(saved/loaded)"]
       end
       
       subgraph Stage5["📝 Stage 5: Metadata"]
           MetaForm["CatalogueMetadataForm"]
           CatName["Catalogue Name"]
           Description["Description"]
           Source["Source Info"]
       end
       
       subgraph Stage6["💾 Stage 6: Storage"]
           PostAPI["POST /api/catalogues"]
           InsertCat["INSERT merged_catalogues"]
           InsertEvents["INSERT merged_events<br/>(batch)"]
           Indexes["Update Indexes"]
       end
       
       subgraph Stage7["📊 Stage 7: Results"]
           Report["Processing Report"]
           Stats["Event Statistics"]
           QualityReport["Data Quality Report"]
           Navigate["Auto-navigate<br/>to Results Tab"]
       end
       
       Upload --> FileUploader
       FileUploader --> Progress
       Progress --> FormData
       FormData --> API
       
       API --> Detect
       Detect -->|.csv, .txt| CSV
       Detect -->|.json| JSON
       Detect -->|.xml, .quakeml| XML
       
       CSV --> Normalize
       JSON --> Normalize
       XML --> Normalize
       
       Normalize --> Validate
       Validate --> QualityCheck
       QualityCheck --> CrossField
       CrossField --> Results
       
       Results -->|Valid| SchemaMapper
       SchemaMapper --> FieldMap
       FieldMap --> Templates
       
       Templates --> MetaForm
       MetaForm --> CatName
       CatName --> Description
       Description --> Source
       
       Source --> PostAPI
       PostAPI --> InsertCat
       InsertCat --> InsertEvents
       InsertEvents --> Indexes
       
       Indexes --> Report
       Report --> Stats
       Stats --> QualityReport
       QualityReport --> Navigate




3. React Component Hierarchy
----------------------------


This diagram shows the React component tree structure, including the root layout, providers, upload page wizard, map visualization components, and UI component library.

**Key Areas:**
- **Root Layout**: SessionProvider, ThemeProvider, ToastProvider
- **Upload Page**: 4-tab wizard (Upload → Schema → Metadata → Results)
- **Upload Components**: FileUploader with progress indicators, ValidationResults, SchemaMapper
- **Map Components**: Event circles (sized by magnitude), station triangles, beach ball markers
- **UI Library**: shadcn/ui components (Card, Button, Progress, Dialog, etc.)

.. code-block:: mermaid

   flowchart TD
       subgraph RootLayout["app/layout.tsx"]
           Layout["Layout Component"]
   
           subgraph Providers["Providers"]
               Session["SessionProvider"]
               Theme["ThemeProvider"]
               Toast["ToastProvider"]
           end
       end
   
       subgraph UploadPage["app/upload/page.tsx"]
           UploadRoot["UploadPage"]
   
           subgraph Tabs["Tabs Component (shadcn/ui)"]
               TabsList["TabsList"]
               Tab1["Upload Tab"]
               Tab2["Schema Tab"]
               Tab3["Metadata Tab"]
               Tab4["Results Tab"]
           end
   
           subgraph UploadTab["Upload Tab Content"]
               FileUploader["FileUploader"]
               DragDrop["Drag & Drop Zone"]
               FileList["File List"]
               ProgressBar["Progress Indicator"]
               StageIndicators["Stage Dots<br/>Upload→Parse→Validate→Save"]
           end
   
           subgraph SchemaTab["Schema Tab Content"]
               EnhancedSchemaMapper["EnhancedSchemaMapper"]
               FieldMapping["Field Mapping Table"]
               TemplateSelector["Template Selector"]
           end
   
           subgraph MetadataTab["Metadata Tab Content"]
               CatalogueMetadataForm["CatalogueMetadataForm"]
               NameInput["Name Input"]
               DescInput["Description Input"]
               SourceInput["Source Fields"]
           end
   
           subgraph ResultsTab["Results Tab Content"]
               ValidationResults["ValidationResults"]
               DataQualityReport["DataQualityReport"]
               DataCompletenessMetrics["DataCompletenessMetrics"]
               ProcessingReport["Processing Summary"]
           end
       end
   
       subgraph MapComponents["Map Visualization Components"]
           CatalogueMap["CatalogueMap"]
           MapView["MapView"]
           UnifiedMap["UnifiedEarthquakeMap"]
           EnhancedMap["EnhancedMapView"]
   
           subgraph MapMarkers["Map Markers"]
               EventMarker["Event Circles<br/>(size = magnitude)"]
               StationMarker["Station Triangles"]
               BeachBall["Beach Ball Markers"]
               Uncertainty["Uncertainty Ellipses"]
           end
       end
   
       subgraph UIComponents["UI Components (shadcn/ui)"]
           Card["Card"]
           Button["Button"]
           Input["Input"]
           Select["Select"]
           Progress["Progress"]
           Badge["Badge"]
           Dialog["Dialog"]
       end
   
       Layout --> Providers
       Providers --> UploadRoot
   
       UploadRoot --> Tabs
       TabsList --> Tab1
       TabsList --> Tab2
       TabsList --> Tab3
       TabsList --> Tab4
   
       Tab1 --> FileUploader
       FileUploader --> DragDrop
       FileUploader --> FileList
       FileUploader --> ProgressBar
       ProgressBar --> StageIndicators
   
       Tab2 --> EnhancedSchemaMapper
       EnhancedSchemaMapper --> FieldMapping
       EnhancedSchemaMapper --> TemplateSelector
   
       Tab3 --> CatalogueMetadataForm
       CatalogueMetadataForm --> NameInput
       CatalogueMetadataForm --> DescInput
       CatalogueMetadataForm --> SourceInput
   
       Tab4 --> ValidationResults
       Tab4 --> DataQualityReport
       Tab4 --> DataCompletenessMetrics
       Tab4 --> ProcessingReport
   
       CatalogueMap --> MapView
       MapView --> EventMarker
       UnifiedMap --> StationMarker
       EnhancedMap --> BeachBall
       EnhancedMap --> Uncertainty




4. Database Schema
------------------


This Entity Relationship Diagram shows all 5 database tables, their fields, data types, and relationships.

**Tables:**
- **merged_catalogues**: Catalogue metadata with geographic bounds and event counts
- **merged_events**: 40+ fields including QuakeML 1.2 data (origins, magnitudes, quality metrics)
- **mapping_templates**: Saved field mapping configurations for reuse
- **import_history**: Tracks API imports from external services
- **saved_filters**: User-defined filter presets

.. code-block:: mermaid

   erDiagram
       merged_catalogues {
           TEXT id PK "UUID"
           TEXT name "NOT NULL"
           DATETIME created_at "DEFAULT CURRENT_TIMESTAMP"
           TEXT source_catalogues "JSON array"
           TEXT merge_config "JSON object"
           INTEGER event_count "DEFAULT 0"
           TEXT status "processing|complete|error"
           REAL min_latitude
           REAL max_latitude
           REAL min_longitude
           REAL max_longitude
       }
   
       merged_events {
           TEXT id PK "UUID"
           TEXT catalogue_id FK "NOT NULL"
           TEXT source_id "Original event ID"
           DATETIME time "NOT NULL"
           REAL latitude "NOT NULL"
           REAL longitude "NOT NULL"
           REAL depth "km"
           REAL magnitude "NOT NULL"
           TEXT source_events "JSON array"
           DATETIME created_at
           TEXT region "Location name"
           TEXT location_name
           TEXT event_public_id "QuakeML ID"
           TEXT event_type "earthquake|explosion|etc"
           TEXT event_type_certainty
           REAL time_uncertainty "seconds"
           REAL latitude_uncertainty "degrees"
           REAL longitude_uncertainty "degrees"
           REAL depth_uncertainty "km"
           TEXT magnitude_type "ML|Mw|mb|etc"
           REAL magnitude_uncertainty
           INTEGER magnitude_station_count
           REAL azimuthal_gap "degrees"
           INTEGER used_phase_count
           INTEGER used_station_count
           REAL standard_error
           TEXT evaluation_mode "manual|automatic"
           TEXT evaluation_status "reviewed|preliminary"
           TEXT origin_quality "JSON"
           TEXT origins "JSON array"
           TEXT magnitudes "JSON array"
           TEXT picks "JSON array"
           TEXT arrivals "JSON array"
           TEXT station_magnitudes "JSON array"
           TEXT amplitudes "JSON array"
           TEXT focal_mechanism "JSON"
       }
   
       mapping_templates {
           TEXT id PK "UUID"
           TEXT name "NOT NULL"
           TEXT description
           TEXT mappings "JSON object"
           DATETIME created_at
           DATETIME updated_at
       }
   
       import_history {
           TEXT id PK "UUID"
           TEXT catalogue_id FK "NOT NULL"
           TEXT start_time "ISO 8601"
           TEXT end_time "ISO 8601"
           INTEGER total_fetched
           INTEGER new_events
           INTEGER updated_events
           TEXT status "success|error"
           TEXT error_message
           DATETIME created_at
       }
   
       saved_filters {
           TEXT id PK "UUID"
           TEXT name "NOT NULL"
           TEXT description
           TEXT filter_config "JSON object"
           DATETIME created_at
           DATETIME updated_at
       }
   
       merged_catalogues ||--o{ merged_events : "contains"
       merged_catalogues ||--o{ import_history : "tracks"




5. File Parsing Pipeline
------------------------


This diagram details the complete file parsing flow from input through format detection, parsing, timestamp normalization, validation, and output.

**Key Features:**
- **Format Detection**: Extension-based (.csv, .json, .xml) with content-based fallback
- **CSV Parser**: Header parsing, row parsing, flexible field name mapping
- **JSON Parser**: Supports 5 structures (array, events, data, GeoJSON, auto-detect)
- **QuakeML Parser**: Full QuakeML 1.2 support with origins, magnitudes, and quality metrics
- **Timestamp Normalization**: 15+ formats including ISO 8601, DD/MM/YYYY, Julian day, Unix
- **Validation**: Coordinates (-90/90, -180/180), magnitude (-2 to 10), depth (0-1000km)

.. code-block:: mermaid

   flowchart TD
       subgraph Input["📁 Input File"]
           File["Uploaded File"]
       end
   
       subgraph Detection["🔍 Format Detection"]
           ExtCheck{"Check File<br/>Extension"}
           ContentCheck{"Check Content<br/>Structure"}
       end
   
       subgraph Parsers["📄 Format-Specific Parsers"]
           subgraph CSVParser["CSV Parser"]
               CSVHead["Parse Header Row"]
               CSVRows["Parse Data Rows"]
               CSVField["Field Name Mapping<br/>time→time, lat→latitude<br/>lon→longitude, mag→magnitude"]
           end
   
           subgraph JSONParser["JSON Parser"]
               JSONStruct{"Detect<br/>Structure"}
               JSONArray["Plain Array<br/>[...]"]
               JSONEvents["events property<br/>{events: [...]}"]
               JSONData["data property<br/>{data: [...]}"]
               JSONGeo["GeoJSON<br/>{features: [...]}"]
               JSONAuto["Auto-detect<br/>single array property"]
           end
   
           subgraph XMLParser["QuakeML/XML Parser"]
               XMLParse["Parse XML DOM"]
               XMLEvents["Extract event nodes"]
               QuakeML["parseQuakeMLEvent()"]
               Origin["Extract Origin<br/>time, lat, lon, depth"]
               Magnitude["Extract Magnitude<br/>mag, type, uncertainty"]
               Quality["Extract Quality<br/>gap, phases, stations"]
           end
       end
   
       subgraph Timestamp["⏰ Timestamp Normalization"]
           TSInput["Input Timestamp"]
           TSFormats{"Detect Format"}
           ISO["ISO 8601<br/>2024-01-15T10:30:00Z"]
           SpaceISO["Space-separated<br/>2024-01-15 10:30:00"]
           DDMMYYYY["DD/MM/YYYY<br/>01/12/2025 19:56:32"]
           EuropeDot["DD.MM.YYYY<br/>01.12.2025 19:56:32"]
           Compact["YYYYMMDDHHMMSS<br/>20241215103045"]
           Julian["Julian Day<br/>2024 015 10:30:00"]
           Unix["Unix Timestamp<br/>1705318200"]
           TSOutput["ISO 8601 Output<br/>2024-01-15T10:30:00.000Z"]
       end
   
       subgraph Validation["✅ Event Validation"]
           ValCoords["Validate Coordinates<br/>lat: -90 to 90<br/>lon: -180 to 180"]
           ValMag["Validate Magnitude<br/>-2 to 10"]
           ValDepth["Validate Depth<br/>0 to 1000 km"]
           ValTime["Validate Timestamp<br/>is valid Date"]
           ValResult{"Valid?"}
           ValError["Add to Errors"]
           ValSuccess["Add to Events"]
       end
   
       subgraph Output["📤 Output"]
           ParseResult["ParseResult"]
           Events["events: ParsedEvent[]"]
           Errors["errors: {line, message}[]"]
           Warnings["warnings: {line, message}[]"]
           Fields["detectedFields: string[]"]
       end
   
       File --> ExtCheck
       ExtCheck -->|.csv, .txt| CSVHead
       ExtCheck -->|.json| JSONStruct
       ExtCheck -->|.xml, .quakeml| XMLParse
       ExtCheck -->|unknown| ContentCheck
       ContentCheck -->|CSV-like| CSVHead
       ContentCheck -->|JSON-like| JSONStruct
       ContentCheck -->|XML-like| XMLParse
   
       CSVHead --> CSVRows
       CSVRows --> CSVField
   
       JSONStruct --> JSONArray
       JSONStruct --> JSONEvents
       JSONStruct --> JSONData
       JSONStruct --> JSONGeo
       JSONStruct --> JSONAuto
   
       XMLParse --> XMLEvents
       XMLEvents --> QuakeML
       QuakeML --> Origin
       QuakeML --> Magnitude
       QuakeML --> Quality
   
       CSVField --> TSInput
       JSONArray --> TSInput
       JSONEvents --> TSInput
       JSONData --> TSInput
       JSONGeo --> TSInput
       JSONAuto --> TSInput
       Origin --> TSInput
   
       TSInput --> TSFormats
       TSFormats --> ISO
       TSFormats --> SpaceISO
       TSFormats --> DDMMYYYY
       TSFormats --> EuropeDot
       TSFormats --> Compact
       TSFormats --> Julian
       TSFormats --> Unix
   
       ISO --> TSOutput
       SpaceISO --> TSOutput
       DDMMYYYY --> TSOutput
       EuropeDot --> TSOutput
       Compact --> TSOutput
       Julian --> TSOutput
       Unix --> TSOutput
   
       TSOutput --> ValCoords
       ValCoords --> ValMag
       ValMag --> ValDepth
       ValDepth --> ValTime
       ValTime --> ValResult
   
       ValResult -->|No| ValError
       ValResult -->|Yes| ValSuccess
   
       ValError --> Errors
       ValSuccess --> Events
   
       Events --> ParseResult
       Errors --> ParseResult
       Warnings --> ParseResult
       Fields --> ParseResult




Viewing the Diagrams
--------------------


GitHub / GitLab
^^^^^^^^^^^^^^^

These platforms **automatically render Mermaid diagrams** in Markdown files. Simply view this file in the repository web interface.

VS Code
^^^^^^^

Install the ``Markdown Preview Mermaid Support <https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid>``_ extension to render diagrams in the Markdown preview.

Mermaid Live Editor
^^^^^^^^^^^^^^^^^^^

Copy any diagram code to the ``Mermaid Live Editor <https://mermaid.live/>``_ to view, edit, and export diagrams.

Command Line
^^^^^^^^^^^^

Use ``mermaid-cli <https://github.com/mermaid-js/mermaid-cli>``_ to render diagrams to PNG/SVG:
.. code-block:: bash

   npm install -g @mermaid-js/mermaid-cli
   mmdc -i ARCHITECTURE.md -o architecture.png




Technology Stack Summary
------------------------


.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Layer
     - Technology
   * - **Frontend**
     - Next.js 13+ (App Router), React 18, TypeScript
   * - **UI Components**
     - shadcn/ui, Tailwind CSS, Radix UI
   * - **Maps**
     - Leaflet, react-leaflet
   * - **Backend**
     - Next.js API Routes
   * - **Database**
     - MongoDB
   * - **Parsing**
     - Custom parsers (CSV, JSON, QuakeML)
   * - **Validation**
     - Zod, custom validators
   * - **Testing**
     - Jest, React Testing Library




*Last updated: December 2025*
