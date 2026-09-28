/* eslint-disable no-console */
/**
 * Migration: normalise legacy depth_uncertainty / horizontal_uncertainty to KILOMETRES.
 *
 * Before commit 632a493, QuakeML imports stored Origin.depth.uncertainty and
 * OriginUncertainty.horizontalUncertainty in METRES, while the rest of the app
 * treats these columns as km (validation caps at 100 km, GeoNet QS thresholds top
 * out at 50/80 km, cross-field checks compare against depth-in-km). New imports now
 * store km. This one-time migration fixes legacy rows.
 *
 * Selection is by PROVENANCE, not size (finding gs#0): a size threshold treats a
 * well-constrained 80 m legacy row as "already km" (left at a nonsensical 80 km)
 * while dividing a genuinely poorly-constrained, already-correct 150 km row by
 * 1000 again. Every legacy row's `origins` JSON blob still carries the true raw
 * metre value from the parser (which never divides), so comparing the flat column
 * to that raw value tells unconverted rows (ratio ~1, any size) apart from
 * already-correct ones (ratio ~0.001) unambiguously — see scripts/lib/
 * uncertainty-provenance.ts. Rows with no `origins` JSON (CSV-derived — never had
 * a metres-legacy phase) are left untouched.
 *
 * Idempotent: every scanned row is marked `uncertainty_units: 'km'` once fully
 * resolved, and re-runs only look at rows without that marker — a re-run is a
 * fast no-op, not a repeat conversion (the previous size-based version divided by
 * 1000 again on every re-run for any row still above the threshold).
 *
 * A converted value that would still fail the app's own EVENT_OPTIONAL_RANGES
 * (e.g. a 150,000 m raw uncertainty — still 150 km after conversion) is reported
 * and cleared (set to null) rather than written: a silently out-of-range value is
 * worse than an absent one, which the rest of the app already treats as
 * "unconstrained".
 *
 * Dry run by default — nothing is written unless --write is passed, and writing
 * requires typing back the resolved database name (or --yes for scripted use).
 *
 *   npx tsx scripts/migrate-uncertainty-units.ts                # dry run (default)
 *   npx tsx scripts/migrate-uncertainty-units.ts --write         # apply, interactive confirm
 *   npx tsx scripts/migrate-uncertainty-units.ts --write --yes   # apply, no prompt
 */

import { COLLECTIONS } from '../lib/mongodb';
import { optionalFieldInRange } from '../lib/db';
import { resolveDbTarget } from './lib/db-target';
import { confirmWrite } from './lib/confirm';
import {
  decideUncertaintyConversion,
  UNCERTAINTY_FIELDS,
  type OriginLike,
} from './lib/uncertainty-provenance';

const WRITE = process.argv.includes('--write');
const ASSUME_YES = process.argv.includes('--yes');
const BATCH_SIZE = 500;

interface LegacyEventDoc {
  id: string;
  preferred_origin_id?: string | null;
  origins?: string | null;
  depth_uncertainty?: number | null;
  horizontal_uncertainty?: number | null;
  uncertainty_units?: string | null;
}

interface PendingUpdate {
  id: string;
  set: Record<string, number | null | string>;
}

export async function run(): Promise<void> {
  console.log(`Migration: normalise uncertainty units to km (provenance-based)${WRITE ? '' : ' — DRY RUN'}\n`);

  const target = await resolveDbTarget();

  if (WRITE) {
    const decision = await confirmWrite(
      target,
      `This will REWRITE depth_uncertainty/horizontal_uncertainty values on legacy rows in ` +
        `database "${target.db.databaseName}".`,
      target.db.databaseName,
      ASSUME_YES,
    );
    if (!decision.ok) {
      console.error(`❌ ${decision.reason}`);
      await target.close();
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(`   Host: ${target.host}\n   Database: ${target.db.databaseName}\n`);
  }

  // Untyped (default Document) collection handle: the filter below is built with a
  // computed $or over UNCERTAINTY_FIELDS, which a strict Filter<LegacyEventDoc>
  // would fight; each yielded document is cast to LegacyEventDoc individually below.
  const events = target.db.collection(COLLECTIONS.EVENTS);

  // Only rows carrying origins provenance, not already marked done, and with at
  // least one of the two flat fields present.
  const filter = {
    uncertainty_units: { $ne: 'km' },
    origins: { $exists: true, $ne: null },
    $or: UNCERTAINTY_FIELDS.map((field) => ({ [field]: { $exists: true, $ne: null } })),
  };

  const cursor = events.find(filter);

  let scanned = 0;
  let convertedDocs = 0;
  let alreadyKmDocs = 0;
  let unresolvedDocs = 0;
  let nulledOutOfRange = 0;
  const outOfRangeReport: string[] = [];
  const pending: PendingUpdate[] = [];

  const flush = async (): Promise<void> => {
    if (!WRITE || pending.length === 0) {
      pending.length = 0;
      return;
    }
    await events.bulkWrite(
      pending.map((u) => ({ updateOne: { filter: { id: u.id }, update: { $set: u.set } } })),
      { ordered: false },
    );
    pending.length = 0;
  };

  for await (const raw of cursor) {
    const doc = raw as unknown as LegacyEventDoc;
    scanned++;

    let origins: OriginLike[] | null = null;
    try {
      origins = doc.origins ? (JSON.parse(doc.origins) as OriginLike[]) : null;
    } catch {
      origins = null;
    }

    const set: Record<string, number | null | string> = {};
    let anyConverted = false;
    let anyUnresolved = false;

    for (const field of UNCERTAINTY_FIELDS) {
      const stored = doc[field];
      if (stored == null) continue;

      const decision = decideUncertaintyConversion(stored, origins, doc.preferred_origin_id, field);
      if (decision.action === 'convert') {
        anyConverted = true;
        if (optionalFieldInRange(field, decision.newValueKm)) {
          set[field] = decision.newValueKm;
        } else {
          set[field] = null;
          nulledOutOfRange++;
          outOfRangeReport.push(
            `  ! ${doc.id}: ${field} ${stored} -> ${decision.newValueKm.toFixed(3)} km is outside the ` +
              'valid range; cleared instead of written',
          );
        }
      } else if (decision.action === 'no-origin-data') {
        anyUnresolved = true;
      }
      // 'leave' -> already a correct km value; nothing to write for this field.
    }

    if (anyConverted) convertedDocs++;
    else if (!anyUnresolved) alreadyKmDocs++;
    if (anyUnresolved) unresolvedDocs++;
    else set.uncertainty_units = 'km'; // fully resolved (converted or confirmed already-km) -> mark done

    if (Object.keys(set).length > 0) {
      pending.push({ id: doc.id, set });
      if (pending.length >= BATCH_SIZE) await flush();
    }
  }
  await flush();

  console.log(`Scanned: ${scanned}`);
  console.log(`  Converted (metres -> km): ${convertedDocs}`);
  console.log(`  Already correct (km, confirmed by provenance): ${alreadyKmDocs}`);
  console.log(`  Left unresolved (no usable origins provenance): ${unresolvedDocs}`);
  if (nulledOutOfRange > 0) {
    console.log(`  Cleared for being out of range after conversion: ${nulledOutOfRange}`);
    console.log(outOfRangeReport.slice(0, 50).join('\n'));
    if (outOfRangeReport.length > 50) console.log(`  ... and ${outOfRangeReport.length - 50} more`);
  }

  if (!WRITE) console.log('\nDry run only — no changes written. Re-run with --write to apply.');
  else console.log('\n✓ Migration complete.');

  await target.close();
}

if (require.main === module) {
  run().catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  });
}
