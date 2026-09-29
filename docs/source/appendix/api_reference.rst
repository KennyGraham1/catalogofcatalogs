API Reference
=============


Complete reference for all API endpoints in the Earthquake Catalogue Platform.

Table of Contents
-----------------


1. `Catalogues API <#catalogues-api>`_
2. `Events API <#events-api>`_
3. `Import API <#import-api>`_
4. `Upload API <#upload-api>`_
5. `Merge API <#merge-api>`_
6. `Export API <#export-api>`_
7. `Saved Filters API <#saved-filters-api>`_
8. `Health Check API <#health-check-api>`_
9. `Error Responses <#error-responses>`_



.. START SECURITY FEATURES

Security Features
-----------------


Rate Limiting
^^^^^^^^^^^^^


Rate limits are applied per endpoint, per client address (see ``TRUSTED_PROXY_HOPS``
in the deployment guide), not per HTTP method. Endpoints that share a counter are
grouped: a client's requests to either endpoint in a group count against the same
window, and each endpoint compares that shared count with its own limit.

.. list-table::
   :header-rows: 1

   * - Endpoint
     - Limit
     - Shared counter
   * - ``GET /api/catalogues``
     - 120 per minute
     - read
   * - ``GET /api/faults/nearby``
     - 30 per minute per signed-in user
     - its own counter, keyed by user rather than address
   * - ``POST /api/catalogues``
     - 30 per minute
     - api (with ``GET /api/events/search``)
   * - ``GET /api/events/search``
     - 60 per minute
     - api (with ``POST /api/catalogues``)
   * - ``POST /api/auth/register``, ``/forgot-password``, ``/reset-password``,
       ``/change-password``
     - 10 per 15 minutes
     - auth (all four)

Credential sign-in has its own limiter, backed by MongoDB so that it is shared across
server instances, and checked before the account is looked up. Clients are keyed by
address (IPv6 grouped by /64) and accounts by normalised email; successful sign-ins
never count.

- A browser without a known-device cookie for the account may make 10 failed attempts
  per account, and 50 across all accounts, in each 15-minute window. After 100
  consecutive failed attempts on an account from such browsers, further attempts from
  them are refused (``AccountProtected``) until any successful sign-in, or for 24 hours
  after the last counted failure.
- A browser that has signed in to the account, or completed a password reset for it,
  holds a known-device cookie (httpOnly, 90 days, signed with ``NEXTAUTH_SECRET``). It
  may make 10 failed attempts per window and is not affected by the account-wide limit,
  so the account owner cannot be locked out from their own browsers.
- Password-reset emails are limited to 3 per account per hour; the 3 newest unused
  links stay valid.

The other limits above are held in memory by each server instance. Endpoints not
listed have no application-level rate limit; apply one at the reverse proxy if needed.

When a limit is exceeded, the API returns ``429 Too Many Requests`` with these headers:

- ``X-RateLimit-Limit``: the endpoint's limit
- ``X-RateLimit-Remaining``: requests remaining in the current window
- ``X-RateLimit-Reset``: ISO 8601 time at which the window resets
- ``Retry-After``: seconds to wait before retrying

**Example Rate Limit Response**:

.. code-block:: json

   {
     "error": "Too many requests. Please try again later.",
     "retryAfter": "45"
   }




.. END SECURITY FEATURES

.. START CATALOGUES API

Catalogues API
--------------


List Catalogues
^^^^^^^^^^^^^^^


Get a paginated list of all catalogues.

**Endpoint**: ``GET /api/catalogues``

**Query Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - ``page``
     - number
     - No
     - 1
     - Page number
   * - ``pageSize``
     - number
     - No
     - 10
     - Items per page
   * - ``search``
     - string
     - No
     - -
     - Search term for catalogue name


**Response**: ``200 OK``

.. code-block:: json

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
         "end_time": "2024-10-24T12:00:00.000Z",
         "version": "1.0.0",
         "version_updated_at": "2024-10-24T12:00:00.000Z",
         "source_version": null
       }
     ],
     "total": 42,
     "page": 1,
     "pageSize": 10
   }




Create Catalogue
^^^^^^^^^^^^^^^^


Create a new earthquake catalogue. Every event is validated and stored server-side;
the client never has to send the complete parsed event list inline.

**Endpoint**: ``POST /api/catalogues``

**Request Body (pending-upload manifest — the web upload flow)**:

Each file is first uploaded and parsed with ``POST /api/upload`` (or the chunked
``/api/upload/init`` -> ``/api/upload/chunk`` -> ``/api/upload/finalize`` flow for large
files), which stores the parsed events server-side (MongoDB, 24-hour TTL) and returns a
``pendingUploadId``. The catalogue is then created from a ``pendingUploads`` manifest, one
entry per uploaded file, **in file order**:

.. code-block:: json

   {
     "name": "My Earthquake Catalogue",
     "pendingUploads": [
       {
         "id": "6620…pending-upload-id",
         "expectedCount": 1,
         "fileName": "events.csv",
         "format": "CSV",
         "mapping": {
           "set": { "magnitude": "mag_local" },
           "unset": []
         },
         "fileDecisions": { "dateFormat": "ISO", "depthUnit": "km" }
       }
     ]
   }

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 40

   * - Field
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - The ``pendingUploadId`` returned by the upload endpoint (max 128 chars)
   * - ``expectedCount``
     - integer
     - Yes
     - Number of events the upload response reported for this file (1-50,000,000); the
       server rejects the request if the pending store does not hold exactly this many
   * - ``fileName``
     - string
     - No
     - Original file name (max 512 chars), echoed back in provenance metadata
   * - ``format``
     - string
     - No
     - Detected file format label (max 32 chars)
   * - ``mapping``
     - object
     - No
     - Explicit column remap for this file only: ``{ "set": { target: sourceColumn },
       "unset": [target, ...] }``; re-reads the named raw columns through the same
       parsing rules the upload used (date format, depth unit)
   * - ``fileDecisions``
     - object
     - No
     - ``{ "dateFormat": "US"|"International"|"ISO", "depthUnit": "km"|"m" }``, needed
       only when ``mapping.set`` remaps a date or depth column

A manifest holds 1-50 entries with distinct ``id`` values. The older
``pendingUploadIds`` (array) / ``pendingUploadId`` (single string) request fields are
still accepted as a manifest without per-file counts or mapping.

**Request Body (inline events — API clients)**:

.. code-block:: json

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

.. note::
   The old request shape that sent every parsed event inline together with a top-level
   ``fieldMappings`` object is no longer supported: a body containing ``fieldMappings``
   is rejected with ``400`` (``code: "LEGACY_FIELD_MAPPINGS"``). Send each file's
   explicit remap in ``pendingUploads[].mapping`` instead.

**Response**: ``201 Created``

The response spreads all catalogue fields (including the server-managed ``version``,
``version_updated_at`` and any ``source_version`` — see *Catalogue Version and
Provenance* below) plus a validation report:

