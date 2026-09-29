=================
Docker Deployment
=================

The Earthquake Catalogue Platform includes production-ready Docker configurations
for containerized deployment.

--------
Overview
--------

Docker deployment provides:

* Consistent runtime environment across development and production
* Easy scaling and orchestration
* Resource isolation and management
* Simplified dependency management
* Health monitoring and auto-restart

-------------
Prerequisites
-------------

Before deploying with Docker, ensure you have:

* Docker Engine 20.10+ installed
* Docker Compose v2.0+ installed
* At least 4GB RAM available
* 20GB disk space for images and data

Verify installations:

.. code-block:: bash

   docker --version
   docker compose version

----------------
Quick Start
----------------

1. Clone the repository and navigate to the project directory:

.. code-block:: bash

   git clone https://github.com/KennyGraham1/catalogofcatalogs.git
   cd catalogofcatalogs

2. Create environment file:

.. code-block:: bash

   cp .env.example .env.production

3. Edit ``.env.production`` with your configuration (see below).

4. Build and start services:

.. code-block:: bash

   docker compose -f docker-compose.prod.yml up -d

5. Verify deployment:

.. code-block:: bash

   docker compose -f docker-compose.prod.yml ps
   curl http://localhost:3000/api/health

-------------------------
Environment Configuration
-------------------------

Create a ``.env.production`` file with the following variables:

Required Variables
==================

.. code-block:: bash

   # MongoDB Connection
   # For containerized MongoDB:
   MONGODB_URI=mongodb://<mongo-root-user>:<mongo-root-password>@mongodb:27017/earthquake_catalogue?authSource=admin

   # For MongoDB Atlas (recommended for production):
   # MONGODB_URI=mongodb+srv://<atlas-username>:<atlas-password>@<atlas-cluster-host>/earthquake_catalogue

   MONGODB_DATABASE=earthquake_catalogue

   # Authentication (REQUIRED - generate with: openssl rand -base64 32)
   NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>
   NEXTAUTH_URL=https://your-domain.com

   # MongoDB root credentials (if using containerized MongoDB)
   MONGO_ROOT_USER=admin
   MONGO_ROOT_PASSWORD=<generate-strong-password>

Optional Variables
==================

.. code-block:: bash

   # Email notifications (optional)
   EMAIL_WEBHOOK_URL=https://your-email-service/webhook

   # Number of trusted reverse-proxy hops in front of the app (default: 1).
   # Raise this if you add another load balancer in front of the bundled
   # nginx reverse proxy; see "Option 3: With Nginx Reverse Proxy" below.
   TRUSTED_PROXY_HOPS=1

.. warning::
   Never commit ``.env.production`` to version control. Add it to ``.gitignore``.

-----------------------
Service Architecture
-----------------------

The production Docker Compose configuration includes three services:

.. code-block:: text

   +-----------------------------------------------------+
   |                    Docker Network                    |
   |                  (earthquake-network)                |
   |                                                      |
   |  +----------+    +----------+    +--------------+   |
   |  |  nginx   |--->|   app    |--->|   mongodb    |   |
   |  |  :80/:443|    |  :3000   |    |   :27017     |   |
   |  +----------+    +----------+    +--------------+   |
   |   (optional)                       (optional)       |
   +-----------------------------------------------------+

Application Service (app)
=========================

The main Next.js application container:

* **Image**: Built from ``Dockerfile``
* **Port**: 3000 (internal and external)
* **Resources**:

  - Limits: 2 CPU, 2GB RAM
  - Reservations: 0.5 CPU, 512MB RAM

* **Security**: Read-only filesystem, no new privileges

Database Service (mongodb)
==========================

Optional MongoDB container (remove if using MongoDB Atlas):

* **Image**: ``mongo:7.0``
* **Port**: 27017 (internal only - not exposed)
* **Resources**:

  - Limits: 1 CPU, 1GB RAM
  - Reservations: 0.25 CPU, 256MB RAM

* **Data**: Persisted in ``mongodb_data`` volume

Nginx Service (nginx)
=====================

Optional reverse proxy (activated with ``--profile with-nginx``):

* **Image**: ``nginx:alpine``
* **Ports**: 80 is active by default; 443 is published but the TLS server
  block in ``nginx/nginx.conf`` is commented out until certificates are
  added under ``nginx/ssl/`` (see "Option 3" below)
