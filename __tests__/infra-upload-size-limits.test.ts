/**
 * @jest-environment node
 *
 * Chunked-upload size-limit tests.
 *
 * The `fileSize` recorded by /api/upload/init is declared by the client, so the
 * upload caps have to be enforced against the bytes actually stored in
 * upload_chunks. These tests pin that: a session that declares one byte and then
 * stores far more must be rejected, and the assembly helpers must abort as soon
 * as the running byte total passes the cap.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(),
  requireAdmin: jest.fn(),
  requireViewer: jest.fn(),
  requireAuth: jest.fn(),
}));

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

jest.mock('@/lib/parsers', () => ({
  parseFile: jest.fn().mockReturnValue({
    success: true,
    events: [],
    errors: [],
    warnings: [],
    detectedFields: [],
  }),
  parseQuakeMLFileStream: jest.fn().mockResolvedValue({
    success: true,
    events: [],
    errors: [],
    warnings: [],
    detectedFields: [],
  }),
}));

jest.mock('@/lib/pending-uploads', () => ({
  storePendingUpload: jest.fn().mockResolvedValue('pending-id-123'),
  createPendingUpload: jest.fn().mockResolvedValue({ uploadId: 'pending-id-123', expiresAt: new Date() }),
  appendPendingUploadEvents: jest.fn().mockResolvedValue(0),
}));

import { readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { requireEditor } from '@/lib/auth/middleware';
import {
  assembleChunks,
  assembleChunksToFile,
  UploadSizeLimitError,
  CHUNK_SIZE,
} from '@/lib/upload-chunks';

/** A chunk document as stored by storeChunk(): data is a BSON Binary. */
function chunkDoc(index: number, bytes: string) {
  return { chunk_index: index, data: { buffer: Buffer.from(bytes, 'utf-8') } };
}

function makeCollection(docs: ReturnType<typeof chunkDoc>[], sessionDoc?: unknown) {
  const cursor = {
    async *[Symbol.asyncIterator]() {
      for (const doc of docs) yield doc;
    },
  };
  return {
    createIndex: jest.fn().mockResolvedValue(undefined),
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'x' }),
    deleteMany: jest.fn().mockResolvedValue({ deletedCount: docs.length }),
    findOne: jest.fn().mockResolvedValue(sessionDoc ?? null),
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue(cursor) }),
  };
}

function mockAuthenticatedEditor() {
  const user = { id: 'u1', email: 'editor@example.com', role: 'editor' };
  (requireEditor as jest.Mock).mockResolvedValue({ session: { user }, user });
}

// ---------------------------------------------------------------------------
// lib/upload-chunks — byte accounting
// ---------------------------------------------------------------------------

describe('assembleChunks — cap applied to the stored bytes', () => {
  it('assembles the chunks when the real total is inside the cap', async () => {
    // 'aaaaaaaaaa' + 'bbbbbbbbbb' = 20 ASCII bytes.
    (getCollection as jest.Mock).mockResolvedValue(
      makeCollection([chunkDoc(0, 'a'.repeat(10)), chunkDoc(1, 'b'.repeat(10))]),
    );

    expect(await assembleChunks('s1', 2, 20)).toBe('a'.repeat(10) + 'b'.repeat(10));
  });

  it('aborts on the chunk that pushes the running total past the cap', async () => {
    // Four 10-byte chunks: running totals 10, 20, 30, 40. With a 25-byte cap the
    // third chunk is the first to exceed it, so the walk stops at 30 bytes read
    // and never concatenates the 40-byte buffer.
    (getCollection as jest.Mock).mockResolvedValue(
      makeCollection([0, 1, 2, 3].map(i => chunkDoc(i, String(i).repeat(10)))),
    );

    const error = await assembleChunks('s1', 4, 25).catch(e => e);

    expect(error).toBeInstanceOf(UploadSizeLimitError);
    expect(error.bytesRead).toBe(30);
    expect(error.limit).toBe(25);
  });

  it('still reports an incomplete upload when no cap is exceeded', async () => {
    (getCollection as jest.Mock).mockResolvedValue(makeCollection([chunkDoc(0, 'abc')]));

    await expect(assembleChunks('s1', 3)).rejects.toThrow(
      'Incomplete upload: expected 3 chunks, found 1',
    );
  });
});

