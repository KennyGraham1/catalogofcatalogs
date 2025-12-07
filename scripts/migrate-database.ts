/**
 * Database Migration Script
 * Creates indexes for QuakeML 1.2 fields in MongoDB
 *
 * Note: MongoDB is schemaless, so we don't need to add columns.
 * This script ensures the proper indexes exist for query performance.
 */

import { MongoClient, IndexSpecification } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

async function runMigration() {
  console.log('Starting database migration...');
  console.log(`   URI: ${MONGODB_URI}`);
  console.log(`   Database: ${DATABASE_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB\n');

    const db = client.db(DATABASE_NAME);
    const eventsCollection = db.collection('merged_events');

    // Create indexes for QuakeML 1.2 fields
    console.log('Creating indexes for QuakeML 1.2 fields...');

    const indexes: Array<{ key: IndexSpecification; name: string }> = [
      { key: { event_type: 1 }, name: 'idx_event_type' },
      { key: { magnitude_type: 1 }, name: 'idx_magnitude_type' },
      { key: { evaluation_status: 1 }, name: 'idx_evaluation_status' },
      { key: { azimuthal_gap: 1 }, name: 'idx_azimuthal_gap' },
    ];

    let indexCount = 0;
    for (const index of indexes) {
      try {
        await eventsCollection.createIndex(index.key, { name: index.name });
        console.log(`✓ Created index: ${index.name}`);
        indexCount++;
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
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

// Run migration
runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
