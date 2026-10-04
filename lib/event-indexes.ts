import type { Collection, Db, Document } from 'mongodb';
import { COLLECTIONS } from './mongodb';

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

export interface IndexDefinition {
  collection: string;
  name: string;
  key: Record<string, 1 | -1>;
  options?: {
    unique?: boolean;
    expireAfterSeconds?: number;
    partialFilterExpression?: Document;
  };
}

/**
 * Unique per owner and slot: makes the per-user saved-filter cap hold under concurrent
 * requests (lib/db.ts insertSavedFilter, which also creates it on first use). Filters
 * saved before slots existed carry none and are exempt.
 */
export const SAVED_FILTER_SLOT_INDEX = {
  key: { owner_id: 1, slot: 1 } as Record<string, 1>,
  options: { name: 'saved_filters_owner_slot_idx', unique: true, partialFilterExpression: { slot: { $exists: true } } },
};

const unique = { unique: true } as const;
const idIndex = (collection: string): IndexDefinition => ({ collection, name: 'idx_id', key: { id: 1 }, options: unique });

/**
 * Every index the application relies on, under ONE name each. scripts/init-database.ts,
 * scripts/create-indexes.ts and scripts/ensure-indexes.ts all apply this list through
 * ensureDatabaseIndexes. They used to create the same key patterns under three
 * different names, and MongoDB refuses a second index on a key pattern that already
 * exists under another name (IndexOptionsConflict, code 85): the documented
 * init-then-create-indexes sequence exited 1, and ensure-indexes aborted before its
 * later indexes.
 *
 * The event uniqueness indexes are not listed: ensureEventIntegrityIndexes creates
 * them first and fails the setup if it cannot.
 */
