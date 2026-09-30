/** @jest-environment node */

/**
 * Per-field resolution rules (contract M1): the depth, magnitude and focal mechanism of a
 * merged event may each be taken from a differently chosen report than the epicentre, on
 * top of whatever strategy picked the base record. Metadata always travels with the value
 * it describes, the provenance flags name the report each quantity came from, and a rule
 * that cannot be applied (no such catalogue in the group, a report without the quantity)
 * falls back to the strategy's own behaviour. Without rules nothing changes.
 */

import { mergeEventGroup, buildMergedEventFields, unionMergeFields, OPTIONAL_DB_FIELDS } from '@/lib/merge';
import { validateMergeRequest } from '@/lib/validation';

const report = (id: string, catalogue: string, extra: Record<string, unknown> = {}): any => ({
  id, catalogueId: catalogue, source: catalogue, time: '2020-01-01T00:00:00.000Z',
  latitude: -42, longitude: 173, depth: 10, magnitude: 4, magnitude_type: 'ML', ...extra,
});

// GeoNet: the better-located solution (quality strategy publishes it) with a loose depth
// and a first-motion mechanism. ISC: a worse location, a tighter depth, an Mw and a GCMT
// moment tensor it carries as a supplementary product.
const geonet = report('g', 'cat-gn', {
  source: 'GeoNet', agency_id: 'WEL', depth: 12, depth_type: 'from location', depth_uncertainty: 8,
  magnitude: 4.1, magnitude_type: 'ML', magnitude_uncertainty: 0.2, magnitude_station_count: 20,
  preferred_magnitude_id: 'smi:geonet/mag/1', used_station_count: 40, azimuthal_gap: 60, standard_error: 0.3,
  evaluation_status: 'reviewed', creation_info: JSON.stringify({ creationTime: '2020-01-01T01:00:00.000Z' }),
  focal_mechanisms: JSON.stringify([{ publicID: 'fm-gn', stationPolarityCount: 30, evaluationMode: 'manual' }]),
  preferred_focal_mechanism_id: 'fm-gn',
});
const isc = report('i', 'cat-isc', {
  source: 'ISC', agency_id: 'ISC', time: '2020-01-01T00:00:01.000Z', latitude: -42.01, longitude: 173.02,
  depth: 20, depth_type: 'from location', depth_uncertainty: 1,
  magnitude: 4.4, magnitude_type: 'Mw', magnitude_uncertainty: 0.1, magnitude_station_count: 55,
  preferred_magnitude_id: 'smi:isc/mag/9', used_station_count: 10, azimuthal_gap: 150, standard_error: 0.9,
  evaluation_status: 'preliminary', creation_info: JSON.stringify({ creationTime: '2020-06-01T00:00:00.000Z' }),
  focal_mechanisms: JSON.stringify([{ publicID: 'fm-gcmt', momentTensor: { varianceReduction: 0.8 }, creationInfo: { agencyID: 'GCMT' } }]),
  preferred_focal_mechanism_id: 'fm-gcmt',
});
const QUALITY = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };
const merge = (fieldRules: Record<string, unknown> | undefined, strategy: Record<string, unknown> = QUALITY) =>
  mergeEventGroup([geonet, isc], { ...strategy, fieldRules } as any);
const flagged = (merged: any, flag: string) =>
  merged.sourceEvents.filter((s: any) => s[flag] === true).map((s: any) => s.originalData.id);

