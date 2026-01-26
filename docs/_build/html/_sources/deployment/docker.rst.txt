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
   MONGODB_URI=mongodb://admin:secure_password@mongodb:27017/earthquake_catalogue?authSource=admin

   # For MongoDB Atlas (recommended for production):
   # MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/earthquake_catalogue

   MONGODB_DATABASE=earthquake_catalogue

   # Authentication (REQUIRED - generate with: openssl rand -base64 32)
   NEXTAUTH_SECRET=your-secure-secret-here
   NEXTAUTH_URL=https://your-domain.com

   # MongoDB root credentials (if using containerized MongoDB)
   MONGO_ROOT_USER=admin
   MONGO_ROOT_PASSWORD=secure_password_here

Optional Variables
==================

.. code-block:: bash

   # Email notifications (optional)
   EMAIL_WEBHOOK_URL=https://your-email-service/webhook

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
* **Ports**: 80, 443
* **Features**: SSL termination, caching, load balancing

-----------------
Deployment Options
-----------------

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

Option 3: With Nginx Reverse Proxy
==================================

Deploy with the nginx reverse proxy for SSL termination:

.. code-block:: bash

   # First, set up nginx configuration in ./nginx/nginx.conf
   # and SSL certificates in ./nginx/ssl/
   docker compose -f docker-compose.prod.yml --profile with-nginx up -d

Example nginx configuration (``nginx/nginx.conf``):

.. code-block:: nginx

   events {
       worker_connections 1024;
   }

   http {
       upstream app {
           server app:3000;
       }

       server {
           listen 80;
           server_name your-domain.com;
           return 301 https://$server_name$request_uri;
       }

       server {
           listen 443 ssl;
           server_name your-domain.com;

           ssl_certificate /etc/nginx/ssl/fullchain.pem;
           ssl_certificate_key /etc/nginx/ssl/privkey.pem;

           location / {
               proxy_pass http://app;
               proxy_set_header Host $host;
               proxy_set_header X-Real-IP $remote_addr;
               proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
               proxy_set_header X-Forwarded-Proto $scheme;
           }
       }
   }

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
