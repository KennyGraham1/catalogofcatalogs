#!/usr/bin/env tsx
/**
 * Import script for New Zealand temporary seismic network catalogues
 *
 * This script imports earthquake catalogues from 7 temporary seismic networks
 * deployed in New Zealand, along with their comprehensive metadata.
 *
 * Usage: npx tsx scripts/import-temp-networks.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb, COLLECTIONS } from '../lib/mongodb';

// Network metadata structure
interface NetworkMetadata {
  fdsnCode: string;
  fullName: string;
  operationalPeriod: string;
  operatingInstitution: string;
  doi?: string;
  fdsnPage?: string;
  totalStations?: number;
  scientificPurpose: string;
  geographicRegion: string;
  catalogLatRange: string;
  catalogLonRange: string;
  equipment?: string;
  projectWebsite?: string;
  collaborators?: string[];
  keyPublications?: string[];
  eventCount: number;
  dateRange: string;
  magnitudeRange?: string;
}

// Parse the NETWORK_METADATA.md file
function parseNetworkMetadata(filePath: string): Map<string, NetworkMetadata> {
  const content = readFileSync(filePath, 'utf-8');
  const networks = new Map<string, NetworkMetadata>();

  // Split by network sections (## Network XX)
  const sections = content.split(/## Network (\w+) /g).slice(1);

  for (let i = 0; i < sections.length; i += 2) {
    const networkCode = sections[i].trim();
    const sectionContent = sections[i + 1];

    const metadata: Partial<NetworkMetadata> = {
      fdsnCode: networkCode,
    };

    // Extract metadata fields using regex patterns
    const extractField = (pattern: RegExp): string | undefined => {
      const match = sectionContent.match(pattern);
      return match ? match[1].trim() : undefined;
    };

    metadata.fullName = extractField(/\*\*Full Name:\*\* (.+?)$/m);
    metadata.operationalPeriod = extractField(/\*\*Operational Period:\*\* (.+?)$/m);
    metadata.operatingInstitution = extractField(/\*\*Operating Institution:\*\* (.+?)$/m);
    metadata.doi = extractField(/\*\*DOI:\*\* (.+?)$/m);
    metadata.fdsnPage = extractField(/\*\*FDSN Page:\*\* (.+?)$/m);

    // Extract total stations if present
    const stationsMatch = sectionContent.match(/\*\*Total Stations:\*\* (\d+)/m);
    if (stationsMatch) {
      metadata.totalStations = parseInt(stationsMatch[1], 10);
    }

    // Extract scientific purpose (paragraph after "### Scientific Purpose")
    const sciPurposeMatch = sectionContent.match(/### Scientific Purpose\s*\n(.+?)(?=\n###|\n---|\n\n##|$)/s);
    if (sciPurposeMatch) {
      metadata.scientificPurpose = sciPurposeMatch[1].trim().replace(/\n/g, ' ');
    }

    // Extract geographic region
    const regionMatch = sectionContent.match(/\*\*Region:\*\* (.+?)$/m);
    if (regionMatch) {
      metadata.geographicRegion = regionMatch[1].trim();
    }

    // Extract catalog lat/lon ranges
    const latRangeMatch = sectionContent.match(/\*\*Earthquake Catalog:\*\* Lat: (.+?), Lon: (.+?)$/m);
    if (latRangeMatch) {
      metadata.catalogLatRange = latRangeMatch[1].trim();
      metadata.catalogLonRange = latRangeMatch[2].trim();
    }

    // Extract equipment/instrumentation
    const equipMatch = sectionContent.match(/### (?:Equipment|Instrumentation)\s*\n(.+?)(?=\n###|\n---|\n\n##|$)/s);
    if (equipMatch) {
      metadata.equipment = equipMatch[1].trim().replace(/\n/g, ' ');
    }

    // Extract project website
    metadata.projectWebsite = extractField(/\*\*Project Website:\*\* (.+?)$/m);

    // Extract collaborators (if listed)
    const collabMatch = sectionContent.match(/### Collaborating Organizations\s*\n((?:- .+?\n)+)/m);
    if (collabMatch) {
      metadata.collaborators = collabMatch[1]
        .split('\n')
        .filter(line => line.startsWith('-'))
        .map(line => line.substring(1).trim());
    }

    // Extract key publications
    const pubMatch = sectionContent.match(/### Key Publications\s*\n((?:- .+?\n)+)/m);
    if (pubMatch) {
      metadata.keyPublications = pubMatch[1]
        .split('\n')
        .filter(line => line.startsWith('-'))
        .map(line => line.substring(1).trim());
    }

    // Extract downloaded data summary
    const eventsMatch = sectionContent.match(/\*\*Events:\*\* (.+?)$/m);
    if (eventsMatch) {
      const eventsText = eventsMatch[1].trim();
      // Parse event count from text like "19 earthquakes" or "~170 earthquakes" or "~3,400 earthquakes"
      const countMatch = eventsText.match(/~?(\d{1,3}(?:,\d{3})*)/);
      if (countMatch) {
        metadata.eventCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
      }
    }

    metadata.dateRange = extractField(/\*\*Date Range:\*\* (.+?)$/m) || '';

    // Extract magnitude range if present
    const magMatch = sectionContent.match(/\((?:M|mostly M) ([\d.]+)[-–]([\d.]+)\)/);
    if (magMatch) {
      metadata.magnitudeRange = `M ${magMatch[1]}-${magMatch[2]}`;
    }

    networks.set(networkCode, metadata as NetworkMetadata);
  }

  return networks;
}

// Parse earthquake catalog CSV file (pipe-delimited IRIS format)
interface EarthquakeEvent {
  eventId: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  author: string;
  catalog: string;
  contributor: string;
  contributorId: string;
  magType: string;
  magnitude: number;
  magAuthor: string;
  locationName: string;
}

function parseCatalogFile(filePath: string): EarthquakeEvent[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));

  const events: EarthquakeEvent[] = [];

  for (const line of lines) {
    const fields = line.split('|').map(f => f.trim());

    if (fields.length < 13) {
      continue; // Skip malformed lines
    }

    const event: EarthquakeEvent = {
      eventId: fields[0],
      time: fields[1],
      latitude: parseFloat(fields[2]),
      longitude: parseFloat(fields[3]),
      depth: parseFloat(fields[4]),
      author: fields[5],
      catalog: fields[6],
      contributor: fields[7],
      contributorId: fields[8],
      magType: fields[9],
      magnitude: parseFloat(fields[10]),
      magAuthor: fields[11],
      locationName: fields[12],
    };

    // Validate required numeric fields
    if (isNaN(event.latitude) || isNaN(event.longitude) || isNaN(event.magnitude)) {
      console.warn(`Skipping event with invalid data: ${fields[0]}`);
      continue;
    }

    events.push(event);
  }

  return events;
}

// Main import function
async function importTemporaryNetworks() {
  console.log('🌏 Starting import of NZ temporary seismic network catalogues...\n');

  const dataDir = join(process.cwd(), 'nz_temp_network_earthquakes');
  const metadataFile = join(dataDir, 'NETWORK_METADATA.md');

  // Parse metadata
  console.log('📖 Parsing network metadata...');
  const networksMetadata = parseNetworkMetadata(metadataFile);
  console.log(`   Found metadata for ${networksMetadata.size} networks\n`);

  // Get database connection
  const db = await getDb();
  const cataloguesCollection = db.collection(COLLECTIONS.CATALOGUES);
  const eventsCollection = db.collection(COLLECTIONS.EVENTS);

  // Find all catalog files
  const files = readdirSync(dataDir).filter(f => f.endsWith('_earthquakes.csv'));
  console.log(`📁 Found ${files.length} catalog files to import\n`);

  let totalCatalogues = 0;
  let totalEvents = 0;

  for (const file of files) {
    const networkCode = file.split('_')[0];
    const metadata = networksMetadata.get(networkCode);

    if (!metadata) {
      console.warn(`⚠️  No metadata found for network ${networkCode}, skipping...`);
      continue;
    }

    console.log(`\n📡 Processing Network ${networkCode}: ${metadata.fullName}`);
    console.log(`   Period: ${metadata.operationalPeriod}`);
    console.log(`   Institution: ${metadata.operatingInstitution}`);

    // Parse earthquake events
    const filePath = join(dataDir, file);
    const events = parseCatalogFile(filePath);
    console.log(`   Parsed ${events.length} earthquake events`);

    if (events.length === 0) {
      console.log(`   ⏭️  Skipping empty catalogue`);
      continue;
    }

    // Calculate geographic bounds
    const lats = events.map(e => e.latitude);
    const lons = events.map(e => e.longitude);
    const mags = events.map(e => e.magnitude);
    const times = events.map(e => new Date(e.time));

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minMag = Math.min(...mags);
    const maxMag = Math.max(...mags);
    const startTime = new Date(Math.min(...times.map(t => t.getTime())));
    const endTime = new Date(Math.max(...times.map(t => t.getTime())));

    // Create catalogue document
    const catalogueId = uuidv4();
    const catalogueName = `${metadata.fullName} (${networkCode})`;

    const catalogueDoc = {
      id: catalogueId,
      name: catalogueName,
      created_at: new Date().toISOString(),
      source_catalogues: JSON.stringify([{
        source: 'IRIS FDSN',
        network: networkCode,
        doi: metadata.doi,
        fdsnPage: metadata.fdsnPage
      }]),
      merge_config: JSON.stringify({
        source: 'NZ Temporary Network Import',
        importDate: new Date().toISOString()
      }),
      event_count: events.length,
      status: 'complete',

      // Geographic bounds
      min_latitude: minLat,
      max_latitude: maxLat,
      min_longitude: minLon,
      max_longitude: maxLon,

      // Temporal coverage
      time_period_start: startTime.toISOString(),
      time_period_end: endTime.toISOString(),

      // Metadata fields
      description: `Earthquake catalogue from the ${metadata.fullName} temporary seismic network. ${metadata.scientificPurpose}`,
      data_source: 'IRIS FDSN Event Web Service',
      provider: metadata.operatingInstitution,
      geographic_region: metadata.geographicRegion,

      // Quality and completeness
      data_quality: JSON.stringify({
        completeness: `M${minMag.toFixed(1)}+ for ${metadata.dateRange}`,
        magnitudeRange: `M ${minMag.toFixed(1)} - ${maxMag.toFixed(1)}`,
        eventCount: events.length,
        temporalCoverage: metadata.operationalPeriod,
        spatialCoverage: `Lat: ${metadata.catalogLatRange}, Lon: ${metadata.catalogLonRange}`
      }),
      quality_notes: metadata.equipment ? `Equipment: ${metadata.equipment}` : undefined,

      // Attribution and citation
      contact_organization: metadata.operatingInstitution,
      license: 'Open access via IRIS Data Services',
      usage_terms: 'Please cite the network DOI and IRIS Data Services when using this data',
      citation: metadata.doi ? `FDSN Network ${networkCode}. ${metadata.doi}` : undefined,
      doi: metadata.doi,

      // Additional metadata
      version: '1.0',
      keywords: JSON.stringify([
        'temporary network',
        'New Zealand',
        networkCode,
        metadata.geographicRegion,
        ...metadata.scientificPurpose.toLowerCase().includes('alpine fault') ? ['Alpine Fault'] : [],
        ...metadata.scientificPurpose.toLowerCase().includes('subduction') ? ['Hikurangi subduction'] : [],
      ]),
      reference_links: JSON.stringify([
        metadata.fdsnPage,
        metadata.projectWebsite,
        ...(metadata.keyPublications || [])
      ].filter(Boolean)),
      notes: [
        metadata.totalStations ? `Total Stations: ${metadata.totalStations}` : null,
        metadata.collaborators ? `Collaborators: ${metadata.collaborators.join(', ')}` : null,
        `Downloaded from IRIS: ${metadata.dateRange}`,
        `FDSN Code: ${networkCode}`
      ].filter(Boolean).join('\n'),
    };

    // Insert catalogue
    await cataloguesCollection.insertOne(catalogueDoc);
    console.log(`   ✅ Created catalogue: ${catalogueName}`);
    totalCatalogues++;

    // Prepare events for bulk insert
    const eventDocs = events.map(event => ({
      id: uuidv4(),
      catalogue_id: catalogueId,
      source_id: event.eventId,
      time: new Date(event.time).toISOString(),
      latitude: event.latitude,
      longitude: event.longitude,
      depth: isNaN(event.depth) ? null : event.depth,
      magnitude: event.magnitude,
      magnitude_type: event.magType,
      location_name: event.locationName,
      author: event.author,
      agency_id: event.contributor,
      event_public_id: event.contributorId,
      source_events: JSON.stringify([{
        source: event.catalog,
        eventId: event.eventId,
        contributor: event.contributor,
        author: event.author
      }]),
      creation_info: JSON.stringify({
        agency: event.contributor,
        author: event.author,
        catalog: event.catalog,
        magAuthor: event.magAuthor
      }),
      created_at: new Date().toISOString(),
    }));

    // Bulk insert events in batches of 1000
    const batchSize = 1000;
    for (let i = 0; i < eventDocs.length; i += batchSize) {
      const batch = eventDocs.slice(i, i + batchSize);
      await eventsCollection.insertMany(batch);
      console.log(`   📥 Inserted events ${i + 1}-${Math.min(i + batchSize, eventDocs.length)} of ${eventDocs.length}`);
    }

    totalEvents += events.length;
    console.log(`   ✅ Imported ${events.length} events for ${networkCode}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Import complete!');
  console.log(`   Total catalogues imported: ${totalCatalogues}`);
  console.log(`   Total events imported: ${totalEvents.toLocaleString()}`);
  console.log('='.repeat(60) + '\n');
}

// Run the import
importTemporaryNetworks()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Import failed:', error);
    process.exit(1);
  });
