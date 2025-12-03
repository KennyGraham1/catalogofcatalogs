import { NextRequest, NextResponse } from 'next/server';
import { parseFile } from '@/lib/parsers';
import { withCSRF } from '@/lib/csrf';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export const POST = withCSRF(async (request: NextRequest) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

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
    const allowedExtensions = ['csv', 'txt', 'json', 'xml', 'qml'];
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: CSV, TXT, JSON, XML, QML' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Parse the file
    const parseResult = parseFile(content, file.name);

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

