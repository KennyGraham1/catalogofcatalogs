/** @jest-environment node */

// Origin times are UTC by definition (QuakeML 1.2, FDSN). V8 parses slash-separated and
// RFC-2822-style dates as SERVER-LOCAL time, so an unconditional new Date() ahead of the
// explicit-UTC branches shifted them by the host's UTC offset. Expected values below are
// the input read as UTC; they must not depend on process.env.TZ.
//
// Every case is also run in fresh child processes under Pacific/Auckland and
// America/Los_Angeles: in-process the zone is the runner's, which is UTC on CI, where a
// local-time parse happens to give the right answer and the test could never fail.

import { execFileSync } from 'node:child_process';
import { normalizeTimestamp } from '@/lib/earthquake-utils';

const CASES: Array<[string, 'US' | 'International' | undefined, string]> = [
  ['2016/11/13 11:02:56', undefined, '2016-11-13T11:02:56.000Z'], // Kaikōura mainshock, UTC
  ['2024/01/15 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['2024-01-15 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['01/02/2024 10:30:00', 'International', '2024-02-01T10:30:00.000Z'],
  ['01/02/2024 10:30:00', 'US', '2024-01-02T10:30:00.000Z'],
  ['2024-01-15', undefined, '2024-01-15T00:00:00.000Z'],
  ['2024-1-5', undefined, '2024-01-05T00:00:00.000Z'],
  ['2024-01-15T10:30:00+13:00', undefined, '2024-01-14T21:30:00.000Z'],
  ['2024-01-15T10:30:00Z', undefined, '2024-01-15T10:30:00.000Z'],
  // Shapes that used to reach the local-time fallback
  ['2024/01/15', undefined, '2024-01-15T00:00:00.000Z'],
  ['2024/01/15 12:34', undefined, '2024-01-15T12:34:00.000Z'],
  ['2024.01.15 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['13 Nov 2016 11:02:56', undefined, '2016-11-13T11:02:56.000Z'],
  ['Jan 15 2024 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['Mon, 15 Jan 2024 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
  ['2024-01-15 10:30:00.1234567', undefined, '2024-01-15T10:30:00.123Z'],
];

describe('normalizeTimestamp is independent of the server timezone', () => {
  it.each(CASES)('%s (%s) -> %s', (input, hint, expected) => {
    expect(normalizeTimestamp(input, hint)).toBe(expected);
  });

  it('does not mistake the day of a bare date for a zone offset', () => {
    // `2024-01-15` ends in `-15`, which a naive zone regex reads as UTC-15. It must
    // take the explicit-UTC path, not the generic local-time parse.
    expect(normalizeTimestamp('2024-01-15')).toBe('2024-01-15T00:00:00.000Z');
    expect(normalizeTimestamp('2024-1-5')).toBe('2024-01-05T00:00:00.000Z');
  });

  it('honours an explicit zone designator rather than assuming UTC', () => {
    expect(normalizeTimestamp('2024-01-15T10:30:00+13:00')).toBe('2024-01-14T21:30:00.000Z');
    expect(normalizeTimestamp('2024-01-15T10:30:00Z')).toBe('2024-01-15T10:30:00.000Z');
  });

  it.each([
    ['Pacific/Auckland', -780], // NZDT in January: UTC+13
    ['America/Los_Angeles', 480], // PST: UTC-8
  ])('every case gives the same UTC instant under %s', (tz, offsetMinutes) => {
    // process.env.TZ is honoured by V8 for new Date() of local-form strings, which is the
    // exact code path being guarded. Node caches the zone on first use in some versions,
    // so we assert the invariant through a fresh child process rather than in-process.
    const script = `
      const { normalizeTimestamp } = require('./lib/earthquake-utils');
      const cases = ${JSON.stringify(CASES)};
      process.stdout.write(JSON.stringify({
        offsetMinutes: new Date(2024, 0, 15, 12).getTimezoneOffset(),
        results: cases.map(([input, hint]) => normalizeTimestamp(input, hint === null ? undefined : hint)),
      }));
    `;
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
      env: { ...process.env, TZ: tz },
      encoding: 'utf8',
    });
    const child = JSON.parse(stdout.slice(stdout.indexOf('{"offsetMinutes"')));
    // The child really ran in that zone, so a local-time parse would show up here.
    expect(child.offsetMinutes).toBe(offsetMinutes);
    expect(child.results).toEqual(CASES.map(([, , expected]) => expected));
  }, 60000);
});
