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
            AuthAPI["/api/auth"]
        end
        
        subgraph Libraries["Core Libraries"]
            Parsers["lib/parsers.ts<br/>CSV, JSON, QuakeML"]
            EqUtils["lib/earthquake-utils.ts<br/>Validation & Normalization"]
            QualityCheck["lib/data-quality-checker.ts"]
            CrossField["lib/cross-field-validation.ts"]
            QuakeML["lib/quakeml-parser.ts"]
        end
    end
    
    subgraph Database["💾 SQLite Database (WAL Mode)"]
        DB[(merged_catalogues.db)]
        WAL[("WAL File<br/>Write-Ahead Log")]
        SHM[("SHM File<br/>Shared Memory")]
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
    DB --> WAL
    WAL --> SHM
    
    ImportAPI --> External
    
    classDef frontend fill:#3b82f6,stroke:#1d4ed8,color:#fff
    classDef backend fill:#10b981,stroke:#059669,color:#fff
    classDef db fill:#f59e0b,stroke:#d97706,color:#fff
    classDef external fill:#8b5cf6,stroke:#7c3aed,color:#fff
    
    class UI,State,Maps,Pages,Components,Hooks frontend
    class UploadAPI,CataloguesAPI,EventsAPI,MergeAPI,ImportAPI,AuthAPI backend
    class DB,WAL,SHM db
    class GeoNet external