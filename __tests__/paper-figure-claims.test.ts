/**
 * Regression tests for the claims the SRL paper makes about its worked example.
 *
 * The worked example is computed by the platform's own engine
 * (paper/figures/worked_example_engine.ts, run by paper/figures/generate_figures.py):
 * the figure script only generates the synthetic catalogues and draws the figures. These
 * tests pin the pieces of that engine the paper's statements rest on:
 *
 *   1. the Gutenberg-Richter estimator recovers a planted b-value when the magnitudes are
 *      reported the way a catalogue reports them (the paper's estimator check);
 *   2. Gardner-Knopoff declustering applies the tabulated windows, forward in time, with
 *      every cluster head reserved - so an earlier, smaller event never absorbs a larger
 *      one (the figure script's former NumPy "port" lacked this and removed mainshocks as
 *      dependents of their own foreshocks);
 *   3. the symmetric-window variant the paper compares against differs from the platform's
 *      forward window only by reaching back T(M) before each head;
 *   4. the b-value-stability criterion that sets the example's cut-off;
 *   5. the most the azimuthal gap can move equation 1 on its own (12.5 points), which the
 *      paper quotes when it attributes the low Q of high-gap events.
 *
 * Every expected value below is derived analytically in the comments, not by running
 * the code.
 */
import {
  calculateGutenbergRichter,
  gardnerKnopoffDeclustering,
  getGardnerKnopoffWindow,
  type EarthquakeEvent,
} from '@/lib/seismological-analysis';
import {
  gapOnlyQuality,
  stabilityCutoff,
  symmetricGardnerKnopoff,
} from '@/paper/figures/worked_example_engine';

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

describe('SRL worked example - the estimator recovers a planted b', () => {
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
    expect(Math.abs(gr.bValue - B_PLANTED)).toBeLessThan(0.02);
    // The 0.1-grid is detected, so the Utsu correction is half the reporting step.
    expect(gr.magnitudeResolution).toBe(0.1);
    expect(gr.binningCorrection).toBeCloseTo(0.05, 9);
  });

  // Drawing from Mc itself half-fills the lowest bin, so the +dm/2 correction is
  // not applicable and b is biased low.  Same algebra with
  //   E[m] - Mc = dm * exp(-beta*dm/2)/(1 - exp(-beta*dm))
  //             = 0.1 * 0.891251/0.205672 = 0.433334,
  //   b = 0.4342945 / 0.483334 = 0.89854.
  it('is biased ~10% low if the magnitudes are drawn from Mc itself', () => {
    const gr = calculateGutenbergRichter(asEvents(plantedMagnitudes(MC)), MC, BIN);
    expect(gr.bValue).toBeGreaterThan(0.89854 - 0.015);
    expect(gr.bValue).toBeLessThan(0.89854 + 0.015);
  });
});

