/**
 * Unit tests for lib/export-utils.ts
 */

import {
  sanitizeFilename,
  formatDateForFilename,
  generateExportFilename,
  generateContentDisposition,
  getExportMimeType,
  createDownloadHeaders,
  csvField,
} from '@/lib/export-utils';

describe('sanitizeFilename', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(sanitizeFilename('GeoNet 2024')).toBe('geonet_2024');
  });

  it('removes special characters', () => {
    expect(sanitizeFilename('Catalogue (NZ)!')).toBe('catalogue_nz');
  });

  it('collapses multiple underscores', () => {
    expect(sanitizeFilename('a   b')).toBe('a_b');
  });

  it('strips leading and trailing underscores', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello');
  });

  it('falls back when all characters are removed', () => {
    expect(sanitizeFilename('!!!')).toBe('catalogue');
  });

  it('avoids Windows reserved device names', () => {
    expect(sanitizeFilename('CON')).toBe('con_file');
    expect(sanitizeFilename('LPT1')).toBe('lpt1_file');
  });
});

describe('formatDateForFilename', () => {
  it('returns UTC YYYYMMDD_HHMMSS', () => {
    // 2024-06-15T08:05:03Z
    const date = new Date('2024-06-15T08:05:03Z');
    expect(formatDateForFilename(date)).toBe('20240615_080503');
  });

  it('uses UTC (not local) time to avoid timezone drift', () => {
    // A moment that is 2024-01-01T00:00:00Z; should NOT be affected by local TZ
    const date = new Date('2024-01-01T00:00:00Z');
    expect(formatDateForFilename(date)).toBe('20240101_000000');
  });

  it('pads single-digit month and day with zeros', () => {
    const date = new Date('2024-03-05T09:07:02Z');
    expect(formatDateForFilename(date)).toBe('20240305_090702');
  });
});

describe('generateExportFilename', () => {
  it('produces sanitized name + timestamp + extension', () => {
    const date = new Date('2024-10-29T14:30:22Z');
    const result = generateExportFilename('GeoNet 2024', 'csv', { customDate: date });
    expect(result).toBe('geonet_2024_20241029_143022.csv');
  });

  it('adds prefix before catalogue name', () => {
    const date = new Date('2024-10-29T14:30:22Z');
    const result = generateExportFilename('Merged Catalogue', 'xml', {
      prefix: 'quakeml',
      customDate: date,
    });
    expect(result).toBe('quakeml_merged_catalogue_20241029_143022.xml');
  });

  it('omits timestamp when includeTimestamp=false', () => {
    const result = generateExportFilename('My Cat', 'json', { includeTimestamp: false });
    expect(result).toBe('my_cat.json');
  });

  it('handles extension with leading dot', () => {
    const date = new Date('2024-10-29T14:30:22Z');
    const result = generateExportFilename('Test', '.csv', { customDate: date });
    expect(result).toBe('test_20241029_143022.csv');
  });
});

describe('getExportMimeType', () => {
  it.each([
    ['csv', 'text/csv'],
    ['xml', 'application/xml'],
    ['json', 'application/json'],
    ['geojson', 'application/geo+json'],
    ['kml', 'application/vnd.google-earth.kml+xml'],
    ['txt', 'text/plain'],
  ])('maps %s to %s', (format, expected) => {
    expect(getExportMimeType(format)).toBe(expected);
  });

  it('strips leading dot before lookup', () => {
    expect(getExportMimeType('.csv')).toBe('text/csv');
  });

  it('falls back to application/octet-stream for unknown formats', () => {
    expect(getExportMimeType('abc123')).toBe('application/octet-stream');
  });
});

describe('generateContentDisposition', () => {
  it('produces an attachment header', () => {
    const result = generateContentDisposition('my_file.csv');
    expect(result).toContain('attachment');
    expect(result).toContain('my_file.csv');
  });

  it('includes UTF-8 encoded filename*', () => {
    const result = generateContentDisposition('café.csv');
    expect(result).toContain("filename*=UTF-8''");
  });

  it('removes header-breaking characters from filename', () => {
    const result = generateContentDisposition('bad"name\r\n.csv');
    expect(result).toContain('bad_name__.csv');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
  });
});

describe('createDownloadHeaders', () => {
  it('includes correct Content-Type for csv', () => {
    const headers = createDownloadHeaders('test.csv', 'csv') as Record<string, string>;
    expect(headers['Content-Type']).toBe('text/csv');
  });

  it('sets no-cache headers', () => {
    const headers = createDownloadHeaders('test.csv', 'csv') as Record<string, string>;
    expect(headers['Cache-Control']).toContain('no-cache');
  });

  it('sets Content-Disposition with filename', () => {
    const headers = createDownloadHeaders('events_20241029.csv', 'csv') as Record<string, string>;
    expect(headers['Content-Disposition']).toContain('events_20241029.csv');
  });
});

describe('csvField', () => {
  it('passes through plain strings unchanged', () => {
    expect(csvField('hello')).toBe('hello');
  });

  it('passes through numbers as strings', () => {
    expect(csvField(42)).toBe('42');
    expect(csvField(0)).toBe('0');
  });

  it('returns empty string for null', () => {
    expect(csvField(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(csvField(undefined)).toBe('');
  });

  it('quotes strings containing commas', () => {
    expect(csvField('Wellington, New Zealand')).toBe('"Wellington, New Zealand"');
  });

  it('quotes strings containing double-quotes and escapes them', () => {
    expect(csvField('say "hello"')).toBe('"say ""hello"""');
  });

  it('quotes strings containing newlines', () => {
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes strings containing carriage returns', () => {
    expect(csvField('a\rb')).toBe('"a\rb"');
  });
});
