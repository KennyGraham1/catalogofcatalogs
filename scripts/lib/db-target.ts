/**
 * Shared "connect exactly like the app does" helper for the standalone maintenance
 * and migration scripts in scripts/*.ts.
 *
 * Nine of these scripts used to resolve MONGODB_URI/MONGODB_DATABASE with their own
 * copy of the precedence rule (`process.env.MONGODB_DATABASE || 'earthquake_catalogue'`,
 * skipping the URI-path fallback lib/mongodb.ts's extractDatabaseName also applies).
 * Under the documented "optional override" setup (MONGODB_DATABASE unset, database
 * named in the MONGODB_URI path) they silently opened a different database than the
 * running app: 'earthquake_catalogue' while the app used the URI's database, and
 * reported success either way (finding gs#3). extractDatabaseName is not exported
 * from lib/mongodb.ts, so the only way to guarantee this module can never drift from
 * the app's resolution is to call into lib/mongodb.ts's own getDb() and read back the
 * real driver's `db.databaseName` — never re-derive the name here.
 *
 * lib/mongodb.ts computes its MONGODB_URI/DATABASE_NAME constants at module load
 * time. Unlike `next dev`/`next start`, a standalone `tsx scripts/foo.ts` run has no
 * framework that already loaded `.env` into process.env, so dotenv's config() must
 * finish before lib/mongodb.ts is first evaluated. A static top-level
 * `import ... from '../../lib/mongodb'` would defeat that: ES module evaluation runs
 * every statically-imported module's top-level code before this module's own body
 * (including a config() call written earlier in the file) ever runs. The import is
 * therefore deferred to a dynamic import() inside resolveDbTarget(), called only
 * after loadEnvOnce() has returned.
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import type { Db } from 'mongodb';

let envLoaded = false;

/** Load .env once (idempotent — safe to call from every script's entry point). */
function loadEnvOnce(): void {
  if (envLoaded) return;
  envLoaded = true;
  config({ path: resolve(__dirname, '../../.env') });
}

/**
 * The host portion of a MongoDB URI only — never the credentials (finding gs#4:
 * these scripts used to log the full URI, password included). `new URL` throws on
 * some legacy non-standard mongodb:// forms, so a parse failure falls back to a
 * fixed placeholder rather than ever printing the raw string.
 */
export function safeHostFromUri(uri: string): string {
  try {
    const url = new URL(uri);
    return url.host || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}

export interface DbTarget {
  db: Db;
  /** Credential-free host, safe to print (gs#4). */
  host: string;
  isAtlas: boolean;
  /** Closes the shared lib/mongodb.ts client. Safe to call even if never connected. */
  close: () => Promise<void>;
}

/**
 * Connect exactly as the running app does (same env precedence, same driver
 * singleton) and return the resolved Db plus a printable, credential-free host.
 * Every owned script that touches MongoDB should get its Db from here instead of
 * constructing its own MongoClient.
 */
export async function resolveDbTarget(): Promise<DbTarget> {
  loadEnvOnce();
  const mongodb = await import('../../lib/mongodb');
  const db = await mongodb.getDb();
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  return {
    db,
    host: safeHostFromUri(uri),
    isAtlas: uri.startsWith('mongodb+srv://'),
    close: () => mongodb.closeConnection(),
  };
}
