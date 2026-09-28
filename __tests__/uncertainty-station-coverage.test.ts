/**
 * Regression tests for station coverage (uncertainty cluster, findings 1, 5 and 6).
 *
 *  - finding 1: the distribution metric must be computed from REAL azimuths;
 *    fewer than two azimuths is "unknown", not "perfectly even".
 *  - finding 5: a missing picks array means the station count is unknown, not
 *    zero, and arrivals without azimuths mean the gap is unknown, not 360;
 *    stored OriginQuality values win when the caller supplies them.
 *  - finding 6: the largest gap has a DIRECTION, and it is recoverable from the
 *    same sorted azimuth list the magnitude comes from.
 */

import {
  parseStationData,
  calculateAzimuthalGap,
  calculateAzimuthalGapDetail,
  calculateStationDistributionRatio,
  getStationDistributionDescription,
  determineCoverageQuality,
} from '@/lib/station-coverage-utils';

const picksJson = (n: number) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => ({ waveformID: { stationCode: `S${i}`, networkCode: 'NZ' } })));

const arrivalsJson = (azimuths: number[] | null, count = azimuths?.length ?? 0) =>
  JSON.stringify(
    Array.from({ length: count }, (_, i) => ({
      distance: 0.3 + i * 0.05,
      ...(azimuths ? { azimuth: azimuths[i] } : {}),
    }))
  );

describe('calculateAzimuthalGapDetail — magnitude and direction', () => {
  it('finds the wrap-around gap and the azimuths that bound it', () => {
    // stations clustered in a 35 deg sector; the uncovered arc runs 45 -> 10
    // clockwise through north, i.e. 360 - 45 + 10 = 325 degrees.
    const d = calculateAzimuthalGapDetail([10, 15, 20, 25, 30, 35, 40, 45]);
    expect(d.gap).toBe(325);
    expect(d.startAzimuth).toBe(45);
    expect(d.endAzimuth).toBe(10);
  });

  it('places the gap at its real azimuth, not at north', () => {
    // East Cape shape: recorded only from the west/south-west, so the hole is
    // to the east. Sorted: 200 230 260 290 320 340; interior gaps 30,30,30,30,20
    // and the wrap 360-340+200 = 220 -> the gap runs 340 -> 200 clockwise.
    const d = calculateAzimuthalGapDetail([320, 200, 290, 340, 230, 260]);
    expect(d.gap).toBe(220);
    expect(d.startAzimuth).toBe(340);
    expect(d.endAzimuth).toBe(200);
    // The covered sector therefore starts at 200 and sweeps 140 deg clockwise,
    // i.e. it must NOT be drawn symmetrically about north.
    expect(((d.endAzimuth! + (360 - d.gap!) / 2) % 360)).toBe(270);
  });

  it('reports an interior maximum gap correctly', () => {
    // 0, 20, 200, 220: interior gaps 20, 180, 20; wrap 360-220+0 = 140.
    const d = calculateAzimuthalGapDetail([0, 20, 200, 220]);
    expect(d.gap).toBe(180);
    expect(d.startAzimuth).toBe(20);
    expect(d.endAzimuth).toBe(200);
  });

  it('distinguishes "no azimuths" from a 360 degree gap', () => {
    expect(calculateAzimuthalGapDetail([]).gap).toBeNull();
    expect(calculateAzimuthalGapDetail([12]).gap).toBe(360);
    // the legacy scalar helper keeps its old contract
    expect(calculateAzimuthalGap([])).toBe(360);
    expect(calculateAzimuthalGap([10, 15, 20, 25, 30, 35, 40, 45])).toBe(325);
  });
});

