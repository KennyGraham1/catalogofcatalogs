/**
 * Utilities for generating export filenames and handling exports
 */

/**
 * Sanitize a string for use in filenames
 * Removes special characters and replaces spaces with underscores
 */
export function sanitizeFilename(name: string): string {
  const reservedWindowsNames = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
  ]);

  const sanitized = name
    .replace(/[^a-z0-9\s_-]/gi, '') // Remove special characters
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, '') // Remove leading/trailing underscores
    .toLowerCase();

  const safeName = sanitized || 'catalogue';
  const nonReservedName = reservedWindowsNames.has(safeName) ? `${safeName}_file` : safeName;
  return nonReservedName.slice(0, 120);
}

/**
 * Format a date for use in filenames
 * Returns format: YYYYMMDD_HHMMSS (always UTC to ensure consistency across server timezones)
 */
export function formatDateForFilename(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

function sanitizeExtension(format: string): string {
  return format
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase() || 'txt';
}

/**
 * Escape a value for inclusion in a CSV field.
 * Wraps the value in double-quotes if it contains a comma, double-quote, or newline.
 * Internal double-quotes are escaped by doubling them (RFC 4180).
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate a descriptive export filename
 * 
 * @param catalogueName - Name of the catalogue being exported
 * @param format - Export format (csv, xml, json, geojson, etc.)
 * @param options - Optional parameters
 * @returns Formatted filename with timestamp
 * 
 * @example
 * generateExportFilename('GeoNet 2024', 'csv')
 * // Returns: 'geonet_2024_20241029_143022.csv'
 * 
 * generateExportFilename('Merged Catalogue', 'xml', { prefix: 'quakeml' })
 * // Returns: 'quakeml_merged_catalogue_20241029_143022.xml'
 */
export function generateExportFilename(
  catalogueName: string,
  format: string,
  options: {
    prefix?: string;
    suffix?: string;
    includeTimestamp?: boolean;
    customDate?: Date;
  } = {}
): string {
  const {
    prefix,
    suffix,
    includeTimestamp = true,
    customDate
  } = options;

  const parts: string[] = [];

  // Add prefix if provided
  if (prefix) {
    parts.push(sanitizeFilename(prefix));
  }

  // Add catalogue name
  parts.push(sanitizeFilename(catalogueName));

  // Add timestamp if requested
  if (includeTimestamp) {
    parts.push(formatDateForFilename(customDate));
  }

  // Add suffix if provided
  if (suffix) {
    parts.push(sanitizeFilename(suffix));
  }

  // Join parts and add extension
  const filename = parts.filter(Boolean).join('_').slice(0, 180);
  const safeFormat = sanitizeExtension(format);
  const extension = `.${safeFormat}`;
  
  return `${filename}${extension}`;
}

/**
 * Generate a filename for merged catalogue exports
 */
export function generateMergedCatalogueFilename(
  format: string,
  eventCount?: number
): string {
  const parts = ['merged_catalogue'];
  
  if (eventCount !== undefined) {
    parts.push(`${eventCount}_events`);
  }
  
  parts.push(formatDateForFilename());
  
  const safeFormat = sanitizeExtension(format);
  const extension = `.${safeFormat}`;
  return `${parts.join('_')}${extension}`;
}

/**
 * Generate Content-Disposition header value for file downloads
 */
export function generateContentDisposition(filename: string): string {
  // Encode filename for Content-Disposition header
  // Use both filename and filename* for better browser compatibility
  const safeFilename = filename.replace(/[\r\n"]/g, '_');
  const encodedFilename = encodeURIComponent(safeFilename);
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`;
}

/**
 * Get MIME type for export format
 */
export function getExportMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    'csv': 'text/csv',
    'xml': 'application/xml',
    'json': 'application/json',
    'geojson': 'application/geo+json',
    'kml': 'application/vnd.google-earth.kml+xml',
    'txt': 'text/plain'
  };

  const normalizedFormat = format.toLowerCase().replace('.', '');
  return mimeTypes[normalizedFormat] || 'application/octet-stream';
}

/**
 * Create a download response with proper headers
 */
export function createDownloadHeaders(filename: string, format: string): HeadersInit {
  return {
    'Content-Type': getExportMimeType(format),
    'Content-Disposition': generateContentDisposition(filename),
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}
