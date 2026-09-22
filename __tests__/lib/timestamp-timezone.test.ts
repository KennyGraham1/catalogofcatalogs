/** @jest-environment node */

// Origin times are UTC by definition (QuakeML 1.2, FDSN). V8 parses slash-separated and
// RFC-2822-style dates as SERVER-LOCAL time, so an unconditional new Date() ahead of the
// explicit-UTC branches shifted them by the host's UTC offset. Expected values below are
// the input read as UTC; they must not depend on process.env.TZ.

import { normalizeTimestamp } from '@/lib/earthquake-utils';

describe('normalizeTimestamp is independent of the server timezone', () => {
  it.each([
    ['2016/11/13 11:02:56', undefined, '2016-11-13T11:02:56.000Z'], // Kaikōura mainshock, UTC
    ['2024/01/15 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
    ['2024-01-15 10:30:00', undefined, '2024-01-15T10:30:00.000Z'],
    ['01/02/2024 10:30:00', 'International', '2024-02-01T10:30:00.000Z'],
    ['01/02/2024 10:30:00', 'US', '2024-01-02T10:30:00.000Z'],
  ])('%s (%s) -> %s', (input, hint, expected) => {
    expect(normalizeTimestamp(input, hint as never)).toBe(expected);
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

  it('is the same under Pacific/Auckland as under UTC', () => {
    // process.env.TZ is honoured by V8 for new Date() of local-form strings, which is the
    // exact code path being guarded. Node caches the zone on first use in some versions,
    // so we assert the invariant through a fresh child process rather than in-process.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const script = `
      const { normalizeTimestamp } = require('./lib/earthquake-utils');
      process.stdout.write(String(normalizeTimestamp('2016/11/13 11:02:56')));
    `;
    const run = (tz: string) =>
      execFileSync(process.execPath, ['--import', 'tsx', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim();
    expect(run('Pacific/Auckland')).toBe('2016-11-13T11:02:56.000Z');
    expect(run('UTC')).toBe('2016-11-13T11:02:56.000Z');
  });
});
