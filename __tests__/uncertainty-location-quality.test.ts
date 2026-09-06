/**
 * Regression tests for the location-quality score (uncertainty cluster, finding 2).
 *
 * The score used to start at 100 and only ever subtract penalties for fields
 * that were PRESENT, so an event with no uncertainty metadata at all scored
 * 100/Grade A and outranked a fully characterised modern location.
 *
 * Expected values below are derived by hand from the documented ramps, not by
 * running the code:
 *   horizontal sub-score = 100 * (1 - min(1, sigma_deg / 0.1))
 *   depth      sub-score = 100 * (1 - min(1, sigma_km  / 10))
 *   gap        sub-score = 100 * (1 - min(1, gap_deg   / 270))
 *   time       sub-score = 100 * (1 - min(1, sigma_s   / 1))
 *   overall    = sum(weight_i * sub_i) / sum(weight_i) over the REPORTED factors
 *   weights    = horizontal 30, depth 20, gap 30, time 20
 */

import { calculateLocationQuality } from '@/lib/uncertainty-utils';

describe('calculateLocationQuality — absence of metadata is not quality', () => {
  it('returns no score and no grade for an event with no uncertainty metadata', () => {
    const q = calculateLocationQuality({ latitude: -41.3, longitude: 174.8 });
    expect(q.score).toBeNull();
    expect(q.grade).toBeNull();
    expect(q.metadataCoverage).toBe(0);
    expect(q.scoredFactors).toEqual([]);
    expect(q.factors).toEqual({
      horizontalUncertainty: null,
      depthUncertainty: null,
      azimuthalGap: null,
      timeUncertainty: null,
    });
  });

  it('does not let an undocumented event outrank a fully documented one', () => {
    const undocumented = calculateLocationQuality({ latitude: -41.3, longitude: 174.8 });
    const documented = calculateLocationQuality({
      latitude: -41.3,
      longitude: 174.8,
      latitude_uncertainty: 0.005,
      longitude_uncertainty: 0.005,
      depth_uncertainty: 0.8,
      time_uncertainty: 0.05,
      azimuthal_gap: 60,
    });
    expect(undocumented.score).toBeNull();
    expect(documented.score).not.toBeNull();
  });
});

describe('calculateLocationQuality — weighted mean over reported factors', () => {
  it('scores a fully documented modern location', () => {
    const q = calculateLocationQuality({
      latitude: -41.3,
      longitude: 174.8,
      latitude_uncertainty: 0.005,
      longitude_uncertainty: 0.005,
      depth_uncertainty: 0.8,
      time_uncertainty: 0.05,
      azimuthal_gap: 60,
    });
    // sub-scores: 95, 92, 700/9 = 77.777..., 95
    expect(q.factors.horizontalUncertainty).toBeCloseTo(95, 10);
    expect(q.factors.depthUncertainty).toBeCloseTo(92, 10);
    expect(q.factors.azimuthalGap).toBeCloseTo(700 / 9, 10);
    expect(q.factors.timeUncertainty).toBeCloseTo(95, 10);
    // (30*95 + 20*92 + 30*700/9 + 20*95) / 100 = 8923.33.../100 = 89.233... -> 89
    expect(q.score).toBe(89);
    expect(q.grade).toBe('B');
    expect(q.metadataCoverage).toBe(1);
    expect(q.scoredFactors.sort()).toEqual(
      ['azimuthalGap', 'depthUncertainty', 'horizontalUncertainty', 'timeUncertainty']
    );
  });

  it('renormalises over the reported factors and reports the coverage', () => {
    const q = calculateLocationQuality({ latitude: -41.3, longitude: 174.8, azimuthal_gap: 60 });
    // only the gap is reported: score = its sub-score 700/9 = 77.777... -> 78
    expect(q.score).toBe(78);
    expect(q.grade).toBe('C');
    expect(q.metadataCoverage).toBeCloseTo(0.3, 10); // 30 of 100 weight
    expect(q.scoredFactors).toEqual(['azimuthalGap']);
    expect(q.factors.depthUncertainty).toBeNull();
    expect(q.factors.timeUncertainty).toBeNull();
    expect(q.factors.horizontalUncertainty).toBeNull();
  });

  it('treats a reported zero as data, not as a missing field', () => {
    const q = calculateLocationQuality({ latitude: -41.3, longitude: 174.8, depth_uncertainty: 0 });
    expect(q.factors.depthUncertainty).toBe(100);
    expect(q.score).toBe(100);
    expect(q.grade).toBe('A');
    expect(q.metadataCoverage).toBeCloseTo(0.2, 10); // 20 of 100 weight
  });

  it('floors each factor at zero rather than at 70', () => {
    // gap 360 deg is past the 270 deg floor -> sub-score 0, and it is the only
    // reported factor, so the overall score is 0 / grade F.
    const q = calculateLocationQuality({ latitude: -41.3, longitude: 174.8, azimuthal_gap: 360 });
    expect(q.factors.azimuthalGap).toBe(0);
    expect(q.score).toBe(0);
    expect(q.grade).toBe('F');
  });
});