export const DATABASE_INDEXES: ReadonlyArray<IndexDefinition> = [
  // Events: every per-catalogue read is prefixed by catalogue_id. The time/id index
  // serves the newest-first paging order ({time: -1, id: -1}) and the cursor queries.
  { collection: COLLECTIONS.EVENTS, name: 'catalogue_time_id_idx', key: { catalogue_id: 1, time: -1, id: -1 } },
  { collection: COLLECTIONS.EVENTS, name: 'catalogue_magnitude_idx', key: { catalogue_id: 1, magnitude: 1 } },
  { collection: COLLECTIONS.EVENTS, name: 'catalogue_depth_idx', key: { catalogue_id: 1, depth: 1 } },
  { collection: COLLECTIONS.EVENTS, name: 'catalogue_geo_idx', key: { catalogue_id: 1, latitude: 1, longitude: 1 } },
  { collection: COLLECTIONS.EVENTS, name: 'catalogue_event_type_idx', key: { catalogue_id: 1, event_type: 1 } },
  // Filtering by the stored quality score (minQuality) and sorting by it.
  { collection: COLLECTIONS.EVENTS, name: 'catalogue_quality_idx', key: { catalogue_id: 1, quality_score: -1 } },
  // The merge review queue and its counts (M3): only rows that carry the column, i.e.
  // merged rows; imported rows never do.
  {
    collection: COLLECTIONS.EVENTS,
    name: 'catalogue_review_status_idx',
    key: { catalogue_id: 1, review_status: 1 },
    options: { partialFilterExpression: { review_status: { $exists: true } } },
  },
  // The cross-catalogue event search sorts by {time: -1, id: -1} with no catalogue
  // prefix; without this index that sort is a blocking in-memory sort.
  { collection: COLLECTIONS.EVENTS, name: 'time_id_idx', key: { time: -1, id: -1 } },

  idIndex(COLLECTIONS.CATALOGUES),
  { collection: COLLECTIONS.CATALOGUES, name: 'catalogues_created_at_idx', key: { created_at: -1 } },
  { collection: COLLECTIONS.CATALOGUES, name: 'catalogues_name_idx', key: { name: 1 } },
  { collection: COLLECTIONS.CATALOGUES, name: 'catalogues_status_idx', key: { status: 1 } },

  // One merge QC summary per merged catalogue (lib/merge-qc.ts), read by catalogue id.
  {
    collection: COLLECTIONS.MERGE_QC_SUMMARIES,
    name: 'merge_qc_catalogue_unique_idx',
    key: { catalogue_id: 1 },
    options: unique,
  },

  idIndex(COLLECTIONS.MAPPING_TEMPLATES),
  { collection: COLLECTIONS.MAPPING_TEMPLATES, name: 'idx_name', key: { name: 1 } },

  idIndex(COLLECTIONS.IMPORT_HISTORY),
  { collection: COLLECTIONS.IMPORT_HISTORY, name: 'import_history_catalogue_idx', key: { catalogue_id: 1, created_at: -1 } },

  idIndex(COLLECTIONS.SAVED_FILTERS),
  { collection: COLLECTIONS.SAVED_FILTERS, name: 'saved_filters_owner_idx', key: { owner_id: 1, created_at: -1 } },
  {
    collection: COLLECTIONS.SAVED_FILTERS,
    name: SAVED_FILTER_SLOT_INDEX.options.name,
    key: SAVED_FILTER_SLOT_INDEX.key,
    options: { unique: true, partialFilterExpression: SAVED_FILTER_SLOT_INDEX.options.partialFilterExpression },
  },

  idIndex(COLLECTIONS.USERS),
  { collection: COLLECTIONS.USERS, name: 'idx_email', key: { email: 1 }, options: unique },
  { collection: COLLECTIONS.USERS, name: 'users_role_idx', key: { role: 1 } },

  idIndex(COLLECTIONS.SESSIONS),
  { collection: COLLECTIONS.SESSIONS, name: 'idx_user_id', key: { user_id: 1 } },
  { collection: COLLECTIONS.SESSIONS, name: 'idx_token', key: { token: 1 } },
  { collection: COLLECTIONS.SESSIONS, name: 'idx_expires_at', key: { expires_at: 1 }, options: { expireAfterSeconds: 0 } },

  idIndex(COLLECTIONS.PASSWORD_RESET_TOKENS),
  { collection: COLLECTIONS.PASSWORD_RESET_TOKENS, name: 'idx_user_id', key: { user_id: 1 } },
  { collection: COLLECTIONS.PASSWORD_RESET_TOKENS, name: 'idx_token_hash', key: { token_hash: 1 }, options: unique },
  { collection: COLLECTIONS.PASSWORD_RESET_TOKENS, name: 'idx_expires_at', key: { expires_at: 1 }, options: { expireAfterSeconds: 0 } },

  idIndex(COLLECTIONS.ROLE_REQUESTS),
  { collection: COLLECTIONS.ROLE_REQUESTS, name: 'role_requests_user_idx', key: { user_id: 1, status: 1 } },
  { collection: COLLECTIONS.ROLE_REQUESTS, name: 'role_requests_status_idx', key: { status: 1, created_at: -1 } },

  idIndex(COLLECTIONS.NOTIFICATIONS),
  { collection: COLLECTIONS.NOTIFICATIONS, name: 'notifications_user_idx', key: { user_id: 1, created_at: -1 } },
  { collection: COLLECTIONS.NOTIFICATIONS, name: 'idx_read_at', key: { read_at: 1 } },

  idIndex(COLLECTIONS.API_KEYS),
  { collection: COLLECTIONS.API_KEYS, name: 'idx_user_id', key: { user_id: 1 } },
  { collection: COLLECTIONS.API_KEYS, name: 'idx_key_prefix', key: { key_prefix: 1 } },

  // Audit entries carry actor_id / target_id (never user_id). Entries written before
  // they carried an `id` are exempt from its uniqueness.
  {
    collection: COLLECTIONS.AUDIT_LOGS, name: 'idx_id', key: { id: 1 },
    options: { unique: true, partialFilterExpression: { id: { $exists: true } } },
  },
  { collection: COLLECTIONS.AUDIT_LOGS, name: 'audit_created_at_idx', key: { created_at: -1 } },
  { collection: COLLECTIONS.AUDIT_LOGS, name: 'audit_actor_idx', key: { actor_id: 1, created_at: -1 } },
  { collection: COLLECTIONS.AUDIT_LOGS, name: 'audit_target_idx', key: { target_id: 1, created_at: -1 } },
];

