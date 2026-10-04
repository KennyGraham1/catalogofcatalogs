/** @jest-environment node */

/**
 * Merge quality control (lib/merge-qc.ts): buildMergeQcSummary on small synthetic groups
 * whose statistics are computed by hand below, the split keys groupMatchingEvents gives the
 * groups of one failed cluster, the listed-groups CSV, and the shape of the preview payload
 * (MergePreviewPayload) the preview route now returns.
 */

jest.mock('@/lib/db', () => ({
  dbQueries: {
    getEventsByCatalogueIdCursor: jest.fn(),
    getCatalogueById: jest.fn(),
  },
}));
jest.mock('@/lib/merge-authority', () => {
  const actual = jest.requireActual('@/lib/merge-authority');
  return { ...actual, loadMergeAuthority: async () => actual.DEFAULT_MERGE_AUTHORITY };
});

import {
  QC_CSV_COLUMNS,
  QC_MAX_LISTED_BYTES,
  QC_MAX_LISTED_GROUPS,
  QC_MAX_REASON_LENGTH,
  QC_PREVIEW_MAX_MATCHED,
  buildMergeQcSummary,
  differenceStats,
  qcListedGroupsCsv,
  separationStats,
  type MergeQcInput,
  type QcEntryInput,
  type QcGroupInput,
} from '@/lib/merge-qc';
import {
  buildMergePreview,
  groupMatchingEvents,
  pairMatchingWindows,
  pairSeparation,
  previewMerge,
  QC_GENERATED_BY,
} from '@/lib/merge';
import { dbQueries } from '@/lib/db';
import packageJson from '../package.json';

/** km per degree of latitude on the 6371 km sphere calculateDistance uses. */
const KM_PER_DEG = (6371 * Math.PI) / 180;
const T0 = Date.UTC(2020, 0, 1);
const iso = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

const CATALOGUES = [
  { id: 'A', name: 'Agency A' },
  { id: 'B', name: 'Agency B' },
  { id: 'C', name: 'Agency C' },
];
const nameOf = (id: string) => CATALOGUES.find(c => c.id === id)?.name ?? id;

function entry(catalogueId: string, over: Partial<QcEntryInput> = {}): QcEntryInput {
  return {
    catalogueId,
    catalogueName: nameOf(catalogueId),
    sourceId: null,
    time: iso(0),
    latitude: 0,
    longitude: 0,
    depth: 10,
    magnitude: 4,
    magnitudeType: 'ML',
    qualityScore: null,
    depthFixed: false,
    superseded: false,
    ...over,
  };
}

let nextId = 0;
function group(entries: QcEntryInput[], over: Partial<QcGroupInput> = {}): QcGroupInput {
  return {
    id: `g${nextId++}`,
    entries,
    publishedIndex: 0,
    flagged: false,
    keptApart: false,
    held: false,
    reasons: [],
    splitKey: null,
    discrepancy: 0,
    ...over,
  };
}

const FIXED_WINDOWS = () => ({ timeWindow: 10, distanceWindow: 10 });
const GENERATED_AT = new Date('2026-10-04T00:00:00.000Z');

function summarise(groups: QcGroupInput[], over: Partial<MergeQcInput> = {}) {
  return buildMergeQcSummary({
    config: { timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'quality' },
    sourceCatalogues: CATALOGUES,
    groups,
    pairWindows: FIXED_WINDOWS,
    generatedBy: 'Earthquake Catalogue Platform 9.9.9',
    generatedAt: GENERATED_AT,
    ...over,
  });
}

describe('robust statistics', () => {
  it('differenceStats: median, 1.4826 x MAD and type-7 percentiles', () => {
    // sorted [1, 2, 3, 10]: median 2.5; |x - 2.5| = [1.5, 0.5, 0.5, 7.5] -> MAD 1.0;
    // p05 at rank 0.15 -> 1.15; p95 at rank 2.85 -> 3 + 0.85 * 7 = 8.95.
    expect(differenceStats([10, 1, 3, 2])).toEqual({ n: 4, median: 2.5, robustSigma: 1.4826, p05: 1.15, p95: 8.95 });
    expect(differenceStats([7])).toEqual({ n: 1, median: 7, robustSigma: 0, p05: 7, p95: 7 });
    expect(differenceStats([])).toBeNull();
    expect(differenceStats([NaN, Infinity])).toBeNull();
  });

  it('separationStats: median, 90th / 95th percentiles and maximum', () => {
    // sorted [0, 1, 2, 11]: median 1.5; p90 at rank 2.7 -> 2 + 0.7 * 9 = 8.3; p95 -> 9.65.
    expect(separationStats([11, 0, 2, 1])).toEqual({ n: 4, median: 1.5, p90: 8.3, p95: 9.65, max: 11 });
    expect(separationStats([])).toBeNull();
  });
});

