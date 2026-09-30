/** @jest-environment node */

/**
 * The engine reads the RUNNING network-authority table (contract M6 / M4): every ranking
 * inside mergeCatalogues / previewMerge consults the table loadMergeAuthority returned for
 * that call, code outside such a scope gets the built-in default, and merge_parameters
 * records which table a row was merged under.
 */

jest.mock('@/lib/db', () => ({
  dbQueries: {
    transaction: jest.fn(),
    insertCatalogue: jest.fn(),
    getEventsByCatalogueIdCursor: jest.fn(),
    getCatalogueById: jest.fn(),
    bulkInsertEvents: jest.fn(),
    updateCatalogueGeoBounds: jest.fn(),
    updateCatalogueEventCount: jest.fn(),
    updateCatalogueStatus: jest.fn(),
  },
}));
jest.mock('@/lib/merge-authority', () => {
  const actual = jest.requireActual('@/lib/merge-authority');
  return { ...actual, loadMergeAuthority: jest.fn(async () => actual.DEFAULT_MERGE_AUTHORITY) };
});

import {
  mergeCatalogues,
  previewMerge,
  getNetworkPriority,
  selectByNetworkAuthority,
  mergeEventGroup,
  DEFAULT_NETWORK_HIERARCHY,
  REGIONAL_PRIORITIES,
} from '@/lib/merge';
import { DEFAULT_MERGE_AUTHORITY, loadMergeAuthority, runWithMergeAuthority, type MergeAuthorityTable } from '@/lib/merge-authority';
import { dbQueries } from '@/lib/db';

const db = dbQueries as unknown as Record<string, jest.Mock>;
const load = loadMergeAuthority as jest.Mock;

const nz = (id: string, source: string, extra: Record<string, unknown> = {}): any => ({
  id, source, catalogueId: `cat-${id}`, time: '2020-01-01T00:00:00.000Z',
  latitude: -41.5, longitude: 174.5, depth: 20, magnitude: 4.5, magnitude_type: 'ML', ...extra,
});
const geonet = nz('gn', 'GeoNet', { agency_id: 'WEL' });
const isc = nz('isc', 'ISC', { agency_id: 'ISC', time: '2020-01-01T00:00:01.000Z' });

