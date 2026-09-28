/**
 * Credential-login throttling for NextAuth's `authorize`.
 *
 * Shared, atomic MongoDB counters in fixed 15-minute windows, checked before the user
 * lookup and bcrypt so refused attempts cost almost nothing. Restarting a server or
 * switching instances cannot reset a quota.
 *
 * - (account, client): 10 failed attempts. The hard limit on guessing one account's
 *   password; cleared when that client signs in to the account.
 * - client: 50 failed attempts across all accounts. Caps password spraying.
 * - account: failures from every client together. Anyone can raise this count, so it
 *   never locks the account. Above 100 (the ceiling in NIST SP 800-63B 5.2.2) it is
 *   logged, and until the window ends only clients that have signed in to the account
 *   before - or completed a password reset from there - may keep trying. That bounds
 *   guessing spread over many (or forged) addresses without shutting the owner out of
 *   the clients they use.
 *
 * Each attempt is claimed before the password check, so concurrent guesses cannot race
 * past a limit, and handed back when the sign-in succeeds: successful logins are never
 * counted.
 *
 * Store failures: if the shared collection cannot be used, every instance enforces the
 * same limits from process memory and logs the fault until the store answers again.
 * Failing closed turned any limiter fault (a lost index permission, a timeout on this
 * one collection) into a site-wide login outage that lasted as long as the fault;
 * failing open would leave guessing unbounded. The fallback keeps both bounded, per
 * instance, for the duration of the fault. (A full MongoDB outage stops logins anyway:
 * the user lookup needs it.)
 */

import { createHash } from 'crypto';
import type { Collection } from 'mongodb';
import { getCollection, COLLECTIONS } from '../mongodb';
import { resolveClientIp, toHeaders } from '../rate-limiter';

const WINDOW_MS = 15 * 60 * 1000;
/** Failed attempts per (account, client) per window. */
const PAIR_LIMIT = 10;
/** Failed attempts per client, across accounts, per window. */
const CLIENT_LIMIT = 50;
/** Failed attempts per account per window above which only known clients may continue. */
const ACCOUNT_STEP_UP = 100;
/** How long a client stays known for an account after signing in to it. */
const KNOWN_CLIENT_MS = 30 * 24 * 60 * 60 * 1000;
const INDEX_RETRY_MS = 10 * 60 * 1000;
const FAULT_LOG_INTERVAL_MS = 60 * 1000;
const MEMORY_MAX_ENTRIES = 10_000;

type RawHeaders = Headers | Record<string, string | string[] | undefined>;
interface AttemptBucket { _id: string; attempts?: number; expires_at: Date }

/** Counter storage: the shared collection, or process memory while it is unavailable. */
interface BucketStore {
  /** Add one attempt to a bucket, atomically, and return the new count. */
  claim(id: string, expiresAt: Date): Promise<number>;
  /** Hand one attempt back. */
  refund(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  mark(id: string, expiresAt: Date): Promise<void>;
  isMarked(id: string): Promise<boolean>;
}

let indexReady = false;
let indexAttemptedAt = -Infinity;

/**
 * Expiry only cleans up: bucket ids carry their window, so counting is correct without
 * the TTL index. Failing to create it (e.g. the database role may not create indexes)
 * is therefore logged and retried later, never allowed to block a login.
 */
function ensureTtlIndex(collection: Collection<AttemptBucket>) {
  if (indexReady || Date.now() - indexAttemptedAt < INDEX_RETRY_MS) return;
  indexAttemptedAt = Date.now();
  collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }).then(
    () => { indexReady = true; },
    error => console.error(
      '[Auth] Could not create the auth_rate_limits TTL index; expired login-limiter ' +
      'entries will accumulate until it exists:',
      error instanceof Error ? error.message : error,
    ),
  );
}

function mongoStore(collection: Collection<AttemptBucket>): BucketStore {
  return {
    async claim(id, expiresAt) {
      const bucket = await collection.findOneAndUpdate(
        { _id: id },
        { $inc: { attempts: 1 }, $setOnInsert: { expires_at: expiresAt } },
        { upsert: true, returnDocument: 'after' },
      );
      if (!bucket) throw new Error('auth_rate_limits upsert returned no document');
      return bucket.attempts ?? 0;
    },
    async refund(id) {
      await collection.updateOne({ _id: id, attempts: { $gt: 0 } }, { $inc: { attempts: -1 } });
    },
    async remove(id) {
      await collection.deleteOne({ _id: id });
    },
    async mark(id, expiresAt) {
      await collection.updateOne({ _id: id }, { $set: { expires_at: expiresAt } }, { upsert: true });
    },
    async isMarked(id) {
      // The TTL monitor runs about once a minute, so check expiry here as well.
      return (await collection.findOne({ _id: id, expires_at: { $gt: new Date(Date.now()) } })) !== null;
    },
  };
}

const memoryBuckets = new Map<string, { count: number; expiresAt: number }>();

function memoryEntry(id: string) {
  const entry = memoryBuckets.get(id);
  if (entry && entry.expiresAt <= Date.now()) {
    memoryBuckets.delete(id);
    return undefined;
  }
  return entry;
}

function makeMemoryRoom() {
  const now = Date.now();
  for (const [id, entry] of Array.from(memoryBuckets)) {
    if (entry.expiresAt <= now) memoryBuckets.delete(id);
  }
  // Still full: drop the oldest entries (a Map iterates in insertion order).
  for (const id of Array.from(memoryBuckets.keys())) {
    if (memoryBuckets.size < MEMORY_MAX_ENTRIES) break;
    memoryBuckets.delete(id);
  }
}

