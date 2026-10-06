/**
 * @jest-environment node
 *
 * gs#0: scripts/migrate-uncertainty-units.ts picked legacy metres-valued rows by
 * SIZE (`> 100`), so a well-constrained 80 m legacy row was left alone (read as
 * 80 km) while a genuinely poorly-constrained, already-correct 150 km row got
 * divided by 1000 again — and a re-run divided any surviving large legacy value
 * a second time, because nothing marked a row as done.
 *
 * The fix selects rows by comparing the flat column to the preferred origin's
 * raw QuakeML value in the `origins` JSON blob (always metres, never divided by
 * the parser): ratio ~1 means "never converted" (any size), ratio ~0.001 means
 * "already correct". These are unit tests of the pure decision function plus an
 * end-to-end run of the real script against an in-memory fake driver, replaying
 * the finding's own L1-L5/K1/P1/C1 scenario.
 */

import {
  decideUncertaintyConversion,
  findPreferredOrigin,
  type OriginLike,
} from '@/scripts/lib/uncertainty-provenance';

describe('gs#0 decideUncertaintyConversion (pure)', () => {
  const origin = (depthUnc: number, horizUnc: number, id = 'o1'): OriginLike => ({
    publicID: id,
    depth: { uncertainty: depthUnc },
    uncertainty: { horizontalUncertainty: horizUnc },
  });

  it('converts a well-constrained legacy row (80 m) that the old >100 threshold left alone', () => {
    const d = decideUncertaintyConversion(80, [origin(80, 60)], 'o1', 'depth_uncertainty');
    expect(d).toEqual({ action: 'convert', newValueKm: 0.08, ratio: 1 });
  });

  it('converts a large legacy row (150000 m) the same way — no size threshold', () => {
    const d = decideUncertaintyConversion(150000, [origin(1, 150000)], 'o1', 'horizontal_uncertainty');
    expect(d.action).toBe('convert');
    expect((d as { newValueKm: number }).newValueKm).toBeCloseTo(150, 9);
  });

  it('leaves an already-correct km value alone (ratio ~0.001), even when it is large', () => {
    // P1 from the finding: correctly converted between 632a493 and c5e88f3, stored
    // at 150 km from a 150,000 m raw origin. The old size threshold divided this
    // again on its very first run.
    const d = decideUncertaintyConversion(150, [origin(1, 150000)], 'o1', 'horizontal_uncertainty');
    expect(d.action).toBe('leave');
  });

  it('leaves a small already-correct km value alone (K1: 0.08 km from an 80 m origin)', () => {
    const d = decideUncertaintyConversion(0.08, [origin(80, 60)], 'o1', 'depth_uncertainty');
    expect(d.action).toBe('leave');
  });

  it('does not misclassify a double-converted value (0.15 from a 150 raw) as convertible again', () => {
    // Guards against the old bug's own failure mode re-appearing: a value already
    // divided by 1000 twice must not look "unconverted" by ratio.
    const d = decideUncertaintyConversion(0.15, [origin(150, 1)], 'o1', 'depth_uncertainty');
    expect(d.action).toBe('leave');
  });

  it('reports no-origin-data for a CSV-derived row with no origins JSON at all', () => {
    const d = decideUncertaintyConversion(3.5, null, null, 'depth_uncertainty');
    expect(d).toEqual({ action: 'no-origin-data' });
  });

  it('reports no-origin-data when the preferred origin carries no raw value for this field', () => {
    const d = decideUncertaintyConversion(5, [{ publicID: 'o1' }], 'o1', 'depth_uncertainty');
    expect(d.action).toBe('no-origin-data');
  });

  it('falls back to origins[0] when preferredOriginId does not match any origin', () => {
    const found = findPreferredOrigin([origin(1, 2, 'a'), origin(3, 4, 'b')], 'missing');
    expect(found?.publicID).toBe('a');
  });

  it('picks the origin matching preferredOriginId over origins[0]', () => {
    const found = findPreferredOrigin([origin(1, 2, 'a'), origin(3, 4, 'b')], 'b');
    expect(found?.publicID).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// End-to-end: the real script against an in-memory fake driver.
// ---------------------------------------------------------------------------

interface FakeDoc {
  id: string;
  depth_uncertainty?: number | null;
  horizontal_uncertainty?: number | null;
  preferred_origin_id?: string | null;
  origins?: string | null;
  uncertainty_units?: string | null;
}

/** Matches exactly the filter shape migrate-uncertainty-units.ts builds — not a general query engine. */
function matchesFilter(doc: FakeDoc, filter: any): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      const clauses = cond as Array<Record<string, any>>;
      if (!clauses.some((clause) => matchesFilter(doc, clause))) return false;
      continue;
    }
    const value = (doc as any)[key];
    const c = cond as Record<string, unknown>;
    if ('$exists' in c) {
      const exists = value !== undefined;
      if (exists !== c.$exists) return false;
    }
    if ('$ne' in c) {
      if (value === c.$ne) return false;
    }
  }
  return true;
}

function makeFakeEventsCollection(docs: FakeDoc[]) {
  return {
    find: (filter: any) => {
      const matched = docs.filter((d) => matchesFilter(d, filter));
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const d of matched) yield { ...d };
        },
      };
    },
    bulkWrite: jest.fn(async (ops: Array<{ updateOne: { filter: { id: string }; update: { $set: Record<string, unknown> } } }>) => {
      for (const op of ops) {
        const doc = docs.find((d) => d.id === op.updateOne.filter.id);
        if (doc) Object.assign(doc, op.updateOne.update.$set);
      }
      return { modifiedCount: ops.length };
    }),
  };
}

