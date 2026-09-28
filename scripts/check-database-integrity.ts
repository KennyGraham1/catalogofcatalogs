/**
 * Database integrity checks.
 *
 *   npm run test:database
 *     Live checks against an explicitly supplied disposable server (MONGODB_TEST_URI).
 *     Every run uses a fresh database and drops it afterwards. CI runs this.
 *
 *   node --import tsx scripts/check-database-integrity.ts --sweep-orphans [--apply]
 *     Report — or, with --apply, delete — events and import history whose catalogue no
 *     longer exists, and finish catalogue deletions left in the 'deleting' state, in
 *     the database the application uses (MONGODB_URI / MONGODB_DATABASE, also read
 *     from .env). A dry run changes nothing.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

async function liveChecks() {
  const uri = process.env.MONGODB_TEST_URI;
  assert.ok(uri, 'Set MONGODB_TEST_URI to a disposable MongoDB server');
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DATABASE = `catalogue_test_${randomUUID().replace(/-/g, '')}`;
  process.env.UNPAGINATED_EVENTS_LIMIT = '2';
  const { getDb, closeConnection, COLLECTIONS } = await import('../lib/mongodb');
  const db = await getDb();
  try {
    const { ensureEventIntegrityIndexes, ensureDatabaseIndexes } = await import('../lib/event-indexes');
    const { dbQueries } = await import('../lib/db');
    assert.ok(dbQueries);
    const events = db.collection(COLLECTIONS.EVENTS);

    // Index setup: indexes that earlier scripts created under other names are
    // recognised by key pattern instead of failing, and a second run is a no-op.
    await db.collection(COLLECTIONS.CATALOGUES).createIndex({ created_at: -1 }, { name: 'idx_catalogues_created_at' });
    await events.createIndex({ catalogue_id: 1, time: -1, id: -1 }, { name: 'legacy_catalogue_time_id' });
    const quiet = () => undefined;
    const first = await ensureDatabaseIndexes(db, quiet);
    assert.deepEqual(first.failed, []);
    assert.ok(first.existing.includes(`${COLLECTIONS.CATALOGUES}.catalogues_created_at_idx`));
    assert.ok(first.existing.includes(`${COLLECTIONS.EVENTS}.catalogue_time_id_idx`));
    const second = await ensureDatabaseIndexes(db, quiet);
    assert.deepEqual(second.failed, []);
    assert.deepEqual(second.created, []);

    await ensureEventIntegrityIndexes(events);
    await ensureEventIntegrityIndexes(events); // Idempotent setup.
    // Events can only be written to a catalogue that exists.
    await dbQueries.insertCatalogue('a', 'Integrity check', '[]', '{}', 0, 'processing');
    const row = (id: string, source?: string, catalogue = 'a') => ({ id, catalogue_id: catalogue, source_id: source, time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 4, source_events: '[]' });
    const writes = await Promise.all([
      dbQueries.bulkInsertEvents([row('a1', 'shared')]),
      dbQueries.bulkInsertEvents([row('a2', 'shared')]),
    ]);
    assert.equal(writes.reduce((a, b) => a + b, 0), 1);
    assert.equal(await events.countDocuments(), 1);
    assert.equal(await dbQueries.bulkInsertEvents([row('no-source-1'), row('no-source-2')]), 2);
    // Every stored row carries its quality score and grade.
    assert.equal(await events.countDocuments({ quality_score: { $type: 'number' }, quality_grade: { $type: 'string' } }), 3);
    const legacy = db.collection('legacy_duplicates');
    await legacy.insertMany([row('legacy-1', 'same'), row('legacy-2', 'same')]);
    await assert.rejects(ensureEventIntegrityIndexes(legacy), /repair them/);

    // A catalogue that is gone refuses events, and the sweep finds rows written behind
    // its back.
    await dbQueries.insertCatalogue('b', 'Deleted', '[]', '{}', 0, 'processing');
    assert.equal(await dbQueries.deleteCatalogue('b'), true);
    await assert.rejects(dbQueries.bulkInsertEvents([row('b1', undefined, 'b')]), /does not exist or is being deleted/);
    await events.insertMany([row('orphan-1', undefined, 'gone'), row('orphan-2', undefined, 'gone')]);
    const dryRun = await dbQueries.sweepOrphans();
    assert.deepEqual(dryRun.orphanedCatalogueIds, ['gone']);
    assert.equal(dryRun.orphanedEvents, 2);
    assert.equal(await events.countDocuments({ catalogue_id: 'gone' }), 2);
    await dbQueries.sweepOrphans({ apply: true });
    assert.equal(await events.countDocuments({ catalogue_id: 'gone' }), 0);
    assert.equal(await events.countDocuments({ catalogue_id: 'a' }), 3);

    // Login limiter: limits are per (account, client) and per client, so one client is
    // held to 10 attempts on an account while an account attacked from many clients is
    // never locked for its owner.
    const { allowCredentialAttempt } = await import('../lib/auth/login-rate-limit');
    const sameClient = await Promise.all(Array.from({ length: 20 }, () =>
      allowCredentialAttempt('shared@example.test', { 'x-forwarded-for': '198.51.100.1' })
    ));
    assert.equal(sameClient.filter(Boolean).length, 10);
    const manyClients = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      allowCredentialAttempt('other@example.test', { 'x-forwarded-for': `198.51.100.${i + 10}` })
    ));
    assert.equal(manyClients.filter(Boolean).length, 20);
    // The limiter creates its TTL index asynchronously; give it a moment.
    let hasTtl = false;
    for (let attempt = 0; attempt < 20 && !hasTtl; attempt++) {
      const limiterIndexes = await db.collection(COLLECTIONS.AUTH_RATE_LIMITS).indexes();
      hasTtl = limiterIndexes.some(index => index.expireAfterSeconds === 0);
      if (!hasTtl) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(hasTtl, 'auth_rate_limits TTL index was not created');

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
    console.log('Live MongoDB index setup, uniqueness, deletion guard and orphan sweep, login limits, single-use resets, and upload expiry passed.');
  } finally {
    await db.dropDatabase();
    await closeConnection();
  }
}

async function sweepOrphans(apply: boolean) {
  // Loads .env before lib/mongodb reads the environment.
  await import('dotenv/config');
  const { getDb, closeConnection } = await import('../lib/mongodb');
  const db = await getDb();
  try {
    const { dbQueries } = await import('../lib/db');
    assert.ok(dbQueries);
    console.log(`Orphan sweep (${apply ? 'APPLY' : 'dry run'}) in database ${db.databaseName}`);
    const report = await dbQueries.sweepOrphans({ apply });
    console.log(`  Catalogue IDs referenced but missing: ${report.orphanedCatalogueIds.length ? report.orphanedCatalogueIds.join(', ') : 'none'}`);
    console.log(`  Orphaned events: ${report.orphanedEvents}`);
    console.log(`  Orphaned import history rows: ${report.orphanedImportHistory}`);
    console.log(`  Stuck deletions: ${report.staleDeletions.length ? report.staleDeletions.join(', ') : 'none'}`);
    if (!apply && (report.orphanedEvents || report.orphanedImportHistory || report.staleDeletions.length)) {
      console.log('Nothing was changed. Rerun with --apply to delete them.');
    }
  } finally {
    await closeConnection();
  }
}

const args = process.argv.slice(2);
const run = args.includes('--sweep-orphans') ? sweepOrphans(args.includes('--apply')) : liveChecks();
run.catch(error => { console.error(error); process.exitCode = 1; });
