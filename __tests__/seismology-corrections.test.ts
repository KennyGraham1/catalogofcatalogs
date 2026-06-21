/**
 * Regression tests for seismicity-statistics corrections (audit root cause C and
 * finding #1):
 *   - Gardner-Knopoff declustering time-window branches (were swapped).
 *   - b-value computed with a real MAXC completeness magnitude (not the catalogue
 *     floor), so the incomplete low-magnitude tail no longer biases b.
 */

import {
  getGardnerKnopoffWindow,
  calculateGutenbergRichter,
  type EarthquakeEvent,
} from '../lib/seismological-analysis';

describe('Gardner-Knopoff time window (van Stiphout 2012 / OpenQuake)', () => {
  it('uses the steep branch for small events and the shallow branch for large', () => {
    // Canonical: T = 10^(0.5409M-0.547) for M<6.5; 10^(0.032M+2.7389) for M>=6.5.
    expect(getGardnerKnopoffWindow(4).timeWindowDays).toBeCloseTo(Math.pow(10, 0.5409 * 4 - 0.547), 3); // ~41 d
    expect(getGardnerKnopoffWindow(6).timeWindowDays).toBeCloseTo(Math.pow(10, 0.5409 * 6 - 0.547), 3); // ~499 d
    expect(getGardnerKnopoffWindow(8).timeWindowDays).toBeCloseTo(Math.pow(10, 0.032 * 8 + 2.7389), 3); // ~989 d
  });

  it('does not give small events absurdly long windows (the swapped-branch symptom)', () => {
    // The swapped code gave M4 -> ~736 d. Correct value is ~41 d.
    expect(getGardnerKnopoffWindow(4).timeWindowDays).toBeLessThan(100);
    // And a great earthquake must get a longer window than a moderate one.
    expect(getGardnerKnopoffWindow(8).timeWindowDays).toBeGreaterThan(getGardnerKnopoffWindow(5).timeWindowDays);
  });

  it('leaves the distance window unchanged (10^(0.1238M+0.983))', () => {
    expect(getGardnerKnopoffWindow(5).distanceWindowKm).toBeCloseTo(Math.pow(10, 0.1238 * 5 + 0.983), 3);
  });
});

describe('b-value uses an estimated Mc, not the catalogue floor', () => {
  // Synthetic catalogue: complete with b=1.0 above M=2.0, plus a heavily
  // under-detected (incomplete) tail below 2.0. A correct estimator recovers
  // b ~ 1.0 by cutting at Mc ~ 2.0; using the floor would bias b.
  function syntheticCatalogue(): EarthquakeEvent[] {
    const events: EarthquakeEvent[] = [];
    let id = 0;
    const base = new Date('2020-01-01T00:00:00Z').getTime();
    const push = (m: number, n: number) => {
      for (let k = 0; k < n; k++) {
        events.push({
          id: id++,
          time: new Date(base + id * 3600_000).toISOString(),
          latitude: -41,
          longitude: 174,
          depth: 10,
          magnitude: Number(m.toFixed(1)),
        });
      }
    };
    // Complete part (b = 1.0) for M in [2.0, 5.0]
    for (let M = 2.0; M <= 5.0 + 1e-9; M += 0.1) {
      const n = Math.round(2000 * Math.pow(10, -(M - 2.0)));
      if (n > 0) push(M, n);
    }
    // Incomplete tail for M in [1.0, 1.9): detection rolls off sharply
    for (let M = 1.0; M < 1.95; M += 0.1) {
      const full = 2000 * Math.pow(10, -(M - 2.0));
      const detected = Math.round(full * Math.pow(10, -2 * (2.0 - M)));
      if (detected > 0) push(M, detected);
    }
    return events;
  }

  it('auto-estimates Mc near 2.0 and recovers b ~ 1.0 despite the incomplete tail', () => {
    const events = syntheticCatalogue();
    const result = calculateGutenbergRichter(events);
    // Completeness must reflect the real roll-off (~2.0), NOT the catalogue floor (~1.0).
    expect(result.completeness).toBeGreaterThanOrEqual(1.9);
    expect(result.completeness).toBeLessThanOrEqual(2.4);
    // b recovered within tolerance of the true value 1.0.
    expect(result.bValue).toBeGreaterThan(0.8);
    expect(result.bValue).toBeLessThan(1.2);
  });

  it('honours an explicit minMagnitude cut-off', () => {
    const events = syntheticCatalogue();
    const result = calculateGutenbergRichter(events, 2.5);
    expect(result.completeness).toBe(2.5);
    expect(result.bValue).toBeGreaterThan(0.7);
    expect(result.bValue).toBeLessThan(1.3);
  });
});
