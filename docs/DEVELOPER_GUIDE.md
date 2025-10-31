# Earthquake Catalogue Platform - Developer Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Component Library](#component-library)
7. [Development Workflow](#development-workflow)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Contributing](#contributing)

---

## Architecture Overview

The Earthquake Catalogue Platform is built using a modern full-stack architecture:

### Frontend Architecture

```
┌─────────────────────────────────────────┐
│         Next.js App Router              │
│  (React Server Components + Client)     │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼──────┐
│  Components │  │   Hooks    │
│  (shadcn/ui)│  │  (Custom)  │
└──────┬──────┘  └─────┬──────┘
       │                │
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │   Lib Utils    │
       │  (Business     │
       │   Logic)       │
       └────────────────┘
```

### Backend Architecture

```
┌─────────────────────────────────────────┐
│      Next.js API Routes                 │
│      (Serverless Functions)             │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌─────▼──────┐
│  Database   │  │  External  │
│  Queries    │  │    APIs    │
│  (SQLite)   │  │  (GeoNet)  │
└─────────────┘  └────────────┘
```

### Data Flow

```
User Action → React Component → API Route → Database/External API
                    ↑                              │
                    └──────────────────────────────┘
                         Response/Update
```

---

## Technology Stack

### Core Framework

- **Next.js 13.5**: React framework with App Router
  - Server Components for improved performance
  - API Routes for backend functionality
  - Built-in routing and code splitting

### Frontend

- **React 18**: UI library with hooks and concurrent features
- **TypeScript 5**: Type-safe development
- **Tailwind CSS 3**: Utility-first CSS framework
- **shadcn/ui**: High-quality React components built on Radix UI
  - 40+ accessible components
  - Customizable with Tailwind
  - Dark mode support

### Data Visualization

- **Recharts**: Composable charting library
  - Line, Bar, Scatter, Pie charts
  - Responsive and customizable
- **Leaflet**: Interactive map library
  - React Leaflet wrapper
  - Custom markers and layers
  - GeoJSON support

### Forms & Validation

- **React Hook Form**: Performant form library
- **Zod**: TypeScript-first schema validation
- **date-fns**: Modern date utility library

### Backend

- **SQLite3**: Lightweight embedded database
  - File-based storage
  - ACID compliance
  - No separate server required
- **xml2js**: XML parsing for QuakeML
- **Node.js 18+**: JavaScript runtime

### Testing

- **Jest**: JavaScript testing framework
- **Testing Library**: React component testing
- **ts-jest**: TypeScript support for Jest

### Development Tools

- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Static type checking

---

## Project Structure

```
catalogofcatalogs/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes
│   │   ├── catalogues/          # Catalogue CRUD
│   │   │   ├── route.ts         # GET, POST catalogues
│   │   │   └── [id]/            # Individual catalogue
│   │   │       ├── route.ts     # GET, PATCH, DELETE
│   │   │       ├── events/      # Events for catalogue
│   │   │       ├── export/      # Export endpoints
│   │   │       └── download/    # CSV download
│   │   ├── import/              # GeoNet import
│   │   │   ├── geonet/         # Import endpoint
│   │   │   └── history/        # Import history
│   │   ├── merge/               # Catalogue merging
│   │   └── upload/              # File upload
│   ├── catalogues/              # Catalogue pages
│   │   ├── page.tsx            # List view
│   │   └── [id]/               # Detail view
│   ├── dashboard/               # Dashboard page
│   ├── import/                  # Import page
│   ├── merge/                   # Merge page
│   ├── upload/                  # Upload page
│   ├── visualize/               # Visualization pages
│   ├── analytics/               # Analytics page
│   ├── settings/                # Settings page
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page
│
├── components/                   # React Components
│   ├── ui/                      # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── table.tsx
│   │   └── ... (40+ components)
│   ├── catalogues/              # Catalogue components
│   │   ├── CatalogueCard.tsx
│   │   ├── FilterPanel.tsx
│   │   └── MapView.tsx
│   ├── events/                  # Event components
│   │   ├── EventTable.tsx
│   │   └── EventCard.tsx
│   ├── import/                  # Import components
│   │   ├── ImportForm.tsx
│   │   └── ImportHistory.tsx
│   ├── merge/                   # Merge components
│   │   ├── MergeConfig.tsx
│   │   └── MapComponent.tsx
│   ├── upload/                  # Upload components
│   │   ├── FileUpload.tsx
│   │   └── FieldMapper.tsx
│   ├── visualize/               # Visualization components
│   │   ├── UnifiedEarthquakeMap.tsx
│   │   └── NZEarthquakeMap.tsx
│   ├── advanced-viz/            # Advanced visualization
│   │   ├── EnhancedMapView.tsx
│   │   ├── UncertaintyEllipse.tsx
│   │   ├── BeachBallMarker.tsx
│   │   ├── StationMarker.tsx
│   │   ├── QualityScoreCard.tsx
│   │   ├── FocalMechanismCard.tsx
│   │   └── StationCoverageCard.tsx
│   ├── dashboard/               # Dashboard components
│   │   ├── StatsCard.tsx
│   │   └── CatalogueMap.tsx
│   ├── layout/                  # Layout components
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   └── theme/                   # Theme components
│       └── ThemeProvider.tsx
│
├── lib/                          # Core Library Code
│   ├── db.ts                    # Database queries
│   ├── db-pool.ts               # Connection pooling
│   ├── parsers.ts               # Data parsers
│   ├── exporters.ts             # Data exporters
│   ├── merge.ts                 # Merge logic
│   ├── validation.ts            # Data validation
│   ├── quality-scoring.ts       # Quality assessment
│   ├── earthquake-utils.ts      # Earthquake calculations
│   ├── geo-bounds-utils.ts      # Geographic utilities
│   ├── geonet-client.ts         # GeoNet API client
│   ├── geonet-import-service.ts # Import service
│   ├── quakeml-parser.ts        # QuakeML import
│   ├── quakeml-exporter.ts      # QuakeML export
│   ├── quakeml-validator.ts     # QuakeML validation
│   ├── focal-mechanism-utils.ts # Focal mechanism parsing
│   ├── station-coverage-utils.ts# Station coverage
│   ├── uncertainty-utils.ts     # Uncertainty calculations
│   ├── seismological-analysis.ts# Advanced analytics
│   ├── fault-data.ts            # Fault data loading
│   ├── field-definitions.ts     # Field metadata
│   ├── duplicate-detection.ts   # Duplicate detection
│   ├── anomaly-detection.ts     # Anomaly detection
│   ├── completeness-metrics.ts  # Completeness analysis
│   ├── cross-field-validation.ts# Cross-field validation
│   ├── data-quality-checker.ts  # Quality checking
│   ├── cache.ts                 # Caching utilities
│   ├── circuit-breaker.ts       # Circuit breaker pattern
│   ├── retry-utils.ts           # Retry logic
│   ├── query-optimizer.ts       # Query optimization
│   ├── errors.ts                # Error handling
│   ├── export-utils.ts          # Export utilities
│   ├── utils.ts                 # General utilities
│   └── types/                   # TypeScript types
│       └── index.ts
│
├── hooks/                        # Custom React Hooks
│   ├── use-cached-fetch.ts      # Data fetching with cache
│   ├── use-debounce.ts          # Debounce hook
│   ├── use-pagination.ts        # Pagination hook
│   ├── use-async.ts             # Async state management
│   ├── use-map-theme.ts         # Map theme hook
│   ├── use-nearby-faults.ts     # Fault data hook
│   ├── use-keyboard-shortcuts.ts# Keyboard shortcuts
│   └── use-toast.ts             # Toast notifications
│
├── contexts/                     # React Contexts
│   └── CatalogueContext.tsx     # Catalogue state
│
├── scripts/                      # Utility Scripts
│   ├── init-database.ts         # Database initialization
│   ├── migrate-database.ts      # Database migrations
│   ├── migrate-add-source-id.js # Source ID migration
│   ├── migrate-add-geo-bounds.js# Geo bounds migration
│   ├── migrate-add-region.ts    # Region migration
│   ├── migrate-add-metadata-fields.js # Metadata migration
│   ├── fix-missing-geo-bounds.ts# Fix geo bounds
│   ├── download-fault-data.ts   # Download fault data
│   ├── populate-geonet-baseline.ts # GeoNet baseline
│   ├── clean-database.js        # Clean database
│   └── clean-and-setup-database.sh # Setup script
│
├── __tests__/                    # Test Files
│   ├── lib/                     # Library tests
│   └── seismological-analysis.test.ts
│
├── public/                       # Static Assets
│   └── data/                    # Data files
│       └── nz-active-faults.geojson
│
├── docs/                         # Documentation
│   ├── USER_GUIDE.md            # User documentation
│   ├── DEVELOPER_GUIDE.md       # Developer documentation
│   └── DATA_VALIDATION_GUIDE.md # Validation guide
│
├── .env.local                    # Environment variables
├── next.config.js               # Next.js configuration
├── tailwind.config.ts           # Tailwind configuration
├── tsconfig.json                # TypeScript configuration
├── jest.config.js               # Jest configuration
├── package.json                 # Dependencies
└── README.md                    # Project README
```

---

## Database Schema

### Tables

#### merged_catalogues

Stores catalogue metadata.

```sql
CREATE TABLE merged_catalogues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  event_count INTEGER DEFAULT 0,
  min_latitude REAL,
  max_latitude REAL,
  min_longitude REAL,
  max_longitude REAL,
  min_magnitude REAL,
  max_magnitude REAL,
  start_time TEXT,
  end_time TEXT
);
```

#### events

Stores earthquake event data.

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  catalogue_id TEXT NOT NULL,
  time TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  depth REAL,
  magnitude REAL NOT NULL,
  magnitude_type TEXT,
  region TEXT,
  source TEXT,
  source_id TEXT,
  
  -- Uncertainties
  latitude_uncertainty REAL,
  longitude_uncertainty REAL,
  depth_uncertainty REAL,
  time_uncertainty REAL,
  magnitude_uncertainty REAL,
  
  -- Quality metrics
  azimuthal_gap REAL,
  used_phase_count INTEGER,
  used_station_count INTEGER,
  standard_error REAL,
  magnitude_station_count INTEGER,
  minimum_distance REAL,
  
  -- Evaluation metadata
  evaluation_mode TEXT,
  evaluation_status TEXT,
  author TEXT,
  agency_id TEXT,
  
  -- Quality score
  quality_score REAL,
  
  -- Complex data (JSON)
  picks TEXT,
  arrivals TEXT,
  focal_mechanisms TEXT,
  amplitudes TEXT,
  station_magnitudes TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
);
```

#### import_history

Tracks GeoNet import history.

```sql
CREATE TABLE import_history (
  id TEXT PRIMARY KEY,
  catalogue_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  total_fetched INTEGER NOT NULL,
  new_events INTEGER NOT NULL,
  updated_events INTEGER NOT NULL,
  skipped_events INTEGER NOT NULL,
  errors TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (catalogue_id) REFERENCES merged_catalogues(id) ON DELETE CASCADE
);
```

### Indexes

```sql
CREATE INDEX idx_events_catalogue ON events(catalogue_id);
CREATE INDEX idx_events_time ON events(time);
CREATE INDEX idx_events_magnitude ON events(magnitude);
CREATE INDEX idx_events_location ON events(latitude, longitude);
CREATE INDEX idx_events_source_id ON events(source_id);
CREATE INDEX idx_import_history_catalogue ON import_history(catalogue_id);
```

---

## API Reference

### Catalogues API

#### GET /api/catalogues

List all catalogues with pagination.

**Query Parameters**:
- `page` (number, default: 1)
- `pageSize` (number, default: 10)
- `search` (string, optional)

**Response**:
```json
{
  "catalogues": [...],
  "total": 42,
  "page": 1,
  "pageSize": 10
}
```

#### POST /api/catalogues

Create a new catalogue.

**Request Body**:
```json
{
  "name": "My Catalogue",
  "events": [...]
}
```

**Response**:
```json
{
  "id": "uuid",
  "name": "My Catalogue",
  "event_count": 100
}
```

#### GET /api/catalogues/[id]

Get catalogue details.

**Response**:
```json
{
  "id": "uuid",
  "name": "My Catalogue",
  "created_at": "2024-10-24T12:00:00Z",
  "event_count": 100,
  "min_latitude": -47.0,
  "max_latitude": -34.0,
  ...
}
```

#### PATCH /api/catalogues/[id]

Update catalogue name.

**Request Body**:
```json
{
  "name": "Updated Name"
}
```

#### DELETE /api/catalogues/[id]

Delete a catalogue and all its events.

#### GET /api/catalogues/[id]/events

Get events for a catalogue.

**Query Parameters**:
- `page` (number)
- `pageSize` (number)
- `sortBy` (string)
- `sortOrder` ('asc' | 'desc')

#### GET /api/catalogues/[id]/events/filtered

Get filtered events.

**Query Parameters**:
- `minMagnitude`, `maxMagnitude`
- `minDepth`, `maxDepth`
- `startTime`, `endTime`
- `minLatitude`, `maxLatitude`, `minLongitude`, `maxLongitude`

#### GET /api/catalogues/[id]/export

Export catalogue in various formats.

**Query Parameters**:
- `format` ('csv' | 'json' | 'geojson' | 'kml' | 'quakeml')

### Import API

#### POST /api/import/geonet

Import events from GeoNet.

**Request Body**:
```json
{
  "catalogueId": "uuid",
  "timeRange": "24h",
  "minMagnitude": 3.0,
  "maxMagnitude": 10.0,
  "minDepth": 0,
  "maxDepth": 1000,
  "updateExisting": true
}
```

#### GET /api/import/history

Get import history for a catalogue.

**Query Parameters**:
- `catalogueId` (required)
- `limit` (number, default: 10)

### Upload API

#### POST /api/upload

Upload and parse a data file.

**Request**: multipart/form-data with file

**Response**:
```json
{
  "data": [...],
  "headers": [...],
  "format": "csv"
}
```

### Merge API

#### POST /api/merge

Merge multiple catalogues.

**Request Body**:
```json
{
  "name": "Merged Catalogue",
  "catalogueIds": ["uuid1", "uuid2"],
  "matchingRules": {
    "timeWindow": 60,
    "distanceThreshold": 50,
    "magnitudeDifference": 0.5
  },
  "conflictResolution": "prefer_first"
}
```

---

## Component Library

### UI Components (shadcn/ui)

The platform uses shadcn/ui components, which are built on Radix UI primitives and styled with Tailwind CSS.

#### Key Components

**Button**
```tsx
import { Button } from '@/components/ui/button';

