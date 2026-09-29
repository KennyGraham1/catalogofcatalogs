/**
 * Credential-login throttling for NextAuth's `authorize`, and the per-account limit on
 * password-reset emails.
 *
 * Shared, atomic MongoDB counters, checked before the user lookup and bcrypt so refused
 * attempts cost almost nothing. Restarting a server or switching instances cannot reset
 * a quota. Clients are keyed by address, an IPv6 /64 counting as one (clientKey in
 * lib/rate-limiter.ts); accounts by normalised email (lib/auth/normalize.ts).
 *
 * A browser WITHOUT a known-device cookie for the account:
 * - client: 50 failed attempts per 15-minute window, across accounts (caps spraying);
 * - (account, client): 10 failed attempts per window (caps guessing from one client);
 * - account: 100 consecutive failed attempts, from all such browsers together. The count
 *   is reset by any successful sign-in and forgotten 24 hours after the last counted
 *   failure (NIST SP 800-63B 5.2.2 caps consecutive failures at 100). Once it is
 *   reached, such browsers are refused ("AccountProtected") before the password check.
 *
 * A browser WITH a known-device cookie for the account (lib/auth/known-device.ts,
 * issued on a successful sign-in or password reset):
 * - (account, device): 10 failed attempts per window, and no other limit. Anyone can
 *   raise the account count, so it must not shut the owner out of their own browsers;
 *   and those browsers' failures do not raise it.
 *
 * Each attempt is claimed before the password check, so concurrent guesses cannot race
 * past a limit, and handed back when the sign-in succeeds: successful logins are never
 * counted. Unknown browsers can therefore make at most 100 password checks against an
 * account between the owner's successful sign-ins, and at most 100 per 24 hours.
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
import { clientKey, resolveClientIp, toHeaders } from '../rate-limiter';
import { normalizeEmail } from './normalize';
import { knownDeviceId } from './known-device';

const WINDOW_MS = 15 * 60 * 1000;
/** Failed attempts per (account, client) per window. */
const PAIR_LIMIT = 10;
/** Failed attempts per client, across accounts, per window. */
const CLIENT_LIMIT = 50;
/** Failed attempts per (account, known device) per window. */
const DEVICE_LIMIT = 10;
/** Consecutive failed attempts per account from unknown browsers before they are refused. */
const ACCOUNT_STEP_UP = 100;
/** The consecutive-failure count lapses this long after its last counted failure. */
const CONSECUTIVE_TTL_MS = 24 * 60 * 60 * 1000;
/** Password-reset emails per account per hour. */
const RESET_EMAILS_PER_HOUR = 3;
const RESET_WINDOW_MS = 60 * 60 * 1000;
const INDEX_RETRY_MS = 10 * 60 * 1000;
const FAULT_LOG_INTERVAL_MS = 60 * 1000;
const MEMORY_MAX_ENTRIES = 10_000;

type RawHeaders = Headers | Record<string, string | string[] | undefined>;
interface AttemptBucket { _id: string; attempts?: number; expires_at: Date }

