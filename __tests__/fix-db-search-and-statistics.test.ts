/**
 * @jest-environment node
 *
 * #57  'With Uncertainty' counted only latitude/longitude marginals, so GeoNet and
 *      USGS catalogues (horizontal_uncertainty / depth_uncertainty) reported 0%.
 * #58  /api/events/search passed an unbounded limit (0 = no limit) to the driver and
 *      loaded whole documents.
 * #59  Search silently dropped negative magnitude/depth and operator date tokens.
 *
 * The statistics pipeline is evaluated with a small evaluator for the aggregation
 * operators it uses, following MongoDB's rules (a missing field compares below every
 * number; $isNumber is false for missing and null).
 */

import { NextRequest, NextResponse } from 'next/server';

type Doc = Record<string, any>;

const eventsFind = jest.fn();
const cataloguesFind = jest.fn();
const aggregate = jest.fn();
jest.mock('@/lib/mongodb', () => ({
  COLLECTIONS: jest.requireActual('@/lib/mongodb').COLLECTIONS,
  getCollection: jest.fn(async (name: string) => (name === 'merged_catalogues'
    ? { find: cataloguesFind }
    : { find: eventsFind, aggregate })),
  getDb: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('@/lib/auth/middleware', () => ({ requireViewer: jest.fn() }));

import { dbQueries, MAX_SEARCH_RESULTS } from '@/lib/db';
import { requireViewer } from '@/lib/auth/middleware';
import { GET as search } from '@/app/api/events/search/route';

const cursorOf = (docs: Doc[]) => {
  const cursor: any = {};
  cursor.sort = jest.fn(() => cursor);
  cursor.limit = jest.fn(() => cursor);
  cursor.toArray = jest.fn(async () => docs);
  return cursor;
};

// --- aggregation expression evaluator -------------------------------------
function rank(v: unknown) { return v === undefined || v === null ? 0 : typeof v === 'number' ? 1 : 2; }
function cmp(a: any, b: any) { return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0); }
function evalAgg(expr: any, doc: Doc): any {
  if (typeof expr === 'string' && expr.startsWith('$')) return doc[expr.slice(1)];
  if (expr === null || typeof expr !== 'object' || Array.isArray(expr)) return expr;
  const [op, arg] = Object.entries(expr)[0] as [string, any];
  switch (op) {
    case '$cond': return evalAgg(arg[0], doc) ? evalAgg(arg[1], doc) : evalAgg(arg[2], doc);
    case '$or': return arg.some((a: any) => evalAgg(a, doc));
    case '$and': return arg.every((a: any) => evalAgg(a, doc));
    case '$isNumber': return typeof evalAgg(arg, doc) === 'number';
    case '$gte': return cmp(evalAgg(arg[0], doc), evalAgg(arg[1], doc)) >= 0;
    case '$ne': return cmp(evalAgg(arg[0], doc), evalAgg(arg[1], doc)) !== 0;
    case '$ifNull': { const v = evalAgg(arg[0], doc); return v === undefined || v === null ? evalAgg(arg[1], doc) : v; }
    default: throw new Error(`evaluator: unsupported ${op}`);
  }
}
const sumOver = (accumulator: any, docs: Doc[]) => docs.reduce((n, d) => n + evalAgg(accumulator.$sum, d), 0);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  (requireViewer as jest.Mock).mockResolvedValue({ user: { id: 'viewer-1', role: 'viewer' } });
});
afterEach(() => jest.restoreAllMocks());

describe('#57 :: catalogue statistics count every form of location uncertainty', () => {
  const docs: Doc[] = [
    { id: 'geonet', horizontal_uncertainty: 1.2, depth_uncertainty: 2.1 }, // QuakeML OriginUncertainty
    { id: 'usgs', horizontal_uncertainty: 0.4 },                           // ComCat horizontalError
    { id: 'isc', max_horizontal_uncertainty: 5, min_horizontal_uncertainty: 2 }, // smaj / smin
    { id: 'marginals', latitude_uncertainty: 0.01, longitude_uncertainty: 0.02 },
    { id: 'depth-only', depth_uncertainty: 1 },
    { id: 'none' },
    { id: 'sentinel', horizontal_uncertainty: -999, depth_uncertainty: null },
  ];

  it('counts horizontal (any form) or depth uncertainty, and reports each separately', async () => {
    aggregate.mockReturnValueOnce({ toArray: async () => [{ overall: [], magnitudeTypes: [] }] });
    await dbQueries!.getCatalogueEventStatistics('cat');
    const group = aggregate.mock.calls[0][0][1].$facet.overall[0].$group;

    expect(sumOver(group.eventsWithUncertainty, docs)).toBe(5);
    expect(sumOver(group.eventsWithHorizontalUncertainty, docs)).toBe(4);
    expect(sumOver(group.eventsWithDepthUncertainty, docs)).toBe(2);
  });

  it('passes the counts through the aggregation result', async () => {
    aggregate
      .mockReturnValueOnce({ toArray: async () => [{
        overall: [{ eventCount: 7, magnitudeCount: 0, depthCount: 0, eventsWithUncertainty: 5,
          eventsWithHorizontalUncertainty: 4, eventsWithDepthUncertainty: 2, eventsWithFocalMechanism: 0,
          qualityScoreCount: 2, averageQualityScore: 55 }],
        magnitudeTypes: [],
        qualityGrades: [{ _id: 'C', count: 1 }, { _id: 'A+', count: 1 }],
      }] });
    const stats = await dbQueries!.getCatalogueEventStatistics('cat');
    expect(stats).toMatchObject({
      eventsWithUncertainty: 5, eventsWithHorizontalUncertainty: 4, eventsWithDepthUncertainty: 2,
      qualityScoreCount: 2, averageQualityScore: 55,
      qualityGrades: [{ grade: 'A+', count: 1 }, { grade: 'C', count: 1 }],
    });
  });
});

