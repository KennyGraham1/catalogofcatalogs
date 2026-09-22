/** @jest-environment node */

// The MongoDB driver copies the FIRST write error's code
// to the top level, so a batch of [11000, 121] reports code 11000. Treating that as
// "only duplicates" swallowed the document-validation failure on row 2.

jest.mock('@/lib/mongodb', () => ({
  __esModule: true,
  COLLECTIONS: { EVENTS: 'merged_events', CATALOGUES: 'merged_catalogues', IMPORT_HISTORY: 'import_history' },
  getCollection: jest.fn(),
  getDb: jest.fn(),
  withTransaction: jest.fn(async (fn: any) => fn({})),
}));

import { dbQueries } from '@/lib/db';
import { getCollection } from '@/lib/mongodb';

const row = (i: number) => ({
  id: 'x' + i, catalogue_id: 'c', source_id: 's' + i, source_events: '[]',
  time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, magnitude: 3, depth: 10,
});

function driverError(codes: number[], insertedCount = 0) {
  const e: any = new Error('write errors');
  e.code = codes[0];
  e.writeErrors = codes.map((code, index) => ({ index, code, errmsg: code === 11000 ? 'duplicate key' : 'document validation failed' }));
  e.result = { insertedCount };
  return e;
}

describe('bulkInsertEvents write-error classification', () => {
  it('re-throws when a duplicate-key error hides a validation failure in the same batch', async () => {
    (getCollection as jest.Mock).mockResolvedValue({ insertMany: jest.fn().mockRejectedValue(driverError([11000, 121])) });
    await expect(dbQueries!.bulkInsertEvents([row(1), row(2)] as any)).rejects.toThrow(/write errors/);
  });

  it('still tolerates a batch whose every error really is a duplicate key', async () => {
    (getCollection as jest.Mock).mockResolvedValue({ insertMany: jest.fn().mockRejectedValue(driverError([11000, 11000], 1)) });
    await expect(dbQueries!.bulkInsertEvents([row(1), row(2), row(3)] as any)).resolves.toBe(1);
  });

  it('invalidates cached pages even when a partially committed batch throws', async () => {
    (invalidateCatalogueCache as jest.Mock).mockClear();
    (getCollection as jest.Mock).mockResolvedValue({ insertMany: jest.fn().mockRejectedValue(driverError([121], 1)) });
    await expect(dbQueries!.bulkInsertEvents([row(1), row(2)] as any)).rejects.toThrow(/write errors/);
    expect(invalidateCatalogueCache).toHaveBeenCalledWith('c');
  });
});

describe('partial import coordinate lookup', () => {
  it('queries generated IDs within their catalogue with only a coordinate projection', async () => {
    const rows = [{ id: 'generated-new', latitude: -41, longitude: 174 }];
    const cursor = { project: jest.fn().mockReturnThis(), toArray: jest.fn().mockResolvedValue(rows) };
    const find = jest.fn().mockReturnValue(cursor);
    (getCollection as jest.Mock).mockResolvedValue({ find });
    await expect(dbQueries!.getEventCoordinatesByIds('c', ['generated-new', 'generated-rejected'])).resolves.toEqual(rows);
    expect(find).toHaveBeenCalledWith({ catalogue_id: 'c', id: { $in: ['generated-new', 'generated-rejected'] } });
    expect(cursor.project).toHaveBeenCalledWith({ _id: 0, id: 1, latitude: 1, longitude: 1 });
  });

  it('does not query the database for an empty batch', async () => {
    (getCollection as jest.Mock).mockClear();
    await expect(dbQueries!.getEventCoordinatesByIds('c', [])).resolves.toEqual([]);
    expect(getCollection).not.toHaveBeenCalled();
  });
});

// updateEvent obeys the insert validator's ranges and invalidates the
// catalogue's cached event pages, so a re-import cannot persist an out-of-range value
// or leave the events API serving the pre-update magnitude.
jest.mock('@/lib/cache', () => {
  const actual = jest.requireActual('@/lib/cache');
  return { ...actual, invalidateCatalogueCache: jest.fn() };
});
import { invalidateCatalogueCache } from '@/lib/cache';

describe('updateEvent contract', () => {
  it('rejects an update the insert validator would reject, and writes nothing', async () => {
    const updateOne = jest.fn();
    (getCollection as jest.Mock).mockResolvedValue({ updateOne, findOne: jest.fn().mockResolvedValue({ catalogue_id: 'c' }) });
    await expect(dbQueries!.updateEvent('x1', { depth: 1001 } as any)).rejects.toThrow(/depth/);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('invalidates the catalogue cache after a successful update', async () => {
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 1 });
    (getCollection as jest.Mock).mockResolvedValue({ updateOne, findOne: jest.fn().mockResolvedValue({ catalogue_id: 'cat-9' }) });
    await dbQueries!.updateEvent('x1', { magnitude: 4.5 } as any);
    expect(updateOne).toHaveBeenCalledWith({ id: 'x1' }, { $set: { magnitude: 4.5 } });
    expect(invalidateCatalogueCache).toHaveBeenCalledWith('cat-9');
  });
});
