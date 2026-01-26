Registration Issue - FIXED ✅
============================


Problem
-------

The registration functionality was not working because required environment variables were missing.

Root Cause
----------

The ``.env`` file was missing:
- ``NEXTAUTH_SECRET`` - Required by NextAuth.js for JWT token signing
- ``NEXTAUTH_URL`` - Required by NextAuth.js to know the application URL

Solution Applied
----------------


1. Added Missing Environment Variables
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   NEXTAUTH_SECRET=wjXOpIaB30iGP3QokGdOmrzDJa1eEiLdU52TyUGZYfU=
   NEXTAUTH_URL=http://localhost:3000


2. Ran Database Migration
^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   npm run migrate:auth


This created:
- ``user_roles`` collection with 4 roles (Admin, Editor, Viewer, Guest)
- Indexes on the ``users`` collection for authentication
- Default role permissions

3. Verified API is Working
^^^^^^^^^^^^^^^^^^^^^^^^^^

Tested with curl:
.. code-block:: bash

   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Test User","email":"test@example.com","password":"password123"}'


**Result:** ✅ SUCCESS - User created with ID ``user_1768898126360_wfwh3u03n``

How to Use Registration Now
---------------------------


Option 1: Use the Web Interface
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

1. Navigate to: ``http://localhost:3000/register``
2. Fill in the form:
   - Name: Your full name
   - Email: Your email address
   - Password: At least 8 characters
   - Confirm Password: Same as password
3. Click "Create account"
4. You'll be redirected to the login page

Option 2: Use the Test Page
^^^^^^^^^^^^^^^^^^^^^^^^^^^

1. Navigate to: ``http://localhost:3000/test-registration.html``
2. This standalone page shows detailed debugging information
3. Fill in the form and submit
4. See the API response in real-time

Option 3: Use the API Directly
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Your Name",
       "email": "your@email.com",
       "password": "yourpassword"
     }'


What Was Created
----------------


Test User
^^^^^^^^^

- **Email:** test@example.com
- **Password:** password123
- **Role:** Viewer (default for new users)
- **Status:** Active

You can now login with these credentials at ``/login``

Next Steps
----------


1. **Try registering a new user** at ``/register``
2. **Login** at ``/login`` with your credentials
3. **View your profile** at ``/profile``
4. **Create an admin user** (optional):
   ```bash
   # Register a user first, then manually update in MongoDB:
   mongosh eq-catalogue
   db.users.updateOne(
     { email: "your@email.com" },
     { $set: { role: "admin" } }
   )
   ```

Troubleshooting
---------------


If registration still doesn't work:

1. **Check browser console** (F12) for errors
2. **Check Network tab** for the API request/response
3. **Verify server is running** on port 3000
4. **Check environment variables** are loaded:
   ```bash
   cat .env | grep NEXTAUTH
   ```

Files Modified
--------------


- ``.env`` - Added NEXTAUTH_SECRET and NEXTAUTH_URL
- Database - Created ``user_roles`` collection and indexes

Testing Checklist
-----------------


- [x] Environment variables set
- [x] Database migration completed
- [x] API endpoint responding (201 status)
- [x] User created in database
- [x] Password hashed correctly
- [ ] Test web registration form
- [ ] Test login with created user
- [ ] Test profile page access

Support
-------


For more help, see:
- ``docs/REGISTRATION_DEBUG_GUIDE.md`` - Quick debugging steps
- ``docs/TROUBLESHOOTING_REGISTRATION.md`` - Detailed troubleshooting
- ``docs/DEBUG_TOOLS.md`` - Browser debugging tools
- ``docs/AUTHENTICATION.md`` - Complete authentication documentation
