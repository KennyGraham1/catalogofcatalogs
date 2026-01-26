===============
Developer Guide
===============

Welcome to the Earthquake Catalogue Platform Developer Guide. This guide provides technical information for developers who want to contribute to the project, extend its functionality, or integrate it with other systems.

--------
Overview
--------

The Earthquake Catalogue Platform is built with modern web technologies:

* **Frontend:** Next.js 13+ with App Router, React, TypeScript
* **Backend:** Next.js API Routes (serverless)
* **Database:** MongoDB with full QuakeML 1.2 schema
* **UI:** Tailwind CSS, shadcn/ui components
* **Maps:** Leaflet with React Leaflet
* **Testing:** Jest, React Testing Library

-----------------
What You'll Learn
-----------------

This developer guide covers:

1. **Architecture** - System design, components, and data flow
2. **Setup** - Development environment configuration
3. **Database Schema** - MongoDB collections and indexes
4. **API Development** - Creating and extending API endpoints
5. **Testing** - Writing and running tests
6. **Contributing** - Guidelines for contributing code
7. **Implementation Notes** - Technical deep dives and summaries

------------------
Technology Stack
------------------

Frontend
========

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Technology
     - Purpose
   * - Next.js 13+
     - React framework with App Router
   * - TypeScript
     - Type-safe development
   * - Tailwind CSS
     - Utility-first CSS framework
   * - shadcn/ui
     - High-quality React components (40+ Radix UI components)
   * - Recharts
     - Data visualization library
   * - Leaflet
     - Interactive map library
   * - React Hook Form
     - Form validation and management
   * - Zod
     - Schema validation

Backend
=======

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Technology
     - Purpose
   * - Next.js API Routes
     - Serverless API endpoints
   * - MongoDB
     - NoSQL database with QuakeML 1.2 schema
   * - NextAuth.js
     - Authentication and session management
   * - xml2js
     - XML parsing for QuakeML
   * - uuid
     - Unique identifier generation

Testing
=======

.. list-table::
   :header-rows: 1
   :widths: 30 70

   * - Technology
     - Purpose
   * - Jest
     - JavaScript testing framework
   * - Testing Library
     - React component testing
   * - @types packages
     - TypeScript type definitions

-----------------
Project Structure
-----------------

.. code-block:: text

   catalogofcatalogs/
   ├── app/                    # Next.js app directory
   │   ├── api/               # API routes
   │   │   ├── catalogues/   # Catalogue CRUD
   │   │   ├── import/       # GeoNet import
   │   │   ├── merge/        # Catalogue merging
   │   │   └── upload/       # File upload
   │   ├── analytics/         # Analytics page
   │   ├── catalogues/        # Catalogue pages
   │   ├── dashboard/         # Dashboard
   │   ├── import/            # Import page
   │   ├── merge/             # Merge page
   │   └── upload/            # Upload page
   ├── components/            # React components
   │   ├── ui/               # shadcn/ui components
   │   ├── catalogues/       # Catalogue components
   │   ├── import/           # Import components
   │   ├── merge/            # Merge components
   │   └── upload/           # Upload components
   ├── lib/                   # Core library code
   │   ├── mongodb.ts        # MongoDB client
   │   ├── db.ts             # Database queries
   │   ├── parsers.ts        # File parsers
   │   ├── earthquake-utils.ts
   │   ├── quality-scoring.ts
   │   └── types/            # TypeScript types
   ├── scripts/               # Utility scripts
   ├── __tests__/             # Jest tests
   └── docs/                  # Documentation

-----------
Quick Links
-----------

* :doc:`architecture` - System architecture and design
* :doc:`setup` - Development environment setup
* :doc:`database-schema` - MongoDB schema details
* :doc:`api-development` - API development guide
* :doc:`testing` - Testing guide
* :doc:`contributing` - Contribution guidelines
* :doc:`implementation-notes/index` - Implementation notes and deep dives

----------
Next Steps
----------

Ready to start developing? Head over to :doc:`setup` to configure your development environment.

.. toctree::
   :hidden:
   :maxdepth: 2

   architecture
   setup
   database-schema
   api-development
   testing
   contributing
   implementation-notes/index