describe('assembleChunksToFile — cap applied to the written bytes', () => {
  it('rejects file-open errors while waiting for the database cursor', async () => {
    const collection = makeCollection([]);
    collection.find.mockReturnValue({ sort: jest.fn().mockReturnValue({
      async *[Symbol.asyncIterator]() {
        // The file open fails before MongoDB has yielded its first chunk.
        await new Promise(resolve => setTimeout(resolve, 20));
        yield chunkDoc(0, 'data');
      },
    }) });
    (getCollection as jest.Mock).mockResolvedValue(collection);
    await expect(assembleChunksToFile('s1', 1, path.join(tmpdir(), `missing-${process.pid}`, 'upload.xml')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });

  const outPath = path.join(tmpdir(), `infra-upload-size-limits-${process.pid}.tmp`);

  afterEach(() => rmSync(outPath, { force: true }));

  it('writes every chunk and reports the true byte count', async () => {
    (getCollection as jest.Mock).mockResolvedValue(
      makeCollection([chunkDoc(0, 'hello '), chunkDoc(1, 'world')]),
    );

    // 'hello ' (6) + 'world' (5) = 11 bytes.
    expect(await assembleChunksToFile('s1', 2, outPath, 100)).toEqual({ bytesWritten: 11 });
    expect(readFileSync(outPath, 'utf-8')).toBe('hello world');
  });

  it('stops before writing the chunk that would exceed the cap', async () => {
    // Three 10-byte chunks against a 15-byte cap: the second chunk takes the
    // total to 20, so it is never written and the file stays at 10 bytes.
    (getCollection as jest.Mock).mockResolvedValue(
      makeCollection([0, 1, 2].map(i => chunkDoc(i, String(i).repeat(10)))),
    );

    const error = await assembleChunksToFile('s1', 3, outPath, 15).catch(e => e);

    expect(error).toBeInstanceOf(UploadSizeLimitError);
    expect(error.bytesRead).toBe(20);
    expect(error.limit).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// POST /api/upload/init — the declared plan must match the declared size
// ---------------------------------------------------------------------------

describe('POST /api/upload/init — chunk plan consistency', () => {
  beforeEach(() => mockAuthenticatedEditor());

  function initRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost:3000/api/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects a one-byte file declared with a 200-chunk plan', async () => {
    (getCollection as jest.Mock).mockResolvedValue(makeCollection([]));
    const { POST } = await import('@/app/api/upload/init/route');

    const res = await POST(initRequest({ fileName: 'big.csv', fileSize: 1, totalChunks: 200 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/inconsistent with fileSize/);
  });

  it('accepts the plan the client actually produces (ceil(size / CHUNK_SIZE))', async () => {
    const collection = makeCollection([]);
    (getCollection as jest.Mock).mockResolvedValue(collection);
    const { POST } = await import('@/app/api/upload/init/route');

    const fileSize = 10 * 1024 * 1024;
    const res = await POST(
      initRequest({
        fileName: 'catalogue.csv',
        fileSize,
        totalChunks: Math.ceil(fileSize / CHUNK_SIZE),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: 'session-under-test', chunkSize: CHUNK_SIZE });
  });
});

// ---------------------------------------------------------------------------
// POST /api/upload/finalize — caps enforced on the stored bytes
// ---------------------------------------------------------------------------

describe('POST /api/upload/finalize — declared size cannot raise the cap', () => {
  const originalLimit = process.env.UPLOAD_MAX_SYNC_PARSE_MB;

  beforeEach(() => {
    mockAuthenticatedEditor();
    // 0.00002 MB = floor(0.00002 * 1048576) = 20 bytes, so the cap is reachable
    // with a handful of test chunks.
    process.env.UPLOAD_MAX_SYNC_PARSE_MB = '0.00002';
  });

  afterEach(() => {
    if (originalLimit === undefined) delete process.env.UPLOAD_MAX_SYNC_PARSE_MB;
    else process.env.UPLOAD_MAX_SYNC_PARSE_MB = originalLimit;
  });

  function finalizeRequest(): NextRequest {
    return new NextRequest('http://localhost:3000/api/upload/finalize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1' }),
    });
  }

  function sessionDoc(fileSize: number, totalChunks: number) {
    return {
      session_id: 's1',
      chunk_index: -1,
      file_name: 'big.csv',
      file_size: fileSize,
      total_chunks: totalChunks,
    };
  }

  it('returns 413 when a session that declared 1 byte stored 40', async () => {
    const collection = makeCollection(
      [0, 1, 2, 3].map(i => chunkDoc(i, String(i).repeat(10))),
      sessionDoc(1, 4),
    );
    (getCollection as jest.Mock).mockResolvedValue(collection);
    const { POST } = await import('@/app/api/upload/finalize/route');

    const res = await POST(finalizeRequest());
    const body = await res.json();

    expect(res.status).toBe(413);
    expect(body.code).toBe('UPLOAD_PARSE_LIMIT_EXCEEDED');
    expect(body.limit).toBe(20);
    // Aborted on the chunk that crossed the cap: 10 + 10 + 10 bytes read.
    expect(body.fileSize).toBe(30);
    // The abusive chunks are dropped rather than left for the 1-hour TTL.
    expect(collection.deleteMany).toHaveBeenCalledWith({ session_id: 's1' });
  });

  it('accepts an upload inside the cap and reports the real byte count', async () => {
    (getCollection as jest.Mock).mockResolvedValue(
      makeCollection([chunkDoc(0, 'a'.repeat(10)), chunkDoc(1, 'b'.repeat(10))], sessionDoc(1, 2)),
    );
    const { POST } = await import('@/app/api/upload/finalize/route');

    const res = await POST(finalizeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    // 20 real bytes, not the 1 byte the client declared at init.
    expect(body.fileSize).toBe(20);
  });
});
