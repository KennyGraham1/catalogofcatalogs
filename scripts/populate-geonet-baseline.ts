/**
 * Populate GeoNet Baseline Catalogue
 * 
 * This script imports real earthquake data from the GeoNet API to create
 * a baseline/reference catalogue with actual recorded NZ earthquake data.
 */

import { geonetImportService } from '../lib/geonet-import-service';

async function populateGeoNetBaseline() {
  console.log('🌏 Populating GeoNet Baseline Catalogue');
  console.log('='.repeat(70));
  console.log('');

  try {
    // Import events from the last 30 days with magnitude 3.0+
    // This provides a good baseline of recent significant NZ seismic activity
    console.log('📥 Importing real earthquake data from GeoNet API...');
    console.log('   Time range: Last 30 days');
    console.log('   Minimum magnitude: 3.0');
    console.log('   Region: New Zealand');
    console.log('');

    const result = await geonetImportService.importEvents({
      hours: 30 * 24, // Last 30 days
      minMagnitude: 3.0,
      updateExisting: false,
      catalogueName: 'GeoNet - Real Data (Baseline)',
    });

    console.log('='.repeat(70));
    
    if (result.success) {
      console.log('✅ GeoNet baseline catalogue created successfully!');
    } else {
      console.log('⚠️  GeoNet baseline catalogue created with some errors');
    }
    
    console.log('='.repeat(70));
    console.log('');
    console.log('📊 Import Summary:');
    console.log(`   Catalogue ID: ${result.catalogueId}`);
    console.log(`   Catalogue Name: ${result.catalogueName}`);
    console.log(`   Total events fetched: ${result.totalFetched}`);
    console.log(`   New events added: ${result.newEvents}`);
    console.log(`   Events updated: ${result.updatedEvents}`);
    console.log(`   Events skipped: ${result.skippedEvents}`);
    console.log(`   Duration: ${(result.duration / 1000).toFixed(2)}s`);
    
    if (result.errors.length > 0) {
      console.log('');
      console.log('⚠️  Errors encountered:');
      result.errors.forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error}`);
      });
    }
    
    console.log('');
    console.log('ℹ️  Note: This catalogue contains real earthquake data from GeoNet');
    console.log('   and serves as a baseline/reference for New Zealand seismic activity.');
    console.log('');
    console.log('🔄 To update this catalogue with new data, visit:');
    console.log('   http://localhost:3000/import');
    console.log('');

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('');
    console.error('❌ Failed to populate GeoNet baseline catalogue');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('');
    console.error('This is not critical - you can manually import GeoNet data later');
    console.error('by visiting: http://localhost:3000/import');
    console.error('');
    
    process.exit(1);
  }
}

// Run the population
populateGeoNetBaseline();

