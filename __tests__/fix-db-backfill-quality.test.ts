/**
 * @jest-environment node
 *
 * Contract C1 / findings #65 and #135: rows stored before quality scores were
 * persisted have none. scripts/backfill-quality-scores.ts scores them exactly as an
 * insert would, is a dry run unless --apply is given, and is idempotent.
 */

jest.mock('dotenv/config', () => ({}));

type Doc = Record<string, any>;
const GRADES = ['A+', 'A', 'B+', 'B', 'C', 'D', 'F'];

// Just the filter shapes the script uses: {}, and the $or of "no valid stored score".
const needsScore = (d: Doc) =>
  typeof d.quality_score !== 'number' || Number.isNaN(d.quality_score) || !GRADES.includes(d.quality_grade);

const events: { docs: Doc[]; find: jest.Mock; bulkWrite: jest.Mock } = {
  docs: [],
  find: jest.fn((filter: Doc) => {
    const rows: Doc[] = events.docs.filter((d: Doc) => (Object.keys(filter).length === 0 ? true : needsScore(d)));
    return (async function* () { for (const row of rows) yield { ...row }; })();
  }),
  bulkWrite: jest.fn(async (ops: Doc[]) => {
    for (const op of ops) {
      const doc = events.docs.find((d: Doc) => d._id === op.updateOne.filter._id)!;
      Object.assign(doc, op.updateOne.update.$set);
    }
    return { ok: 1 };
  }),
};
const generations = { bulkWrite: jest.fn(async () => ({ ok: 1 })) };
const fakeDb = { databaseName: 'fake', collection: (name: string) => (name === 'merged_events' ? events : generations) };

jest.mock('@/lib/mongodb', () => ({
  COLLECTIONS: jest.requireActual('@/lib/mongodb').COLLECTIONS,
  getCollection: jest.fn(async (name: string) => fakeDb.collection(name)),
  getDb: jest.fn(async () => fakeDb),
  closeConnection: jest.fn(async () => undefined),
  withTransaction: jest.fn(),
}));

import { backfillQualityScores } from '../scripts/backfill-quality-scores';
import { calculateQualityScore, metricsFromEvent } from '@/lib/quality-scoring';

const row = (id: number, extra: Doc = {}) => ({
  _id: id, id: `e${id}`, catalogue_id: id < 3 ? 'cat-a' : 'cat-b', latitude: -41, ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  events.docs = [
    row(1, { horizontal_uncertainty: 1, azimuthal_gap: 70, used_station_count: 30, evaluation_status: 'reviewed' }),
    row(2), // legacy: nothing to score from but defaults
    row(3, { quality_score: 55, quality_grade: 'C' }), // already scored
    row(4, { quality_score: 80 }), // grade missing
  ];
});

describe('C1 :: scripts/backfill-quality-scores.ts', () => {
  const quiet = { log: () => undefined };

  it('reports without writing by default', async () => {
    const report = await backfillQualityScores(fakeDb as any, quiet);
    expect(report).toMatchObject({ examined: 3, changed: 3, applied: false, byCatalogue: { 'cat-a': 2, 'cat-b': 1 } });
    expect(events.bulkWrite).not.toHaveBeenCalled();
    expect(events.docs[0].quality_score).toBeUndefined();
  });

  it('stores what an insert would compute, then finds nothing left to do', async () => {
    await backfillQualityScores(fakeDb as any, { ...quiet, apply: true });
    for (const doc of events.docs.slice(0, 2)) {
      const expected = calculateQualityScore(metricsFromEvent(doc));
      expect(doc).toMatchObject({ quality_score: expected.overall, quality_grade: expected.grade });
    }
    // A missing grade is re-derived together with the score.
    const recomputed = calculateQualityScore(metricsFromEvent(events.docs[3]));
    expect(events.docs[3]).toMatchObject({ quality_score: recomputed.overall, quality_grade: recomputed.grade });
    expect(events.docs[2]).toMatchObject({ quality_score: 55, quality_grade: 'C' }); // untouched
    // Running servers are told to drop cached pages of the catalogues touched.
    expect(generations.bulkWrite).toHaveBeenCalled();

    events.bulkWrite.mockClear();
    const rerun = await backfillQualityScores(fakeDb as any, { ...quiet, apply: true });
    expect(rerun).toMatchObject({ examined: 0, changed: 0 });
    expect(events.bulkWrite).not.toHaveBeenCalled();
  });

  it('with --all re-derives every score, changing only those that differ', async () => {
    await backfillQualityScores(fakeDb as any, { ...quiet, apply: true });
    const report = await backfillQualityScores(fakeDb as any, { ...quiet, apply: true, all: true });
    expect(report.examined).toBe(4);
    const expected = calculateQualityScore(metricsFromEvent(events.docs[2]));
    expect(events.docs[2]).toMatchObject({ quality_score: expected.overall, quality_grade: expected.grade });
  });
});
