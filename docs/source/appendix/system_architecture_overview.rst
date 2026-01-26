.. mermaid::

    flowchart LR
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
            Collections[("Collections<br/>catalogues, events")]
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
        
        classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:#fff
        classDef backend fill:#10b981,stroke:#059669,color:#fff
        classDef db fill:#f59e0b,stroke:#d97706,color:#fff
        classDef external fill:#8b5cf6,stroke:#7c3aed,color:#fff
        
        class UI,State,Maps,Pages,Components,Hooks frontend
        class UploadAPI,CataloguesAPI,EventsAPI,MergeAPI,ImportAPI backend
        class DB,Collections,Indexes db
        class GeoNet external
