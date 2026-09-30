/** @jest-environment node */

/**
 * Regressions from the review of the merge features (per-field rules, review hold, median,
 * same-agency handling, the authority table).
 *
 * The same-agency rule is conservative: it acts only when the agency identity and the ids
 * clearly agree. A report counts as an agency's own only when its catalogue is that
 * agency's and its own agency code does not name another (a compiled bulletin's copy of an
 * agency's solution is not the agency's report), never for a merged row; ids are compared
 * after normalising their spelling; equal ids are vintages whatever their kind, and only
 * two ids of the same kind that differ split a group. Anything less certain leaves both
 * reports active for the strategy to decide, as before the rule existed. Vintages are
 * recognised BEFORE the consistency gate, so a revised magnitude cannot split them.
 */

import {
  normalizeAgencyEventId,
  sameAgencyKey,
  supersedeSameAgency,
  validateEventGroup,
  groupMatchingEvents,
  performMergeWithGroups,
  mergeEventGroup,
  buildMergedEventFields,
  OPTIONAL_DB_FIELDS,
  catalogueAgencyOf,
  getNetworkPriority,
  selectByNetworkAuthority,
  getMergeConflictLog,
} from '@/lib/merge';
import { eventLineage } from '@/lib/exporters';
import { eventToQuakeML } from '@/lib/quakeml-exporter';
import { parseCSV } from '@/lib/parsers';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';
import { DEFAULT_MERGE_AUTHORITY, parseMergeAuthorityTable, runWithMergeAuthority } from '@/lib/merge-authority';
import { mergeConfigSchema, validateMergeRequest } from '@/lib/validation';

const config: any = { timeThreshold: 60, distanceThreshold: 50, mergeStrategy: 'quality', priority: 'quality' };
const ids = (groups: Array<{ events: any[] }>) => groups.map(g => g.events.map(e => e.id));

// ---------------------------------------------------------------------------
// F1 - one agency id under several spellings
// ---------------------------------------------------------------------------

