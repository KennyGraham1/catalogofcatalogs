/**
 * @jest-environment node
 *
 * Uncertainty-aware magnitude and depth gates (lib/merge.ts, assessMagnitudeConsistency and
 * assessDepthConsistency).
 *
 * Magnitude. Two solutions of one earthquake differ in magnitude by measurement scatter
 * (their reported uncertainties sigma1, sigma2) plus inter-agency scatter that no uncertainty
 * reports (station sets, attenuation corrections, ML definitions; sigma_ag = 0.2). When the
 * association recorded the pair, the pairing was NOT contested, and the solutions agree
 * closely in origin time and epicentre (normalised separation |dt|/tau + d/delta <= 0.2, a fifth
 * of the windows, and,
 * where both state them, within 3 combined standard errors), the tier T is widened to
 *     min(2T, max(T, 3 * sqrt(sigma1^2 + sigma2^2 + 0.2^2))).
 * Otherwise - a loose pair, a contested pairing in a dense sequence, a group assembled outside
 * the association, a raw comparison across scales that cannot be homogenised - the tier
 * stands.
 *
 * Depth. A fixed (operator-assigned) depth is not compared. Solved-for depths must agree within
 *     max(depth tier, 3 * sqrt(sigma1^2 + sigma2^2)).
 *
 * Every expected value below is worked by hand from those formulas.
 */

import {
  validateEventGroup,
  groupMatchingEvents,
  performMergeWithGroups,
  assessMatchGroup,
} from '@/lib/merge';

// The paper's baseline windows: 60 s and 50 km below M4 (no adaptive widening).
const config: any = {
  timeThreshold: 60,
  distanceThreshold: 50,
  mergeStrategy: 'quality',
  priority: 'quality',
};

const KM_PER_DEG_LAT = 111.195; // great-circle km per degree of latitude (R = 6371 km)

/** One catalogue entry, `northKm` north of -41.0, 174.0 and `seconds` after the origin. */
const entry = (
  id: string,
  catalogueId: string,
  magnitude: number | null,
  opts: {
    seconds?: number;
    northKm?: number;
    depth?: number | null;
    depthType?: string;
    depthSigma?: number;
    magSigma?: number;
    magType?: string;
    timeSigma?: number;
    horizontalSigma?: number;
  } = {}
): any => ({
  id,
  catalogueId,
  source: catalogueId,
  time: new Date(Date.UTC(2024, 0, 1, 0, 0, 0) + Math.round((opts.seconds ?? 0) * 1000)).toISOString(),
  latitude: -41.0 + (opts.northKm ?? 0) / KM_PER_DEG_LAT,
  longitude: 174.0,
  depth: opts.depth === undefined ? 12 : opts.depth,
  ...(opts.depthType ? { depth_type: opts.depthType } : {}),
  ...(opts.depthSigma != null ? { depth_uncertainty: opts.depthSigma } : {}),
  magnitude,
  magnitude_type: opts.magType ?? 'ML',
  ...(opts.magSigma != null ? { magnitude_uncertainty: opts.magSigma } : {}),
  ...(opts.timeSigma != null ? { time_uncertainty: opts.timeSigma } : {}),
  ...(opts.horizontalSigma != null ? { horizontal_uncertainty: opts.horizontalSigma } : {}),
});

const ids = (groups: Array<{ events: any[] }>) =>
  groups.map(g => g.events.map(e => e.id).sort()).sort((a, b) => a[0].localeCompare(b[0]));

/** The association evidence a pipeline group carries, for direct calls of the gate. */
const uncontested = { timeThreshold: 60, distanceThreshold: 50, contested: false };
const contested = { ...uncontested, contested: true };

// ---------------------------------------------------------------------------
// Magnitude
// ---------------------------------------------------------------------------

