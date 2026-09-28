/**
 * @jest-environment node
 *
 * Route-level regression tests for /api/upload/init and /api/upload/chunk
 * (cluster I2 — upload transport).
 *
 * Covers:
 *  - #51/C9: init stamps owner_id from the authenticated session, and the
 *    chunk route refuses to store a chunk against a session owned by a
 *    different user.
 *  - #52: chunkIndex must be a present, non-negative integer at the route
 *    boundary (Number(null) and Number('') both coerce to 0).
 *  - #36/#46 (producer half): init validates the delimiter before storing it,
 *    so an unmappable value can never reach finalize's parser.
 *  - FEATURE: '.quakeml' is an accepted extension and is exempt from the
 *    synchronous-parse size cap, like '.xml'/'.qml'.
 */

jest.mock('@/lib/auth/middleware', () => ({
  requireEditor: jest.fn(),
}));

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: { UPLOAD_CHUNKS: 'upload_chunks' },
}));

jest.mock('@/lib/id', () => ({ createId: jest.fn().mockReturnValue('session-under-test') }));

jest.mock('mongodb', () => ({
  Binary: class {
    buffer: Buffer;
    constructor(buffer: Buffer) {
      this.buffer = buffer;
    }
  },
}));

import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/mongodb';
import { requireEditor } from '@/lib/auth/middleware';

function mockUser(id: string) {
  const user = { id, email: `${id}@example.com`, role: 'editor' };
  (requireEditor as jest.Mock).mockResolvedValue({ session: { user }, user });
}

/** A collection whose findOne/insertOne/replaceOne/updateMany actually
 * filter/mutate an in-memory doc list, so ownership scoping can be exercised
 * end-to-end rather than asserted only via call-argument shape. */
function makeRealisticCollection() {
  const docs: Array<Record<string, unknown>> = [];
  const matches = (doc: Record<string, unknown>, query: Record<string, unknown>) =>
    Object.entries(query).every(([k, v]) => doc[k] === v);

  return {
    docs,
    createIndex: jest.fn().mockResolvedValue(undefined),
    insertOne: jest.fn(async (doc: Record<string, unknown>) => {
      docs.push({ ...doc });
      return { insertedId: 'x' };
    }),
    findOne: jest.fn(async (query: Record<string, unknown>) => docs.find(d => matches(d, query)) ?? null),
    updateMany: jest.fn(async (query: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      let modifiedCount = 0;
      for (const d of docs) {
        if (matches(d, query)) {
          Object.assign(d, update.$set);
          modifiedCount += 1;
        }
      }
      return { modifiedCount };
    }),
    replaceOne: jest.fn(
      async (query: Record<string, unknown>, replacement: Record<string, unknown>, opts?: { upsert?: boolean }) => {
        const idx = docs.findIndex(d => matches(d, query));
        if (idx >= 0) docs[idx] = { ...replacement };
        else if (opts?.upsert) docs.push({ ...replacement });
        return {};
      },
    ),
  };
}

function simpleCollection(overrides: Record<string, unknown> = {}) {
  return {
    createIndex: jest.fn().mockResolvedValue(undefined),
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'x' }),
    findOne: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({}),
    replaceOne: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function initRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/upload/init', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function chunkFormRequest(fields: Record<string, string | Blob>): NextRequest {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value as never);
  return new NextRequest('http://localhost:3000/api/upload/chunk', { method: 'POST', body: form });
}

// ---------------------------------------------------------------------------
// POST /api/upload/init — delimiter validation (findings #36/#46, producer half)
// ---------------------------------------------------------------------------

