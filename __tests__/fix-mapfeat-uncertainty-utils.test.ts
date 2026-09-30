/**
 * F2 (map features): two additions to lib/uncertainty-utils.ts.
 *
 * 1. getAzimuthalGapColor: the continuous colour ramp behind the map's "azimuthal gap"
 *    colour mode (paper sec:viz station-coverage panel). It must be a genuine continuous
 *    ramp (no hard-coded discrete bands), grey for an unknown gap, and run from teal at 0°
 *    through pale amber at the 180° usability threshold to red at 360° (MAP_DESIGN_SPEC
 *    S2), so a gap past 180° reads as a different colour family from a well-surrounded one.
 * 2. confidence_level (C16) threading: calculateUncertaintyEllipse must carry
 *    UncertaintyData.confidence_level into UncertaintyEllipse.confidenceLevel only when
 *    the ellipse comes from a reported OriginUncertainty ellipse/circle (never the
 *    lat/lon-marginal fallback, which is not a calibrated confidence region regardless of
 *    what confidence_level says), and describeUncertaintyEllipse must show it as
 *    "N% confidence ellipse".
 */
import {
  calculateUncertaintyEllipse,
  describeUncertaintyEllipse,
  getAzimuthalGapColor,
  type UncertaintyData,
} from '@/lib/uncertainty-utils';

