import { ValidationError } from './errors';

/** Opaque tuple: timestamps and public event IDs can both contain colons. */
export function encodeEventCursor(time: string, id: string): string {
  return Buffer.from(JSON.stringify([time, id]), 'utf8').toString('base64url');
}

export function decodeEventCursor(cursor: string): [string, string] {
  let tuple: unknown;
  try {
    tuple = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    // Accept links issued by the earlier API without splitting inside an ISO time.
    const legacy = cursor.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})):(.+)$/);
    if (legacy) tuple = [legacy[1], legacy[2]];
  }
  if (!Array.isArray(tuple) || tuple.length !== 2 ||
      typeof tuple[0] !== 'string' || !Number.isFinite(Date.parse(tuple[0])) ||
      typeof tuple[1] !== 'string' || !tuple[1]) {
    throw new ValidationError('Invalid event cursor');
  }
  return [tuple[0], tuple[1]];
}