describe('agency event ids are compared by the bare id the agency assigned', () => {
  it.each([
    ['smi:nz.org.geonet/2024p100000', '2024p100000'],
    [' 2024p100000 ', '2024p100000'],
    ['quakeml:us.anss.org/event/us7000abcd', 'us7000abcd'],
    ['quakeml:us.anss.org/us7000abcd', 'us7000abcd'],
    ['smi:ISC/evid=626000001', '626000001'],
    ['https://earthquake.usgs.gov/fdsnws/event/1/query?eventid=us7000abcd&format=quakeml', 'us7000abcd'],
    ['smi:webservices.ingv.it/fdsnws/event/1/query?eventId=36725411', '36725411'],
    ['smi:org.gfz-potsdam.de/geofon/gfz2024abcd', 'gfz2024abcd'],
    ['GeoNet:2024p100000', '2024p100000'],
    ['GeoNet merged 2024:GeoNet:2024p100000', '2024p100000'],
    ['GeoNet:smi:nz.org.geonet/2024p100000', '2024p100000'],
  ])('%s -> %s', (raw, bare) => {
    expect(normalizeAgencyEventId(raw)).toBe(bare);
  });

  it('has nothing to compare for an empty id', () => {
    expect(normalizeAgencyEventId('  ')).toBeNull();
    expect(normalizeAgencyEventId(null)).toBeNull();
    expect(normalizeAgencyEventId(42)).toBeNull();
  });

  it('a GeoNet API import and a GeoNet quakesearch CSV upload of one event are vintages, not two events', () => {
    // The importer stores smi:nz.org.geonet/<id> (geonetEventPublicId); the CSV upload the
    // bare id from its `publicid` column.
    const csv = 'publicid,eventtype,origintime,modificationtime,longitude,latitude,magnitude,depth,magnitudetype,depthtype,evaluationstatus,usedstationcount\n' +
      '2024p100000,earthquake,2024-03-01T10:00:00.120Z,2024-03-02T00:00:00.000Z,174.80,-41.30,4.6,22,ML,,reviewed,60\n';
    const uploaded = parsedEventToDbFields(parseCSV(csv, ',', 'International').events[0]);
    expect(uploaded.event_public_id).toBe('2024p100000');
    const api: any = { id: 'api', catalogueId: 'cat-geonet-api', source: 'GeoNet', _catalogueAgency: 'geonet',
      source_id: '2024p100000', event_public_id: 'smi:nz.org.geonet/2024p100000',
      time: '2024-03-01T10:00:00.123Z', latitude: -41.30, longitude: 174.80, depth: 22, magnitude: 4.6, magnitude_type: 'ML' };
    const upload: any = { id: 'csv', catalogueId: 'cat-geonet-csv', source: 'GeoNet quakesearch export', _catalogueAgency: 'geonet',
      ...uploaded, time: '2024-03-01T10:00:00.120Z', latitude: -41.30, longitude: 174.80, depth: 22, magnitude: 4.6 };

    const groups = performMergeWithGroups([api, upload], config);
    expect(ids(groups)).toEqual([['csv', 'api']]);
    expect(groups[0].supersededEventIndexes).toHaveLength(1);
    expect(groups[0].validationWarnings).toEqual([]);
  });

  it('ids compare case-insensitively', () => {
    const a: any = { id: 'a', catalogueId: 'c1', source: 'USGS', agency_id: 'us', event_public_id: 'quakeml:us.anss.org/event/US7000ABCD',
      time: '2024-01-01T00:00:00Z', latitude: 10, longitude: 120, magnitude: 5 };
    const b: any = { ...a, id: 'b', catalogueId: 'c2', event_public_id: 'us7000abcd' };
    expect(supersedeSameAgency([a, b]).superseded.size).toBe(1);
  });

  it('equal ids of different kinds are vintages; different ids of different kinds decide nothing', () => {
    const base = { source: 'GeoNet', agency_id: 'WEL', time: '2020-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 4.5, magnitude_type: 'ML' };
    const withPublicId: any = { ...base, id: 'p', catalogueId: 'c1', event_public_id: 'smi:nz.org.geonet/2020p000001',
      creation_info: JSON.stringify({ creationTime: '2020-01-03T00:00:00.000Z' }) };
    const sameBare: any = { ...base, id: 's', catalogueId: 'c2', source_id: '2020p000001',
      creation_info: JSON.stringify({ creationTime: '2020-01-01T00:05:00.000Z' }) };
    const otherBare: any = { ...sameBare, id: 'o', source_id: '9999999' };

    expect(Array.from(supersedeSameAgency([withPublicId, sameBare]).superseded).map(e => e.id)).toEqual(['s']);
    // A publicID against a source_id from another id space: neither split nor superseded.
    expect(supersedeSameAgency([withPublicId, otherBare]).superseded.size).toBe(0);
    expect(validateEventGroup([withPublicId, otherBare], false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F2 - whose report is it?
// ---------------------------------------------------------------------------

describe('the same-agency rule applies only to an agency\'s own reports', () => {
  const geonet: any = {
    id: 'gn', catalogueId: 'cat-geonet', source: 'GeoNet', agency_id: 'WEL',
    event_public_id: 'smi:nz.org.geonet/2024p100000', source_id: '2024p100000',
    time: '2024-03-01T10:00:00.000Z', latitude: -41.30, longitude: 174.80, depth: 22,
    magnitude: 5.2, magnitude_type: 'Mw', magnitude_uncertainty: 0.05, magnitude_station_count: 25,
    preferred_magnitude_id: 'smi:nz.org.geonet/mag/Mw', preferred_focal_mechanism_id: 'smi:nz.org.geonet/fm/2024p100000',
    focal_mechanisms: JSON.stringify([{ publicID: 'smi:nz.org.geonet/fm/2024p100000', creationInfo: { agencyID: 'WEL' },
      nodalPlanes: { nodalPlane1: { strike: { value: 30 }, dip: { value: 60 }, rake: { value: 90 } } }, evaluationStatus: 'reviewed' }]),
    used_station_count: 80, azimuthal_gap: 30, standard_error: 0.15, evaluation_status: 'reviewed',
    creation_info: JSON.stringify({ creationTime: '2024-03-01T10:20:00.000Z' }),
  };
  // The ISC bulletin's row for the same earthquake: its prime hypocentre is GeoNet's (author
  // WEL), under the ISC's evid, compiled two years later.
  const iscCopy: any = {
    id: 'isc', catalogueId: 'cat-isc', source: 'ISC Bulletin', agency_id: 'WEL',
    event_public_id: 'smi:ISC/evid=626000001', source_id: '626000001',
    time: '2024-03-01T10:00:00.150Z', latitude: -41.301, longitude: 174.801, depth: 22, magnitude: 5.0, magnitude_type: 'mb',
    used_station_count: 70, azimuthal_gap: 35, evaluation_status: 'reviewed',
    creation_info: JSON.stringify({ creationTime: '2026-05-01T00:00:00.000Z' }),
  };

  it('keys a report by its catalogue\'s agency, only when its own code agrees or is absent', () => {
    expect(sameAgencyKey(geonet)).toBe('geonet');
    expect(sameAgencyKey(iscCopy)).toBeNull();
    expect(sameAgencyKey({ ...iscCopy, agency_id: 'ISC' })).toBe('isc');
    expect(sameAgencyKey({ ...iscCopy, agency_id: undefined })).toBe('isc');
    // The pipeline's catalogue agency (catalogueAgencyOf) decides over the label.
    expect(sameAgencyKey({ ...geonet, source: 'Wellington upload', _catalogueAgency: 'geonet' })).toBe('geonet');
    expect(sameAgencyKey({ ...geonet, source: 'Upload A', agency_id: undefined })).toBeNull();
    // A merged row is nobody's own report.
    expect(sameAgencyKey({ ...geonet, merge_strategy: 'quality' })).toBeNull();
    expect(sameAgencyKey({ ...geonet, source_events: JSON.stringify([{ source: 'GeoNet' }, { source: 'ISC' }]) })).toBeNull();
    expect(sameAgencyKey({ ...geonet, source_events: JSON.stringify([{ source: 'GeoNet', eventId: '2024p100000' }]) })).toBe('geonet');
  });

  it('a compiled bulletin\'s copy of GeoNet\'s solution merges with GeoNet into one event', () => {
    const log = getMergeConflictLog();
    log.clear();
    expect(validateEventGroup([geonet, iscCopy], true)).toBe(true);
    expect(log.getConflictsByType('same_agency')).toHaveLength(0);
    expect(ids(groupMatchingEvents([geonet, iscCopy], config))).toEqual([['gn', 'isc']]);
  });

  it('as does ComCat with an ISC row authored by NEIC', () => {
    const comcat: any = { id: 'us', catalogueId: 'cat-comcat', source: 'USGS ComCat', agency_id: 'us',
      event_public_id: 'quakeml:us.anss.org/event/us7000abcd', source_id: 'us7000abcd',
      time: '2024-05-01T00:00:00.000Z', latitude: 10.0, longitude: 120.0, depth: 35, magnitude: 5.8, magnitude_type: 'Mww' };
    const iscNeic: any = { id: 'isc2', catalogueId: 'cat-isc', source: 'ISC Bulletin', agency_id: 'NEIC',
      event_public_id: 'smi:ISC/evid=626000999', source_id: '626000999',
      time: '2024-05-01T00:00:00.300Z', latitude: 10.01, longitude: 120.01, depth: 35, magnitude: 5.8, magnitude_type: 'Mww' };
    expect(performMergeWithGroups([comcat, iscNeic], config)).toHaveLength(1);
  });

  it('the copy never supersedes the agency\'s own report: its Mw and moment tensor survive', () => {
    const csvCopy = { ...iscCopy, event_public_id: undefined, used_station_count: 20, azimuthal_gap: 90 };
    const usgs: any = { id: 'us', catalogueId: 'cat-us', source: 'USGS', agency_id: 'us', source_id: 'us7000x',
      time: '2024-03-01T10:00:01.000Z', latitude: -41.35, longitude: 174.85, depth: 30, magnitude: 5.1, magnitude_type: 'mb' };
    expect(supersedeSameAgency([geonet, csvCopy, usgs]).superseded.size).toBe(0);
    for (const strategy of ['quality', 'priority', 'average', 'median']) {
      const merged: any = mergeEventGroup([geonet, csvCopy, usgs], { ...config, mergeStrategy: strategy, priority: 'geonet' });
      expect(merged.sourceEvents.some((s: any) => s.superseded)).toBe(false);
      if (strategy === 'average' || strategy === 'median') {
        expect([merged.magnitude, merged.magnitude_type]).toEqual([5.2, 'Mw']);
      }
      expect(merged.focal_mechanisms).not.toBeNull();
    }
  });

  it('two own reports without comparable ids stay active and are not split', () => {
    const a = { ...geonet, id: 'a', event_public_id: undefined, source_id: undefined };
    const b = { ...geonet, id: 'b', catalogueId: 'cat-geonet-2', event_public_id: undefined, source_id: undefined,
      time: '2024-03-01T10:00:00.300Z' };
    expect(supersedeSameAgency([a, b]).superseded.size).toBe(0);
    expect(validateEventGroup([a, b], false)).toBe(true);
    expect(performMergeWithGroups([a, b], config).map(g => g.supersededEventIndexes)).toEqual([[]]);
  });

  it('two own reports with different ids of one kind are still two events', () => {
    const other = { ...geonet, id: 'gn-2', catalogueId: 'cat-geonet-2', event_public_id: 'smi:nz.org.geonet/2024p100001',
      source_id: '2024p100001', time: '2024-03-01T10:00:02.000Z' };
    expect(ids(groupMatchingEvents([geonet, other], config))).toEqual([['gn'], ['gn-2']]);
  });

  it('a merged row of a catalogue named after one agency is not that agency\'s report', () => {
    const gn: any = { id: 'g', catalogueId: 'cat-gn', source: 'GeoNet', agency_id: 'WEL', source_id: '2024p1',
      event_public_id: 'smi:nz.org.geonet/2024p1', time: '2024-01-01T00:00:00.000Z', latitude: -41.30, longitude: 174.80, depth: 20,
      magnitude: 4.5, magnitude_type: 'ML' };
    const isc: any = { id: 'i', catalogueId: 'cat-isc', source: 'ISC', agency_id: 'ISC', source_id: '600001',
      event_public_id: 'smi:ISC/evid=600001', time: '2024-01-01T00:00:01.000Z', latitude: -41.33, longitude: 174.83, depth: 22,
      magnitude: 4.4, magnitude_type: 'mb', used_station_count: 150, azimuthal_gap: 20, standard_error: 0.1 };
    const averaged: any = { id: 'm1', ...buildMergedEventFields(mergeEventGroup([gn, isc], { ...config, mergeStrategy: 'average' }), OPTIONAL_DB_FIELDS) };
    const agency = catalogueAgencyOf({ id: 'cat-merged', name: 'GeoNet merged 2024' } as any, null);
    expect(agency).toBe('geonet');
    const remerged = { ...averaged, source: 'GeoNet merged 2024', catalogueId: 'cat-merged', _catalogueAgency: agency };
    expect(sameAgencyKey(remerged)).toBeNull();
    const groups = performMergeWithGroups([{ ...gn }, remerged], config);
    expect(ids(groups)).toEqual([['g', 'm1']]);
    expect(groups[0].validationWarnings).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F3 - vintages are recognised before the consistency gate
// ---------------------------------------------------------------------------

describe('a revised magnitude does not split the vintages of one agency event', () => {
  const nz = (id: string, catalogue: string, extra: Record<string, unknown>): any => ({
    id, catalogueId: catalogue, source: 'GeoNet', agency_id: 'WEL', source_id: '2024p100000',
    event_public_id: 'smi:nz.org.geonet/2024p100000', time: '2024-03-01T10:00:00.000Z',
    latitude: -41.30, longitude: 174.80, depth: 12, magnitude_type: 'ML', ...extra,
  });
  const preliminary = nz('prelim', 'cat-geonet-feed', { magnitude: 3.1, evaluation_status: 'preliminary', evaluation_mode: 'automatic',
    creation_info: JSON.stringify({ creationTime: '2024-03-01T10:02:00.000Z' }) });
  const reviewed = nz('reviewed', 'cat-geonet-archive', { magnitude: 3.8, time: '2024-03-01T10:00:00.400Z', latitude: -41.33,
    evaluation_status: 'reviewed', evaluation_mode: 'manual', creation_info: JSON.stringify({ creationTime: '2024-03-02T09:00:00.000Z' }) });

  it('the gate judges only the current vintage', () => {
    const log = getMergeConflictLog();
    log.clear();
    expect(validateEventGroup([preliminary, reviewed], true)).toBe(true);
    expect(log.getConflictsByType('magnitude_range')).toHaveLength(0);
    // Two DIFFERENT reports with those magnitudes are still refused.
    const isc = { ...preliminary, id: 'isc', catalogueId: 'cat-isc', source: 'ISC', agency_id: 'ISC',
      event_public_id: 'smi:ISC/evid=1', source_id: '1' };
    expect(validateEventGroup([isc, reviewed], false)).toBe(false);
  });

  it('one group, the reviewed solution published, the preview warns about nothing', () => {
    const groups = performMergeWithGroups([preliminary, reviewed], { ...config, onConflict: 'hold' });
    expect(ids(groups)).toEqual([['prelim', 'reviewed']]);
    expect(groups[0].supersededEventIndexes).toEqual([0]);
    expect(groups[0].validationWarnings).toEqual([]);
    expect([groups[0].isSuspicious, groups[0].heldForReview]).toEqual([false, false]);

    const row = buildMergedEventFields(mergeEventGroup(groups[0].events, config), OPTIONAL_DB_FIELDS);
    expect([row.source_id, row.magnitude, row.evaluation_status]).toEqual(['GeoNet:2024p100000', 3.8, 'reviewed']);
  });

  it('the preview\'s magnitude and depth statistics leave the superseded vintage out, as the gate does', () => {
    const deepPreliminary = { ...preliminary, depth: 60 };
    const isc: any = { id: 'isc', catalogueId: 'cat-isc', source: 'ISC', agency_id: 'ISC', source_id: '626',
      time: '2024-03-01T10:00:01.000Z', latitude: -41.31, longitude: 174.81, depth: 14, magnitude: 3.7, magnitude_type: 'ML' };
    const [group] = performMergeWithGroups([deepPreliminary, reviewed, isc], config);
    expect(group.events).toHaveLength(3);
    expect(group.supersededEventIndexes).toHaveLength(1);
    // Over all three reports the depth range (48 km) and the magnitude range (0.7) would both be flagged.
    expect(group.validationWarnings).toEqual([]);
    expect(group.isSuspicious).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F4 - a computed epicentre is credited to the merge, whatever computed it
// ---------------------------------------------------------------------------

describe('export attribution of computed epicentres', () => {
  const r = (id: string, cat: string, source: string, lat: number, lon: number, t: string, extra: any = {}) => ({
    id, catalogueId: cat, source, source_id: `${id}-sid`, time: t, latitude: lat, longitude: lon, depth: 20,
    magnitude: 4.5, magnitude_type: 'ML', ...extra,
  });
  const events: any[] = [
    r('a', 'cat-a', 'GeoNet', -41.30, 174.80, '2024-01-01T00:00:00.000Z', { used_station_count: 80, azimuthal_gap: 30, standard_error: 0.1 }),
    r('b', 'cat-b', 'ISC', -41.34, 174.84, '2024-01-01T00:00:01.000Z'),
    r('c', 'cat-c', 'USGS', -41.38, 174.88, '2024-01-01T00:00:02.000Z'),
  ];

  it.each(['average', 'median'])('a %s row is attributed to "merged"', (strategy) => {
    const merged = mergeEventGroup(events, { ...config, mergeStrategy: strategy });
    const row: any = { id: `row-${strategy}`, ...buildMergedEventFields(merged, OPTIONAL_DB_FIELDS) };
    expect(JSON.parse(row.source_events).some((s: any) => s.selected)).toBe(false);
    expect(eventLineage(row).source).toBe('merged');
  });

  it('a row that selected one report is still attributed to it', () => {
    const row: any = { id: 'row-q', ...buildMergedEventFields(mergeEventGroup(events, config), OPTIONAL_DB_FIELDS) };
    expect(eventLineage(row).source).toBe('GeoNet');
  });
});

// ---------------------------------------------------------------------------
// F6 - unlisted networks rank below every listed one
// ---------------------------------------------------------------------------

describe('network priority of networks the authority table does not list', () => {
  const emsc: any = { id: 'e', source: 'EMSC', agency_id: 'EMSC', time: '2024-01-01T00:00:00Z', latitude: 40, longitude: 20, magnitude: 5,
    used_station_count: 200, azimuthal_gap: 20, standard_error: 0.1 };
  const unknown: any = { id: 'x', source: 'Some Uni Temporary Array', time: '2024-01-01T00:00:01Z', latitude: 40.05, longitude: 20.05,
    magnitude: 5, used_station_count: 5, azimuthal_gap: 250, standard_error: 1.5 };

  it('rank just below the lowest listed priority, and a sourceless report below that', () => {
    const lowest = Math.max(
      ...DEFAULT_MERGE_AUTHORITY.hierarchy.map(e => e.priority),
      ...DEFAULT_MERGE_AUTHORITY.regions.flatMap(r => r.hierarchy.map(e => e.priority)),
    );
    expect(getNetworkPriority('Some Uni Temporary Array')).toBe(lowest + 1);
    expect(getNetworkPriority(undefined)).toBe(lowest + 2);
  });

  it('a network an administrator listed at priority 200 outranks an unlisted one', async () => {
    const parsed = parseMergeAuthorityTable({
      hierarchy: [
        { patterns: ['geonet'], priority: 1, agency: 'geonet', description: 'GeoNet' },
        { patterns: ['emsc'], priority: 200, agency: 'emsc', description: 'EMSC' },
      ],
      regions: [{ name: 'Far', bounds: { minLat: -10, maxLat: 0, minLon: 0, maxLon: 10 }, hierarchy: [{ patterns: ['iris'], priority: 500 }] }],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const table = { ...parsed.table, updatedAt: '2026-09-30T00:00:00.000Z' };
    const result = await runWithMergeAuthority(table, async () => ({
      emsc: getNetworkPriority(emsc.source, emsc),
      unlisted: getNetworkPriority(unknown.source, unknown),
      chosen: selectByNetworkAuthority([unknown, emsc]).id,
    }));
    // Below the regional entry at 500 too: that table's lowest listed priority.
    expect(result).toEqual({ emsc: 200, unlisted: 501, chosen: 'e' });
  });
});

// ---------------------------------------------------------------------------
// F7 - a stored origin stands for the row only with the row's depth metadata
// ---------------------------------------------------------------------------

describe('QuakeML preferred origin when a depth rule publishes an equal depth value', () => {
  const origin = (id: string, lat: number, lon: number, t: string, depthKm: number, depthType: string, uncKm: number | null) => ({
    publicID: id, time: { value: t }, latitude: { value: lat }, longitude: { value: lon },
    depth: { value: depthKm * 1000, ...(uncKm != null ? { uncertainty: uncKm * 1000 } : {}) }, depthType,
  });
  const gn: any = { id: 'g', catalogueId: 'cat-gn', source: 'GeoNet', agency_id: 'WEL', source_id: '2024p1',
    time: '2024-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 10, depth_type: 'operator assigned', depth_uncertainty: 0,
    magnitude: 4.5, magnitude_type: 'ML', used_station_count: 90, azimuthal_gap: 20, standard_error: 0.1, evaluation_status: 'reviewed' };
  const isc: any = { id: 'i', catalogueId: 'cat-isc', source: 'ISC', agency_id: 'ISC', source_id: '600001',
    time: '2024-01-01T00:00:01.000Z', latitude: -41.32, longitude: 174.82, depth: 25, depth_type: 'from location', depth_uncertainty: 2,
    magnitude: 4.4, magnitude_type: 'mb', used_station_count: 40, azimuthal_gap: 60 };
  const us: any = { id: 'u', catalogueId: 'cat-us', source: 'USGS', agency_id: 'us', source_id: 'us1',
    time: '2024-01-01T00:00:02.000Z', latitude: -41.34, longitude: 174.84, depth: 25, depth_type: 'from location', depth_uncertainty: 7,
    magnitude: 4.6, magnitude_type: 'Mww', magnitude_uncertainty: 0.05, magnitude_station_count: 50,
    preferred_origin_id: 'quakeml:us/origin/1',
    origins: JSON.stringify([origin('quakeml:us/origin/1', -41.34, 174.84, '2024-01-01T00:00:02.000Z', 25, 'from location', 7)]) };

  function preferredOriginOf(xml: string): string {
    const pref = /<preferredOriginID>([^<]+)</.exec(xml)![1];
    return xml.split('<origin ').find(o => o.includes(`publicID="${pref}"`))!;
  }

  it('publishes the depth uncertainty the row carries, not the base origin\'s', () => {
    const merged: any = mergeEventGroup([gn, isc, us], { ...config, fieldRules: { depth: { rule: 'best-constrained' } } });
    const row: any = { id: 'row-2', ...buildMergedEventFields(merged, OPTIONAL_DB_FIELDS) };
    expect([row.depth, row.depth_uncertainty]).toEqual([25, 2]); // precondition: USGS epicentre, ISC depth
    const published = preferredOriginOf(eventToQuakeML(row));
    expect(published).not.toContain('quakeml:us/origin/1');
    expect(published.replace(/\s+/g, '')).toContain('<depth><value>25000</value><uncertainty>2000</uncertainty></depth>');
    expect(/<depthType>([^<]+)</.exec(published)![1]).toBe('from location');
  });

  it('the base\'s stored origin still stands for the row when it carries the published depth', () => {
    const merged: any = mergeEventGroup([gn, isc, us], config);
    const row: any = { id: 'row-3', ...buildMergedEventFields(merged, OPTIONAL_DB_FIELDS) };
    expect(row.depth_uncertainty).toBe(7);
    expect(/<preferredOriginID>([^<]+)</.exec(eventToQuakeML(row))![1]).toContain('quakeml');
  });
});

// ---------------------------------------------------------------------------
// F9 - an authority list names each agency and each pattern once
// ---------------------------------------------------------------------------

describe('authority table entries that could never apply are rejected', () => {
  const entry = (patterns: string[], priority: number, agency?: string) => ({ patterns, priority, agency, description: '' });

  it('a second global entry for one agency', () => {
    const parsed = parseMergeAuthorityTable({
      hierarchy: [entry(['usgs'], 40, 'usgs'), entry(['isc'], 3, 'isc'), entry(['neic'], 1, 'usgs')],
      regions: [],
    });
    expect(parsed).toEqual({
      ok: false,
      error: 'Invalid authority table: hierarchy: rows 1 and 3 of the global hierarchy are both for agency usgs; list each agency once',
    });
  });

  it('a pattern two entries of one list share', () => {
    const parsed = parseMergeAuthorityTable({ hierarchy: [entry(['geonet', 'gns'], 1), entry(['GNS'], 2)], regions: [] });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.error).toBe(
      'Invalid authority table: hierarchy: rows 1 and 2 of the global hierarchy both list the pattern "gns"; list each pattern once'
    );
  });

  it('a duplicate within one region, naming the region', () => {
    const parsed = parseMergeAuthorityTable({
      hierarchy: [entry(['geonet'], 1, 'geonet')],
      regions: [{ name: 'NZ', bounds: { minLat: -50, maxLat: -30, minLon: 160, maxLon: 180 },
        hierarchy: [{ patterns: ['isc'], priority: 1, agency: 'isc' }, { patterns: ['iscgem'], priority: 2, agency: 'isc' }] }],
    });
    expect(!parsed.ok && parsed.error).toBe(
      'Invalid authority table: regions.0.hierarchy: rows 1 and 2 of region "NZ" are both for agency isc; list each agency once'
    );
  });

  it('the same agency in the global list and in a region is fine, and so is the default table', () => {
    expect(parseMergeAuthorityTable({ hierarchy: DEFAULT_MERGE_AUTHORITY.hierarchy, regions: DEFAULT_MERGE_AUTHORITY.regions }).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F10 - merge_parameters records only the catalogue a rule uses
// ---------------------------------------------------------------------------

describe('field rules record a catalogueId only for rule "catalogue"', () => {
  it('drops it from the other rules and keeps it where it is used', () => {
    const parsed = mergeConfigSchema.parse({ ...config, fieldRules: {
      depth: { rule: 'quality', catalogueId: 'cat-never-used' },
      magnitude: { rule: 'catalogue', catalogueId: 'c2' },
      mechanism: { rule: 'hierarchy', catalogueId: 'cat-never-used' },
    } });
    expect(parsed.fieldRules).toEqual({ depth: { rule: 'quality' }, magnitude: { rule: 'catalogue', catalogueId: 'c2' }, mechanism: { rule: 'hierarchy' } });

    const merged: any = mergeEventGroup([
      { id: 'a', catalogueId: 'c1', source: 'A', time: '2024-01-01T00:00:00Z', latitude: 0, longitude: 0, magnitude: 4, depth: 10 },
      { id: 'b', catalogueId: 'c2', source: 'B', time: '2024-01-01T00:00:01Z', latitude: 0.01, longitude: 0.01, magnitude: 4, depth: 12 },
    ] as any, parsed as any);
    expect(JSON.parse(merged.merge_parameters).fieldRules).toEqual(parsed.fieldRules);
  });

  it('a merge request keeps the catalogue of a "catalogue" rule and drops a stray one', () => {
    const result = validateMergeRequest({
      name: 'Merged',
      sourceCatalogues: [{ id: 'c1', name: 'A', events: 1, source: 'A' }, { id: 'c2', name: 'B', events: 1, source: 'B' }],
      config: { ...config, fieldRules: { depth: { rule: 'newest', catalogueId: 'not-a-source' }, magnitude: { rule: 'catalogue', catalogueId: 'c1' } } },
    });
    expect(result.success).toBe(true);
    expect(result.data!.config.fieldRules).toEqual({ depth: { rule: 'newest' }, magnitude: { rule: 'catalogue', catalogueId: 'c1' } });
  });
});

describe('agency ids that cannot show two different events', () => {
  const { groupMatchingEvents } = jest.requireActual('@/lib/merge');
  const cfg: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'quality', priority: 'quality' };
  const comcat = (id: string, catalogueId: string, extra: Record<string, unknown> = {}): any => ({
    id, catalogueId, source: 'USGS ComCat', _catalogueAgency: 'usgs', time: '2024-01-01T00:00:00.000Z',
    latitude: 36.1, longitude: -120.3, depth: 8, magnitude: 4.1, magnitude_type: 'Mw', ...extra,
  });

  it('two ComCat downloads storing different network ids of one earthquake stay one group', () => {
    const groups = groupMatchingEvents([
      comcat('a', 'cat-1', { source_id: 'us7000abcd' }),
      comcat('b', 'cat-2', { source_id: 'nc73912345', time: '2024-01-01T00:00:00.400Z' }),
    ], cfg);
    expect(groups.map((g: any) => g.events.map((e: any) => e.id))).toEqual([['a', 'b']]);
  });

  it('two ids of one network namespace that differ still split', () => {
    const groups = groupMatchingEvents([
      comcat('a', 'cat-1', { source_id: 'us7000abcd' }),
      comcat('b', 'cat-2', { source_id: 'us7000abce', time: '2024-01-01T00:00:00.400Z' }),
    ], cfg);
    expect(groups.map((g: any) => g.events.map((e: any) => e.id))).toEqual([['a'], ['b']]);
  });

  it('a platform row id from a re-imported export is not an agency id', () => {
    const groups = groupMatchingEvents([
      comcat('a', 'cat-1', { event_public_id: 'smi:local/event/3f2b8c1e-9d4a-4b6f-8a21-0c9e7d5b4a13' }),
      comcat('b', 'cat-2', { event_public_id: 'smi:local/event/a91c0d2e-1b3f-4c5d-9e6f-7a8b9c0d1e2f', time: '2024-01-01T00:00:00.400Z' }),
    ], cfg);
    expect(groups.map((g: any) => g.events.map((e: any) => e.id))).toEqual([['a', 'b']]);
  });
});
