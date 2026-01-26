===============
API Development
===============

This guide outlines patterns for adding or extending API routes in the platform.
For endpoint contracts, see :doc:`../api-reference/index`.

Route Structure
---------------

API routes live under ``app/api`` in the Next.js App Router structure. Each route
should expose the appropriate HTTP methods (`GET`, `POST`, `PATCH`, `DELETE`) and
use shared utilities for auth, errors, and rate limiting.

Recommended Conventions
------------------------

- Use ``lib/auth/middleware.ts`` for role/permission checks.
- Use ``lib/errors.ts`` for consistent error responses.
- Use ``lib/db.ts`` for database queries.
- Use cache helpers in ``lib/cache.ts`` when applicable.

Example Skeleton
----------------

.. code-block:: typescript

   import { NextRequest, NextResponse } from 'next/server';
   import { dbQueries } from '@/lib/db';
   import { requireEditor } from '@/lib/auth/middleware';
   import { formatErrorResponse } from '@/lib/errors';

   export async function POST(request: NextRequest) {
     try {
       const authResult = await requireEditor(request);
       if (authResult instanceof NextResponse) {
         return authResult;
       }

       if (!dbQueries) {
         return NextResponse.json({ error: 'Database not available' }, { status: 500 });
       }

       const body = await request.json();
       // Validate and use dbQueries...

       return NextResponse.json({ success: true }, { status: 201 });
     } catch (error) {
       const errorResponse = formatErrorResponse(error);
       return NextResponse.json(
         { error: errorResponse.error, code: errorResponse.code },
         { status: errorResponse.statusCode }
       );
     }
   }

Testing and Documentation
-------------------------

- Add tests under ``__tests__/`` (unit and integration).
- Update the API Reference section if you add or change endpoints.
- Document new request/response fields with examples.