describe('SRL worked example - Gardner-Knopoff windows and cluster heads', () => {
  // Hand-computed windows (Gardner & Knopoff 1974; van Stiphout et al. 2012):
  //   M4.0: T = 10^(0.5409*4 - 0.547) = 41.36 d, L = 10^(0.1238*4 + 0.983) = 30.08 km
  //   M2.0: T = 10^(0.5409*2 - 0.547) =  3.43 d, L = 10^(0.1238*2 + 0.983) = 17.01 km
  // Haversine separations at latitude -41: 0.3 deg of longitude = 25.18 km,
  // 0.6 deg = 50.35 km.
  const DAY = 86400000;
  const T0 = Date.UTC(2021, 0, 1);
  const at = (id: string, day: number, lon: number, magnitude: number): EarthquakeEvent => ({
    id, time: new Date(T0 + day * DAY).toISOString(), latitude: -41, longitude: lon, magnitude, depth: 10,
  });
  const events = [
    at('e1', 0, 174.0, 4.0), // mainshock
    at('e2', 10, 174.0, 2.0), // 0 km, +10 d: inside L(4) and T(4) => dependent
    at('e3', 60, 174.0, 2.0), // 0 km, +60 d: outside T(4) = 41.4 d => independent
    at('e4', 5, 174.6, 2.0), // 50.35 km: outside L(4); 25.18 km from e5, outside L(2) => independent
    at('e5', 5, 174.3, 2.0), // 25.18 km, +5 d: inside L(4) and T(4) => dependent
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
  });

  // gp#0: an M2.9 two days before an M3.0, 8.4 km apart (0.1 deg of longitude at 41 S).
  // The M3.0 is visited first; its forward window does not reach back to the M2.9, so
  // the M2.9 becomes a head of its own. The M3.0 lies inside the M2.9's forward window
  // (T(2.9) = 10.5 d, L(2.9) = 22.0 km) but is a reserved head and must stay.
  it('never lets an earlier, smaller event absorb a larger head', () => {
    const pair = [at('fore', 98, 174.0, 2.9), at('main', 100, 174.1, 3.0)];
    expect(gardnerKnopoffDeclustering(pair).mainshocks.map(e => e.id).sort()).toEqual(['fore', 'main']);
  });

  // The symmetric variant reaches T(M) back from each head: the M3.0's window
  // (T(3.0) = 11.9 d, L(3.0) = 22.0 km) now covers the M2.9 two days earlier, so the
  // foreshock is removed, and the platform's forward window keeps it.
  it('the symmetric-window variant also removes foreshocks, and only that', () => {
    const pair = [at('fore', 98, 174.0, 2.9), at('main', 100, 174.1, 3.0)];
    expect(symmetricGardnerKnopoff(pair).map(e => e.id)).toEqual(['main']);
    // Without an earlier event in any window the two conventions agree.
    const forward = gardnerKnopoffDeclustering(events).mainshocks.map(e => e.id).sort();
    expect(symmetricGardnerKnopoff(events).map(e => e.id).sort()).toEqual(forward);
  });
});

describe('SRL worked example - the b-value-stability cut-off', () => {
  // b rises until 2.3 and then stays within one sigma_b (0.02) of its value there for the
  // next half magnitude unit, so 2.3 is the lowest cut-off with |b_ave - b| <= sigma_b.
  const series = [
    { cutoff: 2.0, b: 0.80 }, { cutoff: 2.1, b: 0.86 }, { cutoff: 2.2, b: 0.92 },
    { cutoff: 2.3, b: 0.99 }, { cutoff: 2.4, b: 1.00 }, { cutoff: 2.5, b: 1.01 },
    { cutoff: 2.6, b: 0.99 }, { cutoff: 2.7, b: 1.00 }, { cutoff: 2.8, b: 1.01 },
    { cutoff: 2.9, b: 1.00 }, { cutoff: 3.0, b: 0.99 }, { cutoff: 3.1, b: 1.00 },
    { cutoff: 3.2, b: 1.00 }, { cutoff: 3.3, b: 1.00 },
  ].map(p => ({ ...p, sigma: 0.02 }));

  it('returns the lowest cut-off at which b stays within its formal error', () => {
    expect(stabilityCutoff(series)).toBe(2.3);
  });

  it('returns null when b never settles within the series', () => {
    const rising = series.map((p, k) => ({ ...p, b: 0.8 + 0.05 * k }));
    expect(stabilityCutoff(rising)).toBeNull();
  });
});

describe('SRL worked example - how far the gap alone moves equation 1', () => {
  // Q_net loses nothing below 90 deg, (gap - 90)/2 points up to 180 deg (45 at 180) and at
  // most 50 beyond; with w_net = 0.25 that is 11.25 Q points at 180 deg and 12.5 at most.
  // An event ideal in every other respect therefore scores 100 below 90 deg,
  // round(100 - 11.25) = 89 at 180 deg and round(100 - 12.5) = 88 (JavaScript rounds
  // 87.5 up) from 270 deg.
  it('bounds the gap term at 12.5 points of Q', () => {
    const curve = gapOnlyQuality();
    const q = (gap: number) => curve.find(p => p.gap === gap)!.q;
    expect(q(0)).toBe(100);
    expect(q(85)).toBe(100);
    expect(q(180)).toBe(89);
    expect(q(270)).toBe(88);
    expect(q(360)).toBe(88);
    expect(Math.min(...curve.map(p => p.q))).toBe(88);
  });
});
