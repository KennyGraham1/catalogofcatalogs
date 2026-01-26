===============
Getting Started
===============

This guide will help you install, configure, and run the Earthquake Catalogue
Platform for the first time. By the end, you'll have a fully functional
application ready to manage your earthquake catalogues.

.. _getting-started-prerequisites:

-------------
Prerequisites
-------------

Software Requirements
=====================

Before you begin, ensure you have the following software installed:

.. list-table::
   :header-rows: 1
   :widths: 20 20 60

   * - Software
     - Version
     - Notes
   * - Node.js
     - 18.x or higher
     - LTS version recommended. Check with ``node --version``
   * - npm
     - 9.x or higher
     - Included with Node.js. Check with ``npm --version``
   * - MongoDB
     - 6.x or 7.x
     - Local installation or MongoDB Atlas cloud service
   * - Git
     - Any recent version
     - For cloning the repository

Hardware Requirements
=====================

**Minimum:**

* 2 CPU cores
* 4 GB RAM
* 10 GB disk space

**Recommended (for large catalogues):**

* 4+ CPU cores
* 8+ GB RAM
* 50+ GB SSD storage

Supported Operating Systems
===========================

* Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+)
* macOS 12 (Monterey) or later
* Windows 10/11 with WSL2 (Windows Subsystem for Linux)

------------
Installation
------------

Step 1: Clone the Repository
============================

Open a terminal and clone the project:

.. code-block:: bash

   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs

Step 2: Install Dependencies
============================

Install all required Node.js packages:

.. code-block:: bash

   npm install

This installs:

* **Next.js 13+** - React framework with App Router
* **React 18** - UI library
* **MongoDB driver** - Database connectivity
* **NextAuth.js** - Authentication
* **Leaflet** - Interactive maps
* **Recharts** - Data visualization
* And 50+ other dependencies

.. note::
   Installation typically takes 1-3 minutes depending on your internet connection.

Step 3: Configure Environment Variables
=======================================

Create your environment configuration file:

.. code-block:: bash

   cp .env.example .env

Edit ``.env`` with your preferred text editor:

.. code-block:: bash

   # ==============================================
   # DATABASE CONFIGURATION
   # ==============================================

   # For local MongoDB:
   MONGODB_URI=mongodb://localhost:27017/earthquake_catalogue

   # For MongoDB Atlas (cloud):
   # MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/earthquake_catalogue

   # Database name (optional - defaults to earthquake_catalogue)
   MONGODB_DATABASE=earthquake_catalogue

   # ==============================================
   # APPLICATION CONFIGURATION
   # ==============================================

   # Environment mode
   NODE_ENV=development

   # Server port (optional - defaults to 3000)
   PORT=3000

   # ==============================================
   # AUTHENTICATION (Required)
   # ==============================================

   # Generate with: openssl rand -base64 32
   NEXTAUTH_SECRET=your-secure-random-secret-here

   # Application URL
   NEXTAUTH_URL=http://localhost:3000

.. tip::
   **Generate a secure secret:**

   .. code-block:: bash

      openssl rand -base64 32

   Copy the output and paste it as your ``NEXTAUTH_SECRET``.

Step 4: Set Up MongoDB
======================

Choose one of the following options:

Option A: Local MongoDB
-----------------------

**Linux (Ubuntu/Debian):**

.. code-block:: bash

   # Start MongoDB service
   sudo systemctl start mongod

   # Enable auto-start on boot
   sudo systemctl enable mongod

   # Verify it's running
   sudo systemctl status mongod

**macOS (with Homebrew):**

.. code-block:: bash

   # Start MongoDB
   brew services start mongodb-community

   # Verify it's running
   brew services list | grep mongodb

**Windows (with WSL2):**

Follow the Linux instructions within your WSL2 environment.

Option B: MongoDB Atlas (Cloud)
-------------------------------

MongoDB Atlas is recommended for production deployments:

1. **Create Account:** Go to `MongoDB Atlas <https://www.mongodb.com/atlas>`_
   and create a free account

2. **Create Cluster:** Choose the free tier (M0) for development or a paid
   tier for production

3. **Create Database User:**

   * Navigate to Database Access
   * Click "Add New Database User"
   * Choose "Password" authentication
   * Grant "Read and write to any database" permission

4. **Configure Network Access:**

   * Navigate to Network Access
   * Click "Add IP Address"
   * Add your current IP or use "Allow Access from Anywhere" for development

5. **Get Connection String:**

   * Navigate to your cluster
   * Click "Connect" → "Connect your application"
   * Copy the connection string
   * Replace ``<password>`` with your database user's password
   * Update your ``.env`` file

Step 5: Initialize the Database
===============================

Run the database initialization script to create collections and indexes:

.. code-block:: bash

   npx tsx scripts/init-database.ts

This script creates:

* ``merged_catalogues`` - Catalogue metadata storage
* ``merged_events`` - Earthquake event data with QuakeML schema
* ``import_history`` - GeoNet import tracking
* ``users`` - User accounts and authentication

It also sets up indexes for:

* Fast event queries by time, location, and magnitude
* Geospatial queries for map views
* Full-text search on catalogue names

**Expected output:**

.. code-block:: text

   Connecting to MongoDB...
   Connected successfully
   Creating collections...
   Creating indexes...
   Database initialized successfully

Step 6: Start the Development Server
====================================

Launch the application:

.. code-block:: bash

   npm run dev

**Expected output:**

