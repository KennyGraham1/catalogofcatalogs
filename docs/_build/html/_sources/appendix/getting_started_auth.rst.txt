Getting Started with Authentication
===================================


This guide will help you set up and test the authentication system.

Quick Start
-----------


1. Set Environment Variables
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Create or update your ``.env`` file:

.. code-block:: bash

   # NextAuth Configuration
   NEXTAUTH_SECRET=your-secret-key-here
   NEXTAUTH_URL=http://localhost:3000
   
   # MongoDB Connection
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DATABASE=earthquake_catalogue
   
   # Create default admin user
   CREATE_ADMIN_USER=true
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=admin123
   ADMIN_NAME=System Administrator


**Generate a secure secret:**
.. code-block:: bash

   openssl rand -base64 32


2. Run the Migration
^^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   npm run migrate:auth


This will:
- Create the ``user_roles`` collection
- Set up authentication indexes
- Create a default admin user (if configured)

3. Start the Development Server
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   npm run dev


4. Test the Authentication
^^^^^^^^^^^^^^^^^^^^^^^^^^


1. **Register a new user:**
   - Navigate to http://localhost:3000/register
   - Fill in the registration form
   - New users are created with "Viewer" role by default

2. **Login with admin:**
   - Navigate to http://localhost:3000/login
   - Use the admin credentials from your ``.env`` file
   - Default: ``admin@example.com`` / ``admin123``

3. **View your profile:**
   - Navigate to http://localhost:3000/profile
   - See your user information and permissions

4. **Manage users (Admin only):**
   - Navigate to http://localhost:3000/admin/users
   - View all users
   - Change user roles
   - Activate/deactivate users

Testing API Protection
----------------------


Test with curl
^^^^^^^^^^^^^^


.. code-block:: bash

   # Try to create a catalogue without authentication (should fail with 401)
   curl -X POST http://localhost:3000/api/catalogues \
     -H "Content-Type: application/json" \
     -d '{"name": "Test Catalogue", "events": []}'
   
   # Login first to get a session cookie, then try again
   # (You'll need to use a tool like Postman or write a script to handle cookies)


Test with Frontend
^^^^^^^^^^^^^^^^^^


1. **As Guest/Viewer:**
   - Try to access ``/admin/users`` → Should redirect to home
   - Try to create a catalogue → Button should not appear
   - Can view and export catalogues

2. **As Editor:**
   - Can create, edit, and delete catalogues
   - Can import and merge data
   - Cannot access ``/admin/users``

3. **As Admin:**
   - Full access to everything
   - Can manage users at ``/admin/users``
   - Can change user roles

User Roles Summary
------------------


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20 20 20

   * - Role
     - View
     - Export
     - Create/Edit
     - Import/Merge
     - User Management
   * - Guest
     - ✓*
     - ✗
     - ✗
     - ✗
     - ✗
   * - Viewer
     - ✓
     - ✓
     - ✗
     - ✗
     - ✗
   * - Editor
     - ✓
     - ✓
     - ✓
     - ✓
     - ✗
   * - Admin
     - ✓
     - ✓
     - ✓
     - ✓
     - ✓


*Guest can only view public/demo catalogues

Common Tasks
------------


Change User Role
^^^^^^^^^^^^^^^^


1. Login as admin
2. Go to ``/admin/users``
3. Find the user
4. Select new role from dropdown
5. Changes apply immediately

Create Additional Admin Users
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. Register a new user normally
2. Login as existing admin
3. Go to ``/admin/users``
4. Change the new user's role to "Admin"

Reset Password (Manual)
^^^^^^^^^^^^^^^^^^^^^^^


Currently, password reset must be done manually in the database:

.. code-block:: javascript

   // In MongoDB shell or script
   const bcrypt = require('bcryptjs');
   const newPasswordHash = await bcrypt.hash('newpassword123', 10);
   
   db.users.updateOne(
     { email: 'user@example.com' },
     { $set: { password_hash: newPasswordHash } }
   );


Next Steps
----------


- Read the full ``Authentication Documentation <./AUTHENTICATION.md>``_
- Implement password reset functionality (future enhancement)
- Add email verification (future enhancement)
- Set up audit logging for security events
- Configure production environment variables

Troubleshooting
---------------


"Database not initialized" error
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Make sure MongoDB is running
- Check ``MONGODB_URI`` in ``.env``
- Run ``npm run migrate:auth``

Can't login
^^^^^^^^^^^

- Verify credentials are correct
- Check browser console for errors
- Ensure ``NEXTAUTH_SECRET`` is set
- Clear browser cookies and try again

"Insufficient permissions" error
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Check your role in ``/profile``
- Ask an admin to upgrade your role
- Ensure you're logged in

Migration fails
^^^^^^^^^^^^^^^

- Ensure MongoDB is accessible
- Check database permissions
- Verify environment variables are set

Security Checklist
------------------


- [ ] Changed default admin password
- [ ] Generated secure ``NEXTAUTH_SECRET``
- [ ] Set ``NEXTAUTH_URL`` to production domain (for production)
- [ ] Enabled HTTPS (for production)
- [ ] Reviewed user roles and permissions
- [ ] Set up regular database backups
- [ ] Configured rate limiting (already done)
- [ ] Reviewed audit logs regularly

Support
-------


For more information, see:
- ``Authentication Documentation <./AUTHENTICATION.md>``_
- ``API Documentation <./API.md>``_
- NextAuth.js documentation: https://next-auth.js.org/
