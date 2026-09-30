/**
 * Map redesign (MAP_DESIGN_SPEC S2, S5 text): the shared symbology in lib/map-style.ts and
 * the popup text formatters in lib/map-format.ts. Expected values are the spec's tables,
 * written out by hand, not read back from the code.
 */
import { getEarthquakeColor, getMagnitudePixelRadius } from '@/lib/earthquake-utils';
import {
  DEPTH_CLASSES, DEPTH_UNKNOWN, FAULT_STYLE, MARKER_STYLE, depthClassIndex, faultPathOptions,
  magnitudeRadius, markerPathOptions, markerStrokeStyle, mixOklab,
} from '@/lib/map-style';
import {
  formatDepth, formatLatLon, formatMagnitude, formatMagnitudeType, formatOriginTimeUtc, formatQuality,
  isFixedDepthType, isKnownRegion,
} from '@/lib/map-format';
import { NZ_FALLBACK_BOUNDS, eventsFitBounds } from '@/lib/map-view';

describe('depth colour classes (plasma, warm = shallow)', () => {
  // [representative depths, light fill, dark fill] per class, straight from the spec table.
  const TABLE: Array<[number[], string, string]> = [
    [[-2, 0, 5, 14.9], '#FCA636', '#FDB42F'],
    [[15, 25, 39.9], '#E66C5C', '#F07F4F'],
    [[40, 55, 69.9], '#C5407E', '#DB5C68'],
    [[70, 100, 149.9], '#9C179E', '#B83289'],
    [[150, 220, 299.9], '#6A00A8', '#8B0AA5'],
    [[300, 450, 700], '#2A0593', '#5B02A3'],
  ];

  it.each(TABLE)('depths %j are %s on light and %s on dark basemaps', (depths, light, dark) => {
    for (const depth of depths) {
      expect({ depth, color: getEarthquakeColor(depth, false) }).toEqual({ depth, color: light });
      expect({ depth, color: getEarthquakeColor(depth, true) }).toEqual({ depth, color: dark });
    }
  });

  it('greys an unknown depth in both themes and never guesses a class', () => {
    for (const depth of [null, undefined, Number.NaN, Infinity]) {
      expect(getEarthquakeColor(depth as number | null, false)).toBe('#9CA3AF');
      expect(getEarthquakeColor(depth as number | null, true)).toBe('#6B7280');
      expect(depthClassIndex(depth as number | null)).toBe(-1);
    }
    expect(DEPTH_UNKNOWN).toEqual({ label: 'unknown', light: '#9CA3AF', dark: '#6B7280' });
  });

  it('uses the standard 70 / 300 km class boundaries and labels', () => {
    expect(DEPTH_CLASSES.map(c => c.label)).toEqual(['< 15 km', '15–40 km', '40–70 km', '70–150 km', '150–300 km', '≥ 300 km']);
    expect(DEPTH_CLASSES.map(c => c.category)).toEqual(['shallow', 'shallow', 'shallow', 'intermediate', 'intermediate', 'deep']);
    // Every class is distinct in each theme, and the dark palette is its own set.
    expect(new Set(DEPTH_CLASSES.map(c => c.light)).size).toBe(6);
    expect(new Set(DEPTH_CLASSES.map(c => c.dark)).size).toBe(6);
  });
});

