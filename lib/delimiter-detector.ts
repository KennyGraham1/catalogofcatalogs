import { stripSpreadsheetFormulaGuard } from './export-utils';

/**
 * Delimiter detection and parsing utilities for text files
 * Supports: comma, tab, semicolon, pipe, and space delimiters
 */

export type Delimiter = ',' | '\t' | ';' | '|' | ' ';

export interface DelimiterDetectionResult {
  delimiter: Delimiter;
  confidence: number; // 0-1, higher is more confident
  columnCount: number;
  sampleRows: number;
}

/**
 * Detect the delimiter used in a text file
 * Analyzes the first few rows to determine the most likely delimiter
 */
export function detectDelimiter(content: string, maxSampleRows: number = 10): DelimiterDetectionResult {
  const lines = content.split('\n').filter(line => line.trim()).slice(0, maxSampleRows);
  
  if (lines.length === 0) {
    return {
      delimiter: ',',
      confidence: 0,
      columnCount: 0,
      sampleRows: 0
    };
  }

  const delimiters: Delimiter[] = [',', '\t', ';', '|', ' '];
  const scores: Map<Delimiter, { count: number; consistency: number; avgColumns: number }> = new Map();

  // Analyze each delimiter
  for (const delimiter of delimiters) {
    const columnCounts: number[] = [];
    let totalColumns = 0;

    for (const line of lines) {
      // Non-strict: a sample line may end inside a quoted field simply because the
      // candidate delimiter is the wrong one, or because the quoted field spans
      // several lines. Scoring must never throw.
      const columns = tokenizeDelimited(line, delimiter, { strictQuotes: false })[0] ?? [];
      const count = columns.length;
      columnCounts.push(count);
      totalColumns += count;
    }

    // Calculate consistency (how similar are the column counts across rows)
    const avgColumns = totalColumns / lines.length;
    const variance = columnCounts.reduce((sum, count) => sum + Math.pow(count - avgColumns, 2), 0) / lines.length;
    const stdDev = Math.sqrt(variance);
    const consistency = avgColumns > 1 ? 1 - (stdDev / avgColumns) : 0;

    scores.set(delimiter, {
      count: totalColumns,
      consistency: Math.max(0, consistency),
      avgColumns
    });
  }

  // Find the best delimiter
  let bestDelimiter: Delimiter = ',';
  let bestScore = 0;
  let bestColumnCount = 0;

  // Convert Map entries to array to avoid iterator issues with ES5 target
  const scoresArray = Array.from(scores.entries());
  for (let i = 0; i < scoresArray.length; i++) {
    const [delimiter, stats] = scoresArray[i];
    // Score = consistency * column_count_factor
    // Prefer delimiters that produce consistent column counts and more than 1 column
    const columnFactor = stats.avgColumns > 1 ? Math.min(stats.avgColumns / 10, 1) : 0;
    const score = stats.consistency * (0.7 + columnFactor * 0.3);

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
      bestColumnCount = Math.round(stats.avgColumns);
    }
  }

  return {
    delimiter: bestDelimiter,
    confidence: bestScore,
    columnCount: bestColumnCount,
    sampleRows: lines.length
  };
}

export interface TokenizeOptions {
  /**
   * Reject content whose final quoted field is never closed (RFC 4180 §2.5).
   * Default true. An unterminated quote consumes every subsequent delimiter and
   * newline, collapsing the whole remainder of the file into one field of one row
   * — and because that row still has the expected number of fields, no column-count
   * check downstream can notice. Failing loudly is the only way to avoid silently
   * discarding the rest of the catalogue.
   */
  strictQuotes?: boolean;
}

/**
 * RFC 4180-compliant tokenizer over the WHOLE content: handles quoted fields,
 * escaped quotes ("" -> "), embedded delimiters/newlines inside quotes, and CRLF/LF.
 * Quoted whitespace is preserved; unquoted tokens are trimmed (which also strips a
 * leading BOM and stray CR). For the space delimiter, runs of spaces collapse.
 */
export function tokenizeDelimited(
  content: string,
  delimiter: Delimiter,
  options: TokenizeOptions = {}
): string[][] {
  const strictQuotes = options.strictQuotes !== false;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;
  let fieldIsBlank = true;  // field so far is empty or spaces/tabs only (tracked in O(1))
  let quoteOpenRecord = 0;  // 1-based record number where the open quote was seen

  const pushField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
    fieldIsBlank = true;
  };
  const pushRow = () => {
    pushField();
    rows.push(delimiter === ' ' ? row.filter((v) => v.length > 0) : row);
    row = [];
  };

  const len = content.length;
  let i = 0;
  while (i < len) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 2; continue; } // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    // RFC 4180 §2.5: only a quote that opens the field starts a quoted section.
    if (ch === '"' && !fieldWasQuoted && fieldIsBlank) {
      field = ''; // discard any whitespace that preceded the opening quote
      inQuotes = true; fieldWasQuoted = true; quoteOpenRecord = rows.length + 1; i++; continue;
    }
    if (ch === delimiter) { pushField(); i++; continue; }
    if (ch === '\r') { pushRow(); i += content[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { pushRow(); i++; continue; }
    if (fieldIsBlank && ch !== ' ' && ch !== '\t') fieldIsBlank = false;
    field += ch; i++;
  }
  if (inQuotes && strictQuotes) {
    throw new Error(
      `Unterminated quoted field: a double quote opened on record ${quoteOpenRecord} is never closed. ` +
      'Quote the field correctly (doubling any literal " inside it) or remove the stray quote.'
    );
  }
  // flush any trailing field/row (content not ending in a newline)
  if (field.length > 0 || row.length > 0 || fieldWasQuoted) pushRow();
  // drop blank lines (a single empty field), but keep deliberately-empty multi-field rows
  return rows.filter((r) => !(r.length <= 1 && (r[0] ?? '') === ''));
}

/**
 * Strip a leading comment marker from a header cell.
 *
 * The FDSN Web Service Specification v1.2 defines the `format=text` event response as
 * a pipe-delimited table whose header line is prefixed with '#'
 * (`#EventID|Time|Latitude|Longitude|Depth/km|...`); some bulletin exports use '%' the
 * same way. Without this the first column name is the literal `#eventid`, which matches
 * no alias, so every event silently loses its identifier.
 */
export function stripHeaderCommentMarker(header: string): string {
  return header.replace(/^\s*[#%]\s*/, '');
}

/**
 * Parse a single line with the specified delimiter (RFC 4180-aware).
 */
export function parseLine(line: string, delimiter: Delimiter, options?: TokenizeOptions): string[] {
  return tokenizeDelimited(line, delimiter, options)[0] ?? [];
}

/**
 * Parse entire content with the specified delimiter (RFC 4180-aware).
 */
export function parseWithDelimiter(content: string, delimiter: Delimiter): {
  headers: string[];
  rows: string[][];
} {
  const all = tokenizeDelimited(content, delimiter);
  if (all.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = all[0].map((h, i) => (i === 0 ? stripHeaderCommentMarker(h) : h).trim().toLowerCase());
  // Undo our own CSV export's formula guard so exports re-import unchanged. Headers are
  // matched against known column names and are never guarded.
  return { headers, rows: all.slice(1).map((row) => row.map(stripSpreadsheetFormulaGuard)) };
}

/**
 * Get a human-readable name for a delimiter
 */
export function getDelimiterName(delimiter: Delimiter): string {
  switch (delimiter) {
    case ',': return 'Comma';
    case '\t': return 'Tab';
    case ';': return 'Semicolon';
    case '|': return 'Pipe';
    case ' ': return 'Space';
    default: return 'Unknown';
  }
}

