/**
 * @jest-environment node
 *
 * Regression tests for lib/upload-chunks.ts (cluster I2 — upload transport).
 *
 * Covers:
 *  - #48: assembleChunks must strip a leading UTF-8 BOM the way File.text()
 *    does on the direct (non-chunked) upload path — Buffer.toString('utf-8')
 *    keeps it, which broke JSON/GeoJSON parsing above the 3.5 MB chunking
 *    threshold.
 *  - #52: assembleChunks must reject a chunk_index that is not the exact
 *    integer expected next, not just count documents — a stray non-integer
 *    index (e.g. 1.5, sorted by MongoDB between 1 and 2) used to stand in for
 *    a genuinely missing chunk with no error.
 *  - #53: storeChunk must refresh expires_at for the whole session (the
 *    sentinel and every chunk stored so far), not just the chunk being
 *    stored, so a slow multi-hour upload does not have its session swept by
 *    the one-hour TTL mid-upload.
 *  - C9 (#51 producer side): createUploadSession stores owner_id, and
 *    getUploadSession scopes its lookup to an optional ownerId.
 *  - findings #36/#46 (producer half): isValidStoredDelimiter accepts only
 *    DelimiterSelector's named options or the literal characters they map to.
 */

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: { UPLOAD_CHUNKS: 'upload_chunks' },
}));

jest.mock('@/lib/id', () => ({ createId: jest.fn().mockReturnValue('session-under-test') }));

// The driver's BSON Binary is not constructible under the project's jest
// transform; only its `buffer` field matters to the code under test.
jest.mock('mongodb', () => ({
  Binary: class {
    buffer: Buffer;
    constructor(buffer: Buffer) {
      this.buffer = buffer;
    }
  },
}));

import { getCollection } from '@/lib/mongodb';
import {
  assembleChunks,
  createUploadSession,
  getUploadSession,
  storeChunk,
  isValidStoredDelimiter,
} from '@/lib/upload-chunks';

function chunkDoc(index: number, bytes: Buffer) {
  return { chunk_index: index, data: { buffer: bytes } };
}

function cursorOf(docs: ReturnType<typeof chunkDoc>[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const doc of docs) yield doc;
    },
  };
}

function findCollection(docs: ReturnType<typeof chunkDoc>[]) {
  return {
    createIndex: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue(cursorOf(docs)) }),
  };
}

describe('assembleChunks — BOM stripping (#48)', () => {
  it('strips a leading UTF-8 BOM split across a chunk boundary, unlike Buffer.toString', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const json = Buffer.from('{"a":1}', 'utf-8');
    (getCollection as jest.Mock).mockResolvedValue(findCollection([chunkDoc(0, bom), chunkDoc(1, json)]));

    const content = await assembleChunks('s1', 2);

    // Buffer.toString('utf-8') would have kept U+FEFF as the first character,
    // which JSON.parse rejects.
    expect(content.charCodeAt(0)).not.toBe(0xfeff);
    expect(JSON.parse(content)).toEqual({ a: 1 });
  });

  it('leaves non-BOM content byte-for-byte unchanged', async () => {
    (getCollection as jest.Mock).mockResolvedValue(
      findCollection([chunkDoc(0, Buffer.from('hello ')), chunkDoc(1, Buffer.from('world'))]),
    );

    expect(await assembleChunks('s1', 2)).toBe('hello world');
  });
});

describe('assembleChunks — chunk-index sequence (#52)', () => {
  it('rejects a non-integer index standing in for a missing chunk', async () => {
    // Mirrors how MongoDB sorts a stray BSON double (1.5) between the
    // integers 1 and 2: buffers.length would still equal totalChunks (3), so
    // only an exact-sequence check catches the substitution.
    const docs = [
      chunkDoc(0, Buffer.from('id,mag\n1,2.0\n')),
      chunkDoc(1.5, Buffer.from('XXXX-WRONG-CHUNK\n')),
      chunkDoc(2, Buffer.from('3,4.5\n')),
    ];
    (getCollection as jest.Mock).mockResolvedValue(findCollection(docs));

    await expect(assembleChunks('s1', 3)).rejects.toThrow('Incomplete upload: expected chunk 1, found 1.5');
  });

  it('still assembles a properly sequenced upload', async () => {
    const docs = [chunkDoc(0, Buffer.from('a')), chunkDoc(1, Buffer.from('b')), chunkDoc(2, Buffer.from('c'))];
    (getCollection as jest.Mock).mockResolvedValue(findCollection(docs));

    expect(await assembleChunks('s1', 3)).toBe('abc');
  });

  it('still reports a short upload by count when the sequence itself is intact', async () => {
    (getCollection as jest.Mock).mockResolvedValue(findCollection([chunkDoc(0, Buffer.from('abc'))]));

    await expect(assembleChunks('s1', 3)).rejects.toThrow('Incomplete upload: expected 3 chunks, found 1');
  });
});

