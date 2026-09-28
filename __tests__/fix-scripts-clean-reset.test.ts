/**
 * @jest-environment node
 *
 * gs#5: scripts/clean-database.js and scripts/clean-and-setup-database.sh never
 * touched MongoDB at all (they only ever unlinked a leftover SQLite file), then
 * called scripts/populate-realistic-nz-data.ts, deleted since 401ffa0 — so
 * clean-database.js always failed at that step, and the .sh variant (no `set
 * -e`) printed "Database setup complete!" anyway.
 *
 * The fix is a guarded MongoDB reset (scripts/lib/db-reset.ts, drop the whole
 * database behind a typed-confirmation gate) plus dropping the missing
 * population step from both callers. resetDatabase() itself is tested directly
 * against a fake `db`; the two callers are checked structurally (real source
 * text) for the specific properties the finding calls for, since actually
 * running them means either wiping a real database or spawning a real `npx
 * tsx` subprocess — neither appropriate for a unit test.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { resetDatabase } from '@/scripts/lib/db-reset';

describe('gs#5 resetDatabase (scripts/lib/db-reset.ts)', () => {
  it('drops the database and reports what it dropped', async () => {
    const dropDatabase = jest.fn(async () => true);
    const fakeDb = { databaseName: 'earthquake_catalogue_test', dropDatabase };

    const summary = await resetDatabase(fakeDb);

    expect(dropDatabase).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ database: 'earthquake_catalogue_test', dropped: true });
  });
});

describe('gs#5 clean-database.js / clean-and-setup-database.sh (source-level checks)', () => {
  const jsSource = readFileSync(join(__dirname, '..', 'scripts', 'clean-database.js'), 'utf-8');
  const shSource = readFileSync(join(__dirname, '..', 'scripts', 'clean-and-setup-database.sh'), 'utf-8');

  it('the .sh variant now uses `set -euo pipefail` (it previously had no `set -e` at all)', () => {
    expect(shSource).toMatch(/^set -euo pipefail/m);
  });

  it('neither caller shells out to the deleted populate-realistic-nz-data.ts', () => {
    // A comment may still name the old script to explain why it's gone; what
    // must be absent is an actual invocation of it.
    const invokes = /(?:execSync\([^)]*|npx tsx |node )['"`]?[^'"`\n]*populate-realistic-nz-data/;
    expect(jsSource).not.toMatch(invokes);
    expect(shSource).not.toMatch(invokes);
  });

  it('both callers now actually reset MongoDB, not only the leftover SQLite file', () => {
    expect(jsSource).toMatch(/db-reset/);
    expect(shSource).toMatch(/db-reset/);
  });

  it('both callers point at a population path that actually exists', () => {
    for (const src of [jsSource, shSource]) {
      expect(src).toMatch(/generate_test_data\.py/);
      expect(src).toMatch(/populate-geonet-baseline/);
    }
  });
});
