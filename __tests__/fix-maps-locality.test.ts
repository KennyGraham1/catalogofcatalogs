/**
 * The map event hover card: locality descriptions in GeoNet's form ("15 km north-east of
 * Gisborne") against the official place names of the LINZ New Zealand Gazetteer
 * (public/data/nz-localities.json, built by scripts/build-nz-localities.mjs), the
 * azimuthal-gap judgement, and the card's content.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  azimuthalGapQuality, compassDirection, describeLocality, distanceAndBearing,
  loadNzLocalities, resetNzLocalitiesForTests, type Locality,
} from '@/lib/nz-localities';
import { agencyEventLabel, buildEventCardHtml, eventCardTitle, newZealandLocalTime } from '@/lib/map-event-card';

const file = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'nz-localities.json'), 'utf8'));
const places: Locality[] = file.places.map(([name, latitude, longitude]: [string, number, number]) => ({ name, latitude, longitude }));

describe('the Gazetteer place list', () => {
  it('is the LINZ Gazetteer with its CC BY 4.0 credit, and covers settlements and remote islands', () => {
    expect(file.source).toMatch(/LINZ New Zealand Gazetteer/);
    expect(file.licence).toBe('CC BY 4.0');
    // Labelled places only (label_hierarchy <= 12): the places a map names.
    expect(places.length).toBeGreaterThan(400);
    expect(places.find(p => p.name === 'Hauwai')).toBeUndefined();
    const find = (name: string) => places.find(p => p.name === name);
    // Gazetteer NZGD2000 positions.
    expect(find('Gisborne')).toEqual({ name: 'Gisborne', latitude: -38.6619, longitude: 178.019 });
    expect(find('Seddon')).toBeDefined();
    expect(find('Raoul Island')).toBeDefined();
  });
});

describe('great-circle distance and bearing', () => {
  it('matches known New Zealand distances', () => {
    expect(distanceAndBearing(-41.29, 174.78, -43.53, 172.64).distanceKm).toBeCloseTo(304, -1);
    expect(distanceAndBearing(-36.85, 174.76, -41.29, 174.78).distanceKm).toBeCloseTo(494, -1);
  });

  it('names the eight compass points', () => {
    expect([0, 44, 90, 135, 180, 225, 270, 315, 359].map(compassDirection)).toEqual(
      ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north'],
    );
  });
});

describe('describeLocality against the Gazetteer', () => {
  it('describes the 2013 Seddon earthquake as GeoNet did (about 20 km east of Seddon)', () => {
    expect(describeLocality(-41.73, 174.28, places)).toMatch(/^(1[5-9]|2[0-2]) km east of Seddon$/);
  });

  it('describes a Kermadec event against Raoul Island, across 180 degrees', () => {
    expect(describeLocality(-29.5, -177.5, places)).toMatch(/km south-east of Raoul Island$/);
  });

  it('says "Near" within 3 km, withholds a description far from every place, and needs places', () => {
    expect(describeLocality(-38.6862, 176.071, places)).toBe('Near Taupō');
    expect(describeLocality(-33.87, 151.21, places)).toBeNull(); // Sydney
    expect(describeLocality(-38.66, 178.02, [])).toBeNull();
  });
});

describe('azimuthalGapQuality', () => {
  it('uses the 90 / 180 degree thresholds', () => {
    expect(azimuthalGapQuality(45)?.label).toBe('well constrained');
    expect(azimuthalGapQuality(150)?.label).toBe('moderately constrained');
    expect(azimuthalGapQuality(284)).toEqual({ label: 'poorly constrained', level: 'poor' });
    expect(azimuthalGapQuality(null)).toBeNull();
  });
});

describe('the hover card', () => {
  const event = {
    id: 'e1', time: '2026-03-01T05:06:29Z', latitude: -37.15, longitude: 179.43, depth: 5,
    magnitude: 3.0, magnitude_type: 'MLv', azimuthal_gap: 284, source_id: 'GeoNet:2026p160034',
  };

  it('shows locality, magnitude with type, depth, position, judged gap, UTC and NZ time, and the agency id', () => {
    const html = buildEventCardHtml(event, places);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toMatch(/km north-east of Te Araroa/);
    expect(text).toContain('MLv 3.0');
    expect(text).toContain('5.0 km');
    expect(text).toContain('37.150° S, 179.430° E');
    expect(text).toContain('284° · poorly constrained');
    expect(html).toContain('eq-card-gap-poor');
    expect(text).toContain('2026-03-01 05:06:29 UTC 1 Mar 18:06 NZDT (local)');
    expect(text).toContain('ID 2026p160034');
  });

  it('falls back to the stored region, then the epicentre, and escapes every value', () => {
    expect(eventCardTitle({ latitude: -33.87, longitude: 151.21, region: 'Tasman Sea' }, places)).toBe('Tasman Sea');
    expect(eventCardTitle({ latitude: -33.87, longitude: 151.21, region: 'Unknown' }, places)).toBe('33.87° S, 151.21° E');
    const html = buildEventCardHtml({ ...event, latitude: -33.87, longitude: 151.21, region: '<img src=x onerror=alert(1)>' }, places);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('gives New Zealand local time only for New Zealand events, and the bare agency id', () => {
    expect(newZealandLocalTime('2026-07-01T00:00:00Z')).toBe('1 Jul 12:00 NZST');
    // The local date is given because it often differs from the UTC date.
    expect(newZealandLocalTime('2024-10-28T16:31:59Z')).toBe('29 Oct 05:31 NZDT');
    const outside = buildEventCardHtml({ ...event, latitude: 35.0, longitude: 139.0 }, places);
    expect(outside).not.toContain('NZDT');
    expect(agencyEventLabel({ event_public_id: 'smi:nz.org.geonet/2026p160034' })).toBe('2026p160034');
  });
});

describe('loadNzLocalities', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; resetNzLocalitiesForTests(); });

  it('fetches the file once for every caller', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => file })) as unknown as typeof fetch;
    const [a, b] = await Promise.all([loadNzLocalities(), loadNzLocalities()]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(a.length).toBe(places.length);
  });

  it('resolves to no places on failure, and tries again next time', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await loadNzLocalities()).toEqual([]);
    await loadNzLocalities();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('never throws, even where fetch is missing (a map must render without its place names)', async () => {
    (global as { fetch?: typeof fetch }).fetch = undefined;
    expect(() => loadNzLocalities()).not.toThrow();
    expect(await loadNzLocalities()).toEqual([]);
  });
});
