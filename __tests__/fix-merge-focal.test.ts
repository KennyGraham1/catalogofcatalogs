/** @jest-environment node */

/**
 * Finding #30: focal-mechanism authority never ran on stored data. selectBestFocalMechanism
 * read only parsed QuakeML, which stored rows never carry, so the merged row kept whichever
 * single mechanism list its base row happened to hold. Every stored mechanism (the
 * focal_mechanisms JSON column) is now kept, with its publicID, ordered by the white-paper
 * hierarchy (publication/merge_strategies.tex §Focal mechanism: GCMT > USGS/NEIC >
 * GEOFON/GFZ > GeoNet CMT > INGV CMT > first motions with >= 20 polarities > automated
 * first motions), and the best is the preferred mechanism.
 */

import { mergeEventGroup, buildMergedEventFields, selectBestFocalMechanism } from '@/lib/merge';

const FM_FIELDS = ['focal_mechanisms', 'preferred_focal_mechanism_id'];
const config = (extra: Record<string, unknown>): any => ({ timeThreshold: 60, distanceThreshold: 50, ...extra });

const row = (id: string, source: string, mechanisms: any[], extra: Record<string, unknown> = {}): any => ({
  id, source, catalogueId: `cat-${id}`, time: '2016-11-13T11:02:56.000Z',
  latitude: -42.7, longitude: 173.0, depth: 15, magnitude: 7.8, magnitude_type: 'Mw',
  focal_mechanisms: JSON.stringify(mechanisms),
  preferred_focal_mechanism_id: mechanisms[0]?.publicID ?? null,
  ...extra,
});

const geonetFm = { publicID: 'smi:nz.org.geonet/fm/1', stationPolarityCount: 6, evaluationMode: 'manual' };
const gcmtFm = {
  publicID: 'smi:org.gcmt/fm/1', evaluationStatus: 'reviewed',
  momentTensor: { varianceReduction: 0.9 }, creationInfo: { agencyID: 'GCMT' },
};

describe('#30 every stored mechanism survives the merge, preferred by the documented hierarchy', () => {
  const geonet = row('gn', 'GeoNet', [geonetFm]);
  const gcmt = row('gcmt', 'GCMT', [gcmtFm]);

  it.each([
    [{ mergeStrategy: 'priority', priority: 'geonet' }],
    [{ mergeStrategy: 'priority', priority: 'newest' }],
    [{ mergeStrategy: 'quality', priority: 'newest' }],
    [{ mergeStrategy: 'complete', priority: 'newest' }],
    [{ mergeStrategy: 'average', priority: 'newest' }],
  ])('keeps both agencies\' mechanisms and prefers the GCMT one (%o)', (strategy) => {
    const stored: any = buildMergedEventFields(mergeEventGroup([geonet, gcmt], config(strategy)), FM_FIELDS);
    const mechanisms = JSON.parse(stored.focal_mechanisms);
    expect(mechanisms.map((fm: any) => fm.publicID)).toEqual(['smi:org.gcmt/fm/1', 'smi:nz.org.geonet/fm/1']);
    expect(stored.preferred_focal_mechanism_id).toBe('smi:org.gcmt/fm/1');
  });

  it('ranks a USGS moment tensor above a GeoNet one (white-paper order)', () => {
    const usgsMt = { publicID: 'us-mt', momentTensor: { varianceReduction: 0.7 }, creationInfo: { agencyID: 'us' } };
    const geonetMt = { publicID: 'gn-mt', momentTensor: { varianceReduction: 0.8 } };
    const best = selectBestFocalMechanism([row('gn', 'GeoNet', [geonetMt]), row('us', 'USGS', [usgsMt])]);
    expect(best?.publicID).toBe('us-mt');
  });

  it('ranks any moment tensor above first motions, and well-constrained first motions above automatic ones', () => {
    const firstMotion = { publicID: 'fm-30', stationPolarityCount: 30, evaluationMode: 'manual' };
    const automatic = { publicID: 'fm-auto', stationPolarityCount: 40, evaluationMode: 'automatic' };
    const otherMt = { publicID: 'emsc-mt', momentTensor: { varianceReduction: 0.5 }, creationInfo: { agencyID: 'EMSC' } };
    const stored: any = buildMergedEventFields(
      mergeEventGroup(
        [row('a', 'Agency A', [automatic, firstMotion]), row('b', 'EMSC', [otherMt])],
        config({ mergeStrategy: 'quality', priority: 'quality' })
      ),
      FM_FIELDS
    );
    expect(JSON.parse(stored.focal_mechanisms).map((fm: any) => fm.publicID)).toEqual(['emsc-mt', 'fm-30', 'fm-auto']);
  });

  it('lists a mechanism reported by two sources once', () => {
    const shared = row('isc', 'ISC', [gcmtFm]);
    const stored: any = buildMergedEventFields(
      mergeEventGroup([geonet, gcmt, shared], config({ mergeStrategy: 'priority', priority: 'geonet' })),
      FM_FIELDS
    );
    expect(JSON.parse(stored.focal_mechanisms)).toHaveLength(2);
  });
});
