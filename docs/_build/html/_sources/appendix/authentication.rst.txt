Authentication and Authorization System
=======================================


This document describes the authentication and role-based access control (RBAC) system implemented in the Earthquake Catalogue Platform.

Overview
--------


The platform uses **NextAuth.js v4** for authentication with a custom credentials provider and MongoDB for session storage. The system implements role-based access control with four distinct user roles.

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

Setup and Installation
----------------------


1. Environment Variables
^^^^^^^^^^^^^^^^^^^^^^^^


Add the following to your ``.env`` file:

.. code-block:: bash

   # NextAuth Configuration
   NEXTAUTH_SECRET=your-secret-key-here  # Generate with: openssl rand -base64 32
   NEXTAUTH_URL=http://localhost:3000
   
   # MongoDB Connection
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DATABASE=earthquake_catalogue
   
   # Optional: Create default admin user during migration
   CREATE_ADMIN_USER=true
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=changeme123
   ADMIN_NAME=System Administrator


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


**IMPORTANT**: If you created a default admin user, change the password immediately after first login!

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

Viewer+ Required (Viewer, Editor, or Admin)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

- ``GET /api/catalogues/[id]/export`` - Export catalogue

Admin Only
~~~~~~~~~~

- ``GET /api/users`` - List all users
- ``GET /api/users/[id]`` - Get user details
- ``PATCH /api/users/[id]`` - Update user (role, status, etc.)
- ``DELETE /api/users/[id]`` - Delete user

Public Endpoints
^^^^^^^^^^^^^^^^

- ``GET /api/catalogues`` - List catalogues
- ``GET /api/catalogues/[id]`` - Get catalogue details
- ``POST /api/auth/register`` - User registration
- ``POST /api/auth/[...nextauth]`` - NextAuth endpoints

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
4. **Implement rate limiting** - Already configured for API routes
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
