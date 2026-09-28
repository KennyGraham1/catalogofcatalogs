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

// Leading characters that make Excel / LibreOffice / Google Sheets evaluate a cell as a
// formula rather than text (OWASP "CSV Injection" / formula injection).
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// A bare numeric literal is data, not a formula: "-41.2865", "+3", "1e-3" must stay
// numeric so the file still round-trips through a numeric parser.
const NUMERIC_LITERAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Prefix a formula-triggering value with an apostrophe so spreadsheets treat it as text.
 * Numeric literals are exempt (see NUMERIC_LITERAL).
 */
function neutralizeSpreadsheetFormula(str: string): string {
  // A value that already reads as a guarded formula ("'=literal") gets a second
  // apostrophe, so the reader's single strip returns the original text.
  const core = str.replace(/^'+/, '');
  if (str.charAt(0) === "'" && FORMULA_TRIGGER.test(core) && !NUMERIC_LITERAL.test(core)) {
    return `'${str}`;
  }
  if (!FORMULA_TRIGGER.test(str) || NUMERIC_LITERAL.test(str)) return str;
  return `'${str}`;
}

/**
 * Undo neutralizeSpreadsheetFormula(): strip the apostrophe this module adds.
 */
export function stripSpreadsheetFormulaGuard(value: string): string {
  if (value.charAt(0) !== "'") return value;
  const rest = value.slice(1);
  // Strip exactly one guard apostrophe when what follows is a formula trigger,
  // possibly itself apostrophe-guarded ("''=literal" was written for "'=literal").
  const core = rest.replace(/^'+/, '');
  return FORMULA_TRIGGER.test(core) && !NUMERIC_LITERAL.test(core) ? rest : value;
}

export interface CsvFieldOptions {
  /**
   * Neutralise text a spreadsheet would execute as a formula (default true).
   *
   * Leave it on for anything a person downloads and opens in Excel. Turn it off for
   * machine-readable output that must round-trip byte-for-byte: the apostrophe becomes
   * part of the value once written, so "-- unknown --" comes back as "'-- unknown --"
   * unless the reader strips it with stripSpreadsheetFormulaGuard().
   */
  neutralizeFormulas?: boolean;
}

/**
 * Escape a value for inclusion in a CSV field.
 * Wraps the value in double-quotes if it contains a comma, double-quote, or newline.
 * Internal double-quotes are escaped by doubling them (RFC 4180).
 */
export function csvField(
  value: string | number | null | undefined,
  options?: CsvFieldOptions
): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const str = options?.neutralizeFormulas === false ? raw : neutralizeSpreadsheetFormula(raw);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Escape and join one CSV record (RFC 4180 §2). Values are escaped with csvField().
 *
 * The values are mapped through an arrow rather than passed to `map(csvField)` directly:
 * Array#map supplies (value, index, array), which would land the index in csvField's
 * options parameter.
 */
export function csvRow(
  values: Array<string | number | null | undefined>,
  options?: CsvFieldOptions
): string {
  return values.map(value => csvField(value, options)).join(',');
}

// XML 1.0 §2.2 Char admits #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF].
// The C0 controls below, U+FFFE and U+FFFF are not well-formed even when escaped as character
// references or wrapped in CDATA, and one of them (a vertical tab pasted from a word processor
// into a region name) made a whole multi-event QuakeML or KML document unreadable.
const XML_ILLEGAL_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
// A surrogate pair, or a lone surrogate (which no encoder can write as a character).
const SURROGATE_OR_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

/**
 * Make text safe to place in an XML document: drop the control characters XML 1.0 forbids and
 * replace a lone surrogate with U+FFFD (what TextEncoder would write for it anyway). Escaping
 * of markup characters is the caller's job.
 */
export function stripXmlIllegalChars(text: string): string {
  return text
    .replace(XML_ILLEGAL_CONTROL_CHARS, '')
    .replace(SURROGATE_OR_PAIR, pair => (pair.length === 2 ? pair : '�'));
}

// ---------------------------------------------------------------------------
// SHA-256 (FIPS 180-4)
//
// Every export records a SHA-256 checksum of its event rows. The exporters also run in the
// browser (components/merge/MergeActions.tsx builds unsaved merge results client-side), where
// node:crypto does not exist and Web Crypto's digest() is asynchronous and whole-buffer only,
// so the hash is implemented here: synchronous, incremental (a national catalogue is hashed
// chunk by chunk and never held as one string), and identical on server and client.
// ---------------------------------------------------------------------------

// Int32Array, not Uint32Array: a Uint32Array element above 2^31 is read back as a heap double,
// which keeps V8 off its int32 fast path in the round loop (measured ~5x slower).
const SHA256_ROUND_CONSTANTS = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * Incremental SHA-256 over the UTF-8 encoding of the strings passed to update(). A lone
 * surrogate is encoded as U+FFFD, exactly as TextEncoder (and so the export route's byte
 * stream) encodes it, so the digest is the digest of the bytes actually served.
 */
export class Sha256 {
  private readonly state = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly block = new Uint8Array(64);
  private readonly schedule = new Int32Array(64);
  // UTF-8 staging buffer, reused across update() calls (3 bytes per UTF-16 unit at most).
  private scratch = new Uint8Array(0);
  private blockLength = 0;
  private byteCount = 0;
  private finished = false;

  update(text: string): this {
    if (this.finished) throw new Error('Sha256: update() after digestHex()');
    if (this.scratch.length < text.length * 3) this.scratch = new Uint8Array(Math.max(text.length * 3, 1024));
    const bytes = this.scratch;
    let n = 0;
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code < 0x80) {
        bytes[n++] = code;
      } else if (code < 0x800) {
        bytes[n++] = 0xc0 | (code >> 6);
        bytes[n++] = 0x80 | (code & 0x3f);
      } else {
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
          const low = text.charCodeAt(i + 1);
          if (low >= 0xdc00 && low <= 0xdfff) {
            const point = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
            i++;
            bytes[n++] = 0xf0 | (point >> 18);
            bytes[n++] = 0x80 | ((point >> 12) & 0x3f);
            bytes[n++] = 0x80 | ((point >> 6) & 0x3f);
            bytes[n++] = 0x80 | (point & 0x3f);
            continue;
          }
        }
        if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
        bytes[n++] = 0xe0 | (code >> 12);
        bytes[n++] = 0x80 | ((code >> 6) & 0x3f);
        bytes[n++] = 0x80 | (code & 0x3f);
      }
    }
    this.consume(bytes, n);
    return this;
  }

  /** Finish the hash and return it as 64 lowercase hex digits. */
  digestHex(): string {
    if (!this.finished) {
      const bytes = this.byteCount;
      // Padding: 0x80, zeros to 56 mod 64, then the message length in bits as a 64-bit
      // big-endian integer (bytes * 8 exceeds 2^32 at 512 MiB, so it is split by hand).
      const padLength = this.blockLength < 56 ? 56 - this.blockLength : 120 - this.blockLength;
      const tail = new Uint8Array(padLength + 8);
      tail[0] = 0x80;
      const high = Math.floor(bytes / 0x20000000);
      const low = (bytes % 0x20000000) * 8;
      tail[padLength] = (high >>> 24) & 0xff;
      tail[padLength + 1] = (high >>> 16) & 0xff;
      tail[padLength + 2] = (high >>> 8) & 0xff;
      tail[padLength + 3] = high & 0xff;
      tail[padLength + 4] = (low >>> 24) & 0xff;
      tail[padLength + 5] = (low >>> 16) & 0xff;
      tail[padLength + 6] = (low >>> 8) & 0xff;
      tail[padLength + 7] = low & 0xff;
      this.consume(tail, tail.length);
      this.finished = true;
    }
    let hex = '';
    for (let i = 0; i < 8; i++) hex += ((this.state[i] >>> 0) + 0x100000000).toString(16).slice(1);
    return hex;
  }

  /** Feed `length` bytes: top up a partial block, then compress whole blocks in place. */
  private consume(bytes: Uint8Array, length: number): void {
    this.byteCount += length;
    let offset = 0;
    if (this.blockLength > 0) {
      while (this.blockLength < 64 && offset < length) this.block[this.blockLength++] = bytes[offset++];
      if (this.blockLength < 64) return;
      this.compress(this.block, 0);
      this.blockLength = 0;
    }
    while (length - offset >= 64) {
      this.compress(bytes, offset);
      offset += 64;
    }
    while (offset < length) this.block[this.blockLength++] = bytes[offset++];
  }

  private compress(b: Uint8Array, offset: number): void {
    const w = this.schedule;
    for (let t = 0; t < 16; t++) {
      const i = offset + 4 * t;
      w[t] = (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
    }
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15];
      const y = w[t - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    const s = this.state;
    let a = s[0], bb = s[1], c = s[2], d = s[3], e = s[4], f = s[5], g = s[6], h = s[7];
    for (let t = 0; t < 64; t++) {
      const bigSigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + bigSigma1 + choose + SHA256_ROUND_CONSTANTS[t] + w[t]) | 0;
      const bigSigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const majority = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (bigSigma0 + majority) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = bb;
      bb = a;
      a = (t1 + t2) | 0;
    }
    s[0] += a;
    s[1] += bb;
    s[2] += c;
    s[3] += d;
    s[4] += e;
    s[5] += f;
    s[6] += g;
    s[7] += h;
  }
}