describe('storeChunk — TTL refresh on every store (#53)', () => {
  it('extends expires_at for the whole session, not just the chunk being written', async () => {
    const updateMany = jest.fn().mockResolvedValue({});
    const replaceOne = jest.fn().mockResolvedValue({});
    (getCollection as jest.Mock).mockResolvedValue({
      createIndex: jest.fn().mockResolvedValue(undefined),
      updateMany,
      replaceOne,
    });

    const before = Date.now();
    await storeChunk('s1', 2, Buffer.from('data'));

    expect(updateMany).toHaveBeenCalledWith({ session_id: 's1' }, { $set: { expires_at: expect.any(Date) } });
    expect(replaceOne).toHaveBeenCalledWith(
      { session_id: 's1', chunk_index: 2 },
      expect.objectContaining({ session_id: 's1', chunk_index: 2, expires_at: expect.any(Date) }),
      { upsert: true },
    );

    // Both writes share one freshly computed ~1-hour expiry (CHUNK_TTL_HOURS),
    // not the old fixed-at-init timestamp.
    const updateManyExpiry = (updateMany.mock.calls[0][1] as any).$set.expires_at.getTime();
    const replaceOneExpiry = (replaceOne.mock.calls[0][1] as any).expires_at.getTime();
    expect(updateManyExpiry).toBe(replaceOneExpiry);
    expect(updateManyExpiry).toBeGreaterThan(before + 55 * 60 * 1000);
    expect(updateManyExpiry).toBeLessThan(before + 65 * 60 * 1000);
  });
});

describe('C9 — chunked-upload ownership', () => {
  it('createUploadSession stores the owner_id on the sentinel document', async () => {
    const insertOne = jest.fn().mockResolvedValue({ insertedId: 'x' });
    (getCollection as jest.Mock).mockResolvedValue({ createIndex: jest.fn().mockResolvedValue(undefined), insertOne });

    await createUploadSession('a.csv', 100, 1, undefined, undefined, 'user-a');

    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'user-a' }));
  });

  it('getUploadSession scopes the query to the given ownerId', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    (getCollection as jest.Mock).mockResolvedValue({ createIndex: jest.fn().mockResolvedValue(undefined), findOne });

    const result = await getUploadSession('s1', 'user-b');

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith({ session_id: 's1', chunk_index: -1, owner_id: 'user-b', expires_at: { $gt: expect.any(Date) } });
  });

  it('getUploadSession without an ownerId does not filter by owner (back-compat for finalize)', async () => {
    const doc = { session_id: 's1', chunk_index: -1, total_chunks: 1, file_name: 'a.csv', owner_id: 'user-a' };
    const findOne = jest.fn().mockResolvedValue(doc);
    (getCollection as jest.Mock).mockResolvedValue({ createIndex: jest.fn().mockResolvedValue(undefined), findOne });

    const result = await getUploadSession('s1');

    expect(result?.owner_id).toBe('user-a');
    // No owner_id key at all — an explicit `owner_id: undefined` could
    // serialise to a real query clause and break the "no filter" contract.
    expect(findOne).toHaveBeenCalledWith({ session_id: 's1', chunk_index: -1, expires_at: { $gt: expect.any(Date) } });
  });
});

describe('isValidStoredDelimiter (findings #36/#46 producer half)', () => {
  it.each(['comma', 'tab', 'semicolon', 'pipe', 'space', ',', '\t', ';', '|', ' '])(
    'accepts %j',
    (value) => {
      expect(isValidStoredDelimiter(value)).toBe(true);
    },
  );

  const invalid: unknown[] = ['Comma', 'commas', '', 'auto', 'xyz12', null, undefined, 42];
  it.each(invalid)('rejects %j', (value) => {
    expect(isValidStoredDelimiter(value)).toBe(false);
  });
});