describe('buildMergeQcSummary', () => {
  // Catalogue pair A-B: four matched pairs. Differences B minus A:
  //   origin time [1, 2, 3, 10] s, epicentre [0, 0.01, 0.02, 0.1] degrees of latitude,
  //   magnitude [0.1, -0.1, 0.3, 0.2], depth [2, -1, 5] (the fourth pair's B depth is fixed).
  // The second pair lists B first and the fourth publishes B: orientation follows source
  // order, never entry order.
  const ab = [
    group([entry('A', { sourceId: 'a1', qualityScore: 80 }), entry('B', { time: iso(1), depth: 12, magnitude: 4.1 })]),
    group([entry('B', { time: iso(102), latitude: 0.01, depth: 9, magnitude: 3.9 }), entry('A', { time: iso(100) })]),
    group([entry('A', { time: iso(200) }), entry('B', { time: iso(203), latitude: 0.02, depth: 15, magnitude: 4.3 })]),
    group(
      [entry('A', { time: iso(300) }), entry('B', { time: iso(310), latitude: 0.1, depth: 30, depthFixed: true, magnitude: 4.2 })],
      { publishedIndex: 1 }
    ),
  ];
  // A three-catalogue group with a computed epicentre (no published entry) and a group
  // whose C entry is superseded (provenance only: no pair with it).
  const abc = group([entry('A', { time: iso(400) }), entry('B', { time: iso(401) }), entry('C', { time: iso(402) })], { publishedIndex: -1 });
  const withSuperseded = group(
    [entry('A', { time: iso(500) }), entry('C', { time: iso(501), superseded: true })]
  );
  // Singles: a C entry nobody matched, and the two entries of one failed cluster, kept apart.
  const unique = group([entry('C', { time: iso(600) })]);
  const apartA = group([entry('A', { time: iso(700) })], { keptApart: true, reasons: ['Magnitudes disagree'], splitKey: 'split-1' });
  const apartB = group([entry('B', { time: iso(701) })], { keptApart: true, reasons: ['Magnitudes disagree'], splitKey: 'split-1' });
  // A flagged, held group.
  const flagged = group([entry('A', { time: iso(800) }), entry('B', { time: iso(801) })], {
    flagged: true, held: true, reasons: ['Ambiguous association'], discrepancy: 0.4,
  });
  const groups = [...ab, abc, withSuperseded, unique, apartA, apartB, flagged];
  const qc = summarise(groups);

  it('identifies itself and keeps the merge settings', () => {
    expect(qc.version).toBe(1);
    expect(qc.generatedAt).toBe('2026-10-04T00:00:00.000Z');
    expect(qc.generatedBy).toBe('Earthquake Catalogue Platform 9.9.9');
    // The merge passes the platform's package version (lib/merge.ts).
    expect(QC_GENERATED_BY).toBe(`Earthquake Catalogue Platform ${packageJson.version}`);
    expect(qc.config).toEqual({ timeThreshold: 10, distanceThreshold: 10, mergeStrategy: 'quality' });
    expect(qc.sourceCatalogues).toEqual(CATALOGUES);
  });

  it('totals', () => {
    // Entries: 8 (A-B) + 3 + 2 + 1 + 1 + 1 + 2 = 18; events: 10 groups.
    expect(qc.totals).toEqual({
      entriesBefore: 18,
      eventsAfter: 10,
      matchedGroups: 7,
      entriesCombined: 8,
      flaggedGroups: 1,
      keptApartEntries: 2,
      splits: 1,
      heldForReview: 1,
      supersededEntries: 1,
    });
  });

  it('per catalogue: entries, matched, unique, published, superseded', () => {
    expect(qc.perCatalogue).toEqual([
      // A: 4 (A-B) + abc + withSuperseded + apartA + flagged = 8, of which apartA is unique.
      // Published: A-B pairs 1 and 3, withSuperseded and flagged; pair 2 lists (and so
      // publishes) B first, pair 4 publishes B; abc's epicentre is computed.
      { id: 'A', name: 'Agency A', entries: 8, matched: 7, unique: 1, published: 4, superseded: 0 },
      { id: 'B', name: 'Agency B', entries: 7, matched: 6, unique: 1, published: 2, superseded: 0 },
      { id: 'C', name: 'Agency C', entries: 3, matched: 2, unique: 1, published: 0, superseded: 1 },
    ]);
  });

  it('pairwise A-B: B minus A in source order, with the robust statistics computed by hand', () => {
    const pair = qc.pairwise[0];
    expect(pair.catalogueA).toEqual(CATALOGUES[0]);
    expect(pair.catalogueB).toEqual(CATALOGUES[1]);
    // Four A-B pairs, plus abc's and the flagged group's: dt [1, 2, 3, 10, 1, 1].
    expect(pair.pairs).toBe(6);
    // sorted [1, 1, 1, 2, 3, 10]: median 1.5; |dx| = [.5, .5, .5, .5, 1.5, 8.5] -> MAD 0.5;
    // p05 at rank 0.25 -> 1; p95 at rank 4.75 -> 3 + 0.75 * 7 = 8.25.
    expect(pair.originTime).toEqual({ n: 6, median: 1.5, robustSigma: 0.7413, p05: 1, p95: 8.25 });
    // Distances [0, .01, .02, .1, 0, 0] degrees: sorted [0, 0, 0, .01, .02, .1].
    const d = (deg: number) => deg * KM_PER_DEG;
    expect(pair.epicentre!.n).toBe(6);
    expect(pair.epicentre!.median).toBeCloseTo(d(0.005), 5);
    expect(pair.epicentre!.p90).toBeCloseTo(d(0.02 + 0.5 * 0.08), 5);
    expect(pair.epicentre!.p95).toBeCloseTo(d(0.02 + 0.75 * 0.08), 5);
    expect(pair.epicentre!.max).toBeCloseTo(d(0.1), 5);
    // Depth: the fourth pair is excluded (B's depth fixed): [2, -1, 5, 0, 0] -> sorted
    // [-1, 0, 0, 2, 5]: median 0; |dx| [1, 0, 0, 2, 5] -> MAD 1; p05 rank 0.2 -> -0.8;
    // p95 rank 3.8 -> 2 + 0.8 * 3 = 4.4.
    expect(pair.depth).toEqual({ n: 5, median: 0, robustSigma: 1.4826, p05: -0.8, p95: 4.4 });
    // Magnitude [0.1, -0.1, 0.3, 0.2, 0, 0] -> sorted [-0.1, 0, 0, 0.1, 0.2, 0.3]:
    // median 0.05; |dx| [.15, .05, .05, .05, .15, .25] -> MAD 0.1; p05 rank 0.25 -> -0.075;
    // p95 rank 4.75 -> 0.2 + 0.75 * 0.1 = 0.275.
    expect(pair.magnitude).toEqual({ n: 6, median: 0.05, robustSigma: 0.14826, p05: -0.075, p95: 0.275 });
    // Six ML/ML pairs: below QC_MIN_TYPE_PAIRS.
    expect(pair.magnitudeByType).toEqual([]);
  });

  it('pairwise A-C and B-C: a superseded entry makes no pair; a pair that never matched is listed empty', () => {
    expect(qc.pairwise.map(p => [p.catalogueA.id, p.catalogueB.id, p.pairs])).toEqual([
      ['A', 'B', 6],
      ['A', 'C', 1],
      ['B', 'C', 1],
    ]);
    const ac = qc.pairwise[1];
    expect(ac.originTime).toEqual({ n: 1, median: 2, robustSigma: 0, p05: 2, p95: 2 });

    const empty = summarise([group([entry('A')]), group([entry('B')])]);
    expect(empty.pairwise).toEqual([
      expect.objectContaining({ pairs: 0, originTime: null, epicentre: null, depth: null, magnitude: null, magnitudeByType: [] }),
      expect.objectContaining({ pairs: 0 }),
      expect.objectContaining({ pairs: 0 }),
    ]);
  });

  it('window use counts matched pairs beyond 80 % of their own windows', () => {
    // Fixed 10 s / 10 km windows: dt 10 s > 8 s once; 0.1 degree (11.1 km) > 8 km once.
    expect(qc.windowUse).toEqual({ nearTimeLimit: 1, nearDistanceLimit: 1, matchedPairs: 8 });
    // The windows come from the caller, per pair.
    const calls: Array<[string, string]> = [];
    summarise(groups, { pairWindows: (a, b) => { calls.push([a.catalogueId, b.catalogueId]); return { timeWindow: 100, distanceWindow: 100 }; } });
    expect(calls).toHaveLength(8);
    expect(calls.every(([a, b]) => a < b)).toBe(true);
  });

  it('magnitude by type pair: pairs with at least QC_MIN_TYPE_PAIRS members, largest first', () => {
    const many: QcGroupInput[] = [];
    for (let k = 0; k < 12; k++) {
      many.push(group([entry('A', { time: iso(k * 100), magnitude: 3 }), entry('B', { time: iso(k * 100), magnitude: 3.2, magnitudeType: 'Mw' })]));
    }
    for (let k = 0; k < 10; k++) {
      many.push(group([entry('A', { time: iso(5000 + k * 100), magnitude: 3 }), entry('B', { time: iso(5000 + k * 100), magnitude: 2.9 })]));
    }
    for (let k = 0; k < 3; k++) {
      many.push(group([entry('A', { time: iso(9000 + k * 100), magnitudeType: 'mb' }), entry('B', { time: iso(9000 + k * 100) })]));
    }
    const byType = summarise(many).pairwise[0].magnitudeByType;
    expect(byType.map(t => [t.typeA, t.typeB, t.stats.n, t.stats.median])).toEqual([
      ['ML', 'Mw', 12, 0.2],
      ['ML', 'ML', 10, -0.1],
    ]);
  });

  it('lists flagged, kept-apart and held groups, most severe first, a split as one unit', () => {
    expect(qc.listedGroupsTotal).toBe(3);
    expect(qc.listedGroups.map(g => [g.id, g.kinds, g.splitKey])).toEqual([
      [flagged.id, ['flagged', 'held'], null],
      [apartA.id, ['kept-apart'], 'split-1'],
      [apartB.id, ['kept-apart'], 'split-1'],
    ]);
    const [first] = qc.listedGroups;
    expect(first.reasons).toEqual(['Ambiguous association']);
    expect(first.publishedIndex).toBe(0);
    expect(first.entries[0]).toEqual({
      catalogueId: 'A', catalogueName: 'Agency A', sourceId: null, time: iso(800),
      latitude: 0, longitude: 0, depth: 10, magnitude: 4, magnitudeType: 'ML', qualityScore: null,
    });
  });

  it('orders units by severity, then discrepancy, then output order; a split unit stays together', () => {
    const salvaged = group([entry('A'), entry('B')], { flagged: true, splitKey: 'split-9', discrepancy: 0.2 });
    const lone = group([entry('C')], { keptApart: true, splitKey: 'split-9' });
    const low = group([entry('A'), entry('B')], { flagged: true, discrepancy: 0.1 });
    const high = group([entry('A'), entry('B')], { flagged: true, discrepancy: 0.9 });
    const apart = group([entry('A')], { keptApart: true });
    const listed = summarise([apart, lone, low, salvaged, high]).listedGroups.map(g => g.id);
    expect(listed).toEqual([high.id, lone.id, salvaged.id, low.id, apart.id]);
  });

  it('caps the listed groups by count and by size, and keeps the total', () => {
    const many = Array.from({ length: QC_MAX_LISTED_GROUPS + 3 }, (_, k) =>
      group([entry('A', { time: iso(k) })], { keptApart: true })
    );
    const capped = summarise(many);
    expect(capped.listedGroups).toHaveLength(QC_MAX_LISTED_GROUPS);
    expect(capped.listedGroupsTotal).toBe(QC_MAX_LISTED_GROUPS + 3);

    // 400 groups of 50 maximal reasons (~25 kB each) exceed the byte budget.
    const long = 'x'.repeat(QC_MAX_REASON_LENGTH + 100);
    const wordy = Array.from({ length: 400 }, () =>
      group([entry('A')], { flagged: true, reasons: Array.from({ length: 60 }, () => long) })
    );
    const budgeted = summarise(wordy);
    expect(budgeted.listedGroupsTotal).toBe(400);
    expect(budgeted.listedGroups.length).toBeLessThan(400);
    expect(budgeted.listedGroups.length).toBeGreaterThan(0);
    expect(JSON.stringify(budgeted.listedGroups).length).toBeLessThanOrEqual(QC_MAX_LISTED_BYTES);
    expect(budgeted.listedGroups[0].reasons).toHaveLength(50);
    expect(budgeted.listedGroups[0].reasons[0]).toHaveLength(QC_MAX_REASON_LENGTH);
    expect(budgeted.listedGroups[0].reasons[0].endsWith('…')).toBe(true);
  });

  it('is deterministic', () => {
    expect(summarise(groups)).toEqual(qc);
  });
});

