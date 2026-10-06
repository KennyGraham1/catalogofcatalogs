Authentication and Authorization System
=======================================


This document describes the authentication and role-based access control (RBAC) system implemented in the Earthquake Catalogue Platform.

Overview
--------


The platform uses **NextAuth.js v4** with a custom credentials provider, JWT sessions, and MongoDB-backed user records. The system implements role-based access control with four distinct user roles.

User Roles
----------


1. Admin
^^^^^^^^

- **Full system access**
- User management (create, update, delete users, manage roles)
- System settings and configuration
- All catalogue operations (create, read, update, delete, export)
- Import and merge operations

2. Editor
^^^^^^^^^

- Create, upload, import, and merge catalogues
- Update and delete catalogues
- Export catalogues
- **Cannot** manage users or system settings

3. Viewer
^^^^^^^^^

- Read-only access to all catalogues
- Export catalogues
- **Cannot** create, modify, or delete catalogues

4. Guest
^^^^^^^^

- Limited read-only access to public/demo catalogues only
- **Cannot** export or modify data

Signed-Out Visitors
^^^^^^^^^^^^^^^^^^^

Without signing in, anyone can browse the catalogue list and catalogue details and
view the maps (the catalogue map page and the dashboard map), which load the public
``view=map`` event pages. Analytics, the event table, full event records and exports
need a signed-in account with the Viewer role or higher.

Setup and Installation
----------------------


1. Environment Variables
^^^^^^^^^^^^^^^^^^^^^^^^


Add the following to your ``.env`` file:

.. code-block:: bash

   # NextAuth Configuration
   NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
   NEXTAUTH_URL=http://localhost:3000
   
   # MongoDB Connection
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DATABASE=earthquake_catalogue
   
   # Optional: Create default admin user during migration
   CREATE_ADMIN_USER=true
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=<generate-strong-temporary-password>
   ADMIN_NAME=System Administrator

``ADMIN_PASSWORD`` is required and must be at least 12 characters when ``CREATE_ADMIN_USER=true``.


2. Run Database Migration
^^^^^^^^^^^^^^^^^^^^^^^^^


Execute the authentication schema migration to set up the database:

.. code-block:: bash

   npm run migrate:auth


This will:
- Create the ``user_roles`` collection with role definitions
- Add indexes to the ``users`` collection for authentication fields
- Optionally create a default admin user (if ``CREATE_ADMIN_USER=true``)

3. Change Default Admin Password
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**IMPORTANT**: If you created a temporary admin user, change the password immediately after first login.

Current Auth Workflows
----------------------


The current codebase includes these authentication workflows:

- Registration at ``/register`` creates active users with the ``viewer`` role.
- Login uses NextAuth credentials at ``/login``.
- Authenticated users can change their password at ``/change-password``.
- Password resets use ``/forgot-password`` and ``/reset-password``. Reset tokens expire after 1 hour and are stored hashed in ``password_reset_tokens``.
- Users can request promotion to ``editor`` or ``admin`` from ``/profile``.
- Admins review role requests at ``/admin/role-requests`` and manage users at ``/admin/users``.

Password reset and role-request email notifications use ``EMAIL_WEBHOOK_URL`` when configured. If no webhook is configured, email delivery is logged rather than sent.

API Protection
--------------


Protected Endpoints
^^^^^^^^^^^^^^^^^^^


The following API endpoints are protected with role-based access control:

Editor+ Required (Editor or Admin)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- ``POST /api/catalogues`` - Create catalogue
- ``PATCH /api/catalogues/[id]`` - Update catalogue
- ``DELETE /api/catalogues/[id]`` - Delete catalogue
- ``POST /api/import/geonet`` - Import from GeoNet
- ``POST /api/merge`` - Merge catalogues
- ``POST /api/upload`` - Upload catalogue files

Viewer+ Required (Viewer, Editor, or Admin)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- ``GET /api/catalogues/[id]/export`` - Export catalogue
- ``GET /api/catalogues/[id]/events`` - Event pages: full records, or ``view=summary``
  (the event table, analytics and signed-in maps)
- ``GET /api/catalogues/[id]/events/[eventId]`` - One full event record
- ``GET /api/catalogues/[id]/events/filtered`` - Filtered events

Admin Only
~~~~~~~~~~

- ``GET /api/users`` - List all users
- ``GET /api/users/[id]`` - Get user details
- ``PATCH /api/users/[id]`` - Update user (role, status, etc.)
- ``DELETE /api/users/[id]`` - Delete user
- ``GET /api/role-requests`` - List role requests
- ``PATCH /api/role-requests/[id]`` - Approve or reject role requests

Public Endpoints
^^^^^^^^^^^^^^^^

- ``GET /api/catalogues`` - List catalogues
- ``GET /api/catalogues/[id]`` - Get catalogue details
- ``GET /api/catalogues/[id]/events?view=map`` - Event pages for the maps: only the
  fields the maps show, for catalogues the list shows. Signed-out requests are limited
  to 300 per 5 minutes per client address (an IPv6 /64 counts as one), answered with
  ``429 Too Many Requests`` and ``Retry-After`` past that; signed-in viewers are not limited.
- ``POST /api/auth/register`` - User registration
- ``POST /api/auth/forgot-password`` - Request password reset
- ``POST /api/auth/reset-password`` - Complete password reset
- ``POST /api/auth/[...nextauth]`` - NextAuth endpoints

Role Request and Account Safeguards
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Approving or rejecting a role request that is no longer pending (already
  actioned) returns ``409 Conflict`` rather than succeeding silently.
