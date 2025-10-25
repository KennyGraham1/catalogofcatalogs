/**
 * Test script for GeoNet import functionality
 *
 * This script tests the GeoNet import by:
 * 1. Importing events from the last 24 hours with M4.0+
 * 2. Displaying import results
 * 3. Showing import history
 */

const { execSync } = require('child_process');

const API_BASE = 'http://localhost:3001';

function curlPost(url, data) {
  const cmd = `curl -s -X POST "${url}" -H "Content-Type: application/json" -d '${JSON.stringify(data)}'`;
  const result = execSync(cmd, { encoding: 'utf-8' });
  return JSON.parse(result);
}

function curlGet(url) {
  const cmd = `curl -s "${url}"`;
  const result = execSync(cmd, { encoding: 'utf-8' });
  return JSON.parse(result);
}

async function testImport() {
  console.log('🧪 Testing GeoNet Import Feature\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Import events from last 24 hours with M4.0+
    console.log('\n📥 Test 1: Import events from last 24 hours (M4.0+)');
    console.log('-'.repeat(60));

    const importResult = curlPost(`${API_BASE}/api/import/geonet`, {
      hours: 24,
      minMagnitude: 4.0,
      updateExisting: false,
      catalogueName: 'GeoNet - Test Import',
    });

    if (importResult.error) {
      throw new Error(`Import failed: ${importResult.message || importResult.error}`);
    }

    console.log('\n✅ Import completed successfully!');
    console.log(`   Catalogue: ${importResult.catalogueName} (${importResult.catalogueId})`);
    console.log(`   Total Fetched: ${importResult.totalFetched}`);
    console.log(`   New Events: ${importResult.newEvents}`);
    console.log(`   Updated Events: ${importResult.updatedEvents}`);
    console.log(`   Skipped Events: ${importResult.skippedEvents}`);
    console.log(`   Duration: ${(importResult.duration / 1000).toFixed(2)}s`);
    
    if (importResult.errors.length > 0) {
      console.log(`\n⚠️  Errors (${importResult.errors.length}):`);
      importResult.errors.slice(0, 5).forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`);
      });
      if (importResult.errors.length > 5) {
        console.log(`   ... and ${importResult.errors.length - 5} more`);
      }
    }
    
    // Test 2: Fetch import history
    console.log('\n📜 Test 2: Fetch import history');
    console.log('-'.repeat(60));

    const history = curlGet(
      `${API_BASE}/api/import/history?catalogueId=${importResult.catalogueId}&limit=5`
    );

    if (history.error) {
      throw new Error(`Failed to fetch history: ${history.message || history.error}`);
    }
    
    console.log(`\n✅ Found ${history.length} import record(s):`);
    history.forEach((record, i) => {
      const errors = record.errors ? JSON.parse(record.errors) : [];
      console.log(`\n   ${i + 1}. Import at ${new Date(record.created_at).toLocaleString()}`);
      console.log(`      Fetched: ${record.total_fetched}, New: ${record.new_events}, Updated: ${record.updated_events}, Skipped: ${record.skipped_events}`);
      if (errors.length > 0) {
        console.log(`      Errors: ${errors.length}`);
      }
    });
    
    // Test 3: Verify events were imported
    console.log('\n📊 Test 3: Verify events in catalogue');
    console.log('-'.repeat(60));

    const events = curlGet(
      `${API_BASE}/api/catalogues/${importResult.catalogueId}/events`
    );

    if (events.error) {
      throw new Error(`Failed to fetch events: ${events.message || events.error}`);
    }
    
    console.log(`\n✅ Found ${events.length} event(s) in catalogue:`);
    events.slice(0, 5).forEach((event, i) => {
      console.log(`\n   ${i + 1}. ${event.source_id || event.id}`);
      console.log(`      Time: ${new Date(event.time).toLocaleString()}`);
      console.log(`      Location: ${event.latitude.toFixed(4)}°, ${event.longitude.toFixed(4)}°`);
      console.log(`      Depth: ${event.depth ? event.depth.toFixed(1) + ' km' : 'N/A'}`);
      console.log(`      Magnitude: ${event.magnitude.toFixed(1)} ${event.magnitude_type || ''}`);
      if (event.event_type) {
        console.log(`      Type: ${event.event_type}`);
      }
    });
    
    if (events.length > 5) {
      console.log(`\n   ... and ${events.length - 5} more events`);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 All tests passed!');
    console.log('='.repeat(60));
    console.log('\n✅ GeoNet import feature is working correctly!');
    console.log(`\n📍 View the import page at: ${API_BASE}/import`);
    console.log(`📍 View the catalogue at: ${API_BASE}/catalogues`);
    console.log(`📍 View the map at: ${API_BASE}/catalogues/${importResult.catalogueId}/map\n`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testImport();

