/**
 * Regression tests for the `csv2` cluster: one CSV escaper, null cells, and a lossless
 * export/re-import round trip.
 *
 * Expected values are derived from RFC 4180 §2 (quoting rules, no comment convention) and
 * from the OWASP CSV-injection guidance the guard implements — not from what the code
 * currently prints.
 */

import {
  csvField,
  csvRow,
  stripSpreadsheetFormulaGuard,
} from '@/lib/export-utils';
import { eventsToCSV } from '@/lib/exporters';
import { parseCSV } from '@/lib/parsers';
import { exportDataAsCSV } from '@/lib/chart-config';
import type { MergedEvent } from '@/lib/db';

// The four values the platform must be able to carry through its own export/import cycle:
// two legitimate strings that merely start with a formula trigger, and two that really do
// look like formulas to a spreadsheet.
const ROUND_TRIP_VALUES = ['-- unknown --', '-Wellington', '=SUM(A1)', '+64 4 555 1234'];

const event = (over: Partial<MergedEvent> = {}): MergedEvent => ({
  id: 'evt-1',
  catalogue_id: 'cat-1',
  time: '2024-01-15T10:00:00Z',
  latitude: -41.2865,
  longitude: 174.7762,
  depth: 12.5,
  magnitude: 4.2,
  created_at: '2024-01-01T00:00:00Z',
  ...over,
} as MergedEvent);

// ─────────────────────────────────────────────────────────────────────────────
// 1. exportDataAsCSV: a null cell is an empty field, not the text "null"
// ─────────────────────────────────────────────────────────────────────────────

/** Capture the text of every Blob constructed while `fn` runs, with downloads stubbed out. */
function captureDownloadedText(fn: () => void): string[] {
  const texts: string[] = [];
  const RealBlob = global.Blob;
  class RecordingBlob {
    constructor(parts: string[]) {
      texts.push(parts.join(''));
    }
  }
  (global as unknown as { Blob: unknown }).Blob = RecordingBlob;

  const url = global.URL as unknown as {
    createObjectURL?: unknown;
    revokeObjectURL?: unknown;
  };
  const realCreate = url.createObjectURL;
  const realRevoke = url.revokeObjectURL;
  url.createObjectURL = jest.fn(() => 'blob:test');
  url.revokeObjectURL = jest.fn();

  try {
    fn();
  } finally {
    (global as unknown as { Blob: unknown }).Blob = RealBlob;
    url.createObjectURL = realCreate;
    url.revokeObjectURL = realRevoke;
  }
  return texts;
}

