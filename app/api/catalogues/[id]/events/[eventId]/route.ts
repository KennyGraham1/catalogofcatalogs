import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { formatErrorResponse } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; eventId: string }> }) {
  const auth = await requireViewer(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const { id, eventId } = await context.params;
    if (!dbQueries) return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    const event = await dbQueries.getEventById(id, eventId);
    return event ? NextResponse.json(event) : NextResponse.json({ error: 'Event not found' }, { status: 404 });
  } catch (error) {
    const result = formatErrorResponse(error);
    return NextResponse.json({ error: result.error }, { status: result.statusCode });
  }
}
