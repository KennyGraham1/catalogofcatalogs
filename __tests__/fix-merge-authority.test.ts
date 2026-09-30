/** @jest-environment node */

/**
 * Finding #28 (core) and contract C10.
 *
 * Agency identity came from substrings of the free-text catalogue display name: every name
 * containing 'nz' ("Merged NZ Catalogue", "USGS ComCat NZ region", "ISC bulletin (NZ)")
 * ranked as GeoNet, 'Tonga campaigns' matched GNS and 'San Francisco' matched ISC. An agency
 * is now identified by the solution's agency code (QuakeML creationInfo/agencyID), the
 * catalogue's explicit metadata, or whole words of a name — never a substring. Custom Order
 * (priorityOrder, C10) now exists: the designated order decides, quality breaks ties.
 */

import {
  getNetworkPriority,
  selectByNetworkAuthority,
  mergeByPriority,
  mergeEventGroup,
  catalogueAgencyOf,
  REGIONAL_PRIORITIES,
  inRegionBounds,
} from '@/lib/merge';
import { validateMergeRequest } from '@/lib/validation';
import { NZ_NATIONAL_BOUNDS } from '@/lib/geo-bounds-utils';

const nz = (id: string, source: string, extra: Record<string, unknown> = {}): any => ({
  id, source, catalogueId: `cat-${id}`, time: '2020-01-01T00:00:00Z',
  latitude: -41.5, longitude: 174.5, depth: 20, magnitude: 4.5, magnitude_type: 'ML', ...extra,
});

// A network the default table does not list ranks just below its lowest entry (IGN, 10).
const UNLISTED = 11;

describe('#28 agency identity is never a substring of a display name', () => {
  it.each([
    ['USGS ComCat NZ region', 4],
    ['ISC bulletin (NZ)', 3],
    ['Franz Josef swarm (ISC)', 3],
    ['Tonga campaigns (USGS)', 4],
    ['San Francisco Bay (USGS)', 4],
    ['GeoNet - Automated Import', 1],
    ['GNS Science', 1],
    ['Merged NZ Catalogue', UNLISTED],
    ['Misc catalogue', UNLISTED],
    ['Design test', UNLISTED],
    ['Mainz network', UNLISTED],
  ])('%s has network priority %i', (name, priority) => {
    expect(getNetworkPriority(name as string)).toBe(priority);
    expect(getNetworkPriority(name as string, nz('e', name as string))).toBe(priority);
  });

  it('keeps GeoNet over a better-scored "USGS ComCat NZ region" record under authority', () => {
    const geonet = nz('gn', 'GeoNet');
    const usgs = nz('us', 'USGS ComCat NZ region', {
      used_station_count: 80, azimuthal_gap: 40, standard_error: 0.2, evaluation_status: 'reviewed',
    });
    expect(selectByNetworkAuthority([usgs, geonet]).id).toBe('gn');
  });

  it('identifies the solution by its agency code before any name', () => {
    // An ISC bulletin whose prime hypocentre is GeoNet's (agency WEL) is a GeoNet solution.
    const e = nz('isc-wel', 'ISC Bulletin', { agency_id: 'WEL(GNS_Primary)' });
    expect(getNetworkPriority(e.source, e)).toBe(1);
  });

  it('reads a catalogue\'s agency from its explicit metadata', () => {
    const cat = (name: string): any => ({ id: 'c', name, events: 1, source: name });
    expect(catalogueAgencyOf(cat('Wairarapa 2024'), { provider: 'GNS Science' } as any)).toBe('geonet');
    expect(catalogueAgencyOf(cat('My import'), {
      name: 'My import', source_catalogues: JSON.stringify([{ source: 'GeoNet', description: 'FDSN' }]),
    } as any)).toBe('geonet');
    // A merged catalogue lists several sources: it is no single agency.
    expect(catalogueAgencyOf(cat('Merged NZ Catalogue'), {
      name: 'Merged NZ Catalogue',
      source_catalogues: JSON.stringify([{ id: 'a', name: 'GeoNet', source: 'GeoNet' }, { id: 'b', name: 'ISC', source: 'ISC' }]),
    } as any)).toBeNull();
  });

  it('"GNS > Others" keeps the GeoNet solution, not a catalogue whose name merely contains "gns"', () => {
    const campaign = nz('tonga', 'Tonga campaigns (USGS)', { used_station_count: 90, evaluation_status: 'reviewed' });
    const geonet = nz('gn', 'GeoNet');
    expect(mergeByPriority([campaign, geonet], 'gns').id).toBe('gn');
  });

  it('"GeoNet > Others" recognises GeoNet by agency code when the catalogue name does not say so', () => {
    const feed = nz('feed', 'Quake feed 2020', { agency_id: 'WEL' });
    const isc = nz('isc', 'ISC', { used_station_count: 90, evaluation_status: 'reviewed' });
    expect(mergeByPriority([isc, feed], 'geonet').id).toBe('feed');
  });

  it('uses the national NZ extent for the regional hierarchy, across the antimeridian', () => {
    const { bounds } = REGIONAL_PRIORITIES.NZ;
    expect(bounds).toEqual({
      minLat: NZ_NATIONAL_BOUNDS.minLatitude,
      maxLat: NZ_NATIONAL_BOUNDS.maxLatitude,
      minLon: NZ_NATIONAL_BOUNDS.minLongitude,
      maxLon: NZ_NATIONAL_BOUNDS.maxLongitude,
    });
    expect(inRegionBounds(bounds, -29.27, -177.92)).toBe(true); // Raoul Island, Kermadecs
    expect(inRegionBounds(bounds, -44.0, -176.5)).toBe(true); // Chatham Islands
    expect(inRegionBounds(bounds, -52.55, 169.15)).toBe(true); // Campbell Island
    expect(inRegionBounds(bounds, -41.3, 174.8)).toBe(true); // Wellington
    expect(inRegionBounds(bounds, -25.9, -177.2)).toBe(false); // Monowai seamount
    expect(inRegionBounds(bounds, -33.9, 151.2)).toBe(false); // Sydney
  });
});

