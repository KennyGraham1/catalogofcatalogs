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