describe('depth rules', () => {
  it('quality strategy without a rule publishes the base report and its own depth (unchanged)', () => {
    const merged: any = merge(undefined);
    expect(flagged(merged, 'selected')).toEqual(['g']);
    expect([merged.depth, merged.depth_type, merged.depth_uncertainty]).toEqual([12, 'from location', 8]);
    expect(flagged(merged, 'depthSelected')).toEqual([]);
  });

  it("'catalogue' publishes the named report's depth WITH its own metadata and flags that report", () => {
    const merged: any = merge({ depth: { rule: 'catalogue', catalogueId: 'cat-isc' } });
    expect(flagged(merged, 'selected')).toEqual(['g']); // the epicentre is still GeoNet's
    expect([merged.depth, merged.depth_type, merged.depth_uncertainty]).toEqual([20, 'from location', 1]);
    expect(flagged(merged, 'depthSelected')).toEqual(['i']);
    const row: any = buildMergedEventFields(merged, OPTIONAL_DB_FIELDS);
    expect([row.depth, row.depth_uncertainty, row.latitude]).toEqual([20, 1, -42]);
  });

  it("'best-constrained' takes the depth with the tightest uncertainty band", () => {
    const merged: any = merge({ depth: { rule: 'best-constrained' } });
    expect(merged.depth).toBe(20);
    expect(flagged(merged, 'depthSelected')).toEqual(['i']);
  });

  it("'newest' takes the most recently determined report's depth", () => {
    const merged: any = merge({ depth: { rule: 'newest' } });
    expect(merged.depth).toBe(20);
    expect(flagged(merged, 'depthSelected')).toEqual(['i']);
  });

  it("'authority' takes the depth from the authoritative network (GeoNet inside NZ)", () => {
    const merged: any = merge({ depth: { rule: 'authority' } }, { ...QUALITY, mergeStrategy: 'newest' });
    expect(flagged(merged, 'selected')).toEqual(['i']); // newest publishes ISC
    expect([merged.depth, merged.depth_uncertainty]).toEqual([12, 8]); // but the depth is GeoNet's
    expect(flagged(merged, 'depthSelected')).toEqual(['g']);
  });

  it('falls back to the strategy when the named catalogue is absent or its report has no depth', () => {
    const absent: any = merge({ depth: { rule: 'catalogue', catalogueId: 'cat-none' } });
    expect([absent.depth, absent.depth_uncertainty]).toEqual([12, 8]);
    expect(flagged(absent, 'depthSelected')).toEqual([]);

    const noDepth: any = mergeEventGroup([geonet, { ...isc, depth: null }], {
      ...QUALITY, fieldRules: { depth: { rule: 'catalogue', catalogueId: 'cat-isc' } },
    } as any);
    expect([noDepth.depth, noDepth.depth_uncertainty]).toEqual([12, 8]);
    expect(flagged(noDepth, 'depthSelected')).toEqual([]);
  });

  it("a depth rule on the averaged strategy replaces the best-constrained depth's metadata too", () => {
    const merged: any = merge({ depth: { rule: 'catalogue', catalogueId: 'cat-gn' } }, { ...QUALITY, mergeStrategy: 'average' });
    expect([merged.depth, merged.depth_uncertainty]).toEqual([12, 8]);
    expect(flagged(merged, 'depthSelected')).toEqual(['g']);
    expect(flagged(merged, 'selected')).toEqual([]);
  });
});

describe('magnitude rules', () => {
  it("'catalogue' publishes the named report's own preferred magnitude, metadata and pointer", () => {
    const merged: any = merge({ magnitude: { rule: 'catalogue', catalogueId: 'cat-isc' } });
    expect([merged.magnitude, merged.magnitude_type, merged.magnitude_uncertainty, merged.magnitude_station_count])
      .toEqual([4.4, 'Mw', 0.1, 55]);
    expect(merged.preferred_magnitude_id).toBe('smi:isc/mag/9');
    expect(flagged(merged, 'magnitudeSelected')).toEqual(['i']);
    // The epicentre and its origin metadata are still GeoNet's.
    expect([merged.latitude, merged.used_station_count]).toEqual([-42, 40]);
  });

  it("'type-preference' applies the size-aware type hierarchy to a base-report strategy", () => {
    const merged: any = merge({ magnitude: { rule: 'type-preference' } });
    expect([merged.magnitude, merged.magnitude_type]).toEqual([4.4, 'Mw']);
    expect(flagged(merged, 'magnitudeSelected')).toEqual(['i']);
  });

  it("'quality' / 'authority' / 'newest' pick a report and publish its magnitude", () => {
    expect(merge({ magnitude: { rule: 'newest' } }).magnitude).toBe(4.4);
    expect(merge({ magnitude: { rule: 'authority' } }).magnitude).toBe(4.1);
    expect(merge({ magnitude: { rule: 'quality' } }).magnitude).toBe(4.1);
  });

  it('a magnitude rule on the averaged strategy overrides its type preference', () => {
    const merged: any = merge({ magnitude: { rule: 'catalogue', catalogueId: 'cat-gn' } }, { ...QUALITY, mergeStrategy: 'average' });
    expect([merged.magnitude, merged.magnitude_type, merged.magnitude_station_count]).toEqual([4.1, 'ML', 20]);
    expect(flagged(merged, 'magnitudeSelected')).toEqual(['g']);
  });

  it('falls back to the strategy when the named report has no magnitude', () => {
    const merged: any = mergeEventGroup([geonet, { ...isc, magnitude: null }], {
      ...QUALITY, fieldRules: { magnitude: { rule: 'catalogue', catalogueId: 'cat-isc' } },
    } as any);
    expect([merged.magnitude, merged.magnitude_type]).toEqual([4.1, 'ML']);
  });
});

