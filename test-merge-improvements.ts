/**
 * Test script to verify merge algorithm improvements
 * 
 * Tests:
 * 1. Adaptive thresholds work correctly
 * 2. Magnitude hierarchy selection
 * 3. Date line handling
 * 4. Quality scoring
 * 5. Missing data handling
 */

// Mock event data for testing
interface TestEvent {
  id?: string;
  time: string;
  latitude: number;
  longitude: number;
  depth?: number | null;
  magnitude: number;
  source: string;
  quakeml?: any;
}

// Test 1: Adaptive Thresholds
console.log('=== Test 1: Adaptive Thresholds ===');

// Small event (M3.5) should use 25 km threshold
const smallEvent: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  depth: 10,
  magnitude: 3.5,
  source: 'test'
};

// Large event (M7.5) should use 200 km threshold
const largeEvent: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  depth: 10,
  magnitude: 7.5,
  source: 'test'
};

// Deep event (M5.0 at 400 km) should use 50 * 1.5 = 75 km threshold
const deepEvent: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  depth: 400,
  magnitude: 5.0,
  source: 'test'
};

console.log('Small event (M3.5): Expected threshold = 25 km');
console.log('Large event (M7.5): Expected threshold = 200 km');
console.log('Deep event (M5.0 at 400km): Expected threshold = 75 km');

// Test 2: Magnitude Hierarchy
console.log('\n=== Test 2: Magnitude Hierarchy ===');

const eventWithMw: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  magnitude: 6.5,
  source: 'test',
  quakeml: {
    magnitudes: [
      { type: 'ML', mag: { value: 6.2 } },
      { type: 'Mw', mag: { value: 6.5 } },
      { type: 'mb', mag: { value: 6.0 } }
    ]
  }
};

console.log('Event with multiple magnitude types:');
console.log('  ML = 6.2, Mw = 6.5, mb = 6.0');
console.log('  Expected selection: Mw = 6.5 (highest priority)');

// Test 3: Date Line Handling
console.log('\n=== Test 3: Date Line Handling ===');

const eventEast: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 179.9, // Just east of date line
  magnitude: 5.0,
  source: 'test'
};

const eventWest: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: -179.9, // Just west of date line
  magnitude: 5.0,
  source: 'test'
};

console.log('Event at 179.9°E and -179.9°W (same location):');
console.log('  Distance should be ~0 km (not ~360° × 111 km)');
console.log('  Events should match across date line');

// Test 4: Quality Scoring
console.log('\n=== Test 4: Quality Scoring ===');

const highQualityEvent: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  magnitude: 5.0,
  source: 'test',
  quakeml: {
    origins: [{
      publicID: 'origin1',
      quality: {
        usedStationCount: 25,
        azimuthalGap: 90,
        standardError: 5,
        minimumDistance: 0.8
      }
    }],
    magnitudes: [{
      publicID: 'mag1',
      mag: { value: 5.0, uncertainty: 0.2 }
    }],
    preferredOriginID: 'origin1',
    preferredMagnitudeID: 'mag1'
  }
};

const lowQualityEvent: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  magnitude: 5.0,
  source: 'test',
  quakeml: {
    origins: [{
      publicID: 'origin1',
      quality: {
        usedStationCount: 5,
        azimuthalGap: 270,
        standardError: 50,
        minimumDistance: 5.0
      }
    }],
    magnitudes: [{
      publicID: 'mag1',
      mag: { value: 5.0, uncertainty: 0.8 }
    }],
    preferredOriginID: 'origin1',
    preferredMagnitudeID: 'mag1'
  }
};

console.log('High quality event: 25 stations, 90° gap, 5 km error, 0.2 uncertainty');
console.log('  Expected score: ~84 points');
console.log('Low quality event: 5 stations, 270° gap, 50 km error, 0.8 uncertainty');
console.log('  Expected score: ~29 points');

// Test 5: Missing Data Handling
console.log('\n=== Test 5: Missing Data Handling ===');

const basicEvent: TestEvent = {
  time: '2024-01-01T00:00:00Z',
  latitude: -41.0,
  longitude: 174.0,
  magnitude: 5.0,
  source: 'test'
  // No QuakeML data, no depth
};

console.log('Basic event (no QuakeML, no depth):');
console.log('  Should fall back to simple magnitude field');
console.log('  Should use config thresholds (no adaptive calculation)');
console.log('  Should not crash on missing data');

console.log('\n=== All Tests Defined ===');
console.log('Run the actual merge algorithm to verify behavior');