describe('magnitude gate — a close, uncontested pair is judged by its uncertainties', () => {
  // The live QC case: ML 1.07 and ML 1.70 from two catalogues, 0.0 s and 1 km apart.
  // dM = 0.63 > tier 0.5 (mean 1.385 < 4). Reported sigmas 0.15 and 0.20:
  //   3 * sqrt(0.15^2 + 0.20^2 + 0.2^2) = 3 * sqrt(0.0225 + 0.04 + 0.04) = 3 * 0.3202 = 0.961,
  // capped at 2 * 0.5 = 1.0 -> tolerance 0.96 >= 0.63.
  // Closeness: |dt|/60 + 1/50 = 0.02 <= 0.2; 1 km <= 3 * sqrt(1^2 + 1^2) = 4.24 km;
  // 0 s <= 3 * sqrt(0.2^2 + 0.2^2) s.
  const a = entry('a', 'cat-a', 1.07, { magSigma: 0.15, timeSigma: 0.2, horizontalSigma: 1 });
  const b = entry('b', 'cat-b', 1.7, { northKm: 1, magSigma: 0.2, timeSigma: 0.2, horizontalSigma: 1 });

  it('merges the tight ML 1.07 / ML 1.70 pair the fixed 0.5 tier kept apart', () => {
    expect(ids(groupMatchingEvents([a, b], config))).toEqual([['a', 'b']]);
  });

  it('is what the gate decides on the association evidence, and the fixed tier without it', () => {
    expect(validateEventGroup([a, b], false, undefined, uncontested)).toBe(true);
    // Assembled outside the association (no record): the fixed tier alone, as before.
    expect(validateEventGroup([a, b], false)).toBe(false);
  });

  it('is reported by the preview as an acceptance, not a violation, and not held', () => {
    const groups = performMergeWithGroups([a, b], { ...config, onConflict: 'hold' });
    expect(groups).toHaveLength(1);
    expect(groups[0].isSuspicious).toBe(false);
    expect(groups[0].heldForReview).toBe(false);
    expect(groups[0].validationWarnings).toHaveLength(1);
    const [note] = groups[0].validationWarnings;
    expect(note).toContain('0.63');
    expect(note).toContain('accepted');
    expect(note).toContain('0.96');
    // Catalogue entries are entries or solutions in what the reviewer reads, never reports.
    expect(note).not.toMatch(/\breports?\b/i);
  });

  it('does not depend on the order the entries arrive in', () => {
    expect(ids(groupMatchingEvents([b, a], config))).toEqual([['a', 'b']]);
  });

  it('keeps a LOOSE pair with the same magnitudes apart', () => {
    // 20 s and 10 km apart: 20/60 + 10/50 = 0.533 > 0.2, so the tier 0.5 stands: 0.63 > 0.5.
    const late = entry('late', 'cat-b', 1.7, { seconds: 20, northKm: 10, magSigma: 0.2, timeSigma: 0.2, horizontalSigma: 1 });
    expect(ids(groupMatchingEvents([a, late], config))).toEqual([['a'], ['late']]);
  });

  it('merges a pair just past a tenth of the windows (the live QC case at 0.105)', () => {
    // ML 0.88 and ML 1.40, 0.2 s and 5.1 km apart: 0.2/60 + 5.1/50 = 0.105 <= 0.2.
    // dM 0.52 > tier 0.5; 3 * sqrt(0.15^2 + 0.20^2 + 0.2^2) = 0.96 >= 0.52.
    // 5.1 km <= 3 * sqrt(2^2 + 2^2) = 8.49 km; 0.2 s <= 3 * sqrt(0.2^2 + 0.2^2) = 0.85 s.
    const c = entry('c', 'cat-a', 0.88, { magSigma: 0.15, timeSigma: 0.2, horizontalSigma: 2 });
    const d = entry('d', 'cat-b', 1.4, { seconds: 0.2, northKm: 5.1, magSigma: 0.2, timeSigma: 0.2, horizontalSigma: 2 });
    expect(ids(groupMatchingEvents([c, d], config))).toEqual([['c', 'd']]);
    expect(validateEventGroup([c, d], false, undefined, uncontested)).toBe(true);
    expect(validateEventGroup([c, d], false)).toBe(false);
  });

  it('keeps apart the same magnitudes just beyond a fifth of the windows', () => {
    // 0.7 s and 10.2 km apart: 0.7/60 + 10.2/50 = 0.216 > 0.2, although the reported errors
    // explain the offsets (10.2 km <= 3 * sqrt(4^2 + 4^2) = 17.0 km; 0.7 s <= 2.1 s): the
    // tier 0.5 stands and dM 0.52 exceeds it. (Two aftershocks this far apart, with these
    // magnitudes, were the first wrong pairing a looser bound admitted on the worked example.)
    const c = entry('c', 'cat-a', 0.88, { magSigma: 0.15, timeSigma: 0.5, horizontalSigma: 4 });
    const far = entry('far', 'cat-b', 1.4, { seconds: 0.7, northKm: 10.2, magSigma: 0.2, timeSigma: 0.5, horizontalSigma: 4 });
    expect(ids(groupMatchingEvents([c, far], config))).toEqual([['c'], ['far']]);
    expect(validateEventGroup([c, far], false, undefined, uncontested)).toBe(false);
    // Inside a fifth (0.6 s and 9.4 km: 0.01 + 0.188 = 0.198) the same pair is accepted.
    const near = entry('near', 'cat-b', 1.4, { seconds: 0.6, northKm: 9.4, magSigma: 0.2, timeSigma: 0.5, horizontalSigma: 4 });
    expect(ids(groupMatchingEvents([c, near], config))).toEqual([['c', 'near']]);
  });

  it('keeps apart a pair whose separation the reported location errors do not explain', () => {
    // 0 s and 4 km apart is inside a fifth of the window (4/50 = 0.08), but both solutions
    // claim 0.3 km: 4 km > 3 * sqrt(0.3^2 + 0.3^2) = 1.27 km, so they do not agree closely.
    const p = entry('p', 'cat-a', 1.07, { magSigma: 0.15, horizontalSigma: 0.3 });
    const q = entry('q', 'cat-b', 1.7, { northKm: 4, magSigma: 0.2, horizontalSigma: 0.3 });
    expect(validateEventGroup([p, q], false, undefined, uncontested)).toBe(false);
    // The same pair with honest 2 km errors (3 * sqrt(8) = 8.5 km) is accepted.
    const p2 = { ...p, horizontal_uncertainty: 2 };
    const q2 = { ...q, horizontal_uncertainty: 2 };
    expect(validateEventGroup([p2, q2], false, undefined, uncontested)).toBe(true);
  });

  it('credits only the inter-agency scatter when no uncertainty is reported', () => {
    // 3 * sqrt(0 + 0 + 0.2^2) = 0.60: dM 0.55 passes, dM 0.63 does not.
    const x = entry('x', 'cat-a', 1.07);
    expect(validateEventGroup([x, entry('y', 'cat-b', 1.62, { northKm: 1 })], false, undefined, uncontested)).toBe(true);
    expect(validateEventGroup([x, entry('y', 'cat-b', 1.7, { northKm: 1 })], false, undefined, uncontested)).toBe(false);
  });

  it('never widens past twice the tier, however large the reported uncertainties', () => {
    // sigma 1.0 each: 3 * sqrt(1 + 1 + 0.04) = 4.28, capped at 2 * 0.5 = 1.0.
    const x = entry('x', 'cat-a', 2.0, { magSigma: 1 });
    expect(validateEventGroup([x, entry('y', 'cat-b', 2.95, { northKm: 1, magSigma: 1 })], false, undefined, uncontested)).toBe(true);
    expect(validateEventGroup([x, entry('y', 'cat-b', 3.05, { northKm: 1, magSigma: 1 })], false, undefined, uncontested)).toBe(false);
  });

  it('does not widen a raw comparison across scales that cannot be homogenised', () => {
    // ML 3.0 vs an untyped 3.6 hide an unknown scale offset: the 0.5 tier stands even for a
    // close pair with generous uncertainties.
    const ml = entry('ml', 'cat-a', 3.0, { magSigma: 0.2 });
    const untyped = { ...entry('u', 'cat-b', 3.6, { northKm: 1, magSigma: 0.2 }), magnitude_type: undefined };
    expect(validateEventGroup([ml, untyped], false, undefined, uncontested)).toBe(false);
    // The same values on one scale are widened: 3 * sqrt(0.04 + 0.04 + 0.04) = 1.04 -> 1.0.
    const ml2 = entry('ml2', 'cat-b', 3.6, { northKm: 1, magSigma: 0.2 });
    expect(validateEventGroup([ml, ml2], false, undefined, uncontested)).toBe(true);
  });
});

