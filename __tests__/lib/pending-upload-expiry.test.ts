/** @jest-environment node */
jest.mock('@/lib/mongodb', () => ({ getCollection: jest.fn(), COLLECTIONS: { PENDING_UPLOADS: 'pending' } }));
import { getCollection } from '@/lib/mongodb';
import { getPendingUploadEvents, iteratePendingUploadEventBatches } from '@/lib/pending-uploads';

it('excludes expired documents even before MongoDB TTL cleanup runs', async () => {
  const close = jest.fn(async () => {});
  const cursor: any = { sort: () => cursor, batchSize: () => cursor, close, async *[Symbol.asyncIterator]() {} };
  const find = jest.fn(() => cursor);
  (getCollection as jest.Mock).mockResolvedValue({ createIndex: jest.fn(async () => 'index'), find });
  expect(await getPendingUploadEvents('expired')).toBeNull();
  expect(find).toHaveBeenCalledWith({ upload_id: 'expired', expires_at: { $gt: expect.any(Date) } });
  expect(close).toHaveBeenCalledTimes(1);
});
it('closes the pending cursor when the caller aborts an import', async () => {
  const close = jest.fn(async () => {});
  const cursor: any = { sort: () => cursor, batchSize: () => cursor, close,
    async *[Symbol.asyncIterator]() { yield { event: { id: 'a' } }; yield { event: { id: 'b' } }; },
  };
  // lib/pending-uploads.ts creates its indexes once per process, on whichever read comes first,
  // so this collection must support that too: the test cannot rely on running second.
  (getCollection as jest.Mock).mockResolvedValue({ createIndex: jest.fn(async () => 'index'), find: () => cursor });
  const seen: unknown[] = [];
  for await (const batch of iteratePendingUploadEventBatches('valid', 1)) { seen.push(...batch); break; }
  expect(seen).toEqual([{ id: 'a' }]);
  expect(close).toHaveBeenCalledTimes(1);
});
