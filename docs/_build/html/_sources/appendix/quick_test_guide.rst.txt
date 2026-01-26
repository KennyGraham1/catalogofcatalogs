Quick Test Guide - Earthquake Catalogue Fixes
=============================================


🎯 What Was Fixed
----------------


1. **Geographic Filter** - Now correctly filters events by latitude/longitude bounds
2. **Focal Mechanisms** - Beach ball diagrams now display correctly for M ≥ 5.0 events

📊 Test Data Available
---------------------


- **3 catalogues** with 1,000 events each
- **296 events** with focal mechanisms (M ≥ 5.0)
- **3 different regions**: New Zealand, California, Japan

🚀 Quick Test Steps
------------------


1. View Catalogues
^^^^^^^^^^^^^^^^^^


.. code-block:: text

   http://localhost:3000/catalogues


Look for:
- New Zealand Seismic Events 2024
- California Seismic Events 2024
- Japan Seismic Events 2024

2. Test Geographic Filtering
^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**New Zealand - North Island:**
.. code-block:: bash

   curl "http://localhost:3000/api/catalogues/1935d106-6271-4d1b-b5e4-f33d37fe5100/events/filtered?minLatitude=-42.0&maxLatitude=-34.0&minLongitude=166.0&maxLongitude=179.0"


**California - Southern California:**
.. code-block:: bash

   curl "http://localhost:3000/api/catalogues/e4ad0871-a6ff-45a3-8b9d-266426e782e8/events/filtered?minLatitude=32.5&maxLatitude=36.0&minLongitude=-121.0&maxLongitude=-114.0"


**Japan - Honshu Island:**
.. code-block:: bash

   curl "http://localhost:3000/api/catalogues/a98800b3-b424-4598-9f3c-2729c6619637/events/filtered?minLatitude=35.0&maxLatitude=41.0&minLongitude=138.0&maxLongitude=142.0"


3. Test Focal Mechanisms
^^^^^^^^^^^^^^^^^^^^^^^^


1. Click on any test catalogue
2. Go to map view
3. Filter for magnitude ≥ 5.0
4. Look for beach ball diagrams on the map
5. Click on a beach ball to see fault plane details

**Expected Results:**
- New Zealand & Japan: Thrust faulting (compressional quadrants)
- California: Strike-slip faulting (different pattern)

📁 Catalogue IDs
---------------


.. code-block:: text

   New Zealand:  1935d106-6271-4d1b-b5e4-f33d37fe5100
   California:   e4ad0871-a6ff-45a3-8b9d-266426e782e8
   Japan:        a98800b3-b424-4598-9f3c-2729c6619637


🔍 Verification Queries
----------------------


Count events by region:
^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: sql

   SELECT name, event_count 
   FROM merged_catalogues 
   WHERE name LIKE '%2024%';


Count events with focal mechanisms:
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: sql

   SELECT COUNT(*) 
   FROM merged_events 
   WHERE focal_mechanisms IS NOT NULL 
     AND source_id LIKE '%2024%';


View a focal mechanism:
^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: sql

   SELECT magnitude, focal_mechanisms 
   FROM merged_events 
   WHERE focal_mechanisms IS NOT NULL 
     AND source_id LIKE 'new_zealand_2024%' 
   LIMIT 1;


✅ Success Criteria
------------------


- [ ] Geographic filtering returns only events within specified bounds
- [ ] Beach ball diagrams appear for M ≥ 5.0 events
- [ ] Different regions show appropriate fault types
- [ ] Clicking beach balls shows fault plane details
- [ ] All 3,000 events are accessible

🔄 Re-import Data
----------------


If needed:
.. code-block:: bash

   python3 scripts/import_test_catalogues_db.py


🗑️ Clean Up
-----------


To remove test catalogues:
.. code-block:: sql

   DELETE FROM merged_catalogues WHERE name LIKE '%2024%';




**Ready to test!** 🎉
