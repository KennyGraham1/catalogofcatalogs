/**
 * Migration script to add region index to merged_events collection
 *
 * Note: MongoDB is schemaless, so we don't need to add columns.
 * This script ensures the proper index exists for region queries.
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';

async function runMigration() {
  console.log('Starting migration: Add region index\n');
  console.log(`   URI: ${MONGODB_URI}`);
  console.log(`   Database: ${DATABASE_NAME}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✓ Connected to MongoDB\n');

    const db = client.db(DATABASE_NAME);
    const eventsCollection = db.collection('merged_events');

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