.. code-block:: json

   {
     "id": "550e8400-e29b-41d4-a716-446655440000",
     "name": "My Earthquake Catalogue",
     "event_count": 1,
     "created_at": "2024-10-24T12:00:00.000Z",
     "version": "1.0.0",
     "version_updated_at": "2024-10-24T12:00:00.000Z",
     "importMessage": "Successfully imported all 1 events.",
     "partialImport": false,
     "validationReport": {
       "totalSubmitted": 1,
       "successfullyImported": 1,
       "failedValidation": 0,
       "duplicatesSkipped": 0,
       "successRate": 100,
       "invalidEvents": [],
       "hasMoreInvalidEvents": false
     }
   }

``duplicatesSkipped`` counts rows dropped because they repeated another row's
``source_id`` (first occurrence wins). ``invalidEvents`` lists up to 100 ``{index,
reason, file?}`` entries; ``hasMoreInvalidEvents`` is true when more were dropped than
are listed.

**Error Responses**:

.. list-table::
   :header-rows: 1
   :widths: 15 20 65

   * - Status
     - Code
     - Meaning
   * - 400
     - ``MISSING_NAME`` / ``NAME_TOO_LONG``
     - Catalogue name is missing, empty, or over 255 characters
   * - 400
     - ``INVALID_JSON``
     - Request body is not valid JSON, or not a JSON object
   * - 400
     - ``LEGACY_FIELD_MAPPINGS``
     - Body still uses the retired top-level ``fieldMappings`` shape
   * - 400
     - ``INVALID_PENDING_UPLOAD_IDS`` / ``INVALID_PENDING_UPLOADS``
     - ``pendingUploads``/``pendingUploadIds`` is malformed, empty, or has duplicate IDs
   * - 400
     - ``INVALID_EVENTS``
     - Neither ``events`` nor ``pendingUploads`` was supplied
   * - 400
     - ``ALL_EVENTS_INVALID``
     - Every submitted event failed validation (time, latitude -90..90, longitude
       -180..180, magnitude -3..10); none were imported
   * - 404
     - ``PENDING_UPLOAD_NOT_FOUND``
     - A ``pendingUploads[].id`` is missing, expired (24h TTL), or belongs to another
       user's session
   * - 409
     - ``PENDING_UPLOAD_MISMATCH``
     - A file's stored event count no longer matches its declared ``expectedCount``
       (the pending upload changed or was replayed concurrently)
   * - 413
     - ``BODY_TOO_LARGE``
     - Request body exceeds 100MB
   * - 500
     - ``DATABASE_ERROR`` / other
     - Database error



Get Catalogue
^^^^^^^^^^^^^


Get details of a specific catalogue.

**Endpoint**: ``GET /api/catalogues/{id}``

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Response**: ``200 OK``

.. code-block:: json

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
     "end_time": "2024-10-24T12:00:00.000Z",
     "version": "1.0.0",
     "version_updated_at": "2024-10-24T12:00:00.000Z",
     "source_version": null
   }


**Error Responses**:
- ``404 Not Found``: Catalogue does not exist



Catalogue Version and Provenance
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Every catalogue record carries three related fields:

- ``version`` — a server-managed ``MAJOR.MINOR.PATCH`` string (semantic versioning).
  A newly created catalogue starts at ``"1.0.0"``; the server bumps it automatically
  whenever the catalogue or its events change (a metadata-only edit such as ``PATCH``
  bumps the PATCH component, e.g. ``1.0.0`` -> ``1.0.1``). It cannot be set by the
  client — any ``version`` sent in a request body is ignored.
- ``version_updated_at`` — ISO 8601 UTC timestamp of the last version bump. Also
  server-set and never client-writable.
- ``source_version`` — a free-text, depositor-supplied label for the source dataset's
  own release (e.g. ``"GeoNet catalogue export 2024-Q3"``). This is independent of the
  platform ``version`` above and *is* client-settable through ``PATCH``.

A catalogue stored before versioning existed reads back as ``version: "1.0.0"``.


Update Catalogue
^^^^^^^^^^^^^^^^


Update catalogue metadata: the name and a bounded set of descriptive fields
(``description``, ``data_source``, ``provider``, ``geographic_region``,
``data_quality``, ``quality_notes``, ``keywords``, ``reference_links``, ``notes``,
``time_period_start``/``time_period_end``, ``contact_name``/``contact_email``/
``contact_organization``, ``license``, ``usage_terms``, ``citation``, ``doi``,
``source_version``, and the merge-description fields). The combined metadata is
capped at 50KB (JSON-serialised).

**Endpoint**: ``PATCH /api/catalogues/{id}``

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Request Body**:

.. code-block:: json

   {
     "name": "Updated Catalogue Name",
     "contact_email": "data@example.org",
     "source_version": "GeoNet catalogue export 2024-Q3"
   }

**Validation rules**:

- Unknown keys in the request body are silently stripped, not an error.
- ``version`` and ``version_updated_at`` are provenance fields the server manages;
  they cannot be set by the client — any value sent for them is ignored (the server
  always writes its own computed ``version``/``version_updated_at``).
- ``contact_email`` is validated as an email address when present (an empty string
  clears it).
- ``name``, when present, must be a non-empty string of at most 255 characters.

**Response**: ``200 OK``

.. code-block:: json

   {
     "success": true,
     "version": "1.0.1"
   }

The response's ``version`` is the catalogue's new version after this update's PATCH-level
bump (unchanged if the request carried no recognised, changed field).

**Error Responses**:

- ``400 Bad Request``: Request body is not a JSON object, ``name`` is invalid, or a
  metadata field fails validation (response includes ``details``: an array of
  ``{path, message}``)
- ``404 Not Found``: Catalogue does not exist



Delete Catalogue
^^^^^^^^^^^^^^^^


Delete a catalogue and all its events.

**Endpoint**: ``DELETE /api/catalogues/{id}``

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Response**: ``200 OK``

.. code-block:: json

   {
     "success": true
   }


**Error Responses**:
- ``404 Not Found``: Catalogue does not exist
- ``500 Internal Server Error``: Database error



Get Catalogue Statistics
^^^^^^^^^^^^^^^^^^^^^^^^


Aggregated statistics for one catalogue's events (date range, magnitude/depth
distributions, quality metrics), computed in MongoDB rather than by loading every
event into the application.

**Endpoint**: ``GET /api/catalogues/{id}/statistics``

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Response**: ``200 OK``

.. code-block:: json

   {
     "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
     "version": "1.0.0",
     "eventCount": 1434,
     "dateRange": {
       "earliest": "2024-01-01T00:00:00.000Z",
       "latest": "2024-10-24T12:00:00.000Z",
       "spanDays": 297
     },
     "magnitudeRange": {
       "min": 2.0,
       "max": 7.8,
       "average": 3.4,
       "median": 3.1
     },
     "depthRange": {
       "min": 0.0,
       "max": 180.5,
       "average": 22.3
     },
     "magnitudeTypes": [
       { "type": "ML", "count": 1200 },
       { "type": "Mw", "count": 234 }
     ],
     "qualityMetrics": {
       "averageAzimuthalGap": 95.2,
       "averageStationCount": 18.4,
       "eventsWithUncertainty": 1100,
       "eventsWithHorizontalUncertainty": 1080,
       "eventsWithDepthUncertainty": 1050,
       "eventsWithFocalMechanism": 12,
       "eventsWithQualityScore": 1434,
       "averageQualityScore": 78.4,
       "gradeDistribution": [
         { "grade": "A", "count": 210 },
         { "grade": "B+", "count": 480 },
         { "grade": "B", "count": 520 },
         { "grade": "C", "count": 224 }
       ]
     }
   }