function originsJson(depthUncMetres: number, horizUncMetres: number): string {
  return JSON.stringify([{ publicID: 'o1', depth: { uncertainty: depthUncMetres }, uncertainty: { horizontalUncertainty: horizUncMetres } }]);
}

describe('gs#0 migrate-uncertainty-units.ts end-to-end (fake driver, no real DB)', () => {
  let docs: FakeDoc[];
  let fakeDb: { databaseName: string; collection: jest.Mock };
  let getDb: jest.Mock;
  let closeConnection: jest.Mock;

  const freshDocs = (): FakeDoc[] => [
    // L1: well-constrained, legacy metres, at/under the old >100 threshold.
    { id: 'L1', depth_uncertainty: 80, horizontal_uncertainty: 60, preferred_origin_id: 'o1', origins: originsJson(80, 60) },
    // L2: also under the old threshold.
    { id: 'L2', depth_uncertainty: 100, horizontal_uncertainty: 95, preferred_origin_id: 'o1', origins: originsJson(100, 95) },
    // L3: over the old threshold (old script also "fixed" this one, coincidentally).
    { id: 'L3', depth_uncertainty: 150, horizontal_uncertainty: 250, preferred_origin_id: 'o1', origins: originsJson(150, 250) },
    // L5: horizontal raw is large enough that, after correct conversion (150 km),
    // it is still outside EVENT_OPTIONAL_RANGES ([0,100]) -> must be reported+nulled, not written.
    { id: 'L5', depth_uncertainty: 20000, horizontal_uncertainty: 150000, preferred_origin_id: 'o1', origins: originsJson(20000, 150000) },
    // P1: correctly converted already (1/150 km from a 1000/150,000 m origin) -> must NOT be re-divided.
    { id: 'P1', depth_uncertainty: 1, horizontal_uncertainty: 150, preferred_origin_id: 'o1', origins: originsJson(1000, 150000) },
    // K1: correctly converted, small (0.08/0.06 km) -> left alone, marked done.
    { id: 'K1', depth_uncertainty: 0.08, horizontal_uncertainty: 0.06, preferred_origin_id: 'o1', origins: originsJson(80, 60) },
    // C1: CSV-derived, genuine km values, no origins JSON at all -> untouched, unmarked.
    { id: 'C1', depth_uncertainty: 3.5, horizontal_uncertainty: 2, preferred_origin_id: null, origins: null },
  ];

  beforeEach(() => {
    jest.resetModules();
    docs = freshDocs();
    const eventsCollection = makeFakeEventsCollection(docs);
    fakeDb = { databaseName: 'fixscripts-test-db', collection: jest.fn(() => eventsCollection) };
    getDb = jest.fn(async () => fakeDb);
    closeConnection = jest.fn(async () => {});

    jest.doMock('@/lib/mongodb', () => ({
      getDb,
      closeConnection,
      COLLECTIONS: { EVENTS: 'merged_events', CATALOGUES: 'merged_catalogues' },
    }));
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
  });

  afterEach(() => {
    jest.dontMock('@/lib/mongodb');
    jest.dontMock('dotenv');
  });

  it('dry run (default, no --write) converts nothing', async () => {
    process.argv = ['node', 'migrate-uncertainty-units.ts'];
    const mod = await import('@/scripts/migrate-uncertainty-units');
    await mod.run();

    expect(docs.find((d) => d.id === 'L1')!.depth_uncertainty).toBe(80); // unchanged
    expect(docs.find((d) => d.id === 'P1')!.horizontal_uncertainty).toBe(150); // unchanged
    expect(docs.every((d) => d.uncertainty_units == null)).toBe(true); // nothing marked
  });

  it('--write --yes converts by provenance, not size, and leaves already-correct rows alone', async () => {
    process.argv = ['node', 'migrate-uncertainty-units.ts', '--write', '--yes'];
    const mod = await import('@/scripts/migrate-uncertainty-units');
    await mod.run();

    const byId = (id: string) => docs.find((d) => d.id === id)!;

    // L1/L2: the old script left these unchanged (under its 100 threshold).
    // Provenance-based conversion fixes them regardless of size.
    expect(byId('L1').depth_uncertainty).toBeCloseTo(0.08, 9);
    expect(byId('L1').horizontal_uncertainty).toBeCloseTo(0.06, 9);
    expect(byId('L2').depth_uncertainty).toBeCloseTo(0.1, 9);
    expect(byId('L2').horizontal_uncertainty).toBeCloseTo(0.095, 9);

    // L3: also converted (matches the old script's result for this one row).
    expect(byId('L3').depth_uncertainty).toBeCloseTo(0.15, 9);
    expect(byId('L3').horizontal_uncertainty).toBeCloseTo(0.25, 9);

    // P1: already correct (150 km, from a 150,000 m origin) — must NOT be divided
    // again. The old size-only script corrupted exactly this row on its first run.
    expect(byId('P1').horizontal_uncertainty).toBe(150);
    expect(byId('P1').depth_uncertainty).toBe(1);

    // K1: already correct, small — left alone.
    expect(byId('K1').depth_uncertainty).toBe(0.08);
    expect(byId('K1').horizontal_uncertainty).toBe(0.06);

    // C1: no provenance at all (CSV-derived) — untouched and unmarked.
    expect(byId('C1').depth_uncertainty).toBe(3.5);
    expect(byId('C1').uncertainty_units).toBeUndefined();

    // L5: depth converts fine (20000 -> 20 km, in range). Horizontal converts to
    // 150 km, which is still outside EVENT_OPTIONAL_RANGES ([0,100]) — must be
    // reported and cleared (null), never silently written out of range.
    expect(byId('L5').depth_uncertainty).toBeCloseTo(20, 9);
    expect(byId('L5').horizontal_uncertainty).toBeNull();

    // Every fully-resolved row (everything except C1, which had no provenance to
    // resolve) is marked so a re-run is a no-op.
    for (const id of ['L1', 'L2', 'L3', 'L5', 'P1', 'K1']) {
      expect(byId(id).uncertainty_units).toBe('km');
    }
  });

  it('is idempotent: a second --write run makes no further changes (the marker, not just the ratio, short-circuits it)', async () => {
    process.argv = ['node', 'migrate-uncertainty-units.ts', '--write', '--yes'];
    const mod = await import('@/scripts/migrate-uncertainty-units');
    await mod.run();
    const afterFirstRun = JSON.stringify(docs);

    (fakeDb.collection as jest.Mock).mockClear();
    const eventsCollection = fakeDb.collection('merged_events');
    const bulkWriteSpy = eventsCollection.bulkWrite as jest.Mock;
    bulkWriteSpy.mockClear();

    await mod.run();

    expect(JSON.stringify(docs)).toBe(afterFirstRun);
    // L5's horizontal_uncertainty is null, so 5 of the 7 docs still have a
    // non-null field the $or filter could match -- confirm none of them were
    // re-selected/re-written this second pass.
    expect(bulkWriteSpy).not.toHaveBeenCalled();
  });

  it('marks the rewritten rows\' catalogues changed after a --write run, and nothing on a dry run', async () => {
    // The script writes past lib/db.ts, so without this the stored statistics and the
    // other instances' caches would keep serving the unconverted values.
    for (const doc of docs) (doc as FakeDoc & { catalogue_id?: string }).catalogue_id = doc.id === 'C1' ? 'cat-csv' : 'cat-quakeml';
    const markCatalogueDataChanged = jest.fn(async () => {});
    jest.doMock('@/lib/db', () => ({ ...jest.requireActual('@/lib/db'), markCatalogueDataChanged }));
    try {
      process.argv = ['node', 'migrate-uncertainty-units.ts'];
      await (await import('@/scripts/migrate-uncertainty-units')).run();
      expect(markCatalogueDataChanged).not.toHaveBeenCalled();

      jest.resetModules(); // WRITE is read when the script loads
      process.argv = ['node', 'migrate-uncertainty-units.ts', '--write', '--yes'];
      await (await import('@/scripts/migrate-uncertainty-units')).run();
      // C1 (no provenance) is not rewritten, so only the QuakeML catalogue changed.
      expect(markCatalogueDataChanged).toHaveBeenCalledTimes(1);
      expect(markCatalogueDataChanged).toHaveBeenCalledWith(['cat-quakeml']);
    } finally {
      jest.dontMock('@/lib/db');
    }
  });

  it('refuses to write without confirmation in a non-interactive shell, even with --write', async () => {
    process.argv = ['node', 'migrate-uncertainty-units.ts', '--write']; // no --yes
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    try {
      const mod = await import('@/scripts/migrate-uncertainty-units');
      await mod.run();
      expect(docs.find((d) => d.id === 'L1')!.depth_uncertainty).toBe(80); // unchanged
      expect(process.exitCode).toBe(1);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
      process.exitCode = 0;
    }
  });
});