/** ISC outranks GeoNet everywhere, and no regional override exists. */
const ISC_FIRST: MergeAuthorityTable = {
  hierarchy: [
    { patterns: ['isc'], priority: 1, description: 'ISC first', agency: 'isc' },
    { patterns: ['geonet', 'gns'], priority: 2, description: 'GeoNet', agency: 'geonet' },
  ],
  regions: [],
  source: 'custom',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

describe('the running table', () => {
  it('is the default outside any merge, and the exported constants are that default', () => {
    expect(getNetworkPriority('ISC', isc)).toBe(3);
    expect(getNetworkPriority('GeoNet', geonet)).toBe(1);
    expect(DEFAULT_NETWORK_HIERARCHY).toBe(DEFAULT_MERGE_AUTHORITY.hierarchy);
    expect(Object.keys(REGIONAL_PRIORITIES)).toEqual(['NZ', 'JP']);
    expect(REGIONAL_PRIORITIES.NZ.bounds).toEqual(DEFAULT_MERGE_AUTHORITY.regions[0].bounds);
  });

  it('is consulted by every ranking inside runWithMergeAuthority', async () => {
    await runWithMergeAuthority(ISC_FIRST, async () => {
      expect(getNetworkPriority('ISC', isc)).toBe(1);
      expect(getNetworkPriority('GeoNet', geonet)).toBe(2);
      expect(selectByNetworkAuthority([geonet, isc]).id).toBe('isc');
      const merged: any = mergeEventGroup([geonet, isc], { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'authority' } as any);
      expect(merged.sourceEvents.find((s: any) => s.selected).originalData.id).toBe('isc');
      expect(JSON.parse(merged.merge_parameters).authority).toBe('custom@2026-09-01T12:00:00.000Z');
    });
    // The scope ended: the default is back, and the same config describes itself anew.
    expect(selectByNetworkAuthority([geonet, isc]).id).toBe('gn');
  });

  it('a custom regional override applies inside its box only', async () => {
    const table: MergeAuthorityTable = {
      ...ISC_FIRST,
      hierarchy: DEFAULT_MERGE_AUTHORITY.hierarchy,
      regions: [{
        name: 'Wellington', bounds: { minLat: -42, maxLat: -41, minLon: 174, maxLon: 175 },
        hierarchy: [{ patterns: ['isc'], priority: 1, agency: 'isc' }, { patterns: ['geonet'], priority: 2, agency: 'geonet' }],
      }],
    };
    await runWithMergeAuthority(table, async () => {
      expect(selectByNetworkAuthority([geonet, isc]).id).toBe('isc');
      const north = [{ ...geonet, latitude: -38 }, { ...isc, latitude: -38 }];
      expect(selectByNetworkAuthority(north).id).toBe('gn'); // outside the box: the global table
    });
  });
});

describe('mergeCatalogues and previewMerge load the table once and run under it', () => {
  const rows: Record<string, any[]> = {
    'cat-gn': [{ id: 'g1', catalogue_id: 'cat-gn', source_id: '2024p1', agency_id: 'WEL', time: '2024-01-01T00:00:00.000Z', latitude: -41.3, longitude: 174.8, depth: 20, magnitude: 4.1, magnitude_type: 'ML', source_events: '[]' }],
    'cat-isc': [{ id: 'i1', catalogue_id: 'cat-isc', source_id: '600001', agency_id: 'ISC', time: '2024-01-01T00:00:01.000Z', latitude: -41.32, longitude: 174.82, depth: 25, magnitude: 4.0, magnitude_type: 'mb', source_events: '[]' }],
  };
  const sources: any[] = [
    { id: 'cat-gn', name: 'GeoNet', events: 1, source: 'GeoNet' },
    { id: 'cat-isc', name: 'ISC', events: 1, source: 'ISC' },
  ];
  const config: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'authority' };

  beforeEach(() => {
    jest.clearAllMocks();
    load.mockResolvedValue(DEFAULT_MERGE_AUTHORITY);
    db.transaction.mockImplementation(async (fn: any) => fn({ id: 'session' }));
    db.getEventsByCatalogueIdCursor.mockImplementation(async (id: string) => ({
      data: rows[id] ?? [], pagination: { nextCursor: null, prevCursor: null, hasMore: false, limit: 10000 },
    }));
    db.getCatalogueById.mockResolvedValue(undefined);
    db.bulkInsertEvents.mockImplementation(async (saved: any[]) => saved.length);
  });

  const selectedOf = (row: any) => JSON.parse(row.source_events).find((s: any) => s.selected).originalData.id;

  it('the default table publishes GeoNet inside NZ and records authority "default"', async () => {
    await mergeCatalogues('Merged', sources, config, undefined, false, { createdBy: 'u' });
    const [row] = db.bulkInsertEvents.mock.calls[0][0];
    expect(selectedOf(row)).toBe('g1');
    expect(JSON.parse(row.merge_parameters).authority).toBe('default');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("an administrator's table changes the selection and is recorded by its save time", async () => {
    load.mockResolvedValue(ISC_FIRST);
    await mergeCatalogues('Merged', sources, config, undefined, false, { createdBy: 'u' });
    const [row] = db.bulkInsertEvents.mock.calls[0][0];
    expect(selectedOf(row)).toBe('i1');
    expect(JSON.parse(row.merge_parameters).authority).toBe('custom@2026-09-01T12:00:00.000Z');
  });

  it('the preview selects under the same loaded table', async () => {
    load.mockResolvedValue(ISC_FIRST);
    const preview = await previewMerge(sources, config);
    const group = preview.duplicateGroups.find(g => g.events.length === 2)!;
    expect(group.events[group.selectedEventIndex].id).toBe('i1');
    load.mockResolvedValue(DEFAULT_MERGE_AUTHORITY);
    const byDefault = await previewMerge(sources, config);
    const group2 = byDefault.duplicateGroups.find(g => g.events.length === 2)!;
    expect(group2.events[group2.selectedEventIndex].id).toBe('g1');
  });
});