describe('POST /api/upload/init — delimiter validation', () => {
  beforeEach(() => mockUser('user-a'));

  it('accepts a DelimiterSelector name and stores it unchanged', async () => {
    const insertOne = jest.fn().mockResolvedValue({ insertedId: 'x' });
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection({ insertOne }));
    const { POST } = await import('@/app/api/upload/init/route');

    const res = await POST(initRequest({ fileName: 'a.csv', fileSize: 10, totalChunks: 1, delimiter: 'comma' }));

    expect(res.status).toBe(200);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({ delimiter: 'comma' }));
  });

  it('rejects an unmappable delimiter instead of storing it for finalize to choke on', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection());
    const { POST } = await import('@/app/api/upload/init/route');

    const res = await POST(initRequest({ fileName: 'a.csv', fileSize: 10, totalChunks: 1, delimiter: 'bogus' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid delimiter/);
  });

  it('leaves delimiter unset when the client omits it (auto-detect)', async () => {
    const insertOne = jest.fn().mockResolvedValue({ insertedId: 'x' });
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection({ insertOne }));
    const { POST } = await import('@/app/api/upload/init/route');

    const res = await POST(initRequest({ fileName: 'a.csv', fileSize: 10, totalChunks: 1 }));

    expect(res.status).toBe(200);
    expect((insertOne.mock.calls[0][0] as Record<string, unknown>).delimiter).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FEATURE — '.quakeml' extension
// ---------------------------------------------------------------------------

describe('POST /api/upload/init — .quakeml extension', () => {
  beforeEach(() => mockUser('user-a'));

  it('accepts a .quakeml file name', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection());
    const { POST } = await import('@/app/api/upload/init/route');

    const res = await POST(initRequest({ fileName: 'catalogue.quakeml', fileSize: 10, totalChunks: 1 }));

    expect(res.status).toBe(200);
  });

  it('exempts .quakeml from the synchronous-parse size cap, like .xml/.qml', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection());
    const originalLimit = process.env.UPLOAD_MAX_SYNC_PARSE_MB;
    process.env.UPLOAD_MAX_SYNC_PARSE_MB = '1'; // 1 MB cap, comfortably below the file below
    try {
      const { POST } = await import('@/app/api/upload/init/route');
      const { CHUNK_SIZE } = await import('@/lib/upload-chunks');
      const fileSize = 5 * 1024 * 1024; // over the 1 MB cap
      const res = await POST(
        initRequest({ fileName: 'big.quakeml', fileSize, totalChunks: Math.ceil(fileSize / CHUNK_SIZE) }),
      );

      expect(res.status).toBe(200);
    } finally {
      if (originalLimit === undefined) delete process.env.UPLOAD_MAX_SYNC_PARSE_MB;
      else process.env.UPLOAD_MAX_SYNC_PARSE_MB = originalLimit;
    }
  });

  it('still rejects an actually-disallowed extension', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection());
    const { POST } = await import('@/app/api/upload/init/route');

    const res = await POST(initRequest({ fileName: 'catalogue.pdf', fileSize: 10, totalChunks: 1 }));

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/upload/chunk — chunkIndex validation (finding #52)
// ---------------------------------------------------------------------------

describe('POST /api/upload/chunk — chunkIndex validation', () => {
  beforeEach(() => mockUser('user-a'));

  function sessionDoc(ownerId = 'user-a') {
    return { session_id: 's1', chunk_index: -1, total_chunks: 3, file_name: 'a.csv', owner_id: ownerId };
  }

  it('rejects a missing chunkIndex instead of silently defaulting to 0', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection({ findOne: jest.fn().mockResolvedValue(sessionDoc()) }));
    const { POST } = await import('@/app/api/upload/chunk/route');

    const res = await POST(chunkFormRequest({ sessionId: 's1', chunk: new Blob(['x']) }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/chunkIndex is required/);
  });

  it('rejects an empty-string chunkIndex', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection({ findOne: jest.fn().mockResolvedValue(sessionDoc()) }));
    const { POST } = await import('@/app/api/upload/chunk/route');

    const res = await POST(chunkFormRequest({ sessionId: 's1', chunkIndex: '', chunk: new Blob(['x']) }));

    expect(res.status).toBe(400);
  });

  it('rejects a non-integer chunkIndex (1.5)', async () => {
    (getCollection as jest.Mock).mockResolvedValue(simpleCollection({ findOne: jest.fn().mockResolvedValue(sessionDoc()) }));
    const { POST } = await import('@/app/api/upload/chunk/route');

    const res = await POST(chunkFormRequest({ sessionId: 's1', chunkIndex: '1.5', chunk: new Blob(['x']) }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/non-negative integer/);
  });

  it('accepts a valid integer chunkIndex', async () => {
    const replaceOne = jest.fn().mockResolvedValue({});
    const updateMany = jest.fn().mockResolvedValue({});
    (getCollection as jest.Mock).mockResolvedValue(
      simpleCollection({ findOne: jest.fn().mockResolvedValue(sessionDoc()), replaceOne, updateMany }),
    );
    const { POST } = await import('@/app/api/upload/chunk/route');

    const res = await POST(chunkFormRequest({ sessionId: 's1', chunkIndex: '0', chunk: new Blob(['x']) }));

    expect(res.status).toBe(200);
    expect(replaceOne).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C9 / finding #51 — chunk ownership, end to end through init + chunk
// ---------------------------------------------------------------------------

describe('Upload session ownership end-to-end', () => {
  it('a session created by one user cannot receive chunks posted by another', async () => {
    const collection = makeRealisticCollection();
    (getCollection as jest.Mock).mockResolvedValue(collection);

    mockUser('user-a');
    const { POST: initPOST } = await import('@/app/api/upload/init/route');
    const initRes = await initPOST(initRequest({ fileName: 'a.csv', fileSize: 10, totalChunks: 1 }));
    expect(initRes.status).toBe(200);
    const { sessionId } = await initRes.json();

    const { POST: chunkPOST } = await import('@/app/api/upload/chunk/route');

    // The attacker knows the sessionId (e.g. from a shared log) but is a
    // different authenticated user.
    mockUser('user-b');
    const attackRes = await chunkPOST(chunkFormRequest({ sessionId, chunkIndex: '0', chunk: new Blob(['x']) }));
    expect(attackRes.status).toBe(404);
    expect((await attackRes.json()).error).toMatch(/not found or expired/);

    // The owning user can still upload chunks normally.
    mockUser('user-a');
    const okRes = await chunkPOST(chunkFormRequest({ sessionId, chunkIndex: '0', chunk: new Blob(['x']) }));
    expect(okRes.status).toBe(200);
  });
});
