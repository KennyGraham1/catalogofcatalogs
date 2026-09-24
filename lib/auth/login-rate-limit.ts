import { createHash } from 'crypto';
import { getCollection, COLLECTIONS } from '../mongodb';
import { getClientIp } from '../rate-limiter';

const WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 10;
const CLIENT_LIMIT = 50;
interface AttemptBucket { _id: string; attempts: number; expires_at: Date }
let indexReady: Promise<unknown> | undefined;

/** Shared, atomic counters: restarting a server or switching instances cannot reset the quota. */
export async function allowCredentialAttempt(email: string, rawHeaders: Record<string, string | string[] | undefined> = {}): Promise<boolean> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(',') : value);
  }
  const client = getClientIp({ headers } as Request);
  const collection = await getCollection<AttemptBucket>(COLLECTIONS.AUTH_RATE_LIMITS);
  if (!indexReady) {
    indexReady = collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }).catch(error => {
      indexReady = undefined;
      throw error;
    });
  }
  await indexReady;
  const window = Math.floor(Date.now() / WINDOW_MS);
  const claim = async (scope: string, value: string, limit: number) => {
    const digest = createHash('sha256').update(`${scope}:${value}`).digest('hex');
    const bucket = await collection.findOneAndUpdate(
      { _id: `${window}:${digest}` },
      { $inc: { attempts: 1 }, $setOnInsert: { expires_at: new Date((window + 1) * WINDOW_MS) } },
      { upsert: true, returnDocument: 'after' },
    );
    return bucket !== null && bucket.attempts <= limit;
  };
  // Count the client first, so a blocked client cannot create unlimited account buckets.
  if (!await claim('client', client, CLIENT_LIMIT)) return false;
  return claim('account', email.trim().toLowerCase(), ACCOUNT_LIMIT);
}
