#!/usr/bin/env npx tsx
/**
 * Database Index Creation Script
 *
 * Creates any missing index from the shared definition list in lib/event-indexes.ts
 * (the same list scripts/init-database.ts and scripts/ensure-indexes.ts apply). An
 * index whose key pattern already exists, under whatever name an earlier script gave
 * it, is reported as present rather than failing.
 *
 * Usage:
 *   npx tsx scripts/create-indexes.ts
 *
 * Environment (also read from .env):
 *   MONGODB_URI - MongoDB connection string (required in production)
 *   MONGODB_DATABASE - Database name (optional; otherwise the database named in
 *                      MONGODB_URI, as the application resolves it)
 */

// Loads .env before lib/mongodb reads the environment.
import 'dotenv/config';
import { closeConnection, getDb } from '../lib/mongodb';
import { ensureDatabaseIndexes } from '../lib/event-indexes';

async function createIndexes(): Promise<number> {
  console.log('🔄 Connecting to MongoDB...');
  const db = await getDb();
  console.log(`✅ Connected (database: ${db.databaseName})\n`);
  console.log('📊 Creating indexes...\n');

  const report = await ensureDatabaseIndexes(db);

  console.log('\n📈 Summary:');
  console.log(`   Created: ${report.created.length}`);
  console.log(`   Present: ${report.existing.length}`);
  console.log(`   Failed:  ${report.failed.length}`);

  if (report.failed.length > 0) {
    console.log('\n⚠️  Some indexes failed to create. Check the errors above.');
    return 1;
  }
  console.log('\n✅ Index creation complete!');
  return 0;
}

createIndexes()
  .then(async (code) => {
    await closeConnection();
    process.exit(code);
  })
  .catch(async (error) => {
    console.error('❌ Index creation failed:', error instanceof Error ? error.message : error);
    await closeConnection().catch(() => undefined);
    process.exit(1);
  });
