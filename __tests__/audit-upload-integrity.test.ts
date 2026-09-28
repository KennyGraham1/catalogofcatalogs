/** @jest-environment node */
import { NextRequest } from 'next/server';
jest.mock('@/lib/auth/middleware', () => ({ requireEditor: jest.fn(async () => ({ user: { id: 'editor' } })) }));
jest.mock('@/lib/db', () => ({
  ...jest.requireActual('@/lib/db'),
  dbQueries: Object.fromEntries(['insertCatalogue', 'bulkInsertEvents', 'updateCatalogueStatus', 'updateCatalogueEventCount', 'updateCatalogueGeoBounds', 'getCatalogueById', 'deleteCatalogue', 'countEventsByCatalogue'].map(k => [k, jest.fn()])),
}));
// Catalogue creation is audited (C13); the audit store is not under test here.
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn(async () => undefined) }));
jest.mock('@/lib/rate-limiter', () => ({ applyRateLimit: () => ({ success: true, headers: {} }), readRateLimiter: {}, apiRateLimiter: {} }));
jest.mock('@/lib/pending-uploads', () => ({ deletePendingUpload: jest.fn(async () => {}), getPendingUploadEvents: jest.fn(), iteratePendingUploadEventBatches: jest.fn() }));
import { POST } from '@/app/api/catalogues/route';
import { dbQueries } from '@/lib/db';
import { getPendingUploadEvents, iteratePendingUploadEventBatches, deletePendingUpload } from '@/lib/pending-uploads';
import { requireEditor } from '@/lib/auth/middleware';
const db = dbQueries as unknown as Record<string, jest.Mock>;
const event = (id: string) => ({ id, time: '2024-01-01T00:00:00.000Z', latitude: -41, longitude: 174, depth: 10, magnitude: 4 });
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/catalogues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
beforeEach(() => {
  jest.resetAllMocks();
  // resetAllMocks also clears the auth stub; the route records the session user as creator.
  (requireEditor as jest.Mock).mockResolvedValue({ user: { id: 'editor' } });
  (deletePendingUpload as jest.Mock).mockResolvedValue(undefined);
  db.getCatalogueById.mockResolvedValue({ id: 'cat', name: 'Audit' });
  const stored = new Set<string>();
  db.bulkInsertEvents.mockImplementation(async rows => { rows.forEach((row: { id: string }) => stored.add(row.id)); return rows.length; });
  db.countEventsByCatalogue.mockImplementation(async () => stored.size);
  (getPendingUploadEvents as jest.Mock).mockResolvedValue(null);
});
it('waits for an active sibling before cleaning up a failed import', async () => {
  const stored: unknown[] = [];
  let finishSibling!: () => void;
  db.bulkInsertEvents.mockImplementationOnce(async () => { throw new Error('permanent write failure'); });
  db.bulkInsertEvents.mockImplementationOnce(rows => new Promise(resolve => { finishSibling = () => { stored.push(...rows); resolve(rows.length); }; }));
  db.deleteCatalogue.mockImplementation(async () => { stored.length = 0; });
  const responsePromise = post({ name: 'Audit', events: Array.from({ length: 1001 }, (_, i) => event(String(i))) });
  await new Promise(resolve => setImmediate(resolve));
  expect(db.bulkInsertEvents).toHaveBeenCalledTimes(2);
  expect(db.deleteCatalogue).not.toHaveBeenCalled();
  finishSibling();
  const response = await responsePromise;
  expect(response.status).toBe(500);
  expect(db.deleteCatalogue).toHaveBeenCalledTimes(1);
  expect(db.bulkInsertEvents).toHaveBeenCalledTimes(2); // No third batch after failure.
  expect(stored).toHaveLength(0);
});
it('counts rows committed before a retry as successfully imported', async () => {
  const stored = new Set<string>();
  db.countEventsByCatalogue.mockImplementation(async () => stored.size);
  db.bulkInsertEvents.mockImplementationOnce(async rows => {
    stored.add(rows[0].id);
    throw Object.assign(new Error('primary stepped down after first write'), { code: 91 });
  }).mockImplementationOnce(async rows => {
    let inserted = 0;
    for (const row of rows) { if (!stored.has(row.id)) { stored.add(row.id); inserted++; } }
    return inserted;
  });
  const response = await post({ name: 'Audit', events: [event('a'), event('b')] });
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(stored.size).toBe(2);
  expect(body.validationReport.successfullyImported).toBe(2);
  expect(body.validationReport.duplicatesSkipped).toBe(0);
  expect(db.updateCatalogueEventCount).toHaveBeenCalledWith(expect.any(String), 2);
});
it('rejects missing pending files before metadata can attach to the wrong row', async () => {
  (getPendingUploadEvents as jest.Mock).mockImplementation(async id => id === 'expired' ? null : [{ ...event('b'), quakeml: { publicID: 'smi:audit/B', origins: [{ publicID: 'smi:audit/B/origin', time: { value: '2024-01-01T00:00:00Z' }, latitude: { value: -41 }, longitude: { value: 174 }, depth: { value: 10000 } }], magnitudes: [{ publicID: 'smi:audit/B/magnitude', mag: { value: 4 }, type: 'Mw' }], comment: [{ text: 'Only belongs to B' }] } }]);
  const response = await post({ name: 'Audit', events: [event('a'), event('b')], pendingUploadIds: ['expired', 'present'] });
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('PENDING_UPLOAD_NOT_FOUND');
  expect(db.insertCatalogue).not.toHaveBeenCalled();
  expect(db.bulkInsertEvents).not.toHaveBeenCalled();
});
it('rejects streamed imports whose later pending file is missing before writing anything', async () => {
  // The pending path validates every file in a dry run first, so a missing file is
  // found before the catalogue or any event is written (previously: written, then rolled back).
  (iteratePendingUploadEventBatches as jest.Mock).mockImplementation(async function* (id) { if (id === 'present') yield [event('b')]; });
  const response = await post({ name: 'Audit', pendingUploadIds: ['present', 'expired'] });
  const body = await response.json();
  expect(response.status).toBe(404);
  expect(body.code).toBe('PENDING_UPLOAD_NOT_FOUND');
  expect(db.insertCatalogue).not.toHaveBeenCalled();
  expect(db.bulkInsertEvents).not.toHaveBeenCalled();
  expect(deletePendingUpload).not.toHaveBeenCalled();
});
it('rolls back a streamed import whose insert fails part-way', async () => {
  (iteratePendingUploadEventBatches as jest.Mock).mockImplementation(async function* (id) { yield [event(`${id}-1`)]; });
  db.bulkInsertEvents.mockImplementationOnce(async rows => rows.length).mockImplementationOnce(async () => { throw new Error('permanent write failure'); });
  const response = await post({ name: 'Audit', pendingUploadIds: ['first', 'second'] });
  expect(response.status).toBe(500);
  expect(db.bulkInsertEvents).toHaveBeenCalledTimes(2);
  expect(db.deleteCatalogue).toHaveBeenCalledTimes(1);
  expect(deletePendingUpload).not.toHaveBeenCalled();
});
it('rejects mismatched row counts without silently losing extended metadata', async () => {
  (getPendingUploadEvents as jest.Mock).mockResolvedValue([event('a')]);
  const response = await post({ name: 'Audit', events: [event('a'), event('b')], pendingUploadIds: ['present'] });
  expect(response.status).toBe(409);
  expect(db.insertCatalogue).not.toHaveBeenCalled();
});
it('does not fall back to scalar events on pending-store failure', async () => {
  (getPendingUploadEvents as jest.Mock).mockRejectedValue(new Error('database unavailable'));
  const response = await post({ name: 'Audit', events: [event('a')], pendingUploadIds: ['present'] });
  expect(response.status).toBe(500);
  expect(db.insertCatalogue).not.toHaveBeenCalled();
});
it.each([[42], ['valid', ''], ['valid', 'valid']])('rejects invalid or repeated pending IDs: %j', async (...ids) => {
  const response = await post({ name: 'Audit', events: [event('a')], pendingUploadIds: ids });
  expect(response.status).toBe(400);
  expect(db.insertCatalogue).not.toHaveBeenCalled();
});
