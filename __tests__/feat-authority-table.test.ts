/**
 * @jest-environment node
 *
 * lib/merge-authority: the network-authority table the merge engine ranks reports with,
 * now editable by administrators (contract M6). The default must be byte-for-byte the
 * constants the engine shipped with, the validator must refuse what the engine could never
 * match, and the AsyncLocalStorage scope must keep one merge's table away from another's.
 */
import {
  AGENCY_KEYS,
  DEFAULT_MERGE_AUTHORITY,
  currentMergeAuthority,
  parseMergeAuthorityTable,
  runWithMergeAuthority,
} from '@/lib/merge-authority';
import { NZ_NATIONAL_BOUNDS } from '@/lib/geo-bounds-utils';

describe('DEFAULT_MERGE_AUTHORITY', () => {
  it('reproduces the engine\'s former DEFAULT_NETWORK_HIERARCHY', () => {
    expect(DEFAULT_MERGE_AUTHORITY.hierarchy).toEqual([
      { patterns: ['geonet', 'gns'], priority: 1, region: 'NZ', description: 'GeoNet (NZ authoritative)', agency: 'geonet' },
      { patterns: ['gcmt', 'cmt', 'globalcmt'], priority: 2, description: 'Global CMT', agency: 'gcmt' },
      { patterns: ['isc', 'iscgem'], priority: 3, description: 'ISC/ISC-GEM', agency: 'isc' },
      { patterns: ['usgs', 'neic', 'anss', 'comcat'], priority: 4, description: 'USGS/NEIC', agency: 'usgs' },
      { patterns: ['emsc', 'csem'], priority: 5, description: 'EMSC', agency: 'emsc' },
      { patterns: ['jma'], priority: 6, region: 'JP', description: 'JMA', agency: 'jma' },
      { patterns: ['geofon', 'gfz'], priority: 7, description: 'GEOFON/GFZ', agency: 'geofon' },
      { patterns: ['iris'], priority: 8, description: 'IRIS', agency: 'iris' },
      { patterns: ['ingv'], priority: 9, region: 'IT', description: 'INGV (Italy)', agency: 'ingv' },
      { patterns: ['ign'], priority: 10, region: 'ES', description: 'IGN (Spain)', agency: 'ign' },
    ]);
    expect(DEFAULT_MERGE_AUTHORITY.source).toBe('default');
    expect(DEFAULT_MERGE_AUTHORITY.updatedAt).toBeNull();
  });

  it('reproduces the former REGIONAL_PRIORITIES (NZ from NZ_NATIONAL_BOUNDS, crossing the date line)', () => {
    expect(DEFAULT_MERGE_AUTHORITY.regions.map(r => r.name)).toEqual(['NZ', 'JP']);
    const [nz, jp] = DEFAULT_MERGE_AUTHORITY.regions;
    expect(nz.bounds).toEqual({
      minLat: NZ_NATIONAL_BOUNDS.minLatitude,
      maxLat: NZ_NATIONAL_BOUNDS.maxLatitude,
      minLon: NZ_NATIONAL_BOUNDS.minLongitude,
      maxLon: NZ_NATIONAL_BOUNDS.maxLongitude,
    });
    expect(nz.bounds.minLon).toBeGreaterThan(nz.bounds.maxLon);
    expect(nz.hierarchy).toEqual([
      { patterns: ['geonet', 'gns'], priority: 1, agency: 'geonet' },
      { patterns: ['gcmt', 'cmt'], priority: 2, agency: 'gcmt' },
      { patterns: ['isc'], priority: 3, agency: 'isc' },
      { patterns: ['usgs', 'neic'], priority: 4, agency: 'usgs' },
    ]);
    expect(jp.bounds).toEqual({ minLat: 24, maxLat: 46, minLon: 122, maxLon: 154 });
    expect(jp.hierarchy).toEqual([
      { patterns: ['jma'], priority: 1, agency: 'jma' },
      { patterns: ['gcmt', 'cmt'], priority: 2, agency: 'gcmt' },
      { patterns: ['isc'], priority: 3, agency: 'isc' },
      { patterns: ['usgs', 'neic'], priority: 4, agency: 'usgs' },
    ]);
  });

  it('is frozen so a caller cannot change the default for every later merge', () => {
    expect(Object.isFrozen(DEFAULT_MERGE_AUTHORITY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MERGE_AUTHORITY.hierarchy)).toBe(true);
    expect(Object.isFrozen(DEFAULT_MERGE_AUTHORITY.regions[0].bounds)).toBe(true);
    expect(() => { (DEFAULT_MERGE_AUTHORITY.hierarchy as unknown[]).push({}); }).toThrow();
  });

  it('lists every AgencyKey the default table uses', () => {
    expect(AGENCY_KEYS).toEqual(['geonet', 'gcmt', 'isc', 'usgs', 'emsc', 'jma', 'geofon', 'iris', 'ingv', 'ign', 'bgr']);
    for (const entry of DEFAULT_MERGE_AUTHORITY.hierarchy) expect(AGENCY_KEYS).toContain(entry.agency);
  });

  it('validates as a custom table when submitted unchanged', () => {
    const parsed = parseMergeAuthorityTable({ hierarchy: DEFAULT_MERGE_AUTHORITY.hierarchy, regions: DEFAULT_MERGE_AUTHORITY.regions });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.hierarchy).toEqual(DEFAULT_MERGE_AUTHORITY.hierarchy);
    expect(parsed.table.regions).toEqual(DEFAULT_MERGE_AUTHORITY.regions);
    expect(parsed.table.source).toBe('custom');
    expect(parsed.table.updatedAt).toBeNull();
  });
});

