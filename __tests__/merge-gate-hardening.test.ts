/**
 * @jest-environment node
 *
 * Hardening of the magnitude-consistency gate in lib/merge.ts.
 *
 * Merging two genuinely different earthquakes into one record is data corruption in a
 * scientific product, so every case below pins the gate to the SPLIT side of a decision it
 * previously got wrong:
 *
 *  1. The single-scale exclusion on the Mw rescue was per GROUP, so the Scordilis
 *     compression still fired on a same-scale pair as soon as a member of a second scale
 *     joined. The raw spread within EACH scale must now satisfy the threshold on its own.
 *  2. The Mw comparison was used only to ACCEPT, making the gate "pass if raw OR Mw agrees".
 *     For a mixed-scale group it is now authoritative in BOTH directions.
 *  3. A non-finite magnitude (NaN) disabled the whole magnitude gate for its group, because
 *     every comparison against NaN is false. NaN is now dropped like null.
 *  4. The preview computed its magnitude statistics without filtering null magnitudes, so
 *     the QC panel quoted a fabricated range for a group the merge had accepted. Preview and
 *     gate now share one helper.
 *  5. One untyped member poisoned the rescue for the whole group and the salvage then kept
 *     the untyped stranger while stranding the true cross-scale duplicate.
 *
 * Every expected value is derived by hand from the tier table and the published conversions
 * named in the comments, not read back from the implementation:
 *   magnitudeRangeThreshold: mean < 4.0 -> 0.5, < 5.5 -> 0.8, < 7.0 -> 1.2, else 1.5
 *   Scordilis (2006, J. Seismol. 10, 225-236): Mw = 0.67*Ms + 2.07 (Ms < 6.2),
 *                                             Mw = 0.85*mb + 1.03
 *   ML -> Mw and Md -> ML -> Mw are identity approximations in lib/merge.ts.
 */

import {
  validateEventGroup,
  groupMatchingEvents,
  performMergeWithGroups,
  convertToMw,
} from '@/lib/merge';

const config: any = {
  timeThreshold: 30,
  distanceThreshold: 30,
  depthThreshold: 50,
  mergeStrategy: 'quality',
  priority: 'quality',
};

/**
 * One record of a candidate group. All members share a location and depth and sit seconds
 * apart with distinct sources, so the magnitude check is the only gate that can fail.
 */
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

// ---------------------------------------------------------------------------
// 1. The raw spread within a SINGLE scale is checked per scale, not per group
// ---------------------------------------------------------------------------

