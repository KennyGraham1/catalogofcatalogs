/**
 * API endpoint for managing default field mappings configuration
 * 
 * GET /api/settings/field-mappings - Retrieve the current field mappings configuration
 * PUT /api/settings/field-mappings - Save/update the field mappings configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/auth/middleware';
import { parseFieldMappingsConfig } from '@/lib/field-definitions';

const SETTINGS_COLLECTION = 'settings';
const FIELD_MAPPINGS_KEY = 'default_field_mappings';

/**
 * GET /api/settings/field-mappings
 * Returns the current field mappings configuration
 */
export async function GET() {
  try {
    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const collection = db.collection(SETTINGS_COLLECTION);
    const settings = await collection.findOne({ key: FIELD_MAPPINGS_KEY });

    if (!settings) {
      return NextResponse.json(
        { error: 'No field mappings configuration found' },
        { status: 404 }
      );
    }

    return NextResponse.json(settings.config);
  } catch (error) {
    console.error('Error fetching field mappings config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch field mappings configuration' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/field-mappings
 * Save or update the field mappings configuration
 */
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // The whole configuration is validated: it is applied to every upload's schema step,
    // and a single malformed rule (missing pattern, invalid regex, unknown target,
    // priority as a string) used to break that step for every user.
    const parsed = parseFieldMappingsConfig(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const collection = db.collection(SETTINGS_COLLECTION);

    const config = {
      ...parsed.config,
      lastUpdated: new Date().toISOString(),
    };

    await collection.updateOne(
      { key: FIELD_MAPPINGS_KEY },
      {
        $set: {
          key: FIELD_MAPPINGS_KEY,
          config,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error saving field mappings config:', error);
    return NextResponse.json(
      { error: 'Failed to save field mappings configuration' },
      { status: 500 }
    );
  }
}
