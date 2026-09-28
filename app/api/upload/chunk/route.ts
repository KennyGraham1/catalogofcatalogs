/**
 * POST /api/upload/chunk
 *
 * Second step of the chunked upload flow. Receives one chunk of a file and
 * stores it in MongoDB. Each request body is a multipart/form-data payload
 * containing:
 *   sessionId    – string, from /api/upload/init
 *   chunkIndex   – number (0-based)
 *   chunk        – Blob (the raw bytes for this chunk)
 *
 * Vercel hard limit: 4.5 MB per function payload.
 * Maximum chunk size is 3 MB (set in lib/upload-chunks.ts), so each request
 * is well within that limit.
 *
 * Response: JSON { received: true, chunkIndex: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import { storeChunk, getUploadSession, CHUNK_SIZE } from '@/lib/upload-chunks';

export const dynamic = 'force-dynamic';

const logger = new Logger('UploadChunkAPI');

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult;

    const formData  = await request.formData();
    const sessionId = formData.get('sessionId') as string | null;
    const chunkBlob = formData.get('chunk') as Blob | null;

    // Number(null) and Number('') both coerce to 0, which used to let a
    // missing or blank chunkIndex silently overwrite chunk 0 despite the
    // error text below claiming the field is required. Require a non-blank
    // string before coercing, and require an integer — Number.isFinite alone
    // accepted values like 1.5, which sort between real chunk indexes and
    // can stand in for a genuinely missing chunk (finding #52).
    const chunkIndexRaw = formData.get('chunkIndex');
    const chunkIndexStr = typeof chunkIndexRaw === 'string' ? chunkIndexRaw.trim() : '';
    if (!chunkIndexStr) {
      return NextResponse.json({ error: 'chunkIndex is required' }, { status: 400 });
    }
    const chunkIndex = Number(chunkIndexStr);

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: 'chunkIndex must be a non-negative integer' }, { status: 400 });
    }
    if (!chunkBlob) {
      return NextResponse.json({ error: 'chunk is required' }, { status: 400 });
    }
    if (chunkBlob.size > CHUNK_SIZE * 1.1) { // 10% tolerance
      return NextResponse.json({ error: 'chunk exceeds maximum allowed size' }, { status: 400 });
    }

    // Verify the session exists and belongs to this user (C9). Scoping the
    // lookup by owner means a session created by someone else looks exactly
    // like a missing one — it does not confirm the session's existence to a
    // non-owner, and it prevents an editor who has learned another user's
    // sessionId from overwriting their in-progress chunks (finding #51).
    const session = await getUploadSession(sessionId, user.id);
    if (!session) {
      return NextResponse.json(
        { error: 'Upload session not found or expired. Please restart the upload.' },
        { status: 404 },
      );
    }
    if (chunkIndex >= session.total_chunks) {
      return NextResponse.json(
        { error: `chunkIndex ${chunkIndex} is out of range for this upload (expected 0..${session.total_chunks - 1})` },
        { status: 400 },
      );
    }

    const arrayBuffer = await chunkBlob.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    await storeChunk(sessionId, chunkIndex, buffer);

    logger.info('Chunk stored', { sessionId, chunkIndex, bytes: buffer.length });

    return NextResponse.json({ received: true, chunkIndex });
  } catch (error) {
    logger.error('Failed to store chunk', error);
    return NextResponse.json({ error: 'Failed to store chunk' }, { status: 500 });
  }
}