<Button variant="default">Click me</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button size="sm">Small</Button>
```

**Card**
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

**Dialog**
```tsx
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
    </DialogHeader>
    Content
  </DialogContent>
</Dialog>
```

**Table**
```tsx
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column 1</TableHead>
      <TableHead>Column 2</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data 1</TableCell>
      <TableCell>Data 2</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

### Custom Hooks

**useCachedFetch**

Fetch data with automatic caching and deduplication.

```tsx
import { useCachedFetch } from '@/hooks/use-cached-fetch';

const { data, loading, error, refetch } = useCachedFetch<Event[]>(
  '/api/catalogues/123/events',
  { cacheTime: 5 * 60 * 1000 } // 5 minutes
);
```

**useDebounce**

Debounce a value to reduce unnecessary updates.

```tsx
import { useDebounce } from '@/hooks/use-debounce';

const [searchTerm, setSearchTerm] = useState('');
const debouncedSearch = useDebounce(searchTerm, 500);

useEffect(() => {
  // This only runs 500ms after user stops typing
  performSearch(debouncedSearch);
}, [debouncedSearch]);
```

**usePagination**

Manage pagination state.

```tsx
import { usePagination } from '@/hooks/use-pagination';

const { page, pageSize, setPage, setPageSize, totalPages } = usePagination({
  totalItems: 1000,
  initialPageSize: 20
});
```

