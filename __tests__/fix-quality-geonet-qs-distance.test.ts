/** @jest-environment node */

// #87: in the in-house QS0-QS6 heuristic, leaving out the nearest-station distance must
// never score better than reporting it (it used to default to QS3 "assume fair").

import { calculateGeoNetQS } from '@/lib/geonet-quality-score';
import { assessEventQuality } from '@/lib/integrated-quality-assessment';

// Every other criterion excellent, so the distance criterion decides the QS.
const excellent = { azimuthalGap: 60, usedStationCount: 40, rmsResidual: 0.1, horizontalUncertainty: 0.5, depthUncertainty: 1 };

describe('#87 a missing nearest-station distance does not outscore a reported one', () => {
  it('absent scores no better than any reported distance', () => {
    const missing = calculateGeoNetQS(excellent);
    expect(missing.qualityScore).toBe(0);
    expect(missing.criteriaBreakdown.minimumDistance).toEqual({ value: null, score: 0, label: 'No data' });
    expect(missing.limitingFactor).toBe('Minimum Distance');
    expect(calculateGeoNetQS({ ...excellent, minimumDistance: null }).qualityScore).toBe(0);
    for (const km of [20, 150, 250, 500, 900]) {
      expect(calculateGeoNetQS({ ...excellent, minimumDistance: km }).qualityScore).toBeGreaterThanOrEqual(missing.qualityScore);
    }
    expect(calculateGeoNetQS({ ...excellent, minimumDistance: 20 }).qualityScore).toBe(6);
  });

  it('a negative sentinel is no data, not an excellent criterion', () => {
    for (const criteria of [{ ...excellent, minimumDistance: -999 }, { ...excellent, minimumDistance: 20, rmsResidual: -1 }]) {
      expect(calculateGeoNetQS(criteria).qualityScore).toBe(0);
    }
  });

  it('through assessEventQuality, withholding minimum_distance no longer flips the use-case guidance', () => {
    const event = { latitude: -41, longitude: 174, azimuthal_gap: 60, used_station_count: 40, used_phase_count: 60, standard_error: 0.1,
      horizontal_uncertainty: 0.5, depth_uncertainty: 1, time_uncertainty: 0.05, magnitude_uncertainty: 0.05, magnitude_station_count: 20,
      evaluation_mode: 'manual', evaluation_status: 'reviewed' };
    const withheld = assessEventQuality(event);
    const farStation = assessEventQuality({ ...event, minimum_distance: 4.5 }); // ~500 km
    expect(withheld.geonetQS.qualityScore).toBeLessThanOrEqual(farStation.geonetQS.qualityScore);
    expect(withheld.summary.useCaseGuidance.hazardAssessment).toBe(false);
    expect(assessEventQuality({ ...event, minimum_distance: -999 }).geonetQS.criteriaBreakdown.minimumDistance.value).toBeNull();
  });
});
