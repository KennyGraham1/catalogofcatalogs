QC Visualization Implementation for Merge Operations
====================================================


Summary
-------


Implemented a comprehensive Quality Control (QC) visualization feature for earthquake catalogue merge operations. Users can now preview and validate duplicate event groups BEFORE committing the merge to the database.



✅ **What Was Implemented**
--------------------------


**1. Backend: Preview API Endpoint**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File:** ``app/api/merge/preview/route.ts``

- **Endpoint:** ``POST /api/merge/preview``
- **Purpose:** Performs a "dry run" merge without saving to database
- **Returns:** Duplicate groups with metadata for QC visualization

**2. Backend: Preview Merge Function**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File:** ``lib/merge.ts`` (added ~220 lines)

**New Functions:**
- ``previewMerge()`` - Main preview function that returns duplicate groups
- ``performMergeWithGroups()`` - Modified merge algorithm that tracks duplicate groups

**Returns:**
.. code-block:: typescript

   {
     duplicateGroups: Array<{
       id: string;
       events: EventData[];
       selectedEventIndex: number;  // Which event will be selected
       isSuspicious: boolean;        // Failed validation
       validationWarnings: string[]; // Specific warnings
     }>,
     statistics: {
       totalEventsBefore: number;
       totalEventsAfter: number;
       duplicateGroupsCount: number;
       duplicatesRemoved: number;
       suspiciousGroupsCount: number;
     },
     catalogueColors: Record<string, string>; // Color mapping for visualization
   }


**3. Frontend: Duplicate Group Card Component**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File:** ``components/merge/DuplicateGroupCard.tsx``

**Features:**
- Displays each duplicate group (duplicate/triplicate/quadruplicate)
- Shows max time difference, distance, and magnitude range
- Expandable table with side-by-side comparison of all events
- Highlights selected event (based on merge strategy)
- Shows validation warnings for suspicious matches
- "View on Map" button to visualize geographic locations

**Data Shown:**
- Source catalogue (with color coding)
- Time (with time difference from reference event)
- Latitude/Longitude
- Depth (with uncertainty if available)
- Magnitude (with type: Mw, Ms, mb, ML)
- Station count
- Azimuthal gap
- Selected indicator (✓ for the event that will be kept)

**4. Frontend: Map Visualization Component**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File:** ``components/merge/DuplicateGroupMap.tsx``

**Features:**
- Interactive Leaflet map showing all events in a duplicate group
- Color-coded markers matching source catalogues
- Numbered markers (1, 2, 3...) for each event
- Larger marker for the selected event
- Dashed lines connecting duplicate events
- Popup with event details on marker click
- Auto-zoom to fit all events in the group

**5. Frontend: Main QC Preview Component**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File:** ``components/merge/MergePreviewQC.tsx``

**Features:**

**Statistics Summary:**
- Events Before/After merge
- Duplicate groups found
- Duplicates removed
- Suspicious matches count
- Color-coded cards (blue, green, purple, orange, red)

**Alerts:**
- ⚠️ Warning alert if suspicious matches detected
- ✓ Success alert if all matches look good

**Filter Tabs:**
- **Duplicates** - Show only groups with 2+ events
- **Suspicious** - Show only groups with validation warnings
- **All** - Show all groups (including singletons)

**Duplicate Groups List:**
- Scrollable list of all duplicate groups
- Each group shows as a DuplicateGroupCard
- Click "View on Map" to see geographic visualization

**Action Buttons:**
- "Back to Configuration" - Return to merge config
- "Proceed with Merge" - Continue with actual merge operation

**6. Frontend: Integration with Merge Page**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^


**File:** ``app/merge/page.tsx`` (modified)

**Changes:**
- Added ``previewData`` state to store preview results
- Added ``isLoadingPreview`` state for loading indicator
- Added ``handleGeneratePreview()`` function to call preview API
- Modified "Preview Merge" tab to show:
  - **Before preview:** Merge summary + "Generate QC Preview" button
  - **After preview:** Full QC visualization with MergePreviewQC component
- Preview data is cleared when user goes back to configuration



🎯 **User Workflow**
-------------------