---

## Development Workflow

### Setup Development Environment

1. **Clone Repository**
   ```bash
   git clone https://git.gns.cri.nz/earthquake/catalogofcatalogs.git
   cd catalogofcatalogs
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Initialize Database**
   ```bash
   npm run tsx scripts/init-database.ts
   ```

4. **Run Migrations**
   ```bash
   node scripts/migrate-add-source-id.js
   node scripts/migrate-add-geo-bounds.js
   node scripts/migrate-add-region.ts
   node scripts/migrate-add-metadata-fields.js
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Open Browser**
   Navigate to http://localhost:3000

### Code Style

The project uses ESLint and Prettier for code formatting.

**Run Linter**:
```bash
npm run lint
```

**Format Code**:
```bash
npm run format
```

### Git Workflow

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make Changes**
   - Write code
   - Add tests
   - Update documentation

3. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

4. **Push Branch**
   ```bash
   git push origin feature/my-feature
   ```

5. **Create Merge Request**
   - Open merge request in GitLab
   - Request code review
   - Address feedback

### Commit Message Convention

Follow conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

---

## Testing

### Running Tests

**All Tests**:
```bash
npm test
```

**Watch Mode**:
```bash
npm run test:watch
```

**Coverage Report**:
```bash
npm run test:coverage
```

