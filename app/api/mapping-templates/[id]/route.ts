import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { requireEditor } from '@/lib/auth/middleware';

/**
 * GET /api/mapping-templates/[id]
 * Retrieve a specific mapping template by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    const template = await dbQueries.getMappingTemplateById(params.id);

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...template,
      mappings: JSON.parse(template.mappings)
    });
  } catch (error) {
    console.error('Error fetching mapping template:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mapping template' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mapping-templates/[id]
 * Update a mapping template
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { name, description, mappings } = body;

    // Validate required fields
    if (!name || !mappings) {
      return NextResponse.json(
        { error: 'Missing required fields: name and mappings' },
        { status: 400 }
      );
    }

    // Validate mappings is an array
    if (!Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Mappings must be an array' },
        { status: 400 }
      );
    }

    // Check if template exists
    const existing = await dbQueries.getMappingTemplateById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    const mappingsJson = JSON.stringify(mappings);

    await dbQueries.updateMappingTemplate(
      params.id,
      name,
      description || null,
      mappingsJson
    );

    // Fetch the updated template
    const template = await dbQueries.getMappingTemplateById(params.id);
    
    if (!template) {
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...template,
      mappings: JSON.parse(template.mappings)
    });
  } catch (error) {
    console.error('Error updating mapping template:', error);
    return NextResponse.json(
      { error: 'Failed to update mapping template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mapping-templates/[id]
 * Delete a mapping template
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireEditor(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (!dbQueries) {
      return NextResponse.json(
        { error: 'Database not initialized' },
        { status: 500 }
      );
    }

    // Check if template exists
    const existing = await dbQueries.getMappingTemplateById(params.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    await dbQueries.deleteMappingTemplate(params.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting mapping template:', error);
    return NextResponse.json(
      { error: 'Failed to delete mapping template' },
      { status: 500 }
    );
  }
}
