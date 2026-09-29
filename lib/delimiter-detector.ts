import { stripSpreadsheetFormulaGuard } from './export-utils';
import { resolveHeaderAlias } from './field-definitions';

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
  // Sample by RECORD, not by physical line: a quoted field may span several lines
  // (RFC 4180 2.6), and splitting on newline first made such rows look like
  // inconsistent column counts, so the wrong delimiter won and the file parsed to
  // zero events. The sample is bounded to the first physical lines so the
  // per-delimiter tokenization stays cheap on large files. A leading block of '#'
  // comment lines is prose, not table: sampled, it made the space delimiter win.
  const sampleText = splitLeadingCommentLines(content).body
    .split('\n').slice(0, Math.max(maxSampleRows * 20, 200)).join('\n');
  const lines = sampleText.split('\n').filter(line => line.trim()).slice(0, maxSampleRows);

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

    // Non-strict: the sample may end inside a quoted field simply because the
    // candidate delimiter is the wrong one. Scoring must never throw.
    const records = tokenizeDelimited(sampleText, delimiter, { strictQuotes: false })
      .filter(r => r.length > 1 || (r[0] ?? '').trim() !== '')
      .slice(0, maxSampleRows);
    for (const columns of records) {
      const count = columns.length;
      columnCounts.push(count);
      totalColumns += count;
    }
    const sampled = Math.max(records.length, 1);

    // Calculate consistency (how similar are the column counts across rows)
    const avgColumns = totalColumns / sampled;
    const variance = columnCounts.reduce((sum, count) => sum + Math.pow(count - avgColumns, 2), 0) / sampled;
    const stdDev = Math.sqrt(variance);
    // Splitting on spaces around a real separator ('  41.802 ,   23.108 ,', the padded
    // ISC-GEM layout) leaves the separator as a token of its own; that file is not
    // space-delimited, however consistent (and numerous) its space-split columns are.
    const splitsAroundSeparator = delimiter === ' ' &&
      records.some((columns) => columns.some((cell) => cell === ',' || cell === ';' || cell === '|'));
    const consistency = avgColumns > 1 && !splitsAroundSeparator ? 1 - (stdDev / avgColumns) : 0;

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
 * Whether `content` ends inside an open quoted field under the same rules as
 * tokenizeDelimited (a quote opens a field only at the field's start; "" escapes a
 * quote inside one). A streaming reader uses this to decide whether the next line
 * continues the current record.
 */
export function endsInsideQuotedField(content: string, delimiter: Delimiter): boolean {
  let inQuotes = false;
  let fieldWasQuoted = false;
  let fieldIsBlank = true;
  const len = content.length;
  for (let i = 0; i < len; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { i++; continue; }
        inQuotes = false;
      }
      continue;
    }
    if (ch === '"' && !fieldWasQuoted && fieldIsBlank) { inQuotes = true; fieldWasQuoted = true; continue; }
    if (ch === delimiter || ch === '\n' || ch === '\r') { fieldWasQuoted = false; fieldIsBlank = true; continue; }
    if (fieldIsBlank && ch !== ' ' && ch !== '\t') fieldIsBlank = false;
  }
  return inQuotes;
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
 * A comment line: its first non-blank character is '#' or '%'. FDSN event text, ISC
 * bulletins and this platform's CSV export with metadata=comments open with them.
 */
