/**
 * @jest-environment node
 *
 * Upload field-mapping detection (lib/field-definitions.ts) and the alias table the
 * parser shares with it.
 *
 *  - #33: substring matching sent common seismological headers to the wrong fields
 *    (Ms -> standard_error via 'rms', min -> semi-minor axis via 'smin', az -> ellipse
 *    azimuth) and 'depth_m' was never a parser alias, so its metres were not converted.
 *  - #38: 'type' was a magnitude_type alias, so a USGS-style event-type column
 *    ('earthquake', 'quarry blast') was stored as the magnitude scale.
 *  - gap gc#1: a Settings rule's priority was used as its confidence and gated by the
 *    fuzzy threshold, and a rejected rule hid the built-in detection for that header.
 */

import {
  detectFieldMapping,
  detectAllFieldMappings,
  detectFieldMappingWithCustom,
  magnitudeScaleFromColumnName,
  isKnownTargetField,
  resolveHeaderAlias,
  resolveParserFieldSources,
  computeFileMappingChanges,
  hasNestedQuantifier,
  parseFieldMappingsConfig,
  type CustomFieldMapping,
} from '@/lib/field-definitions';
import { parseCSV, parseJSON } from '@/lib/parsers';
import { parsedEventToDbFields } from '@/lib/parsed-event-to-db';

const rule = (sourcePattern: string, targetField: string, priority: number, isRegex = false): CustomFieldMapping => ({
  id: `${sourcePattern}-${targetField}`,
  sourcePattern,
  targetField,
  isRegex,
  priority,
});

describe('#33 detection never matches inside a word', () => {
  it.each(['Ms', 'ms', 'MS'])('surface-wave magnitude column %s is not the RMS residual', (header) => {
    expect(detectFieldMapping(header).targetField).toBeNull();
  });

  it.each(['mb', 'Md', 'mB', 'Mwp', 'mb_Lg'])('scale-named column %s is never guessed', (header) => {
    expect(detectFieldMapping(header).targetField).toBeNull();
  });

  it.each(['min', 'sec', 'hr', 'mo', 'dy', 'yr', 'minute', 'second'])(
    'split-time component %s is not mapped to a schema field', (header) => {
      expect(detectFieldMapping(header).targetField).toBeNull();
    });

  it('does not map an unqualified azimuth to the error-ellipse azimuth', () => {
    expect(detectFieldMapping('az').targetField).toBeNull();
    expect(detectFieldMapping('azimuth').targetField).toBeNull();
  });

  it('matches whole words surrounded by units or descriptors, as a fuzzy guess', () => {
    const result = detectFieldMapping('event_latitude');
    expect(result.targetField).toBe('latitude');
    expect(result.matchType).toBe('fuzzy');
    expect(detectFieldMapping('origin_time_utc').targetField).toBe('time');
  });

  it('does not match a field name qualified by another quantity', () => {
    expect(detectFieldMapping('depth_err').targetField).not.toBe('depth');
    expect(detectFieldMapping('magnitude_err').targetField).not.toBe('magnitude');
    expect(detectFieldMapping('latitude_error').targetField).not.toBe('latitude');
  });

  it('knows the metre and kilometre depth spellings as aliases', () => {
    for (const header of ['depth_m', 'depth (m)', 'depth_metres', 'depth (km)', 'depth_km']) {
      const result = detectFieldMapping(header);
      expect(result.targetField).toBe('depth');
      expect(result.matchType).not.toBe('fuzzy');
    }
  });

  it('maps the split-time catalogue of the finding without inventing uncertainties', () => {
    const mappings = detectAllFieldMappings(
      ['year', 'month', 'day', 'hour', 'min', 'sec', 'latitude', 'longitude', 'depth_m', 'magnitude', 'ms'],
      0.6,
    );
    expect(mappings).toEqual({ latitude: 'latitude', longitude: 'longitude', depth_m: 'depth', magnitude: 'magnitude' });
  });

  it('the parser converts a depth_m column from metres once for the whole file', () => {
    const csv = [
      'year,month,day,hour,min,sec,latitude,longitude,depth_m,magnitude',
      '2019,6,1,3,45,1.0,-38.7,176.1,800,2.1',
      '2019,6,1,4,10,2.0,-38.8,176.2,15110,2.4',
    ].join('\n');
    const result = parseCSV(csv, ',', 'International');
    expect(result.events).toHaveLength(2);
    expect(result.events[0].depth).toBeCloseTo(0.8, 10);
    expect(result.events[1].depth).toBeCloseTo(15.11, 10);
    expect(result.events[0].time).toBe('2019-06-01T03:45:01.000Z');
    const stored = parsedEventToDbFields(result.events[0]);
    expect(stored.min_horizontal_uncertainty).toBeUndefined();
    expect(stored.standard_error).toBeUndefined();
  });

  it('keeps the existing alias detections', () => {
    expect(detectFieldMapping('lat').targetField).toBe('latitude');
    expect(detectFieldMapping('evdp').targetField).toBe('depth');
    expect(detectFieldMapping('rms').targetField).toBe('standard_error');
    expect(detectFieldMapping('horiz_unc').targetField).toBe('horizontal_uncertainty');
    expect(detectFieldMapping('smin').targetField).toBe('min_horizontal_uncertainty');
    expect(detectFieldMapping('mindist').targetField).toBe('minimum_distance');
  });
});