/** Counter storage: the shared collection, or process memory while it is unavailable. */
interface BucketStore {
  /**
   * Add one to a bucket, atomically, and return the new count. The bucket expires at
   * `expiresAt`: set when it is created, or on every claim if `renew` is set.
   */
  claim(id: string, expiresAt: Date, renew?: boolean): Promise<number>;
  /** The bucket's count, 0 if it does not exist or has expired. */
  count(id: string): Promise<number>;
  /** Hand one attempt back. */
  refund(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

let indexReady = false;
let indexAttemptedAt = -Infinity;

/**
 * Expiry only cleans up: window buckets carry their window in their id, and counts are
 * read with their expiry checked, so counting is correct without the TTL index. Failing
 * to create it (e.g. the database role may not create indexes) is therefore logged and
 * retried later, never allowed to block a login.
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
    async claim(id, expiresAt, renew = false) {
      if (renew) {
        // A renewed bucket's id carries no window: an expired document the TTL monitor
        // has not removed yet (or never will, without the index) must start from zero,
        // not keep counting and renewing forever.
        await collection.deleteOne({ _id: id, expires_at: { $lte: new Date(Date.now()) } });
      }
      const bucket = await collection.findOneAndUpdate(
        { _id: id },
        renew
          ? { $inc: { attempts: 1 }, $set: { expires_at: expiresAt } }
          : { $inc: { attempts: 1 }, $setOnInsert: { expires_at: expiresAt } },
        { upsert: true, returnDocument: 'after' },
      );
      if (!bucket) throw new Error('auth_rate_limits upsert returned no document');
      return bucket.attempts ?? 0;
    },
    async count(id) {
      // The TTL monitor runs about once a minute, so check expiry here as well.
      const bucket = await collection.findOne({ _id: id, expires_at: { $gt: new Date(Date.now()) } });
      return bucket?.attempts ?? 0;
    },
    async refund(id) {
      await collection.updateOne({ _id: id, attempts: { $gt: 0 } }, { $inc: { attempts: -1 } });
    },
    async remove(id) {
      await collection.deleteOne({ _id: id });
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
  async claim(id, expiresAt, renew = false) {
    let entry = memoryEntry(id);
    if (!entry) {
      if (memoryBuckets.size >= MEMORY_MAX_ENTRIES) makeMemoryRoom();
      entry = { count: 0, expiresAt: expiresAt.getTime() };
      memoryBuckets.set(id, entry);
    } else if (renew) {
      entry.expiresAt = expiresAt.getTime();
    }
    entry.count += 1;
    return entry.count;
  },
  async count(id) {
    return memoryEntry(id)?.count ?? 0;
  },
  async refund(id) {
    const entry = memoryEntry(id);
    if (entry && entry.count > 0) entry.count -= 1;
  },
  async remove(id) {
    memoryBuckets.delete(id);
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

export interface CredentialAttempt {
  /**
   * Record a successful sign-in: it is not counted, this client's (or device's) count
   * for the account starts again, and so does the account's consecutive-failure count.
   */
  succeeded(): Promise<void>;
}

/** Why an attempt was refused: a per-client or per-device limit, or the account-wide one. */
export type CredentialRefusal = 'too-many-attempts' | 'account-protected';

/**
 * Claim one credential attempt before the password is checked. An attempt that is
 * never marked as succeeded stays counted as a failure.
 */
export async function beginCredentialAttempt(
  email: string,
  rawHeaders: RawHeaders = {}
): Promise<CredentialAttempt | CredentialRefusal> {
  const headers = toHeaders(rawHeaders);
  const account = normalizeEmail(email);
  const address = resolveClientIp({ headers });
  const client = address === null ? null : clientKey(address);
  const device = knownDeviceId(headers.get('cookie'), account);

  return withStore(async store => {
    const { window, end } = currentWindow();
    const consecutive = `consecutive:${digest('account', account)}`;

    if (device !== null) {
      // A browser that has signed in to this account before: limited on its own, and
      // outside the limits other clients' failures raise.
      const deviceBucket = `${window}:${digest('device', account, device)}`;
      if (await store.claim(deviceBucket, end) > DEVICE_LIMIT) return 'too-many-attempts';
      return {
        async succeeded() {
          await settle([store.remove(deviceBucket), store.remove(consecutive)]);
        },
      };
    }

    // Count the client first, so a blocked client cannot create unlimited account buckets.
    // A request with no client address (never the case behind Next.js, which fills
    // X-Forwarded-For in) is limited per account; it never shares a client bucket.
    const clientBucket = client === null ? null : `${window}:${digest('client', client)}`;
    if (clientBucket && await store.claim(clientBucket, end) > CLIENT_LIMIT) return 'too-many-attempts';
    const pairBucket = `${window}:${digest('pair', account, client ?? '')}`;
    if (await store.claim(pairBucket, end) > PAIR_LIMIT) return 'too-many-attempts';

    const renewedExpiry = new Date(Date.now() + CONSECUTIVE_TTL_MS);
    if (await store.count(consecutive) >= ACCOUNT_STEP_UP) {
      // Refused attempts still move the count past the threshold (without renewing its
      // expiry), which marks the first refusal for the log.
      noteStepUp(account, await store.claim(consecutive, renewedExpiry));
      return 'account-protected';
    }
    const failures = await store.claim(consecutive, renewedExpiry, true);
    if (failures > ACCOUNT_STEP_UP) {
      noteStepUp(account, failures);
      return 'account-protected';
    }

    return {
      async succeeded() {
        await settle([
          clientBucket ? store.refund(clientBucket) : undefined,
          store.remove(pairBucket),
          store.remove(consecutive),
        ]);
      },
    };
  });
}

/** Log the first refusal after the account-wide threshold is reached. */
function noteStepUp(account: string, count: number) {
  if (count !== ACCOUNT_STEP_UP + 1) return;
  console.warn(
    `[Auth] ${ACCOUNT_STEP_UP} consecutive failed sign-ins for ${JSON.stringify(account)}; until one ` +
    'succeeds, or 24 hours pass without another, only browsers with a known-device cookie for ' +
    'this account may try.'
  );
}

async function settle(work: Array<Promise<void> | undefined>) {
  try {
    await Promise.all(work);
  } catch (error) {
    // Only means this sign-in stays counted as a failure.
    reportStoreFault(error);
  }
}

/**
 * Claim one attempt and report whether it may proceed; it stays counted as a failure.
 * Callers that can tell a successful sign-in apart should use beginCredentialAttempt.
 */
export async function allowCredentialAttempt(email: string, rawHeaders: RawHeaders = {}): Promise<boolean> {
  return typeof await beginCredentialAttempt(email, rawHeaders) !== 'string';
}

/**
 * Claim one password-reset email for the account: at most three per hour, however many
 * clients ask. Counted for every address asked about, whether or not it has an account,
 * so the answer does not depend on that.
 */
export async function allowPasswordResetEmail(email: string): Promise<boolean> {
  const account = normalizeEmail(email);
  return withStore(async store => {
    const hour = Math.floor(Date.now() / RESET_WINDOW_MS);
    const bucket = `reset:${hour}:${digest('reset', account)}`;
    return await store.claim(bucket, new Date((hour + 1) * RESET_WINDOW_MS)) <= RESET_EMAILS_PER_HOUR;
  });
}
