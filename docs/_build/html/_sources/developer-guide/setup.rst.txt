=================
Development Setup
=================

This guide covers the local development workflow for contributors.

Prerequisites
-------------

- Node.js 18+
- npm 9+
- MongoDB (local or Atlas)
- Git

Clone and Install
-----------------

.. code-block:: bash

   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs
   npm install

Environment Configuration
-------------------------

Copy the example environment file and update the values for your environment:

.. code-block:: bash

   cp .env.example .env.local

Start the Development Server
----------------------------

.. code-block:: bash

   npm run dev

The application runs at ``http://localhost:3000`` by default.

Database Initialization
-----------------------

Initialize MongoDB collections and indexes:

.. code-block:: bash

   npx tsx scripts/init-database.ts

Next Steps
----------

- See :doc:`testing` for running the test suite.
- See :doc:`contributing` for contribution guidelines.
- See :doc:`api-development` for API route patterns.