.. mermaid::
   :align: center

   %%{init: {"theme":"base","themeVariables":{"fontFamily":"Inter, \"Helvetica Neue\", Arial, sans-serif","fontSize":"15px","lineColor":"#3A4753","primaryColor":"#D6E4F5","primaryBorderColor":"#1B5FA8","primaryTextColor":"#0B2B4A","secondaryColor":"#CFEAE6","tertiaryColor":"#FBEAD2","mainBkg":"#D6E4F5","nodeBorder":"#1B5FA8","clusterBkg":"#F7F9FC","clusterBorder":"#AEBED2","titleColor":"#0F3D6B","edgeLabelBackground":"#FFFFFF"}}}%%
   flowchart TD
       BeginNode(["Start"]):::terminal
       Select("1. Select Catalogues"):::userAction
       Config("2. Configure Merge (Thresholds &amp; Strategy)"):::userAction
       Preview[["3. Generate QC Preview (dry-run merge)"]]:::backend
       Compute[/"Detect duplicate groups &amp; validate"/]:::process
       Review("4. Review Duplicate Groups (Map &amp; Warnings)"):::userAction
       Good{"Satisfied?"}:::decision
       Adjust("Adjust Configuration"):::userAction
       Proceed("5. Proceed with Merge"):::userAction
       Execute[["6. Execute Merge &amp; Save"]]:::backend
       Saved[("catalogues")]:::datastore
       EndNode(["Done"]):::terminal

       BeginNode --> Select
       Select --> Config
       Config --> Preview
       Preview --> Compute
       Compute --> Review
       Review --> Good
       Good -- "no" --> Adjust
       Adjust --> Preview
       Good -- "yes" --> Proceed
       Proceed --> Execute
       Execute --> Saved
       Saved --> EndNode

       classDef userAction fill:#E8EEF6,stroke:#0F3D6B,stroke-width:1.5px,color:#0B2B4A
       classDef frontend fill:#D6E4F5,stroke:#1B5FA8,stroke-width:1.5px,color:#0B2B4A
       classDef backend fill:#CFEAE6,stroke:#0E7C72,stroke-width:1.5px,color:#08423D
       classDef library fill:#FBEAD2,stroke:#9C6A12,stroke-width:1.5px,color:#5A3D06
       classDef datastore fill:#E3E7EB,stroke:#3A4753,stroke-width:1.5px,color:#1E2731
       classDef external fill:#EFDDEC,stroke:#8E3A82,stroke-width:1.5px,color:#4A1C43,stroke-dasharray:4 3
       classDef process fill:#FCEAD0,stroke:#D38B1E,stroke-width:1.5px,color:#5A3D06
       classDef decision fill:#FFF3CC,stroke:#B8860B,stroke-width:1.5px,color:#5A4500
       classDef success fill:#D5EFE0,stroke:#1B8A5A,stroke-width:1.5px,color:#0B3D27
       classDef warning fill:#FBE0DA,stroke:#C24A2B,stroke-width:1.5px,color:#5E1C0C
       classDef terminal fill:#1F2D3D,stroke:#0B1622,stroke-width:1.5px,color:#FFFFFF


**Step 1: Select Catalogues**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- User selects 2+ catalogues to merge

**Step 2: Configure Merge**
^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Set time threshold, distance threshold
- Choose merge strategy (quality, priority, average, newest, complete)
- Configure metadata

**Step 3: Preview Merge (NEW!)**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Click "Generate QC Preview" button
- System performs dry-run merge
- Shows statistics and duplicate groups

**Step 4: Review Duplicate Groups**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- View all duplicate/triplicate/quadruplicate groups
- Expand groups to see side-by-side comparison
- Click "View on Map" to see geographic visualization
- Review validation warnings for suspicious matches

**Step 5: Proceed or Adjust**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- If satisfied: Click "Proceed with Merge"
- If not satisfied: Click "Back to Configuration" and adjust thresholds/strategy

**Step 6: Execute Merge**
^^^^^^^^^^^^^^^^^^^^^^^^^

- Actual merge operation runs
- Data saved to database or exported



📊 **Validation Warnings**
-------------------------


The system automatically detects suspicious matches:

**Magnitude Inconsistency**
^^^^^^^^^^^^^^^^^^^^^^^^^^^

