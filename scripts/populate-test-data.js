/**
 * Test Data Population Script
 * Populates database with realistic test data for QuakeML features
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');

// Helper to generate random values
const random = (min, max) => Math.random() * (max - min) + min;
const randomInt = (min, max) => Math.floor(random(min, max + 1));
const randomChoice = (arr) => arr[randomInt(0, arr.length - 1)];

// Event types and magnitude types
const eventTypes = ['earthquake', 'quarry blast', 'explosion', 'induced or triggered event'];
const magnitudeTypes = ['ML', 'Mw', 'mb', 'Ms', 'Md'];
const evaluationStatuses = ['preliminary', 'confirmed', 'reviewed', 'final'];
const evaluationModes = ['manual', 'automatic'];

// New Zealand region coordinates
const nzRegions = [
  { name: 'Wellington', lat: -41.2865, lon: 174.7762 },
  { name: 'Christchurch', lat: -43.5321, lon: 172.6362 },
  { name: 'Auckland', lat: -36.8485, lon: 174.7633 },
  { name: 'Taupo', lat: -38.6857, lon: 176.0702 },
  { name: 'Kaikoura', lat: -42.4009, lon: 173.6815 },
];

function generateEvent(region, completeness) {
  const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
  const randomTime = baseTime + random(0, 365 * 24 * 60 * 60 * 1000); // Random time in 2024
  
  const event = {
    time: new Date(randomTime).toISOString(),
    latitude: region.lat + random(-2, 2),
    longitude: region.lon + random(-2, 2),
    depth: random(5, 150),
    magnitude: random(2.0, 7.0),
  };

  if (completeness === 'full') {
    // Full QuakeML data
    event.event_public_id = `smi:local/event/${Date.now()}_${randomInt(1000, 9999)}`;
    event.event_type = randomChoice(eventTypes);
    event.event_type_certainty = randomChoice(['known', 'suspected']);
    
    event.time_uncertainty = random(0.1, 2.0);
    event.latitude_uncertainty = random(0.001, 0.05);
    event.longitude_uncertainty = random(0.001, 0.05);
    event.depth_uncertainty = random(0.5, 5.0);
    
    event.magnitude_type = randomChoice(magnitudeTypes);
    event.magnitude_uncertainty = random(0.05, 0.3);
    event.magnitude_station_count = randomInt(5, 30);
    
    event.azimuthal_gap = random(30, 300);
    event.used_phase_count = randomInt(10, 50);
    event.used_station_count = randomInt(5, 30);
    event.standard_error = random(0.1, 5.0);
    
    event.evaluation_mode = randomChoice(evaluationModes);
    event.evaluation_status = randomChoice(evaluationStatuses);

    const preferredOriginId = `smi:local/origin/${Date.now()}_${randomInt(1000, 9999)}`;
    const preferredMagnitudeId = `smi:local/magnitude/${Date.now()}_${randomInt(1000, 9999)}`;

    // Complex nested data as JSON
    event.origin_quality = JSON.stringify({
      usedPhaseCount: event.used_phase_count,
      usedStationCount: event.used_station_count,
      azimuthalGap: event.azimuthal_gap,
      standardError: event.standard_error,
      minimumDistance: random(0.1, 2.0),
      maximumDistance: random(5.0, 15.0),
    });
    
    event.origins = JSON.stringify([
      {
        publicID: preferredOriginId,
        time: { value: event.time, uncertainty: event.time_uncertainty },
        latitude: { value: event.latitude, uncertainty: event.latitude_uncertainty },
        longitude: { value: event.longitude, uncertainty: event.longitude_uncertainty },
        depth: { value: event.depth * 1000, uncertainty: event.depth_uncertainty * 1000 },
        evaluationMode: event.evaluation_mode,
        evaluationStatus: event.evaluation_status,
      }
    ]);

    event.magnitudes = JSON.stringify([
      {
        publicID: preferredMagnitudeId,
        mag: { value: event.magnitude, uncertainty: event.magnitude_uncertainty },
        type: event.magnitude_type,
        stationCount: event.magnitude_station_count,
      }
    ]);
    
    event.event_descriptions = JSON.stringify([
      { text: `${event.event_type} near ${region.name}`, type: 'region name' }
    ]);
    
    event.comments = JSON.stringify([
      { text: 'Automatically processed event', id: 'comment1' }
    ]);
    
    event.creation_info = JSON.stringify({
      agencyID: 'TestAgency',
      author: 'AutoProcessor',
      creationTime: new Date().toISOString(),
    });
    
  } else if (completeness === 'partial') {
    // Partial QuakeML data - only some fields
    event.magnitude_type = randomChoice(magnitudeTypes);
    event.evaluation_status = randomChoice(evaluationStatuses);
    event.event_type = randomChoice(eventTypes);
    
    // Some quality metrics
    if (Math.random() > 0.5) {
      event.azimuthal_gap = random(30, 300);
      event.used_phase_count = randomInt(10, 50);
    }
    
    if (Math.random() > 0.5) {
      event.magnitude_uncertainty = random(0.05, 0.3);
      event.time_uncertainty = random(0.1, 2.0);
    }
  }
  // else: basic - no additional fields, just the base fields

  return event;
}

function populateDatabase() {
  const db = new sqlite3.Database(dbPath);

  console.log('🚀 Starting test data population...\n');

  db.serialize(() => {
    // Create catalogues
    const catalogues = [
      { id: 'cat_full_quakeml', name: 'Full QuakeML Catalogue', description: 'All events have complete QuakeML data' },
      { id: 'cat_partial_quakeml', name: 'Partial QuakeML Catalogue', description: 'Events have varying levels of QuakeML data' },
      { id: 'cat_basic', name: 'Basic Catalogue', description: 'Legacy catalogue with only basic fields' },
      { id: 'cat_mixed', name: 'Mixed Catalogue', description: 'Mix of full, partial, and basic events' },
      { id: 'cat_high_quality', name: 'High Quality Catalogue', description: 'Only high-quality events with good metrics' },
    ];

    let cataloguesInserted = 0;
    let eventsInserted = 0;

    catalogues.forEach((catalogue, catIndex) => {
      db.run(
        `INSERT OR REPLACE INTO merged_catalogues (id, name, created_at, source_catalogues, merge_config, event_count, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [catalogue.id, catalogue.name, new Date().toISOString(), JSON.stringify([]), JSON.stringify({}), 0, 'complete'],
        function(err) {
          if (err) {
            console.error(`❌ Error inserting catalogue ${catalogue.name}:`, err.message);
            return;
          }
          
          cataloguesInserted++;
          console.log(`✓ Created catalogue: ${catalogue.name}`);

          // Generate events for this catalogue
          let eventsForCatalogue = 0;
          const eventCount = randomInt(20, 50);
          
          for (let i = 0; i < eventCount; i++) {
            const region = randomChoice(nzRegions);
            let completeness;
            
            // Determine completeness based on catalogue type
            if (catalogue.id === 'cat_full_quakeml') {
              completeness = 'full';
            } else if (catalogue.id === 'cat_basic') {
              completeness = 'basic';
            } else if (catalogue.id === 'cat_partial_quakeml') {
              completeness = 'partial';
            } else if (catalogue.id === 'cat_high_quality') {
              completeness = 'full';
            } else {
              // Mixed catalogue
              const rand = Math.random();
              if (rand < 0.4) completeness = 'full';
              else if (rand < 0.7) completeness = 'partial';
              else completeness = 'basic';
            }
            
            const event = generateEvent(region, completeness);
            
            // For high quality catalogue, filter by quality metrics
            if (catalogue.id === 'cat_high_quality') {
              event.azimuthal_gap = random(30, 120); // Good coverage
              event.used_phase_count = randomInt(20, 50); // Many phases
              event.used_station_count = randomInt(15, 30); // Many stations
              event.standard_error = random(0.1, 1.0); // Low error
              event.evaluation_status = randomChoice(['confirmed', 'reviewed', 'final']);
            }
            
            // Build INSERT query dynamically based on available fields
            const fields = ['id', 'catalogue_id', 'time', 'latitude', 'longitude', 'depth', 'magnitude', 'source_events'];
            const values = [`event_${Date.now()}_${randomInt(10000, 99999)}`, catalogue.id, event.time, event.latitude, event.longitude, event.depth, event.magnitude, JSON.stringify([])];
            const placeholders = ['?', '?', '?', '?', '?', '?', '?', '?'];
            
            // Add optional fields if they exist
            const optionalFields = [
              'event_public_id', 'event_type', 'event_type_certainty',
              'time_uncertainty', 'latitude_uncertainty', 'longitude_uncertainty', 'depth_uncertainty',
              'magnitude_type', 'magnitude_uncertainty', 'magnitude_station_count',
              'azimuthal_gap', 'used_phase_count', 'used_station_count', 'standard_error',
              'evaluation_mode', 'evaluation_status',
              'origin_quality', 'origins', 'magnitudes', 'event_descriptions', 'comments', 'creation_info'
            ];
            
            optionalFields.forEach(field => {
              if (event[field] !== undefined) {
                fields.push(field);
                values.push(event[field]);
                placeholders.push('?');
              }
            });
            
            const insertQuery = `INSERT INTO merged_events (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
            
            db.run(insertQuery, values, function(err) {
              if (err) {
                console.error(`❌ Error inserting event:`, err.message);
                return;
              }
              
              eventsForCatalogue++;
              eventsInserted++;
              
              // Update catalogue event count when all events are inserted
              if (eventsForCatalogue === eventCount) {
                db.run(
                  `UPDATE merged_catalogues SET event_count = ? WHERE id = ?`,
                  [eventCount, catalogue.id],
                  (err) => {
                    if (err) {
                      console.error(`❌ Error updating catalogue count:`, err.message);
                    } else {
                      console.log(`  → Added ${eventCount} events (${completeness} data)\n`);
                    }
                    
                    // Close database when all catalogues are processed
                    if (cataloguesInserted === catalogues.length && catIndex === catalogues.length - 1) {
                      setTimeout(() => {
                        db.close((err) => {
                          if (err) {
                            console.error('❌ Error closing database:', err.message);
                            process.exit(1);
                          }
                          
                          console.log('\n✅ Test data population completed!');
                          console.log(`   Catalogues created: ${cataloguesInserted}`);
                          console.log(`   Events created: ${eventsInserted}`);
                          console.log('\n📊 Data Distribution:');
                          console.log('   - Full QuakeML: ~40 events');
                          console.log('   - Partial QuakeML: ~30 events');
                          console.log('   - Basic data: ~30 events');
                          console.log('   - Mixed: ~35 events');
                          console.log('   - High quality: ~30 events');
                          console.log('\n🎯 Ready for testing!');
                          process.exit(0);
                        });
                      }, 1000);
                    }
                  }
                );
              }
            });
          }
        }
      );
    });
  });
}

// Run population
populateDatabase();