describe('#38 a bare type column is the event type', () => {
  it('detects type as event_type', () => {
    expect(detectFieldMapping('type').targetField).toBe('event_type');
  });

  it('stores a USGS-style event type as event_type, not as the magnitude scale', () => {
    const csv = 'time,latitude,longitude,depth,mag,type\n2024-01-01T00:00:00Z,-41,174,10,4.1,earthquake\n2024-01-02T00:00:00Z,-41,174,10,2.1,quarry blast';
    const events = parseCSV(csv, ',', 'International').events;
    const rows = events.map(e => parsedEventToDbFields(e));
    expect(rows.map(r => r.event_type)).toEqual(['earthquake', 'quarry blast']);
    expect(rows.map(r => r.magnitude_type)).toEqual([undefined, undefined]);
  });

  it('keeps both the scale and the event type of a ComCat CSV whatever the column order', () => {
    for (const header of ['time,latitude,longitude,depth,mag,magType,type', 'time,latitude,longitude,depth,mag,type,magType']) {
      const row = header.endsWith('magType')
        ? '2024-01-01T00:00:00Z,-41,174,10,2.1,quarry blast,ml'
        : '2024-01-01T00:00:00Z,-41,174,10,2.1,ml,quarry blast';
      const [event] = parseCSV(`${header}\n${row}`, ',', 'International').events;
      const stored = parsedEventToDbFields(event);
      expect(stored.event_type).toBe('quarry blast');
      expect(stored.magnitude_type).toBe('ml');
    }
  });

  it('JSON with type before magType keeps the real scale', () => {
    const [event] = parseJSON(JSON.stringify([{ time: '2024-01-01T00:00:00Z', latitude: -41, longitude: 174, mag: 3, type: 'earthquake', magType: 'mb' }])).events;
    const stored = parsedEventToDbFields(event);
    expect(stored.magnitude_type).toBe('mb');
    expect(stored.event_type).toBe('earthquake');
  });

  it('a type column holding scale codes still ends up as the magnitude type', () => {
    const [event] = parseCSV('time,latitude,longitude,mag,type\n2024-01-01T00:00:00Z,-41,174,3.2,ML', ',', 'International').events;
    const stored = parsedEventToDbFields(event);
    expect(stored.magnitude_type).toBe('ML');
    expect(stored.event_type).toBeUndefined();
  });
});