- **Trigger:** Magnitude range > 1.0 units
- **Warning:** "Large magnitude range: X.XX units"
- **Example:** M4.2 matched with M6.5 (probably wrong)

**Depth Inconsistency**
^^^^^^^^^^^^^^^^^^^^^^^

- **Trigger:** Depth range > 100-200 km (depending on max depth)
- **Warning:** "Large depth range: XXX.X km"
- **Example:** 10 km depth matched with 300 km depth (probably wrong)



🎨 **Visual Features**
---------------------


**Color Coding**
^^^^^^^^^^^^^^^^

- Each source catalogue gets a unique color (red, blue, green, orange, purple, pink)
- Colors are consistent across cards and maps
- Helps quickly identify which events come from which catalogue

**Badges**
^^^^^^^^^^

- **Duplicate** (blue) - 2 events matched
- **Triplicate** (gray) - 3 events matched
- **4× Match** (red) - 4+ events matched
- **Suspicious** (orange) - Validation warnings

**Statistics Cards**
^^^^^^^^^^^^^^^^^^^^

- **Blue:** Events Before
- **Green:** Events After
- **Purple:** Duplicate Groups
- **Orange:** Duplicates Removed
- **Red:** Suspicious Matches



🔍 **Example Use Cases**
-----------------------


**Use Case 1: Verify Adaptive Thresholds**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Generate preview with default thresholds
- Check if small events (M<4.0) are matched within ~25 km
- Check if large events (M>7.0) are matched within ~200 km
- Verify deep events (>300 km) get larger distance thresholds

**Use Case 2: Detect Bad Matches**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Look for suspicious groups with validation warnings
- Review magnitude and depth inconsistencies
- Adjust thresholds if too many bad matches

**Use Case 3: Compare Merge Strategies**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Generate preview with "quality" strategy
- Check which events are selected (highest quality scores)
- Compare with "priority" or "average" strategies
- Choose best strategy for your use case

**Use Case 4: Pacific Region Events**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Verify events near International Date Line (±180°) are matched correctly
- Check map visualization shows correct geographic clustering
- Ensure no false negatives due to longitude wrapping



📁 **Files Created/Modified**
----------------------------


**Created:**
^^^^^^^^^^^^

1. ``app/api/merge/preview/route.ts`` - Preview API endpoint
2. ``components/merge/DuplicateGroupCard.tsx`` - Duplicate group card component
3. ``components/merge/DuplicateGroupMap.tsx`` - Map visualization component
4. ``components/merge/MergePreviewQC.tsx`` - Main QC preview component
5. ``QC_VISUALIZATION_IMPLEMENTATION.md`` - This documentation

**Modified:**
^^^^^^^^^^^^^

1. ``lib/merge.ts`` - Added ``previewMerge()`` and ``performMergeWithGroups()`` functions
2. ``app/merge/page.tsx`` - Integrated QC preview into merge workflow



🚀 **How to Test**
-----------------


1. **Start the app:** http://localhost:3002/merge
2. **Select catalogues:** Choose 2+ catalogues (e.g., GeoNet + GNS)
3. **Configure merge:** Set thresholds and strategy
4. **Go to Preview tab**
5. **Click "Generate QC Preview"**
6. **Review results:**
   - Check statistics
   - Expand duplicate groups
   - View events on map
   - Look for suspicious matches
7. **Proceed or adjust:** Either continue with merge or go back to adjust settings



✅ **Benefits**
--------------


- ✅ **Confidence:** See exactly what will be merged before committing
- ✅ **Transparency:** Understand how adaptive thresholds work
- ✅ **Quality Control:** Catch bad matches before they corrupt your data
- ✅ **Education:** Learn how different merge strategies behave
- ✅ **Debugging:** Identify issues with thresholds or matching logic
- ✅ **Documentation:** Visual proof of merge quality for reports



🎉 **Result**
------------


Users can now perform comprehensive QC on merge operations before committing to the database, ensuring high-quality merged catalogues!



📸 **Visual Workflow**
---------------------


