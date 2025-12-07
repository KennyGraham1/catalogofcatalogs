import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/parsers';
import { withCSRF } from '@/lib/csrf';
import { type Delimiter } from '@/lib/delimiter-detector';
import { type DateFormat } from '@/lib/date-format-detector';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export const POST = withCSRF(async (request: NextRequest) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const delimiterParam = formData.get('delimiter') as string | null;
    const dateFormatParam = formData.get('dateFormat') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedExtensions = ['csv', 'txt', 'json', 'geojson', 'xml', 'qml'];
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: CSV, TXT, JSON, GeoJSON, XML, QML' },
        { status: 400 }
      );
    }

    // Parse delimiter parameter if provided
    let delimiter: Delimiter | undefined;
    if (delimiterParam) {
      const delimiterMap: Record<string, Delimiter> = {
        'comma': ',',
        'tab': '\t',
        'semicolon': ';',
        'pipe': '|',
        'space': ' '
      };
      delimiter = delimiterMap[delimiterParam.toLowerCase()];
    }

    // Parse date format parameter if provided
    let dateFormat: DateFormat | undefined;
    if (dateFormatParam) {
      // Map user-friendly names to DateFormat type
      const dateFormatMap: Record<string, DateFormat> = {
        'us': 'US',
        'international': 'International',
        'iso': 'ISO'
      };
      dateFormat = dateFormatMap[dateFormatParam.toLowerCase()];
    }

    // Read file content
    const content = await file.text();

    // Parse the file
    const parseResult = parseFile(content, file.name, delimiter, dateFormat);

    return NextResponse.json({
      fileName: file.name,
      fileSize: file.size,
      format: extension.toUpperCase(),
      ...parseResult
    });

  } catch (error) {
    console.error('Upload error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to process file';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
});