describe('validateEventGroup — a second scale cannot launder a same-scale disagreement', () => {
  it('rejects an Ms 3.0 / Ms 3.7 pair (unchanged baseline)', () => {
    // Raw mean 3.35 -> tier 0.5; raw range 0.70 > 0.5.
    expect(validateEventGroup([ev('a', 3.0, 'Ms', 'AgencyA'), ev('b', 3.7, 'Ms', 'AgencyB', 2)], false))
      .toBe(false);
  });

  it('still rejects that pair when an ML report from a third agency joins the group', () => {
    // Raw mean (3.0 + 3.7 + 4.3)/3 = 3.6667 -> tier 0.5. The Ms pair's own raw spread is
    // still 0.70 > 0.5: nothing about those two reports changed, so the group must split.
    //
    // Without the per-scale check the group is accepted, because the cross-scale comparison
    // compresses it: Ms 3.0 -> 0.67*3.0 + 2.07 = 4.08, Ms 3.7 -> 0.67*3.7 + 2.07 = 4.549
    // (4.55), ML 4.3 -> 4.30. Mw range 4.55 - 4.08 = 0.47 <= 0.5. The Ms->Mw slope of 0.67
    // shrinks every Ms spread by a third; one member on a second scale must not unlock that.
    const group = [
      ev('a', 3.0, 'Ms', 'AgencyA'),
      ev('b', 3.7, 'Ms', 'AgencyB', 2),
      ev('c', 4.3, 'ML', 'GeoNet', 3),
    ];

    // Pin the "would otherwise have been rescued" arithmetic against the real conversions.
    const mw = [convertToMw(3.0, 'Ms')!.value, convertToMw(3.7, 'Ms')!.value, convertToMw(4.3, 'ML')!.value];
    expect(mw).toEqual([4.08, 4.55, 4.3]);
    expect(Math.max(...mw) - Math.min(...mw)).toBeCloseTo(0.47, 10);
    expect(Math.max(...mw) - Math.min(...mw)).toBeLessThanOrEqual(0.5);

    expect(validateEventGroup(group, false)).toBe(false);
  });

  it('rejects an mb 4.0 / mb 4.9 pair carried by an ML report at the 0.8 tier', () => {
    // Raw mean (4.0 + 4.9 + 4.5)/3 = 4.4667 -> tier 0.8. mb spread 0.90 > 0.8 -> split.
    // On the common scale the group would have passed: mb 4.0 -> 0.85*4.0 + 1.03 = 4.43,
    // mb 4.9 -> 0.85*4.9 + 1.03 = 5.195 (5.20), ML 4.5 -> 4.50; range 0.77 <= 0.8.
    const group = [
      ev('a', 4.0, 'mb', 'ISC'),
      ev('b', 4.9, 'mb', 'NEIC', 2),
      ev('c', 4.5, 'ML', 'GeoNet', 3),
    ];

    const mw = [convertToMw(4.0, 'mb')!.value, convertToMw(4.9, 'mb')!.value, convertToMw(4.5, 'ML')!.value];
    expect(mw).toEqual([4.43, 5.2, 4.5]);
    expect(Math.max(...mw) - Math.min(...mw)).toBeCloseTo(0.77, 10);
    expect(Math.max(...mw) - Math.min(...mw)).toBeLessThanOrEqual(0.8);

    expect(validateEventGroup(group, false)).toBe(false);
  });

  it('leaves a mixed-scale group with one report per scale untouched', () => {
    // Each scale contributes a single value, so there is no within-scale spread to check and
    // the cross-scale rescue applies exactly as before.
    // ML 4.5 -> 4.50, mb 4.0 -> 4.43, Mw 4.9 -> 4.90; range 0.47, raw mean 4.4667 -> 0.8.
    expect(validateEventGroup([
      ev('a', 4.5, 'ML', 'GeoNet'),
      ev('b', 4.0, 'mb', 'ISC', 2),
      ev('c', 4.9, 'Mw', 'USGS', 3),
    ], false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Across scales the Mw comparison rejects as well as accepts
// ---------------------------------------------------------------------------

describe('validateEventGroup — the common-scale check is authoritative in both directions', () => {
  it('rejects ML 3.0 / Ms 3.0, whose raw numbers coincide only because the scales differ', () => {
    // Raw range 0.00 at mean 3.0 -> the raw gate accepts. But raw values on different scales
    // are not comparable, which is the entire premise of converting: ML 3.0 -> Mw 3.00 while
    // Ms 3.0 -> 0.67*3.0 + 2.07 = Mw 4.08. That is a 1.08-unit disagreement between the two
    // reports, far past the 0.5 tier the raw mean selects.
    expect(convertToMw(3.0, 'ML')!.value).toBe(3.0);
    expect(convertToMw(3.0, 'Ms')!.value).toBe(4.08);

    expect(validateEventGroup([ev('a', 3.0, 'ML', 'GeoNet'), ev('b', 3.0, 'Ms', 'ISC', 2)], false))
      .toBe(false);
  });

  it('rejects Md 3.0 / Ms 3.4, which the raw comparison waves through', () => {
    // Raw mean 3.2 -> tier 0.5, raw range 0.40 <= 0.5 -> raw accepts.
    // Md 3.0 -> ML 3.0 -> Mw 3.00; Ms 3.4 -> 0.67*3.4 + 2.07 = 4.348 (4.35).
    // Mw spread 1.35 > 0.5 -> split.
    expect(convertToMw(3.0, 'Md')!.value).toBe(3.0);
    expect(convertToMw(3.4, 'Ms')!.value).toBe(4.35);

    expect(validateEventGroup([ev('a', 3.0, 'Md', 'AgencyA'), ev('b', 3.4, 'Ms', 'AgencyB', 2)], false))
      .toBe(false);
  });

  it('an untyped member does not suppress the cross-scale rejection of the typed ones', () => {
    // ML 3.0 / Ms 3.0 disagree by 1.08 units of Mw as above. A third report with no
    // magnitude type cannot be homogenised, but it must not buy the two convertible reports
    // an exemption from the comparison that condemns them.
    expect(validateEventGroup([
      ev('a', 3.0, 'ML', 'GeoNet'),
      ev('b', 3.0, 'Ms', 'ISC', 2),
      ev('c', 3.0, undefined, 'Other', 3),
    ], false)).toBe(false);
  });

  it('still merges one earthquake reported as mb 3.26 by ISC and ML 3.8 by GeoNet', () => {
    // The rescue this hardening must not break: 0.85*3.26 + 1.03 = 3.801 (3.80) and
    // ML 3.8 ~ Mw 3.80 -> Mw range 0.00. Raw mean 3.53 -> tier 0.5, raw range 0.54 > 0.5,
    // i.e. rejected on scale offset alone if the raw numbers were taken at face value.
    expect(convertToMw(3.26, 'mb')!.value).toBe(3.8);

    const isc = ev('isc', 3.26, 'mb', 'ISC');
    const geonet = ev('gn', 3.8, 'ML', 'GeoNet', 2);
    expect(validateEventGroup([isc, geonet], false)).toBe(true);
    expect(groupMatchingEvents([isc, geonet], config).map(g => g.events.map((e: any) => e.id)))
      .toEqual([['isc', 'gn']]);
  });

  it('does not re-check a single-scale group on the converted scale', () => {
    // Ms 4.0 / Ms 4.7: raw mean 4.35 -> tier 0.8, raw range 0.70 <= 0.8 -> accepted on raw
    // values, which is what a single-scale group must be judged on. Guards against anyone
    // "fixing" this pair by tightening the tier table, a separate calibration question.
    expect(validateEventGroup([ev('a', 4.0, 'Ms', 'AgencyA'), ev('b', 4.7, 'Ms', 'AgencyB', 2)], false))
      .toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Non-finite magnitudes are dropped, not silently treated as "no disagreement"
// ---------------------------------------------------------------------------

describe('validateEventGroup — a NaN magnitude no longer disables the gate', () => {
  it('rejects Ms 3.0 / Ms 5.0 even when a third member carries a NaN magnitude', () => {
    // Every comparison against NaN is false, so a NaN in the list made the range NaN and
    // `NaN > threshold` false: the whole magnitude check was skipped and an Ms 3.0 and an
    // Ms 5.0 merged as one earthquake. With NaN dropped, the usable magnitudes are
    // [3.0, 5.0]: mean 4.0 -> tier 0.8, range 2.00 > 0.8 -> split.
    expect(validateEventGroup([
      ev('a', NaN, 'ML', 'AgencyA'),
      ev('b', 3.0, 'Ms', 'AgencyB', 2),
      ev('c', 5.0, 'Ms', 'AgencyC', 3),
    ], false)).toBe(false);
  });

  it('treats an infinite magnitude the same way', () => {
    expect(validateEventGroup([
      ev('a', Infinity, 'ML', 'AgencyA'),
      ev('b', 3.0, 'Ms', 'AgencyB', 2),
      ev('c', 5.0, 'Ms', 'AgencyC', 3),
    ], false)).toBe(false);
  });

  it('keeps checking depth when a group carries no usable magnitude at all', () => {
    // No magnitude is not a reason to exempt a group from every OTHER consistency check.
    // Depths 10 km and 100 km differ by 90 km; the loosest shallow threshold is 50 km.
    const shallow = ev('a', null, 'ML', 'AgencyA');
    const deep = { ...ev('b', null, 'ML', 'AgencyB', 2), depth: 100 };
    expect(validateEventGroup([shallow, deep], false)).toBe(false);

    // ...and still accepts one whose depths agree (12 km vs 15 km).
    const nearby = { ...ev('c', null, 'ML', 'AgencyC', 2), depth: 15 };
    expect(validateEventGroup([shallow, nearby], false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. The preview reports the statistics the gate actually used
// ---------------------------------------------------------------------------

describe('performMergeWithGroups — QC statistics match the gate', () => {
  it('does not fabricate a magnitude range from a null-magnitude member', () => {
    // ML 4.2 / ML 4.5 / (no magnitude): usable magnitudes [4.2, 4.5], mean 4.35 -> tier 0.8,
    // range 0.30 -> accepted, with nothing to warn about.
    //
    // Unfiltered, the null coerced to 0 through Math.min and to a missing term through the
    // mean, giving a range of 4.50 against a threshold of 0.5 (mean 8.7/3 = 2.9) — a warning
    // about a group the merge had accepted without complaint.
    const groups = performMergeWithGroups([
      ev('gn', 4.2, 'ML', 'GeoNet'),
      ev('isc', 4.5, 'ML', 'ISC', 2),
      ev('oth', null, 'ML', 'Other', 3),
    ], config);

    expect(groups).toHaveLength(1);
    expect(groups[0].events).toHaveLength(3);
    expect(groups[0].isSuspicious).toBe(false);
    expect(groups[0].validationWarnings).toEqual([]);
  });

  it('flags every part of a group the gate rejected, instead of accepting one silently', () => {
    // ML 4.2 / mb 4.9 / (no magnitude). Usable raw [4.2, 4.9]: mean 4.55 -> tier 0.8,
    // raw range 0.70 <= 0.8, so the raw gate accepted. On the common scale ML 4.2 -> 4.20
    // and mb 4.9 -> 0.85*4.9 + 1.03 = 5.195 (5.20): a 1.00-unit disagreement > 0.8, so the
    // two reports are not the same earthquake and must not end up in one group.
    const groups = performMergeWithGroups([
      ev('gn', 4.2, 'ML', 'GeoNet'),
      ev('isc', 4.9, 'mb', 'ISC', 2),
      ev('oth', null, 'ML', 'Other', 3),
    ], config);

    const ids = groups.map(g => g.events.map((e: any) => e.id));
    expect(ids.some(g => g.includes('gn') && g.includes('isc'))).toBe(false);
    // The rejected pair is split and the part carrying the disagreement is flagged.
    // A member released by the split and re-processed as its own anchor is NOT stamped
    // suspicious if it then simply matches nothing - that would mislabel a clean
    // singleton. Here gn+oth are salvaged (oth has no magnitude, so cannot disagree)
    // and isc stands alone.
    const salvaged = groups.find(g => g.events.some((e: any) => e.id === 'gn'));
    expect(salvaged?.isSuspicious).toBe(true);
    expect(salvaged?.events.map((e: any) => e.id).sort()).toEqual(['gn', 'oth']);
    const lone = groups.find(g => g.events.length === 1 && g.events[0].id === 'isc');
    expect(lone).toBeDefined();
    // No group is reported as clean while carrying a magnitude warning.
    for (const g of groups) {
      if (g.validationWarnings.some(w => w.toLowerCase().includes('magnitude'))) {
        expect(g.isSuspicious).toBe(true);
      }
    }
  });

  it('describes a cross-scale rescue as accepted rather than as a violation', () => {
    // mb 3.26 / ML 3.8, both Mw 3.80: raw range 0.54 exceeds the 0.5 tier, so the panel must
    // explain why the merge went ahead instead of quoting a threshold it appears to break.
    const groups = performMergeWithGroups([
      ev('isc', 3.26, 'mb', 'ISC'),
      ev('gn', 3.8, 'ML', 'GeoNet', 2),
    ], config);

    expect(groups).toHaveLength(1);
    expect(groups[0].isSuspicious).toBe(false);
    expect(groups[0].validationWarnings).toHaveLength(1);
    expect(groups[0].validationWarnings[0]).toContain('0.54');
    expect(groups[0].validationWarnings[0]).toContain('accepted');
    expect(groups[0].validationWarnings[0]).toContain('0.00');
  });
});

// ---------------------------------------------------------------------------
// 5. One untyped stranger no longer strands the real cross-scale duplicate
// ---------------------------------------------------------------------------

describe('groupMatchingEvents — the salvage keeps the true duplicate, not the stranger', () => {
  const geonet = ev('gn', 3.8, 'ML', 'GeoNet');
  const isc = ev('isc', 3.26, 'mb', 'ISC', 2);
  const other = ev('oth', 3.5, undefined, 'Other', 3);

  it('the trio is inconsistent but the ML/mb pair inside it is one earthquake', () => {
    // Trio: the untyped 3.5 cannot be put on a common scale, so the group stays bound by the
    // raw comparison — mean (3.8 + 3.26 + 3.5)/3 = 3.52 -> tier 0.5, raw range 0.54 > 0.5.
    expect(validateEventGroup([geonet, isc, other], false)).toBe(false);
    // Pair: Mw 3.80 vs Mw 3.80 -> range 0.00.
    expect(validateEventGroup([geonet, isc], false)).toBe(true);
  });

  it('splits it into {ML, mb} + {untyped}, not {ML, untyped} + {mb}', () => {
    // The untyped 3.5 is 0.30 from ML 3.8 in raw numbers and the mb 3.26 is 0.54 away, so a
    // raw-only candidate ordering merged the stranger into GeoNet's record — an untyped
    // report from a third agency fused into one event — and emitted ISC's genuine duplicate
    // as a separate earthquake. On the common scale the mb report is 0.00 away.
    expect(groupMatchingEvents([geonet, isc, other], config).map(g => g.events.map((e: any) => e.id)))
      .toEqual([['gn', 'isc'], ['oth']]);
  });

  it('salvages the same pair whatever order the records arrive in', () => {
    const ids = (events: any[]) =>
      groupMatchingEvents(events, config)
        .map(g => g.events.map((e: any) => e.id).sort())
        .sort((a, b) => a[0].localeCompare(b[0]));
    expect(ids([other, geonet, isc])).toEqual([['gn', 'isc'], ['oth']]);
    expect(ids([isc, other, geonet])).toEqual([['gn', 'isc'], ['oth']]);
  });
});
