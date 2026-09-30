/**
 * Magnitude-binning regression tests.
 *
 * Expected values here are derived from the definition of a bin, not from running
 * the implementation: the bin containing magnitude m with width w is the
 * half-open interval [floor(m/w)*w, floor(m/w)*w + w), computed exactly in
 * decimal. Reported magnitudes lie on a 0.1 grid, so every 0.1-grid magnitude
 * must land in the bin whose lower edge equals that magnitude.
 */

import { calculateMFD, calculateGutenbergRichter, estimateCompletenessMagnitude } from '@/lib/seismological-analysis';
import type { EarthquakeEvent } from '@/lib/seismological-analysis';

/** Build events whose magnitudes are exactly the values given. */
function eventsWithMagnitudes(magnitudes: number[]): EarthquakeEvent[] {
  return magnitudes.map((magnitude, i) => ({
    id: i + 1,
    time: new Date(Date.UTC(2020, 0, 1, 0, 0, i % 60)).toISOString(),
    latitude: -41 + (i % 10) * 0.01,
    longitude: 174 + (i % 10) * 0.01,
    depth: 10,
    magnitude,
  })) as EarthquakeEvent[];
}

/** The 0.1 magnitude grid from 0.0 to 10.0, as exact one-decimal values. */
const GRID_01 = Array.from({ length: 101 }, (_, i) => Math.round(i) / 10);

describe('magnitude binning on the 0.1 grid', () => {
  it('places every 0.1-grid magnitude in the bin whose lower edge is that magnitude', () => {
    // One event per grid magnitude. Each bin must therefore hold exactly 1 event,
    // and the bin labelled m must be the one holding magnitude m.
    const events = eventsWithMagnitudes(GRID_01);
    const mfd = calculateMFD(events, 'c1', 'Catalogue 1', '#000', 0.1);

    const byMagnitude = new Map(mfd.histogram.map((h) => [h.magnitude, h.count]));

    const misbinned: number[] = [];
    for (const m of GRID_01) {
      if (byMagnitude.get(Number(m.toFixed(4))) !== 1) misbinned.push(m);
    }

    // Before the fix, 33 of these 101 magnitudes fell one bin low
    // (0.3 -> 0.2, 0.6 -> 0.5, 1.2 -> 1.1, ...) because 0.3 / 0.1 is
    // 2.9999999999999996 in IEEE-754.
    expect(misbinned).toEqual([]);
  });

  it('conserves the total event count across bins', () => {
    const events = eventsWithMagnitudes(GRID_01);
    const mfd = calculateMFD(events, 'c1', 'Catalogue 1', '#000', 0.1);
    const total = mfd.histogram.reduce((sum, h) => sum + h.count, 0);
    expect(total).toBe(GRID_01.length);
  });

  it('honours a finer bin width instead of collapsing onto the 0.1 grid', () => {
    // Two magnitudes 0.05 apart must occupy DIFFERENT bins at binWidth 0.05.
    // The old implementation keyed bins with Math.round(edge * 10) / 10, which
    // merged them and reported a single bin of count 2.
    const events = eventsWithMagnitudes([2.0, 2.0, 2.05, 2.05, 2.05]);
    const mfd = calculateMFD(events, 'c1', 'Catalogue 1', '#000', 0.05);

    const populated = mfd.histogram.filter((h) => h.count > 0);
    expect(populated).toEqual([
      { magnitude: 2, count: 2 },
      { magnitude: 2.05, count: 3 },
    ]);
  });

  it('puts every bin edge on an exact multiple of the bin width', () => {
    // calculateMFD drops empty bins (histogram is filtered to count > 0, because
    // an incremental FMD is plotted on a log axis), so consecutive edges need not
    // be one bin apart. What must always hold is that each edge sits exactly on
    // the bin lattice - that is what a drifting `edge += binWidth` accumulation
    // would break.
    for (const binWidth of [0.1, 0.05, 0.01]) {
      const mfd = calculateMFD(eventsWithMagnitudes(GRID_01), 'c1', 'Catalogue 1', '#000', binWidth);
      for (const { magnitude } of mfd.histogram) {
        const index = magnitude / binWidth;
        expect(Math.abs(index - Math.round(index))).toBeLessThan(1e-6);
      }
    }
  });
});

describe('completeness magnitude on the 0.1 grid', () => {
  it('reports the true modal bin as the MAXC peak', () => {
    // Construct a distribution whose non-cumulative peak is unambiguously at
    // M2.3: 400 events there, far above the neighbouring bins. MAXC + the 0.2
    // Woessner & Wiemer correction must therefore give Mc = 2.5.
    const magnitudes: number[] = [];
    for (let i = 0; i < 60; i++) magnitudes.push(2.1);
    for (let i = 0; i < 80; i++) magnitudes.push(2.2);
    for (let i = 0; i < 400; i++) magnitudes.push(2.3);
    for (let i = 0; i < 120; i++) magnitudes.push(2.4);
    for (let i = 0; i < 40; i++) magnitudes.push(2.5);

    const result = estimateCompletenessMagnitude(eventsWithMagnitudes(magnitudes), 0.1, 0.2, { method: 'MAXC' });

    // Before the fix the M2.3 events were counted in the 2.2 bin, moving the
    // peak and putting Mc 0.1 too low.
    expect(result.magnitudeDistribution.find((d) => d.magnitude === 2.3)?.count).toBe(400);
    expect(result.mc).toBeCloseTo(2.5, 10);
  });
});

describe('large catalogues do not overflow the argument limit', () => {
  it('analyses a catalogue well past the V8 spread limit', () => {
    // Math.min(...array) throws RangeError above ~131,000 arguments on Node 20,
    // which is inside the range of a national catalogue.
    const n = 200_000;
    const magnitudes = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      // Deterministic spread over the 1.0-5.0 grid, no RNG.
      magnitudes[i] = Math.round((1 + (i % 41) * 0.1) * 10) / 10;
    }
    const events = eventsWithMagnitudes(magnitudes);

    expect(() => calculateMFD(events, 'big', 'Big', '#000', 0.1)).not.toThrow();
    expect(() => calculateGutenbergRichter(events)).not.toThrow();
    expect(() => estimateCompletenessMagnitude(events, 0.1)).not.toThrow();
  });
});