describe('getAzimuthalGapColor', () => {
  const rgb = (hex: string): [number, number, number] => {
    expect(hex).toMatch(/^#[0-9A-F]{6}$/i);
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  /** WCAG relative luminance, a monotonic proxy for perceived lightness. */
  const luminance = (hex: string) => {
    const [r, g, b] = rgb(hex).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  it('is grey for an unknown gap (null, undefined, NaN) rather than a guessed ramp position', () => {
    const grey = '#9CA3AF';
    expect(getAzimuthalGapColor(null)).toBe(grey);
    expect(getAzimuthalGapColor(undefined)).toBe(grey);
    expect(getAzimuthalGapColor(NaN)).toBe(grey);
  });

  it('runs teal (0°) -> pale amber (180°) -> red (360°)', () => {
    expect(getAzimuthalGapColor(0)).toBe('#0F766E');
    expect(getAzimuthalGapColor(180)).toBe('#FDE68A');
    expect(getAzimuthalGapColor(360)).toBe('#B91C1C');
  });

  it('is a continuous ramp: lightness rises monotonically to 180° and falls after, no discrete jumps', () => {
    const up = [0, 30, 60, 90, 120, 150, 180].map(gap => luminance(getAzimuthalGapColor(gap)));
    const down = [180, 210, 240, 270, 300, 330, 360].map(gap => luminance(getAzimuthalGapColor(gap)));
    for (let i = 1; i < up.length; i++) expect(up[i]).toBeGreaterThan(up[i - 1]);
    for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1]);
    // Neighbouring degrees differ by at most a few levels per channel: no hidden steps.
    for (let gap = 1; gap <= 360; gap++) {
      const a = rgb(getAzimuthalGapColor(gap - 1));
      const b = rgb(getAzimuthalGapColor(gap));
      expect(Math.max(...a.map((c, i) => Math.abs(c - b[i])))).toBeLessThanOrEqual(6);
    }
  });

  it('puts poorly constrained gaps (> 180°) in a different colour family from good ones', () => {
    const [r0, g0] = rgb(getAzimuthalGapColor(45));
    const [r1, g1] = rgb(getAzimuthalGapColor(300));
    expect(g0).toBeGreaterThan(r0); // green-dominant: well surrounded
    expect(r1).toBeGreaterThan(g1 + 60); // red-dominant: poor geometry
  });

  it('clamps out-of-range gaps instead of extrapolating past the reportable 0-360 range', () => {
    expect(getAzimuthalGapColor(-15)).toBe(getAzimuthalGapColor(0));
    expect(getAzimuthalGapColor(500)).toBe(getAzimuthalGapColor(360));
  });
});

describe('confidence_level (C16) threading through calculateUncertaintyEllipse', () => {
  const base: UncertaintyData = { latitude: -41.2, longitude: 174.8 };

  it('carries confidence_level into the ellipse when the ellipse comes from a reported error ellipse', () => {
    const ellipse = calculateUncertaintyEllipse({
      ...base,
      max_horizontal_uncertainty: 5,
      min_horizontal_uncertainty: 2,
      azimuth_max_horizontal_uncertainty: 45,
      confidence_level: 90,
    });
    expect(ellipse?.source).toBe('origin-uncertainty');
    expect(ellipse?.confidenceLevel).toBe(90);
  });

  it('carries confidence_level when the ellipse is the azimuth-unknown circle variant', () => {
    const ellipse = calculateUncertaintyEllipse({
      ...base,
      max_horizontal_uncertainty: 5,
      min_horizontal_uncertainty: 2,
      confidence_level: 68,
    });
    expect(ellipse?.orientationKnown).toBe(false);
    expect(ellipse?.confidenceLevel).toBe(68);
  });

  it('carries confidence_level when the ellipse comes from the circular horizontal_uncertainty column', () => {
    const ellipse = calculateUncertaintyEllipse({ ...base, horizontal_uncertainty: 10, confidence_level: 95 });
    expect(ellipse?.source).toBe('horizontal-circle');
    expect(ellipse?.confidenceLevel).toBe(95);
  });

  it('never attaches confidence_level to the lat/lon-marginal fallback, which is not a calibrated region', () => {
    const ellipse = calculateUncertaintyEllipse({
      ...base,
      latitude_uncertainty: 0.05,
      longitude_uncertainty: 0.05,
      confidence_level: 90,
    });
    expect(ellipse?.source).toBe('latlon-marginals');
    expect(ellipse?.confidenceLevel).toBeUndefined();
  });

  it('ignores an out-of-range confidence_level rather than passing through a bogus percentage', () => {
    const tooHigh = calculateUncertaintyEllipse({ ...base, horizontal_uncertainty: 10, confidence_level: 150 });
    const negative = calculateUncertaintyEllipse({ ...base, horizontal_uncertainty: 10, confidence_level: -5 });
    expect(tooHigh?.confidenceLevel).toBeUndefined();
    expect(negative?.confidenceLevel).toBeUndefined();
  });
});

describe('describeUncertaintyEllipse shows "N% confidence ellipse" per C16', () => {
  const base: UncertaintyData = { latitude: -41.2, longitude: 174.8 };

  it('shows the integer confidence level verbatim, without a decimal point', () => {
    const ellipse = calculateUncertaintyEllipse({ ...base, horizontal_uncertainty: 10, confidence_level: 90 })!;
    expect(describeUncertaintyEllipse(ellipse)).toContain('90% confidence ellipse');
  });

  it('formats a fractional confidence level to one decimal place', () => {
    const ellipse = calculateUncertaintyEllipse({ ...base, horizontal_uncertainty: 10, confidence_level: 95.5 })!;
    expect(describeUncertaintyEllipse(ellipse)).toContain('95.5% confidence ellipse');
  });

  it('falls back to the generic "not recorded here" text when confidence_level is absent', () => {
    const ellipse = calculateUncertaintyEllipse({ ...base, horizontal_uncertainty: 10 })!;
    const text = describeUncertaintyEllipse(ellipse);
    expect(text).toContain('not recorded here');
    expect(text).not.toContain('confidence ellipse');
  });

  it('keeps the uncalibrated-extent wording for the lat/lon-marginal fallback even with confidence_level set', () => {
    const ellipse = calculateUncertaintyEllipse({
      ...base,
      latitude_uncertainty: 0.05,
      longitude_uncertainty: 0.05,
      confidence_level: 90,
    })!;
    const text = describeUncertaintyEllipse(ellipse);
    expect(text).toContain('Not a 68%/95% confidence region');
    expect(text).not.toContain('confidence ellipse');
  });
});
