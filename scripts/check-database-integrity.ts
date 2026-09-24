/** Run against an explicitly supplied test server; all data lives in a fresh disposable DB. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

async function main() {
  const uri = process.env.MONGODB_TEST_URI;
  assert.ok(uri, 'Set MONGODB_TEST_URI to a disposable MongoDB server');
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DATABASE = `catalogue_test_${randomUUID().replace(/-/g, '')}`;
  process.env.UNPAGINATED_EVENTS_LIMIT = '2';
  const { getDb, closeConnection, COLLECTIONS } = await import('../lib/mongodb');
  const db = await getDb();
  try {
    const { ensureEventIntegrityIndexes } = await import('../lib/event-indexes');
    const { dbQueries } = await import('../lib/db');
    assert.ok(dbQueries);
    const events = db.collection(COLLECTIONS.EVENTS);
    await ensureEventIntegrityIndexes(events);
    await ensureEventIntegrityIndexes(events); // Idempotent setup.
    const row = (id: string, source?: string) => ({ id, catalogue_id: 'a', source_id: source, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4, source_events: '[]' });
    const writes = await Promise.all([
      dbQueries.bulkInsertEvents([row('a1', 'shared')]),
      dbQueries.bulkInsertEvents([row('a2', 'shared')]),
    ]);
    assert.equal(writes.reduce((a, b) => a + b, 0), 1);
    assert.equal(await events.countDocuments(), 1);
    assert.equal(await dbQueries.bulkInsertEvents([row('no-source-1'), row('no-source-2')]), 2);
    const legacy = db.collection('legacy_duplicates');
    await legacy.insertMany([row('legacy-1', 'same'), row('legacy-2', 'same')]);
    await assert.rejects(ensureEventIntegrityIndexes(legacy), /repair them/);

    const { allowCredentialAttempt } = await import('../lib/auth/login-rate-limit');
    const attempts = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      allowCredentialAttempt('shared@example.test', { 'x-forwarded-for': `198.51.100.${i}` })
    ));
    assert.equal(attempts.filter(Boolean).length, 10);
    const limiterIndexes = await db.collection(COLLECTIONS.AUTH_RATE_LIMITS).indexes();
    assert.ok(limiterIndexes.some(index => index.expireAfterSeconds === 0));

    const { hashPassword, verifyPassword } = await import('../lib/auth/utils');
    await db.collection(COLLECTIONS.USERS).insertOne({ id: 'reset-user', password_hash: await hashPassword('old-password'), jwt_version: 7 });
    await db.collection(COLLECTIONS.PASSWORD_RESET_TOKENS).insertOne({
      id: 'reset-token', user_id: 'reset-user', used_at: null, expires_at: new Date(Date.now() + 60000),
      token_hash: createHash('sha256').update('test-reset-token').digest('hex'),
    });
    const { POST } = await import('../app/api/auth/reset-password/route');
    const passwords = ['password-one', 'password-two'];
    const responses = await Promise.all(passwords.map(newPassword => POST(new NextRequest('http://localhost/api/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token: 'test-reset-token', newPassword }),
    }))));
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
    const user = await db.collection(COLLECTIONS.USERS).findOne({ id: 'reset-user' });
    assert.equal(user?.jwt_version, 8);
    assert.ok(await verifyPassword(passwords[responses.findIndex(response => response.status === 200)], user!.password_hash));

    const { storePendingUpload, getPendingUploadEvents } = await import('../lib/pending-uploads');
    const pending = await storePendingUpload([row('pending')]);
    assert.equal((await getPendingUploadEvents(pending))?.length, 1);
    await db.collection(COLLECTIONS.PENDING_UPLOADS).updateMany({ upload_id: pending }, { $set: { expires_at: new Date(0) } });
    assert.equal(await getPendingUploadEvents(pending), null);
    console.log('Live MongoDB uniqueness, concurrent login limits, single-use resets, and upload expiry passed.');
  } finally {
    await db.dropDatabase();
    await closeConnection();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