.. code-block:: text

   > earthquake-catalogue@1.0.0 dev
   > next dev

   ▲ Next.js 14.x.x
   - Local:        http://localhost:3000
   - Environments: .env

   ✓ Ready in 3.2s

.. note::
   The first startup may take 10-30 seconds as Next.js compiles the application.
   Subsequent startups are much faster due to caching.

Step 7: Access the Application
==============================

Open your web browser and navigate to:

.. code-block:: text

   http://localhost:3000

You should see the Earthquake Catalogue Platform homepage with:

* Navigation menu (Upload, Import, Merge, Catalogues, Analytics)
* Welcome message and quick start options
* Login/Register buttons

-----------------
First-Time Setup
-----------------

Create Your Account
===================

1. Click **Register** in the top navigation
2. Enter your email address and choose a secure password
3. Click **Create Account**
4. You'll be automatically logged in

Promote to Admin
================

To gain full administrative access, promote your account using the command line:

.. code-block:: bash

   npx tsx scripts/promote-to-admin.ts your-email@example.com

**Expected output:**

.. code-block:: text

   User your-email@example.com promoted to admin successfully

.. warning::
   **Security:** Keep your admin credentials secure. Admin users have full
   access to all system features including user management and data deletion.

User Roles
==========

The platform supports four roles:

.. list-table::
   :header-rows: 1
   :widths: 20 80

   * - Role
     - Permissions
   * - **Admin**
     - Full access: manage users, delete catalogues, system configuration
   * - **Editor**
     - Create, update, and delete own catalogues; import and merge data
   * - **Viewer**
     - View catalogues, visualize data, export (read-only)
   * - **Guest**
     - Limited access to public catalogues only

----------
Quick Tour
----------

Now that you're set up, here's a quick tour of the main features:

Dashboard
=========

The main page (``/``) shows:

* Your recent catalogues
* Quick action buttons
* System status

Upload Page
===========

Navigate to ``/upload`` to:

* Upload CSV, JSON, or QuakeML files
* Map fields to the standard schema
* Preview and validate data
* Create new catalogues

Import Page
===========

Navigate to ``/import`` to:

* Connect to GeoNet's FDSN service
* Set time, magnitude, and geographic filters
* Import events automatically
* Track import history

Catalogues Page
===============

Navigate to ``/catalogues`` to:

* View all your catalogues
* See event counts and statistics
* Access individual catalogue details
* Delete or rename catalogues

Analytics Page
==============

Navigate to ``/analytics`` to:

* View events on an interactive map
* See quality score distributions
* Explore magnitude-frequency plots
* Analyze temporal patterns

----------
Next Steps
----------

Congratulations! Your platform is ready. Here's what to do next:

1. **Upload Data:** :doc:`uploading-data` - Import your first earthquake catalogue
2. **GeoNet Import:** :doc:`importing-geonet` - Pull live data from GeoNet
3. **Visualize:** :doc:`visualization` - Explore the map and analytics features

-----------------
Troubleshooting
-----------------

MongoDB Connection Failed
=========================

**Symptoms:** "MongoServerSelectionError" or "ECONNREFUSED"

**Solutions:**

1. Verify MongoDB is running:

   .. code-block:: bash

      # Linux
      sudo systemctl status mongod

      # macOS
      brew services list | grep mongodb

2. Check your connection string in ``.env``

3. For Atlas, ensure:

   * Your IP is whitelisted in Network Access
   * Username and password are correct
   * You're using the correct cluster URL

4. Test the connection:

   .. code-block:: bash

      # Local MongoDB
      mongosh mongodb://localhost:27017

      # MongoDB Atlas
      mongosh "your-connection-string"

Port Already in Use
===================

**Symptoms:** "Error: listen EADDRINUSE :::3000"

**Solutions:**

.. code-block:: bash

   # Find what's using port 3000
   lsof -i :3000   # macOS/Linux
   netstat -ano | findstr :3000   # Windows

   # Use a different port
   PORT=3001 npm run dev

   # Or kill the process using port 3000
   kill -9 $(lsof -t -i:3000)   # macOS/Linux

Module Not Found Errors
=======================

**Symptoms:** "Cannot find module 'xxx'"

**Solutions:**

.. code-block:: bash

   # Remove node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install

   # If still failing, clear npm cache
   npm cache clean --force
   npm install

Build Errors
============

**Symptoms:** TypeScript or compilation errors

**Solutions:**

.. code-block:: bash

   # Clear Next.js cache
   rm -rf .next

   # Restart development server
   npm run dev

Authentication Issues
=====================

**Symptoms:** Cannot log in, session errors

**Solutions:**

1. Verify ``NEXTAUTH_SECRET`` is set in ``.env``
2. Ensure ``NEXTAUTH_URL`` matches your access URL
3. Clear browser cookies for localhost
4. Restart the development server

Slow Performance
================

**Symptoms:** Slow page loads, timeouts

**Solutions:**

1. Ensure MongoDB indexes are created (run init script)
2. Increase Node.js memory:

   .. code-block:: bash

      NODE_OPTIONS="--max-old-space-size=4096" npm run dev

3. For large catalogues, use pagination and filters

------------------
Getting Help
------------------

If you encounter issues not covered here:

1. **Check logs:** Look at the terminal output for error messages
2. **GitHub Issues:** Report bugs at the project repository
3. **Documentation:** Refer to the :doc:`../troubleshooting` guide

----------
Next Steps
----------

* :doc:`uploading-data` - Upload your first earthquake catalogue
* :doc:`importing-geonet` - Import data from GeoNet
* :doc:`visualization` - Explore the visualization features
