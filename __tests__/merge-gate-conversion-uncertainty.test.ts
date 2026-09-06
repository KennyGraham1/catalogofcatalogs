/**
 * @jest-environment node
 *
 * The common-scale (Mw) leg of the magnitude-consistency gate must be judged against a
 * threshold widened by the uncertainty of the conversions that produced it.
 *
 * Background: making the Mw comparison authoritative in both directions (so that a
 * mixed-scale group whose RAW values coincide can still be rejected) introduced a systematic
 * artefact. convertToMw maps ML by an identity approximation but mb through Scordilis (2006)
 * Mw = 0.85*mb + 1.03, so two equal-valued reports of the SAME earthquake separate by a fixed
 * offset purely because of the conversion:
 *
 *     ML 3.0 -> Mw 3.00 (sigma 0.30, generic ML~Mw identity)
 *     mb 3.0 -> Mw 3.58 (sigma 0.60, extrapolated below Scordilis's calibrated 3.5-6.2 band)
 *     separation 0.58 of Mw, against a raw tier of 0.5
 *
 * GeoNet reporting ML and ISC reporting mb is the single most common duplicate pairing in the
 * New Zealand catalogue, so judging that 0.58 against the bare tier split genuine duplicates
 * for every equal-valued pair up to about M3.5. A discrepancy smaller than the uncertainty of
 * the transform used to detect it is not evidence of disagreement, so the Mw threshold is the
 * tier widened in quadrature by the conversion uncertainty of the two extreme members:
 *
 *     effective = sqrt(tier^2 + sigma_lo^2 + sigma_hi^2)
 *
 * Expected values below are computed by hand from that formula, the tier table
 * (mean < 4.0 -> 0.5, < 5.5 -> 0.8, < 7.0 -> 1.2, else 1.5) and the published relations
 * Mw = 0.67*Ms + 2.07 (Ms < 6.2) and Mw = 0.85*mb + 1.03 — never read back from the code.
 */

import { validateEventGroup } from '@/lib/merge';

const ev = (
  id: string,
  magnitude: number | null,
  magnitude_type: string | undefined,
  source: string,
  secondsOffset = 0
): any => ({
  id,
  time: new Date(Date.UTC(2020, 0, 1, 0, 0, secondsOffset)).toISOString(),
  latitude: -41,
  longitude: 174,
  depth: 12,
  magnitude,
  magnitude_type,
  source,
});

describe('conversion uncertainty widens the Mw threshold', () => {
  it('keeps equal-valued GeoNet ML / ISC mb pairs together below M4', () => {
    // ML 3.0 -> 3.00 (sigma 0.30); mb 3.0 -> 0.85*3.0 + 1.03 = 3.58 (sigma 0.60, extrapolated).
    // separation 0.58; tier at raw mean 3.0 is 0.5;
    // effective = sqrt(0.5^2 + 0.30^2 + 0.60^2) = sqrt(0.25 + 0.09 + 0.36) = sqrt(0.70) = 0.837
    // 0.58 <= 0.837 -> the pair is one earthquake.
    expect(validateEventGroup([ev('gn', 3.0, 'ML', 'GeoNet'), ev('isc', 3.0, 'mb', 'ISC', 2)], false)).toBe(true);

    // ML 2.5 -> 2.50; mb 2.5 -> 3.155; separation 0.655; same widened threshold 0.837.
    expect(validateEventGroup([ev('gn', 2.5, 'ML', 'GeoNet'), ev('isc', 2.5, 'mb', 'ISC', 2)], false)).toBe(true);

    // ML 3.5 -> 3.50; mb 3.5 -> 0.85*3.5 + 1.03 = 4.005 (sigma 0.30, now inside the calibrated
    // band); separation 0.505 — just over the bare 0.5 tier, which is exactly the case that
    // used to split. effective = sqrt(0.25 + 0.09 + 0.09) = sqrt(0.43) = 0.656.
    expect(validateEventGroup([ev('gn', 3.5, 'ML', 'GeoNet'), ev('isc', 3.5, 'mb', 'ISC', 2)], false)).toBe(true);
  });

  it('still rejects a cross-scale pair that genuinely disagrees', () => {
    // ML 3.0 -> 3.00 (sigma 0.30); Ms 3.0 -> 0.67*3.0 + 2.07 = 4.08 (sigma 0.20).
    // separation 1.08; effective = sqrt(0.25 + 0.09 + 0.04) = sqrt(0.38) = 0.616.
    // 1.08 > 0.616 -> two different earthquakes, as before the widening.
    expect(validateEventGroup([ev('gn', 3.0, 'ML', 'GeoNet'), ev('isc', 3.0, 'Ms', 'ISC', 2)], false)).toBe(false);

    // Md 3.0 -> 3.00; Ms 3.4 -> 0.67*3.4 + 2.07 = 4.348; separation 1.348, far outside any
    // plausible widening.
    expect(validateEventGroup([ev('a', 3.0, 'Md', 'AgencyA'), ev('b', 3.4, 'Ms', 'AgencyB', 2)], false)).toBe(false);

    // A real magnitude disagreement across scales: ML 3.0 -> 3.00, mb 4.5 -> 4.855.
    // separation 1.855, well beyond sqrt(0.5^2 + 0.30^2 + 0.30^2) = 0.655.
    expect(validateEventGroup([ev('gn', 3.0, 'ML', 'GeoNet'), ev('isc', 4.5, 'mb', 'ISC', 2)], false)).toBe(false);
  });

  it('does not let the widening rescue a same-scale disagreement', () => {
    // Two Ms reports 0.7 apart: the per-scale raw check runs before any conversion and the
    // widening cannot reach it, because both members convert with the same relation.
    expect(validateEventGroup([ev('a', 3.0, 'Ms', 'AgencyA'), ev('b', 3.7, 'Ms', 'AgencyB', 2)], false)).toBe(false);

    // ...and a member of a second scale must not launder it either.
    expect(
      validateEventGroup(
        [ev('a', 3.0, 'Ms', 'AgencyA'), ev('b', 3.7, 'Ms', 'AgencyB', 2), ev('c', 4.3, 'ML', 'GeoNet', 4)],
        false
      )
    ).toBe(false);
  });

  it('is independent of the order the members are supplied in', () => {
    const trio = [ev('gn', 3.0, 'ML', 'GeoNet'), ev('isc', 3.0, 'mb', 'ISC', 2), ev('nei', 3.1, 'mb', 'NEIC', 4)];
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2],
      [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ];
    const verdicts = permutations.map((p) => validateEventGroup(p.map((i) => trio[i]), false));
    expect(new Set(verdicts).size).toBe(1);
  });
});