**Before Preview:**
^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   ┌─────────────────────────────────────────────────────────┐
   │ Preview Merge Tab                                       │
   ├─────────────────────────────────────────────────────────┤
   │                                                         │
   │ Merge Summary                                           │
   │ ├─ Merged Catalogue Name: "Merged NZ Catalogue"        │
   │ ├─ Estimated Events: 12,450                            │
   │ ├─ Selected Catalogues: 2                              │
   │ ├─ Merge Strategy: quality                             │
   │ ├─ Time Threshold: 60 seconds                          │
   │ └─ Distance Threshold: 10 km                           │
   │                                                         │
   │ Catalogues to be Merged                                │
   │ ├─ GeoNet Catalogue (8,234 events)                     │
   │ └─ GNS Catalogue (5,123 events)                        │
   │                                                         │
   │ ┌─────────────────────────────────────────────────┐   │
   │ │ 🔍 Quality Control Preview                      │   │
   │ │                                                 │   │
   │ │ Generate a preview to review duplicate groups   │   │
   │ │ and validate the merge before committing.       │   │
   │ │                                                 │   │
   │ │        [ Generate QC Preview ]                  │   │
   │ └─────────────────────────────────────────────────┘   │
   │                                                         │
   └─────────────────────────────────────────────────────────┘


**After Preview:**
^^^^^^^^^^^^^^^^^^

.. code-block:: text

   ┌─────────────────────────────────────────────────────────┐
   │ Merge Preview Statistics                                │
   ├─────────────────────────────────────────────────────────┤
   │  13,357      12,450      907        907         12      │
   │  Events      Events      Duplicate  Duplicates  Suspicious│
   │  Before      After       Groups     Removed     Matches  │
   └─────────────────────────────────────────────────────────┘
   
   ┌─────────────────────────────────────────────────────────┐
   │ ⚠️  Suspicious Matches Detected                         │
   │                                                         │
   │ 12 duplicate group(s) have validation warnings.        │
   │ Review these carefully before proceeding.              │
   └─────────────────────────────────────────────────────────┘
   
   ┌─────────────────────────────────────────────────────────┐
   │ Duplicate Groups                                        │
   │                                                         │
   │ [ Duplicates (907) ] [ Suspicious (12) ] [ All (12,450) ]│
   ├─────────────────────────────────────────────────────────┤
   │                                                         │
   │ ┌─────────────────────────────────────────────────┐   │
   │ │ Group #1  [Duplicate] [Suspicious]              │   │
   │ │ Δt: 2.3s  Δd: 5.2 km  ΔM: 0.15                  │   │
   │ │                                                 │   │
   │ │ ⚠️  Validation Warnings:                        │   │
   │ │ • Large magnitude range: 1.2 units              │   │
   │ │                                                 │   │
   │ │ [ View on Map ] [ ▼ ]                           │   │
   │ └─────────────────────────────────────────────────┘   │
   │                                                         │
   │ ┌─────────────────────────────────────────────────┐   │
   │ │ Group #2  [Triplicate]                          │   │
   │ │ Δt: 1.8s  Δd: 3.1 km  ΔM: 0.08                  │   │
   │ │                                                 │   │
   │ │ [ View on Map ] [ ▼ ]                           │   │
   │ └─────────────────────────────────────────────────┘   │
   │                                                         │
   │ ...                                                     │
   │                                                         │
   └─────────────────────────────────────────────────────────┘
   
   [ Back to Configuration ]              [ Proceed with Merge ]


**Expanded Duplicate Group:**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: text

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Group #1  [Duplicate] [Suspicious]                                      │
   │ Δt: 2.3s  Δd: 5.2 km  ΔM: 0.15                                          │
   │                                                                         │
   │ ⚠️  Validation Warnings:                                                │
   │ • Large magnitude range: 1.2 units                                      │
   │                                                                         │
   │ [ View on Map ] [ ▲ ]                                                   │
   ├─────────────────────────────────────────────────────────────────────────┤
   │ Source      Time                Lat      Lon      Depth  Mag   Stations │
   │ ─────────────────────────────────────────────────────────────────────── │
   │ 🔴 GeoNet   2024-01-15 10:23:45 -41.2345 174.5678 25.3   5.2Mw  45  ✓  │
   │ 🔵 GNS      2024-01-15 10:23:47 -41.2389 174.5712 26.1   4.8mb  32      │
   │             +2.3s                                  5.2km                │
   └─────────────────────────────────────────────────────────────────────────┘


