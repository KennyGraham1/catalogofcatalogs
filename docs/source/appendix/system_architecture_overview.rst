.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart LR
       U("User"):::userAction

       subgraph Client["Client Browser"]
           UI["React UI Components"]
           AppState["React State Management"]
           Maps["Leaflet Map Visualizations"]
       end

       subgraph NextJS["Next.js 13+ Application"]
           subgraph FrontendGroup["Frontend (App Router)"]
               Pages["Pages &amp; Layouts"]
               Components["React Components"]
               Hooks["Custom Hooks"]
           end

           subgraph BackendGroup["Backend (API Routes)"]
               UploadAPI[["/api/upload"]]
               CataloguesAPI[["/api/catalogues"]]
               EventsAPI[["/api/events"]]
               MergeAPI[["/api/merge"]]
               ImportAPI[["/api/import"]]
           end

           subgraph LibsGroup["Core Libraries"]
               Parsers[["lib/parsers.ts<br/>CSV, JSON, QuakeML"]]
               EqUtils[["lib/earthquake-utils.ts<br/>Validation &amp; Normalization"]]
               QualityCheck[["lib/data-quality-checker.ts"]]
               CrossField[["lib/cross-field-validation.ts"]]
               QuakeML[["lib/quakeml-parser.ts"]]
           end
       end

       subgraph Database["MongoDB Database"]
           DB[("earthquake_catalogue")]
           Collections[("Collections: catalogues, events")]
           Indexes[("Indexes")]
       end

       subgraph ExternalSvc["External Services"]
           GeoNet{{"GeoNet API (NZ Earthquakes)"}}
       end

       U --> UI

       UI --> Pages
       AppState --> Components
       Maps --> Components

       Pages --> UploadAPI
       Components --> Hooks

       UploadAPI --> Parsers
       EqUtils --> DB
       DB --> Collections
       Collections --> Indexes

       ImportAPI -. "FDSN import" .-> GeoNet

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF

       class UI,AppState,Maps,Pages,Components,Hooks frontend
       class UploadAPI,CataloguesAPI,EventsAPI,MergeAPI,ImportAPI backend
       class Parsers,EqUtils,QualityCheck,CrossField,QuakeML library
       class DB,Collections,Indexes datastore
       class GeoNet external

       style Client fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style NextJS fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style Database fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style ExternalSvc fill:#F7F9FC,stroke:#AEBED2,stroke-width:1px,color:#0F3D6B
       style FrontendGroup fill:#EEF2F8,stroke:#C2CEDE,stroke-width:1px,color:#0F3D6B
       style BackendGroup fill:#EEF2F8,stroke:#C2CEDE,stroke-width:1px,color:#0F3D6B
       style LibsGroup fill:#EEF2F8,stroke:#C2CEDE,stroke-width:1px,color:#0F3D6B
