/**
 * Initialize MongoDB Database
 * Creates all collections and indexes
 */

import { config } from 'dotenv';
import { MongoClient } from 'mongodb';

// Load environment variables from .env file
config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

// Collection names
const COLLECTIONS = {
  CATALOGUES: 'merged_catalogues',
  EVENTS: 'merged_events',
  MAPPING_TEMPLATES: 'mapping_templates',
  IMPORT_HISTORY: 'import_history',
  SAVED_FILTERS: 'saved_filters',
  USERS: 'users',
  SESSIONS: 'sessions',
  API_KEYS: 'api_keys',
  AUDIT_LOGS: 'audit_logs',
};

async function initializeDatabase() {
  console.log('🔧 Initializing MongoDB database...\n');
  console.log(`   URI: ${MONGODB_URI}`);
  console.log(`   Database: ${DATABASE_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB\n');

    const db = client.db(DATABASE_NAME);

    // Create collections (MongoDB creates them automatically, but we can be explicit)
    console.log('📦 Creating collections...');
    for (const [name, collectionName] of Object.entries(COLLECTIONS)) {
      try {
        await db.createCollection(collectionName);
        console.log(`✓ Created collection: ${collectionName}`);
      } catch (err: any) {
        if (err.code === 48) {
          // Collection already exists
          console.log(`  Collection already exists: ${collectionName}`);
        } else {
          console.error(`❌ Error creating collection ${collectionName}:`, err.message);
        }
      }
    }

    // Create indexes
    console.log('\n🔍 Creating indexes...');
    let indexCount = 0;

    // Events collection indexes
    const eventsCollection = db.collection(COLLECTIONS.EVENTS);
    const eventIndexes: Array<{ key: Record<string, 1 | -1>; name: string; unique?: boolean }> = [
      { key: { id: 1 }, name: 'idx_id', unique: true },
      { key: { catalogue_id: 1 }, name: 'idx_catalogue_id' },
      { key: { source_id: 1 }, name: 'idx_source_id' },
      { key: { time: -1 }, name: 'idx_time' },
      { key: { magnitude: -1 }, name: 'idx_magnitude' },
      { key: { depth: 1 }, name: 'idx_depth' },
      { key: { latitude: 1, longitude: 1 }, name: 'idx_location' },
      { key: { event_type: 1 }, name: 'idx_event_type' },
      { key: { magnitude_type: 1 }, name: 'idx_magnitude_type' },
      { key: { evaluation_status: 1 }, name: 'idx_evaluation_status' },
      { key: { azimuthal_gap: 1 }, name: 'idx_azimuthal_gap' },
      { key: { used_station_count: 1 }, name: 'idx_used_station_count' },
      { key: { standard_error: 1 }, name: 'idx_standard_error' },
      { key: { catalogue_id: 1, time: -1 }, name: 'idx_catalogue_time' },
      { key: { catalogue_id: 1, magnitude: -1 }, name: 'idx_catalogue_magnitude' },
    ];

    for (const idx of eventIndexes) {
      try {
        await eventsCollection.createIndex(idx.key, { name: idx.name, unique: idx.unique ?? false });
        console.log(`✓ Created index: ${COLLECTIONS.EVENTS}.${idx.name}`);
        indexCount++;
      } catch (err: any) {
        if (err.code === 85 || err.code === 86) {
          console.log(`  Index already exists: ${COLLECTIONS.EVENTS}.${idx.name}`);
        } else {
          console.error(`❌ Error creating index ${idx.name}:`, err.message);
        }
      }
    }

    // Catalogues collection indexes
    const cataloguesCollection = db.collection(COLLECTIONS.CATALOGUES);
    await cataloguesCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    console.log(`✓ Created index: ${COLLECTIONS.CATALOGUES}.idx_id`);
    indexCount++;

    // Mapping templates collection indexes
    const templatesCollection = db.collection(COLLECTIONS.MAPPING_TEMPLATES);
    await templatesCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await templatesCollection.createIndex({ name: 1 }, { name: 'idx_name' });
    console.log(`✓ Created index: ${COLLECTIONS.MAPPING_TEMPLATES}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.MAPPING_TEMPLATES}.idx_name`);
    indexCount += 2;

    // Import history collection indexes
    const historyCollection = db.collection(COLLECTIONS.IMPORT_HISTORY);
    await historyCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await historyCollection.createIndex({ catalogue_id: 1 }, { name: 'idx_catalogue_id' });
    await historyCollection.createIndex({ created_at: -1 }, { name: 'idx_created_at' });
    console.log(`✓ Created index: ${COLLECTIONS.IMPORT_HISTORY}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.IMPORT_HISTORY}.idx_catalogue_id`);
    console.log(`✓ Created index: ${COLLECTIONS.IMPORT_HISTORY}.idx_created_at`);
    indexCount += 3;

    // Saved filters collection indexes
    const filtersCollection = db.collection(COLLECTIONS.SAVED_FILTERS);
    await filtersCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await filtersCollection.createIndex({ catalogue_id: 1 }, { name: 'idx_catalogue_id' });
    console.log(`✓ Created index: ${COLLECTIONS.SAVED_FILTERS}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.SAVED_FILTERS}.idx_catalogue_id`);
    indexCount += 2;

    // Users collection indexes
    const usersCollection = db.collection(COLLECTIONS.USERS);
    await usersCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await usersCollection.createIndex({ email: 1 }, { name: 'idx_email', unique: true });
    console.log(`✓ Created index: ${COLLECTIONS.USERS}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.USERS}.idx_email`);
    indexCount += 2;

    // Sessions collection indexes
    const sessionsCollection = db.collection(COLLECTIONS.SESSIONS);
    await sessionsCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await sessionsCollection.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
    await sessionsCollection.createIndex({ token: 1 }, { name: 'idx_token' });
    await sessionsCollection.createIndex({ expires_at: 1 }, { name: 'idx_expires_at', expireAfterSeconds: 0 });
    console.log(`✓ Created index: ${COLLECTIONS.SESSIONS}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.SESSIONS}.idx_user_id`);
    console.log(`✓ Created index: ${COLLECTIONS.SESSIONS}.idx_token`);
    console.log(`✓ Created index: ${COLLECTIONS.SESSIONS}.idx_expires_at (TTL)`);
    indexCount += 4;

    // API keys collection indexes
    const apiKeysCollection = db.collection(COLLECTIONS.API_KEYS);
    await apiKeysCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await apiKeysCollection.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
    await apiKeysCollection.createIndex({ key_prefix: 1 }, { name: 'idx_key_prefix' });
    console.log(`✓ Created index: ${COLLECTIONS.API_KEYS}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.API_KEYS}.idx_user_id`);
    console.log(`✓ Created index: ${COLLECTIONS.API_KEYS}.idx_key_prefix`);
    indexCount += 3;

    // Audit logs collection indexes
    const auditLogsCollection = db.collection(COLLECTIONS.AUDIT_LOGS);
    await auditLogsCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await auditLogsCollection.createIndex({ user_id: 1 }, { name: 'idx_user_id' });
    await auditLogsCollection.createIndex({ created_at: -1 }, { name: 'idx_created_at' });
    console.log(`✓ Created index: ${COLLECTIONS.AUDIT_LOGS}.idx_id`);
    console.log(`✓ Created index: ${COLLECTIONS.AUDIT_LOGS}.idx_user_id`);
    console.log(`✓ Created index: ${COLLECTIONS.AUDIT_LOGS}.idx_created_at`);
    indexCount += 3;

    console.log('\n✅ MongoDB database initialized successfully!');
    console.log(`   Collections created: ${Object.keys(COLLECTIONS).length}`);
    console.log(`   Indexes created: ${indexCount}\n`);

  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('✓ Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run initialization
initializeDatabase();
