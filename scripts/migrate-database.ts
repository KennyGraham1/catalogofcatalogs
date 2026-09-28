/**
 * Database Migration Script
 * Creates indexes for QuakeML 1.2 fields in MongoDB
 *
 * Note: MongoDB is schemaless, so we don't need to add columns.
 * This script ensures the proper indexes exist for query performance.
 */

import { IndexSpecification } from 'mongodb';
import { COLLECTIONS } from '../lib/mongodb';
import { resolveDbTarget } from './lib/db-target';
import { confirmWrite } from './lib/confirm';

const ASSUME_YES = process.argv.includes('--yes');

async function runMigration() {
  console.log('Starting database migration...');

  // See scripts/migrate-add-region.ts for why this goes through lib/mongodb.ts's
  // getDb() instead of resolving MONGODB_URI/MONGODB_DATABASE itself (gs#3/gs#4).
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

    // Create indexes for QuakeML 1.2 fields
    console.log('Creating indexes for QuakeML 1.2 fields...');

    const indexes: Array<{ key: IndexSpecification; name: string }> = [
      { key: { event_type: 1 }, name: 'idx_event_type' },
      { key: { magnitude_type: 1 }, name: 'idx_magnitude_type' },
      { key: { evaluation_status: 1 }, name: 'idx_evaluation_status' },
      { key: { azimuthal_gap: 1 }, name: 'idx_azimuthal_gap' },
    ];

    for (const index of indexes) {
      try {
        await eventsCollection.createIndex(index.key, { name: index.name });
        console.log(`✓ Created index: ${index.name}`);
      } catch (err: any) {
        if (err.code === 85 || err.code === 86) {
          console.log(`  Index already exists: ${index.name}`);
        } else {
          console.error(`❌ Error creating index ${index.name}:`, err.message);
        }
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Indexes created/verified: ${indexes.length}`);

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