describe('#44 detection follows the parser magnitude preference', () => {
  it('a generic magnitude column beats an ML column', () => {
    const mappings = detectAllFieldMappings(['mag', 'magtype', 'ml']);
    expect(mappings.mag).toBe('magnitude');
    expect(mappings.ml).toBeUndefined();
  });

  it('an Mw column beats the generic magnitude', () => {
    const mappings = detectAllFieldMappings(['magnitude', 'mw']);
    expect(mappings.mw).toBe('magnitude');
    expect(mappings.magnitude).toBeUndefined();
  });

  it('names the scale of a magnitude column', () => {
    expect(magnitudeScaleFromColumnName('mw')).toBe('Mw');
    expect(magnitudeScaleFromColumnName('ML')).toBe('ML');
    expect(magnitudeScaleFromColumnName('ms')).toBe('Ms');
    expect(magnitudeScaleFromColumnName('mB')).toBe('mB');
    expect(magnitudeScaleFromColumnName('MB')).toBe('mb');
    expect(magnitudeScaleFromColumnName('mag')).toBeNull();
    expect(magnitudeScaleFromColumnName('m')).toBeNull();
  });
});

describe('gc#1 Settings rules are explicit matches, not confidences', () => {
  it('a low-priority rule still applies at the default threshold', () => {
    const mappings = detectAllFieldMappings(['time', 'lat', 'lon', 'z', 'mag'], 0.6, {
      customMappings: [rule('z', 'depth', 5)],
      minConfidence: 0.6,
    });
    expect(mappings.z).toBe('depth');
  });

  it('the fuzzy threshold does not reject an explicit rule', () => {
    const mappings = detectAllFieldMappings(['profondeur', 'time', 'lat', 'lon', 'mag'], 0.8, {
      customMappings: [rule('profondeur', 'depth', 75)],
      minConfidence: 0.8,
    });
    expect(mappings.profondeur).toBe('depth');
  });

  it('saved rules do not shadow the built-in aliases at a strict threshold', () => {
    const mappings = detectAllFieldMappings(['evid', 'time', 'evla', 'evlo', 'evdp', 'mag'], 0.95, {
      customMappings: [rule('evla', 'latitude', 90), rule('evlo', 'longitude', 90), rule('evdp', 'depth', 90)],
      minConfidence: 0.95,
    });
    expect(mappings).toMatchObject({ evla: 'latitude', evlo: 'longitude', evdp: 'depth', time: 'time', mag: 'magnitude', evid: 'id' });
  });

  it('the threshold only gates fuzzy guesses', () => {
    const mappings = detectAllFieldMappings(['lat', 'event_longitude'], 1.0);
    expect(mappings.lat).toBe('latitude');
    expect(mappings.event_longitude).toBeUndefined();
  });

  it('a rule whose target is already taken falls back to the built-in detection', () => {
    const mappings = detectAllFieldMappings(['depth', 'herr'], 0.6, {
      customMappings: [rule('depth', 'depth', 100), rule('herr', 'depth', 50)],
    });
    expect(mappings.depth).toBe('depth');
    expect(mappings.herr).toBe('horizontal_uncertainty');
  });

  it('priority orders competing rules', () => {
    const result = detectFieldMappingWithCustom('x', [rule('x', 'depth', 10), rule('x', 'magnitude', 90)]);
    expect(result).toMatchObject({ targetField: 'magnitude', confidence: 1, matchType: 'custom' });
  });

  it('a malformed saved rule matches nothing instead of throwing', () => {
    const broken = [
      { id: 'a', targetField: 'depth', isRegex: false, priority: 50 } as unknown as CustomFieldMapping,
      rule('(unclosed', 'depth', 50, true),
      rule('lat', 'not_a_field', 100),
    ];
    expect(() => detectAllFieldMappings(['lat', 'z'], 0.6, { customMappings: broken })).not.toThrow();
    expect(detectAllFieldMappings(['lat', 'z'], 0.6, { customMappings: broken })).toEqual({ lat: 'latitude', z: 'depth' });
    expect(isKnownTargetField('not_a_field')).toBe(false);
    expect(isKnownTargetField('horizontal_uncertainty')).toBe(true);
  });
});