describe('magnitude radius r(M) = clamp(2.2 * 1.5^(M-1), 2.2, 28) px', () => {
  it('matches the spec values per unit', () => {
    const expected: Array<[number, number]> = [[1, 2.2], [2, 3.3], [3, 4.95], [4, 7.43], [5, 11.14], [6, 16.71], [7, 25.06]];
    for (const [magnitude, radius] of expected) expect(getMagnitudePixelRadius(magnitude)).toBeCloseTo(radius, 1);
  });

  it('grows by x1.5 per magnitude unit, so every unit is clearly distinct', () => {
    for (let m = 1; m < 7; m++) {
      const ratio = getMagnitudePixelRadius(m + 1) / getMagnitudePixelRadius(m);
      expect({ m, ratio: Math.round(ratio * 100) / 100 }).toEqual({ m, ratio: 1.5 });
      expect(getMagnitudePixelRadius(m + 1) - getMagnitudePixelRadius(m)).toBeGreaterThanOrEqual(1);
    }
  });

  it('is continuous and monotonic, clamped at both ends', () => {
    let previous = -Infinity;
    for (let m = -2; m <= 10; m += 0.05) {
      const r = getMagnitudePixelRadius(m);
      expect(r).toBeGreaterThanOrEqual(previous);
      expect(r).toBeGreaterThanOrEqual(2.2);
      expect(r).toBeLessThanOrEqual(28);
      previous = r;
    }
    expect(getMagnitudePixelRadius(0.5)).toBe(2.2);
    expect(getMagnitudePixelRadius(8.5)).toBe(28);
    // M6.3 sits strictly between M6 and M7, unlike the old floor() tiers.
    expect(getMagnitudePixelRadius(6.3)).toBeGreaterThan(getMagnitudePixelRadius(6));
    expect(getMagnitudePixelRadius(6.3)).toBeLessThan(getMagnitudePixelRadius(7));
  });

  it('draws an unknown magnitude at 3 px', () => {
    expect(getMagnitudePixelRadius(Number.NaN)).toBe(3);
    expect(magnitudeRadius(null)).toBe(3);
    expect(magnitudeRadius(undefined)).toBe(3);
  });
});

describe('marker style', () => {
  it('light and dark markers: 0.78 fill, 0.6 px translucent outline', () => {
    expect(markerPathOptions('#FCA636', false)).toMatchObject({ fillColor: '#FCA636', fillOpacity: 0.78, weight: 0.6, color: 'rgba(17,24,39,0.55)' });
    expect(markerPathOptions('#FDB42F', true)).toMatchObject({ fillColor: '#FDB42F', fillOpacity: 0.78, weight: 0.6, color: 'rgba(255,255,255,0.55)' });
  });

  it('hover / selected: 2 px solid outline, 0.95 fill', () => {
    expect(markerStrokeStyle(false, true)).toMatchObject({ color: '#111827', weight: 2, fillOpacity: 0.95 });
    expect(markerStrokeStyle(true, true)).toMatchObject({ color: '#FFFFFF', weight: 2, fillOpacity: 0.95 });
    expect(MARKER_STYLE.highlight.weight).toBeGreaterThan(MARKER_STYLE.weight);
  });

  it('faults: thin, quiet, heavier from zoom 9', () => {
    expect(faultPathOptions(false, 5)).toMatchObject({ color: '#7F1D1D', opacity: 0.55, weight: 1 });
    expect(faultPathOptions(true, 5)).toMatchObject({ color: '#FCA5A5', opacity: 0.45, weight: 1 });
    expect(faultPathOptions(false, FAULT_STYLE.zoomThreshold).weight).toBe(1.5);
  });

  it('OKLab mixing returns the end colours at t = 0 and 1', () => {
    expect(mixOklab('#0F766E', '#FDE68A', 0)).toBe('#0F766E');
    expect(mixOklab('#0F766E', '#FDE68A', 1)).toBe('#FDE68A');
  });
});