describe('magnitude gate — a contested pairing stays strict', () => {
  // A (catalogue A) is closest to B1 (catalogue B, 0.5 s / 0.5 km: separation 0.018), but a
  // second catalogue-B entry B2 (3 s / 1 km: 0.07) is nearly as close (<= 2 * 0.018 + 0.1)
  // and is refused only because catalogue B is already in the group: the pairing is contested,
  // the dense-sequence case where magnitude is what tells neighbours apart.
  const withSigmas = { magSigma: 0.15, timeSigma: 0.2, horizontalSigma: 1 };
  const a = entry('a', 'cat-a', 1.07, withSigmas);
  const b1 = entry('b1', 'cat-b', 1.7, { ...withSigmas, seconds: 0.5, northKm: 0.5 });

  it('keeps the dM 0.63 pair apart once it is contested', () => {
    // B2 differs from A by 1.5 units, so it cannot pair with A either.
    const b2 = entry('b2', 'cat-b', 2.57, { ...withSigmas, seconds: 3, northKm: 1 });
    expect(ids(groupMatchingEvents([a, b1, b2], config))).toEqual([['a'], ['b1'], ['b2']]);
    // Uncontested (no B2), the same pair is one earthquake.
    expect(ids(groupMatchingEvents([a, b1], config))).toEqual([['a', 'b1']]);
  });

  it('is strict in the gate itself when the evidence says contested', () => {
    expect(validateEventGroup([a, b1], false, undefined, uncontested)).toBe(true);
    expect(validateEventGroup([a, b1], false, undefined, contested)).toBe(false);
  });

  it('lets magnitude pick the neighbour that matches when the pairing is contested', () => {
    // B2 now agrees with A (dM 0.13): the strict gate refuses A-B1, and A pairs with B2.
    const b2 = entry('b2', 'cat-b', 1.2, { ...withSigmas, seconds: 3, northKm: 1 });
    const groups = groupMatchingEvents([a, b1, b2], config);
    expect(ids(groups)).toEqual([['a', 'b2'], ['b1']]);
    // The preview reports what the gate decided: the A-B2 group passes, flagged only as
    // contested; B1 was matched and kept apart, with the magnitude reason.
    const pair = groups.find(g => g.events.length === 2)!;
    const assessed = assessMatchGroup(pair, config);
    expect(assessed.warnings.some(w => /^Ambiguous association/.test(w))).toBe(true);
    expect(assessed.warnings.some(w => /Large magnitude range/.test(w))).toBe(false);
    const lone = groups.find(g => g.events[0].id === 'b1')!;
    const loneAssessed = assessMatchGroup(lone, config);
    expect(loneAssessed.separated).toBe(true);
    expect(loneAssessed.warnings.join(' ')).toMatch(/Large magnitude range: 0\.63 units \(threshold: 0\.5\)/);
  });
});

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

