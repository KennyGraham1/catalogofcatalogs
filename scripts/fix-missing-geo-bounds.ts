/**
 * Script to fix missing geographic bounds for catalogues
 *
 * This script:
 * 1. Finds all catalogues that have events but no geographic bounds
 * 2. Calculates bounds from their events
 * 3. Updates the catalogue records with the calculated bounds
 */

import { dbQueries, type PaginatedResult, type MergedEvent } from '../lib/db';
import { boundsFromLatLon } from '../lib/geo-bounds-utils';

const PAGE_SIZE = 2000;

/**
 * Every event's {latitude, longitude} for a catalogue, paging past
 * UNPAGINATED_EVENTS_LIMIT explicitly. Passing PaginationParams always takes
 * getEventsByCatalogueId's explicit skip/limit branch (lib/db.ts), which uses the
 * true countDocuments total and is never subject to that cap — only the no-params
 * call is. Fetching a projected {lat, lon} pair per event (rather than the whole
 * event, as the unpaginated call would) also keeps memory bounded on large
 * catalogues.
 */
async function getAllEventCoords(catalogueId: string): Promise<Array<{ lat: number; lon: number }>> {
  const coords: Array<{ lat: number; lon: number }> = [];
  let offset = 0;

  for (;;) {
    const page = (await dbQueries!.getEventsByCatalogueId(catalogueId, {
      offset,
      pageSize: PAGE_SIZE,
    })) as PaginatedResult<MergedEvent>;

    for (const event of page.data) {
      if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
        coords.push({ lat: event.latitude, lon: event.longitude });
      }
    }

    offset += page.data.length;
    if (page.data.length === 0 || offset >= page.pagination.totalItems) break;
  }

  return coords;
}

export async function fixMissingGeoBounds() {
  console.log('Starting geographic bounds fix...\n');

  if (!dbQueries) {
    console.error('Database not available');
    process.exit(1);
  }

  try {
    // Get all catalogues
    const catalogues = await dbQueries.getCatalogues();
    const catalogueList = Array.isArray(catalogues) ? catalogues : catalogues.data;

    console.log(`Found ${catalogueList.length} total catalogues\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const catalogue of catalogueList) {
      // No writer ever stores null bounds (insertCatalogue's metadata allow-list
      // excludes them); a catalogue without bounds has the keys ABSENT, which the
      // driver returns as undefined, not null. The old `!== null` check treated
      // that as "has bounds" and skipped every catalogue this script exists to
      // fix (gs#2) — Number.isFinite catches undefined, null and any non-numeric
      // garbage alike.
      const hasAllBounds =
        Number.isFinite(catalogue.min_latitude) &&
        Number.isFinite(catalogue.max_latitude) &&
        Number.isFinite(catalogue.min_longitude) &&
        Number.isFinite(catalogue.max_longitude);

      if (hasAllBounds) {
        console.log(`✓ ${catalogue.name}: Already has bounds`);
        skipped++;
        continue;
      }

      // Coordinates for every event in the catalogue, not just the newest slice
      // an unpaginated read might be capped to.
      const coords = await getAllEventCoords(catalogue.id);

      if (coords.length === 0) {
        console.log(`⊘ ${catalogue.name}: No events, skipping`);
        skipped++;
        continue;
      }

      // Calculate bounds
      const bounds = boundsFromLatLon(coords);

      if (!bounds) {
        console.log(`✗ ${catalogue.name}: Failed to calculate bounds (${coords.length} events)`);
        errors++;
        continue;
      }

      // Update catalogue with bounds
      try {
        await dbQueries.updateCatalogueGeoBounds(
          catalogue.id,
          bounds.minLatitude,
          bounds.maxLatitude,
          bounds.minLongitude,
          bounds.maxLongitude
        );

        console.log(`✓ ${catalogue.name}: Updated bounds`);
        console.log(`  Lat: ${bounds.minLatitude.toFixed(2)} to ${bounds.maxLatitude.toFixed(2)}`);
        console.log(`  Lon: ${bounds.minLongitude.toFixed(2)} to ${bounds.maxLongitude.toFixed(2)}`);
        console.log(`  Events: ${coords.length}`);
        fixed++;
      } catch (error) {
        console.log(`✗ ${catalogue.name}: Error updating bounds - ${error instanceof Error ? error.message : String(error)}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script (but not when imported by a test)
if (require.main === module) {
  fixMissingGeoBounds()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}