describe('popup text (spec S5)', () => {
  it('writes the magnitude with its type as a seismologist does', () => {
    expect(formatMagnitude(2.6, 'ML')).toBe('ML 2.6');
    expect(formatMagnitude(7.8, 'Mw')).toBe('Mw 7.8');
    expect(formatMagnitude(7.8, 'MW')).toBe('Mw 7.8');
    expect(formatMagnitude(2.63, 'ml')).toBe('ML 2.6');
    expect(formatMagnitude(4.1, 'mb')).toBe('mb 4.1');
    expect(formatMagnitude(4.1, 'MB')).toBe('mb 4.1');
    expect(formatMagnitude(6.4, 'mB')).toBe('mB 6.4');
    expect(formatMagnitude(3.2, 'MLv')).toBe('MLv 3.2');
    expect(formatMagnitude(2.6, null)).toBe('M 2.6');
    expect(formatMagnitude(2.6, 'unknown')).toBe('M 2.6');
    expect(formatMagnitude(2.6, 'M')).toBe('M 2.6');
    expect(formatMagnitude(null, 'ML')).toBe('ML –');
    expect(formatMagnitudeType('mwr')).toBe('Mwr');
  });

  it('writes positions with hemisphere letters to 3 decimals', () => {
    expect(formatLatLon(-40.379, 177.196)).toBe('40.379° S, 177.196° E');
    expect(formatLatLon(-29.25, -177.9)).toBe('29.250° S, 177.900° W');
    // A longitude drawn in the next world copy is reported in the normal range.
    expect(formatLatLon(-30.1, 185)).toBe('30.100° S, 175.000° W');
    expect(formatLatLon(12.5, 0)).toBe('12.500° N, 0.000° E');
    expect(formatLatLon(-0.0001, -0.0001)).toBe('0.000° N, 0.000° E');
  });

  it('writes depth with its uncertainty, or says it was fixed', () => {
    expect(formatDepth({ depth: 12 })).toBe('12.0 km');
    expect(formatDepth({ depth: 12, depth_uncertainty: 2.1 })).toBe('12.0 ± 2.1 km');
    expect(formatDepth({ depth: 12, depth_uncertainty: 0 })).toBe('12.0 km');
    expect(formatDepth({ depth: 10, depth_uncertainty: 0, depth_type: 'operator assigned' })).toBe('10.0 km (fixed)');
    expect(formatDepth({ depth: 33, depth_uncertainty: 5, depth_type: 'Fixed' })).toBe('33.0 km (fixed)');
    expect(formatDepth({ depth: null })).toBeNull();
    expect(isFixedDepthType('from location')).toBe(false);
  });

  it('writes the origin time as an explicit-zone UTC instant', () => {
    expect(formatOriginTimeUtc('2020-08-13T16:23:50.412Z')).toBe('2020-08-13 16:23:50 UTC');
    // 11:02:56 UTC is 00:02:56 on the 14th in NZDT: the popup must stay on the 13th.
    expect(formatOriginTimeUtc('2016-11-13T11:02:56Z')).toBe('2016-11-13 11:02:56 UTC');
    expect(formatOriginTimeUtc('not-a-time')).toBe('not-a-time');
  });

  it('never treats a placeholder as a region', () => {
    for (const region of ['Unknown', 'unknown', '', '  ', 'N/A', null, undefined]) expect(isKnownRegion(region as string)).toBe(false);
    expect(isKnownRegion('Seaward Kaikoura Range')).toBe(true);
  });

  it('writes quality as "Q 67 (B)"', () => {
    expect(formatQuality(67, 'B')).toBe('Q 67 (B)');
    expect(formatQuality(66.6)).toBe('Q 67');
  });
});

describe('initial view', () => {
  it('frames events across the antimeridian the short way round', () => {
    const [[south, west], [north, east]] = eventsFitBounds([
      { latitude: -30.1, longitude: 179.9 },
      { latitude: -29.2, longitude: -177.9 },
      { latitude: -41.3, longitude: 174.8 },
    ]);
    expect([south, north]).toEqual([-41.3, -29.2]);
    expect(west).toBeCloseTo(174.8, 6);
    expect(east).toBeCloseTo(182.1, 6); // -177.9 unwrapped past 180
  });

  it('shows all of New Zealand for an empty catalogue', () => {
    expect(eventsFitBounds([])).toEqual(NZ_FALLBACK_BOUNDS);
    expect(NZ_FALLBACK_BOUNDS).toEqual([[-53, 165], [-28, 185]]);
  });
});
