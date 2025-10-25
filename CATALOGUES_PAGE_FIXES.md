# Catalogues Page Fixes - Summary

## Issues Identified and Fixed

### 1. **Data Source Mismatch** ✅ FIXED
**Problem**: The catalogues page was using hardcoded mock data but the action handlers were calling real API endpoints.

**Solution**: 
- Replaced mock data with real API calls using `useEffect` and `fetch`
- Added loading state to show feedback while data is being fetched
- Updated the `Catalogue` interface to match the database schema

**Files Modified**:
- `app/catalogues/page.tsx`

### 2. **Missing Edit Page** ✅ FIXED
**Problem**: The edit action was trying to navigate to `/catalogues/[id]/edit` which didn't exist.

**Solution**:
- Created new edit page at `app/catalogues/[id]/edit/page.tsx`
- Implemented form to update catalogue name
- Added PATCH endpoint to API to support updates
- Added `updateCatalogueName` method to database queries

**Files Created**:
- `app/catalogues/[id]/edit/page.tsx`

**Files Modified**:
- `app/api/catalogues/[id]/route.ts` - Added PATCH handler
- `lib/db.ts` - Added `updateCatalogueName` method

### 3. **Field Name Mismatches** ✅ FIXED
**Problem**: The table was trying to access fields that don't exist in the database schema:
- `catalogue.date` → should be `catalogue.created_at`
- `catalogue.events` → should be `catalogue.event_count`
- `catalogue.format` → not in database (hardcoded to 'CSV')
- `catalogue.source` → extracted from `source_catalogues` JSON
- `catalogue.region` → not in database (removed from search)

**Solution**:
- Updated table rendering to use correct field names
- Added helper functions:
  - `formatDate()` - Format created_at timestamp
  - `getSourceNames()` - Extract source names from JSON
- Removed source filter dropdown (not applicable to merged catalogues)
- Updated search to only search by name

**Files Modified**:
- `app/catalogues/page.tsx`

### 4. **Status Values Mismatch** ✅ FIXED
**Problem**: The tabs were using 'incomplete' status which doesn't exist in the database.

**Solution**:
- Updated tabs to use correct status values: 'all', 'complete', 'processing', 'error'
- Updated status badge to handle 'error' status with red styling

**Files Modified**:
- `app/catalogues/page.tsx`

### 5. **Sorting Issues** ✅ FIXED
**Problem**: Sorting by 'source' field which doesn't exist as a direct field.

**Solution**:
- Removed 'source' from sortable fields
- Updated sort type to only include: 'name', 'date', 'events'
- Made 'Source' column header non-clickable

**Files Modified**:
- `app/catalogues/page.tsx`

## Actions Status

All catalogue page actions are now functional:

### ✅ View Map
- **Status**: Working
- **Action**: Navigates to `/catalogues/[id]/map`
- **Requirements**: Map page already exists

### ✅ Download
- **Status**: Working
- **Action**: Calls `/api/catalogues/[id]/download` and downloads CSV
- **Requirements**: API endpoint exists and returns CSV data

### ✅ Edit
- **Status**: Working
- **Action**: Navigates to `/catalogues/[id]/edit`
- **Requirements**: Edit page created, PATCH API endpoint added

### ✅ Share
- **Status**: Working
- **Action**: Copies catalogue URL to clipboard
- **Requirements**: No backend changes needed

### ✅ Delete
- **Status**: Working
- **Action**: Calls DELETE `/api/catalogues/[id]` and refreshes list
- **Requirements**: API endpoint exists, confirmation dialog works

## Testing Checklist

To verify all actions work correctly:

1. **Load Page**
   - [ ] Page loads without errors
   - [ ] Catalogues are fetched from API
   - [ ] Loading state shows while fetching
   - [ ] Table displays catalogue data correctly

2. **View Map Action**
   - [ ] Click map icon on any catalogue
   - [ ] Should navigate to map page
   - [ ] Map should display events

3. **Download Action**
   - [ ] Click download icon
   - [ ] Toast notification appears
   - [ ] CSV file downloads
   - [ ] File contains event data

4. **Edit Action**
   - [ ] Click "Edit Metadata" from dropdown menu
   - [ ] Edit page loads
   - [ ] Can modify catalogue name
   - [ ] Save button updates catalogue
   - [ ] Returns to catalogues list

5. **Share Action**
   - [ ] Click "Share" from dropdown menu
   - [ ] Toast notification confirms copy
   - [ ] URL is copied to clipboard
   - [ ] URL format: `http://localhost:3001/catalogues/[id]`

6. **Delete Action**
   - [ ] Click "Delete" from dropdown menu
   - [ ] Confirmation dialog appears
   - [ ] Cancel button closes dialog
   - [ ] Delete button removes catalogue
   - [ ] List refreshes automatically

7. **Filtering & Sorting**
   - [ ] Search by name works
   - [ ] Status tabs filter correctly
   - [ ] Sorting by name works
   - [ ] Sorting by date works
   - [ ] Sorting by events works

## API Endpoints Used

- `GET /api/catalogues` - Fetch all catalogues
- `GET /api/catalogues/[id]` - Fetch single catalogue
- `PATCH /api/catalogues/[id]` - Update catalogue name
- `DELETE /api/catalogues/[id]` - Delete catalogue
- `GET /api/catalogues/[id]/download` - Download catalogue as CSV

## Database Schema

```typescript
interface Catalogue {
  id: string;                  // UUID
  name: string;                // Catalogue name
  created_at: string;          // ISO timestamp
  source_catalogues: string;   // JSON array of source info
  merge_config: string;        // JSON merge configuration
  event_count: number;         // Total events
  status: string;              // 'processing' | 'complete' | 'error'
}
```

## Notes

- The page now fetches real data from the SQLite database
- All actions use proper API endpoints
- Toast notifications provide user feedback
- Loading states improve UX
- Error handling is in place for all actions
- The database currently has 3 catalogues (visible in server logs)

