/**
 * Populate Database with Realistic New Zealand Earthquake Data
 * 
 * This script generates realistic earthquake catalogue data representing
 * different seismic network deployments across New Zealand with varying
 * data completeness levels.
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const dbPath = path.join(process.cwd(), 'merged_catalogues.db');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomFloat(min, max + 1));
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

// Gutenberg-Richter magnitude distribution
function generateMagnitude(): number {
  const rand = Math.random();
  if (rand < 0.60) return randomFloat(1.5, 3.0);  // 60% microseismic
  if (rand < 0.85) return randomFloat(3.0, 4.0);  // 25% small
  if (rand < 0.95) return randomFloat(4.0, 5.0);  // 10% moderate
  if (rand < 0.99) return randomFloat(5.0, 6.0);  // 4% large
  if (rand < 0.998) return randomFloat(6.0, 7.0); // 0.8% major
  return randomFloat(7.0, 7.8);                    // 0.2% great
}

// ============================================================================
// GEOGRAPHIC ZONES
// ============================================================================

interface SeismicZone {
  name: string;
  latRange: [number, number];
  lonRange: [number, number];
  depthRange: [number, number];
  weight: number;
}

const NZ_SEISMIC_ZONES: SeismicZone[] = [
  {
    name: 'Alpine Fault',
    latRange: [-44.0, -42.0],
    lonRange: [169.0, 171.0],
    depthRange: [5, 25],
    weight: 0.20
  },
  {
    name: 'Hikurangi Subduction Zone',
    latRange: [-41.0, -37.0],
    lonRange: [177.0, 179.0],
    depthRange: [10, 150],
    weight: 0.30
  },
  {
    name: 'Wellington Fault',
    latRange: [-41.5, -41.0],
    lonRange: [174.5, 175.0],
    depthRange: [8, 30],
    weight: 0.15
  },
  {
    name: 'Taupo Volcanic Zone',
    latRange: [-39.0, -38.0],
    lonRange: [175.5, 176.5],
    depthRange: [2, 15],
    weight: 0.15
  },
  {
    name: 'Canterbury',
    latRange: [-43.8, -43.2],
    lonRange: [172.0, 173.0],
    depthRange: [5, 20],
    weight: 0.10
  },
  {
    name: 'Other Regions',
    latRange: [-47.0, -34.0],
    lonRange: [166.0, 179.0],
    depthRange: [5, 100],
    weight: 0.10
  }
];

function selectSeismicZone(): SeismicZone {
  const rand = Math.random();
  let cumulative = 0;
  for (const zone of NZ_SEISMIC_ZONES) {
    cumulative += zone.weight;
    if (rand <= cumulative) return zone;
  }
  return NZ_SEISMIC_ZONES[NZ_SEISMIC_ZONES.length - 1];
}

function generateLocation(zone?: SeismicZone) {
  const selectedZone = zone || selectSeismicZone();
  return {
    latitude: randomFloat(selectedZone.latRange[0], selectedZone.latRange[1]),
    longitude: randomFloat(selectedZone.lonRange[0], selectedZone.lonRange[1]),
    depth: randomFloat(selectedZone.depthRange[0], selectedZone.depthRange[1]),
    region: selectedZone.name
  };
}

// ============================================================================
// TIME GENERATION
// ============================================================================

function generateTimestamp(startDate: Date, endDate: Date): string {
  const start = startDate.getTime();
  const end = endDate.getTime();
  return new Date(start + Math.random() * (end - start)).toISOString();
}

function generateAftershockSequence(mainshockTime: Date, count: number): Date[] {
  const aftershocks: Date[] = [];
  const mainshockMs = mainshockTime.getTime();
  
  for (let i = 0; i < count; i++) {
    // Omori's law: aftershock rate decays with time
    const daysSinceMainshock = Math.pow(Math.random(), 2) * 365; // Decay over 1 year
    const aftershockMs = mainshockMs + daysSinceMainshock * 24 * 60 * 60 * 1000;
    aftershocks.push(new Date(aftershockMs));
  }
  
  return aftershocks.sort((a, b) => a.getTime() - b.getTime());
}

// ============================================================================
// QUAKEML DATA GENERATORS
// ============================================================================

function generateStationPicks(stationCount: number, eventTime: string) {
  const stations = ['WEL', 'AKL', 'CHC', 'DUN', 'NPL', 'GIS', 'HAM', 'ROT', 'TAU', 'KAI', 
                    'MQZ', 'PXZ', 'THZ', 'BKZ', 'HIZ', 'TSZ', 'VRZ', 'WAZ', 'ODZ', 'PUZ'];
  const picks = [];
  
  for (let i = 0; i < stationCount; i++) {
    const station = stations[i % stations.length];
    const pickTime = new Date(new Date(eventTime).getTime() + randomFloat(0, 30000));
    
    picks.push({
      publicID: `smi:nz.org.geonet/pick/${uuidv4()}`,
      time: { value: pickTime.toISOString() },
      waveformID: {
        networkCode: 'NZ',
        stationCode: station,
        channelCode: randomChoice(['HHZ', 'HHN', 'HHE'])
      },
      phaseHint: randomChoice(['P', 'S']),
      evaluationMode: 'automatic',
      evaluationStatus: 'confirmed'
    });
  }
  
  return picks;
}

function generateArrivals(picks: any[], latitude: number, longitude: number) {
  return picks.map((pick, idx) => ({
    publicID: `smi:nz.org.geonet/arrival/${uuidv4()}`,
    pickID: pick.publicID,
    phase: pick.phaseHint,
    azimuth: randomFloat(0, 360),
    distance: randomFloat(0.1, 5.0),
    timeResidual: randomFloat(-0.5, 0.5),
    timeWeight: randomFloat(0.5, 1.0)
  }));
}

function generateFocalMechanism(magnitude: number) {
  if (magnitude < 5.0) return null;
  
  return {
    publicID: `smi:nz.org.geonet/focalmechanism/${uuidv4()}`,
    nodalPlanes: {
      nodalPlane1: {
        strike: { value: randomFloat(0, 360) },
        dip: { value: randomFloat(30, 90) },
        rake: { value: randomFloat(-180, 180) }
      },
      nodalPlane2: {
        strike: { value: randomFloat(0, 360) },
        dip: { value: randomFloat(30, 90) },
        rake: { value: randomFloat(-180, 180) }
      }
    },
    evaluationMode: 'automatic',
    evaluationStatus: 'reviewed'
  };
}

function calculateAzimuthalGap(arrivalCount: number): number {
  if (arrivalCount < 4) return 360;
  if (arrivalCount < 6) return randomFloat(180, 270);
  if (arrivalCount < 10) return randomFloat(90, 180);
  return randomFloat(30, 90);
}

// ============================================================================
// CATALOGUE DEFINITIONS
// ============================================================================

interface CatalogueDefinition {
  id: string;
  name: string;
  description: string;
  completeness: 'basic' | 'moderate' | 'full';
  eventCount: number;
  timeRange: [Date, Date];
  minMagnitude?: number;
  zone?: SeismicZone;
  isAftershockSequence?: boolean;
  mainshockTime?: Date;
}

const now = new Date();
const twoYearsAgo = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
const threeYearsAgo = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);

// Kaikoura earthquake: November 14, 2016
const kaikouraMainshock = new Date('2016-11-14T00:02:56Z');
const kaikouraEnd = new Date('2017-12-31T23:59:59Z');

const CATALOGUES: CatalogueDefinition[] = [
  {
    id: 'cat_geonet_national',
    name: 'GeoNet National Network',
    description: 'Comprehensive national earthquake monitoring with full QuakeML 1.2 data',
    completeness: 'full',
    eventCount: 180,
    timeRange: [twoYearsAgo, now],
    minMagnitude: 2.5
  },
  {
    id: 'cat_geonet_wellington',
    name: 'GeoNet Regional - Wellington',
    description: 'High-density monitoring of Wellington region with complete metadata',
    completeness: 'full',
    eventCount: 100,
    timeRange: [oneYearAgo, now],
    zone: NZ_SEISMIC_ZONES[2] // Wellington Fault
  },
  {
    id: 'cat_usgs_global',
    name: 'USGS Global Catalogue (NZ)',
    description: 'USGS global catalogue filtered for New Zealand region',
    completeness: 'moderate',
    eventCount: 50,
    timeRange: [threeYearsAgo, now],
    minMagnitude: 4.0
  },
  {
    id: 'cat_isc_reviewed',
    name: 'ISC Reviewed Bulletin (NZ)',
    description: 'International Seismological Centre reviewed bulletin for NZ',
    completeness: 'moderate',
    eventCount: 40,
    timeRange: [twoYearsAgo, now],
    minMagnitude: 3.5
  },
  {
    id: 'cat_historic',
    name: 'Historic Catalogue (1900-2000)',
    description: 'Legacy catalogue with basic location and magnitude data only',
    completeness: 'basic',
    eventCount: 120,
    timeRange: [new Date('1900-01-01'), new Date('2000-12-31')],
    minMagnitude: 4.5
  },
  {
    id: 'cat_kaikoura_aftershocks',
    name: 'Kaikoura Aftershock Sequence',
    description: 'M7.8 Kaikoura earthquake and aftershock sequence with full QuakeML data',
    completeness: 'full',
    eventCount: 280,
    timeRange: [kaikouraMainshock, kaikouraEnd],
    isAftershockSequence: true,
    mainshockTime: kaikouraMainshock,
    zone: NZ_SEISMIC_ZONES[4] // Canterbury/Marlborough region
  },
  {
    id: 'cat_alpine_research',
    name: 'Research Network - Alpine Fault',
    description: 'University research deployment monitoring Alpine Fault microseismicity',
    completeness: 'moderate',
    eventCount: 70,
    timeRange: [oneYearAgo, now],
    zone: NZ_SEISMIC_ZONES[0] // Alpine Fault
  },
  {
    id: 'cat_microseismic',
    name: 'Microseismic Monitoring',
    description: 'High-frequency microseismic events with basic parameters only',
    completeness: 'basic',
    eventCount: 350,
    timeRange: [sixMonthsAgo, now],
    minMagnitude: 1.0
  }
];

// ============================================================================
// EVENT GENERATION
// ============================================================================

function generateEvent(
  catalogueId: string,
  completeness: 'basic' | 'moderate' | 'full',
  timestamp: Date,
  zone?: SeismicZone,
  forcedMagnitude?: number
) {
  const magnitude = forcedMagnitude || generateMagnitude();
  const location = generateLocation(zone);
  const eventId = uuidv4();
  
  const baseEvent = {
    id: eventId,
    catalogue_id: catalogueId,
    source_id: `nz${Date.now()}${randomInt(1000, 9999)}`,
    time: timestamp.toISOString(),
    latitude: location.latitude,
    longitude: location.longitude,
    depth: location.depth,
    magnitude: parseFloat(magnitude.toFixed(2)),
    source_events: JSON.stringify([])
  };

  if (completeness === 'basic') {
    return baseEvent;
  }

  // Moderate completeness
  const stationCount = randomInt(5, 15);
  const moderateEvent = {
    ...baseEvent,
    magnitude_type: randomChoice(['ML', 'Mw', 'mb']),
    event_type: randomChoice(['earthquake', 'quarry blast', 'sonic boom']),
    azimuthal_gap: calculateAzimuthalGap(stationCount),
    used_station_count: stationCount,
    used_phase_count: stationCount * randomInt(2, 4),
    latitude_uncertainty: randomFloat(0.5, 5.0),
    longitude_uncertainty: randomFloat(0.5, 5.0),
    depth_uncertainty: randomFloat(1.0, 10.0),
    standard_error: randomFloat(0.1, 1.0),
    evaluation_mode: 'automatic',
    evaluation_status: randomChoice(['preliminary', 'reviewed', 'final'])
  };

  if (completeness === 'moderate') {
    return moderateEvent;
  }

  // Full QuakeML completeness
  const picks = generateStationPicks(stationCount, timestamp.toISOString());
  const arrivals = generateArrivals(picks, location.latitude, location.longitude);
  const focalMechanism = generateFocalMechanism(magnitude);

  return {
    ...moderateEvent,
    event_public_id: `smi:nz.org.geonet/event/${eventId}`,
    time_uncertainty: randomFloat(0.1, 2.0),
    magnitude_uncertainty: randomFloat(0.05, 0.3),
    magnitude_station_count: stationCount,
    picks: JSON.stringify(picks),
    arrivals: JSON.stringify(arrivals),
    focal_mechanisms: focalMechanism ? JSON.stringify([focalMechanism]) : null,
    origin_quality: JSON.stringify({
      associatedPhaseCount: picks.length,
      usedPhaseCount: picks.length,
      associatedStationCount: stationCount,
      usedStationCount: stationCount,
      depthPhaseCount: randomInt(0, 5),
      standardError: randomFloat(0.1, 1.0),
      azimuthalGap: calculateAzimuthalGap(stationCount),
      minimumDistance: randomFloat(0.1, 2.0),
      maximumDistance: randomFloat(3.0, 8.0)
    }),
    event_descriptions: JSON.stringify([{
      text: `${magnitude.toFixed(1)} magnitude earthquake near ${location.region}`,
      type: 'region name'
    }]),
    creation_info: JSON.stringify({
      agencyID: 'NZ',
      author: 'GeoNet',
      creationTime: new Date().toISOString()
    })
  };
}

// ============================================================================
// DATABASE POPULATION
// ============================================================================

function populateDatabase() {
  const db = new sqlite3.Database(dbPath);

  console.log('🌏 Populating Realistic New Zealand Earthquake Data');
  console.log('='.repeat(70));
  console.log('');

  db.serialize(() => {
    let cataloguesInserted = 0;
    let totalEventsInserted = 0;

    CATALOGUES.forEach((catalogue, catIndex) => {
      console.log(`📊 Creating catalogue ${catIndex + 1}/${CATALOGUES.length}: ${catalogue.name}`);
      console.log(`   Completeness: ${catalogue.completeness.toUpperCase()}`);
      console.log(`   Target events: ${catalogue.eventCount}`);

      // Insert catalogue
      db.run(
        `INSERT OR REPLACE INTO merged_catalogues
         (id, name, created_at, source_catalogues, merge_config, event_count, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          catalogue.id,
          catalogue.name,
          new Date().toISOString(),
          JSON.stringify([{ name: catalogue.name, description: catalogue.description }]),
          JSON.stringify({ completeness: catalogue.completeness }),
          catalogue.eventCount,
          'complete'
        ],
        function (err) {
          if (err) {
            console.error(`   ❌ Error inserting catalogue: ${err.message}`);
            return;
          }

          cataloguesInserted++;
          console.log(`   ✓ Catalogue created`);

          // Generate events for this catalogue
          let eventsForCatalogue = 0;
          const events: any[] = [];

          // Special handling for Kaikoura aftershock sequence
          if (catalogue.isAftershockSequence && catalogue.mainshockTime) {
            // Generate mainshock (M7.8)
            const mainshock = generateEvent(
              catalogue.id,
              catalogue.completeness,
              catalogue.mainshockTime,
              catalogue.zone,
              7.8
            );
            events.push(mainshock);

            // Generate aftershocks with Omori decay
            const aftershockTimes = generateAftershockSequence(
              catalogue.mainshockTime,
              catalogue.eventCount - 1
            );

            aftershockTimes.forEach((time, idx) => {
              // Aftershock magnitudes decrease from mainshock
              const aftershockMag = Math.max(
                1.5,
                7.8 - 1.2 - Math.random() * 3.5 - idx * 0.005
              );
              const event = generateEvent(
                catalogue.id,
                catalogue.completeness,
                time,
                catalogue.zone,
                aftershockMag
              );
              events.push(event);
            });
          } else {
            // Regular event generation
            for (let i = 0; i < catalogue.eventCount; i++) {
              const timestamp = new Date(
                generateTimestamp(catalogue.timeRange[0], catalogue.timeRange[1])
              );

              let magnitude = generateMagnitude();

              // Apply minimum magnitude filter if specified
              if (catalogue.minMagnitude) {
                while (magnitude < catalogue.minMagnitude) {
                  magnitude = generateMagnitude();
                }
              }

              const event = generateEvent(
                catalogue.id,
                catalogue.completeness,
                timestamp,
                catalogue.zone,
                magnitude
              );
              events.push(event);
            }
          }

          // Insert all events for this catalogue
          const insertStmt = db.prepare(`
            INSERT INTO merged_events (
              id, catalogue_id, source_id, time, latitude, longitude, depth, magnitude,
              source_events, created_at,
              event_public_id, event_type, event_type_certainty,
              time_uncertainty, latitude_uncertainty, longitude_uncertainty, depth_uncertainty,
              magnitude_type, magnitude_uncertainty, magnitude_station_count,
              azimuthal_gap, used_phase_count, used_station_count, standard_error,
              evaluation_mode, evaluation_status,
              origin_quality, origins, magnitudes, picks, arrivals, focal_mechanisms,
              amplitudes, station_magnitudes, event_descriptions, comments, creation_info
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?
            )
          `);

          events.forEach((event) => {
            insertStmt.run(
              event.id,
              event.catalogue_id,
              event.source_id,
              event.time,
              event.latitude,
              event.longitude,
              event.depth,
              event.magnitude,
              event.source_events,
              new Date().toISOString(),
              event.event_public_id || null,
              event.event_type || null,
              event.event_type_certainty || null,
              event.time_uncertainty || null,
              event.latitude_uncertainty || null,
              event.longitude_uncertainty || null,
              event.depth_uncertainty || null,
              event.magnitude_type || null,
              event.magnitude_uncertainty || null,
              event.magnitude_station_count || null,
              event.azimuthal_gap || null,
              event.used_phase_count || null,
              event.used_station_count || null,
              event.standard_error || null,
              event.evaluation_mode || null,
              event.evaluation_status || null,
              event.origin_quality || null,
              event.origins || null,
              event.magnitudes || null,
              event.picks || null,
              event.arrivals || null,
              event.focal_mechanisms || null,
              event.amplitudes || null,
              event.station_magnitudes || null,
              event.event_descriptions || null,
              event.comments || null,
              event.creation_info || null,
              (err) => {
                if (err) {
                  console.error(`   ❌ Error inserting event: ${err.message}`);
                } else {
                  eventsForCatalogue++;
                  totalEventsInserted++;
                }
              }
            );
          });

          insertStmt.finalize(() => {
            console.log(`   ✓ Inserted ${eventsForCatalogue} events`);

            // Calculate and update geographic bounds for this catalogue
            if (events.length > 0) {
              let minLat = Infinity;
              let maxLat = -Infinity;
              let minLon = Infinity;
              let maxLon = -Infinity;

              events.forEach((event) => {
                if (typeof event.latitude === 'number' && typeof event.longitude === 'number') {
                  minLat = Math.min(minLat, event.latitude);
                  maxLat = Math.max(maxLat, event.latitude);
                  minLon = Math.min(minLon, event.longitude);
                  maxLon = Math.max(maxLon, event.longitude);
                }
              });

              if (minLat !== Infinity && maxLat !== -Infinity && minLon !== Infinity && maxLon !== -Infinity) {
                db.run(
                  `UPDATE merged_catalogues
                   SET min_latitude = ?, max_latitude = ?, min_longitude = ?, max_longitude = ?
                   WHERE id = ?`,
                  [minLat, maxLat, minLon, maxLon, catalogue.id],
                  (err) => {
                    if (err) {
                      console.error(`   ❌ Error updating geographic bounds: ${err.message}`);
                    } else {
                      console.log(`   ✓ Updated geographic bounds: Lat ${minLat.toFixed(2)} to ${maxLat.toFixed(2)}, Lon ${minLon.toFixed(2)} to ${maxLon.toFixed(2)}`);
                    }
                    console.log('');
                  }
                );
              }
            } else {
              console.log('');
            }

            // Check if all catalogues are done
            if (cataloguesInserted === CATALOGUES.length) {
              // Wait a bit for all bounds updates to complete
              setTimeout(() => {
                db.close((err) => {
                  if (err) {
                    console.error('❌ Error closing database:', err.message);
                    process.exit(1);
                  }

                  console.log('='.repeat(70));
                  console.log('✅ Database population complete!');
                  console.log('='.repeat(70));
                  console.log('');
                  console.log('📈 Summary:');
                  console.log(`   Catalogues created: ${cataloguesInserted}`);
                  console.log(`   Total events inserted: ${totalEventsInserted}`);
                  console.log('');
                  console.log('📊 Catalogue Breakdown:');
                  CATALOGUES.forEach((cat) => {
                    console.log(`   • ${cat.name}: ${cat.eventCount} events (${cat.completeness})`);
                  });
                  console.log('');
                  console.log('🗺️  Geographic Distribution:');
                  NZ_SEISMIC_ZONES.forEach((zone) => {
                    console.log(`   • ${zone.name}: ~${Math.round(totalEventsInserted * zone.weight)} events`);
                  });
                  console.log('');
                  console.log('🎯 Data Completeness:');
                  const fullCount = CATALOGUES.filter(c => c.completeness === 'full')
                    .reduce((sum, c) => sum + c.eventCount, 0);
                  const moderateCount = CATALOGUES.filter(c => c.completeness === 'moderate')
                    .reduce((sum, c) => sum + c.eventCount, 0);
                  const basicCount = CATALOGUES.filter(c => c.completeness === 'basic')
                    .reduce((sum, c) => sum + c.eventCount, 0);

                  console.log(`   • Full QuakeML 1.2: ${fullCount} events`);
                  console.log(`   • Moderate detail: ${moderateCount} events`);
                  console.log(`   • Basic only: ${basicCount} events`);
                  console.log('');
                  console.log('🚀 You can now start the application with: npm run dev');
                  console.log('');

                  process.exit(0);
                });
              }, 500); // Wait 500ms for all bounds updates to complete
            }
          });
        }
      );
    });
  });
}

// Run the population
populateDatabase();

