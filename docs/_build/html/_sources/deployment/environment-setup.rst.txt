=================
Environment Setup
=================

Production deployments require a complete set of environment variables and a
MongoDB instance.

Required Variables
------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``MONGODB_URI``
     - MongoDB connection string (local or Atlas)
   * - ``MONGODB_DATABASE``
     - Database name (optional override)
   * - ``NEXTAUTH_SECRET``
     - 32+ character secret for signing JWTs
   * - ``NEXTAUTH_URL``
     - Base URL for authentication callbacks

Optional Variables
------------------

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Variable
     - Description
   * - ``EMAIL_WEBHOOK_URL``
     - Webhook for sending password reset emails
   * - ``LOG_LEVEL``
     - Log verbosity (``debug``, ``info``, ``warn``, ``error``)

Database Initialization
-----------------------

Initialize the MongoDB collections and indexes before going live:

.. code-block:: bash

   npx tsx scripts/init-database.ts

If you need to create additional indexes later, run:

.. code-block:: bash

   npx tsx scripts/create-indexes.ts