- If an admin changes a user's role directly via ``PATCH /api/users/[id]``
  (outside the role-request approval flow), that user's pending role
  requests are automatically closed/superseded.
- An admin who tries to demote or deactivate **their own** account via
  ``PATCH /api/users/[id]`` gets ``400 Bad Request``.
- An action that would remove or deactivate the **last remaining active
  admin** account gets ``409 Conflict``.

Frontend Usage
--------------


Authentication Hooks
^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { useAuth, usePermission, useIsAdmin } from '@/lib/auth/hooks';
   import { Permission } from '@/lib/auth/types';
   
   function MyComponent() {
     const { user, isAuthenticated, isLoading } = useAuth();
     const canCreate = usePermission(Permission.CATALOGUE_CREATE);
     const isAdmin = useIsAdmin();
     
     if (isLoading) return <div>Loading...</div>;
     if (!isAuthenticated) return <div>Please log in</div>;
     
     return (
       <div>
         <p>Welcome, {user.name}!</p>
         {canCreate && <button>Create Catalogue</button>}
         {isAdmin && <button>Manage Users</button>}
       </div>
     );
   }


Permission Gate Component
^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { PermissionGate } from '@/components/auth/PermissionGate';
   import { Permission, UserRole } from '@/lib/auth/types';
   
   function MyPage() {
     return (
       <div>
         <PermissionGate permission={Permission.CATALOGUE_CREATE}>
           <button>Create Catalogue</button>
         </PermissionGate>
         
         <PermissionGate role={UserRole.ADMIN}>
           <AdminPanel />
         </PermissionGate>
         
         <PermissionGate 
           anyRole={[UserRole.EDITOR, UserRole.ADMIN]}
           fallback={<p>You need editor access</p>}
         >
           <EditorTools />
         </PermissionGate>
       </div>
     );
   }


Protected Routes
^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
   import { UserRole } from '@/lib/auth/types';
   
   export default function AdminPage() {
     return (
       <ProtectedRoute role={UserRole.ADMIN}>
         <AdminDashboard />
       </ProtectedRoute>
     );
   }


Backend Usage
-------------


API Route Protection
^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { NextRequest, NextResponse } from 'next/server';
   import { requireEditor, requireAdmin } from '@/lib/auth/middleware';
   
   export async function POST(request: NextRequest) {
     // Require Editor role or higher
     const authResult = await requireEditor(request);
     if (authResult instanceof NextResponse) {
       return authResult; // Returns 401 or 403 error
     }
     
     const { user } = authResult;
     
     // Your protected logic here
     return NextResponse.json({ success: true });
   }


Available Middleware Functions
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


- ``requireAuth(request)`` - Require any authenticated user
- ``requirePermission(request, permission)`` - Require specific permission
- ``requireRole(request, role)`` - Require specific role
- ``requireAdmin(request)`` - Require Admin role
- ``requireEditor(request)`` - Require Editor or Admin role
- ``requireViewer(request)`` - Require Viewer, Editor, or Admin role
- ``optionalAuth(request)`` - Get session if available, don't error if not

User Management
---------------


Admin User Management Page
^^^^^^^^^^^^^^^^^^^^^^^^^^


Admins can manage users at ``/admin/users``:
- View all users
- Change user roles
- Activate/deactivate users
- Delete users

Programmatic User Management
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: typescript

   import { createUser, getUserByEmail, updateLastLogin } from '@/lib/auth/utils';
   import { UserRole } from '@/lib/auth/types';
   
   // Create a new user
   const user = await createUser(
     'user@example.com',
     'password123',
     'John Doe',
     UserRole.VIEWER
   );
   
   // Get user by email
   const existingUser = await getUserByEmail('user@example.com');
   
   // Update last login
   await updateLastLogin(user.id);


Security Best Practices
-----------------------


1. **Always use HTTPS in production** - Set ``NEXTAUTH_URL`` to your HTTPS domain
2. **Use a strong secret** - Generate ``NEXTAUTH_SECRET`` with ``openssl rand -base64 32``
3. **Change default passwords** - Never use default admin credentials in production
4. **Implement rate limiting** - Already configured for API routes, including
   dedicated credential-login throttling: 10 failed attempts per
   account+client and 50 per client within a 15-minute window, clients keyed
   by address (an IPv6 /64 counts as one client). Separately, an account
   that has had 100 *consecutive* failed attempts from browsers with no
   known-device cookie for it is refused outright ("AccountProtected") until
   one succeeds or 24 hours pass with no further failure. A browser that has
   signed in to the account before (or completed a password reset for it)
   carries a known-device cookie (httpOnly, 90 days, HMAC-signed with
   ``NEXTAUTH_SECRET``) and is limited to 10 failed attempts per 15 minutes
   on its own, exempt from the other limits, so failures elsewhere can never
   lock the owner out of their own browsers. Password-reset requests are
   capped at 3 emails per account per hour, and only the 3 most recently
   issued reset links stay valid.
5. **Regular security audits** - Review user permissions and access logs
6. **Password requirements** - Minimum 8 characters (enforced in registration)

Troubleshooting
---------------


"Authentication required" error
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Ensure you're logged in
- Check that your session hasn't expired (30 days by default)
- Verify ``NEXTAUTH_SECRET`` and ``NEXTAUTH_URL`` are set correctly

"Insufficient permissions" error
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check your user role in the profile page (``/profile``)
- Contact an admin to upgrade your role if needed

Migration fails
^^^^^^^^^^^^^^^

- Ensure MongoDB is running and accessible
- Check ``MONGODB_URI`` environment variable
- Verify database permissions

API Reference
-------------


See the ``API Documentation <./API.md>``_ for detailed endpoint specifications.