describe('mechanism rules', () => {
  const mechanisms = (merged: any) => JSON.parse(merged.focal_mechanisms).map((fm: any) => fm.publicID);

  it("'hierarchy' (the default) keeps every mechanism with the moment tensor preferred", () => {
    const merged: any = merge(undefined);
    expect(mechanisms(merged)).toEqual(['fm-gcmt', 'fm-gn']);
    expect(merged.preferred_focal_mechanism_id).toBe('fm-gcmt');
    expect(flagged(merged, 'mechanismSelected')).toEqual([]);
  });

  it("'strategy' publishes only the base report's own mechanisms", () => {
    const merged: any = merge({ mechanism: { rule: 'strategy' } });
    expect(mechanisms(merged)).toEqual(['fm-gn']);
    expect(merged.preferred_focal_mechanism_id).toBe('fm-gn');
    expect(flagged(merged, 'mechanismSelected')).toEqual(['g']);
  });

  it("'catalogue' publishes only the named report's mechanisms", () => {
    const merged: any = merge({ mechanism: { rule: 'catalogue', catalogueId: 'cat-isc' } });
    expect(mechanisms(merged)).toEqual(['fm-gcmt']);
    expect(flagged(merged, 'mechanismSelected')).toEqual(['i']);
  });

  it('falls back to the hierarchy when the chosen report stored no mechanism', () => {
    const bare = { ...geonet, focal_mechanisms: undefined, preferred_focal_mechanism_id: undefined };
    const merged: any = mergeEventGroup([bare, isc], { ...QUALITY, fieldRules: { mechanism: { rule: 'strategy' } } } as any);
    expect(mechanisms(merged)).toEqual(['fm-gcmt']);
    expect(flagged(merged, 'mechanismSelected')).toEqual([]);
  });

  it('unionMergeFields without options behaves as before', () => {
    const base: any = { ...geonet, sourceEvents: [{ catalogueId: 'cat-gn', source: 'GeoNet', originalData: geonet, selected: true }, { catalogueId: 'cat-isc', source: 'ISC', originalData: isc }] };
    expect(JSON.parse((unionMergeFields(base, [geonet, isc]) as any).focal_mechanisms)).toHaveLength(2);
  });
});

describe('the rules leave the defaults untouched', () => {
  it("omitted rules and explicit 'strategy' / 'hierarchy' produce the same record", () => {
    const strip = (m: any) => {
      const { merge_parameters: _p, ...rest } = m;
      return rest;
    };
    const explicit = merge({ depth: { rule: 'strategy' }, magnitude: { rule: 'strategy' }, mechanism: { rule: 'hierarchy' } });
    expect(strip(explicit)).toEqual(strip(merge(undefined)));
  });

  it('merge_parameters records the rules, the conflict policy and the authority table', () => {
    const rules = { depth: { rule: 'catalogue', catalogueId: 'cat-isc' }, magnitude: { rule: 'type-preference' } };
    const withRules = JSON.parse(merge(rules).merge_parameters as string);
    expect(withRules).toMatchObject({ mergeStrategy: 'quality', fieldRules: rules, onConflict: 'resolve', authority: 'default' });
    const without = JSON.parse(merge(undefined).merge_parameters as string);
    expect(without.fieldRules).toBeUndefined();
    expect(without).toMatchObject({ onConflict: 'resolve', authority: 'default' });
  });
});

describe('request validation (M1)', () => {
  const request = (config: Record<string, unknown>) => validateMergeRequest({
    name: 'Merged',
    sourceCatalogues: [
      { id: 'cat-gn', name: 'GeoNet', events: 1, source: 'GeoNet' },
      { id: 'cat-isc', name: 'ISC', events: 1, source: 'ISC' },
    ],
    config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality', ...config },
  });
  const messages = (result: ReturnType<typeof validateMergeRequest>) =>
    result.errors?.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) ?? [];

  it('accepts every rule, the median strategy and the hold policy', () => {
    const result = request({
      mergeStrategy: 'median',
      onConflict: 'hold',
      fieldRules: {
        depth: { rule: 'catalogue', catalogueId: 'cat-isc' },
        magnitude: { rule: 'type-preference' },
        mechanism: { rule: 'hierarchy' },
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.config.fieldRules?.depth).toEqual({ rule: 'catalogue', catalogueId: 'cat-isc' });
    expect(result.data?.config.onConflict).toBe('hold');
  });

  it("rejects a 'catalogue' rule without a catalogue id", () => {
    const result = request({ fieldRules: { depth: { rule: 'catalogue' } } });
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual(["config.fieldRules.depth.catalogueId: rule 'catalogue' requires a catalogueId"]);
  });

  it("rejects a 'catalogue' rule naming a catalogue that is not being merged", () => {
    const result = request({ fieldRules: { magnitude: { rule: 'catalogue', catalogueId: 'cat-usgs' } } });
    expect(result.success).toBe(false);
    expect(messages(result)).toEqual([
      'config.fieldRules.magnitude.catalogueId: fieldRules.magnitude names catalogue "cat-usgs", which is not one of the source catalogues',
    ]);
  });

  it('rejects unknown rules and policies', () => {
    expect(request({ fieldRules: { depth: { rule: 'average' } } }).success).toBe(false);
    expect(request({ fieldRules: { mechanism: { rule: 'quality' } } }).success).toBe(false);
    expect(request({ onConflict: 'ignore' }).success).toBe(false);
  });
});
