/**
 * F2 (map features): two additions to lib/uncertainty-utils.ts.
 *
 * 1. getAzimuthalGapColor: the continuous colour ramp behind the map's "azimuthal gap"
 *    colour mode (paper sec:viz station-coverage panel). It must be a genuine continuous
 *    ramp (no hard-coded discrete bands), grey for an unknown gap, and gap > 180 degrees
 *    must read as visually distinct ("clearly highlighted"), not just a darker red.
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
  const hue = (css: string): number => {
    const match = css.match(/^hsl\(([-\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
    expect(match).not.toBeNull();
    return Number(match![1]);
  };
  const saturation = (css: string): number => {
    const match = css.match(/^hsl\([-\d.]+,\s*([\d.]+)%/);
    return Number(match![1]);
  };

  it('is grey for an unknown gap (null, undefined, NaN) rather than a guessed ramp position', () => {
    const grey = '#94a3b8';
    expect(getAzimuthalGapColor(null)).toBe(grey);
    expect(getAzimuthalGapColor(undefined)).toBe(grey);
    expect(getAzimuthalGapColor(NaN)).toBe(grey);
  });

  it('starts green (well-constrained) at gap 0 and reaches red at the 180 degree threshold', () => {
    expect(hue(getAzimuthalGapColor(0))).toBeCloseTo(142, 0);
    expect(hue(getAzimuthalGapColor(180))).toBeCloseTo(0, 0);
  });

  it('is a continuous ramp from 0 to 180 degrees: hue decreases monotonically, no discrete jumps', () => {
    const samples = [0, 30, 60, 90, 120, 150, 180].map(gap => hue(getAzimuthalGapColor(gap)));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThan(samples[i - 1]);
    }
  });

  it('highlights gap > 180 degrees as a visually distinct regime, not merely "more red"', () => {
    // Saturation/lightness step up beyond the 180 degree usability threshold (Havskov &
    // Ottemoller 2010 sec 6.3; GeoNet quality flags), so a 181 degree gap cannot be
    // mistaken for a 179 degree one even though the ramp itself has no discontinuity.
    expect(saturation(getAzimuthalGapColor(179))).toBe(85);
    expect(saturation(getAzimuthalGapColor(181))).toBe(100);
  });

  it('keeps ramping (not clamping to a single "bad" colour) as the gap widens past 180', () => {
    const at270 = hue(getAzimuthalGapColor(270));
    const at360 = hue(getAzimuthalGapColor(360));
    expect(at270).not.toBeCloseTo(at360, 0);
    // Beyond 180 the ramp swings into magenta/violet hues, clearly outside the
    // green-yellow-red family used for <= 180 degrees.
    expect(at360).toBeGreaterThan(200);
    expect(at360).toBeLessThan(320);
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
