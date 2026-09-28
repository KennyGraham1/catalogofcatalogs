const DEFAULT_MAX_SYNC_PARSE_MB = 100;

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function getMaxSyncUploadParseBytes(): number {
  const mb = parsePositiveNumber(process.env.UPLOAD_MAX_SYNC_PARSE_MB) ?? DEFAULT_MAX_SYNC_PARSE_MB;
  return Math.floor(mb * 1024 * 1024);
}

export function createUploadTooLargeResponse(fileSize: number): {
  error: string;
  code: string;
  fileSize: number;
  limit: number;
  hint: string;
} {
  const limit = getMaxSyncUploadParseBytes();
  return {
    error: `File is too large to parse synchronously on this deployment. Maximum is ${Math.round(limit / 1024 / 1024)}MB.`,
    code: 'UPLOAD_PARSE_LIMIT_EXCEEDED',
    fileSize,
    limit,
    hint: 'On Vercel Pro you can raise UPLOAD_MAX_SYNC_PARSE_MB if the project has enough function duration and memory; otherwise split the catalogue or move parsing to a background job.',
  };
}

// ── Accepted upload file extensions ─────────────────────────────────────────
//
// Single source of truth for which file extensions the upload pipeline
// accepts, so the client picker and the server routes that gate on it agree.
// '.quakeml' is accepted alongside the existing '.qml'/'.xml' QuakeML
// extensions: it must both be let through the extension check and be
// recognised as QuakeML by isQuakeMLExtension below, or a file with that
// extension would be accepted here and then parsed as plain CSV/text.

export const ALLOWED_UPLOAD_EXTENSIONS = ['csv', 'txt', 'dat', 'json', 'geojson', 'xml', 'qml', 'quakeml'] as const;

export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

const QUAKEML_EXTENSIONS: ReadonlySet<string> = new Set<AllowedUploadExtension>(['xml', 'qml', 'quakeml']);

export function getUploadFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function isAllowedUploadExtension(fileName: string): boolean {
  return (ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(getUploadFileExtension(fileName));
}

/**
 * True for any extension the platform parses as QuakeML XML. These files are
 * streamed rather than parsed synchronously, so callers use this to exempt
 * them from the getMaxSyncUploadParseBytes() cap (init and finalize both
 * check this before deciding whether a file is too large to parse inline).
 */
export function isQuakeMLExtension(fileName: string): boolean {
  return QUAKEML_EXTENSIONS.has(getUploadFileExtension(fileName));
}
