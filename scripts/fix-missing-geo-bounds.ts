/**
 * Script to fix missing geographic bounds for catalogues
 * 
 * This script:
 * 1. Finds all catalogues that have events but no geographic bounds
 * 2. Calculates bounds from their events
 * 3. Updates the catalogue records with the calculated bounds
 */

import { dbQueries } from '../lib/db';
import { extractBoundsFromMergedEvents } from '../lib/geo-bounds-utils';

async function fixMissingGeoBounds() {
  console.log('Starting geographic bounds fix...\n');

  try {
    // Get all catalogues
    const catalogues = await dbQueries.getCatalogues();
    const catalogueList = Array.isArray(catalogues) ? catalogues : catalogues.data;

    console.log(`Found ${catalogueList.length} total catalogues\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const catalogue of catalogueList) {
      const hasAllBounds = 
        catalogue.min_latitude !== null &&
        catalogue.max_latitude !== null &&
        catalogue.min_longitude !== null &&
        catalogue.max_longitude !== null;

      if (hasAllBounds) {
        console.log(`✓ ${catalogue.name}: Already has bounds`);
        skipped++;
        continue;
      }

      // Get events for this catalogue
      const events = await dbQueries.getEventsByCatalogueId(catalogue.id);
      const eventList = Array.isArray(events) ? events : events.data;

      if (eventList.length === 0) {
        console.log(`⊘ ${catalogue.name}: No events, skipping`);
        skipped++;
        continue;
      }

      // Calculate bounds
      const bounds = extractBoundsFromMergedEvents(eventList);

      if (!bounds) {
        console.log(`✗ ${catalogue.name}: Failed to calculate bounds (${eventList.length} events)`);
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
        console.log(`  Events: ${eventList.length}`);
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

// Run the script
fixMissingGeoBounds()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