describe('exportDataAsCSV writes empty fields for missing values', () => {
  it('exports null as an empty field, not the 4-character string "null"', () => {
    const [csv] = captureDownloadedText(() =>
      exportDataAsCSV([{ bin: 'M 3-4', count: 12, rate: null }], 'chart')
    );

    // Header record, then one data record: RFC 4180 §2.
    expect(csv.split('\n')).toEqual(['bin,count,rate', 'M 3-4,12,']);
    expect(csv).not.toContain('null');
  });

  it('exports undefined as an empty field too', () => {
    const [csv] = captureDownloadedText(() =>
      exportDataAsCSV([{ bin: 'M 3-4', rate: undefined }], 'chart')
    );

    expect(csv.split('\n')).toEqual(['bin,rate', 'M 3-4,']);
  });

  it('still serialises nested values rather than emitting [object Object]', () => {
    const [csv] = captureDownloadedText(() =>
      exportDataAsCSV([{ bin: 'a', extra: { n: 1 } }], 'chart')
    );

    // The JSON contains a double quote, so RFC 4180 §2 requires the field to be quoted
    // with its internal quotes doubled.
    expect(csv.split('\n')[1]).toBe('a,"{""n"":1}"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. csvField is the single escaper — options, and the exact inverse of the guard
// ─────────────────────────────────────────────────────────────────────────────

describe('csvField formula guard is opt-out and exactly reversible', () => {
  it('guards formula-triggering text by default', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('-- unknown --')).toBe("'-- unknown --");
  });

  it('leaves the value byte-identical when neutralizeFormulas is false', () => {
    for (const value of ROUND_TRIP_VALUES) {
      expect(csvField(value, { neutralizeFormulas: false })).toBe(value);
    }
  });

  it('still applies RFC 4180 quoting when the guard is off', () => {
    expect(csvField('=A1,B1', { neutralizeFormulas: false })).toBe('"=A1,B1"');
    expect(csvField('a"b', { neutralizeFormulas: false })).toBe('"a""b"');
    expect(csvField('a\rb', { neutralizeFormulas: false })).toBe('"a\rb"');
  });

  it('passes the option through csvRow instead of leaking the map index', () => {
    // Array#map(csvField) would hand csvField the element index as its second argument;
    // csvRow must not do that, or fields after the first would silently change mode.
    expect(csvRow(['=A1', '=B1', '=C1'])).toBe("'=A1,'=B1,'=C1");
    expect(csvRow(['=A1', '=B1'], { neutralizeFormulas: false })).toBe('=A1,=B1');
  });

  it('stripSpreadsheetFormulaGuard undoes exactly what the guard added', () => {
    for (const value of ROUND_TRIP_VALUES) {
      expect(stripSpreadsheetFormulaGuard(csvField(value))).toBe(value);
    }
  });

  it('leaves an apostrophe the guard would not have written', () => {
    // "twas" is not formula-triggering, so the leading apostrophe is the author's own.
    expect(stripSpreadsheetFormulaGuard("'twas")).toBe("'twas");
    expect(stripSpreadsheetFormulaGuard('plain')).toBe('plain');
    expect(stripSpreadsheetFormulaGuard('')).toBe('');
    // Numeric literals are never guarded, so a leading apostrophe on one is data.
    expect(stripSpreadsheetFormulaGuard("'-41.2865")).toBe("'-41.2865");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. The export/import round trip is lossless
// ─────────────────────────────────────────────────────────────────────────────

describe('CSV export re-imports unchanged', () => {
  const events = [
    event({ id: 'evt-1', region: ROUND_TRIP_VALUES[0], author: ROUND_TRIP_VALUES[1] }),
    event({
      id: 'evt-2',
      time: '2024-02-20T04:30:00Z',
      magnitude: 2.1,
      region: ROUND_TRIP_VALUES[2],
      author: ROUND_TRIP_VALUES[3],
    }),
  ];

  it('carries every value through eventsToCSV -> parseCSV byte-for-byte', () => {
    const csv = eventsToCSV(events, undefined, { neutralizeFormulas: false });
    const parsed = parseCSV(csv);

    expect(parsed.success).toBe(true);
    expect(parsed.events).toHaveLength(2);

    const roundTripped = parsed.events.map(e => [
      (e as { region?: string }).region,
      (e as { author?: string }).author,
    ]);
    expect(roundTripped).toEqual([
      [ROUND_TRIP_VALUES[0], ROUND_TRIP_VALUES[1]],
      [ROUND_TRIP_VALUES[2], ROUND_TRIP_VALUES[3]],
    ]);
  });

  it('keeps the spreadsheet guard on by default', () => {
    const csv = eventsToCSV([event({ region: '=cmd|calc' })]);
    expect(csv).toContain("'=cmd|calc");
  });

  it('a guarded file is recoverable with stripSpreadsheetFormulaGuard', () => {
    // The contract the CSV importer needs in order to accept guarded files unchanged.
    const csv = eventsToCSV(events);
    const parsed = parseCSV(csv);

    const recovered = parsed.events.map(e => [
      stripSpreadsheetFormulaGuard(String((e as { region?: string }).region)),
      stripSpreadsheetFormulaGuard(String((e as { author?: string }).author)),
    ]);
    expect(recovered).toEqual([
      [ROUND_TRIP_VALUES[0], ROUND_TRIP_VALUES[1]],
      [ROUND_TRIP_VALUES[2], ROUND_TRIP_VALUES[3]],
    ]);
  });
});
