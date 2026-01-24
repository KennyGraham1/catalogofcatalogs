import { NextRequest, NextResponse } from 'next/server';
import { dbQueries } from '@/lib/db';
import { requireEditor } from '@/lib/auth/middleware';
import { v4 as uuidv4 } from 'uuid';

/**
 * GET /api/mapping-templates
 * Retrieve all mapping templates
 */
export async function GET(request: NextRequest) {
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

    const templates = await dbQueries.getMappingTemplates();
    
    // Parse mappings JSON for each template
    const parsedTemplates = templates.map(template => ({
      ...template,
      mappings: JSON.parse(template.mappings)
    }));

    return NextResponse.json(parsedTemplates);
  } catch (error) {
    console.error('Error fetching mapping templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mapping templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mapping-templates
 * Create a new mapping template
 */
export async function POST(request: NextRequest) {
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

    const id = uuidv4();
    const mappingsJson = JSON.stringify(mappings);

    await dbQueries.insertMappingTemplate(
      id,
      name,
      description || null,
      mappingsJson
    );

    // Fetch the created template
    const template = await dbQueries.getMappingTemplateById(id);
    
    if (!template) {
      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...template,
      mappings: JSON.parse(template.mappings)
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating mapping template:', error);
    return NextResponse.json(
      { error: 'Failed to create mapping template' },
      { status: 500 }
    );
  }
}
