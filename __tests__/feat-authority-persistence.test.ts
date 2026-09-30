/**
 * @jest-environment node
 *
 * lib/merge-authority persistence: the administrator's table lives in the `settings`
 * collection (key 'merge_authority'), like the field-mappings configuration. Loading must
 * never throw into a merge: an unreachable database or a corrupt document yields the
 * built-in default, logged once per process rather than once per merge.
 */
jest.mock('@/lib/mongodb', () => ({ getDb: jest.fn() }));

import { getDb } from '@/lib/mongodb';
import {
  DEFAULT_MERGE_AUTHORITY,
  loadMergeAuthority,
  resetMergeAuthority,
  saveMergeAuthority,
  type MergeAuthorityTable,
} from '@/lib/merge-authority';

const mockGetDb = getDb as jest.Mock;

const collection = {
  findOne: jest.fn(),
  updateOne: jest.fn(),
  deleteOne: jest.fn(),
};
const db = { collection: jest.fn(() => collection) };

const custom: MergeAuthorityTable = {
  hierarchy: [{ patterns: ['usgs', 'neic'], priority: 1, description: 'USGS first', agency: 'usgs' }],
  regions: [{ name: 'JP', bounds: { minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 }, hierarchy: [{ patterns: ['jma'], priority: 1, agency: 'jma' }] }],
  source: 'custom',
  updatedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDb.mockResolvedValue(db);
  collection.findOne.mockResolvedValue(null);
  collection.updateOne.mockResolvedValue({ upsertedCount: 1 });
  collection.deleteOne.mockResolvedValue({ deletedCount: 1 });
});

describe('loadMergeAuthority', () => {
  it('reads the settings collection by key and answers the default when nothing is stored', async () => {
    await expect(loadMergeAuthority()).resolves.toBe(DEFAULT_MERGE_AUTHORITY);
    expect(db.collection).toHaveBeenCalledWith('settings');
    expect(collection.findOne).toHaveBeenCalledWith({ key: 'merge_authority' });
  });

  it('answers the stored table as custom with its saved updatedAt', async () => {
    collection.findOne.mockResolvedValue({
      key: 'merge_authority',
      config: { ...custom, updatedAt: '2026-04-02T03:04:05.000Z' },
      updatedAt: new Date('2026-04-02T03:04:05.000Z'),
    });
    const table = await loadMergeAuthority();
    expect(table.source).toBe('custom');
    expect(table.updatedAt).toBe('2026-04-02T03:04:05.000Z');
    expect(table.hierarchy).toEqual(custom.hierarchy);
    expect(table.regions).toEqual(custom.regions);
  });

  it('falls back to the document\'s own updatedAt when the config carries none', async () => {
    collection.findOne.mockResolvedValue({
      key: 'merge_authority',
      config: { hierarchy: custom.hierarchy, regions: custom.regions },
      updatedAt: new Date('2026-04-02T03:04:05.000Z'),
    });
    await expect(loadMergeAuthority()).resolves.toMatchObject({ source: 'custom', updatedAt: '2026-04-02T03:04:05.000Z' });
  });

  it('answers the default for a corrupt document and logs once per process', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    collection.findOne.mockResolvedValue({ key: 'merge_authority', config: { hierarchy: [{ patterns: ['bad word'], priority: 0 }] } });
    await expect(loadMergeAuthority()).resolves.toBe(DEFAULT_MERGE_AUTHORITY);
    await expect(loadMergeAuthority()).resolves.toBe(DEFAULT_MERGE_AUTHORITY);
    const invalidLogs = error.mock.calls.filter(call => String(call[0]).includes('invalid'));
    expect(invalidLogs).toHaveLength(1);
    expect(String(invalidLogs[0][1])).toMatch(/Invalid authority table/);
    error.mockRestore();
  });

  it('answers the default when the database is unavailable and logs once per process', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetDb.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(loadMergeAuthority()).resolves.toBe(DEFAULT_MERGE_AUTHORITY);
    mockGetDb.mockResolvedValue(db);
    collection.findOne.mockRejectedValue(new Error('topology closed'));
    await expect(loadMergeAuthority()).resolves.toBe(DEFAULT_MERGE_AUTHORITY);
    const unavailableLogs = error.mock.calls.filter(call => String(call[0]).includes('Could not read'));
    expect(unavailableLogs).toHaveLength(1);
    expect(unavailableLogs[0][1]).toBe('ECONNREFUSED');
    error.mockRestore();
  });
});

describe('saveMergeAuthority', () => {
  it('upserts the table under the settings key, stamped custom and with updatedAt now', async () => {
    const before = Date.now();
    const stored = await saveMergeAuthority(custom);
    expect(stored.source).toBe('custom');
    expect(stored.updatedAt).not.toBeNull();
    expect(Date.parse(stored.updatedAt as string)).toBeGreaterThanOrEqual(before);
    expect(stored.hierarchy).toEqual(custom.hierarchy);

    expect(collection.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, options] = collection.updateOne.mock.calls[0];
    expect(filter).toEqual({ key: 'merge_authority' });
    expect(options).toEqual({ upsert: true });
    expect(update.$set.key).toBe('merge_authority');
    expect(update.$set.config).toEqual(stored);
    expect(update.$set.updatedAt).toBeInstanceOf(Date);
    expect(update.$setOnInsert.createdAt).toBeInstanceOf(Date);
  });

  it('round-trips through loadMergeAuthority', async () => {
    const stored = await saveMergeAuthority(custom);
    collection.findOne.mockResolvedValue({ key: 'merge_authority', config: stored, updatedAt: new Date(stored.updatedAt as string) });
    await expect(loadMergeAuthority()).resolves.toEqual(stored);
  });

  it('surfaces a write failure to the caller (the API answers 500, nothing is silently kept)', async () => {
    collection.updateOne.mockRejectedValue(new Error('write refused'));
    await expect(saveMergeAuthority(custom)).rejects.toThrow('write refused');
  });
});

describe('resetMergeAuthority', () => {
  it('deletes the settings document so the default applies again', async () => {
    await resetMergeAuthority();
    expect(collection.deleteOne).toHaveBeenCalledWith({ key: 'merge_authority' });
    await expect(loadMergeAuthority()).resolves.toBe(DEFAULT_MERGE_AUTHORITY);
  });
});
