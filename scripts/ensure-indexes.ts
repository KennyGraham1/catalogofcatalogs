import { getDb, COLLECTIONS } from '../lib/mongodb';

/**
 * Ensure database indexes exist for optimal performance and data integrity.
 * Run on deployment / DB setup:  npx tsx scripts/ensure-indexes.ts
 *
 * Uses the canonical COLLECTIONS names (previously this script targeted the wrong
 * 'catalogues' collection, so the unique id index never took effect).
 */
export async function ensureIndexes() {
  console.log('Ensuring database indexes...');
  const db = await getDb();

  const eventsCollection = db.collection(COLLECTIONS.EVENTS);

  // Partial UNIQUE index on (catalogue_id, source_id) — makes re-imports idempotent
  // and prevents duplicate events. Partial so events without a source_id are exempt.
  // Creation fails if legacy duplicates already exist; in that case de-duplicate first
  // (see notes below) — we fall back to a non-unique index rather than abort the run.
  try {
    await eventsCollection.createIndex(
      { catalogue_id: 1, source_id: 1 },
      {
        name: 'catalogue_source_id_unique_idx',
        unique: true,
        partialFilterExpression: { source_id: { $exists: true, $type: 'string' } },
        background: true,
      }
    );
    console.log('✓ Created UNIQUE index: catalogue_source_id_unique_idx');
  } catch (err) {
    console.warn(
      '⚠ Could not create UNIQUE (catalogue_id, source_id) index (likely pre-existing duplicates). ' +
      'De-duplicate events, then re-run. Falling back to a non-unique index.',
      (err as Error)?.message
    );
    await eventsCollection.createIndex(
      { catalogue_id: 1, source_id: 1 },
      { name: 'catalogue_source_id_idx', background: true }
    );
    console.log('✓ Created index: catalogue_source_id_idx (non-unique fallback)');
  }

  await eventsCollection.createIndex({ catalogue_id: 1, time: -1 }, { name: 'catalogue_time_idx', background: true });
  console.log('✓ Created index: catalogue_time_idx');
  await eventsCollection.createIndex({ catalogue_id: 1, magnitude: 1 }, { name: 'catalogue_magnitude_idx', background: true });
  console.log('✓ Created index: catalogue_magnitude_idx');
  await eventsCollection.createIndex({ catalogue_id: 1, latitude: 1, longitude: 1 }, { name: 'catalogue_geo_idx', background: true });
  console.log('✓ Created index: catalogue_geo_idx');

  const cataloguesCollection = db.collection(COLLECTIONS.CATALOGUES);
  await cataloguesCollection.createIndex({ id: 1 }, { name: 'catalogue_id_idx', unique: true, background: true });
  console.log('✓ Created index: catalogue_id_idx');
  await cataloguesCollection.createIndex({ name: 1 }, { name: 'catalogue_name_idx', background: true });
  console.log('✓ Created index: catalogue_name_idx');

  const historyCollection = db.collection(COLLECTIONS.IMPORT_HISTORY);
  await historyCollection.createIndex({ catalogue_id: 1, created_at: -1 }, { name: 'import_history_idx', background: true });
  console.log('✓ Created index: import_history_idx');

  console.log('All indexes ensured successfully!');
}

if (require.main === module) {
  ensureIndexes()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((error) => { console.error('Error creating indexes:', error); process.exit(1); });
}