* **Features**: accurate client-IP forwarding for the app's rate limiters,
  caching, load balancing, and (once enabled) SSL termination

------------------
Deployment Options
------------------

Option 1: Full Stack (with MongoDB)
===================================

Deploy the complete stack including a containerized MongoDB:

.. code-block:: bash

   docker compose -f docker-compose.prod.yml up -d

Option 2: Application Only (with MongoDB Atlas)
===============================================

If using MongoDB Atlas or external database, edit ``docker-compose.prod.yml``
and remove or comment out the ``mongodb`` service and its ``depends_on`` reference:

.. code-block:: bash

   # Update MONGODB_URI in .env.production to point to Atlas
   docker compose -f docker-compose.prod.yml up -d app

Option 3: With Nginx Reverse Proxy (Recommended for Production)
===============================================================

The repository ships a ready-to-use reverse proxy configuration at
``nginx/nginx.conf``, wired up via the ``with-nginx`` Docker Compose
profile. This is the recommended way to run in production: it lets the
app enforce accurate per-client rate limits (login, registration, password
reset) while keeping the app container off the host's public interface.

.. code-block:: bash

   # Bind the app to localhost only; nginx is then the only way in.
   # nginx reaches the app over the compose network at app:3000.
   APP_BIND_ADDRESS=127.0.0.1 \
     docker compose -f docker-compose.prod.yml --profile with-nginx up -d

.. note::
   Without ``--profile with-nginx`` (or without setting
   ``APP_BIND_ADDRESS``), the prod compose file still publishes the app
   directly on ``0.0.0.0:3000`` by default — an operator must opt into the
   proxy.

**Why this combination matters:** the app's per-client rate limiters key off
the ``X-Forwarded-For`` entry added by the last *trusted* proxy (the
``TRUSTED_PROXY_HOPS`` environment variable, default ``1``). If a client
could reach the app directly, it could set its own ``X-Forwarded-For`` and
choose its own rate-limit bucket, so two things close that off:

* ``nginx/nginx.conf`` **overwrites** ``X-Forwarded-For`` with the address
  it sees, instead of appending to whatever the client sent:

  .. code-block:: nginx

     proxy_set_header X-Forwarded-For $remote_addr;

  A proxy using ``$proxy_add_x_forwarded_for`` instead *appends* to the
  client-supplied header rather than replacing it, which would let a
  malicious client forge their own rate-limit bucket by sending a fake
  ``X-Forwarded-For`` of their own.
* ``APP_BIND_ADDRESS=127.0.0.1`` keeps the app reachable only through
  nginx, so clients cannot bypass the proxy and talk to the app directly.