describe('listed-groups CSV', () => {
  it('writes one row per entry with the documented columns', () => {
    const qc = summarise([
      group(
        [
          entry('A', { sourceId: '2024p1', qualityScore: 81.5, latitude: -41.3, longitude: 174.8, depth: 12.5, magnitude: 3.4 }),
          entry('B', { sourceId: '=cmd()', time: iso(2), depth: null, magnitude: null, magnitudeType: null }),
        ],
        { flagged: true, held: true, reasons: ['Large depth range; check it', 'Second, reason'] }
      ),
    ]);
    const csv = qcListedGroupsCsv(qc);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe(QC_CSV_COLUMNS.join(','));
    expect(QC_CSV_COLUMNS).toEqual([
      'Group ID', 'Kinds', 'Reasons', 'Published', 'Catalogue', 'Source ID', 'Origin time (UTC)',
      'Latitude', 'Longitude', 'Depth (km)', 'Magnitude', 'Magnitude type', 'Quality score',
    ]);
    const id = qc.listedGroups[0].id;
    expect(lines[1]).toBe(
      `${id},flagged; held,"Large depth range; check it | Second, reason",yes,Agency A,2024p1,2020-01-01T00:00:00.000Z,-41.3,174.8,12.5,3.4,ML,81.5`
    );
    // A formula-like source id is neutralised; missing values are empty.
    expect(lines[2]).toBe(
      `${id},flagged; held,"Large depth range; check it | Second, reason",no,Agency B,'=cmd(),2020-01-01T00:00:02.000Z,0,0,,,,`
    );
    expect(lines).toHaveLength(3);
    expect(/report/i.test(csv)).toBe(false);
  });
});