/** SHA-256 of a string's UTF-8 encoding, as lowercase hex. */
export function sha256Hex(text: string): string {
  return new Sha256().update(text).digestHex();
}

// A timestamp already written as UTC ("…Z") is left byte-for-byte as stored.
const UTC_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/;
// Date or date-time with no zone designator: C11 defines these fields as UTC, but the JS Date
// parser reads an offset-less date-time as LOCAL time, which would shift it by the server's
// (or the browser's) zone offset.
const OFFSETLESS_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/;

/**
 * Render a stored timestamp (catalogue time-period bounds, C11) as an ISO 8601 UTC string.
 * Offset-less values are read as UTC; an explicit offset is converted. A value that is not a
 * timestamp at all is returned unchanged rather than dropped: it is user-entered metadata.
 */
export function toUtcIsoString(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = String(value).trim();
  if (raw === '') return undefined;
  if (UTC_ISO_TIMESTAMP.test(raw)) return raw;
  const offsetless = raw.match(OFFSETLESS_TIMESTAMP);
  const epoch = offsetless
    ? Date.parse(`${offsetless[1]}T${offsetless[2] ?? '00:00:00'}Z`)
    : Date.parse(raw);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : raw;
}

/** A catalogue version ("1.2.0") as a filename token: "v1.2.0". */
function sanitizeVersionToken(version: string): string {
  const token = version.trim().replace(/^v/i, '').replace(/[^0-9A-Za-z.-]/g, '').slice(0, 32);
  return token ? `v${token}` : '';
}

/**
 * Generate a descriptive export filename
 */
export function generateExportFilename(
  catalogueName: string,
  format: string,
  options: {
    prefix?: string;
    suffix?: string;
    includeTimestamp?: boolean;
    customDate?: Date;
    /**
     * Catalogue version (C3). Written into the name ("..._v1.2.0_...") so a downloaded file
     * still says which data state it holds after it has left the browser.
     */
    version?: string;
  } = {}
): string {
  const {
    prefix,
    suffix,
    includeTimestamp = true,
    customDate,
    version,
  } = options;

  const parts: string[] = [];

  // Add prefix if provided
  if (prefix) {
    parts.push(sanitizeFilename(prefix));
  }

  // Add catalogue name
  parts.push(sanitizeFilename(catalogueName));

  // Add the catalogue version when known
  if (version) {
    parts.push(sanitizeVersionToken(version));
  }

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
