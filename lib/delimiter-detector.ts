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
      const columns = parseLine(line, delimiter);
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

/**
 * RFC 4180-compliant tokenizer over the WHOLE content: handles quoted fields,
 * escaped quotes ("" -> "), embedded delimiters/newlines inside quotes, and CRLF/LF.
 * Quoted whitespace is preserved; unquoted tokens are trimmed (which also strips a
 * leading BOM and stray CR). For the space delimiter, runs of spaces collapse.
 */
export function tokenizeDelimited(content: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const pushField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
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
    if (ch === '"') { inQuotes = true; fieldWasQuoted = true; i++; continue; }
    if (ch === delimiter) { pushField(); i++; continue; }
    if (ch === '\r') { pushRow(); i += content[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { pushRow(); i++; continue; }
    field += ch; i++;
  }
  // flush any trailing field/row (content not ending in a newline)
  if (field.length > 0 || row.length > 0 || fieldWasQuoted) pushRow();
  // drop blank lines (a single empty field), but keep deliberately-empty multi-field rows
  return rows.filter((r) => !(r.length <= 1 && (r[0] ?? '') === ''));
}

/**
 * Parse a single line with the specified delimiter (RFC 4180-aware).
 */
export function parseLine(line: string, delimiter: Delimiter): string[] {
  return tokenizeDelimited(line, delimiter)[0] ?? [];
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
  const headers = all[0].map((h) => h.trim().toLowerCase());
  return { headers, rows: all.slice(1) };
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

