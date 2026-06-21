/* eslint-disable no-console */
/**
 * Migration: normalize legacy depth_uncertainty / horizontal_uncertainty to KILOMETRES.
 *
 * Before the unit-convention fix, QuakeML imports stored depth.uncertainty and
 * OriginUncertainty.horizontalUncertainty in METRES, while the rest of the app
 * treats these columns as km (validation caps at 100 km, GeoNet QS thresholds top
 * out at 50/80 km, cross-field checks compare against depth-in-km). New imports now
 * store km. This one-time migration divides legacy rows by 1000.
 *
 * Safe heuristic: only rows whose value is IMPLAUSIBLE for km (> 100, i.e. > 100 km)
 * are converted — genuine km uncertainties are <= ~100, while metre-valued legacy
 * rows are typically hundreds-to-thousands. Run with --dry to preview.
 *
 *   npx tsx scripts/migrate-uncertainty-units.ts [--dry]
 */

import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'earthquake_catalogue';
const THRESHOLD_KM = 100; // values above this are assumed to be metres-valued legacy rows
const DRY = process.argv.includes('--dry');

async function run() {
  console.log(`Migration: normalize uncertainty units to km${DRY ? ' (DRY RUN)' : ''}`);
  console.log(`   URI: ${MONGODB_URI}\n   Database: ${DATABASE_NAME}\n   Threshold: > ${THRESHOLD_KM} treated as metres\n`);
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const events = client.db(DATABASE_NAME).collection('merged_events');

    for (const field of ['depth_uncertainty', 'horizontal_uncertainty'] as const) {
      const filter = { [field]: { $gt: THRESHOLD_KM } };
      const count = await events.countDocuments(filter);
      console.log(`${field}: ${count} row(s) with ${field} > ${THRESHOLD_KM} (likely metres)`);
      if (count > 0 && !DRY) {
        const res = await events.updateMany(filter, [{ $set: { [field]: { $divide: [`$${field}`, 1000] } } }]);
        console.log(`  → converted ${res.modifiedCount} row(s) to km`);
      }
    }
    if (DRY) console.log('\nDry run only — no changes written. Re-run without --dry to apply.');
    else console.log('\n✓ Migration complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
