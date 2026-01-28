import { getDb } from '../lib/mongodb';

/**
 * Ensure database indexes exist for optimal performance
 * 
 * This script should be run on deployment or database setup.
 * Run with: npx ts-node scripts/ensure-indexes.ts
 */
export async function ensureIndexes() {
    console.log('Ensuring database indexes...');

    const db = await getDb();

    // Events collection indexes
    const eventsCollection = db.collection('merged_events');

    // Compound index for duplicate detection during GeoNet imports
    await eventsCollection.createIndex(
        { catalogue_id: 1, source_id: 1 },
        { name: 'catalogue_source_id_idx', background: true }
    );
    console.log('✓ Created index: catalogue_source_id_idx');

    // Index for time-based queries and sorting
    await eventsCollection.createIndex(
        { catalogue_id: 1, time: -1 },
        { name: 'catalogue_time_idx', background: true }
    );
    console.log('✓ Created index: catalogue_time_idx');

    // Index for magnitude filtering
    await eventsCollection.createIndex(
        { catalogue_id: 1, magnitude: 1 },
        { name: 'catalogue_magnitude_idx', background: true }
    );
    console.log('✓ Created index: catalogue_magnitude_idx');

    // Compound index for geographic queries
    await eventsCollection.createIndex(
        { catalogue_id: 1, latitude: 1, longitude: 1 },
        { name: 'catalogue_geo_idx', background: true }
    );
    console.log('✓ Created index: catalogue_geo_idx');

    // Catalogues collection indexes
    const cataloguesCollection = db.collection('catalogues');

    // Index for catalogue lookups by id
    await cataloguesCollection.createIndex(
        { id: 1 },
        { name: 'catalogue_id_idx', unique: true, background: true }
    );
    console.log('✓ Created index: catalogue_id_idx');

    // Index for name search
    await cataloguesCollection.createIndex(
        { name: 1 },
        { name: 'catalogue_name_idx', background: true }
    );
    console.log('✓ Created index: catalogue_name_idx');

    // Import history collection indexes
    const historyCollection = db.collection('import_history');

    await historyCollection.createIndex(
        { catalogue_id: 1, created_at: -1 },
        { name: 'import_history_idx', background: true }
    );
    console.log('✓ Created index: import_history_idx');

    console.log('All indexes created successfully!');
}

// Main execution
if (require.main === module) {
    ensureIndexes()
        .then(() => {
            console.log('Done.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Error creating indexes:', error);
            process.exit(1);
        });
}