### Writing Tests

**Unit Test Example**:

```typescript
import { calculateQualityScore } from '@/lib/quality-scoring';

describe('calculateQualityScore', () => {
  it('should calculate quality score correctly', () => {
    const event = {
      latitude_uncertainty: 1.0,
      longitude_uncertainty: 1.0,
      depth_uncertainty: 2.0,
      azimuthal_gap: 120,
      used_phase_count: 20,
      standard_error: 0.5,
      magnitude_station_count: 10,
      magnitude_uncertainty: 0.1
    };

    const result = calculateQualityScore(event);

    expect(result.overall).toBeGreaterThan(70);
    expect(result.grade).toBe('B');
  });
});
```

**Component Test Example**:

```typescript
import { render, screen } from '@testing-library/react';
import { EventTable } from '@/components/events/EventTable';

describe('EventTable', () => {
  it('should render events', () => {
    const events = [
      { id: '1', time: '2024-10-24T12:00:00Z', magnitude: 5.0, latitude: -41.0, longitude: 174.0 }
    ];

    render(<EventTable events={events} onEventClick={() => {}} />);

    expect(screen.getByText('5.0')).toBeInTheDocument();
  });
});
```

### Test Coverage Goals

- **Unit Tests**: >80% coverage for lib/ directory
- **Integration Tests**: Critical API endpoints
- **Component Tests**: Key UI components

