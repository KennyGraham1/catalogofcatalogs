/**
 * Script to fix incorrect event counts for catalogues
 *
 * This script:
 * 1. Finds all catalogues where event_count doesn't match actual events
 * 2. Counts the actual events in the database
 * 3. Updates the catalogue records with the correct count
 *
 * This is needed because the GeoNet import service was not updating
 * the event_count after importing events.
 */

import { dbQueries } from '../lib/db';

export async function fixCatalogueEventCounts() {
  console.log('Starting catalogue event count fix...\n');

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
    let correct = 0;
    let errors = 0;

    for (const catalogue of catalogueList) {
      try {
        // Get the true event count via countDocuments. getEventsByCatalogueId's
        // unpaginated form is capped by UNPAGINATED_EVENTS_LIMIT when that
        // deployment variable is set (lib/db.ts), so using its .length here wrote
        // min(true count, cap) as event_count — which then disables the export
        // route's own truncation check (getAllEventsForExport treats
        // event_count as proof a capped read is complete once they're equal),
        // silently truncating every future export of that catalogue (gs#1). It
        // also loaded every full event document (origins, picks, arrivals JSON)
        // into memory just to discard them and keep a length.
        const actualCount = await dbQueries.countEventsByCatalogue(catalogue.id);
        const storedCount = catalogue.event_count ?? 0;

        if (actualCount === storedCount) {
          console.log(`✓ ${catalogue.name}: Count is correct (${storedCount} events)`);
          correct++;
          continue;
        }

        // Update catalogue with correct count
        await dbQueries.updateCatalogueEventCount(catalogue.id, actualCount);

        console.log(`✓ ${catalogue.name}: Fixed count`);
        console.log(`  Stored: ${storedCount} → Actual: ${actualCount}`);
        fixed++;
      } catch (error) {
        console.log(`✗ ${catalogue.name}: Error - ${error instanceof Error ? error.message : String(error)}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Summary:');
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Already correct: ${correct}`);
    console.log(`  Errors: ${errors}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script (but not when imported by a test)
if (require.main === module) {
  fixCatalogueEventCounts()
    .then(() => {
      console.log('\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}