describe('pairMatchingWindows', () => {
  it('are the windows pairSeparation judges a pair by', () => {
    const a: any = { time: iso(0), latitude: -41, longitude: 174, depth: 150, magnitude: 5.0 };
    const b: any = { time: iso(5), latitude: -41.1, longitude: 174, depth: 20, magnitude: 6.2 };
    const sep = pairSeparation(a, b, 60, 50);
    expect(pairMatchingWindows(a, b, 60, 50)).toEqual({ timeWindow: sep.timeWindow, distanceWindow: sep.distanceWindow });
    // Mean magnitude 5.6 -> x2 time, x2.5 distance; depth 150 -> x1.2.
    expect(pairMatchingWindows(a, b, 60, 50)).toEqual({ timeWindow: 120, distanceWindow: 150 });
    expect(pairMatchingWindows({ magnitude: null, depth: null }, { magnitude: 3, depth: undefined }, 60, 50))
      .toEqual({ timeWindow: 60, distanceWindow: 50 });
  });
});

// ── groupMatchingEvents split keys ──────────────────────────────────────────────────────
const report = (id: string, catalogueId: string, seconds: number, magnitude: number, extra: Record<string, unknown> = {}): any => ({
  id, catalogueId, source: catalogueId, time: iso(seconds), latitude: -41, longitude: 174, depth: 10,
  magnitude, magnitude_type: 'ML', ...extra,
});
const CONFIG: any = { timeThreshold: 60, distanceThreshold: 50, mergeStrategy: 'quality', priority: 'quality' };