---

## Deployment

### Production Build

1. **Build Application**
   ```bash
   npm run build
   ```

2. **Start Production Server**
   ```bash
   npm start
   ```

### Environment Variables

Create `.env.local` file:

```env
# Database
DATABASE_PATH=./merged_catalogues.db

# GeoNet API
GEONET_API_URL=https://service.geonet.org.nz/fdsnws/event/1/query

# Application
NODE_ENV=production
```

### Docker Deployment

**Build Image**:
```bash
docker build -t earthquake-catalogue .
```

**Run Container**:
```bash
docker run -p 3000:3000 -v $(pwd)/data:/app/data earthquake-catalogue
```

**Docker Compose**:
```bash
docker-compose up -d
```

### Performance Optimization

1. **Database Indexing**: Ensure all indexes are created
2. **Caching**: Use useCachedFetch for frequently accessed data
3. **Pagination**: Always paginate large datasets
4. **Code Splitting**: Next.js handles this automatically
5. **Image Optimization**: Use Next.js Image component

---

## Contributing

### Adding New Features

1. **Plan Feature**
   - Document requirements
   - Design API/UI
   - Get feedback

2. **Implement Feature**
   - Create feature branch
   - Write code
   - Add tests
   - Update documentation

3. **Code Review**
   - Submit merge request
   - Address feedback
   - Ensure tests pass

4. **Merge**
   - Squash commits if needed
   - Merge to main branch
   - Deploy to production

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No console.log statements
- [ ] Error handling is proper
- [ ] Performance is acceptable
- [ ] Accessibility is maintained
- [ ] Security is considered

### Adding New Dependencies

1. **Evaluate Need**: Is the dependency necessary?
2. **Check License**: Ensure compatible license
3. **Check Size**: Consider bundle size impact
4. **Install**: `npm install package-name`
5. **Document**: Update README if needed

---

## Troubleshooting

### Common Development Issues

**Port Already in Use**:
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

**Database Locked**:
```bash
# Close all connections and restart
rm merged_catalogues.db-journal
npm run tsx scripts/init-database.ts
```

**Module Not Found**:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**TypeScript Errors**:
```bash
# Rebuild TypeScript
npm run build
```

---

## Best Practices

### Code Organization

- Keep components small and focused
- Extract reusable logic into hooks
- Use TypeScript for type safety
- Follow single responsibility principle

### Performance

- Use React.memo for expensive components
- Implement pagination for large lists
- Debounce user input
- Cache API responses
- Optimize database queries

### Security

- Validate all user input
- Sanitize data before database insertion
- Use parameterized queries
- Implement rate limiting
- Keep dependencies updated

### Accessibility

- Use semantic HTML
- Provide alt text for images
- Ensure keyboard navigation
- Maintain color contrast
- Test with screen readers

---

## Resources

### Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)

### External APIs

- [GeoNet FDSN Web Services](https://www.geonet.org.nz/data/tools/FDSN)
- [QuakeML Documentation](https://quake.ethz.ch/quakeml)
- [FDSN Specification](https://www.fdsn.org/webservices)

### Tools

- [SQLite Browser](https://sqlitebrowser.org)
- [Postman](https://www.postman.com) - API testing
- [React DevTools](https://react.dev/learn/react-developer-tools)

---

*Last Updated: October 2024*

