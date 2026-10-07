/** @jest-environment node */

/**
 * Same-agency handling (contract M5; publication/merge_strategies.tex §The same-agency
 * rule). Two of one agency's own reports inside a group are either two vintages of one
 * solution (the same agency event id) - the newest supersedes the rest, which stay in the
 * provenance but take no part in any selection - or, when they carry different agency
 * event ids of the same kind, two earthquakes: the group fails validation with a
 * 'same_agency' conflict and is split. Anything less certain leaves both reports to the
 * strategy (see feat-merge-review-fixes.test.ts).
 */

import {
  mergeEventGroup,
  groupMatchingEvents,
  performMergeWithGroups,
  validateEventGroup,
  supersedeSameAgency,
  getMergeConflictLog,
} from '@/lib/merge';

const config: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };

const nz = (id: string, catalogue: string, extra: Record<string, unknown> = {}): any => ({
  id, catalogueId: catalogue, source: 'GeoNet', agency_id: 'WEL', time: '2020-01-01T00:00:00.000Z',
  latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 4.5, magnitude_type: 'ML', ...extra,
});

// GeoNet's preliminary solution (catalogue A, an early import) and its reviewed one
// (catalogue B, imported later), plus the ISC's own report.
const preliminary = nz('gn-old', 'cat-a', {
  source_id: '2020p000001', latitude: -41.31, depth: 25, used_station_count: 12, azimuthal_gap: 120,
  evaluation_status: 'preliminary', creation_info: JSON.stringify({ creationTime: '2020-01-01T00:05:00.000Z' }),
});
const reviewed = nz('gn-new', 'cat-b', {
  source_id: '2020p000001', time: '2020-01-01T00:00:00.500Z', used_station_count: 45, azimuthal_gap: 40, standard_error: 0.2,
  evaluation_status: 'reviewed', creation_info: JSON.stringify({ creationTime: '2020-01-03T00:00:00.000Z' }),
});
const isc = nz('isc', 'cat-isc', {
  source: 'ISC', agency_id: 'ISC', source_id: '600001', time: '2020-01-01T00:00:01.000Z', latitude: -41.32,
  used_station_count: 30, azimuthal_gap: 80, standard_error: 0.5, evaluation_status: 'reviewed',
});

