===============
Getting Started
===============

This guide will help you install, configure, and run the Earthquake Catalogue Platform.

-------------
Prerequisites
-------------

Before you begin, ensure you have the following installed:

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Software
     - Version
   * - Node.js
     - 18.x or higher
   * - npm
     - 9.x or higher
   * - MongoDB
     - 6.x or higher (local or MongoDB Atlas)

------------
Installation
------------

Step 1: Clone the Repository
=============================

.. code-block:: bash

   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs

Step 2: Install Dependencies
=============================

.. code-block:: bash

   npm install

This will install all required Node.js packages including Next.js, React, MongoDB drivers, and other dependencies.

Step 3: Configure Environment Variables
========================================

Create a ``.env`` file in the project root:

.. code-block:: bash

   cp .env.example .env

Edit the ``.env`` file with your configuration:

.. code-block:: bash

   # MongoDB Connection
   # For local MongoDB:
   MONGODB_URI=mongodb://localhost:27017/earthquake_catalogue

   # For MongoDB Atlas:
   # MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/earthquake_catalogue

   # Optional: Override database name
   MONGODB_DATABASE=earthquake_catalogue

   # Application
   NODE_ENV=development

   # NextAuth (required for authentication)
   # Generate secret with: openssl rand -base64 32
   NEXTAUTH_SECRET=your-generated-secret-here
   NEXTAUTH_URL=http://localhost:3000

.. tip::
   Generate a secure ``NEXTAUTH_SECRET`` using:
   
   .. code-block:: bash
   
      openssl rand -base64 32

Step 4: Set Up MongoDB
=======================

**Option A: Local MongoDB**

If using a local MongoDB installation:

.. code-block:: bash

   # Start MongoDB service
   sudo systemctl start mongod  # Linux
   # or
   brew services start mongodb-community  # macOS

**Option B: MongoDB Atlas**

If using MongoDB Atlas (cloud):

1. Create a cluster at `MongoDB Atlas <https://www.mongodb.com/atlas>`_
2. Create a database user with read/write permissions
3. Add your IP address to the Network Access list
4. Copy the connection string and update your ``.env`` file

Step 5: Initialize the Database
================================

Run the database initialization script:

.. code-block:: bash

   npx tsx scripts/init-database.ts

This script will:

* Create required collections (``merged_catalogues``, ``merged_events``, ``import_history``, ``users``)
* Set up indexes for optimal query performance
* Create default user roles

Step 6: Start the Development Server
=====================================

.. code-block:: bash

   npm run dev

The application will start on http://localhost:3000

.. note::
   The first startup may take a few moments as Next.js compiles the application.

Step 7: Access the Application
===============================

Open your web browser and navigate to:

.. code-block:: text

   http://localhost:3000

You should see the Earthquake Catalogue Platform homepage.

-----------------
First-Time Setup
-----------------

Create an Admin User
====================

On first run, you'll need to create an admin user:

1. Navigate to the registration page
2. Create an account with your email and password
3. Promote yourself to admin using the script:

.. code-block:: bash

   npx tsx scripts/promote-to-admin.ts your-email@example.com

.. warning::
   Keep your admin credentials secure! Admin users have full access to all system features.

----------
Next Steps
----------

Now that you have the platform running:

* :doc:`uploading-data` - Upload your first earthquake catalogue
* :doc:`importing-geonet` - Import data from GeoNet
* :doc:`visualization` - Explore the visualization features

-----------------
Troubleshooting
-----------------

MongoDB Connection Issues
=========================

If you encounter MongoDB connection errors:

1. Verify MongoDB is running: ``sudo systemctl status mongod``
2. Check your connection string in ``.env``
3. For Atlas, ensure your IP is whitelisted
4. Check firewall settings

Port Already in Use
===================

If port 3000 is already in use:

.. code-block:: bash

   # Use a different port
   PORT=3001 npm run dev

Missing Dependencies
====================

If you see module not found errors:

.. code-block:: bash

   # Clear node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install

