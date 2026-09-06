/**
 * Regression test for the third hand-rolled CSV escaper that used to live in
 * components/upload/ValidationResults.tsx.
 *
 * Expected values come from RFC 4180 §2 (a field containing CR, LF, a comma or a double
 * quote must be quoted, and internal quotes doubled) and from the OWASP CSV-injection
 * guidance the shared csvField() guard implements.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ValidationResults } from '@/components/upload/ValidationResults';

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

  const url = window.URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
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

const results = [
  {
    fileName: 'geonet.csv',
    isValid: false,
    errors: [],
    warnings: [],
    format: 'CSV',
    eventCount: 1,
    fields: ['time'],
    validationReport: {
      generatedAt: '2024-05-01T00:00:00.000Z',
      summary: { totalEvents: 1, validEvents: 0, invalidEvents: 1, failureCount: 3 },
      failures: [
        // A lone CR: the old escaper only tested for ",  " and \n, so this field was
        // emitted unquoted and split the record for any RFC 4180 reader.
        { message: 'bad\rvalue', severity: 'error', category: 'range', field: 'depth' },
        // Depositor-supplied text a spreadsheet would execute.
        { message: '=cmd|calc', severity: 'error', category: 'format', field: 'region' },
        // The comma/quote cases the old escaper did handle, kept as a guard.
        { message: 'a "b", c', severity: 'warning', category: 'format', field: 'author' },
      ],
    },
  },
];

function downloadCsvReport(): string {
  render(<ValidationResults results={results} catalogueName="GeoNet, NZ" />);
  fireEvent.click(screen.getByText('geonet.csv'));
  const [csv] = captureDownloadedText(() => {
    fireEvent.click(screen.getByRole('button', { name: /^CSV$/ }));
  });
  return csv;
}

describe('validation report CSV uses the shared escaper', () => {
  it('quotes a field containing a lone carriage return (RFC 4180 §2)', () => {
    const csv = downloadCsvReport();
    expect(csv).toContain('"bad\rvalue"');
    expect(csv).not.toContain(',bad\rvalue,');
  });

  it('neutralises spreadsheet formulas in depositor-supplied text', () => {
    const csv = downloadCsvReport();
    expect(csv).toContain("'=cmd|calc");
  });

  it('still quotes commas and doubles internal quotes', () => {
    const csv = downloadCsvReport();
    expect(csv).toContain('"a ""b"", c"');
    // The catalogue name column carries a comma too.
    expect(csv).toContain('"GeoNet, NZ"');
  });

  it('escapes the header record rather than joining it raw', () => {
    const csv = downloadCsvReport();
    const header = csv.split('\n')[0];
    expect(header).toBe(
      'catalogue_name,file_name,validation_timestamp,event_index,line,event_id,' +
      'severity,category,field,message,value,expected'
    );
    // Header + one record per failure; the CR lives inside a quoted field, so splitting on
    // \n must still give exactly four lines.
    expect(csv.split('\n')).toHaveLength(4);
  });
});
