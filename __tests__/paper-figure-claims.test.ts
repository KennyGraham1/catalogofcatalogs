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
 *   4. the b-value-stability cut-off of the example, the platform's own MBS estimate, is
 *      the completeness level of a planted G-R sample and is withheld when b never settles;
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
  // stabilityCutoff(events) is the platform's own MBS estimate (Cao & Gao 2002, in the
  // form of Woessner & Wiemer 2005): the lowest 0.1 cut-off Mi with
  // |b_ave(Mi) - b(Mi)| <= db(Mi), b_ave the mean b over Mi .. Mi + 0.5 and
  // db = 2.3 b^2 sd(M) / sqrt(n) the Shi & Bolt (1982) uncertainty, which is b / sqrt(n)
  // for a G-R sample (sd(M) = log10(e) / b); or null when the MBS finds no stable cut-off
  // and the platform falls back to another method. The MBS itself is tested in
  // __tests__/fix-science-mc-stability.test.ts; these tests pin what the paper's cut-off
  // means. The magnitudes are reported on the 0.1 grid, so b(Mi) is the Aki-Utsu MLE with
  // the half-bin lower bound Mi - 0.05.

  /** Events with `count(m)` magnitudes m on the 0.1 grid, m = from, from + 0.1, ..., to. */
  function gridSample(from: number, to: number, count: (m: number) => number) {
    const mags: number[] = [];
    for (let k = Math.round(from * 10); k <= Math.round(to * 10); k++) {
      const m = Number((k / 10).toFixed(1));
      for (let i = 0; i < count(m); i++) mags.push(m);
    }
    return asEvents(mags);
  }

  // A b = 1 law complete from M2.0 to M6.0, round(10^4 x 10^-(m - 2)) events at m, whose
  // detection halves with each 0.1 bin below M2.0, down to M1.5.
  //   Above any Mi >= 2.0 the sample is geometric with ratio q = 10^-0.1 (memoryless), so
  //   b(Mi) = log10(e) / (0.1 q/(1 - q) + 0.05) = 0.9956 at every such cut-off (the cap at
  //   M6.0 raises it by under 0.002 up to M2.5), and |b_ave(2.0) - b(2.0)| is about 0
  //   against db(2.0) = 0.9956 / sqrt(48,617) = 0.0045: M2.0 passes.
  //   At M1.9 the 6,295 events of the half-detected bin join them: the mean magnitude is
  //   (6,295 x 1.9 + 48,617 x 2.386) / 54,912 = 2.330, so b(1.9) = 0.4343 / (2.330 - 1.85)
  //   = 0.904, b_ave(1.9) = (0.904 + 5 x 0.996) / 6 = 0.981, and |b_ave - b| = 0.077 is
  //   twenty times db(1.9) = 0.904 / sqrt(54,912) = 0.0039: M1.9 fails. The same arithmetic
  //   gives b = 0.55, 0.62, 0.70 and 0.80 at M1.5-1.8, rising to 0.90 at M1.9, so each lower
  //   cut-off fails by more (|b_ave - b| of 0.15 or more against db < 0.003).
  //   The stable cut-off is therefore the planted completeness magnitude, M2.0.
  const completeFrom2 = gridSample(1.5, 6.0, m => Math.round(
    1e4 * Math.pow(10, -(m - 2)) * (m < 2 ? Math.pow(0.5, Math.round((2 - m) * 10)) : 1)
  ));

  it('is the platform MBS estimate: the planted completeness of a G-R sample', () => {
    expect(stabilityCutoff(completeFrom2)).toBe(2.0);
    const gr = calculateGutenbergRichter(completeFrom2, undefined, 0.1, { method: 'MBS' });
    expect(gr.mcSource).toBe('MBS');
    expect(gr.completeness).toBe(2.0);
    expect(gr.eventsAboveMc).toBe(48617);
    expect(Math.abs(gr.bValue - 0.9956)).toBeLessThan(0.002);
  });

  // A curved FMD whose b never settles: round(10^4 x 10^-(x + 0.5 x^2)) events at
  // m = 2 + x, x = 0 .. 2. Its local slope 1 + x rises by 0.1 per 0.1 bin, and b(Mi) by
  // about 0.08 (from 1.46 at M2.0 to 2.27 at M3.0), so b_ave(Mi) - b(Mi) is about
  // 2.5 x 0.08 = 0.2 at every cut-off with a whole 0.5 window (Mi <= 3.0, the last with
  // 50 events at or above Mi + 0.5), while db(Mi), about b / sqrt(n), is at most about
  // 2.27 / sqrt(798) = 0.08, at M3.0. No cut-off is stable, and although the platform
  // still reports an Mc (from its fallback), stabilityCutoff does not.
  it('returns null when b never settles, whatever the fallback Mc', () => {
    const curved = gridSample(2.0, 4.0, m => Math.round(1e4 * Math.pow(10, -(m - 2) - 0.5 * (m - 2) ** 2)));
    expect(stabilityCutoff(curved)).toBeNull();
    const gr = calculateGutenbergRichter(curved, undefined, 0.1, { method: 'MBS' });
    expect(gr.requestedMcMethod).toBe('MBS');
    expect(gr.mcSource).not.toBe('MBS');
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