describe('the schema step resolves headers exactly as the parser does', () => {
  // lib/parsers.ts lookupAlias: exact, lower case, normalised name, then a bracketed unit
  // the field is stored in or converted from. resolveHeaderAlias replays it for the UI.
  const csv = [
    'Event ID,Origin Time,Latitude,Longitude,Depth (km),Magnitude,Horizontal Error (m),Origin Time (NZST),Lat Error (km)',
    'e1,2024-01-01T00:00:00Z,-41,174,12,3.1,800,2024-01-01 13:00,1.5',
  ].join('\n');
  const parsed = parseCSV(csv, ',', 'International');

  it.each([
    ['origin time', 'time'],
    ['depth (km)', 'depth'],
    ['horizontal error (m)', 'horizontal_uncertainty'],
    ['event id', 'id'],
  ])('%s maps to %s outright, as in the parser', (header, target) => {
    expect(parsed.resolvedFieldSources[target]).toBe(header);
    expect(resolveHeaderAlias(header)).toBe(target);
    const detected = detectFieldMapping(header);
    expect(detected.targetField).toBe(target);
    expect(detected.matchType).not.toBe('fuzzy');
  });

  it.each(['origin time (nzst)', 'lat error (km)'])('%s is not mapped: its unit is not one the field accepts', (header) => {
    expect(Object.values(parsed.resolvedFieldSources)).not.toContain(header);
    expect(resolveHeaderAlias(header)).toBeUndefined();
  });

  it('the displayed resolution is the parser\'s, and an untouched mapping changes nothing', () => {
    const sources = resolveParserFieldSources(parsed.detectedFields, parsed.resolvedFieldSources);
    const replayed = resolveParserFieldSources(parsed.detectedFields, {});
    for (const target of ['time', 'depth', 'horizontal_uncertainty', 'id']) {
      expect(replayed[target]).toBe(sources[target]);
    }
    expect(computeFileMappingChanges(parsed.detectedFields, sources, {})).toEqual({ set: {}, unset: [] });
    // The metre annotation still drives the unit: 800 m -> 0.8 km.
    expect(parsed.events[0].horizontal_uncertainty).toBeCloseTo(0.8, 10);
  });
});

describe('review #6: a Settings regex cannot freeze the upload tab', () => {
  const catastrophic = { id: 'r1', sourcePattern: '^(\\w+_?)*$', targetField: 'depth', isRegex: true, priority: 50 };

  it('refuses nested quantifiers when the configuration is saved or imported', () => {
    const config = {
      autoDetectEnabled: true,
      strictValidation: false,
      fuzzyMatchThreshold: 0.6,
      formats: { csv: { enabled: true, mappings: [catastrophic] } },
      customMappings: [],
    };
    const parsed = parseFieldMappingsConfig(config);
    expect(parsed.ok).toBe(false);
    expect(hasNestedQuantifier('^(\\w+_?)*$')).toBe(true);
    expect(hasNestedQuantifier('(a+)+')).toBe(true);
    expect(hasNestedQuantifier('(a|aa)*')).toBe(true);
    expect(hasNestedQuantifier('^depth[_ ]?\\(?m\\)?$')).toBe(false);
    expect(hasNestedQuantifier('^(lat|lon)_err$')).toBe(false);
  });

  it('never runs such a rule, or any rule on an overlong header, if one was saved before', () => {
    const started = Date.now();
    const result = detectAllFieldMappings(['a'.repeat(30) + '-'], 0.6, {
      customMappings: [catastrophic],
      useBuiltInAliases: false,
    });
    expect(result).toEqual({});
    expect(Date.now() - started).toBeLessThan(200);
    const plain = { id: 'r2', sourcePattern: '^x+$', targetField: 'depth', isRegex: true, priority: 50 };
    expect(detectAllFieldMappings(['x'.repeat(65)], 0.6, { customMappings: [plain], useBuiltInAliases: false })).toEqual({});
    expect(detectAllFieldMappings(['x'.repeat(10)], 0.6, { customMappings: [plain], useBuiltInAliases: false })).toEqual({ ['x'.repeat(10)]: 'depth' });
  });
});