describe('depth gate — fixed depths are not compared, solved depths by their uncertainties', () => {
  it('does not let a fixed (operator-assigned) depth fail the gate', () => {
    // 10 km fixed vs 45 km solved: 35 km > the 30 km shallow tier, but the fixed depth says
    // nothing about the depth, so nothing is compared.
    const fixed = entry('f', 'cat-a', 2.0, { depth: 10, depthType: 'operator assigned' });
    const solved = entry('s', 'cat-b', 2.1, { northKm: 1, depth: 45, depthType: 'from location', depthSigma: 4 });
    expect(validateEventGroup([fixed, solved], false)).toBe(true);
    // A legacy free-text label for a fixed depth is honoured the same way.
    expect(validateEventGroup([{ ...fixed, depth_type: 'fixed' }, solved], false)).toBe(true);
    // The same depths, both solved for and well constrained, are rejected (tier 30 km;
    // 3 * sqrt(2^2 + 4^2) = 13.4 km is below it).
    const free = { ...fixed, depth_type: 'from location', depth_uncertainty: 2 };
    expect(validateEventGroup([free, solved], false)).toBe(false);
  });

  it('tells the reviewer why the depths were not compared', () => {
    const fixed = entry('f', 'cat-a', 2.0, { depth: 10, depthType: 'operator assigned' });
    const solved = entry('s', 'cat-b', 2.1, { northKm: 1, depth: 45, depthSigma: 4 });
    const groups = performMergeWithGroups([fixed, solved], config);
    expect(groups).toHaveLength(1);
    expect(groups[0].isSuspicious).toBe(false);
    expect(groups[0].validationWarnings).toEqual([
      expect.stringMatching(/^Depth range of 35\.0 km includes a fixed depth \(operator assigned\)/),
    ]);
  });

  it('still rejects a large difference between two well-constrained depths', () => {
    // 5 km (sigma 2) vs 45 km (sigma 3): 40 km > max(30, 3 * sqrt(4 + 9) = 10.8) = 30 km.
    const shallow = entry('a', 'cat-a', 2.0, { depth: 5, depthSigma: 2 });
    const deep = entry('b', 'cat-b', 2.1, { northKm: 1, depth: 45, depthSigma: 3 });
    expect(validateEventGroup([shallow, deep], false)).toBe(false);
    const groups = performMergeWithGroups([shallow, deep], config);
    expect(ids(groups)).toEqual([['a'], ['b']]);
    expect(groups.every(g => g.separated)).toBe(true);
    expect(groups[0].validationWarnings.join(' ')).toMatch(/Large depth range: 40\.0 km \(threshold: 30 km\)/);
  });

  it('accepts two poorly constrained depths within what their own errors allow', () => {
    // 5 km (sigma 12) vs 45 km (sigma 10): 40 km <= 3 * sqrt(144 + 100) = 46.9 km.
    const a = entry('a', 'cat-a', 2.0, { depth: 5, depthSigma: 12 });
    const b = entry('b', 'cat-b', 2.1, { northKm: 1, depth: 45, depthSigma: 10 });
    expect(validateEventGroup([a, b], false)).toBe(true);
    const assessed = assessMatchGroup(groupMatchingEvents([a, b], config)[0], config);
    expect(assessed.suspicious).toBe(false);
    expect(assessed.warnings).toEqual([expect.stringMatching(/^Depth range of 40\.0 km exceeds the tier \(30 km\); accepted — within 46\.9 km/)]);
    // ...and rejects them past it: 50 km > 46.9 km.
    const c = { ...b, depth: 55 };
    expect(validateEventGroup([a, c], false)).toBe(false);
  });

  it('chooses the tier with the gate\'s mean magnitude in the preview too (no magnitude: wider tier)', () => {
    // No usable magnitude: the gate's NaN mean takes the wider shallow tier (50 km), so 40 km
    // passes. The preview used to take the strictest tier (30 km) here and flag a group the
    // merge had accepted.
    const a = entry('a', 'cat-a', null, { depth: 5 });
    const b = entry('b', 'cat-b', null, { northKm: 1, depth: 45 });
    expect(validateEventGroup([a, b], false)).toBe(true);
    const groups = performMergeWithGroups([a, b], config);
    expect(groups).toHaveLength(1);
    expect(groups[0].isSuspicious).toBe(false);
  });
});