``dateRange``, ``magnitudeRange``, ``depthRange`` and ``qualityMetrics`` are each
``null`` when the catalogue has no events carrying the underlying field (an empty
catalogue returns every one of them ``null`` with ``eventCount: 0``) — never a
placeholder like ``{"min": 0, "max": 0}``, which would be indistinguishable from real
data at exactly zero. ``eventsWithQualityScore`` counts events carrying a stored
quality score (rows written before scoring was persisted do not); ``averageQualityScore``
is the mean of those scores (0-100); ``gradeDistribution`` lists only grades that
actually occur, best first.

**Error Responses**:
- ``404 Not Found``: Catalogue does not exist
- ``500 Internal Server Error``: Database error



.. END CATALOGUES API

.. START EVENTS API

Events API
----------


Get Catalogue Events
^^^^^^^^^^^^^^^^^^^^


Get all events for a specific catalogue with pagination.

**Endpoint**: ``GET /api/catalogues/{id}/events``

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Query Parameters**:

The API supports three pagination strategies:

1. Cursor-Based Pagination (Recommended for Large Datasets)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


Most efficient for large datasets. Uses stable cursors to navigate through results.

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - ``cursor``
     - string
     - No
     - -
     - Opaque cursor returned by the preceding response; URL-encode it when sending
   * - ``limit``
     - number
     - No
     - 100
     - Number of items to return (capped at 10,000; deployment limits may be lower)
   * - ``direction``
     - string
     - No
     - 'desc'
     - Sort direction ('asc' or 'desc')


**Example Request**:
.. code-block:: text

   GET /api/catalogues/{id}/events?limit=50&direction=desc


**Response**: ``200 OK``

.. code-block:: json

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
         "quality_score": 86,
         "created_at": "2024-10-24T12:35:00.000Z"
       }
     ],
     "pagination": {
       "nextCursor": "WyIyMDI0LTEwLTI0VDEyOjM0OjU2Ljc4OVoiLCJldmVudC0wMDEiXQ",
       "prevCursor": null,
       "hasMore": true,
       "limit": 50
     }
   }


**Navigating Pages**:

To get the next page, use the ``nextCursor`` value:
.. code-block:: text

   GET /api/catalogues/{id}/events?cursor={nextCursor}&limit=50&direction=desc


To get the previous page, use the ``prevCursor`` value with opposite direction:
.. code-block:: text

   GET /api/catalogues/{id}/events?cursor={prevCursor}&limit=50&direction=asc

Lightweight Event Pages
~~~~~~~~~~~~~~~~~~~~~~~

Add ``view=summary`` for maps, event tables, and plots. This mode always uses
cursor pagination and returns the same ``data`` and ``pagination`` envelope.
It retains scalar event and quality fields and focal mechanisms, but omits
``source_events``, ``origins``, ``magnitudes``, ``picks``, ``arrivals``,
``amplitudes``, ``station_magnitudes``, ``event_descriptions``, ``comments``,
and ``creation_info``. Omitted fields can still exist in the full event record.

.. code-block:: text

   GET /api/catalogues/{id}/events?view=summary&limit=500
   GET /api/catalogues/{id}/events?view=summary&limit=5000&cursor={nextCursor}

Continue until ``pagination.hasMore`` is false. Summary page sizes are capped
by both 10,000 and any positive ``MAX_EVENTS_REQUEST_LIMIT`` configuration.
Without ``view=summary``, the full-record response remains available.

The UI shows a preview of up to 500 events, loads the remaining pages with at
most three requests in flight, and enables catalogue analyses only after all
pages finish. Completed catalogues are cached within the mounted page for up
to two minutes, subject to size and catalogue metadata limits.


2. Page-Based Pagination
~~~~~~~~~~~~~~~~~~~~~~~~


Traditional page-based pagination.

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - ``page``
     - number
     - No
     - 1
     - Page number
   * - ``pageSize``
     - number
     - No
     - 50
     - Items per page (1-1000)


**Example Request**:
.. code-block:: text

   GET /api/catalogues/{id}/events?page=1&pageSize=50


**Response**: ``200 OK``

.. code-block:: json

   {
     "events": [...],
     "total": 1434,
     "page": 1,
     "pageSize": 50
   }


3. Limit/Offset Pagination
~~~~~~~~~~~~~~~~~~~~~~~~~~


SQL-style limit/offset pagination.

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - ``limit``
     - number
     - No
     - 100
     - Number of items to return (1-1000)
   * - ``offset``
     - number
     - No
     - 0
     - Number of items to skip


**Example Request**:
.. code-block:: text

   GET /api/catalogues/{id}/events?limit=50&offset=100


**Performance Notes**:
- **Cursor-based pagination** is recommended for large datasets (>10,000 events) as it provides consistent O(1) performance
- **Page-based pagination** is suitable for smaller datasets and UI pagination controls
- **Limit/offset pagination** is provided for backward compatibility but may be slower on large datasets



Get Filtered Events
^^^^^^^^^^^^^^^^^^^


Get events filtered by various criteria.

**Endpoint**: ``GET /api/catalogues/{id}/events/filtered``

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Query Parameters**:

All parameters are optional and combine with AND semantics. Every value is parsed as a
strict decimal (or, for the vocabulary fields below, matched case-insensitively) — a
value that does not parse completely, or falls outside its range, is rejected (see
*Validation Rules*) rather than silently ignored. Parameters not listed here are
ignored. This same parameter set is shared, unchanged, by the filtered/unfiltered
switch of ``GET /api/catalogues/{id}/export`` (see the Export API).

