/**
 * QuakeML Features Testing Script
 * Tests all QuakeML 1.2 features with populated test data
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3001';

// Helper to make HTTP requests
function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = res.headers['content-type']?.includes('application/json') 
            ? JSON.parse(data) 
            : data;
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
  
  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function runTests() {
  console.log('🧪 Starting QuakeML Features Testing\n');
  console.log('=' .repeat(60));
  console.log('\n');

  // Test 1: Fetch all catalogues
  console.log('📋 TEST 1: Fetch All Catalogues');
  console.log('-'.repeat(60));
  try {
    const response = await makeRequest('/api/catalogues');
    const catalogues = response.data;
    
    if (response.status === 200 && Array.isArray(catalogues)) {
      logTest('Fetch catalogues API', true, `Found ${catalogues.length} catalogues`);
      
      // Check if our test catalogues exist
      const testCatalogueIds = ['cat_full_quakeml', 'cat_partial_quakeml', 'cat_basic', 'cat_mixed', 'cat_high_quality'];
      const foundIds = catalogues.map(c => c.id);
      const allFound = testCatalogueIds.every(id => foundIds.includes(id));
      
      logTest('Test catalogues exist', allFound, allFound ? 'All 5 test catalogues found' : 'Some test catalogues missing');
      
      // Store catalogues for later tests
      global.testCatalogues = catalogues.filter(c => testCatalogueIds.includes(c.id));
      
      console.log('\n📊 Catalogues:');
      global.testCatalogues.forEach(cat => {
        console.log(`   - ${cat.name}: ${cat.event_count} events`);
      });
    } else {
      logTest('Fetch catalogues API', false, `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    logTest('Fetch catalogues API', false, error.message);
  }
  
  console.log('\n');

  // Test 2: QuakeML Export - Full Data
  console.log('📤 TEST 2: QuakeML Export (Full Data Catalogue)');
  console.log('-'.repeat(60));
  try {
    const fullCatalogue = global.testCatalogues.find(c => c.id === 'cat_full_quakeml');
    if (!fullCatalogue) {
      logTest('QuakeML export (full data)', false, 'Full QuakeML catalogue not found');
    } else {
      const response = await makeRequest(`/api/catalogues/${fullCatalogue.id}/export-quakeml`);
      
      if (response.status === 200 && typeof response.data === 'string') {
        const xmlData = response.data;
        
        // Check if it's valid XML
        const isXML = xmlData.startsWith('<?xml') && xmlData.includes('<q:quakeml');
        logTest('QuakeML export returns XML', isXML, isXML ? 'Valid XML structure' : 'Invalid XML');
        
        // Check for QuakeML elements
        const hasEventParameters = xmlData.includes('<eventParameters');
        const hasEvents = xmlData.includes('<event');
        const hasOrigins = xmlData.includes('<origin');
        const hasMagnitudes = xmlData.includes('<magnitude');
        
        logTest('QuakeML contains eventParameters', hasEventParameters);
        logTest('QuakeML contains events', hasEvents);
        logTest('QuakeML contains origins', hasOrigins);
        logTest('QuakeML contains magnitudes', hasMagnitudes);
        
        // Check for QuakeML 1.2 specific fields
        const hasQuality = xmlData.includes('<quality>');
        const hasUncertainty = xmlData.includes('<uncertainty>');
        const hasEvaluationMode = xmlData.includes('<evaluationMode>');
        const hasEvaluationStatus = xmlData.includes('<evaluationStatus>');
        
        logTest('QuakeML contains quality metrics', hasQuality);
        logTest('QuakeML contains uncertainties', hasUncertainty);
        logTest('QuakeML contains evaluation metadata', hasEvaluationMode && hasEvaluationStatus);
        
        // Save sample for inspection
        const samplePath = path.join(process.cwd(), 'test_export_full.xml');
        fs.writeFileSync(samplePath, xmlData);
        console.log(`   📄 Sample saved to: ${samplePath}`);
        
        // Count events in XML
        const eventMatches = xmlData.match(/<event /g);
        const eventCount = eventMatches ? eventMatches.length : 0;
        console.log(`   📊 Exported ${eventCount} events`);
        
      } else {
        logTest('QuakeML export (full data)', false, `Unexpected response: ${response.status}`);
      }
    }
  } catch (error) {
    logTest('QuakeML export (full data)', false, error.message);
  }
  
  console.log('\n');

  // Test 3: QuakeML Export - Mixed Data
  console.log('📤 TEST 3: QuakeML Export (Mixed Data Catalogue)');
  console.log('-'.repeat(60));
  try {
    const mixedCatalogue = global.testCatalogues.find(c => c.id === 'cat_mixed');
    if (!mixedCatalogue) {
      logTest('QuakeML export (mixed data)', false, 'Mixed catalogue not found');
    } else {
      const response = await makeRequest(`/api/catalogues/${mixedCatalogue.id}/export-quakeml`);
      
      if (response.status === 200 && typeof response.data === 'string') {
        const xmlData = response.data;
        
        logTest('QuakeML export (mixed data)', true, 'Export successful');
        
        // Save sample
        const samplePath = path.join(process.cwd(), 'test_export_mixed.xml');
        fs.writeFileSync(samplePath, xmlData);
        console.log(`   📄 Sample saved to: ${samplePath}`);
        
        // Check that it handles missing fields gracefully
        const hasBasicFields = xmlData.includes('<time>') && xmlData.includes('<latitude>') && xmlData.includes('<magnitude>');
        logTest('Mixed export contains basic fields', hasBasicFields);
        
      } else {
        logTest('QuakeML export (mixed data)', false, `Unexpected response: ${response.status}`);
      }
    }
  } catch (error) {
    logTest('QuakeML export (mixed data)', false, error.message);
  }
  
  console.log('\n');

  // Test 4: Quality Filtering - Magnitude Range
  console.log('🔍 TEST 4: Quality Filtering (Magnitude Range)');
  console.log('-'.repeat(60));
  try {
    const catalogue = global.testCatalogues[0];
    const response = await makeRequest(`/api/catalogues/${catalogue.id}/events/filtered?minMagnitude=4.0&maxMagnitude=6.0`);
    
    if (response.status === 200 && response.data.success) {
      const events = response.data.events;
      const allInRange = events.every(e => e.magnitude >= 4.0 && e.magnitude <= 6.0);
      
      logTest('Magnitude range filtering', allInRange, `${events.length} events in range [4.0, 6.0]`);
    } else {
      logTest('Magnitude range filtering', false, `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    logTest('Magnitude range filtering', false, error.message);
  }
  
  console.log('\n');

  // Test 5: Quality Filtering - Event Type
  console.log('🔍 TEST 5: Quality Filtering (Event Type)');
  console.log('-'.repeat(60));
  try {
    const fullCatalogue = global.testCatalogues.find(c => c.id === 'cat_full_quakeml');
    const response = await makeRequest(`/api/catalogues/${fullCatalogue.id}/events/filtered?eventType=earthquake`);
    
    if (response.status === 200 && response.data.success) {
      const events = response.data.events;
      const allEarthquakes = events.every(e => e.event_type === 'earthquake');
      
      logTest('Event type filtering', allEarthquakes, `${events.length} earthquake events`);
    } else {
      logTest('Event type filtering', false, `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    logTest('Event type filtering', false, error.message);
  }
  
  console.log('\n');

  // Test 6: Quality Filtering - Quality Metrics
  console.log('🔍 TEST 6: Quality Filtering (Quality Metrics)');
  console.log('-'.repeat(60));
  try {
    const highQualityCatalogue = global.testCatalogues.find(c => c.id === 'cat_high_quality');
    const response = await makeRequest(`/api/catalogues/${highQualityCatalogue.id}/events/filtered?maxAzimuthalGap=150&minUsedPhaseCount=15`);
    
    if (response.status === 200 && response.data.success) {
      const events = response.data.events;
      const allQualityMet = events.every(e => 
        (e.azimuthal_gap === null || e.azimuthal_gap <= 150) &&
        (e.used_phase_count === null || e.used_phase_count >= 15)
      );
      
      logTest('Quality metrics filtering', allQualityMet, `${events.length} high-quality events`);
      
      if (events.length > 0) {
        console.log(`   📊 Sample event quality metrics:`);
        const sample = events[0];
        console.log(`      - Azimuthal gap: ${sample.azimuthal_gap}°`);
        console.log(`      - Used phases: ${sample.used_phase_count}`);
        console.log(`      - Used stations: ${sample.used_station_count}`);
        console.log(`      - Standard error: ${sample.standard_error} km`);
      }
    } else {
      logTest('Quality metrics filtering', false, `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    logTest('Quality metrics filtering', false, error.message);
  }
  
  console.log('\n');

  // Test 7: Quality Filtering - Combined Filters
  console.log('🔍 TEST 7: Quality Filtering (Combined Filters)');
  console.log('-'.repeat(60));
  try {
    const catalogue = global.testCatalogues.find(c => c.id === 'cat_full_quakeml');
    const response = await makeRequest(
      `/api/catalogues/${catalogue.id}/events/filtered?minMagnitude=3.0&evaluationStatus=confirmed&maxAzimuthalGap=200`
    );
    
    if (response.status === 200 && response.data.success) {
      const events = response.data.events;
      
      logTest('Combined filters', true, `${events.length} events match all criteria`);
      console.log(`   📊 Applied filters:`);
      console.log(`      - Min magnitude: 3.0`);
      console.log(`      - Evaluation status: confirmed`);
      console.log(`      - Max azimuthal gap: 200°`);
    } else {
      logTest('Combined filters', false, `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    logTest('Combined filters', false, error.message);
  }
  
  console.log('\n');

  // Test 8: Handling Missing Fields
  console.log('🔍 TEST 8: Handling Events with Missing QuakeML Fields');
  console.log('-'.repeat(60));
  try {
    const basicCatalogue = global.testCatalogues.find(c => c.id === 'cat_basic');
    const response = await makeRequest(`/api/catalogues/${basicCatalogue.id}/events/filtered?eventType=earthquake`);
    
    if (response.status === 200 && response.data.success) {
      const events = response.data.events;
      
      // Basic catalogue should have no events with event_type field
      logTest('Filter on missing field returns empty', events.length === 0, 'Correctly returns no results');
    } else {
      logTest('Filter on missing field', false, `Unexpected response: ${response.status}`);
    }
  } catch (error) {
    logTest('Filter on missing field', false, error.message);
  }
  
  console.log('\n');

  // Print summary
  console.log('=' .repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('=' .repeat(60));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  console.log('\n');

  if (testResults.failed > 0) {
    console.log('❌ Failed Tests:');
    testResults.tests.filter(t => !t.passed).forEach(t => {
      console.log(`   - ${t.name}: ${t.details || 'No details'}`);
    });
    console.log('\n');
  }

  console.log('✅ Testing complete!');
  console.log('\n📁 Generated files:');
  console.log('   - test_export_full.xml (Full QuakeML export sample)');
  console.log('   - test_export_mixed.xml (Mixed data export sample)');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

