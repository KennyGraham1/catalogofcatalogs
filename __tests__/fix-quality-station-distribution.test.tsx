/**
 * #85: the station-distribution ratio is normalised by the spacing variability of randomly
 * placed stations (coefficient of variation ~ sqrt((N-1)/(N+1))), so a random network sits
 * at the good/fair boundary instead of being labelled "poorly distributed (clustered)".
 * Checked with a seeded Monte Carlo.
 */

import { render, screen } from '@testing-library/react';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import {
  calculateStationDistributionRatio, getStationDistributionDescription, parseStationData,
} from '@/lib/station-coverage-utils';

// mulberry32: small, seedable, good enough for layout sampling.
const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const quality = (azimuths: number[]) => getStationDistributionDescription(calculateStationDistributionRatio(azimuths)!).quality;

describe('#85 station distribution against the random reference', () => {
  const trials = 2000;

  it.each([5, 10, 20, 40])('random layouts of %i stations centre on 0.5 and are rarely "clustered"', (n) => {
    const rnd = prng(n * 7919);
    const ratios: number[] = [];
    let poor = 0;
    for (let t = 0; t < trials; t++) {
      const azimuths = Array.from({ length: n }, () => rnd() * 360);
      const ratio = calculateStationDistributionRatio(azimuths)!;
      ratios.push(ratio);
      if (getStationDistributionDescription(ratio).quality === 'poor') poor++;
    }
    ratios.sort((a, b) => a - b);
    expect(ratios[trials / 2]).toBeGreaterThan(0.42);
    expect(ratios[trials / 2]).toBeLessThan(0.52);
    // About 3% at N = 20 (93% before); small random networks are bunched more often.
    expect(poor / trials).toBeLessThan(n >= 20 ? 0.05 : 0.12);
  });

  it('engineered layouts rate excellent and bunched layouts rate poor', () => {
    const rnd = prng(424242);
    let excellent = 0, poor = 0;
    for (let t = 0; t < trials; t++) {
      const n = 6 + Math.floor(rnd() * 30);
      const regular = Array.from({ length: n }, (_, i) => (i * 360 / n + (rnd() - 0.5) * 180 / n + 360) % 360);
      if (quality(regular) === 'excellent') excellent++;
      const start = rnd() * 360;
      if (quality(Array.from({ length: n }, () => (start + rnd() * 90) % 360)) === 'poor') poor++;
    }
    expect(excellent / trials).toBeGreaterThan(0.95);
    expect(poor / trials).toBeGreaterThan(0.95);
  });

  it('the card no longer calls a typical 20-station network clustered', () => {
    const rnd = prng(2026);
    let clustered = 0;
    for (let k = 0; k < 20; k++) {
      const azimuths = Array.from({ length: 20 }, () => Math.round(rnd() * 3600) / 10);
      const picks = JSON.stringify(azimuths.map((_, i) => ({ publicID: `p${i}`, waveformID: { networkCode: 'NZ', stationCode: `S${i}` } })));
      const arrivals = JSON.stringify(azimuths.map((azimuth, i) => ({ pickID: `p${i}`, azimuth, distance: 0.5 })));
      const coverage = parseStationData(picks, arrivals, -41, 174)!;
      const { unmount } = render(<StationCoverageCard coverage={coverage} />);
      if (screen.queryByText(/poorly distributed \(clustered\)/)) clustered++;
      unmount();
    }
    expect(clustered).toBeLessThanOrEqual(2);
  });
});