describe('split keys', () => {
  it('are shared by the groups one failed cluster was split into, numbered in output order', () => {
    const events = [
      // Cluster 1: A and B agree, C does not (2 magnitude units): {A, B} is salvaged and C
      // is left alone; both carry split-1.
      report('a1', 'A', 0, 3.0), report('b1', 'B', 1, 3.1), report('c1', 'C', 2, 5.0),
      // An ordinary pair: no split key.
      report('a2', 'A', 10_000, 3.0), report('b2', 'B', 10_001, 3.0),
      // Cluster 2: two irreconcilable entries, both kept apart, both split-2.
      report('a3', 'A', 20_000, 2.0), report('b3', 'B', 20_001, 4.5),
      // A lone entry nobody matched.
      report('c4', 'C', 30_000, 3.0),
    ];
    const groups = groupMatchingEvents(events, CONFIG);
    const view = groups.map(g => [g.events.map(e => e.id).join('+'), g.regrouped, g.splitKey]);
    expect(view).toEqual([
      ['a1+b1', true, 'split-1'],
      ['c1', true, 'split-1'],
      ['a2+b2', false, null],
      ['a3', true, 'split-2'],
      ['b3', true, 'split-2'],
      ['c4', false, null],
    ]);
    // Input order does not change them.
    const reversed = groupMatchingEvents(events.slice().reverse(), CONFIG);
    expect(reversed.map(g => g.splitKey)).toEqual(groups.map(g => g.splitKey));
  });
});