export interface IndexSetupReport {
  created: string[];
  /** Satisfied by an index that already had this key pattern (under any name). */
  existing: string[];
  failed: Array<{ index: string; error: string }>;
}

interface ExistingIndex {
  name?: string;
  key: Record<string, unknown>;
  unique?: boolean;
  expireAfterSeconds?: number;
}

function sameKeyPattern(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ea = Object.entries(a);
  const eb = Object.entries(b);
  return ea.length === eb.length && ea.every(([field, dir], i) => eb[i][0] === field && Number(eb[i][1]) === Number(dir));
}

/**
 * Create every index in DATABASE_INDEXES that is missing. An index whose KEY PATTERN
 * already exists is left alone whatever its name, since MongoDB would reject the
 * duplicate; it only counts as a failure when it lacks a property the application
 * relies on (uniqueness, a TTL). Idempotent: a second run creates nothing.
 */
export async function ensureDatabaseIndexes(
  db: Pick<Db, 'collection'>,
  log: (line: string) => void = console.log
): Promise<IndexSetupReport> {
  await ensureEventIntegrityIndexes(db.collection(COLLECTIONS.EVENTS));
  log(`✓ ${COLLECTIONS.EVENTS}: event uniqueness indexes`);

  return ensureIndexDefinitions(db, DATABASE_INDEXES, log);
}

/**
 * Create each index in `definitions` that is missing, by the same key-pattern rule as
 * ensureDatabaseIndexes. Also used by scripts/migrate-auth-schema.ts, whose users.role
 * index is in DATABASE_INDEXES too: creating it there under another name made the
 * migration fail on any database init-database had already set up.
 */
export async function ensureIndexDefinitions(
  db: Pick<Db, 'collection'>,
  definitions: ReadonlyArray<IndexDefinition>,
  log: (line: string) => void = console.log
): Promise<IndexSetupReport> {
  const report: IndexSetupReport = { created: [], existing: [], failed: [] };

  for (const def of definitions) {
    const label = `${def.collection}.${def.name}`;
    const collection = db.collection(def.collection);

    let existing: ExistingIndex[];
    try {
      existing = (await collection.indexes()) as ExistingIndex[];
    } catch (error) {
      // NamespaceNotFound: the collection does not exist yet; createIndex creates it.
      if ((error as { code?: number })?.code !== 26) {
        report.failed.push({ index: label, error: error instanceof Error ? error.message : String(error) });
        log(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      existing = [];
    }

    const match = existing.find((index) => sameKeyPattern(index.key, def.key));
    if (match) {
      const problems: string[] = [];
      if (def.options?.unique && !match.unique) problems.push('it is not unique');
      if (def.options?.expireAfterSeconds !== undefined && match.expireAfterSeconds !== def.options.expireAfterSeconds) {
        problems.push(`its TTL is ${match.expireAfterSeconds ?? 'unset'}, not ${def.options.expireAfterSeconds}`);
      }
      if (problems.length > 0) {
        const error = `an index on the same keys exists as ${match.name} but ${problems.join(' and ')}; drop it and rerun`;
        report.failed.push({ index: label, error });
        log(`✗ ${label}: ${error}`);
      } else {
        report.existing.push(label);
        log(`  ${label} already present${match.name !== def.name ? ` (as ${match.name})` : ''}`);
      }
      continue;
    }

    try {
      await collection.createIndex(def.key, { name: def.name, ...(def.options ?? {}) });
      report.created.push(label);
      log(`✓ ${label}`);
    } catch (error) {
      report.failed.push({ index: label, error: error instanceof Error ? error.message : String(error) });
      log(`✗ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return report;
}
