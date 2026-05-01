/**
 * POST /api/upload/init
 *
 * First step of the three-step chunked upload flow used for files > 3.5 MB.
 *
 * Body: JSON
 *   { fileName: string, fileSize: number, totalChunks: number,
 *     delimiter?: string, dateFormat?: string }
 *
 * Response: JSON
 *   { sessionId: string, chunkSize: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireEditor } from '@/lib/auth/middleware';
import { Logger } from '@/lib/errors';
import { createUploadSession, CHUNK_SIZE } from '@/lib/upload-chunks';
import { createUploadTooLargeResponse, getMaxSyncUploadParseBytes } from '@/lib/upload-limits';

export const dynamic = 'force-dynamic';

const logger = new Logger('UploadInitAPI');

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { fileName, fileSize, totalChunks, delimiter, dateFormat } = body;

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }
    if (!Number.isInteger(totalChunks) || totalChunks < 1) {
      return NextResponse.json({ error: 'totalChunks must be a positive integer' }, { status: 400 });
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: 'fileSize must be a positive number' }, { status: 400 });
    }
    const maxParseBytes = getMaxSyncUploadParseBytes();
    if (fileSize > maxParseBytes) {
      return NextResponse.json(createUploadTooLargeResponse(fileSize), { status: 413 });
    }

    const sessionId = await createUploadSession(
      fileName,
      fileSize,
      totalChunks,
      delimiter ?? undefined,
      dateFormat ?? undefined,
    );

    logger.info('Chunked upload session created', { sessionId, fileName, fileSize, totalChunks });

    return NextResponse.json({ sessionId, chunkSize: CHUNK_SIZE });
  } catch (error) {
    logger.error('Failed to create upload session', error);
    return NextResponse.json({ error: 'Failed to initialise upload session' }, { status: 500 });
  }
}
