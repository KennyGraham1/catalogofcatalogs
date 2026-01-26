Vercel Deployment Guide
=======================


Deploy the Earthquake Catalogue Platform to Vercel with MongoDB Atlas.

Table of Contents
-----------------


1. ``Prerequisites <#prerequisites>``_
2. ``MongoDB Atlas Setup <#mongodb-atlas-setup>``_
3. ``Next.js Configuration <#nextjs-configuration>``_
4. ``Environment Variables <#environment-variables>``_
5. ``Database Initialization <#database-initialization>``_
6. ``Deployment Process <#deployment-process>``_
7. ``Post-Deployment Verification <#post-deployment-verification>``_
8. ``Troubleshooting <#troubleshooting>``_



Prerequisites
-------------


Before deploying, ensure you have:

- [ ] A ``Vercel account <https://vercel.com/signup>``_ (free tier works)
- [ ] MongoDB Atlas cluster configured (you already have this!)
- [ ] Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
- [ ] Node.js 18+ installed locally (for running initialization scripts)



MongoDB Atlas Setup
-------------------


Existing Configuration
^^^^^^^^^^^^^^^^^^^^^^


You already have a MongoDB Atlas Serverless instance configured:

.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Setting
     - Value
   * - **Cluster**
     - ``ServerlessInstance0``
   * - **Host**
     - ``serverlessinstance0.ta8golw.mongodb.net``
   * - **Database**
     - ``eq-catalogue``
   * - **Username**
     - ``kerry_graham``


Your connection string format:
.. code-block:: text

   mongodb+srv://kerry_graham:<password>@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue?appName=ServerlessInstance0


Verify Network Access for Vercel
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Since Vercel uses dynamic IP addresses for serverless functions, ensure your Atlas cluster allows connections from anywhere:

1. Go to ``MongoDB Atlas <https://cloud.mongodb.com/>``_ and sign in
2. Navigate to **Network Access** in the left sidebar
3. Verify that ``0.0.0.0/0`` (Allow from Anywhere) is in the IP Access List
4. If not, click **"Add IP Address"** → **"Allow Access from Anywhere"** → **"Confirm"**


   **Note**: Your Serverless Instance may have different network settings. Check the Atlas dashboard for your specific configuration.


(Optional) Create New Cluster
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


If you need to create a new cluster for production:

