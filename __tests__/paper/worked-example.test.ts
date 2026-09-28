/**
 * Platform-exercising reproduction for the SRL paper's worked example.
 *
 * The paper's worked-example numbers are computed by the platform's own engine
 * (paper/figures/worked_example_engine.ts, run on the seeded synthetic catalogues by
 * paper/figures/generate_figures.py). Generating those catalogues needs Python, so CI
 * exercises the engine here instead: first the estimators alone on a seeded synthetic
 * catalogue (they recover the planted b-value and completeness, and declustering reduces
 * the catalogue), then the whole pipeline - import scoring, merge, quality filter,
 * b-value and declustering - on a small seeded two-catalogue input, checking that every
 * count the paper's funnel reports adds up.
 */
import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  gardnerKnopoffDeclustering,
} from '@/lib/seismological-analysis';
import { runWorkedExample, type WorkedExampleInput } from '@/paper/figures/worked_example_engine';

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

/**
 * A small two-agency input in the generator's format: 3,000 true events (b = 1 above
 * M 1.8, with ten injected clusters), catalogue A reporting the first 2,400 and
 * catalogue B the last 1,800, so 1,200 earthquakes are reported by both. A's reports are
 * well constrained (small gap, many stations); B's are worse and offshore-like for half
 * of its unique events.
 */
function buildTwoCatalogueInput(): WorkedExampleInput {
  const rng = mulberry32(7);
  const N_TRUE = 3000;
  const truth: { t: number; lat: number; lon: number; z: number; m: number; after: boolean }[] = [];
  for (let i = 0; i < N_TRUE; i++) {
    const clustered = i % 300 < 25 && i >= 300; // ten clusters of 25 aftershocks
    const parent = truth[i - (i % 300) - 1];
    truth.push(clustered && parent
      ? { t: parent.t + rng() * 20, lat: parent.lat + (rng() - 0.5) * 0.1, lon: parent.lon + (rng() - 0.5) * 0.1,
          z: parent.z, m: 1.8 + -Math.log(1 - rng()) / (1.3 * Math.LN10), after: true }
      : { t: rng() * 1827, lat: -46 + rng() * 10, lon: 167 + rng() * 10, z: 5 + rng() * 25,
          m: (i % 300 === 299 ? 4.8 : 1.8) + -Math.log(1 - rng()) / BETA, after: false });
  }
  const report = (i: number, good: boolean) => {
    const e = truth[i];
    const hErr = good ? 1 : 6;
    return {
      t_days: e.t + ((rng() - 0.5) * 2) / 86400,
      latitude: e.lat + ((rng() - 0.5) * hErr) / 111,
      longitude: e.lon + ((rng() - 0.5) * hErr) / 84,
      depth: Math.max(0, e.z + (rng() - 0.5) * 4),
      magnitude: good ? e.m + (rng() - 0.5) * 0.1 : Math.round((e.m + (rng() - 0.5) * 0.1) * 10) / 10,
      gap: good ? 40 + rng() * 100 : (i % 2 ? 60 + rng() * 100 : 200 + rng() * 120),
      stations: good ? 12 + Math.floor(rng() * 20) : 4 + Math.floor(rng() * 8),
      hUnc: good ? 0.5 + rng() : 2 + rng() * 10,
    };
  };
  const catalogue = (id: string, name: string, indices: number[], good: boolean) => {
    const rows = indices.map(i => report(i, good));
    const col = <T,>(f: (r: typeof rows[number], k: number) => T) => rows.map(f);
    return {
      id, name,
      columns: {
        id: col((_, k) => `${id}-${k}`),
        source_id: col((_, k) => `${id}-${k}`),
        t_days: col(r => r.t_days),
        latitude: col(r => r.latitude),
        longitude: col(r => r.longitude),
        depth: col(r => r.depth),
        depth_type: col(() => 'from location'),
        magnitude: col(r => r.magnitude),
        magnitude_type: col(() => 'ML'),
        horizontal_uncertainty: col(r => r.hUnc),
        depth_uncertainty: col(r => 1.5 * r.hUnc),
        time_uncertainty: col(r => 0.05 + r.hUnc / 7),
        azimuthal_gap: col(r => r.gap),
        used_station_count: col(r => r.stations),
        used_phase_count: col(r => r.stations * 2),
        standard_error: col(() => 0.2),
        magnitude_uncertainty: col(r => 0.05 + 0.3 / Math.sqrt(r.stations)),
        magnitude_station_count: col(r => r.stations),
        evaluation_mode: col(() => 'manual'),
        evaluation_status: col(() => 'reviewed'),
        agency_id: col(() => id.toUpperCase()),
      },
    };
  };
  const a = Array.from({ length: 2400 }, (_, k) => k);
  const b = Array.from({ length: 1800 }, (_, k) => 1200 + k);
  return {
    t0: '2020-01-01T00:00:00Z',
    catalogues: [
      catalogue('synthetic-geonet-like', 'Synthetic GeoNet-like catalogue', a, true),
      catalogue('synthetic-agency-b', 'Synthetic Agency B catalogue', b, false),
    ],
    truth: {
      'synthetic-geonet-like': { true_index: a, is_aftershock: a.map(i => truth[i].after) },
      'synthetic-agency-b': { true_index: b, is_aftershock: b.map(i => truth[i].after) },
    },
  };
}

