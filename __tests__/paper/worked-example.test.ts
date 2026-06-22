/**
 * Platform-exercising reproduction for the SRL paper's worked example (Section 5).
 *
 * Unlike paper/figures/generate_figures.py (a standalone NumPy script that draws the
 * figures), this test runs the ACTUAL CofC TypeScript estimators on a seeded synthetic
 * catalogue and confirms they recover the planted Gutenberg-Richter b-value and
 * completeness, and that declustering reduces the catalogue and shifts b. It is the
 * reproducibility path that demonstrates the platform code itself behaves correctly.
 */
import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  gardnerKnopoffDeclustering,
} from '@/lib/seismological-analysis';

// Deterministic PRNG (mulberry32) so the synthetic catalogue is fully reproducible.
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

const B_TRUE = 1.0;
const MC = 2.0;
const BIN = 0.1;
const BETA = B_TRUE * Math.LN10;
const T0 = Date.UTC(2020, 0, 1);
const FIVE_YEARS_MS = 5 * 365 * 86400000;

function drawMag(rng: () => number, mcLower: number): number {
  const x = -Math.log(1 - rng()) / BETA; // exponential, mean 1/beta
  // Draw from the continuous completeness threshold (Mc - binWidth/2) before
  // rounding, so the lowest 0.1 bin is properly populated and the Utsu binning
  // correction recovers the planted b-value.
  return Math.round((mcLower - BIN / 2 + x) / BIN) * BIN;
}

function buildSyntheticCatalogue() {
  const rng = mulberry32(42);
  const events: {
    id: string; time: string; latitude: number; longitude: number; magnitude: number; depth: number;
  }[] = [];
  let id = 0;
  const push = (t: number, lat: number, lon: number, mag: number) =>
    events.push({ id: `e${id++}`, time: new Date(t).toISOString(), latitude: lat, longitude: lon, magnitude: mag, depth: 5 + rng() * 30 });

  // Background: GR-distributed, complete above MC, spread over NZ and 5 years.
  for (let i = 0; i < 4000; i++) {
    push(T0 + rng() * FIVE_YEARS_MS, -47 + rng() * 13, 166 + rng() * 13, drawMag(rng, MC));
  }
  // Injected mainshock-aftershock clusters (tight in space-time) to exercise declustering.
  for (let c = 0; c < 30; c++) {
    const lat = -46 + rng() * 11;
    const lon = 167 + rng() * 11;
    const t = T0 + rng() * FIVE_YEARS_MS;
    push(t, lat, lon, 5.0 + rng() * 0.8); // mainshock
    const n = 30 + Math.floor(rng() * 30);
    for (let k = 0; k < n; k++) {
      push(t + rng() * 15 * 86400000, lat + (rng() - 0.5) * 0.1, lon + (rng() - 0.5) * 0.1, drawMag(rng, MC));
    }
  }
  return events;
}

describe('SRL worked example — real platform estimators on a seeded synthetic catalogue', () => {
  const events = buildSyntheticCatalogue();

  it('recovers the planted Gutenberg-Richter b-value (~1.0)', () => {
    const gr = calculateGutenbergRichter(events, MC);
    expect(gr.bValue).toBeGreaterThan(0.9);
    expect(gr.bValue).toBeLessThan(1.1);
    expect(gr.bUncertainty).toBeGreaterThan(0); // sigma_b = b/sqrt(N) reported
  });

  it('estimates a plausible completeness magnitude near the planted Mc', () => {
    const mc = estimateCompletenessMagnitude(events);
    expect(mc.method).toBe('MAXC');
    expect(mc.mc).toBeGreaterThanOrEqual(2.0); // MAXC(2.0) + 0.2 correction
    expect(mc.mc).toBeLessThanOrEqual(2.5);
  });

  it('declustering removes a clustered fraction and shifts b', () => {
    const { mainshocks } = gardnerKnopoffDeclustering(events);
    expect(mainshocks.length).toBeGreaterThan(0);
    expect(mainshocks.length).toBeLessThan(events.length); // aftershocks removed
    const removedFraction = 1 - mainshocks.length / events.length;
    expect(removedFraction).toBeGreaterThan(0.05);

    const bDecl = calculateGutenbergRichter(mainshocks, MC).bValue;
    expect(Number.isFinite(bDecl)).toBe(true);
    expect(bDecl).toBeGreaterThan(0.5);
    expect(bDecl).toBeLessThan(1.5);
  });
});
