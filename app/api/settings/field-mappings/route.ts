/**
 * API endpoint for managing default field mappings configuration
 * 
 * GET /api/settings/field-mappings - Retrieve the current field mappings configuration
 * PUT /api/settings/field-mappings - Save/update the field mappings configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { dbQueries, getDb } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

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
    const db = await getDb();
    if (!db) {
      return NextResponse.json(
        { error: 'Database not available' },
        { status: 500 }
      );
    }

    const body = await request.json();

    // Validate required fields
    if (typeof body.autoDetectEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid configuration: autoDetectEnabled is required' },
        { status: 400 }
      );
    }

    if (!body.formats || typeof body.formats !== 'object') {
      return NextResponse.json(
        { error: 'Invalid configuration: formats object is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.customMappings)) {
      return NextResponse.json(
        { error: 'Invalid configuration: customMappings array is required' },
        { status: 400 }
      );
    }

    // Validate each custom mapping
    for (const mapping of body.customMappings) {
      if (!mapping.sourcePattern || !mapping.targetField) {
        return NextResponse.json(
          { error: 'Invalid mapping: sourcePattern and targetField are required' },
          { status: 400 }
        );
      }
    }

    const collection = db.collection(SETTINGS_COLLECTION);

    const config = {
      autoDetectEnabled: body.autoDetectEnabled,
      strictValidation: body.strictValidation ?? false,
      fuzzyMatchThreshold: body.fuzzyMatchThreshold ?? 0.6,
      formats: body.formats,
      customMappings: body.customMappings,
      lastUpdated: body.lastUpdated || new Date().toISOString()
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

