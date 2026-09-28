/**
 * Initialize MongoDB Database
 * Creates all collections and indexes.
 *
 *   npx tsx scripts/init-database.ts
 *
 * The database is resolved exactly as the application resolves it (lib/mongodb.ts:
 * MONGODB_DATABASE, else the database named in MONGODB_URI, else
 * 'earthquake_catalogue'), so the indexes land in the database the app uses. The
 * indexes come from the one shared list in lib/event-indexes.ts, which
 * scripts/create-indexes.ts and scripts/ensure-indexes.ts apply too, so the three
 * scripts can run in any order and any number of times.
 */

// Loads .env before lib/mongodb reads the environment.
import 'dotenv/config';
import { COLLECTIONS, closeConnection, getDb } from '../lib/mongodb';
import { ensureDatabaseIndexes } from '../lib/event-indexes';

async function initializeDatabase(): Promise<number> {
  console.log('🔧 Initializing MongoDB database...\n');

  const db = await getDb();
  console.log(`✓ Connected to MongoDB (database: ${db.databaseName})\n`);

  // Create collections (MongoDB creates them automatically, but we can be explicit)
  console.log('📦 Creating collections...');
  let collectionErrors = 0;
  for (const collectionName of Object.values(COLLECTIONS)) {
    try {
      await db.createCollection(collectionName);
      console.log(`✓ Created collection: ${collectionName}`);
    } catch (err: any) {
      if (err.code === 48) {
        // Collection already exists
        console.log(`  Collection already exists: ${collectionName}`);
      } else {
        collectionErrors++;
        console.error(`❌ Error creating collection ${collectionName}:`, err.message);
      }
    }
  }

  console.log('\n🔍 Creating indexes...');
  const report = await ensureDatabaseIndexes(db);

  console.log(`\n   Indexes created: ${report.created.length}, already present: ${report.existing.length}, failed: ${report.failed.length}`);
  if (collectionErrors > 0 || report.failed.length > 0) {
    console.error('\n❌ Database initialization incomplete. Fix the errors above and rerun.');
    return 1;
  }
  console.log('\n✅ MongoDB database initialized successfully!');
  return 0;
}

initializeDatabase()
  .then(async (code) => {
    await closeConnection();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error('❌ Failed to initialize database:', error instanceof Error ? error.message : error);
    await closeConnection().catch(() => undefined);
    process.exit(1);
  });
