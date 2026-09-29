/**
 * Canonical form of an email address, used for every account lookup, for the
 * sign-in throttle's keys and for stored addresses.
 *
 * NFKC folds compatibility spellings to the letters they stand for (U+017F LONG S to
 * "s", fullwidth letters, ligatures, the Kelvin sign to "K"), and lowercasing then
 * folds case. MongoDB's case-insensitive lookup already treats several of these as the
 * same letter, so without this a variant would reach the same account under a new
 * throttle key, and with it a fresh guessing budget.
 */
export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').toLowerCase().normalize('NFKC').trim();
}