describe('C10 Custom Order: the designated catalogue order decides, quality breaks ties', () => {
  const custom = (priorityOrder?: string[]): any => ({
    timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'custom', priorityOrder,
  });
  const a = nz('a', 'Alpha', { used_station_count: 90, azimuthal_gap: 30, evaluation_status: 'reviewed' });
  const b = nz('b', 'Bravo', { used_station_count: 20, azimuthal_gap: 150, evaluation_status: 'preliminary' });
  const c = nz('c', 'Charlie', { used_station_count: 5, azimuthal_gap: 300, evaluation_status: 'preliminary' });

  it('keeps the report from the highest-ranked catalogue, even the worst-scored one', () => {
    expect(mergeEventGroup([a, b, c], custom(['cat-c', 'cat-b', 'cat-a'])).id).toBe('c');
    expect(mergeEventGroup([c, b, a], custom(['cat-b', 'cat-a', 'cat-c'])).id).toBe('b');
  });

  it('ranks catalogues the order does not list after every listed one', () => {
    expect(mergeEventGroup([a, b], custom(['cat-z', 'cat-b'])).id).toBe('b');
  });

  it('breaks a tie among unlisted catalogues by quality', () => {
    expect(mergeEventGroup([b, a, c], custom([])).id).toBe('a');
  });

  it('is accepted by the merge request schema and reaches the merge', () => {
    const request = (priorityOrder: string[]) => ({
      name: 'Custom',
      sourceCatalogues: [
        { id: 'cat-a', name: 'Alpha', events: 1, source: 'Alpha' },
        { id: 'cat-b', name: 'Bravo', events: 1, source: 'Bravo' },
      ],
      config: { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'custom', priorityOrder },
    });
    const ok = validateMergeRequest(request(['cat-b', 'cat-a']));
    expect(ok.success).toBe(true);
    expect(ok.data!.config.priorityOrder).toEqual(['cat-b', 'cat-a']);

    const unknown = validateMergeRequest(request(['cat-b', 'cat-x']));
    expect(unknown.success).toBe(false);
    expect(unknown.errors!.issues[0].message).toMatch(/not one of the source catalogues/);

    const repeated = validateMergeRequest(request(['cat-b', 'cat-b']));
    expect(repeated.success).toBe(false);
    expect(repeated.errors!.issues[0].message).toMatch(/more than once/);
  });
});
