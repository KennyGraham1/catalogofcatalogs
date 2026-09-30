/**
 * @jest-environment node
 *
 * Regression tests for the merge2 follow-up fixes:
 *  1. validateEventGroup's Mw-equivalence rescue must only apply to groups that actually
 *     MIX magnitude scales, and must not let conversion buy a looser threshold tier.
 *  2. executeMergeOperation must reject a short write rather than silently losing events.
 *
 * Every expected value is derived by hand from the published relation / documented tier
 * table named in the comment, not by running the code and recording its output.
 */

jest.mock('@/lib/db', () => ({
  dbQueries: {
    transaction: jest.fn(),
    insertCatalogue: jest.fn(),
    getEventsByCatalogueId: jest.fn(),
    bulkInsertEvents: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueStatus: jest.fn(),
  },
}));

import { validateEventGroup, mergeCatalogues } from '@/lib/merge';
import { dbQueries } from '@/lib/db';

const db = dbQueries as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// 1. validateEventGroup — the Mw rescue is a CROSS-SCALE correction only
// ---------------------------------------------------------------------------

describe('validateEventGroup — Mw rescue applies only to mixed-scale groups', () => {
  // Two events 2 s and ~0 km apart with identical depths and distinct sources, so the
  // magnitude gate is the only check that can fail.
  const pair = (magA: number, typeA: string, magB: number, typeB: string) => [
    {
      id: 'a', time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174, depth: 12,
      magnitude: magA, magnitude_type: typeA, source: 'GeoNet',
    },
    {
      id: 'b', time: '2020-01-01T00:00:02.000Z', latitude: -41, longitude: 174, depth: 12,
      magnitude: magB, magnitude_type: typeB, source: 'ISC',
    },
  ] as any[];

  // magnitudeRangeThreshold: mean < 4.0 -> 0.5, mean < 5.5 -> 0.8, mean < 7.0 -> 1.2, else 1.5.
  //
  // Scordilis (2006) Ms -> Mw below Ms 6.2 is Mw = 0.67*Ms + 2.07. The slope of 0.67
  // compresses any Ms range by a third AND lifts the mean by ~1 unit, so before this fix a
  // same-scale Ms pair could be rescued twice over: a smaller converted range judged against
  // a looser tier. e.g. Ms 3.0/Ms 3.8 -> Mw 4.08/4.62: range 0.54 (from 0.80) at mean 4.35
  // (tier 0.8 instead of 0.5). Nothing about the pair changed, so it must still be rejected.
  it.each([
    ['Ms 3.0 / Ms 3.8', 3.0, 3.8, 3.4, 0.5, 0.8],
    ['Ms 3.0 / Ms 3.7', 3.0, 3.7, 3.35, 0.5, 0.7],
    ['Ms 2.5 / Ms 3.2', 2.5, 3.2, 2.85, 0.5, 0.7],
  ])('rejects same-scale %s (raw range exceeds its raw-mean tier)', (_label, a, b, mean, tier, range) => {
    // Sanity-check the hand arithmetic the expectation rests on.
    expect((a + b) / 2).toBeCloseTo(mean, 10);
    expect(b - a).toBeCloseTo(range, 10);
    expect(range).toBeGreaterThan(tier);

    expect(validateEventGroup(pair(a, 'Ms', b, 'Ms'), false)).toBe(false);
  });

  it('rejects a same-scale ML pair the converted mean would have promoted a tier', () => {
    // ML -> Mw is the identity here, so conversion cannot shrink the range; this pins the
    // "conversion is not a licence to re-check" behaviour for the identity case too.
    // Raw mean 3.4 -> tier 0.5, raw range 0.8 -> reject.
    expect(validateEventGroup(pair(3.0, 'ML', 3.8, 'ML'), false)).toBe(false);
  });

  it('accepts a same-scale Ms pair that already passes on raw values', () => {
    // Ms 4.0 / Ms 4.7: raw mean 4.35 -> tier 0.8, raw range 0.7 <= 0.8. This pair never
    // reaches the rescue at all; the raw gate accepts it, before and after the fix.
    expect(validateEventGroup(pair(4.0, 'Ms', 4.7, 'Ms'), false)).toBe(true);
  });

  it('still accepts one earthquake reported as mb by ISC and ML by GeoNet', () => {
    // Scordilis (2006): Mw = 0.85*mb + 1.03, so mb 3.26 -> Mw 3.80; ML 3.8 -> Mw 3.8.
    // Raw: mean 3.53 -> tier 0.5, range 0.54 > 0.5 -> would be rejected on raw values.
    // Converted: range 0.00 <= 0.5 (the RAW-mean tier) -> rescued.
    expect(validateEventGroup(pair(3.26, 'mb', 3.8, 'ML'), false)).toBe(true);
  });

  it('does not let a conversion-inflated mean buy a looser threshold tier', () => {
    // Ms 3.0 -> Mw 0.67*3.0 + 2.07 = 4.08 (sigma 0.20);
    // mb 4.47 -> Mw 0.85*4.47 + 1.03 = 4.8295 (sigma 0.30). Converted range 0.7495.
    //
    // The tier must come from the RAW mean, 3.735 -> 0.5, not from the converted mean,
    // 4.45 -> 0.8. The Mw comparison is judged against that tier widened in quadrature by the
    // conversion uncertainty of the two members (see merge-gate-conversion-uncertainty.test.ts):
    //     from the raw mean:       sqrt(0.5^2 + 0.20^2 + 0.30^2) = sqrt(0.38) = 0.616 -> reject
    //     from the converted mean: sqrt(0.8^2 + 0.20^2 + 0.30^2) = sqrt(0.77) = 0.877 -> accept
    // 0.7495 sits between the two, so this case still discriminates: it passes only if a
    // conversion that lifts the mean is allowed to buy the looser tier, which it must not.
    //
    // (This case previously used mb 4.29, giving a 0.5965 separation chosen to sit just above
    // the bare 0.5 tier. That margin is smaller than the 0.36 combined uncertainty of the two
    // conversions being compared, so it no longer distinguishes a real disagreement from
    // conversion noise; the value was moved out to where the property is still decidable.)
    expect(validateEventGroup(pair(3.0, 'Ms', 4.47, 'mb'), false)).toBe(false);
  });

  it('still rejects a mixed-scale group that genuinely disagrees', () => {
    // ML 3.0 -> Mw 3.0, Mw 7.0 -> Mw 7.0: converted range 4.0 against a raw-mean (5.0)
    // tier of 0.8.
    expect(validateEventGroup(pair(3.0, 'ML', 7.0, 'Mw'), false)).toBe(false);
  });

  it('falls back to the raw comparison when a magnitude type is missing', () => {
    const untyped = pair(3.0, 'Ms', 3.8, 'Ms');
    delete untyped[1].magnitude_type;
    expect(validateEventGroup(untyped, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. executeMergeOperation — every output group must be inserted
// ---------------------------------------------------------------------------

describe('mergeCatalogues — requires every output row to be inserted', () => {
  const config: any = {
    timeThreshold: 30,
    distanceThreshold: 30,
    mergeStrategy: 'quality',
    priority: 'quality',
  };

  const sourceCatalogues: any[] = [
    { id: 'cat-1', name: 'GeoNet', source: 'GeoNet' },
    { id: 'cat-2', name: 'ISC', source: 'ISC' },
  ];

  // Four events days apart, so no two of them match and performMerge yields four groups
  // of one: the merged count is exactly the input count, independent of the matcher.
  const events: Record<string, any[]> = {
    'cat-1': [
      { id: 'g1', source_id: 'g1', time: '2020-01-01T00:00:00.000Z', latitude: -41, longitude: 174, depth: 12, magnitude: 4.0 },
      { id: 'g2', source_id: 'g2', time: '2020-01-05T00:00:00.000Z', latitude: -42, longitude: 173, depth: 15, magnitude: 4.2 },
    ],
    'cat-2': [
      { id: 'i1', source_id: 'i1', time: '2020-02-01T00:00:00.000Z', latitude: -40, longitude: 175, depth: 20, magnitude: 5.0 },
      { id: 'i2', source_id: 'i2', time: '2020-03-01T00:00:00.000Z', latitude: -39, longitude: 176, depth: 25, magnitude: 5.1 },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.transaction.mockImplementation(async (fn: any) => fn({ id: 'session' }));
    db.insertCatalogue.mockResolvedValue(undefined);
    db.getEventsByCatalogueId.mockImplementation(async (id: string) => events[id] ?? []);
    db.updateCatalogueGeoBounds.mockResolvedValue(undefined);
    db.updateCatalogueEventCount.mockResolvedValue(undefined);
    db.updateCatalogueStatus.mockResolvedValue(undefined);
  });

  it('rejects a short insert so the transaction rolls back instead of losing a row', async () => {
    // One of the four rows collides with the (catalogue_id, source_id) unique index and is
    // skipped, so only three documents exist in the collection.
    db.bulkInsertEvents.mockResolvedValue(3);

    await expect(mergeCatalogues('merged', sourceCatalogues, config, undefined, false))
      .rejects.toThrow('Could not save every merged event');

    expect(db.bulkInsertEvents).toHaveBeenCalledTimes(1);
    expect(db.bulkInsertEvents.mock.calls[0][0]).toHaveLength(4); // four rows submitted
    expect(db.updateCatalogueEventCount).not.toHaveBeenCalled();
    expect(db.updateCatalogueStatus).not.toHaveBeenCalled();
  });

  it('reports every row when nothing is deduplicated', async () => {
    db.bulkInsertEvents.mockResolvedValue(4);

    const result: any = await mergeCatalogues('merged', sourceCatalogues, config, undefined, false);

    expect(db.updateCatalogueEventCount).toHaveBeenCalledWith(expect.any(String), 4, { id: 'session' });
    expect(result.eventCount).toBe(4);
  });
});
