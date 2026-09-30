/**
 * Network-authority table for catalogue merging.
 *
 * The merge engine (lib/merge.ts) ranks reports of one earthquake partly by which network
 * published them: GeoNet outranks everyone inside New Zealand, JMA inside Japan, and a
 * global hierarchy (GeoNet, Global CMT, ISC, USGS, ...) applies elsewhere. That table used
 * to be two constants in lib/merge.ts. It now lives here so administrators can edit it
 * (PUT /api/settings/merge-authority) without a deployment, while the engine keeps reading a
 * plain in-memory table: `mergeCatalogues` / `previewMerge` load the stored table once with
 * loadMergeAuthority() and run inside runWithMergeAuthority(), and every helper deep in the
 * engine reads currentMergeAuthority() from AsyncLocalStorage, so concurrent merges never see
 * each other's tables and code outside a merge (tests, one-off scripts) gets the default.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { getDb } from './mongodb';
import {
  DEFAULT_MERGE_AUTHORITY,
  parseMergeAuthorityTable,
  type MergeAuthorityTable,
} from './merge-authority-table';

export {
  AGENCY_KEYS,
  DEFAULT_MERGE_AUTHORITY,
  parseMergeAuthorityTable,
  type AgencyKey,
  type AuthorityEntry,
  type MergeAuthorityTable,
  type RegionalAuthority,
} from './merge-authority-table';

// ============================================================================
// RUNNING TABLE
// ============================================================================

const authorityStorage = new AsyncLocalStorage<MergeAuthorityTable>();

/** Run `fn` with `table` as the authority every engine helper underneath it consults. */
export function runWithMergeAuthority<T>(table: MergeAuthorityTable, fn: () => Promise<T>): Promise<T> {
  return authorityStorage.run(table, fn);
}

/** The table of the enclosing runWithMergeAuthority, else the built-in default. */
export function currentMergeAuthority(): MergeAuthorityTable {
  return authorityStorage.getStore() ?? DEFAULT_MERGE_AUTHORITY;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

const SETTINGS_COLLECTION = 'settings';
const MERGE_AUTHORITY_KEY = 'merge_authority';

interface MergeAuthoritySettingsDoc {
  key: string;
  config: unknown;
  updatedAt?: Date;
  createdAt?: Date;
}

/**
 * A database fault or a corrupt document must not stop merging (the default table is
 * always a valid answer), but it must not be silent either. Each cause is logged once per
 * process so a long outage or a stuck bad document does not flood the log on every merge.
 */
const faultsLogged = new Set<string>();
function reportAuthorityFault(cause: 'unavailable' | 'invalid', detail: unknown) {
  if (faultsLogged.has(cause)) return;
  faultsLogged.add(cause);
  const message =
    cause === 'unavailable'
      ? '[Merge] Could not read the merge authority table from settings; merging with the built-in default:'
      : '[Merge] Stored merge authority table is invalid; merging with the built-in default:';
  console.error(message, detail instanceof Error ? detail.message : detail);
}

/**
 * The effective table: the administrator's saved one, or the default when nothing is saved,
 * the stored document fails validation or the database is unavailable.
 */
export async function loadMergeAuthority(): Promise<MergeAuthorityTable> {
  let doc: MergeAuthoritySettingsDoc | null;
  try {
    const db = await getDb();
    doc = await db.collection<MergeAuthoritySettingsDoc>(SETTINGS_COLLECTION).findOne({ key: MERGE_AUTHORITY_KEY });
  } catch (error) {
    reportAuthorityFault('unavailable', error);
    return DEFAULT_MERGE_AUTHORITY;
  }
  if (!doc) return DEFAULT_MERGE_AUTHORITY;

  const parsed = parseMergeAuthorityTable(doc.config);
  if (!parsed.ok) {
    reportAuthorityFault('invalid', parsed.error);
    return DEFAULT_MERGE_AUTHORITY;
  }
  const stored = doc.config as { updatedAt?: unknown } | null;
  const updatedAt =
    typeof stored?.updatedAt === 'string'
      ? stored.updatedAt
      : doc.updatedAt instanceof Date
        ? doc.updatedAt.toISOString()
        : new Date(0).toISOString();
  return { ...parsed.table, source: 'custom', updatedAt };
}

/** Upsert the table as the process-wide custom authority; returns it as stored. */
export async function saveMergeAuthority(table: MergeAuthorityTable): Promise<MergeAuthorityTable> {
  const now = new Date();
  const stored: MergeAuthorityTable = {
    hierarchy: table.hierarchy,
    regions: table.regions,
    source: 'custom',
    updatedAt: now.toISOString(),
  };
  const db = await getDb();
  await db.collection<MergeAuthoritySettingsDoc>(SETTINGS_COLLECTION).updateOne(
    { key: MERGE_AUTHORITY_KEY },
    {
      $set: { key: MERGE_AUTHORITY_KEY, config: stored, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
  return stored;
}

/** Remove the custom table so merges fall back to DEFAULT_MERGE_AUTHORITY. */
export async function resetMergeAuthority(): Promise<void> {
  const db = await getDb();
  await db.collection<MergeAuthoritySettingsDoc>(SETTINGS_COLLECTION).deleteOne({ key: MERGE_AUTHORITY_KEY });
}
