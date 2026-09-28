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

``scripts/init-database.ts``, ``scripts/create-indexes.ts`` and
``scripts/ensure-indexes.ts`` all read from the same shared ``DATABASE_INDEXES``
definition (``lib/event-indexes.ts``), so they can never drift out of sync with
each other. That means they can be run in any order and any number of times —
use whichever fits your deploy pipeline:

.. code-block:: bash

   npx tsx scripts/create-indexes.ts
   npx tsx scripts/ensure-indexes.ts

Each of the three scripts exits with status 1 on failure, so a CI/deploy
pipeline can detect a failed index setup step.

The event loading redesign requires the ``catalogue_time_id_idx`` index on
``merged_events`` with keys ``{ catalogue_id: 1, time: -1, id: -1 }``. This
supports cursor pages ordered by time with an event ID tie-breaker. Run the
index setup against existing databases when deploying this change; updating
the application alone does not create the index. Fresh database initialization
also includes it.

Maintenance Scripts
--------------------

.. code-block:: bash

   npx tsx scripts/check-database-integrity.ts --sweep-orphans [--apply]

Reports events and import-history rows whose catalogue no longer exists, and
catalogue deletions left stuck in a ``deleting`` state. It only reports by
default; add ``--apply`` to delete the orphaned records it finds.

.. code-block:: bash

   npx tsx scripts/backfill-quality-scores.ts [--apply] [--all]

Backfills ``quality_score`` and ``quality_grade`` on existing event rows that
don't have them yet. Dry-run by default (reports what would change); add
``--apply`` to write the scores, and ``--all`` to recompute every event rather
than only those missing a valid score (for example after the scoring rules
change). This does not bump a catalogue's version number — per the platform's
versioning policy, a quality-score backfill is not a change to event
parameters.