describe('vintages of one solution', () => {
  it('keeps the newest determination and supersedes the older one', () => {
    const { active, superseded } = supersedeSameAgency([preliminary, reviewed, isc]);
    expect(active.map(e => e.id)).toEqual(['gn-new', 'isc']);
    expect(Array.from(superseded).map(e => e.id)).toEqual(['gn-old']);
  });

  it('the superseded report stays in the provenance, flagged, and takes no part in the selection', () => {
    // Under the quality strategy the preliminary report would never win anyway; make it the
    // "best" so the flag, not the ranking, is what keeps it out.
    const strongOld = { ...preliminary, used_station_count: 200, azimuthal_gap: 20, standard_error: 0.1 };
    const merged: any = mergeEventGroup([strongOld, reviewed, isc], config);
    const entries = merged.sourceEvents;
    expect(entries.map((s: any) => s.originalData.id)).toEqual(['gn-old', 'gn-new', 'isc']);
    expect(entries.map((s: any) => s.superseded === true)).toEqual([true, false, false]);
    expect(entries.filter((s: any) => s.selected).map((s: any) => s.originalData.id)).toEqual(['gn-new']);
    expect(merged.source_catalogue_ids).toEqual(['cat-a', 'cat-b', 'cat-isc']);
  });

  it('an averaged epicentre weights only the current reports', () => {
    const merged: any = mergeEventGroup([preliminary, reviewed, isc], { ...config, mergeStrategy: 'average' });
    const weights = merged.sourceEvents.map((s: any) => s.locationWeight ?? null);
    expect(weights[0]).toBeNull();
    expect(weights[1]! + weights[2]!).toBeCloseTo(1, 6);
    // The averaged location lies between the two current reports, untouched by the old one.
    expect(merged.latitude).toBeCloseTo(-41.31, 6);
  });

  it('a qualified id from a previous merge equals its un-prefixed form', () => {
    const remerged = { ...reviewed, source_id: 'GeoNet:2020p000001' };
    expect(validateEventGroup([preliminary, remerged], false)).toBe(true);
  });

  it('a public id and a bare source id naming the same event are vintages of it', () => {
    const withPublicId = { ...reviewed, source_id: undefined, event_public_id: 'smi:nz.org.geonet/2020p000001' };
    expect(validateEventGroup([preliminary, withPublicId], false)).toBe(true);
    expect(Array.from(supersedeSameAgency([preliminary, withPublicId]).superseded).map(e => e.id)).toEqual(['gn-old']);
  });

  it('a public id against a different bare source id decides nothing', () => {
    // The two may come from different id spaces: neither split nor superseded.
    const withPublicId = { ...reviewed, source_id: undefined, event_public_id: 'smi:nz.org.geonet/2020p000009' };
    expect(validateEventGroup([preliminary, withPublicId], false)).toBe(true);
    expect(supersedeSameAgency([preliminary, withPublicId]).superseded.size).toBe(0);
  });

  it('reports whose agency is unknown are never grouped', () => {
    const anonymousA = { ...preliminary, source: 'Upload A', agency_id: undefined, source_id: 'x1' };
    const anonymousB = { ...reviewed, source: 'Upload B', agency_id: undefined, source_id: 'x2' };
    expect(supersedeSameAgency([anonymousA, anonymousB]).superseded.size).toBe(0);
    expect(validateEventGroup([anonymousA, anonymousB], false)).toBe(true);
  });

  it('the preview lists the superseded members and counts them', () => {
    const groups = performMergeWithGroups([preliminary, reviewed, isc], config);
    expect(groups).toHaveLength(1);
    expect(groups[0].supersededEventIndexes).toEqual([0]);
    expect(groups[0].selectedEventIndex).toBe(1);
  });
});

describe('two different events of one agency', () => {
  const other = nz('gn-other', 'cat-b', { source_id: '2020p000002', time: '2020-01-01T00:00:03.000Z', latitude: -41.305 });

  it('fail the group with a same_agency conflict', () => {
    const log = getMergeConflictLog();
    log.clear();
    expect(validateEventGroup([preliminary, other])).toBe(false);
    const conflicts = log.getConflictsByType('same_agency');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].message).toContain('Two different GeoNet events in one group');
    expect(conflicts[0].details.values).toEqual({ agency: 'geonet', agencyEventIds: ['2020p000001', '2020p000002'] });
  });

  it('are split by the association, whatever their separation', () => {
    const groups = groupMatchingEvents([preliminary, other], config);
    expect(groups.map(g => g.events.map(e => e.id))).toEqual([['gn-old'], ['gn-other']]);
  });

  it('the preview flags both separated reports and says why', () => {
    // Otherwise the split is silent: two single-report groups look like two unrelated events.
    const groups = performMergeWithGroups([preliminary, other], { ...config, onConflict: 'hold' });
    expect(groups.map(g => [g.separated, g.isSuspicious, g.heldForReview])).toEqual([[true, false, true], [true, false, true]]);
    for (const group of groups) {
      expect(group.validationWarnings).toEqual([
        expect.stringMatching(/^Matched with another entry but kept apart.*Two different GeoNet events in one group \(2020p000001, 2020p000002\), so the group is split/),
      ]);
    }
  });

  it('a third agency joins the closer one and the preview says the group was salvaged', () => {
    const groups = performMergeWithGroups([preliminary, other, isc], config);
    const members = groups.map(g => g.events.map(e => e.id).sort());
    expect(members).toContainEqual(['gn-old', 'isc']);
    expect(members).toContainEqual(['gn-other']);
    const pair = groups.find(g => g.events.length === 2)!;
    expect(pair.validationWarnings.some(w => w.startsWith('Formed by splitting'))).toBe(true);
    expect(pair.supersededEventIndexes).toEqual([]);
  });
});