describe('SRL worked example - the platform pipeline on a two-catalogue input', () => {
  const warn = console.warn;
  const log = console.log;
  let result: ReturnType<typeof runWorkedExample>;
  beforeAll(() => {
    console.warn = () => {};
    console.log = () => {};
    try {
      result = runWorkedExample(buildTwoCatalogueInput(), {
        timeThresholdSeconds: 60, distanceThresholdKm: 50, minQuality: 70, analysisCutoff: 2.0,
      });
    } finally {
      console.warn = warn;
      console.log = log;
    }
  });

  it('merges with the real matcher and finds the injected pairs', () => {
    const m = result.merge;
    expect(m.ingested).toBe(4200);
    expect(m.injected_pairs).toBe(1200);
    expect(m.merged + m.removed).toBe(m.ingested);
    expect(m.first_only + m.second_only + m.duplicate_groups).toBe(m.merged);
    expect(m.true_pairs_found + m.false_associations).toBe(m.duplicate_groups);
    expect(m.true_pairs_found + m.missed_pairs).toBe(m.injected_pairs);
    expect(Object.values(m.missed_by_reason).reduce((s, v) => s + v, 0)).toBe(m.missed_pairs);
    expect(Object.values(m.resolved_to).reduce((s, v) => s + v, 0)).toBe(m.duplicate_groups);
    expect(m.true_pairs_found / m.injected_pairs).toBeGreaterThan(0.9);
    // Catalogue A's reports are better constrained, so the Quality-based strategy keeps them.
    expect(m.resolved_to['synthetic-geonet-like']).toBeGreaterThan(m.resolved_to['synthetic-agency-b']);
  });

  it('scores every event with equation 1 and filters on it', () => {
    const q = result.quality;
    expect(q.retained + q.removed).toBe(result.merge.merged);
    expect(result.merged_events.q.every(v => Number.isInteger(v) && v >= 0 && v <= 100)).toBe(true);
    expect(result.merged_events.retained.filter(Boolean).length).toBe(q.retained);
    // The high-gap reports are Agency B's poorly constrained ones: the filter removes most.
    expect(q.gap_over_180_removed_fraction).toBeGreaterThan(0.5);
  });

  it('runs the b-value and declustering on the filtered events above the cut-off', () => {
    const a = result.analysis;
    expect(a.cutoff).toBe(2.0);
    expect(a.retained_above + a.below_cutoff_removed).toBe(result.quality.retained);
    expect(a.declustered + a.removed_by_gk).toBe(a.retained_above);
    expect(a.gr_retained.n).toBe(a.retained_above);
    expect(Number.isFinite(a.gr_retained.b)).toBe(true);
    expect(a.gr_declustered?.n).toBe(a.declustered);
    expect(a.removed_by_gk).toBeGreaterThan(0);
    expect(result.b_vs_cutoff.map(r => r.cutoff)[0]).toBe(1.5);
  });
});
