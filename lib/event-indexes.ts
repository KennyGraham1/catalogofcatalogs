import type { Collection } from 'mongodb';

/** Required by ingestion across batches and processes. Never substitute a nonunique index. */
export async function ensureEventIntegrityIndexes(collection: Pick<Collection, 'createIndex'>): Promise<void> {
  try {
    await collection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    await collection.createIndex(
      { catalogue_id: 1, source_id: 1 },
      {
        name: 'catalogue_source_id_unique_idx',
        unique: true,
        partialFilterExpression: { source_id: { $exists: true, $type: 'string' } },
      },
    );
  } catch (error) {
    throw new Error(
      'Required event uniqueness indexes could not be created. Inspect existing duplicates or conflicting index definitions, repair them, and rerun database setup. ' +
      (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
}