.. list-table::
   :header-rows: 1
   :widths: 22 10 10 58

   * - Parameter
     - Type
     - Required
     - Description
   * - ``minMagnitude``
     - number
     - No
     - Minimum magnitude, -3 to 10
   * - ``maxMagnitude``
     - number
     - No
     - Maximum magnitude, -3 to 10
   * - ``minDepth``
     - number
     - No
     - Minimum depth (km, positive down), -5 to 1000
   * - ``maxDepth``
     - number
     - No
     - Maximum depth (km), -5 to 1000
   * - ``startTime``
     - string
     - No
     - Start of origin time range, inclusive. ISO 8601; a value with no UTC offset is
       read as UTC
   * - ``endTime``
     - string
     - No
     - End of origin time range, inclusive. Same parsing as ``startTime``
   * - ``minLatitude``
     - number
     - No
     - Minimum latitude, -90 to 90
   * - ``maxLatitude``
     - number
     - No
     - Maximum latitude, -90 to 90
   * - ``minLongitude``
     - number
     - No
     - Minimum longitude, -180 to 180. When greater than ``maxLongitude`` the box is
       read as crossing the antimeridian (RFC 7946 §5.2) — e.g.
       ``minLongitude=177&maxLongitude=-178`` for the Kermadec arc — which is not an
       error
   * - ``maxLongitude``
     - number
     - No
     - Maximum longitude, -180 to 180
   * - ``eventType``
     - string
     - No
     - QuakeML event type (e.g. ``earthquake``, ``quarry blast``); matched
       case-insensitively against the QuakeML 1.2 BED enumeration plus the platform's
       volcano-seismology labels (``tremor``, ``volcanic tremor``,
       ``volcano-tectonic``, ``tectonic``, ``volcanic``)
   * - ``magnitudeType``
     - string
     - No
     - Magnitude scale (``ML``, ``Mw``, ``mb``, ``Mw(mB)``, ...); free-form but bounded
       (starts with a letter, 1-20 chars)
   * - ``evaluationStatus``
     - string
     - No
     - One of ``preliminary``, ``confirmed``, ``reviewed``, ``final``, ``rejected``
       (case-insensitive)
   * - ``evaluationMode``
     - string
     - No
     - One of ``manual``, ``automatic`` (case-insensitive)
   * - ``maxAzimuthalGap``
     - number
     - No
     - Largest accepted azimuthal gap, degrees, 0-360
   * - ``minUsedPhaseCount``
     - integer
     - No
     - Smallest accepted used-phase count, 0-100000
   * - ``minUsedStationCount``
     - integer
     - No
     - Smallest accepted used-station count, 0-100000
   * - ``maxStandardError``
     - number
     - No
     - Largest accepted origin RMS, seconds, 0-1000
   * - ``maxHorizontalUncertainty``
     - number
     - No
     - Largest accepted horizontal location uncertainty, km, 0-20000. Matched against
       the same value the quality score reads: the error-ellipse semi-major axis, else
       the circular horizontal uncertainty, else the larger of the latitude/longitude
       marginals converted to km
   * - ``maxDepthUncertainty``
     - number
     - No
     - Largest accepted depth uncertainty, km, 0-1000
   * - ``maxTimeUncertainty``
     - number
     - No
     - Largest accepted origin-time uncertainty, seconds, 0-86400
   * - ``maxMagnitudeUncertainty``
     - number
     - No
     - Largest accepted magnitude uncertainty, magnitude units, 0-10
   * - ``minQuality``
     - integer
     - No
     - Minimum stored quality score, 0-100 (a ``quality_score >=`` filter — not a
       letter grade)


**Validation Rules**:

- A parameter given twice with different values is rejected.
- ``minMagnitude``/``maxMagnitude``, ``minDepth``/``maxDepth`` and
  ``minLatitude``/``maxLatitude`` are each rejected if the minimum is greater than the
  maximum. ``startTime`` after ``endTime`` is likewise rejected. ``minLongitude`` is
  deliberately **not** checked against ``maxLongitude`` this way — a reversed longitude
  pair is the antimeridian-crossing convention above, not an error.
- Any violation (unparseable value, out-of-range value, reversed range, duplicate
  parameter) returns ``400`` with ``{"error": "<message naming the parameter>"}`` — no
  ``code`` field.

**Response**: ``200 OK``

.. code-block:: json

   {
     "success": true,
     "events": [...],
     "count": 234,
     "truncated": false,
     "limit": 10000,
     "filters": { "minMagnitude": 4 }
   }