// ── Preview payload ─────────────────────────────────────────────────────────────────────
describe('preview payload (MergePreviewPayload)', () => {
  const sources: any[] = [
    { id: 'A', name: 'Agency A', events: 0, source: 'Agency A' },
    { id: 'B', name: 'Agency B', events: 0, source: 'Agency B' },
    { id: 'C', name: 'Agency C', events: 0, source: 'Agency C' },
  ];
  const withNames = (events: any[]) => events.map(e => ({ ...e, catalogueName: nameOf(e.catalogueId) }));

  it('lists flagged and kept-apart groups and matched groups, not lone entries; counts everything', () => {
    const events = withNames([
      report('a1', 'A', 0, 3.0, { source_id: 'A-1', depth_type: 'operator assigned', quality_score: 72 }),
      report('b1', 'B', 1, 3.1), report('c1', 'C', 2, 5.0),
      report('a2', 'A', 10_000, 3.0), report('b2', 'B', 10_001, 3.0, { latitude: -41.05 }),
      report('c4', 'C', 30_000, 3.0),
      report('c5', 'C', 40_000, 3.0),
    ]);
    const payload = buildMergePreview(events, sources, CONFIG, { A: '#000' });

    expect(Object.keys(payload).sort()).toEqual(
      ['catalogueColors', 'duplicateGroups', 'matchedListed', 'matchedTotal', 'qc', 'statistics'].sort()
    );
    // Statistics exactly as before: every group counts.
    expect(payload.statistics).toEqual({
      totalEventsBefore: 7,
      totalEventsAfter: 5,
      duplicateGroupsCount: 2,
      duplicatesRemoved: 2,
      suspiciousGroupsCount: 1,
      heldForReviewCount: 0,
      supersededReportsCount: 0,
      separatedReportsCount: 1,
    });
    expect(payload.catalogueColors).toEqual({ A: '#000' });
    // The salvaged pair and the lone C (one split), and the ordinary matched pair; the two
    // never-matched C entries are not listed.
    expect(payload.duplicateGroups.map(g => g.events.map(e => e.id))).toEqual([['a1', 'b1'], ['c1'], ['a2', 'b2']]);
    expect(payload.matchedListed).toBe(1);
    expect(payload.matchedTotal).toBe(1);

    const [salvaged, lone, matched] = payload.duplicateGroups;
    expect(salvaged).toMatchObject({ id: 'group-0', isSuspicious: true, separated: false, splitKey: 'split-1' });
    expect(lone).toMatchObject({ id: 'group-1', isSuspicious: false, separated: true, splitKey: 'split-1', discrepancy: 0 });
    expect(lone.spread).toEqual({ timeS: 0, distanceKm: 0, depthKm: null, magnitude: null });
    expect(matched).toMatchObject({ id: 'group-2', splitKey: null, heldForReview: false });
    for (const g of payload.duplicateGroups) {
      expect(Object.keys(g).sort()).toEqual([
        'computedEpicentre', 'discrepancy', 'events', 'heldForReview', 'id', 'isSuspicious', 'selectedEventIndex',
        'separated', 'splitKey', 'spread', 'supersededEventIndexes', 'validationWarnings',
      ]);
    }
    // Entries carry the source id, the depth type and the stored quality score.
    expect(salvaged.events[0]).toMatchObject({
      id: 'a1', source_id: 'A-1', depth_type: 'operator assigned', quality_score: 72,
      catalogueId: 'A', catalogueName: 'Agency A', source: 'A', magnitude_type: 'ML',
    });

    // Spread and discrepancy of the matched pair, against the published entry: 1 s and
    // 0.05 degrees of latitude, in 60 s / 50 km windows (M3, 10 km deep: no widening).
    const km = 0.05 * KM_PER_DEG;
    expect(matched.spread).toEqual({ timeS: 1, distanceKm: Number(km.toFixed(3)), depthKm: 0, magnitude: 0 });
    expect(matched.discrepancy).toBeCloseTo(km / 50, 4);

    // The QC summary covers every entry, listed or not.
    expect(payload.qc.totals).toMatchObject({ entriesBefore: 7, eventsAfter: 5, matchedGroups: 2, keptApartEntries: 1, splits: 1 });
    expect(payload.qc.listedGroups.map(g => g.id)).toEqual(['group-0', 'group-1']);
    expect(payload.qc.sourceCatalogues).toEqual(CATALOGUES);
  });

  it('lists at most QC_PREVIEW_MAX_MATCHED matched groups, the largest discrepancy first', () => {
    const total = QC_PREVIEW_MAX_MATCHED + 3;
    const events: any[] = [];
    for (let k = 0; k < total; k++) {
      // Each pair an hour apart; B's offset grows with k, so the last pairs disagree most.
      events.push(report(`a${k}`, 'A', k * 3600, 3.0), report(`b${k}`, 'B', k * 3600, 3.0, { latitude: -41 - k * 1e-5 }));
    }
    events.push(report('lone', 'C', total * 3600, 3.0));
    const payload = buildMergePreview(withNames(events), sources, CONFIG, {});
    expect(payload.matchedTotal).toBe(total);
    expect(payload.matchedListed).toBe(QC_PREVIEW_MAX_MATCHED);
    expect(payload.duplicateGroups).toHaveLength(QC_PREVIEW_MAX_MATCHED);
    // The three smallest discrepancies (the first three pairs) are the ones left out; the
    // list stays in output order.
    expect(payload.duplicateGroups[0].events.map(e => e.id)).toEqual(['a3', 'b3']);
    const ids = payload.duplicateGroups.map(g => Number(g.id.slice('group-'.length)));
    expect(ids).toEqual(ids.slice().sort((x, y) => x - y));
    expect(payload.statistics.totalEventsAfter).toBe(total + 1);
    expect(payload.qc.totals.matchedGroups).toBe(total);
  });

  it('previewMerge returns the payload for catalogues read from the database', async () => {
    const db = dbQueries as unknown as Record<string, jest.Mock>;
    const rows: Record<string, any[]> = {
      A: [{ id: 'x1', catalogue_id: 'A', time: iso(0), latitude: -41, longitude: 174, depth: 10, magnitude: 4, magnitude_type: 'ML', quality_score: 90 }],
      B: [{ id: 'x2', catalogue_id: 'B', time: iso(1), latitude: -41.01, longitude: 174.01, depth: 11, magnitude: 4.1, magnitude_type: 'ML' }],
      C: [{ id: 'x3', catalogue_id: 'C', time: iso(99_999), latitude: -38, longitude: 176, depth: 5, magnitude: 2, magnitude_type: 'ML' }],
    };
    db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
      data: rows[id] ?? [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
    }));
    db.getCatalogueById.mockImplementation(async (id: string) => ({ id, status: 'complete' }));

    const payload = await previewMerge(sources, CONFIG);
    expect(payload.duplicateGroups).toHaveLength(1);
    expect(payload.duplicateGroups[0].events.map(e => [e.id, e.catalogueName, e.quality_score ?? null])).toEqual([
      ['x1', 'Agency A', 90],
      ['x2', 'Agency B', null],
    ]);
    expect(payload.statistics.totalEventsBefore).toBe(3);
    expect(payload.qc.perCatalogue.map(c => [c.id, c.entries, c.matched, c.unique])).toEqual([
      ['A', 1, 1, 0], ['B', 1, 1, 0], ['C', 1, 0, 1],
    ]);
    expect(payload.qc.config).toEqual(CONFIG);
  });
});