**Map View:**
^^^^^^^^^^^^^

.. code-block:: text

   ┌─────────────────────────────────────────────────────────┐
   │ Map View - Group #1                      [ Close Map ]  │
   ├─────────────────────────────────────────────────────────┤
   │                                                         │
   │                    🗺️  Interactive Map                  │
   │                                                         │
   │              ┌─────────────────────┐                    │
   │              │  🔴 1  (GeoNet)     │                    │
   │              │  ├─────────┐        │                    │
   │              │  │ 5.2 km  │        │                    │
   │              │  └─────────┘        │                    │
   │              │         🔵 2 (GNS)  │                    │
   │              └─────────────────────┘                    │
   │                                                         │
   │  Markers are color-coded by source catalogue           │
   │  Dashed lines connect duplicate events                 │
   │  Larger marker (1) indicates selected event            │
   │                                                         │
   └─────────────────────────────────────────────────────────┘




🔧 **Technical Details**
-----------------------


**API Request:**
^^^^^^^^^^^^^^^^

.. code-block:: typescript

   POST /api/merge/preview
   {
     "sourceCatalogues": [
       { "id": 1, "name": "GeoNet", "events": 8234, "source": "GeoNet" },
       { "id": 2, "name": "GNS", "events": 5123, "source": "GNS" }
     ],
     "config": {
       "timeThreshold": 60,
       "distanceThreshold": 10,
       "mergeStrategy": "quality",
       "priority": "quality"
     }
   }


**API Response:**
^^^^^^^^^^^^^^^^^

.. code-block:: typescript

   {
     "duplicateGroups": [
       {
         "id": "group-0",
         "events": [
           {
             "id": "evt-123",
             "time": "2024-01-15T10:23:45.000Z",
             "latitude": -41.2345,
             "longitude": 174.5678,
             "depth": 25.3,
             "magnitude": 5.2,
             "magnitude_type": "Mw",
             "source": "GeoNet",
             "catalogueId": "1",
             "catalogueName": "GeoNet Catalogue",
             "used_station_count": 45,
             "azimuthal_gap": 85.2
           },
           {
             "id": "evt-456",
             "time": "2024-01-15T10:23:47.300Z",
             "latitude": -41.2389,
             "longitude": 174.5712,
             "depth": 26.1,
             "magnitude": 4.8,
             "magnitude_type": "mb",
             "source": "GNS",
             "catalogueId": "2",
             "catalogueName": "GNS Catalogue",
             "used_station_count": 32,
             "azimuthal_gap": 120.5
           }
         ],
         "selectedEventIndex": 0,
         "isSuspicious": true,
         "validationWarnings": ["Large magnitude range: 1.2 units"]
       }
     ],
     "statistics": {
       "totalEventsBefore": 13357,
       "totalEventsAfter": 12450,
       "duplicateGroupsCount": 907,
       "duplicatesRemoved": 907,
       "suspiciousGroupsCount": 12
     },
     "catalogueColors": {
       "1": "#ef4444",
       "2": "#3b82f6"
     }
   }




🎓 **Best Practices**
--------------------


1. **Always generate preview** before merging large catalogues
2. **Review suspicious matches** carefully - they may indicate incorrect thresholds
3. **Use map visualization** to verify geographic clustering makes sense
4. **Compare strategies** by generating multiple previews with different settings
5. **Document your choices** in the merge metadata form
6. **Start with conservative thresholds** (small time/distance) and increase if needed
7. **Check Pacific region events** for date line handling
8. **Verify magnitude hierarchy** is working (Mw > Ms > mb > ML)



🎉 **Final Result**
------------------


The QC visualization feature provides complete transparency into the merge operation, allowing users to:

✅ **See** exactly which events will be merged
✅ **Verify** the adaptive thresholds are working correctly
✅ **Detect** suspicious matches before they corrupt data
✅ **Compare** different merge strategies visually
✅ **Understand** how the merge algorithm makes decisions
✅ **Validate** the merge quality before committing

**The merge workflow is now production-ready with comprehensive quality control!** 🎉
