/**
 * The network-authority table the merge engine ranks reports with (lib/merge-authority.ts).
 *
 * GET    /api/settings/merge-authority - the effective table (custom, else the built-in default)
 * PUT    /api/settings/merge-authority - validate and save an administrator's table
 * DELETE /api/settings/merge-authority - drop the custom table; merges use the default again
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireViewer } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';
import {
  DEFAULT_MERGE_AUTHORITY,
  loadMergeAuthority,
  parseMergeAuthorityTable,
  resetMergeAuthority,
  saveMergeAuthority,
} from '@/lib/merge-authority';

const AUDIT_ACTION = 'settings.merge_authority';

export async function GET(request: NextRequest) {
  const authResult = await requireViewer(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    // loadMergeAuthority never throws: a database fault yields the default table, which is
    // exactly what the engine would merge with in the same state.
    return NextResponse.json(await loadMergeAuthority());
  } catch (error) {
    console.error('Error fetching merge authority table:', error);
    return NextResponse.json({ error: 'Failed to fetch merge authority table' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // The table is applied to every merge on the site, so one bad row (a pattern with a space
  // the engine could never match, a priority of 0) is refused rather than stored.
  const parsed = parseMergeAuthorityTable(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const table = await saveMergeAuthority(parsed.table);
    await writeAuditLog({
      action: AUDIT_ACTION,
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_id: 'merge_authority',
      target_type: 'settings',
      metadata: {
        operation: 'save',
        hierarchyEntries: table.hierarchy.length,
        regions: table.regions.map(region => region.name),
        updatedAt: table.updatedAt,
      },
    }, request);
    return NextResponse.json({ success: true, table });
  } catch (error) {
    console.error('Error saving merge authority table:', error);
    return NextResponse.json({ error: 'Failed to save merge authority table' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (authResult instanceof NextResponse) return authResult;

  try {
    await resetMergeAuthority();
    await writeAuditLog({
      action: AUDIT_ACTION,
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_id: 'merge_authority',
      target_type: 'settings',
      metadata: { operation: 'reset' },
    }, request);
    return NextResponse.json({ success: true, table: DEFAULT_MERGE_AUTHORITY });
  } catch (error) {
    console.error('Error resetting merge authority table:', error);
    return NextResponse.json({ error: 'Failed to reset merge authority table' }, { status: 500 });
  }
}
