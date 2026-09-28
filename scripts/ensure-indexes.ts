// Loads .env before lib/mongodb reads the environment.
import 'dotenv/config';
import { closeConnection, getDb } from '../lib/mongodb';
import { ensureDatabaseIndexes, type IndexSetupReport } from '../lib/event-indexes';

/**
 * Ensure database indexes exist for optimal performance and data integrity.
 * Run on deployment / DB setup:  npx tsx scripts/ensure-indexes.ts
 *
 * Applies the shared index list in lib/event-indexes.ts, the same one
 * scripts/init-database.ts and scripts/create-indexes.ts apply, so all three agree on
 * every index name and none aborts on an index another created.
 */
export async function ensureIndexes(): Promise<IndexSetupReport> {
  console.log('Ensuring database indexes...');
  const db = await getDb();
  const report = await ensureDatabaseIndexes(db);
  if (report.failed.length > 0) {
    throw new Error(`${report.failed.length} index(es) could not be ensured: ${report.failed.map((f) => f.index).join(', ')}`);
  }
  console.log('All indexes ensured successfully!');
  return report;
}

if (require.main === module) {
  ensureIndexes()
    .then(async () => { await closeConnection(); console.log('Done.'); process.exit(0); })
    .catch(async (error) => {
      console.error('Error creating indexes:', error instanceof Error ? error.message : error);
      await closeConnection().catch(() => undefined);
      process.exit(1);
    });
}
