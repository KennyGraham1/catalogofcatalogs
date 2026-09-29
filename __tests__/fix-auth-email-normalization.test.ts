/**
 * @jest-environment node
 *
 * Security-review follow-up: email addresses are folded with NFKC and lowercased before
 * they key the sign-in throttle or look up an account, so spellings MongoDB's
 * case-insensitive lookup would match to the same account cannot each open a fresh
 * guessing budget.
 */

import { normalizeEmail } from '@/lib/auth/normalize';

describe('normalizeEmail', () => {
  it.each([
    ['ſeismologist@example.test', 'seismologist@example.test'], // U+017F LONG S
    ['ＳＥＩＳＭＯＬＯＧＩＳＴ@example.test', 'seismologist@example.test'], // fullwidth
    ['Kelvin@example.test', 'kelvin@example.test'], // KELVIN SIGN
    ['ﬁeld@example.test', 'field@example.test'], // "fi" ligature
    ['  Admin@Example.TEST ', 'admin@example.test'],
    ['seismologist@example.test', 'seismologist@example.test'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  it('is idempotent', () => {
    for (const raw of ['ſ@ＥＸ.test', 'İstanbul@example.test', 'straße@example.test']) {
      expect(normalizeEmail(normalizeEmail(raw))).toBe(normalizeEmail(raw));
    }
  });
});
