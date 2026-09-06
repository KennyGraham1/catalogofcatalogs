/**
 * Regression tests for lib/fault-data.ts against the shipped AF250 fault layer.
 *
 * The module used to declare upper-case property names (NAME, SLIP_TYPE, ...)
 * that appear nowhere in public/data/nz-active-faults.geojson, and getFaultColor
 * took a descriptive `string` while the file stores slip_type as an integer
 * coded-domain value — so every fault resolved to the 'unknown' colour, and any
 * caller that did pass the real value would have thrown on `.toLowerCase()`.
 *
 * The expected code-to-sense mapping is derived independently of the code under
 * test, from faults whose sense of movement is established in the literature:
 * dextral (1) Alpine/Wellington/Awatere/Clarence/Wairau, normal (2) Taupo Rift
 * faults Paeroa/Ngakuru/Rangipo/Kaiapo/Edgecumbe, reverse (3) Central Otago
 * range-front faults Dunstan/Pisa/Nevis/Cardrona/Akatore, sinistral (4) the
 * Papatea and Leader faults of the 2016 Kaikoura rupture.
 */

import fs from 'fs';
import path from 'path';
import {
  getFaultColor,
  getFaultSlipTypeName,
  AF250_SLIP_TYPE_CODES,
  getFaultsInBounds,
  simplifyFaultsForZoom,
  type FaultCollection,
  type FaultFeature,
} from '@/lib/fault-data';

const FAULT_FILE = path.join(process.cwd(), 'public', 'data', 'nz-active-faults.geojson');

const mls = (lines: number[][][], properties: FaultFeature['properties'] = {}): FaultFeature => ({
  type: 'Feature',
  geometry: { type: 'MultiLineString', coordinates: lines },
  properties,
});

describe('AF250 slip-type decoding', () => {
  it('maps each code to its documented sense of movement', () => {
    expect(AF250_SLIP_TYPE_CODES[0]).toBe('unknown');
    expect(AF250_SLIP_TYPE_CODES[1]).toBe('dextral');
    expect(AF250_SLIP_TYPE_CODES[2]).toBe('normal');
    expect(AF250_SLIP_TYPE_CODES[3]).toBe('reverse');
    expect(AF250_SLIP_TYPE_CODES[4]).toBe('sinistral');
  });

  it('resolves numeric codes, and treats 0 / out-of-domain as unrecorded', () => {
    expect(getFaultSlipTypeName(1)).toBe('dextral');
    expect(getFaultSlipTypeName(2)).toBe('normal');
    expect(getFaultSlipTypeName(3)).toBe('reverse');
    expect(getFaultSlipTypeName(4)).toBe('sinistral');
    expect(getFaultSlipTypeName(0)).toBeUndefined();
    expect(getFaultSlipTypeName(9)).toBeUndefined();
    expect(getFaultSlipTypeName(null)).toBeUndefined();
    expect(getFaultSlipTypeName(undefined)).toBeUndefined();
  });

  it('passes descriptive strings through unchanged', () => {
    expect(getFaultSlipTypeName('Reverse')).toBe('Reverse');
    expect(getFaultSlipTypeName('   ')).toBeUndefined();
  });
});

describe('getFaultColor', () => {
  it('gives each AF250 slip-type code its own colour', () => {
    expect(getFaultColor(1)).toBe('#ffaa00'); // dextral
    expect(getFaultColor(2)).toBe('#4444ff'); // normal
    expect(getFaultColor(3)).toBe('#ff4444'); // reverse
    expect(getFaultColor(4)).toBe('#aa00ff'); // sinistral
    const distinct = new Set([1, 2, 3, 4].map((c) => getFaultColor(c)));
    expect(distinct.size).toBe(4);
  });

  it('falls back to red for unrecorded, missing or out-of-domain senses', () => {
    expect(getFaultColor(0)).toBe('#ff0000');
    expect(getFaultColor(9)).toBe('#ff0000');
    expect(getFaultColor(undefined)).toBe('#ff0000');
    expect(getFaultColor(null)).toBe('#ff0000');
  });

  it('does not throw when handed the numeric value the GeoJSON actually stores', () => {
    const feature = mls([[[174, -41]]], { name: 'Test Fault', slip_type: 3 });
    expect(() => getFaultColor(feature.properties.slip_type)).not.toThrow();
    expect(getFaultColor(feature.properties.slip_type)).toBe('#ff4444');
  });

  it('still accepts descriptive strings from other fault sources', () => {
    expect(getFaultColor('Reverse')).toBe('#ff4444');
    expect(getFaultColor('normal')).toBe('#4444ff');
    expect(getFaultColor('strike-slip')).toBe('#44ff44');
    expect(getFaultColor('dextral')).toBe('#ffaa00');
    expect(getFaultColor('sinistral')).toBe('#aa00ff');
  });
});

