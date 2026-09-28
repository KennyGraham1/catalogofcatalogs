/**
 * Backfill stored event quality scores (contract C1).
 *
 * Events stored before quality_score / quality_grade were persisted carry neither, so
 * the Quality column, the 'With Quality Score' count, quality sorting and the minQuality
 * filter skip them. This computes both exactly as inserts do (lib/db.ts
 * eventQualityFields: lib/quality-scoring.ts with the default weights) for every event
 * that lacks a finite score or a valid grade.
 *
 *   npx tsx scripts/backfill-quality-scores.ts            # dry run: report only
 *   npx tsx scripts/backfill-quality-scores.ts --apply    # write the scores
 *   npx tsx scripts/backfill-quality-scores.ts --apply --all
 *       # recompute every event, e.g. after the scoring rules changed
 *
 * Idempotent: a second run finds nothing to do. It uses the application's database
 * (lib/mongodb.ts: MONGODB_URI / MONGODB_DATABASE, also read from .env) and prints only
 * the database name, never the connection string. Scores are derived from fields the
 * events already have, so no catalogue version changes; running servers are told to
 * drop cached event pages of the catalogues it touched.
 */

import type { AnyBulkWriteOperation, Db, Document } from 'mongodb';

const GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];
const QUALITY_INPUT_PROJECTION = {
  catalogue_id: 1, latitude: 1, quality_score: 1, quality_grade: 1,
  time_uncertainty: 1, latitude_uncertainty: 1, longitude_uncertainty: 1, depth_uncertainty: 1,
  horizontal_uncertainty: 1, max_horizontal_uncertainty: 1, magnitude_uncertainty: 1,
  magnitude_station_count: 1, azimuthal_gap: 1, used_station_count: 1, used_phase_count: 1,
  standard_error: 1, evaluation_mode: 1, evaluation_status: 1,
};

export interface BackfillOptions {
  /** Write the scores. The default only reports what would change. */
  apply?: boolean;
  /** Recompute every event, not only those without a valid stored score. */
  all?: boolean;
  batchSize?: number;
  log?: (line: string) => void;
}

export interface BackfillReport {
  examined: number;
  /** Events whose stored score or grade differs from the computed one. */
  changed: number;
  byCatalogue: Record<string, number>;
  applied: boolean;
}

export async function backfillQualityScores(db: Pick<Db, 'collection'>, options: BackfillOptions = {}): Promise<BackfillReport> {
  const { eventQualityFields, markCatalogueDataChanged } = await import('../lib/db');
  const { COLLECTIONS } = await import('../lib/mongodb');
  const log = options.log ?? console.log;
  const batchSize = options.batchSize ?? 1000;
  const events = db.collection(COLLECTIONS.EVENTS);

  const filter: Document = options.all ? {} : {
    $or: [
      { quality_score: { $not: { $type: 'number' } } },
      { quality_score: NaN },
      { quality_grade: { $nin: GRADES } },
    ],
  };

  const report: BackfillReport = { examined: 0, changed: 0, byCatalogue: {}, applied: Boolean(options.apply) };
  let batch: AnyBulkWriteOperation<Document>[] = [];
  const flush = async () => {
    if (options.apply && batch.length > 0) await events.bulkWrite(batch, { ordered: false });
    batch = [];
  };

  for await (const row of events.find(filter, { projection: QUALITY_INPUT_PROJECTION })) {
    report.examined++;
    // Recompute from the event's own fields: a stored score is exactly what is being
    // repaired (or, with --all, re-derived).
    const { quality_score, quality_grade } = eventQualityFields({ ...row, quality_score: undefined });
    if (row.quality_score === quality_score && row.quality_grade === quality_grade) continue;
    report.changed++;
    const catalogueId = String(row.catalogue_id);
    report.byCatalogue[catalogueId] = (report.byCatalogue[catalogueId] ?? 0) + 1;
    batch.push({ updateOne: { filter: { _id: row._id }, update: { $set: { quality_score, quality_grade } } } });
    if (batch.length >= batchSize) await flush();
  }
  await flush();

  if (options.apply && report.changed > 0) {
    await markCatalogueDataChanged(Object.keys(report.byCatalogue));
  }

  for (const [catalogueId, count] of Object.entries(report.byCatalogue).sort()) {
    log(`  ${catalogueId}: ${count} event(s) ${options.apply ? 'scored' : 'to score'}`);
  }
  log(`${report.examined} event(s) examined, ${report.changed} ${options.apply ? 'updated' : 'would be updated'}.`);
  if (!options.apply && report.changed > 0) log('Dry run: nothing was written. Rerun with --apply to store the scores.');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  (async () => {
    // Loads .env before lib/mongodb reads the environment.
    await import('dotenv/config');
    const { getDb, closeConnection } = await import('../lib/mongodb');
    try {
      const db = await getDb();
      console.log(`Quality-score backfill (${args.includes('--apply') ? 'APPLY' : 'dry run'}${args.includes('--all') ? ', all events' : ''}) in database ${db.databaseName}`);
      await backfillQualityScores(db, { apply: args.includes('--apply'), all: args.includes('--all') });
    } finally {
      await closeConnection();
    }
  })().then(
    () => process.exit(0),
    (error) => {
      console.error('Backfill failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