describe('parseMergeAuthorityTable', () => {
  const good = {
    hierarchy: [
      { patterns: ['GeoNet', 'gns', 'geonet'], priority: 1, description: 'GeoNet', agency: 'geonet', region: 'NZ' },
      { patterns: ['usgs'], priority: 2, description: 'USGS' },
    ],
    regions: [
      {
        name: 'Kermadec',
        // West edge east of the east edge: a box crossing 180.
        bounds: { minLat: -40, maxLat: -25, minLon: 170, maxLon: -170 },
        hierarchy: [{ patterns: ['GEONET'], priority: 1, agency: 'geonet' }, { patterns: ['usgs'], priority: 2 }],
      },
    ],
  };

  it('accepts a good table, lower-casing and de-duplicating patterns', () => {
    const parsed = parseMergeAuthorityTable(good);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.hierarchy[0]).toEqual({ patterns: ['geonet', 'gns'], priority: 1, description: 'GeoNet', agency: 'geonet', region: 'NZ' });
    expect(parsed.table.hierarchy[1]).toEqual({ patterns: ['usgs'], priority: 2, description: 'USGS' });
    expect(parsed.table.hierarchy[1]).not.toHaveProperty('agency');
    expect(parsed.table.regions[0].hierarchy[0]).toEqual({ patterns: ['geonet'], priority: 1, agency: 'geonet' });
    expect(parsed.table.regions[0].bounds).toEqual({ minLat: -40, maxLat: -25, minLon: 170, maxLon: -170 });
  });

  it('accepts a table without regions and ignores the GET-only keys so a client can PUT back what it fetched', () => {
    const parsed = parseMergeAuthorityTable({ hierarchy: good.hierarchy, source: 'custom', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.table.regions).toEqual([]);
    expect(parsed.table.updatedAt).toBeNull();
  });

  it.each<[string, unknown, RegExp]>([
    ['a non-object', null, /Invalid authority table/],
    ['an empty hierarchy', { hierarchy: [] }, /hierarchy: at least one/],
    ['51 hierarchy entries', { hierarchy: Array.from({ length: 51 }, () => ({ patterns: ['a'], priority: 1 })) }, /hierarchy: at most 50/],
    ['an entry with no patterns', { hierarchy: [{ patterns: [], priority: 1 }] }, /hierarchy\.0\.patterns: at least one/],
    ['a pattern with a space (the engine matches whole words)', { hierarchy: [{ patterns: ['geo net'], priority: 1 }] }, /hierarchy\.0\.patterns\.0: .*single word/],
    ['a pattern with punctuation', { hierarchy: [{ patterns: ['isc-gem'], priority: 1 }] }, /patterns\.0: .*single word/],
    ['a 41-character pattern', { hierarchy: [{ patterns: ['a'.repeat(41)], priority: 1 }] }, /patterns\.0: .*40 characters/],
    ['11 patterns', { hierarchy: [{ patterns: Array.from({ length: 11 }, (_, i) => `p${i}`), priority: 1 }] }, /patterns: at most 10/],
    ['priority 0', { hierarchy: [{ patterns: ['a'], priority: 0 }] }, /priority: .*between 1 and 1000/],
    ['priority 1001', { hierarchy: [{ patterns: ['a'], priority: 1001 }] }, /priority: .*between 1 and 1000/],
    ['a fractional priority', { hierarchy: [{ patterns: ['a'], priority: 1.5 }] }, /priority: .*whole number/],
    ['a priority given as a string', { hierarchy: [{ patterns: ['a'], priority: '1' }] }, /priority: .*number/],
    ['an unknown agency', { hierarchy: [{ patterns: ['a'], priority: 1, agency: 'nasa' }] }, /agency: agency must be one of geonet/],
    ['a 121-character description', { hierarchy: [{ patterns: ['a'], priority: 1, description: 'x'.repeat(121) }] }, /description: .*120/],
    ['21 regions', { hierarchy: good.hierarchy, regions: Array.from({ length: 21 }, () => good.regions[0]) }, /regions: at most 20/],
    ['a region without a name', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], name: '' }] }, /regions\.0\.name/],
    ['a 61-character region name', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], name: 'r'.repeat(61) }] }, /regions\.0\.name: .*60/],
    ['a latitude outside -90..90', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], bounds: { ...good.regions[0].bounds, maxLat: 91 } }] }, /bounds\.maxLat/],
    ['a longitude outside -180..180', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], bounds: { ...good.regions[0].bounds, minLon: 181 } }] }, /bounds\.minLon/],
    ['minLat above maxLat', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], bounds: { minLat: 10, maxLat: 0, minLon: 0, maxLon: 10 } }] }, /bounds\.minLat: minLat must not exceed maxLat/],
    ['a region with an empty hierarchy', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], hierarchy: [] }] }, /regions\.0\.hierarchy: .*at least one/],
    ['a region entry with a description (regional entries carry none)', { hierarchy: good.hierarchy, regions: [{ ...good.regions[0], hierarchy: [{ patterns: ['a'], priority: 1, description: 'x' }] }] }, /regions\.0\.hierarchy\.0/],
  ])('rejects %s with a readable message', (_label, input, message) => {
    const parsed = parseMergeAuthorityTable(input);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toMatch(/^Invalid authority table: /);
    expect(parsed.error).toMatch(message);
  });
});