export function isCommentLine(line: string): boolean {
  // \s also matches a leading byte-order mark (U+FEFF).
  return /^\s*[#%]/.test(line);
}

const NUMERIC_CELL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Whether a record reads as a column header rather than data: more than one populated
 * cell and no cell that is a number. A catalogue data row always has numeric cells
 * (coordinates, magnitude); a header has none.
 */
export function isHeaderLikeRecord(cells: string[]): boolean {
  const populated = cells.map((cell) => cell.trim()).filter((cell) => cell !== '');
  return populated.length > 1 && !populated.some((cell) => NUMERIC_CELL.test(cell));
}

/**
 * Split the leading block of comment (and blank) lines from the rest of the content.
 * `linesSkipped` counts the physical lines removed, for line numbers.
 */
export function splitLeadingCommentLines(content: string): { comments: string[]; body: string; linesSkipped: number } {
  const comments: string[] = [];
  const line = /([^\r\n]*)(\r\n|\n|\r|$)/y;
  let offset = 0;
  let linesSkipped = 0;
  while (offset < content.length) {
    line.lastIndex = offset;
    const match = line.exec(content);
    if (!match || match[0].length === 0) break;
    const text = match[1];
    if (text.trim() !== '' && !isCommentLine(text)) break;
    if (text.trim() !== '') comments.push(text);
    offset += match[0].length;
    linesSkipped += 1;
  }
  return { comments, body: content.slice(offset), linesSkipped };
}

/**
 * The leading comment line that names the columns: the last one at least two of whose
 * cells are known field names (FDSN '#EventID|Time|...', an ISC-GEM '#  date , lat , ...'
 * line), so a units line after it ('#UTC,deg,deg,km,ML') or a prose line is never taken
 * for the header. Failing that, the last header-like comment line as wide as the data
 * (a file whose own column names the alias table does not know). Null when neither.
 */
export function chooseCommentHeader(comments: string[], delimiter: Delimiter, dataWidth?: number): string[] | null {
  const candidates = comments
    .map((line) => parseLine(stripHeaderCommentMarker(line), delimiter, { strictQuotes: false }))
    .filter(isHeaderLikeRecord);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const known = new Set<string>();
    for (const cell of candidates[i]) {
      const target = resolveHeaderAlias(cell.trim());
      if (target) known.add(target);
    }
    if (known.size >= 2) return candidates[i];
  }
  const last = candidates[candidates.length - 1];
  return last && dataWidth !== undefined && last.length === dataWidth ? last : null;
}

/**
 * Column names made unique: a repeated name gets a numeric suffix ('mm', 'mm_2'), so a
 * row keeps every column. A repeated name used to collapse into one key whose last cell
 * won: in 'yyyy mm dd hh mm ss' the minutes overwrote the month.
 */
export function uniqueHeaderNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let n = 2; seen.has(candidate); n++) candidate = `${name}_${n}`;
    seen.add(candidate);
    return candidate;
  });
}

/** Header cells as written (comment marker stripped, trimmed) and as matched (lower case), both unique. */
function headerNames(cells: string[]): { headers: string[]; writtenHeaders: string[] } {
  const written = cells.map((h, i) => (i === 0 ? stripHeaderCommentMarker(h) : h).trim());
  const headers = uniqueHeaderNames(written.map((h) => h.toLowerCase()));
  // A suffix added to the lower-case name is added to the written one as well.
  const writtenHeaders = written.map((h, i) => h + headers[i].slice(h.length));
  return { headers, writtenHeaders };
}

/**
 * Parse entire content with the specified delimiter (RFC 4180-aware).
 *
 * A leading block of comment lines is skipped. When the first line after the block is
 * data, the block's column-naming line is the header (see chooseCommentHeader): the FDSN
 * event-text layout ('# Query complete' then '#EventID|Time|...') and the ISC-GEM one;
 * otherwise the first line after the block is the header. The first record used to be
 * the header unconditionally, so a file opening with '# Catalogue: ...' (this platform's
 * own CSV export with metadata=comments included) imported zero events.
 * `headers` are lower case and unique; `writtenHeaders` are the same names as written
 * (for anything read from the case, such as the magnitude scale 'mB'); `dataStartLine` is
 * the 1-based line of the first data row.
 */
export function parseWithDelimiter(content: string, delimiter: Delimiter): {
  headers: string[];
  writtenHeaders: string[];
  rows: string[][];
  dataStartLine: number;
} {
  const { comments, body, linesSkipped } = splitLeadingCommentLines(content);
  const all = tokenizeDelimited(body, delimiter);
  // Undo our own CSV export's formula guard so exports re-import unchanged. Headers are
  // matched against known column names and are never guarded.
  const unguard = (rows: string[][]) => rows.map((row) => row.map(stripSpreadsheetFormulaGuard));

  if (comments.length > 0) {
    const first = all[0];
    const commentHeader = !first || !isHeaderLikeRecord(first)
      ? chooseCommentHeader(comments, delimiter, first?.length)
      : null;
    if (commentHeader) {
      return { ...headerNames(commentHeader), rows: unguard(all), dataStartLine: linesSkipped + 1 };
    }
  }

  if (all.length === 0) {
    return { headers: [], writtenHeaders: [], rows: [], dataStartLine: linesSkipped + 2 };
  }
  return { ...headerNames(all[0]), rows: unguard(all.slice(1)), dataStartLine: linesSkipped + 2 };
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

