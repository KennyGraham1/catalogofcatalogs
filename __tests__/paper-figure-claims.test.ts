/**
 * Regression tests for the two claims the SRL paper makes about its worked
 * example, both of which used to be asserted rather than computed by
 * paper/figures/generate_figures.py:
 *
 *   1. that the Gutenberg-Richter estimator RECOVERS a planted b-value.  The
 *      script used to bisect its input b until the estimator returned a target,
 *      which cannot fail.  It now plants b = 1.00 and reports the recovery
 *      error, which is only meaningful if the magnitudes are generated the way
 *      a catalogue reports them (drawn from Mc - dm/2 and rounded to the dm
 *      grid) so that the Utsu binning correction applies.
 *   2. that the quoted declustering fraction is produced by the Gardner-Knopoff
 *      windows.  The script used to hard-code 23%; it now gives the synthetic
 *      events space-time coordinates and runs the windows, mirroring the
 *      TypeScript implementation exercised here.
 *
 * Every expected value below is derived analytically in the comments, not by
 * running the code.
 */
import {
  calculateGutenbergRichter,
  gardnerKnopoffDeclustering,
  getGardnerKnopoffWindow,
} from '@/lib/seismological-analysis';

// Deterministic PRNG (mulberry32), as in __tests__/paper/worked-example.test.ts.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MC = 2.0;
const BIN = 0.1;
const B_PLANTED = 1.0;
const BETA = B_PLANTED * Math.LN10;
const N = 40000;

/** Grid-reported GR magnitudes drawn from `lower` and rounded to the BIN grid. */
function plantedMagnitudes(lower: number): number[] {
  const rng = mulberry32(1234);
  const mags: number[] = [];
  for (let i = 0; i < N; i++) {
    mags.push(Math.round((lower + -Math.log(1 - rng()) / BETA) / BIN) * BIN);
  }
  return mags;
}

function asEvents(mags: number[]) {
  return mags.map((magnitude, i) => ({
    id: `m${i}`,
    time: new Date(Date.UTC(2020, 0, 1) + i * 3600000).toISOString(),
    latitude: -41,
    longitude: 174,
    magnitude,
    depth: 10,
  }));
}

describe('SRL figure script — planted b is recovered, not calibrated', () => {
  // Analytic expectation.  With x ~ Exp(beta) and m = (Mc - dm/2) + x rounded to
  // the dm grid, the reported magnitude is Mc + dm*floor(x/dm), so
  //   E[m] - Mc = dm * q/(1-q),  q = exp(-beta*dm) = 0.7943282,
  //             = 0.1 * 3.862103 = 0.3862103,
  // and the Aki-Utsu estimator returns
  //   b = log10(e) / (E[m] - Mc + dm/2) = 0.4342945 / 0.4362103 = 0.99561.
  // Counting error at N = 40,000 is sigma = b/sqrt(N) = 0.005, so a 3-sigma
  // band is +/- 0.015.
  it('recovers b = 1.00 from grid-reported magnitudes drawn from Mc - dm/2', () => {
    const gr = calculateGutenbergRichter(asEvents(plantedMagnitudes(MC - BIN / 2)), MC, BIN);
    expect(gr.bValue).toBeGreaterThan(0.99561 - 0.015);
    expect(gr.bValue).toBeLessThan(0.99561 + 0.015);
    // ... i.e. within a few thousandths of the planted value.
    expect(Math.abs(gr.bValue - B_PLANTED)).toBeLessThan(0.02);
  });

  // Drawing from Mc itself half-fills the lowest bin, so the +dm/2 correction is
  // not applicable and b is biased low.  Same algebra with
  //   E[m] - Mc = dm * exp(-beta*dm/2)/(1 - exp(-beta*dm))
  //             = 0.1 * 0.891251/0.205672 = 0.433334,
  //   b = 0.4342945 / 0.483334 = 0.89854.
  // This is the ~10% bias the generator fix removes; it is asserted here so the
  // paper's "recovers the planted b" claim cannot silently regress to it.
  it('is biased ~10% low if the magnitudes are drawn from Mc itself', () => {
    const gr = calculateGutenbergRichter(asEvents(plantedMagnitudes(MC)), MC, BIN);
    expect(gr.bValue).toBeGreaterThan(0.89854 - 0.015);
    expect(gr.bValue).toBeLessThan(0.89854 + 0.015);
  });
});

describe('SRL figure script — the declustered fraction comes from the GK windows', () => {
  // Hand-computed windows (Gardner & Knopoff 1974; van Stiphout et al. 2012):
  //   M4.0: T = 10^(0.5409*4 - 0.547) = 41.36 d, L = 10^(0.1238*4 + 0.983) = 30.08 km
  //   M2.0: T = 10^(0.5409*2 - 0.547) =  3.43 d, L = 10^(0.1238*2 + 0.983) = 17.01 km
  // Haversine separations at latitude -41: 0.3 deg of longitude = 25.18 km,
  // 0.6 deg = 50.35 km.
  const DAY = 86400000;
  const T0 = Date.UTC(2021, 0, 1);
  const events = [
    // mainshock
    { id: 'e1', time: new Date(T0).toISOString(), latitude: -41, longitude: 174.0, magnitude: 4.0, depth: 10 },
    // 0 km,  +10 d  -> inside  L(4) and T(4)  => dependent
    { id: 'e2', time: new Date(T0 + 10 * DAY).toISOString(), latitude: -41, longitude: 174.0, magnitude: 2.0, depth: 10 },
    // 0 km,  +60 d  -> outside T(4) = 41.4 d  => independent
    { id: 'e3', time: new Date(T0 + 60 * DAY).toISOString(), latitude: -41, longitude: 174.0, magnitude: 2.0, depth: 10 },
    // 50.35 km, +5 d -> outside L(4) = 30.1 km, and 25.18 km from e5,
    //                   outside L(2) = 17.0 km => independent
    { id: 'e4', time: new Date(T0 + 5 * DAY).toISOString(), latitude: -41, longitude: 174.6, magnitude: 2.0, depth: 10 },
    // 25.18 km, +5 d -> inside  L(4) and T(4)  => dependent
    { id: 'e5', time: new Date(T0 + 5 * DAY).toISOString(), latitude: -41, longitude: 174.3, magnitude: 2.0, depth: 10 },
  ];

  it('applies the tabulated L(M) and T(M) windows', () => {
    const w4 = getGardnerKnopoffWindow(4.0);
    expect(w4.timeWindowDays).toBeCloseTo(41.362, 2);
    expect(w4.distanceWindowKm).toBeCloseTo(30.075, 2);
    const w2 = getGardnerKnopoffWindow(2.0);
    expect(w2.timeWindowDays).toBeCloseTo(3.426, 2);
    expect(w2.distanceWindowKm).toBeCloseTo(17.006, 2);
  });

  it('keeps exactly the events outside every larger event window', () => {
    const { mainshocks } = gardnerKnopoffDeclustering(events);
    expect(mainshocks.map(e => e.id).sort()).toEqual(['e1', 'e3', 'e4']);
    // 2 of 5 removed: the removal fraction is a property of the windows, not a
    // constant chosen in advance.
    expect(1 - mainshocks.length / events.length).toBeCloseTo(0.4, 10);
  });
});
