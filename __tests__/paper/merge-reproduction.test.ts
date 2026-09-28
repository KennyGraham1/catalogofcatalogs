/**
 * Merge-engine reproduction for the SRL paper's worked example.
 *
 * The worked example's merge numbers (duplicate groups found, pairs missed or wrongly
 * associated) are outputs of the platform's matcher on the seeded synthetic catalogues,
 * computed by paper/figures/worked_example_engine.ts. This test keeps a small, fully
 * controlled check of the same matcher (groupMatchingEvents from lib/merge): on a seeded
 * two-catalogue construction in which half of catalogue B duplicates catalogue A with
 * small space-time scatter, the matcher must pair the injected duplicates and nothing
 * else. Scale is reduced for CI runtime; the duplicate fraction is the invariant.
 */
import { groupMatchingEvents } from '@/lib/merge';

// Deterministic PRNG (mulberry32) for a fully reproducible construction.
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

const T0 = Date.UTC(2020, 0, 1);
const FIVE_YEARS_MS = 5 * 365 * 86400000;
const BETA = 1.0 * Math.LN10; // b = 1
const MC = 2.0;

const N_A = 6000; // "GeoNet-like" catalogue
const N_B = 4000; // "Agency B" catalogue
const DUP_FRAC = 0.5; // half of B duplicates events in A (matches the paper's design)
const N_DUP = Math.round(N_B * DUP_FRAC); // 2000

type Ev = {
  id: string; time: string; latitude: number; longitude: number;
  magnitude: number; depth: number; source: string; catalogueId: string;
};

function drawMag(rng: () => number): number {
  const x = -Math.log(1 - rng()) / BETA;
  return Math.round((MC - 0.05 + x) / 0.1) * 0.1;
}

function build(): { events: Ev[] } {
  const rng = mulberry32(42);
  const A: Ev[] = [];
  for (let i = 0; i < N_A; i++) {
    A.push({
      id: `A${i}`,
      time: new Date(T0 + rng() * FIVE_YEARS_MS).toISOString(),
      latitude: -47 + rng() * 13,
      longitude: 166 + rng() * 13,
      magnitude: drawMag(rng),
      depth: 5 + rng() * 30,
      source: 'GeoNet',
      catalogueId: 'A',
    });
  }

  const B: Ev[] = [];
  // First N_DUP entries of B are near-duplicates of distinct A events, with small
  // space/time/magnitude scatter that is well within the matching thresholds below.
  const dupTargets = new Set<number>();
  for (let k = 0; k < N_DUP; k++) {
    let j = Math.floor(rng() * N_A);
    while (dupTargets.has(j)) j = (j + 1) % N_A;
    dupTargets.add(j);
    const a = A[j];
    B.push({
      id: `B${k}`,
      time: new Date(new Date(a.time).getTime() + (rng() - 0.5) * 40_000).toISOString(), // +/-20 s
      latitude: a.latitude + (rng() - 0.5) * 0.06, // ~ +/-3 km
      longitude: a.longitude + (rng() - 0.5) * 0.06,
      magnitude: Math.round((a.magnitude + (rng() - 0.5) * 0.2) / 0.1) * 0.1,
      depth: a.depth + (rng() - 0.5) * 4,
      source: 'AgencyB',
      catalogueId: 'B',
    });
  }
  // The remaining B events are unique (background), far in time from any A event.
  for (let k = N_DUP; k < N_B; k++) {
    B.push({
      id: `B${k}`,
      time: new Date(T0 + rng() * FIVE_YEARS_MS).toISOString(),
      latitude: -47 + rng() * 13,
      longitude: 166 + rng() * 13,
      magnitude: drawMag(rng),
      depth: 5 + rng() * 30,
      source: 'AgencyB',
      catalogueId: 'B',
    });
  }

  return { events: [...A, ...B] };
}

describe('SRL worked example: merge engine recovers the injected 50% overlap', () => {
  const { events } = build();
  const config = {
    timeThreshold: 60,
    distanceThreshold: 50,
    mergeStrategy: 'priority',
    priority: 'newest',
  } as any;

  const groups = groupMatchingEvents(events, config);
  const merged = groups.length;
  const dupGroups = groups.filter(g => g.events.length > 1).length;
  const removed = events.length - merged;

  it('ingests the two synthetic catalogues at the designed sizes', () => {
    expect(events.length).toBe(N_A + N_B); // 10,000
  });

  it('detects the injected duplicate pairs (~50% of catalogue B) with the real matcher', () => {
    // Allow a small tolerance for the rare near-threshold miss/accidental match.
    expect(dupGroups).toBeGreaterThan(N_DUP * 0.98);
    expect(dupGroups).toBeLessThan(N_DUP * 1.02);
  });

  it('merges down to the expected unique-event count (removed ~= injected duplicates)', () => {
    const expectedUnique = N_A + N_B - N_DUP; // 8,000
    expect(merged).toBeGreaterThan(expectedUnique * 0.99);
    expect(merged).toBeLessThan(expectedUnique * 1.01);
    expect(removed).toBeGreaterThan(N_DUP * 0.98);
    expect(removed).toBeLessThan(N_DUP * 1.02);
  });
});
