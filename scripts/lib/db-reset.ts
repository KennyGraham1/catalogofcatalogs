/**
 * Guarded MongoDB reset used by scripts/clean-database.js and
 * scripts/clean-and-setup-database.sh (finding gs#5).
 *
 * The "Cleaning Database" step in both scripts only ever unlinked
 * merged_catalogues.db, a SQLite file left over from before SQLite was removed
 * (a542dc1) — it never touched MongoDB, so "clean" catalogues and events
 * survived every run. Their next step, populating test data, shelled out to
 * scripts/populate-realistic-nz-data.ts, deleted in 401ffa0, so clean-database.js
 * has failed at that step for as long as the app has used MongoDB, and the .sh
 * variant (no `set -e`) printed "Database setup complete!" anyway.
 *
 * This resets the way the old SQLite step actually did (drop the whole database,
 * then let init-database.ts recreate empty collections/indexes) instead of
 * depending on the still-missing population script, and requires the operator to
 * type back the resolved database name first — the same guard the uncertainty
 * migration uses (gs#3), so a stray MONGODB_URI can never wipe the wrong database
 * silently. A dev/test tool that actually resets MongoDB is more useful here than
 * one that only ever fails, which is why this rewrites rather than removes them;
 * the missing population step is dropped, not restored (see the two callers for
 * the guidance printed in its place).
 */
import { resolveDbTarget } from './db-target';
import { confirmWrite } from './confirm';

export interface ResetSummary {
  database: string;
  dropped: boolean;
}

/** The actual reset action, isolated from CLI/confirmation so tests can use a fake `db`. */
export async function resetDatabase(
  db: { databaseName: string; dropDatabase: () => Promise<unknown> },
): Promise<ResetSummary> {
  await db.dropDatabase();
  return { database: db.databaseName, dropped: true };
}

async function main(): Promise<void> {
  const assumeYes = process.argv.includes('--yes');
  const target = await resolveDbTarget();

  const decision = await confirmWrite(
    target,
    `This will PERMANENTLY DELETE ALL DATA in database "${target.db.databaseName}" on ` +
      `"${target.host}" (every catalogue, event, user and session) so it can be recreated empty.`,
    target.db.databaseName,
    assumeYes,
  );

  if (!decision.ok) {
    console.error(`❌ ${decision.reason}`);
    await target.close();
    process.exitCode = 1;
    return;
  }

  const summary = await resetDatabase(target.db);
  console.log(`✓ Dropped database "${summary.database}"`);
  await target.close();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Database reset failed:', error);
    process.exitCode = 1;
  });
}