describe('calculateStationDistributionRatio — real azimuths only', () => {
  it('returns null when there is nothing to measure', () => {
    expect(calculateStationDistributionRatio([])).toBeNull();
    expect(calculateStationDistributionRatio([42])).toBeNull();
  });

  it('rates a clustered network as poorly distributed', () => {
    // 8 azimuths, meanGap = 45. gaps = seven 5s and one 325.
    // variance = (7*(5-45)^2 + (325-45)^2)/8 = (11200 + 78400)/8 = 11200
    // stdDev = sqrt(11200) = 105.83; random expectation = 45 * sqrt(7/9) = 39.69
    // ratio = min(1, 105.83 / 79.37) = 1
    const ratio = calculateStationDistributionRatio([10, 15, 20, 25, 30, 35, 40, 45])!;
    expect(ratio).toBe(1);
    expect(getStationDistributionDescription(ratio).quality).toBe('poor');
  });

  it('rates a genuinely even network as evenly distributed', () => {
    const even = Array.from({ length: 8 }, (_, i) => i * 45);
    expect(calculateStationDistributionRatio(even)).toBe(0);
  });
});

describe('parseStationData — picks and arrivals are not interchangeable', () => {
  it('does not report zero stations for an arrivals-only event', () => {
    const azimuths = Array.from({ length: 12 }, (_, i) => i * 30);
    const c = parseStationData(null, arrivalsJson(azimuths), -41, 174)!;
    expect(c.azimuths).toEqual(azimuths);
    expect(c.azimuthalGap).toBe(30);
    expect(c.azimuthalGapSource).toBe('arrivals');
    expect(c.stationCount).toBeNull();
    expect(c.stationCountSource).toBeNull();
    expect(c.coverageQuality).toBe('unknown');
  });

  it('does not report a 360 degree gap when the arrivals carry no azimuths', () => {
    const c = parseStationData(picksJson(14), arrivalsJson(null, 14), -41, 174)!;
    expect(c.azimuths).toEqual([]);
    expect(c.azimuthalGap).toBeNull();
    expect(c.azimuthalGapSource).toBeNull();
    expect(c.stationCount).toBe(14);
    expect(c.stationCountSource).toBe('picks');
    expect(c.coverageQuality).toBe('unknown');
  });

  it('grades normally when both inputs are present', () => {
    const azimuths = Array.from({ length: 12 }, (_, i) => i * 30);
    const c = parseStationData(picksJson(14), arrivalsJson(azimuths), -41, 174)!;
    expect(c.azimuthalGap).toBe(30);
    expect(c.stationCount).toBe(14);
    expect(c.coverageQuality).toBe('excellent');
  });

  it('prefers the stored origin-quality values when the caller supplies them', () => {
    const c = parseStationData(picksJson(14), arrivalsJson(null, 14), -41, 174, {
      azimuthalGap: 42,
      usedStationCount: 14,
    })!;
    expect(c.azimuthalGap).toBe(42);
    expect(c.azimuthalGapSource).toBe('origin-quality');
    expect(c.stationCountSource).toBe('origin-quality');
    expect(c.coverageQuality).toBe('excellent');
  });

  it('ignores out-of-range stored values and falls back to the derived ones', () => {
    const azimuths = Array.from({ length: 12 }, (_, i) => i * 30);
    const c = parseStationData(picksJson(14), arrivalsJson(azimuths), -41, 174, {
      azimuthalGap: 999,
      usedStationCount: null,
    })!;
    expect(c.azimuthalGap).toBe(30);
    expect(c.azimuthalGapSource).toBe('arrivals');
    expect(c.stationCount).toBe(14);
    expect(c.stationCountSource).toBe('picks');
  });
});

describe('determineCoverageQuality — unknown is not poor', () => {
  it('returns unknown when either input is missing', () => {
    expect(determineCoverageQuality(null, 14)).toBe('unknown');
    expect(determineCoverageQuality(30, null)).toBe('unknown');
  });

  it('keeps the existing thresholds when both are present', () => {
    expect(determineCoverageQuality(30, 14)).toBe('excellent');
    expect(determineCoverageQuality(120, 8)).toBe('good');
    expect(determineCoverageQuality(200, 5)).toBe('fair');
    expect(determineCoverageQuality(300, 20)).toBe('poor');
  });
});
