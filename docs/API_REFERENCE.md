# API Reference

Complete reference for all API endpoints in the Earthquake Catalogue Platform.

## Table of Contents

1. [Authentication](#authentication)
2. [Catalogues API](#catalogues-api)
3. [Events API](#events-api)
4. [Import API](#import-api)
5. [Upload API](#upload-api)
6. [Merge API](#merge-api)
7. [Export API](#export-api)
8. [Health Check API](#health-check-api)
9. [Error Responses](#error-responses)

---

## Authentication

The API uses NextAuth.js for authentication with session-based authentication.

### Authentication Endpoints

#### Login
**Endpoint**: `POST /api/auth/signin`

#### Register
**Endpoint**: `POST /api/auth/register`

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "name": "User Name"
}
```

#### Get CSRF Token
**Endpoint**: `GET /api/auth/csrf`

Returns a CSRF token required for state-changing operations.

**Response**: `200 OK`
```json
{
  "csrfToken": "64-character-hex-token"
}
```

### Security Features

#### Rate Limiting

All API endpoints are protected by rate limiting to prevent abuse:

- **Authentication endpoints** (`/api/auth/*`): 5 requests per minute
- **Read operations** (`GET` requests): 120 requests per minute
- **Write operations** (`POST/PUT/DELETE/PATCH`): 60 requests per minute

When rate limit is exceeded, the API returns `429 Too Many Requests` with the following headers:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Timestamp when the limit resets
- `Retry-After`: Seconds to wait before retrying

**Example Rate Limit Response**:
```json
{
  "error": "Too many requests. Please try again later.",
  "retryAfter": 45
}
```

#### CSRF Protection

All state-changing operations (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid CSRF token.

**How to use CSRF protection**:

1. Get a CSRF token from `/api/auth/csrf`
2. Include the token in the `X-CSRF-Token` header for all state-changing requests

**Example**:
```bash
# Get CSRF token
curl -X GET https://example.com/api/auth/csrf \
  -H "Cookie: session-token"

# Use CSRF token in request
curl -X POST https://example.com/api/catalogues \
  -H "Cookie: session-token" \
  -H "X-CSRF-Token: your-csrf-token-here" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Catalogue", "events": [...]}'
```

**CSRF Error Response**: `403 Forbidden`
```json
{
  "error": "Invalid or missing CSRF token",
  "code": "CSRF_TOKEN_INVALID"
}
```

---

## Catalogues API

### List Catalogues

Get a paginated list of all catalogues.

**Endpoint**: `GET /api/catalogues`

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `pageSize` | number | No | 10 | Items per page |
| `search` | string | No | - | Search term for catalogue name |

**Response**: `200 OK`

```json
{
  "catalogues": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "GeoNet - New Zealand",
      "created_at": "2024-10-24T12:00:00.000Z",
      "updated_at": "2024-10-24T12:00:00.000Z",
      "status": "active",
      "event_count": 1434,
      "min_latitude": -47.5,
      "max_latitude": -34.2,
      "min_longitude": 165.8,
      "max_longitude": 179.2,
      "min_magnitude": 2.0,
      "max_magnitude": 7.8,
      "start_time": "2024-01-01T00:00:00.000Z",
      "end_time": "2024-10-24T12:00:00.000Z"
    }
  ],
  "total": 42,
  "page": 1,
  "pageSize": 10
}
```

---

### Create Catalogue

Create a new earthquake catalogue.

**Endpoint**: `POST /api/catalogues`

**Request Body**:

```json
{
  "name": "My Earthquake Catalogue",
  "events": [
    {
      "id": "event-001",
      "time": "2024-10-24T12:34:56.789Z",
      "latitude": -41.2865,
      "longitude": 174.7762,
      "depth": 33.0,
      "magnitude": 5.2,
      "magnitude_type": "ML",
      "region": "Wellington Region"
    }
  ]
}
```

**Response**: `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "My Earthquake Catalogue",
  "event_count": 1,
  "created_at": "2024-10-24T12:00:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid request body or missing required fields
- `500 Internal Server Error`: Database error

---

### Get Catalogue

Get details of a specific catalogue.

**Endpoint**: `GET /api/catalogues/{id}`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Catalogue UUID |

**Response**: `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "GeoNet - New Zealand",
  "created_at": "2024-10-24T12:00:00.000Z",
  "updated_at": "2024-10-24T12:00:00.000Z",
  "status": "active",
  "event_count": 1434,
  "min_latitude": -47.5,
  "max_latitude": -34.2,
  "min_longitude": 165.8,
  "max_longitude": 179.2,
  "min_magnitude": 2.0,
  "max_magnitude": 7.8,
  "start_time": "2024-01-01T00:00:00.000Z",
  "end_time": "2024-10-24T12:00:00.000Z"
}
```

**Error Responses**:
- `404 Not Found`: Catalogue does not exist

---

### Update Catalogue

Update catalogue metadata (currently only name).

**Endpoint**: `PATCH /api/catalogues/{id}`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Catalogue UUID |

**Request Body**:

```json
{
  "name": "Updated Catalogue Name"
}
```

**Response**: `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Updated Catalogue Name",
  "updated_at": "2024-10-24T13:00:00.000Z"
}
```

**Error Responses**:
- `400 Bad Request`: Invalid request body
- `404 Not Found`: Catalogue does not exist

---

### Delete Catalogue

Delete a catalogue and all its events.

**Endpoint**: `DELETE /api/catalogues/{id}`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Catalogue UUID |

**Response**: `200 OK`

```json
{
  "message": "Catalogue deleted successfully"
}
```

**Error Responses**:
- `404 Not Found`: Catalogue does not exist
- `500 Internal Server Error`: Database error

---

## Events API

### Get Catalogue Events

Get all events for a specific catalogue with pagination.

**Endpoint**: `GET /api/catalogues/{id}/events`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Catalogue UUID |

**Query Parameters**:

The API supports three pagination strategies:

#### 1. Cursor-Based Pagination (Recommended for Large Datasets)

Most efficient for large datasets. Uses stable cursors to navigate through results.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `cursor` | string | No | - | Cursor for pagination (format: "timestamp:id") |
| `limit` | number | No | 100 | Number of items to return (1-1000) |
| `direction` | string | No | 'desc' | Sort direction ('asc' or 'desc') |

**Example Request**:
```
GET /api/catalogues/{id}/events?limit=50&direction=desc
```

**Response**: `200 OK`

```json
{
  "data": [
    {
      "id": "event-001",
      "catalogue_id": "550e8400-e29b-41d4-a716-446655440000",
      "time": "2024-10-24T12:34:56.789Z",
      "latitude": -41.2865,
      "longitude": 174.7762,
      "depth": 33.0,
      "magnitude": 5.2,
      "magnitude_type": "ML",
      "region": "Wellington Region",
      "source": "GeoNet",
      "latitude_uncertainty": 0.5,
      "longitude_uncertainty": 0.5,
      "depth_uncertainty": 2.0,
      "azimuthal_gap": 120,
      "used_phase_count": 25,
      "used_station_count": 15,
      "quality_score": 85.5,
      "created_at": "2024-10-24T12:35:00.000Z"
    }
  ],
  "pagination": {
    "nextCursor": "2024-10-24T12:34:56.789Z:event-001",
    "prevCursor": null,
    "hasMore": true,
    "limit": 50
  }
}
```

**Navigating Pages**:

To get the next page, use the `nextCursor` value:
```
GET /api/catalogues/{id}/events?cursor=2024-10-24T12:34:56.789Z:event-001&limit=50&direction=desc
```

To get the previous page, use the `prevCursor` value with opposite direction:
```
GET /api/catalogues/{id}/events?cursor=2024-10-24T12:34:56.789Z:event-001&limit=50&direction=asc
```

#### 2. Page-Based Pagination

Traditional page-based pagination.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | number | No | 1 | Page number |
| `pageSize` | number | No | 50 | Items per page (1-1000) |

**Example Request**:
```
GET /api/catalogues/{id}/events?page=1&pageSize=50
```

**Response**: `200 OK`

```json
{
  "events": [...],
  "total": 1434,
  "page": 1,
  "pageSize": 50
}
```

#### 3. Limit/Offset Pagination

SQL-style limit/offset pagination.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | No | 100 | Number of items to return (1-1000) |
| `offset` | number | No | 0 | Number of items to skip |

**Example Request**:
```
GET /api/catalogues/{id}/events?limit=50&offset=100
```

**Performance Notes**:
- **Cursor-based pagination** is recommended for large datasets (>10,000 events) as it provides consistent O(1) performance
- **Page-based pagination** is suitable for smaller datasets and UI pagination controls
- **Limit/offset pagination** is provided for backward compatibility but may be slower on large datasets

---

### Get Filtered Events

Get events filtered by various criteria.

**Endpoint**: `GET /api/catalogues/{id}/events/filtered`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Catalogue UUID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `minMagnitude` | number | No | Minimum magnitude |
| `maxMagnitude` | number | No | Maximum magnitude |
| `minDepth` | number | No | Minimum depth (km) |
| `maxDepth` | number | No | Maximum depth (km) |
| `startTime` | string | No | Start time (ISO 8601) |
| `endTime` | string | No | End time (ISO 8601) |
| `minLatitude` | number | No | Minimum latitude |
| `maxLatitude` | number | No | Maximum latitude |
| `minLongitude` | number | No | Minimum longitude |
| `maxLongitude` | number | No | Maximum longitude |
| `eventType` | string | No | Event type filter |
| `magnitudeType` | string | No | Magnitude type (ML, Mw, etc.) |
| `evaluationStatus` | string | No | Evaluation status |
| `evaluationMode` | string | No | Evaluation mode |

**Response**: `200 OK`

```json
{
  "events": [...],
  "count": 234
}
```

---

## Import API

### Import from GeoNet

Import earthquake events from GeoNet FDSN Event Web Service.

**Endpoint**: `POST /api/import/geonet`

**Request Body**:

```json
{
  "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
  "catalogueName": "GeoNet - New Zealand",
  "timeRange": "24h",
  "customStartDate": null,
  "customEndDate": null,
  "minMagnitude": 3.0,
  "maxMagnitude": 10.0,
  "minDepth": 0,
  "maxDepth": 1000,
  "minLatitude": null,
  "maxLatitude": null,
  "minLongitude": null,
  "maxLongitude": null,
  "updateExisting": true
}
```

**Time Range Options**:
- `"1h"`: Last 1 hour
- `"6h"`: Last 6 hours
- `"12h"`: Last 12 hours
- `"24h"`: Last 24 hours
- `"48h"`: Last 48 hours
- `"7d"`: Last 7 days
- `"30d"`: Last 30 days
- `"custom"`: Use customStartDate and customEndDate

**Response**: `200 OK`

```json
{
  "success": true,
  "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
  "totalFetched": 45,
  "newEvents": 40,
  "updatedEvents": 5,
  "skippedEvents": 0,
  "errors": []
}
```

**Error Responses**:
- `400 Bad Request`: Invalid parameters
- `500 Internal Server Error`: Import failed

---

### Get Import History

Get import history for a catalogue.

**Endpoint**: `GET /api/import/history`

**Query Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `catalogueId` | string | Yes | - | Catalogue UUID |
| `limit` | number | No | 10 | Number of records |

**Response**: `200 OK`

```json
[
  {
    "id": "import-001",
    "catalogue_id": "550e8400-e29b-41d4-a716-446655440000",
    "start_time": "2024-10-24T12:00:00.000Z",
    "end_time": "2024-10-24T12:00:05.490Z",
    "total_fetched": 45,
    "new_events": 40,
    "updated_events": 5,
    "skipped_events": 0,
    "errors": null,
    "created_at": "2024-10-24T12:00:00.000Z"
  }
]
```

---

## Upload API

### Upload File

Upload and parse a data file (CSV, TXT, JSON, QuakeML).

**Endpoint**: `POST /api/upload`

**Request**: `multipart/form-data`

**Form Data**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File | Yes | Data file to upload |

**Response**: `200 OK`

```json
{
  "data": [
    {
      "time": "2024-10-24T12:34:56.789Z",
      "latitude": -41.2865,
      "longitude": 174.7762,
      "magnitude": 5.2,
      "depth": 33.0
    }
  ],
  "headers": ["time", "latitude", "longitude", "magnitude", "depth"],
  "format": "csv",
  "rowCount": 1
}
```

**Error Responses**:
- `400 Bad Request`: No file provided or unsupported format
- `500 Internal Server Error`: Parse error

---

## Merge API

### Merge Catalogues

Merge multiple catalogues into a new catalogue.

**Endpoint**: `POST /api/merge`

**Request Body**:

```json
{
  "name": "Merged Catalogue",
  "catalogueIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "660e8400-e29b-41d4-a716-446655440001"
  ],
  "matchingRules": {
    "timeWindow": 60,
    "distanceThreshold": 50,
    "magnitudeDifference": 0.5
  },
  "conflictResolution": "prefer_first"
}
```

**Conflict Resolution Options**:
- `"prefer_first"`: Use values from first catalogue
- `"prefer_last"`: Use values from last catalogue
- `"prefer_largest_magnitude"`: Use event with largest magnitude
- `"prefer_best_quality"`: Use event with highest quality score

**Response**: `200 OK`

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "name": "Merged Catalogue",
  "event_count": 2500,
  "unique_events": 2000,
  "merged_events": 500
}
```

---

## Export API

### Export Catalogue

Export a catalogue in various formats.

**Endpoint**: `GET /api/catalogues/{id}/export`

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Catalogue UUID |

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `format` | string | Yes | Export format (csv, json, geojson, kml, quakeml) |

**Response**: File download with appropriate Content-Type

**Formats**:

- **CSV**: `text/csv`
- **JSON**: `application/json`
- **GeoJSON**: `application/geo+json`
- **KML**: `application/vnd.google-earth.kml+xml`
- **QuakeML**: `application/xml`

---

## Health Check API

### Readiness Check

Check if the application is ready to serve requests.

**Endpoint**: `GET /api/ready`

**Response**: `200 OK`

```json
{
  "status": "healthy",
  "timestamp": "2024-10-24T12:00:00.000Z",
  "checks": [
    {
      "name": "database",
      "status": "healthy",
      "responseTime": 5
    }
  ]
}
```

**Error Response**: `503 Service Unavailable`

```json
{
  "status": "unhealthy",
  "timestamp": "2024-10-24T12:00:00.000Z",
  "checks": [
    {
      "name": "database",
      "status": "unhealthy",
      "message": "Database connection failed"
    }
  ]
}
```

---

## Error Responses

All API endpoints follow a consistent error response format.

### Error Response Format

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)",
  "code": "ERROR_CODE"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Invalid CSRF token or insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Common Error Codes

| Code | Description |
|------|-------------|
| `INVALID_INPUT` | Request validation failed |
| `NOT_FOUND` | Resource not found |
| `UNAUTHORIZED` | Authentication required |
| `CSRF_TOKEN_INVALID` | Invalid or missing CSRF token |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `DATABASE_ERROR` | Database operation failed |
| `PARSE_ERROR` | File parsing failed |
| `IMPORT_ERROR` | GeoNet import failed |
| `MERGE_ERROR` | Catalogue merge failed |

---

*Last Updated: October 2024*
