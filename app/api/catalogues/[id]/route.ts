import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dbQueries } from '@/lib/db';
import { Logger, NotFoundError, formatErrorResponse } from '@/lib/errors';
import { requireEditor } from '@/lib/auth/middleware';
import { writeAuditLog } from '@/lib/audit';
import { mergeMetadataSchema } from '@/lib/validation';

const logger = new Logger('CatalogueAPI');

/**
 * Catalogue edits are validated with the merge metadata schema's field rules (same
 * bounds, same 50 KB cap, unknown keys stripped), extended with the catalogue fields a
 * merge never sets. Every field also accepts null, which clears it. Server-managed
 * fields are deliberately absent, so they are stripped rather than stored: provenance
 * (created_by, modified_at, modified_by) is set from the session, and `version` is the
 * platform's catalogue version (lib/db.ts), bumped by the update itself.
 */
const mergeFieldRules = Object.fromEntries(
  Object.entries(mergeMetadataSchema.innerType().shape).map(
    ([field, rule]) => [field, (rule as z.ZodTypeAny).nullable()]
  )
);
const optionalText = (max: number) => z.string().max(max).nullable().optional();

const catalogueUpdateSchema = z
  .object({
    ...mergeFieldRules,
    // Tighter than the merge schema's `any`: exports read these three strings.
    data_quality: z
      .union([
        z.object({
          completeness: z.string().max(500).optional(),
          accuracy: z.string().max(500).optional(),
          reliability: z.string().max(500).optional(),
        }).strip(),
        z.string().max(2000),
      ])
      .nullable()
      .optional(),
    // Normalised to ISO 8601 UTC by lib/db.ts; an unparseable value is a 400 there.
    time_period_start: optionalText(64),
    time_period_end: optionalText(64),
    contact_name: optionalText(255),
    contact_email: z.union([z.literal(''), z.string().email().max(255)]).nullable().optional(),
    contact_organization: optionalText(255),
    license: optionalText(255),
    usage_terms: optionalText(5000),
    citation: optionalText(5000),
    doi: optionalText(255),
    source_version: optionalText(100),
  })
  .strip()
  .refine((m) => JSON.stringify(m ?? {}).length <= 50_000, {
    message: 'metadata exceeds the maximum allowed size (50KB)',
  });

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    logger.info('Fetching catalogue', { id: id });

    const catalogue = await dbQueries.getCatalogueById(id);

    if (!catalogue) {
      throw new NotFoundError('Catalogue');
    }

    return NextResponse.json(catalogue);
  } catch (error) {
    logger.error('Failed to fetch catalogue', error, { id: id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    logger.info('Updating catalogue', { id: id });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Request body must be JSON' }, { status: 400 });
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }
    const { name, ...rawMetadata } = body as Record<string, unknown>;

    // Validate catalogue name if provided
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 255)) {
      return NextResponse.json(
        { error: 'Invalid catalogue name' },
        { status: 400 }
      );
    }

    const parsed = catalogueUpdateSchema.safeParse(rawMetadata);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid catalogue metadata', details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        { status: 400 }
      );
    }
    // Keep only the fields the request actually sent (optional keys come back undefined).
    const metadata = Object.fromEntries(
      Object.entries(parsed.data as Record<string, unknown>).filter(([, value]) => value !== undefined)
    );

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // One update for the name and the metadata, so one edit is one PATCH-level version
    // bump, with modified_at / modified_by stamped by the server.
    const result = await dbQueries.updateCatalogueMetadata(id, metadata, {
      name: typeof name === 'string' ? name.trim() : undefined,
      modifiedBy: authResult.user.id,
    });
    if (!result) {
      throw new NotFoundError('Catalogue');
    }

    logger.info('Catalogue updated successfully', { id: id, version: result.version });
    await writeAuditLog({
      action: 'catalogue.update',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_id: id,
      target_type: 'catalogue',
      metadata: {
        fields: [...(name !== undefined ? ['name'] : []), ...Object.keys(metadata)],
        version: result.version,
      },
    }, request);

    // Caches are invalidated by the database layer as part of the update itself.
    return NextResponse.json({ success: true, version: result.version });
  } catch (error) {
    logger.error('Failed to update catalogue', error, { id: id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    // Require Editor role or higher
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    logger.info('Deleting catalogue', { id: id });

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    const deleted = await dbQueries.deleteCatalogue(id);
    if (!deleted) {
      throw new NotFoundError('Catalogue');
    }

    logger.info('Catalogue deleted successfully', { id: id });
    await writeAuditLog({
      action: 'catalogue.delete',
      actor_id: authResult.user.id,
      actor_email: authResult.user.email,
      target_id: id,
      target_type: 'catalogue',
    }, request);

    // Caches (catalogue list, region searches, this catalogue's events) are
    // invalidated by the database layer as part of the deletion itself.
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete catalogue', error, { id: id });
    const errorResponse = formatErrorResponse(error);

    return NextResponse.json(
      { error: errorResponse.error, code: errorResponse.code },
      { status: errorResponse.statusCode }
    );
  }
}