describe('MultiLineString geometry handling', () => {
  it('selects faults with a vertex inside the box and rejects those outside', () => {
    const inside = mls([[[174.0, -41.0], [174.1, -41.1]]], { name: 'Inside' });
    const outside = mls([[[170.0, -45.0], [170.1, -45.1]]], { name: 'Outside' });
    const collection: FaultCollection = { type: 'FeatureCollection', features: [inside, outside] };

    const hits = getFaultsInBounds(collection, { north: -40, south: -42, east: 175, west: 173 });
    expect(hits).toHaveLength(1);
    expect(hits[0].properties.name).toBe('Inside');
  });

  it('sums length across every part of a MultiLineString when filtering by zoom', () => {
    // Great-circle length of 1° of longitude at latitude -41 is 83.9 km
    // (spherical law of cosines, R = 6371 km); 0.4° is 33.6 km; 0.05° is 4.2 km.
    const long = mls([[[174.0, -41.0], [175.0, -41.0]]], { name: 'Long' }); // 83.9 km
    const medium = mls([[[174.0, -41.0], [174.4, -41.0]]], { name: 'Medium' }); // 33.6 km
    const short = mls([[[174.0, -41.0], [174.05, -41.0]]], { name: 'Short' }); // 4.2 km
    // Two 0.4° parts in one MultiLineString total 67.1 km, so it must survive zoom 6.
    const twoPart = mls(
      [
        [[174.0, -41.0], [174.4, -41.0]],
        [[176.0, -41.0], [176.4, -41.0]],
      ],
      { name: 'TwoPart' }
    );
    const faults = [long, medium, short, twoPart];

    const names = (fs_: FaultFeature[]) => fs_.map((f) => f.properties.name);
    expect(names(simplifyFaultsForZoom(faults, 6)).sort()).toEqual(['Long', 'TwoPart']);
    expect(names(simplifyFaultsForZoom(faults, 8)).sort()).toEqual(['Long', 'Medium', 'TwoPart']);
    expect(names(simplifyFaultsForZoom(faults, 10))).toHaveLength(4);
  });
});

describe('shipped nz-active-faults.geojson matches the declared schema', () => {
  const available = fs.existsSync(FAULT_FILE);
  const load = (): FaultCollection => JSON.parse(fs.readFileSync(FAULT_FILE, 'utf8'));

  (available ? it : it.skip)('uses lower-case keys, MultiLineString geometry and integer slip types', () => {
    const data = load();
    expect(data.features.length).toBeGreaterThan(10000);

    const geometryTypes = new Set(data.features.map((f) => f.geometry.type));
    expect(Array.from(geometryTypes)).toEqual(['MultiLineString']);

    const codes = new Set<number>();
    const allKeys = new Set<string>();
    let nonNumericSlipTypes = 0;
    for (const f of data.features) {
      const props = f.properties as Record<string, unknown>;
      for (const key of Object.keys(props)) allKeys.add(key);
      if (typeof props.slip_type !== 'number') nonNumericSlipTypes++;
      codes.add(props.slip_type as number);
    }
    expect(nonNumericSlipTypes).toBe(0);
    expect(allKeys.has('SLIP_TYPE')).toBe(false);
    expect(allKeys.has('NAME')).toBe(false);
    expect(allKeys.has('slip_type')).toBe(true);
    expect(allKeys.has('name')).toBe(true);
    // No upper-case attribute names anywhere in the layer.
    expect(Array.from(allKeys).filter((k) => k === k.toUpperCase() && /[A-Z]/.test(k))).toEqual([]);
    // Every code present in the file must be one the module knows how to decode.
    Array.from(codes).forEach((code) => {
      expect(Object.prototype.hasOwnProperty.call(AF250_SLIP_TYPE_CODES, code)).toBe(true);
    });
    expect(codes.size).toBeGreaterThan(1);
  });

  (available ? it : it.skip)('colours faults by sense instead of painting them all unknown-red', () => {
    const data = load();
    const colours = new Map<string, number>();
    for (const f of data.features) {
      const colour = getFaultColor(f.properties.slip_type);
      colours.set(colour, (colours.get(colour) ?? 0) + 1);
    }
    // Before the fix this was a single entry: '#ff0000' for all 10,269 faults.
    expect(colours.size).toBe(5);
    // Faults with a recorded sense must outnumber the unrecorded ones.
    const unknown = colours.get('#ff0000') ?? 0;
    expect(unknown).toBeLessThan(data.features.length / 2);
  });

  (available ? it : it.skip)('assigns the codes that faults of known sense should carry', () => {
    const data = load();
    const codeFor = (name: string): Set<number> => {
      const found = new Set<number>();
      for (const f of data.features) {
        if (f.properties.name === name && typeof f.properties.slip_type === 'number') {
          found.add(f.properties.slip_type);
        }
      }
      return found;
    };
    const majority = (name: string): number => {
      const counts = new Map<number, number>();
      for (const f of data.features) {
        if (f.properties.name !== name) continue;
        const c = f.properties.slip_type as number;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    };

    // Dextral strike-slip faults of the Marlborough / North Island.
    for (const name of ['Alpine Fault', 'Wellington Fault', 'Awatere Fault', 'Clarence Fault']) {
      expect(codeFor(name).size).toBeGreaterThan(0);
      expect(getFaultSlipTypeName(majority(name))).toBe('dextral');
    }
    // Normal faults of the Taupo Rift.
    for (const name of ['Paeroa Fault', 'Ngakuru Fault', 'Rangipo Fault', 'Kaiapo Fault']) {
      expect(getFaultSlipTypeName(majority(name))).toBe('normal');
    }
    // Reverse range-front faults of Central Otago.
    for (const name of ['Dunstan Fault', 'Pisa Fault', 'Nevis Fault', 'Cardrona Fault']) {
      expect(getFaultSlipTypeName(majority(name))).toBe('reverse');
    }
  });
});