1. Go to ``MongoDB Atlas <https://cloud.mongodb.com/>``_
2. Click **"Build a Database"**
3. Choose a tier:
   - **Serverless** - Pay-per-operation (you're using this)
   - **M0 Sandbox** (Free) - Good for development/testing
   - **M10+** (Paid) - Recommended for high-traffic production
4. Select a region close to your Vercel deployment region
5. Create a database user with read/write permissions

Atlas Optimizations
^^^^^^^^^^^^^^^^^^^


For production workloads, configure these Atlas settings:

**Performance**:
- Enable **Auto-scaling** (M10+ only)
- Create **indexes** (handled by init script)
- Set up **Atlas Search** for better event search (optional)

**Monitoring**:
- Enable **Performance Advisor** 
- Set up **Alerts** for high CPU/memory usage



Next.js Configuration
---------------------


The project is already configured for Vercel deployment. Key settings in ``next.config.js``:

.. code-block:: javascript

   const nextConfig = {
     // Standalone output for optimal serverless deployment
     output: 'standalone',
     
     // ESLint configured to not block builds
     eslint: {
       ignoreDuringBuilds: true,
     },
     
     // Security headers included
     // Webpack optimizations for production
   };


Vercel-Specific Changes (Optional)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


If you need to customize for Vercel, you can add a ``vercel.json`` in the project root:

.. code-block:: json

   {
     "framework": "nextjs",
     "regions": ["iad1"],
     "functions": {
       "app/api/**/*.ts": {
         "maxDuration": 30
       }
     }
   }


**Note**: The ``regions`` setting should match your MongoDB Atlas region for lowest latency:
- ``iad1`` = US East (Washington DC)
- ``sfo1`` = US West (San Francisco)
- ``lhr1`` = Europe (London)
- ``syd1`` = Australia (Sydney)



Environment Variables
---------------------


Required Variables
^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20

   * - Variable
     - Description
     - Your Value
   * - ``MONGODB_URI``
     - MongoDB Atlas connection string
     - ``mongodb+srv://kerry_graham:<password>@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue?appName=ServerlessInstance0``
   * - ``MONGODB_DATABASE``
     - Database name
     - ``eq-catalogue``
   * - ``NEXTAUTH_SECRET``
     - Random secret for session encryption
     - Generate with ``openssl rand -base64 32``
   * - ``NEXTAUTH_URL``
     - Your production URL
     - ``https://your-app.vercel.app``


Setting Variables in Vercel
^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. Go to your Vercel project dashboard
2. Click **"Settings"** → **"Environment Variables"**
3. Add each variable:

.. code-block:: text

   MONGODB_URI = mongodb+srv://kerry_graham:YOUR_PASSWORD@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue?appName=ServerlessInstance0
   MONGODB_DATABASE = eq-catalogue
   NEXTAUTH_SECRET = <generate-a-random-32-char-string>
   NEXTAUTH_URL = https://your-app.vercel.app



   **Important**: Replace ``YOUR_PASSWORD`` with your actual MongoDB Atlas password. Do not commit passwords to version control.


4. Set the **Environment** for each variable:
   - **Production**: Your live site
   - **Preview**: Pull request previews
   - **Development**: For ``vercel dev`` locally

Generating NEXTAUTH_SECRET
^^^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   # Option 1: Using OpenSSL
   openssl rand -base64 32
   
   # Option 2: Using Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"




Database Initialization
-----------------------


Initialize your production database with collections and indexes.

Option 1: Run Locally (Recommended)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Since your ``.env`` file already contains the Atlas connection, you can run the initialization directly:

.. code-block:: bash

   # Navigate to your project
   cd /home/kennyg/projects/catalogofcatalogs
   
   # Run the initialization script (uses .env automatically)
   npx tsx scripts/init-database.ts


Or explicitly set the environment variables:

.. code-block:: bash

   # Set production MongoDB URI
   export MONGODB_URI="mongodb+srv://kerry_graham:YOUR_PASSWORD@serverlessinstance0.ta8golw.mongodb.net/eq-catalogue?appName=ServerlessInstance0"
   export MONGODB_DATABASE="eq-catalogue"
   
   # Run the initialization script
   npx tsx scripts/init-database.ts


Expected output:
.. code-block:: text

   🔧 Initializing MongoDB database...
   
      URI: mongodb+srv://kerry_graham:****@serverlessinstance0.ta8golw.mongodb.net
      Database: eq-catalogue
   
   ✓ Connected to MongoDB
   
   📦 Creating collections...
   ✓ Created collection: merged_catalogues
   ✓ Created collection: merged_events
   ✓ Created collection: mapping_templates
   ✓ Created collection: import_history
   ✓ Created collection: saved_filters
   ✓ Created collection: users
   ✓ Created collection: sessions
   ✓ Created collection: api_keys
   ✓ Created collection: audit_logs
   
   🔍 Creating indexes...
   ✓ Created index: merged_events.idx_id
   ✓ Created index: merged_events.idx_catalogue_id
   ✓ Created index: merged_events.idx_time
   ...
   
   ✅ MongoDB database initialized successfully!
      Collections created: 9
      Indexes created: 30+
   
   ✓ Disconnected from MongoDB


Option 2: Via MongoDB Compass
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. Download ``MongoDB Compass <https://www.mongodb.com/products/compass>``_
2. Connect using your Atlas connection string
3. Create the database ``earthquake_catalogue``
4. Manually create collections (or let the app create them on first use)

Option 3: Via Atlas UI
^^^^^^^^^^^^^^^^^^^^^^


1. Go to your cluster in Atlas
2. Click **"Browse Collections"**
3. Click **"Create Database"**
4. Database name: ``earthquake_catalogue``
5. Collection name: ``merged_catalogues``
6. Collections will be created automatically when the app runs



Deployment Process
------------------


Step 1: Connect Repository to Vercel
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. Go to ``Vercel Dashboard <https://vercel.com/dashboard>``_
2. Click **"Add New..."** → **"Project"**
3. Import your Git repository:
   - **GitHub**: Click "Import" next to your repo
   - **GitLab/Bitbucket**: Click the respective tab and authorize
4. Select your repository

Step 2: Configure Build Settings
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Vercel auto-detects Next.js. Verify these settings:

.. list-table::
   :header-rows: 1
   :widths: 20 20

   * - Setting
     - Value
   * - **Framework Preset**
     - Next.js
   * - **Root Directory**
     - ``./`` (or your app location)
   * - **Build Command**
     - ``npm run build`` (auto-detected)
   * - **Output Directory**
     - ``.next`` (auto-detected)
   * - **Install Command**
     - ``npm install`` (auto-detected)
   * - **Node.js Version**
     - 18.x or 20.x


Step 3: Add Environment Variables
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


Before deploying, add all environment variables from the ``Environment Variables <#environment-variables>``_ section.

Step 4: Deploy
^^^^^^^^^^^^^^


1. Click **"Deploy"**
2. Wait for the build to complete (typically 2-5 minutes)
3. Vercel provides a deployment URL like ``https://your-project.vercel.app``

Step 5: Set Up Custom Domain (Optional)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


1. Go to **Project Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions
4. Update ``NEXTAUTH_URL`` environment variable to your custom domain



Post-Deployment Verification
----------------------------


1. Check Health Endpoint
^^^^^^^^^^^^^^^^^^^^^^^^


.. code-block:: bash

   curl https://your-app.vercel.app/api/health


Expected response:
.. code-block:: json

   {
     "status": "healthy",
     "timestamp": "2024-01-15T10:30:00Z",
     "database": "connected"
   }


2. Test MongoDB Connection
^^^^^^^^^^^^^^^^^^^^^^^^^^


Visit these endpoints to verify database connectivity:

.. code-block:: bash

   # List catalogues (should return empty array initially)
   curl https://your-app.vercel.app/api/catalogues
   
   # Check if the app loads
   open https://your-app.vercel.app


3. Verify Key Features
^^^^^^^^^^^^^^^^^^^^^^


- [ ] **Homepage loads**: Visit the main URL
- [ ] **Dashboard works**: Navigate to the dashboard
- [ ] **Upload works**: Try uploading a small CSV file
- [ ] **Map renders**: Check that the Leaflet map displays

4. Check Vercel Logs
^^^^^^^^^^^^^^^^^^^^


1. Go to your Vercel project
2. Click **"Deployments"** → Latest deployment
3. Click **"Functions"** tab
4. Check for any errors in function logs



Troubleshooting
---------------


Common Issues
^^^^^^^^^^^^^


1. "MongoServerSelectionError: connection timed out"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


**Cause**: MongoDB Atlas can't be reached from Vercel.

**Solutions**:
- Verify IP whitelist includes ``0.0.0.0/0`` in Atlas Network Access
- Check the connection string format
- Ensure the cluster is running (not paused)

.. code-block:: bash

   # Test connection locally
   MONGODB_URI="your-connection-string" npx tsx -e "
     const { MongoClient } = require('mongodb');
     const client = new MongoClient(process.env.MONGODB_URI);
     client.connect().then(() => {
       console.log('✓ Connected successfully');
       client.close();
     }).catch(err => console.error('✗ Connection failed:', err.message));
   "


2. "NEXTAUTH_URL is missing"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~


**Cause**: Environment variable not set or incorrect.

**Solution**:
- Add ``NEXTAUTH_URL`` in Vercel Environment Variables
- Set it to your full production URL with ``https://``
- Redeploy after adding the variable

3. Build Fails with "Module not found"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


**Cause**: Missing dependencies or incorrect imports.

**Solutions**:
- Check that all dependencies are in ``package.json``
- Clear Vercel build cache: **Settings** → **General** → **Build Cache** → **Clear**
- Redeploy

4. "Error: MONGODB_URI is not defined"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


**Cause**: Environment variable not available at build/runtime.

**Solution**:
- Ensure ``MONGODB_URI`` is set in Vercel for the correct environment (Production/Preview)
- Check for typos in the variable name
- Redeploy after adding the variable

5. Slow Cold Starts
~~~~~~~~~~~~~~~~~~~


**Cause**: Serverless functions have cold start latency.

**Solutions**:
- Enable **Edge Functions** for static routes
- Use **Vercel's Speed Insights** to identify slow routes
- Consider **Vercel Pro** for higher function limits and regions

6. "Request Entity Too Large"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


**Cause**: File upload exceeds Vercel's limit.

**Solutions**:
- Vercel has a 4.5MB limit for serverless functions
- For larger files, use direct upload to a storage service (S3, Cloudinary)
- Or implement chunked uploads

7. Atlas Cluster Paused (M0 Free Tier)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~


**Cause**: M0 clusters pause after 60 days of inactivity.

**Solutions**:
- Resume the cluster from Atlas dashboard
- Set up a simple cron job to ping the database
- Upgrade to M10+ for production (no auto-pause)

Debug Mode
^^^^^^^^^^


Enable detailed logging by adding this environment variable:

.. code-block:: text

   DEBUG=mongodb:*


Getting Help
^^^^^^^^^^^^


- **Vercel Issues**: ``Vercel Support <https://vercel.com/support>``_
- **MongoDB Atlas**: ``Atlas Support <https://www.mongodb.com/support>``_
- **Project Issues**: Check the repository issues or create a new one



Production Checklist
--------------------


Before going live, verify:

- [ ] MongoDB Atlas cluster is appropriately sized
- [ ] All environment variables are set for Production
- [ ] Database indexes are created (run init script)
- [ ] Custom domain configured with SSL
- [ ] ``NEXTAUTH_URL`` matches production domain
- [ ] Error monitoring set up (Vercel Analytics, Sentry, etc.)
- [ ] Database backups enabled in Atlas
- [ ] Rate limiting configured (if needed)



Cost Considerations
-------------------


Vercel Pricing
^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Tier
     - API Requests
     - Build Minutes
     - Price
   * - Hobby
     - 100GB bandwidth
     - 100 hours/month
     - Free
   * - Pro
     - 1TB bandwidth
     - Unlimited
     - $20/mo
   * - Enterprise
     - Custom
     - Custom
     - Custom


MongoDB Atlas Pricing
^^^^^^^^^^^^^^^^^^^^^


.. list-table::
   :header-rows: 1
   :widths: 20 20 20 20

   * - Tier
     - Storage
     - RAM
     - Price
   * - M0 (Sandbox)
     - 512MB
     - Shared
     - Free
   * - M10
     - 10GB
     - 2GB
     - ~$57/mo
   * - M20
     - 20GB
     - 4GB
     - ~$138/mo


**Recommendation**: Start with free tiers, upgrade as needed based on usage.



*Last Updated: January 2025*