describe('#58 / #59 :: global event search', () => {
  const liveCatalogues = [{ id: 'cat-1', name: 'GeoNet' }];
  const run = (qs: string) => search(new NextRequest(`http://localhost/api/events/search?${qs}`));

  beforeEach(() => {
    eventsFind.mockImplementation(() => cursorOf([
      { id: 'e1', catalogue_id: 'cat-1', time: '2024-02-01T00:00:00.000Z', magnitude: 0, region: 'Taupo' },
      { id: 'orphan', catalogue_id: 'deleted-cat', time: '2024-01-01T00:00:00.000Z', magnitude: 2, region: 'Taupo' },
    ]));
    cataloguesFind.mockImplementation((filter: Doc) => cursorOf(
      liveCatalogues.filter((c) => !filter.id || filter.id.$in.includes(c.id))));
  });

  it.each(['limit=0', 'limit=-5', 'limit=abc', 'limit=2.5'])('answers 400 for %s', async (qs) => {
    const response = await run(`q=taupo&${qs}`);
    expect(response.status).toBe(400);
    expect(eventsFind).not.toHaveBeenCalled();
  });

  it('caps a large limit, and fetches only the fields the result carries', async () => {
    await run('q=taupo&limit=1000000');
    const cursor = eventsFind.mock.results[0].value;
    expect(cursor.limit).toHaveBeenCalledWith(MAX_SEARCH_RESULTS);
    const projection = eventsFind.mock.calls[0][1].projection;
    expect(projection).toMatchObject({ _id: 0, id: 1, time: 1, magnitude: 1 });
    expect(projection.picks).toBeUndefined();
    expect(Object.values(projection).every((v) => v === 0 || v === 1)).toBe(true);
    expect(Object.keys(projection)).not.toContain('origins');
  });

  it('refuses an out-of-range limit in the database layer too', async () => {
    await expect(dbQueries!.searchEvents('taupo', 0)).rejects.toThrow(/limit/);
    await expect(dbQueries!.searchEvents('taupo', MAX_SEARCH_RESULTS + 1)).rejects.toThrow(/limit/);
  });

  it('keeps negative magnitude and depth bounds', async () => {
    await run('q=' + encodeURIComponent('mag:-0.5..1 depth:-2..5 region:Taupo'));
    const query = eventsFind.mock.calls[0][0];
    expect(query.$and).toEqual(expect.arrayContaining([
      { magnitude: { $gte: -0.5, $lte: 1 } },
      { depth: { $gte: -2, $lte: 5 } },
    ]));
    eventsFind.mockClear();
    await run('q=' + encodeURIComponent('mag:>=-1 region:Taupo'));
    expect(eventsFind.mock.calls[0][0].$and).toContainEqual({ magnitude: { $gte: -1 } });
  });

  it.each([
    ['date:>2024-01-01', { $gte: '2024-01-02T00:00:00.000Z' }],
    ['date:>=2024', { $gte: '2024-01-01T00:00:00.000Z' }],
    ['date:<2020-05', { $lt: '2020-05-01T00:00:00.000Z' }],
    ['date:<=2020-05', { $lt: '2020-06-01T00:00:00.000Z' }],
    ['date:2023..2024-06-30', { $gte: '2023-01-01T00:00:00.000Z', $lt: '2024-07-01T00:00:00.000Z' }],
  ])('applies the date token %s', async (token, expected) => {
    await run('q=' + encodeURIComponent(`${token} region:Taupo`));
    expect(eventsFind.mock.calls[0][0].$and).toContainEqual({ time: expected });
  });

  it.each(['mag:abc', 'depth:>>3', 'date:2024-13-01', 'date:2024-02-30', 'date:yesterday'])(
    'answers 400 for the unparseable token %s instead of ignoring it', async (token) => {
      const response = await run('q=' + encodeURIComponent(`${token} region:Taupo`));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/Invalid/);
      expect(eventsFind).not.toHaveBeenCalled();
    });

  it('labels an M0.0 event with its magnitude and leaves out events whose catalogue is gone', async () => {
    const body = await (await run('q=taupo')).json();
    expect(body.results.map((r: Doc) => r.id)).toEqual(['e1']);
    expect(body.results[0].label).toMatch(/^M0 /);
  });

  it('finds an event by the agency\'s own event ID (source_id), as free text and as an id: token', async () => {
    await run('q=2016p858000');
    expect(eventsFind.mock.calls[0][0].$and[0].$or).toContainEqual({ source_id: /2016p858000/i });
    eventsFind.mockClear();
    await run('q=' + encodeURIComponent('id:2016p858000'));
    expect(eventsFind.mock.calls[0][0].$and[0].$or).toContainEqual({ source_id: /2016p858000/i });
  });

  it('still requires a viewer', async () => {
    (requireViewer as jest.Mock).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 401 }));
    expect((await run('q=taupo')).status).toBe(401);
  });
});
