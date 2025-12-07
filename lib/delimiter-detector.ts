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
 * Parse a single line with the specified delimiter, handling quoted values
 */
export function parseLine(line: string, delimiter: Delimiter): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  
  // For space delimiter, filter out empty values (multiple consecutive spaces)
  if (delimiter === ' ') {
    return values.filter(v => v.length > 0);
  }
  
  return values;
}

/**
 * Parse entire content with the specified delimiter
 */
export function parseWithDelimiter(content: string, delimiter: Delimiter): {
  headers: string[];
  rows: string[][];
} {
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseLine(lines[0], delimiter).map(h => h.trim().toLowerCase());
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delimiter);
    rows.push(values);
  }

  return { headers, rows };
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

