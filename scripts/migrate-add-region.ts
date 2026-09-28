/**
 * Migration script to add region index to merged_events collection
 *
 * Note: MongoDB is schemaless, so we don't need to add columns.
 * This script ensures the proper index exists for region queries.
 */

import { COLLECTIONS } from '../lib/mongodb';
import { resolveDbTarget } from './lib/db-target';
import { confirmWrite } from './lib/confirm';

const ASSUME_YES = process.argv.includes('--yes');

async function runMigration() {
  console.log('Starting migration: Add region index\n');

  // Resolved the same way the app does (lib/mongodb.ts getDb), not re-derived here
  // — a script with its own copy of the MONGODB_DATABASE/URI precedence rule can
  // silently create indexes in a different database than the one the app queries
  // (finding gs#3). Printing only the host, never the full connection string,
  // avoids leaking credentials into logs (gs#4).
  const target = await resolveDbTarget();

  const decision = await confirmWrite(
    target,
    `About to create indexes on merged_events in database "${target.db.databaseName}".`,
    'yes',
    ASSUME_YES,
  );
  if (!decision.ok) {
    console.error(`❌ ${decision.reason}`);
    await target.close();
    process.exitCode = 1;
    return;
  }

  try {
    const eventsCollection = target.db.collection(COLLECTIONS.EVENTS);

    // Create index for region field
    console.log('Creating index for region field...');

    try {
      await eventsCollection.createIndex({ region: 1 }, { name: 'idx_region' });
      console.log('✓ Created index: idx_region');
    } catch (err: any) {
      if (err.code === 85 || err.code === 86) {
        console.log('  Index already exists: idx_region');
      } else {
        console.error('❌ Error creating index:', err.message);
      }
    }

    // Create index for location_name field
    try {
      await eventsCollection.createIndex({ location_name: 1 }, { name: 'idx_location_name' });
      console.log('✓ Created index: idx_location_name');
    } catch (err: any) {
      if (err.code === 85 || err.code === 86) {
        console.log('  Index already exists: idx_location_name');
      } else {
        console.error('❌ Error creating index:', err.message);
      }
    }

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await target.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { runMigration };