/** Same limits, held per process; single-threaded, so each operation is atomic. */
const memoryStore: BucketStore = {
  async claim(id, expiresAt) {
    let entry = memoryEntry(id);
    if (!entry) {
      if (memoryBuckets.size >= MEMORY_MAX_ENTRIES) makeMemoryRoom();
      entry = { count: 0, expiresAt: expiresAt.getTime() };
      memoryBuckets.set(id, entry);
    }
    entry.count += 1;
    return entry.count;
  },
  async refund(id) {
    const entry = memoryEntry(id);
    if (entry && entry.count > 0) entry.count -= 1;
  },
  async remove(id) {
    memoryBuckets.delete(id);
  },
  async mark(id, expiresAt) {
    memoryBuckets.set(id, { count: 0, expiresAt: expiresAt.getTime() });
  },
  async isMarked(id) {
    return memoryEntry(id) !== undefined;
  },
};

let lastFaultLoggedAt = -Infinity;
function reportStoreFault(error: unknown) {
  if (Date.now() - lastFaultLoggedAt < FAULT_LOG_INTERVAL_MS) return;
  lastFaultLoggedAt = Date.now();
  console.error(
    '[Auth] Login limiter store unavailable; enforcing the same limits in process memory until it recovers:',
    error instanceof Error ? error.message : error,
  );
}

/** Run against the shared store, or against process memory if that fails. */
async function withStore<T>(run: (store: BucketStore) => Promise<T>): Promise<T> {
  try {
    const collection = await getCollection<AttemptBucket>(COLLECTIONS.AUTH_RATE_LIMITS);
    ensureTtlIndex(collection);
    return await run(mongoStore(collection));
  } catch (error) {
    reportStoreFault(error);
    return run(memoryStore);
  }
}

/** Hashed keys: the collection never holds an email address or an IP. */
function digest(...parts: string[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function currentWindow() {
  const window = Math.floor(Date.now() / WINDOW_MS);
  return { window, end: new Date((window + 1) * WINDOW_MS) };
}

// A request that carries no client address (never the case behind Next.js, which fills
// X-Forwarded-For in) is limited per account; it never shares a client bucket.
const pairId = (window: number, account: string, client: string | null) =>
  `${window}:${digest('pair', account, client ?? '')}`;
const knownId = (account: string, client: string) => `known:${digest('known', account, client)}`;

function requestKeys(email: string, rawHeaders: RawHeaders) {
  return {
    account: email.trim().toLowerCase(),
    client: resolveClientIp({ headers: toHeaders(rawHeaders) }),
  };
}

export interface CredentialAttempt {
  /**
   * Record a successful sign-in: it is not counted, this client's count for the
   * account starts again, and the client becomes known for the account.
   */
  succeeded(): Promise<void>;
}

/**
 * Claim one credential attempt before the password is checked. Returns null when the
 * attempt must be refused. An attempt that is never marked as succeeded stays counted
 * as a failure.
 */
export async function beginCredentialAttempt(email: string, rawHeaders: RawHeaders = {}): Promise<CredentialAttempt | null> {
  const { account, client } = requestKeys(email, rawHeaders);

  return withStore(async store => {
    const { window, end } = currentWindow();
    const clientBucket = client === null ? null : `${window}:${digest('client', client)}`;
    const pairBucket = pairId(window, account, client);
    const accountBucket = `${window}:${digest('account', account)}`;

    // Count the client first, so a blocked client cannot create unlimited account buckets.
    if (clientBucket && await store.claim(clientBucket, end) > CLIENT_LIMIT) return null;
    if (await store.claim(pairBucket, end) > PAIR_LIMIT) return null;

    const accountFailures = await store.claim(accountBucket, end);
    if (accountFailures > ACCOUNT_STEP_UP) {
      if (accountFailures === ACCOUNT_STEP_UP + 1) {
        console.warn(
          `[Auth] ${ACCOUNT_STEP_UP} failed sign-ins for ${JSON.stringify(account)} in this ` +
          '15-minute window; until it ends only clients that have signed in to this account ' +
          'before may keep trying.'
        );
      }
      if (client === null || !await store.isMarked(knownId(account, client))) return null;
    }

    return {
      async succeeded() {
        try {
          await Promise.all([
            clientBucket ? store.refund(clientBucket) : undefined,
            store.refund(accountBucket),
            store.remove(pairBucket),
            client === null ? undefined : store.mark(knownId(account, client), new Date(Date.now() + KNOWN_CLIENT_MS)),
          ]);
        } catch (error) {
          // Only means this sign-in stays counted as a failure.
          reportStoreFault(error);
        }
      },
    };
  });
}

/**
 * Claim one attempt and report whether it may proceed; it stays counted as a failure.
 * Callers that can tell a successful sign-in apart should use beginCredentialAttempt.
 */
export async function allowCredentialAttempt(email: string, rawHeaders: RawHeaders = {}): Promise<boolean> {
  return (await beginCredentialAttempt(email, rawHeaders)) !== null;
}

/**
 * Treat this client as known for the account and clear its failed attempts, as a
 * successful sign-in would. Call once a password reset has proved control of the
 * account, so its owner can sign in from there even while the account is under attack.
 */
export async function rememberCredentialClient(email: string, rawHeaders: RawHeaders = {}): Promise<void> {
  const { account, client } = requestKeys(email, rawHeaders);
  if (client === null) return;

  await withStore(async store => {
    const { window } = currentWindow();
    await Promise.all([
      store.mark(knownId(account, client), new Date(Date.now() + KNOWN_CLIENT_MS)),
      store.remove(pairId(window, account, client)),
    ]);
  });
}