``truncated`` is ``true`` when more matching events exist than were returned (the
deployment's filtered-events cap); ``limit`` reports that cap. ``filters`` echoes the
parsed filters actually applied.

**Error Responses**:
- ``400 Bad Request``: A filter parameter failed validation (see above)
- ``500 Internal Server Error``: Database error



Search Events
^^^^^^^^^^^^^


Full-text and structured search across events in every catalogue (or one catalogue),
for the global search box.

**Endpoint**: ``GET /api/events/search``

**Query Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 15 10 55

   * - Parameter
     - Type
     - Required
     - Description
   * - ``q``
     - string
     - No
     - Search text. Missing, or under 2 characters after trimming, returns
       ``{"results": []}`` rather than an error. May combine free words (matched
       case-insensitively against ``event_public_id``, ``source_id``, ``event_type``,
       ``id``, ``region``, ``location_name``, ``magnitude_type``, ``agency_id`` and
       ``author``) with ``field:value`` tokens
   * - ``catalogueId``
     - string
     - No
     - Restrict results to one catalogue
   * - ``limit``
     - integer
     - No
     - Maximum results, default 20. Must be a whole number >= 1 (``400`` otherwise);
       values above 100 are silently capped at 100

**Search token grammar** (space-separated ``field:value`` terms within ``q``; a term whose
prefix is not one of the fields below, such as ``GeoNet:2016p858000`` or
``smi:nz.org.geonet/2016p858000``, is searched as plain text):

.. list-table::
   :header-rows: 1
   :widths: 25 75

   * - Token
     - Meaning
   * - ``id:<text>``
     - Matches ``id``, ``event_public_id`` or ``source_id`` (the agency's own event ID,
       e.g. a GeoNet EventID)
   * - ``public:<text>``
     - Matches ``event_public_id`` only
   * - ``type:<text>`` / ``event:<text>``
     - Matches ``event_type``
   * - ``region:<text>`` / ``loc:<text>`` / ``location:<text>``
     - Matches ``region`` or ``location_name``
   * - ``catalogue:<text>`` / ``source:<text>``
     - Matches catalogues whose name contains ``<text>``
   * - ``mag:<value>`` / ``magnitude:<value>``
     - Numeric filter: an exact value, ``>=4``, ``<=4``, ``>4``, ``<4``, or a range
       ``-0.5..2``
   * - ``depth:<value>``
     - Same comparison/range syntax as ``mag:``, over depth (km)
   * - ``date:<value>`` / ``time:<value>``
     - UTC date/period filter: a year (``2024``), month (``2024-03``) or day
       (``2024-03-15``); a range (``2023..2024-06-30``); or a comparison
       (``>=2024-01``, ``<2020``)

An unparseable ``mag:``/``depth:``/``date:`` token is a ``400`` naming the token,
rather than being dropped silently.

**Response**: ``200 OK``

.. code-block:: json

   {
     "results": [
       {
         "id": "event-001",
         "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
         "catalogueName": "GeoNet - New Zealand",
         "publicId": "smi:nz.org.geonet/2024p123456",
         "time": "2024-10-24T12:34:56.789Z",
         "latitude": -41.2865,
         "longitude": 174.7762,
         "depth": 33.0,
         "magnitude": 5.2,
         "magnitudeType": "ML",
         "eventType": "earthquake",
         "region": "Wellington Region",
         "locationName": "Wellington Region",
         "label": "M5.2 Wellington Region - 24/10/2024",
         "description": "smi:nz.org.geonet/2024p123456 • earthquake • GeoNet - New Zealand"
       }
     ],
     "count": 1,
     "query": "wellington mag:>=5"
   }

**Error Responses**:
- ``400 Bad Request``: Invalid ``limit``, or an unparseable ``mag:``/``depth:``/``date:`` token
- ``429 Too Many Requests``: More than 60 search requests in one minute
- ``500 Internal Server Error``: Database error


Get Full Event Details
^^^^^^^^^^^^^^^^^^^^^^

**Endpoint**: ``GET /api/catalogues/{id}/events/{eventId}``

Returns one full event, including nested QuakeML fields omitted from summary
pages. The event must belong to the specified catalogue. URL-encode both path
parameters. A successful response is the event object with status ``200``;
an unknown event returns ``404``. This endpoint requires the same viewer
authentication as the event list endpoint.

.. END EVENTS API

.. START IMPORT API

Import API
----------


Import from GeoNet
^^^^^^^^^^^^^^^^^^


Import earthquake events from the GeoNet FDSN Event Web Service, either into a new
catalogue or into an existing one the GeoNet importer itself created.

**Endpoint**: ``POST /api/import/geonet``

**Request Body**:

.. code-block:: json

   {
     "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
     "catalogueName": "GeoNet - New Zealand",
     "startDate": "2024-01-01T00:00:00Z",
     "endDate": "2024-01-31T23:59:59Z",
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

.. note::
   For recent events use ``hours`` instead of ``startDate``/``endDate`` (e.g.
   ``"hours": 24`` for the last 24 hours); a date-time with no UTC offset is read as
   UTC. ``startDate`` and ``endDate`` must be supplied together — one without the
   other is a ``400``. ``minLongitude > maxLongitude`` is accepted as an
   antimeridian-crossing box (RFC 7946 §5.2), not an error.

   Omit ``catalogueId`` to create a new catalogue using ``catalogueName``. To add to
   an existing catalogue instead, pass its id as ``catalogueId`` — but it must be a
   catalogue a previous GeoNet import created (checked via its stored merge config);
   any other catalogue id is rejected. With ``updateExisting: true``, an event GeoNet
   still reports is rewritten only when its fields actually changed since the last
   import; otherwise it is left stored as-is and counted in ``skippedEvents``.

**Response**: ``200 OK``

.. code-block:: json

   {
     "success": true,
     "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
     "catalogueName": "GeoNet - New Zealand",
     "totalFetched": 45,
     "newEvents": 40,
     "updatedEvents": 5,
     "skippedEvents": 0,
     "collidedEvents": 0,
     "invalidEvents": 0,
     "excludedEvents": 0,
     "excludedEventTypes": {},
     "failedEvents": 0,
     "errors": [],
     "startTime": "2024-10-24T12:00:00.000Z",
     "endTime": "2024-10-24T12:00:05.490Z",
     "duration": 5490
   }

Every row GeoNet returns lands in exactly one bucket, so ``totalFetched`` =
``newEvents`` + ``updatedEvents`` + ``skippedEvents`` + ``collidedEvents`` +
``invalidEvents`` + ``excludedEvents`` + ``failedEvents``:

- ``collidedEvents`` — rows the database did not write because their GeoNet EventID
  repeated within the fetch, or was stored meanwhile by a concurrent import.
- ``invalidEvents`` — rows GeoNet returned unusable, or that failed validation.
- ``excludedEvents`` — rows GeoNet flags as ``duplicate``, ``not existing`` or ``not
  locatable`` (not a separate, located seismic event); never imported.
  ``excludedEventTypes`` breaks this count down by GeoNet event type.
- ``failedEvents`` — rows not written because a database write failed.

Every imported event stores both ``event_type`` (the QuakeML 1.2 BED type SeisComP's
own SC3ML-to-QuakeML mapping produces — e.g. GeoNet's ``outside of network interest``
maps to ``other event`` and ``induced earthquake`` maps to ``induced or triggered
event``) and ``source_event_type`` (GeoNet's own event-type string, verbatim).

**Error Responses**:

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Status
     - Meaning
   * - 400
     - Invalid parameters, **or** ``catalogueId`` names a catalogue that was not
       created by the GeoNet importer
   * - 404
     - ``catalogueId`` does not name an existing catalogue
   * - 409
     - A GeoNet import into that catalogue is already running
   * - 502
     - GeoNet API returned an error
   * - 503
     - GeoNet API circuit breaker is open, or the database is unavailable
   * - 504
     - Request to the GeoNet API timed out
   * - 500
     - Import failed for another reason

Every error response has the shape ``{"error": "Import failed", "message": "...",
"errorType": "...", "timestamp": "..."}``. Nothing is fetched or written when the
``400``/``404``/``409`` cases above are returned.



Get Import History
^^^^^^^^^^^^^^^^^^


Get import history for a catalogue.

**Endpoint**: ``GET /api/import/history``

**Query Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Default
     - Description
   * - ``catalogueId``
     - string
     - Yes
     - -
     - Catalogue UUID
   * - ``limit``
     - number
     - No
     - 10
     - Number of records


**Response**: ``200 OK``

.. code-block:: json

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
       "collided_events": 0,
       "invalid_events": 0,
       "excluded_events": 0,
       "excluded_event_types": {},
       "failed_events": 0,
       "errors": null,
       "created_at": "2024-10-24T12:00:00.000Z"
     }
   ]

``collided_events``, ``invalid_events``, ``excluded_events``, ``excluded_event_types``
and ``failed_events`` are absent on history records written before these counters
existed.




.. END IMPORT API

.. START UPLOAD API

Upload API
----------


Upload File
^^^^^^^^^^^


Upload and parse a data file. Accepted extensions: ``csv``, ``txt``, ``dat``,
``json``, ``geojson``, ``xml``, ``qml``, ``quakeml`` (the last three are parsed as
QuakeML). Files too large to parse synchronously on this deployment (default 100MB,
``UPLOAD_MAX_SYNC_PARSE_MB``) should instead use the chunked upload flow
(``POST /api/upload/init`` -> ``POST /api/upload/chunk`` -> ``POST
/api/upload/finalize``), which streams QuakeML and accepts any format up to the 500MB
absolute limit.

**Endpoint**: ``POST /api/upload``

**Request**: ``multipart/form-data``

**Form Data**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 40

   * - Field
     - Type
     - Required
     - Description
   * - ``file``
     - File
     - Yes
     - Data file to upload (max 500MB; max 100MB by default to parse synchronously —
       see above)
   * - ``delimiter``
     - string
     - No
     - CSV/TXT field delimiter: ``comma``, ``tab``, ``semicolon``, ``pipe``, ``space``,
       the literal character, or ``auto`` (default) to detect it
   * - ``dateFormat``
     - string
     - No
     - ``US``, ``International``, ``ISO``, or ``auto`` (default) to detect it


**Response**: ``200 OK``

The response never returns the complete parsed event list. ``eventCount``,
``errorCount`` and the ``validationReport.summary`` totals cover the *whole* file, but
``previewEvents`` is an evenly-spaced **sample** of at most 1,000 events and ~1.5MB
(``previewIndices[i]`` gives sample ``i``'s position in the file), and the ``errors``,
``warnings`` and ``validationReport.failures`` detail lists are each capped (200, 200
and 500 entries) with a matching ``*Truncated`` flag. The full parsed event set is kept
only in the server-side pending-upload store, addressed by ``pendingUploadId`` (used as
a ``pendingUploads[].id`` entry in ``POST /api/catalogues`` — see the Catalogues API).

.. code-block:: json

   {
     "success": true,
     "detectedFields": ["time", "latitude", "longitude", "magnitude", "depth"],
     "fileName": "events.csv",
     "fileSize": 20480,
     "format": "CSV",
     "eventCount": 1,
     "errors": [],
     "errorCount": 0,
     "errorsTruncated": false,
     "warnings": [],
     "warningsTruncated": false,
     "resolvedFieldSources": { "time": "time", "magnitude": "magnitude" },
     "fileDecisions": { "dateFormat": "ISO", "depthUnit": "km" },
     "validationReport": {
       "generatedAt": "2024-10-24T12:00:00.000Z",
       "summary": {
         "totalEvents": 1,
         "validEvents": 1,
         "invalidEvents": 0,
         "failureCount": 0,
         "errorCount": 0,
         "warningCount": 0,
         "infoCount": 0,
         "byCategory": {},
         "byField": {}
       },
       "failures": [],
       "failuresTruncated": false
     },
     "previewEvents": [
       {
         "time": "2024-10-24T12:34:56.789Z",
         "latitude": -41.2865,
         "longitude": 174.7762,
         "magnitude": 5.2,
         "depth": 33.0
       }
     ],
     "previewIndices": [0],
     "previewTruncated": false,
     "pendingUploadId": "6620…pending-upload-id"
   }

``pendingUploadId`` is present only when at least one event was parsed.
``POST /api/upload/finalize`` (the last step of the chunked upload flow) returns this
same bounded response shape.

**Error Responses**:

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Status
     - Meaning
   * - 400
     - No file provided, disallowed extension, disallowed MIME type, or an invalid
       ``delimiter``/``dateFormat`` value
   * - 413
     - File exceeds the 500MB absolute limit, or exceeds the deployment's synchronous
       parse limit (``code: "UPLOAD_PARSE_LIMIT_EXCEEDED"``; use the chunked flow
       instead)
   * - 500
     - Parse error (``code: "UPLOAD_ERROR"``)



.. END UPLOAD API

.. START MERGE API

Merge API
---------


Merge Catalogues
^^^^^^^^^^^^^^^^


Merge multiple catalogues into a new catalogue (or, with ``exportOnly``, produce the
merged event set without writing anything).

**Endpoint**: ``POST /api/merge``

Requires the Editor role or higher.

**Request Body**:

.. code-block:: json

   {
     "name": "Merged Catalogue",
     "sourceCatalogues": [
       {
         "id": "550e8400-e29b-41d4-a716-446655440000",
         "name": "GeoNet 2024",
         "events": 15432,
         "source": "geonet"
       },
       {
         "id": "660e8400-e29b-41d4-a716-446655440001",
         "name": "USGS Southwest Pacific",
         "events": 3241,
         "source": "usgs"
       }
     ],
     "config": {
       "timeThreshold": 60,
       "distanceThreshold": 50,
       "mergeStrategy": "quality",
       "priority": ""
     },
     "exportOnly": false
   }

.. list-table:: ``config`` fields
   :header-rows: 1
   :widths: 20 15 65

   * - Field
     - Type
     - Description
   * - ``timeThreshold``
     - number
     - Match window, seconds. 0-3600 (max 1 hour)
   * - ``distanceThreshold``
     - number
     - Match window, km. 0-1000
   * - ``mergeStrategy``
     - string
     - One of ``quality``, ``priority``, ``newest``, ``complete``, ``average`` (see
       below)
   * - ``priority``
     - string
     - Up to 100 chars. Meaning depends on ``mergeStrategy``/context — see *Merge
       Strategy Options*
   * - ``priorityOrder``
     - array
     - Optional. Up to 50 catalogue IDs (each 1-255 chars), highest priority first.
       Every id must be one of ``sourceCatalogues[].id``, each listed at most once.
       Used only for the "Custom Order" priority (``priority: "custom"``)

``sourceCatalogues`` takes 2-50 entries. ``exportOnly`` (optional, default ``false``):
when ``true``, nothing is written to the database (no catalogue is created, and the
call is not audit-logged as a creation) and the response carries the merged events
directly instead of a ``catalogueId``.

**Merge Strategy Options** (``config.mergeStrategy``):

- ``"quality"``: Select the event with the highest quality score (station count, azimuthal gap, RMS, magnitude uncertainty, magnitude type, review status). Recommended for scientific use.
- ``"priority"``: Keep the event chosen by ``config.priority``: the special values
  ``"quality"`` and ``"authority"`` (network-authority hierarchy) select as their
  same-named strategies would; ``"newest"`` selects by Most Recent Solution (below);
  ``"custom"`` selects by ``config.priorityOrder``; any other value is matched as a
  source/agency name (e.g. ``"geonet"``), falling back to network authority when no
  event matches it.
- ``"average"``: Weighted-average location, magnitude hierarchy selection, lowest-uncertainty depth.
- ``"newest"`` (**Most Recent Solution**): keeps the solution whose reporting agency
  computed it last — QuakeML ``creationInfo.creationTime``, else the latest of a
  stored ``creation_info`` creation/modification timestamp — **not** upload time and
  not origin time (two reports of one earthquake can differ in origin time purely from
  location/velocity-model scatter, which says nothing about which analysis is newer).
  When not every candidate in a group reports a determination time, falls back to
  evaluation status (final/reviewed outrank confirmed/preliminary), then to the same
  quality ranking as the ``"quality"`` strategy. A solution its agency marked
  ``rejected`` never wins while another candidate is available.
- ``"complete"``: Keep the event with the most populated fields.

**Response**: ``200 OK``

.. code-block:: json

   {
     "success": true,
     "catalogueId": "770e8400-e29b-41d4-a716-446655440002",
     "eventCount": 2500,
     "originalEventCount": 27429
   }


.. note::
   ``eventCount`` is the number of unique events in the merged catalogue.
   ``originalEventCount`` is the total events across all source catalogues before deduplication.
   With ``exportOnly: true``, ``catalogueId`` is ``null`` and the response additionally
   carries an ``events`` array (the full merged event records, not persisted). Each
   stored or exported event's ``source_events`` provenance array marks the report the
   merge published with ``"selected": true`` on that entry; an averaged event (the
   ``"average"`` strategy) selects no single report, so none of its entries are marked.

**Error Responses**:

.. list-table::
   :header-rows: 1
   :widths: 15 85

   * - Status
     - Meaning
   * - 400
     - Request failed schema validation (``code: "VALIDATION_ERROR"``, ``details``: an
       array of ``"path: message"`` strings); fewer than 2 source catalogues
       (``INSUFFICIENT_CATALOGUES``); or an empty catalogue name (``MISSING_NAME``)
   * - 409
     - A source catalogue cannot be written to in its current state
   * - 500
     - ``CATALOGUE_NOT_FOUND`` when a source catalogue no longer exists; otherwise
       ``MERGE_FAILED``



Preview Merge
^^^^^^^^^^^^^


Dry-run a merge and return its duplicate/match groups for QC review, without writing
anything. Uses the exact same grouping and selection logic as ``POST /api/merge``, so
the groups, statistics and selected representative match what an actual merge with the
same request would produce.

**Endpoint**: ``POST /api/merge/preview``

Requires the Editor role or higher. Request body: the same schema as ``POST
/api/merge`` (``name`` is required by the shared schema but unused by the preview);
only ``sourceCatalogues`` and ``config`` affect the result.

**Response**: ``200 OK``

.. code-block:: json

   {
     "duplicateGroups": [
       {
         "id": "group-0",
         "events": [
           {
             "id": "event-001",
             "time": "2024-10-24T12:34:56.789Z",
             "latitude": -41.2865,
             "longitude": 174.7762,
             "depth": 33.0,
             "magnitude": 5.2,
             "source": "geonet",
             "catalogueId": "550e8400-e29b-41d4-a716-446655440000",
             "catalogueName": "GeoNet 2024",
             "magnitude_type": "ML",
             "magnitude_uncertainty": 0.2,
             "used_station_count": 15,
             "azimuthal_gap": 120,
             "standard_error": 0.4,
             "depth_uncertainty": 2.0
           }
         ],
         "selectedEventIndex": 0,
         "isSuspicious": false,
         "validationWarnings": []
       }
     ],
     "statistics": {
       "totalEventsBefore": 18673,
       "totalEventsAfter": 17250,
       "duplicateGroupsCount": 1423,
       "duplicatesRemoved": 1423,
       "suspiciousGroupsCount": 12
     },
     "catalogueColors": {
       "550e8400-e29b-41d4-a716-446655440000": "#ef4444",
       "660e8400-e29b-41d4-a716-446655440001": "#3b82f6"
     }
   }

``events`` in each group is every matched report, in match order (not deduplicated).
``selectedEventIndex`` is the index, within that group's ``events``, of the report the
merge would publish — ``-1`` for a group the ``"average"`` strategy would resolve to an
averaged epicentre, since no single report is "selected". ``isSuspicious`` and
``validationWarnings`` flag a group for reviewer attention; the warnings include large
magnitude disagreement or depth range within the group, a cluster that was split
because it failed consistency validation, and **ambiguous association** — a report in
the group was nearly as close, in time and distance, to another event that could not
join it (already in the group from the same catalogue, or too far from the rest); the
closest match was still kept, but a reviewer should confirm it.

**Error Responses**:

- ``400 Bad Request``: Request failed schema validation (including a source catalogue
  listed more than once, or a Custom Order ``priorityOrder`` entry that is unknown or
  repeated), or fewer than 2 source catalogues
- ``500 Internal Server Error``: A source catalogue was not found, or the preview failed


.. END MERGE API

.. START EXPORT API

Export API
----------


Export Catalogue
^^^^^^^^^^^^^^^^


Export a catalogue in various formats. Every export records the catalogue's id and
version, an export timestamp, and a checksum over the exported rows, so a downloaded
file can always be tied back to the exact data and filter that produced it (see
*Export Provenance* below).

**Endpoint**: ``GET /api/catalogues/{id}/export``

Requires the Viewer role or higher.

**Path Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Parameter
     - Type
     - Required
     - Description
   * - ``id``
     - string
     - Yes
     - Catalogue UUID


**Query Parameters**:

.. list-table::
   :header-rows: 1
   :widths: 20 15 12 53

   * - Parameter
     - Type
     - Required
     - Description
   * - ``format``
     - string
     - No
     - ``csv`` (default), ``json``, ``geojson``, ``kml``, or ``quakeml``
   * - ``metadata``
     - string
     - No
     - ``comments`` (or ``true``/``1``) opts the CSV format into a ``#``-prefixed
       metadata prologue. Default is a plain RFC 4180 file (no prologue), since a
       prologue makes line 1 not the header record for pandas/R/ZMAP-style CSV
       readers. Ignored for other formats, which always embed metadata
   * - ``decluster``
     - string
     - No
     - ``none`` (default) or ``gardner-knopoff``: adds ``ClusterID``/``IsMainshock``
       fields to CSV/GeoJSON output, tagging each event with its Gardner-Knopoff
       (1974) cluster
   * - *(event filters)*
     - —
     - No
     - Any of the filter parameters of *Get Filtered Events* above
       (``minMagnitude``, ``startTime``, bounding box, ``minQuality``, ...); when any
       are present, the export holds only matching events. Invalid filter values
       return ``400`` exactly as they do for *Get Filtered Events*


**Response**: File download with appropriate Content-Type. An empty catalogue (or an
empty filtered selection) exports an empty file, not a ``404``.

**Formats**:

- **CSV**: ``text/csv``
- **JSON**: ``application/json``
- **GeoJSON**: ``application/geo+json``
- **KML**: ``application/vnd.google-earth.kml+xml``
- **QuakeML**: ``application/xml``

**Response Headers**:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Header
     - Description
   * - ``X-Catalogue-ID``
     - The exported catalogue's id
   * - ``X-Catalogue-Version``
     - The catalogue's ``version`` (``MAJOR.MINOR.PATCH``) at export time
   * - ``X-Export-Timestamp``
     - Export generation time, ISO 8601 UTC
   * - ``X-Export-Event-Count``
     - Number of events in this export
   * - ``X-Export-Rows-SHA256``
     - SHA-256 checksum (hex) over the canonical exported rows — the plain CSV body of
       the selection, computed identically regardless of the requested ``format``, so
       two exports of the same selection in different formats carry the same checksum
   * - ``X-Export-Filter``
     - The event filter applied, as a query string (``none`` when unfiltered)
   * - ``X-Export-Declustering``
     - ``none`` or ``gardner-knopoff``
   * - ``Link``
     - ``rel="describedby"`` pointing at ``GET /api/catalogues/{id}`` (the full
       catalogue metadata, which a plain CSV has no room for)

**Export Provenance**

Every export carries the catalogue id and version, ``version_updated_at``, the export
timestamp (UTC), the ``X-Export-Rows-SHA256`` checksum, the filter applied (if any) and
the declustering applied (algorithm, parameters and counts, or ``"none"``) — both in
the response headers above and, for JSON/GeoJSON/QuakeML, embedded in the file's own
metadata block; every CSV row also carries its ``CatalogueVersion``. The downloaded
filename includes the catalogue version and, when a filter was applied, a
``_filtered`` suffix. There is no snapshot store: retrieving a *past* catalogue version
is not possible — only the current data can be exported, tagged with whatever version
it currently carries.

**Error Responses**:

- ``400 Bad Request``: Invalid ``format``, invalid ``decluster``, or an invalid filter parameter
- ``404 Not Found``: Catalogue does not exist
- ``409 Conflict``: The catalogue is being imported (``processing``) or deleted, or it
  changed while the export was being read; retry once it is stable, so that every export
  holds exactly one catalogue version
- ``500 Internal Server Error``: Export failed

QuakeML exports normalise stored values the schema cannot represent (enumerations are
matched case-insensitively, over-length strings are shortened, impossible dates are
dropped); anything dropped or shortened is recorded in a comment on the owning object.



.. END EXPORT API

.. START SAVED FILTERS API

Saved Filters API
------------------


Save and reuse event-filter configurations (the parameter sets of *Get Filtered
Events* / *Export Catalogue* above) under a name, per user. Saved filters are
**personal**: every operation reads or writes only the authenticated caller's own
filters (an administrator may address any filter by id, including ones saved before
ownership was recorded) — they are never shared between users. All endpoints require
the Viewer role or higher (authentication is required to create, list or use one).

Limits: filter ``name`` <= 100 characters, ``description`` <= 500 characters, the
``filterConfig`` JSON object <= 10,000 characters serialised and nested at most 5
levels deep, and at most 200 saved filters per user.


List Saved Filters
^^^^^^^^^^^^^^^^^^^


**Endpoint**: ``GET /api/saved-filters``

**Response**: ``200 OK`` — the caller's own saved filters (empty array if none):

.. code-block:: json

   [
     {
       "id": "880e8400-e29b-41d4-a716-446655440003",
       "name": "Wellington M4+",
       "description": "Wellington region, magnitude 4 and above",
       "filter_config": "{\"minMagnitude\":4,\"region\":\"Wellington\"}",
       "owner_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
       "created_at": "2024-10-24T12:00:00.000Z",
       "updated_at": "2024-10-24T12:00:00.000Z"
     }
   ]

``filter_config`` is the stored JSON string as-is; unlike the single-filter and write
endpoints below, the list does not also parse it into a ``filterConfig`` object.

**Error Responses**:
- ``500 Internal Server Error``: Database error


Create Saved Filter
^^^^^^^^^^^^^^^^^^^^


**Endpoint**: ``POST /api/saved-filters``

**Request Body**:

.. code-block:: json

   {
     "name": "Wellington M4+",
     "description": "Wellington region, magnitude 4 and above",
     "filterConfig": { "minMagnitude": 4, "region": "Wellington" }
   }

``name`` is required (non-empty, <= 100 chars). ``description`` is optional (<= 500
chars). ``filterConfig`` is required and must be a JSON object of any shape, within
the size/depth limits above.

**Response**: ``201 Created``

.. code-block:: json

   {
     "id": "880e8400-e29b-41d4-a716-446655440003",
     "name": "Wellington M4+",
     "description": "Wellington region, magnitude 4 and above",
     "filterConfig": { "minMagnitude": 4, "region": "Wellington" }
   }

**Error Responses**:
- ``400 Bad Request``: Missing/invalid ``name`` or ``filterConfig``, or a limit above is exceeded
- ``409 Conflict``: The user already has 200 saved filters


Get Saved Filter
^^^^^^^^^^^^^^^^^


**Endpoint**: ``GET /api/saved-filters/{id}``

**Response**: ``200 OK`` — the stored row plus the parsed ``filterConfig``:

.. code-block:: json

   {
     "id": "880e8400-e29b-41d4-a716-446655440003",
     "name": "Wellington M4+",
     "description": "Wellington region, magnitude 4 and above",
     "filter_config": "{\"minMagnitude\":4,\"region\":\"Wellington\"}",
     "owner_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
     "created_at": "2024-10-24T12:00:00.000Z",
     "updated_at": "2024-10-24T12:00:00.000Z",
     "filterConfig": { "minMagnitude": 4, "region": "Wellington" }
   }

**Error Responses**:
- ``404 Not Found``: No such filter, or it belongs to another user


Update Saved Filter
^^^^^^^^^^^^^^^^^^^^


**Endpoint**: ``PUT /api/saved-filters/{id}``

**Request Body**: same shape and validation as *Create Saved Filter*.

**Response**: ``200 OK`` — same shape as the create response.

**Error Responses**:
- ``400 Bad Request``: Same validation as *Create Saved Filter*
- ``404 Not Found``: No such filter, or it belongs to another user


Delete Saved Filter
^^^^^^^^^^^^^^^^^^^^


**Endpoint**: ``DELETE /api/saved-filters/{id}``

**Response**: ``200 OK``

.. code-block:: json

   {
     "success": true
   }

**Error Responses**:
- ``404 Not Found``: No such filter, or it belongs to another user


.. END SAVED FILTERS API

.. START HEALTH CHECK API

Health Check API
----------------


Readiness Check
^^^^^^^^^^^^^^^


Check if the application is ready to serve requests.

**Endpoint**: ``GET /api/ready``

**Response**: ``200 OK``

.. code-block:: json

   {
     "status": "ready",
     "timestamp": "2024-10-24T12:00:00.000Z",
     "checks": [
       {
         "name": "database",
         "status": "healthy",
         "responseTime": 5
       },
       {
         "name": "geonet_api",
         "status": "healthy",
         "message": "Circuit breaker is CLOSED"
       },
       {
         "name": "memory",
         "status": "healthy",
         "message": "Heap: 120MB / 512MB (23%)"
       }
     ],
     "responseTime": "12ms"
   }


**Error Response**: ``503 Service Unavailable``

.. code-block:: json

   {
     "status": "not_ready",
     "timestamp": "2024-10-24T12:00:00.000Z",
     "checks": [
       {
         "name": "database",
         "status": "unhealthy",
         "message": "Database connection failed"
       }
     ],
     "responseTime": "5ms"
   }




.. END HEALTH CHECK API

.. START ERROR RESPONSES

Error Responses
---------------


All API endpoints follow a consistent error response format.

Error Response Format
^^^^^^^^^^^^^^^^^^^^^


.. code-block:: json

   {
     "error": "Error message",
     "details": "Additional error details (optional)",
     "code": "ERROR_CODE"
   }


HTTP Status Codes
^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Code
     - Description
   * - 200
     - Success
   * - 201
     - Created
   * - 400
     - Bad Request - Invalid input
   * - 403
     - Forbidden - Access denied
   * - 404
     - Not Found - Resource doesn't exist
   * - 409
     - Conflict - Request conflicts with the current state (e.g. a pending upload
       changed, or a per-user limit was reached)
   * - 413
     - Payload Too Large - Request body or file exceeds a size limit
   * - 429
     - Too Many Requests - Rate limit exceeded
   * - 500
     - Internal Server Error
   * - 502
     - Bad Gateway - An upstream service (e.g. GeoNet) returned an error
   * - 503
     - Service Unavailable
   * - 504
     - Gateway Timeout - An upstream service (e.g. GeoNet) timed out


Common Error Codes
^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Code
     - Description
   * - ``VALIDATION_ERROR``
     - Request validation failed
   * - ``NOT_FOUND``
     - Resource not found
   * - ``DATABASE_ERROR``
     - Database operation failed
   * - ``PARSE_ERROR``
     - File parsing failed
   * - ``FILE_UPLOAD_ERROR``
     - Uploaded file rejected (bad type, size, or content)
   * - ``MERGE_FAILED``
     - Catalogue merge failed

Some endpoints report failures with their own error shape rather than one of the codes
above — notably rate-limit (``429``) responses, which carry ``retryAfter`` and no
``code`` field, and GeoNet import failures, which carry ``errorType`` instead of
``code`` (see *Rate Limiting* and the *Import API* section above).


*Last Updated: September 2026*

.. END ERROR RESPONSES