describe('runWithMergeAuthority / currentMergeAuthority', () => {
  const custom = { ...DEFAULT_MERGE_AUTHORITY, hierarchy: [{ patterns: ['usgs'], priority: 1, description: 'USGS first' }], source: 'custom' as const, updatedAt: '2026-05-01T00:00:00.000Z' };

  it('answers the default outside any run', () => {
    expect(currentMergeAuthority()).toBe(DEFAULT_MERGE_AUTHORITY);
  });

  it('answers the running table inside, across awaits, and the default again afterwards', async () => {
    const seen = await runWithMergeAuthority(custom, async () => {
      const before = currentMergeAuthority();
      await new Promise(resolve => setTimeout(resolve, 5));
      const after = currentMergeAuthority();
      return { before, after, result: 42 };
    });
    expect(seen.before).toBe(custom);
    expect(seen.after).toBe(custom);
    expect(seen.result).toBe(42);
    expect(currentMergeAuthority()).toBe(DEFAULT_MERGE_AUTHORITY);
  });

  it('keeps two concurrent runs apart', async () => {
    const other = { ...custom, updatedAt: '2026-06-01T00:00:00.000Z' };
    const [a, b] = await Promise.all([
      runWithMergeAuthority(custom, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return currentMergeAuthority();
      }),
      runWithMergeAuthority(other, async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return currentMergeAuthority();
      }),
    ]);
    expect(a).toBe(custom);
    expect(b).toBe(other);
  });

  it('propagates the callback\'s rejection and leaves no table behind', async () => {
    await expect(runWithMergeAuthority(custom, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(currentMergeAuthority()).toBe(DEFAULT_MERGE_AUTHORITY);
  });
});
