/** @jest-environment node */
/**
 * Origin times are UTC by definition (QuakeML 1.2, FDSN, ISO 8601). A timestamp without
 * a zone designator must be read as UTC, never in the server's local time, and a
 * calendar value that does not exist must be rejected rather than rolled over.
 *
 * Every case runs in fresh Node processes under TZ=Pacific/Auckland and
 * TZ=America/Los_Angeles as well as in this process, because on a UTC runner (CI) a
 * local-time parse gives the right answer by accident and such a test cannot fail.
 * Expected values are the input read as UTC, derived by hand.
 */
import { execFileSync } from 'node:child_process';
import { normalizeTimestamp, validateTimestamp } from '@/lib/earthquake-utils';
import { parseCSV, parseJSON } from '@/lib/parsers';

type Hint = 'US' | 'International' | undefined;

/** [input, day/month hint, expected UTC instant or null] */
const NORMALIZE_CASES: Array<[string, Hint, string | null]> = [
  // 7+ fractional-second digits with no zone (SQL Server datetime2, .NET, pandas ns)
  ['2024-01-15 10:30:00.1234567', undefined, '2024-01-15T10:30:00.123Z'],
  ['2023-02-15 06:38:09.1268441', undefined, '2023-02-15T06:38:09.126Z'],
  ['2016-11-13 11:02:56.123456789', undefined, '2016-11-13T11:02:56.123Z'],
  ['2024-01-15T10:30:00.1234567', undefined, '2024-01-15T10:30:00.123Z'],
  ['2024/01/15 10:30:00.1234567', undefined, '2024-01-15T10:30:00.123Z'],
  ['2024-01-15T10:30:00.123456789Z', undefined, '2024-01-15T10:30:00.123Z'],
  // Year-first shapes without seconds, date-only, and with dots
  ['2024/01/15 12:34', undefined, '2024-01-15T12:34:00.000Z'],
  ['2024/01/15', undefined, '2024-01-15T00:00:00.000Z'],
  ['1855/01/23', undefined, '1855-01-23T00:00:00.000Z'], // Wairarapa, no local mean time
  ['2024.01.15 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  // Month names, with and without an RFC 2822 weekday
  ['13 Nov 2016 11:02:56', undefined, '2016-11-13T11:02:56.000Z'], // Kaikoura mainshock
  ['15 Jan 2024 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['Jan 15 2024 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['January 15, 2024 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['Mon, 15 Jan 2024 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  // Explicit zones are honoured, including a 'UTC' suffix after a T time
  ['Mon, 15 Jan 2024 10:30:00 +1300', undefined, '2024-01-14T21:30:00.000Z'],
  ['Mon, 15 Jan 2024 10:30:00 GMT', undefined, '2024-01-15T10:30:00.000Z'],
  ['2024-01-15T12:34:56 UTC', undefined, '2024-01-15T12:34:56.000Z'],
  ['2024-01-15T10:30:00+13', undefined, '2024-01-14T21:30:00.000Z'],
  // A numeric date with a two-digit year is not read on its own ('25/03/24' is also
  // YY/MM/DD); a file whose order is certain reads it (see the two-digit-year tests)
  ['05/03/24 10:00:00', undefined, null],
  ['05/03/24 10:00:00', 'International', null],
  ['25/03/24 10:00:00', undefined, null],
  // Day/month-first without seconds
  ['3/4/2024 10:00', 'International', '2024-04-03T10:00:00.000Z'],
  ['3/4/2024 10:00', 'US', '2024-03-04T10:00:00.000Z'],
  ['13/4/2024 10:00', undefined, '2024-04-13T10:00:00.000Z'],
  ['01.02.2024 10:30', undefined, '2024-02-01T10:30:00.000Z'],
  // Shapes that were already UTC stay so
  ['2016/11/13 11:02:56', undefined, '2016-11-13T11:02:56.000Z'],
  ['01/02/2024 10:30:00', 'US', '2024-01-02T10:30:00.000Z'],
  ['2024-01-15', undefined, '2024-01-15T00:00:00.000Z'],
  // Unrecognised shapes are rejected, never guessed in local time
  ['12:34:56', undefined, null],
  ['sometime in 2024', undefined, null],
  ['2024-01-15T10:30:00 NZDT', undefined, null],
];

/** Impossible calendar values are rejected instead of rolling into another date. */
const REJECTED_CALENDAR_VALUES = [
  '2023 366 00:00:00', '2023-366 00:00:00', '2023366000000',
  '2024 400 10:00:00', '2024 000 10:00:00', '2024-367 10:00:00', '2024 999 10:00:00',
  '2024-02-30 10:00:00', '2024-02-30', '2023-02-29 10:00:00', '2024-04-31',
  '31/02/2024 10:00:00', '31.02.2024 10:00:00', '2024/02/30',
  '20240230 100000', '20240230100000',
  '2024-02-31T10:00:00Z', '2024-02-30T10:30:00+13:00', '2024-13-01',
];

/** Valid day-of-year and leap-day controls. */
const CALENDAR_CONTROLS: Array<[string, string]> = [
  ['2024 366 00:00:00', '2024-12-31T00:00:00.000Z'],
  ['2024 060 10:00:00', '2024-02-29T10:00:00.000Z'],
  ['2024-02-29 10:00:00', '2024-02-29T10:00:00.000Z'],
  ['2024015103000', '2024-01-15T10:30:00.000Z'],
];

const END_TO_END_CSV = [
  'time,latitude,longitude,depth,magnitude',
  '2016-11-13 11:02:56.0000000,-42.69,173.02,15.1,7.8',
  '15 Jan 2024 10:30:00,-41.2,174.7,10,4.1',
  '2024/01/15 12:34,-41.2,174.7,10,4.1',
].join('\n');
const END_TO_END_CSV_EXPECTED = ['2016-11-13T11:02:56.000Z', '2024-01-15T10:30:00.000Z', '2024-01-15T12:34:00.000Z'];

// DD/MM without seconds through the JSON path: the first row settles the order.
const END_TO_END_JSON = JSON.stringify([
  { time: '13/11/2016 11:02', latitude: -42.69, longitude: 173.02, depth: 15.1, magnitude: 7.8 },
  { time: '03/04/2016 05:06', latitude: -42.5, longitude: 173.4, depth: 8.4, magnitude: 6.0 },
]);
const END_TO_END_JSON_EXPECTED = ['2016-11-13T11:02:00.000Z', '2016-04-03T05:06:00.000Z'];

/** Everything the child process computes, so one process per zone covers every case. */
function childScript(): string {
  return `
    const { normalizeTimestamp, validateTimestamp } = require('./lib/earthquake-utils');
    const { parseCSV, parseJSON } = require('./lib/parsers');
    const cases = ${JSON.stringify(NORMALIZE_CASES)};
    const rejected = ${JSON.stringify(REJECTED_CALENDAR_VALUES)};
    const controls = ${JSON.stringify(CALENDAR_CONTROLS)};
    const out = {
      offsetMinutes: new Date(2024, 0, 15, 12).getTimezoneOffset(),
      normalized: cases.map(([input, hint]) => normalizeTimestamp(input, hint === null ? undefined : hint)),
      rejected: rejected.map((input) => [normalizeTimestamp(input), validateTimestamp(input)]),
      controls: controls.map(([input]) => normalizeTimestamp(input)),
      csv: parseCSV(${JSON.stringify(END_TO_END_CSV)}).events.map((e) => e.time),
      json: parseJSON(${JSON.stringify(END_TO_END_JSON)}).events.map((e) => e.time),
    };
    process.stdout.write(JSON.stringify(out));
  `;
}

function runUnderZone(tz: string) {
  const stdout = execFileSync(process.execPath, ['--import', 'tsx', '-e', childScript()], {
    cwd: process.cwd(),
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  // The script writes one JSON document; anything printed before it (warnings) is ignored.
  return JSON.parse(stdout.slice(stdout.indexOf('{"offsetMinutes"')));
}

describe('normalizeTimestamp reads zone-less times as UTC', () => {
  it.each(NORMALIZE_CASES)('%s (%s) -> %s', (input, hint, expected) => {
    expect(normalizeTimestamp(input, hint)).toBe(expected);
  });

  it.each(REJECTED_CALENDAR_VALUES)('rejects the impossible date %s', (input) => {
    expect(normalizeTimestamp(input)).toBeNull();
    expect(validateTimestamp(input)).toBe(false);
  });

  it.each(CALENDAR_CONTROLS)('keeps the valid date %s', (input, expected) => {
    expect(normalizeTimestamp(input)).toBe(expected);
  });

  it('reads two-digit years when asked to, with the stated pivot', () => {
    const read = (input: string, hint?: 'US' | 'International') => normalizeTimestamp(input, hint, { twoDigitYears: true });
    expect(read('05/03/24 10:00:00')).toBe('2024-03-05T10:00:00.000Z');
    expect(read('05/03/24 10:00:00', 'International')).toBe('2024-03-05T10:00:00.000Z');
    expect(read('05/03/24 10:00:00', 'US')).toBe('2024-05-03T10:00:00.000Z');
    expect(read('25/03/24 10:00:00')).toBe('2024-03-25T10:00:00.000Z');
    expect(read('05/03/95 10:00:00')).toBe('1995-03-05T10:00:00.000Z');
    // A named month leaves no doubt which field is the year (DD-MON-YY).
    expect(normalizeTimestamp('15-JAN-24')).toBe('2024-01-15T00:00:00.000Z');
  });

  it('CSV and JSON uploads store the same UTC instants', () => {
    expect(parseCSV(END_TO_END_CSV).events.map((e) => e.time)).toEqual(END_TO_END_CSV_EXPECTED);
    const json = parseJSON(END_TO_END_JSON);
    expect(json.errors).toEqual([]);
    expect(json.events.map((e) => e.time)).toEqual(END_TO_END_JSON_EXPECTED);
  });
});

describe.each([
  ['Pacific/Auckland', -780], // NZDT on 15 January: UTC+13
  ['America/Los_Angeles', 480], // PST: UTC-8
])('the same results under TZ=%s', (tz, expectedOffset) => {
  let child: any;
  beforeAll(() => {
    child = runUnderZone(tz);
  }, 60000);

  it('the child process really runs in that zone', () => {
    // Without this the comparisons below could pass on a UTC host for the wrong reason.
    expect(child.offsetMinutes).toBe(expectedOffset);
  });

  it('normalizeTimestamp gives the UTC reading of every case', () => {
    expect(child.normalized).toEqual(NORMALIZE_CASES.map(([, , expected]) => expected));
  });

  it('impossible calendar values are rejected and valid ones kept', () => {
    expect(child.rejected).toEqual(REJECTED_CALENDAR_VALUES.map(() => [null, false]));
    expect(child.controls).toEqual(CALENDAR_CONTROLS.map(([, expected]) => expected));
  });

  it('parseCSV and parseJSON store UTC instants', () => {
    expect(child.csv).toEqual(END_TO_END_CSV_EXPECTED);
    expect(child.json).toEqual(END_TO_END_JSON_EXPECTED);
  });
});
