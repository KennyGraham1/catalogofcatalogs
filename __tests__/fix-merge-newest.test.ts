/** @jest-environment node */

/**
 * Findings #23 and #134: 'newest' must keep the most recently DETERMINED solution
 * (publication/main.tex §Catalogue Merge: "the most recently determined solution is retained,
 * where later analyses supersede earlier ones"). Reports of one earthquake differ in origin
 * time only by location and velocity-model scatter, so the latest ORIGIN time — what both
 * 'newest' paths used — says nothing about which analysis is newer.
 *
 * Determination time: the published origin's creationInfo.creationTime (origins JSON or
 * parsed QuakeML), else the event record's creation/modification time (creation_info).
 * Fallback chain when not every report states it: evaluation status, then the quality
 * ranking (network authority when a report has no quality evidence).
 */

import { mergeEventGroup, mergeByNewest, mergeByPriority, determinationTime } from '@/lib/merge';
import { quakemlEventToDbFields } from '@/lib/quakeml-to-db';
import { parseQuakeMLEvent } from '@/lib/quakeml-parser';

// The merge page's default: Source Priority, Newest First.
const UI_DEFAULT: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'newest' };
const NEWEST: any = { ...UI_DEFAULT, mergeStrategy: 'newest' };

/** A report whose determination time lives in the stored origins column (QuakeML upload). */
const withOriginCreated = (base: any, created: string) => ({
  ...base,
  preferred_origin_id: `${base.id}-origin`,
  origins: JSON.stringify([{
    publicID: `${base.id}-origin`,
    time: { value: base.time }, latitude: { value: base.latitude }, longitude: { value: base.longitude },
    creationInfo: { agencyID: base.agency_id, creationTime: created },
  }]),
});

describe('#23 the default merge keeps the most recently determined solution', () => {
  // GeoNet's reviewed solution (computed 2024) and ISC's preliminary one (computed 2016) of
  // one earthquake; ISC's origin time happens to be 0.7 s later.
  const geonet = withOriginCreated({
    id: 'gn', source: 'GeoNet', catalogueId: 'gn', agency_id: 'WEL',
    time: '2016-11-13T11:02:56.400Z', latitude: -41.3, longitude: 174.8, depth: 22,
    magnitude: 4.2, magnitude_type: 'ML', evaluation_status: 'reviewed',
  }, '2024-03-01T00:00:00Z');
  const isc = {
    id: 'isc', source: 'ISC', catalogueId: 'isc', agency_id: 'ISC',
    time: '2016-11-13T11:02:57.100Z', latitude: -41.34, longitude: 174.84, depth: 33,
    magnitude: 4.0, magnitude_type: 'ML', evaluation_status: 'preliminary',
    creation_info: JSON.stringify({ agencyID: 'ISC', creationTime: '2016-11-20T00:00:00Z' }),
  };

  it('reads the determination time from the origins column and from creation_info', () => {
    expect(determinationTime(geonet as any)).toBe(Date.parse('2024-03-01T00:00:00Z'));
    expect(determinationTime(isc as any)).toBe(Date.parse('2016-11-20T00:00:00Z'));
  });

  it('keeps GeoNet\'s later analysis under the UI default and the Newest Data strategy', () => {
    for (const config of [UI_DEFAULT, NEWEST]) {
      expect(mergeEventGroup([geonet, isc] as any, config).id).toBe('gn');
      expect(mergeEventGroup([isc, geonet] as any, config).id).toBe('gn');
    }
  });
});

