/** @jest-environment node */

// csvField() prefixes an apostrophe to formula-triggering values (=, +, -, @, TAB, CR).
// The inverse had no caller on the import path, so each export/import cycle added another.

import { parseWithDelimiter } from '@/lib/delimiter-detector';
import { csvField } from '@/lib/export-utils';

const roundTrip = (value: string) =>
  parseWithDelimiter(['region', csvField(value)].join('\n'), ',').rows[0][0];

describe('spreadsheet-formula guard round-trips through CSV import', () => {
  it.each([
    '-- unknown --', '-Wellington', '=SUM(A1)', '+64 4 555 1234', '@home',
    'Te Anau', '-41.2865', '12',
  ])('returns %j unchanged', (value) => {
    expect(roundTrip(value)).toBe(value);
  });

  it("keeps an apostrophe the guard would not have added", () => {
    expect(roundTrip("'twas")).toBe("'twas");
    expect(roundTrip("O'Connor")).toBe("O'Connor");
  });

  it('is idempotent across repeated cycles', () => {
    let value = '-Wellington';
    for (let i = 0; i < 3; i++) value = roundTrip(value);
    expect(value).toBe('-Wellington');
  });
});