The same shipped config also forwards the headers the app's CSRF defence
needs (see :doc:`../developer-guide/architecture`, which compares a
state-changing request's ``Origin`` against the app's own scheme, host
**and port**): ``Host`` (with its port, via the ``$public_host`` map so a
default port is filled in from ``$host`` when the browser didn't send one),
``X-Forwarded-Host``, ``X-Forwarded-Proto`` and ``X-Forwarded-Port``. If
you write your own reverse-proxy config instead of the shipped
``nginx/nginx.conf``, forward all four accurately or same-origin API
writes through the proxy will be refused.

Other defaults worth knowing:

* nginx listens on port 80 only by default. A commented-out ``443 ssl``
  server block is included in ``nginx/nginx.conf`` — add certificate and
  key files under ``nginx/ssl/`` and uncomment it to enable TLS.
* The upload API accepts request bodies up to 100 MB
  (``client_max_body_size 100m;``).
* GeoNet imports may run for up to ~300 seconds, so
  ``proxy_read_timeout`` and ``proxy_send_timeout`` are both set to
  ``310s``.

If another load balancer or proxy sits in front of this nginx, raise
``TRUSTED_PROXY_HOPS`` to match the number of trusted hops, and configure
nginx's ``realip`` module so ``$remote_addr`` still resolves to the true
client (the header comment in ``nginx/nginx.conf`` shows the exact
directives):

.. code-block:: nginx

   set_real_ip_from 10.0.0.0/8;   # the load balancer's address(es)
   real_ip_header    X-Forwarded-For;
   real_ip_recursive on;

-------------
Health Checks
-------------

All services include health checks:

Application Health
==================

.. code-block:: bash

   # Check application health
   curl http://localhost:3000/api/health

   # Expected response:
   {
     "status": "healthy",
     "timestamp": "2026-01-26T12:00:00.000Z",
     "checks": [
       {
         "name": "database",
         "status": "healthy",
         "responseTime": 5
       }
     ]
   }

Container Health Status
=======================

.. code-block:: bash

   # View container health
   docker compose -f docker-compose.prod.yml ps

   # Expected output shows "healthy" status
   NAME                           STATUS                    PORTS
   earthquake-catalogue-app       Up 5 minutes (healthy)    0.0.0.0:3000->3000/tcp
   earthquake-catalogue-db        Up 5 minutes (healthy)    27017/tcp

-------------------
Management Commands
-------------------

View Logs
=========

.. code-block:: bash

   # All services
   docker compose -f docker-compose.prod.yml logs -f

   # Specific service
   docker compose -f docker-compose.prod.yml logs -f app

   # Last 100 lines
   docker compose -f docker-compose.prod.yml logs --tail=100 app

Stop Services
=============

.. code-block:: bash

   # Stop all services (preserves data)
   docker compose -f docker-compose.prod.yml stop

   # Stop and remove containers (preserves volumes)
   docker compose -f docker-compose.prod.yml down

   # Stop and remove everything including volumes (DATA LOSS)
   docker compose -f docker-compose.prod.yml down -v

Restart Services
================

.. code-block:: bash

   # Restart all
   docker compose -f docker-compose.prod.yml restart

   # Restart specific service
   docker compose -f docker-compose.prod.yml restart app

Update Application
==================

.. code-block:: bash

   # Pull latest code
   git pull origin main

   # Rebuild and restart
   docker compose -f docker-compose.prod.yml up -d --build

   # Or rebuild specific service
   docker compose -f docker-compose.prod.yml up -d --build app

-----------------
Database Backup
-----------------

Backup MongoDB Data
===================

.. code-block:: bash

   # Create backup
   docker compose -f docker-compose.prod.yml exec mongodb \
     mongodump --out=/data/backup --username admin \
     --password $MONGO_ROOT_PASSWORD --authenticationDatabase admin

   # Copy backup to host
   docker cp earthquake-catalogue-db:/data/backup ./backup-$(date +%Y%m%d)

Restore MongoDB Data
====================

.. code-block:: bash

   # Copy backup to container
   docker cp ./backup-20260126 earthquake-catalogue-db:/data/backup

   # Restore
   docker compose -f docker-compose.prod.yml exec mongodb \
     mongorestore /data/backup --username admin \
     --password $MONGO_ROOT_PASSWORD --authenticationDatabase admin

---------------
Troubleshooting
---------------

Container Won't Start
=====================

.. code-block:: bash

   # Check logs
   docker compose -f docker-compose.prod.yml logs app

   # Common issues:
   # - Missing environment variables
   # - Database connection string incorrect
   # - Port already in use

Database Connection Failed
==========================

If using containerized MongoDB:

.. code-block:: bash

   # Check MongoDB is running
   docker compose -f docker-compose.prod.yml ps mongodb

   # Check MongoDB logs
   docker compose -f docker-compose.prod.yml logs mongodb

   # Test connection
   docker compose -f docker-compose.prod.yml exec mongodb \
     mongosh --eval "db.adminCommand('ping')"

Out of Memory
=============

Adjust resource limits in ``docker-compose.prod.yml``:

.. code-block:: yaml

   deploy:
     resources:
       limits:
         memory: 4G  # Increase from 2G

Permission Denied
=================

If you see permission errors:

.. code-block:: bash

   # Ensure proper ownership of mounted volumes
   sudo chown -R 1000:1000 ./data

---------------------------
Security Best Practices
---------------------------

1. **Never expose MongoDB**: The database port is internal-only by default
2. **Use secrets management**: Consider Docker Secrets or external vault
3. **Keep images updated**: Regularly pull base image updates
4. **Enable read-only filesystem**: Already configured in compose file
5. **Use non-root user**: Application runs as non-root
6. **Limit resources**: Prevent runaway processes
7. **Enable logging**: All services log to JSON with rotation

----------
Next Steps
----------

* :doc:`mongodb-atlas` - Set up MongoDB Atlas for production
* :doc:`vercel` - Alternative deployment to Vercel
* :doc:`ci-cd` - Set up CI/CD pipelines
* :doc:`../administration/monitoring` - Configure monitoring