describe('#134 a later analysis supersedes an earlier one whatever the origin times say', () => {
  it('keeps the reviewed ISC solution computed a week after GeoNet\'s automatic one', () => {
    // GeoNet automatic origin at 10:30:47, computed 10:31:30; ISC's reviewed origin at
    // 10:30:45, computed a week later. Latest-origin-time picked the automatic solution.
    const automatic = withOriginCreated({
      id: 'geonet-auto', source: 'GeoNet', catalogueId: 'gn', agency_id: 'WEL',
      time: '2024-01-15T10:30:47.000Z', latitude: -41.3, longitude: 174.8, depth: 12,
      magnitude: 3.9, magnitude_type: 'ML', evaluation_status: 'preliminary', evaluation_mode: 'automatic',
    }, '2024-01-15T10:31:30Z');
    const reviewed = withOriginCreated({
      id: 'isc-reviewed', source: 'ISC', catalogueId: 'isc', agency_id: 'ISC',
      time: '2024-01-15T10:30:45.000Z', latitude: -41.31, longitude: 174.81, depth: 15,
      magnitude: 4.0, magnitude_type: 'mb', evaluation_status: 'reviewed', evaluation_mode: 'manual',
    }, '2024-01-22T10:31:30Z');
    expect(mergeByNewest([automatic, reviewed] as any).id).toBe('isc-reviewed');
    expect(mergeByNewest([reviewed, automatic] as any).id).toBe('isc-reviewed');
    expect(mergeByPriority([automatic, reviewed] as any, 'newest').id).toBe('isc-reviewed');
  });

  it('reads the creation time of a parsed QuakeML origin through the upload mapping', () => {
    const xml = `<event publicID="smi:local/event/1">
      <origin publicID="smi:local/origin/1">
        <time><value>2024-01-15T10:30:45.000Z</value></time>
        <latitude><value>-41.3</value></latitude><longitude><value>174.8</value></longitude>
        <depth><value>15000</value></depth>
        <creationInfo><agencyID>ISC</agencyID><creationTime>2024-01-22T10:31:30Z</creationTime></creationInfo>
      </origin>
      <magnitude publicID="smi:local/mag/1"><mag><value>4.0</value></mag><type>mb</type></magnitude>
      <preferredOriginID>smi:local/origin/1</preferredOriginID>
    </event>`;
    const row = {
      id: 'q', time: '2024-01-15T10:30:45.000Z', latitude: -41.3, longitude: 174.8, depth: 15, magnitude: 4.0,
      ...quakemlEventToDbFields(parseQuakeMLEvent(xml)!),
    };
    expect(determinationTime(row as any)).toBe(Date.parse('2024-01-22T10:31:30Z'));
  });
});

describe('newest: fallback chain when not every report states when it was determined', () => {
  const base = { latitude: -41.3, longitude: 174.8, depth: 12, magnitude: 4.0, magnitude_type: 'ML' };

  it('prefers the reviewed solution to the preliminary one, not the later origin time', () => {
    const preliminary = { ...base, id: 'prelim', source: 'A', catalogueId: 'a', time: '2024-01-15T10:30:48Z', evaluation_status: 'preliminary' };
    const reviewed = { ...base, id: 'rev', source: 'B', catalogueId: 'b', time: '2024-01-15T10:30:46Z', evaluation_status: 'reviewed' };
    expect(mergeByNewest([preliminary, reviewed] as any).id).toBe('rev');
    expect(mergeByNewest([reviewed, preliminary] as any).id).toBe('rev');
  });

  it('does not trust a determination time only one report states', () => {
    // Only the preliminary report says when it was computed; the reviewed one is silent. A
    // time on one side proves nothing about the other, so evaluation status decides.
    const preliminary = {
      ...base, id: 'prelim', source: 'A', catalogueId: 'a', time: '2024-01-15T10:30:48Z', evaluation_status: 'preliminary',
      creation_info: JSON.stringify({ creationTime: '2025-01-01T00:00:00Z' }),
    };
    const reviewed = { ...base, id: 'rev', source: 'B', catalogueId: 'b', time: '2024-01-15T10:30:46Z', evaluation_status: 'reviewed' };
    expect(mergeByNewest([preliminary, reviewed] as any).id).toBe('rev');
  });

  it('falls back to network authority when no report says anything about its solution', () => {
    // GeoNet FDSN-text row and an ISC CSV row: no times, statuses or quality metrics. Inside
    // New Zealand GeoNet is the authority, whichever origin time is later.
    const geonet = { ...base, id: 'gn', source: 'GeoNet', catalogueId: 'gn', time: '2024-01-15T10:30:45Z' };
    const isc = { ...base, id: 'isc', source: 'ISC', catalogueId: 'isc', time: '2024-01-15T10:30:47Z' };
    expect(mergeEventGroup([geonet, isc] as any, UI_DEFAULT).id).toBe('gn');
    expect(mergeEventGroup([isc, geonet] as any, UI_DEFAULT).id).toBe('gn');
  });

  it('never keeps a solution its agency rejected', () => {
    const rejected = {
      ...base, id: 'rej', source: 'A', catalogueId: 'a', time: '2024-01-15T10:30:46Z', evaluation_status: 'rejected',
      creation_info: JSON.stringify({ creationTime: '2025-01-01T00:00:00Z' }),
    };
    const kept = {
      ...base, id: 'ok', source: 'B', catalogueId: 'b', time: '2024-01-15T10:30:45Z', evaluation_status: 'preliminary',
      creation_info: JSON.stringify({ creationTime: '2024-01-15T10:31:00Z' }),
    };
    expect(mergeByNewest([rejected, kept] as any).id).toBe('ok');
  });
});
