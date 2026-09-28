/** @jest-environment node */

/**
 * Event association in the merge (cluster B1, findings #20, #26 and the same-source part of
 * #28). Association must be one-to-one and best-match: a report joins its closest
 * counterpart in normalised time and distance, never two reports from one catalogue share
 * a group, and the result does not depend on input order.
 *
 * Expected groupings follow from the geometry stated in each case (distances from the
 * haversine formula, windows from the config and the magnitude multipliers), not from
 * running the code.
 */

import {
  groupMatchingEvents,
  mergeEventGroup,
  performMergeWithGroups,
  regroupFailedEvents,
} from '@/lib/merge';

// The merge page's default windows.
const UI_DEFAULT: any = { timeThreshold: 60, distanceThreshold: 10, mergeStrategy: 'priority', priority: 'newest' };

const T0 = Date.UTC(2016, 10, 14, 0, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

const report = (
  id: string,
  catalogue: string,
  seconds: number,
  latitude: number,
  longitude: number,
  magnitude: number,
  extra: Record<string, unknown> = {}
): any => ({
  id, time: at(seconds), latitude, longitude, depth: 10, magnitude, magnitude_type: 'ML',
  source: catalogue, catalogueId: catalogue, ...extra,
});

const groupIds = (events: any[], config: any = UI_DEFAULT) =>
  groupMatchingEvents(events, config).map(g => g.events.map((e: any) => e.id));

/** Groups as sorted id lists, sorted, so input order cannot matter to the comparison. */
const canonical = (events: any[], config: any = UI_DEFAULT) =>
  groupMatchingEvents(events, config)
    .map(g => g.events.map((e: any) => e.id).sort())
    .sort((a, b) => a[0].localeCompare(b[0]));

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest])
  );
}

describe('#20 one-to-one best-match association', () => {
  // GeoNet A1 at t=0 and A2 at t=40 s, 3.3 km apart. ISC B1 at t=39 s is 1.0 km from A2 and
  // 4.3 km from A1: inside both windows, but plainly A2's twin.
  const A1 = report('A1', 'GeoNet', 0, -42.0, 173.5, 3.0);
  const A2 = report('A2', 'GeoNet', 40, -42.02, 173.53, 3.1);
  const B1 = report('B1', 'ISC', 39, -42.025, 173.54, 3.1);

  it('pairs ISC B1 with GeoNet A2, its closer match, and keeps A1 as its own earthquake', () => {
    // Normalised separations (window 60 s / 10 km): B1-A2 = 1/60 + 1.0/10 = 0.12,
    // B1-A1 = 39/60 + 4.3/10 = 1.08. The earlier sweep gave [[A1, B1], [A2]].
    expect(groupIds([A1, A2, B1])).toEqual([['A1'], ['B1', 'A2']]);
  });

  it('publishes both earthquakes, not a duplicate of the second one 1 s apart', () => {
    const merged = groupMatchingEvents([A1, A2, B1], UI_DEFAULT).map(g => mergeEventGroup(g.events, UI_DEFAULT));
    expect(merged).toHaveLength(2);
    // The t=0 earthquake survives in the merged catalogue.
    expect(merged.some(e => e.time === at(0))).toBe(true);
    // ...and exactly one record describes the t≈40 s earthquake.
    expect(merged.filter(e => Math.abs(Date.parse(e.time) - (T0 + 40_000)) <= 1000)).toHaveLength(1);
  });

  it('gives the same grouping for every input order', () => {
    const expected = canonical([A1, A2, B1]);
    for (const order of permutations([A1, A2, B1])) {
      expect(canonical(order)).toEqual(expected);
    }
  });

  it('pairs the only ISC report of the second of two GeoNet events with that event', () => {
    // ISC reports only the later event (b2 at 20.5 s, 0.6 km from a2); a1 is 20 s earlier.
    const a1 = report('a1', 'GeoNet', 0, -42.0, 173.5, 2.9);
    const a2 = report('a2', 'GeoNet', 20, -42.01, 173.51, 3.0);
    const b2 = report('b2', 'ISC', 20.5, -42.015, 173.514, 3.0);
    expect(canonical([a1, a2, b2])).toEqual([['a1'], ['a2', 'b2']]);
  });

  it('pairs a USGS mb report with the GeoNet event it duplicates, not the earlier one', () => {
    // GeoNet A1 M3.9 at t=0, GeoNet A2 M4.2 at t=30 s (4 km away); USGS U2 mb 4.3 at t=31 s,
    // 0.5 km from A2.
    const g1 = report('G1', 'GeoNet', 0, -41.0, 174.0, 3.9);
    const g2 = report('G2', 'GeoNet', 30, -41.036, 174.0, 4.2);
    const u2 = report('U2', 'USGS', 31, -41.0405, 174.0, 4.3, { magnitude_type: 'mb' });
    expect(canonical([g1, g2, u2])).toEqual([['G1'], ['G2', 'U2']]);
  });

  it('pairs both agencies\' reports of a doublet correctly whatever their magnitudes say', () => {
    // GeoNet A1 (t=0) and A2 (t=40 s, 3.3 km away); ISC B0 at t=0.5 s next to A1 and ISC B1
    // at t=39 s next to A2. B1's magnitude is closer to A1's than B0's is; magnitude is not
    // part of association, so it must not decide the pairing.
    const a1 = report('A1', 'GeoNet', 0, -42.0, 173.5, 3.0);
    const a2 = report('A2', 'GeoNet', 40, -42.02, 173.53, 3.1);
    const b0 = report('B0', 'ISC', 0.5, -42.002, 173.502, 3.3);
    const b1 = report('B1', 'ISC', 39, -42.025, 173.54, 3.0);
    for (const order of permutations([a1, a2, b0, b1])) {
      expect(canonical(order)).toEqual([['A1', 'B0'], ['A2', 'B1']]);
    }
  });

  it('associates the ISC twins of a dense aftershock sequence with the right GeoNet events', () => {
    // A synthetic dense sequence: 400 GeoNet events in two hours inside a 30 x 30 km box
    // (mean spacing 18 s, well inside the 60 s window), and an ISC report of every M>=3.5
    // event 0.2-1 s later and 0.5-1.5 km away. Every twin is far closer to its own event than
    // to any other GeoNet event in the window, so a best-match associator pairs all of them.
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const geonet: any[] = [];
    const isc: any[] = [];
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 5 + rnd() * 26;
      const lat = -42.3 + rnd() * 0.27;
      const lon = 173.4 + rnd() * 0.37;
      const mag = 2.5 + rnd() * 2;
      geonet.push(report(`g${i}`, 'GeoNet', t, lat, lon, Math.round(mag * 10) / 10));
      if (mag >= 3.5) {
        const bearing = rnd() * 2 * Math.PI;
        const km = 0.5 + rnd();
        isc.push(report(`i${i}`, 'ISC', t + 0.2 + rnd() * 0.8,
          lat + (km * Math.cos(bearing)) / 111, lon + (km * Math.sin(bearing)) / (111 * Math.cos((lat * Math.PI) / 180)),
          Math.round((mag + (rnd() - 0.5) * 0.2) * 10) / 10));
      }
    }
    const groups = groupMatchingEvents([...geonet, ...isc], UI_DEFAULT);
    const partnerOf = new Map<string, string>();
    for (const g of groups) {
      for (const e of g.events) partnerOf.set(String(e.id), g.events.filter((o: any) => o !== e).map((o: any) => o.id).join(','));
    }
    const misassociated = isc.filter(twin => partnerOf.get(twin.id) !== `g${twin.id.slice(1)}`);
    expect(isc.length).toBeGreaterThan(50);
    expect(misassociated.map(e => e.id)).toEqual([]);
    // And no group ever holds two reports from one catalogue.
    for (const g of groups) {
      const catalogues = g.events.map((e: any) => e.catalogueId);
      expect(new Set(catalogues).size).toBe(catalogues.length);
    }
  });

  it('does not flag a clear-cut pairing, whose alternative is far worse', () => {
    // B1's lost alternative (A1, 1.08) is nine times its kept pairing (A2, 0.12).
    const groups = performMergeWithGroups([A1, A2, B1], UI_DEFAULT);
    const pair = groups.find(g => g.events.length === 2)!;
    expect(pair.events.map((e: any) => e.id)).toEqual(['B1', 'A2']);
    expect(pair.isSuspicious).toBe(false);
  });

  it('flags a close call for review in the preview', () => {
    // GeoNet G1 (t=0) and G2 (t=4 s) 1.1 km apart; ISC I (t=2 s) sits between them:
    // 2/60 + 0.55/10 = 0.09 from G1 and 2/60 + 0.56/10 = 0.09 from G2.
    const g1 = report('G1', 'GeoNet', 0, -42.0, 173.5, 3.0);
    const g2 = report('G2', 'GeoNet', 4, -42.01, 173.5, 3.0);
    const i = report('I', 'ISC', 2, -42.005, 173.5, 3.0);
    const groups = performMergeWithGroups([g1, g2, i], UI_DEFAULT);
    const pair = groups.find(g => g.events.length === 2)!;
    expect(pair.isSuspicious).toBe(true);
    expect(pair.validationWarnings.some(w => /Ambiguous association/.test(w))).toBe(true);
  });
});

describe('#26 salvage ranks candidates by space-time proximity, magnitude only breaking ties', () => {
  // GeoNet A (ML 3.0, t=0); ISC B1 (ML 3.3, t=1 s, 0.44 km from A); ISC B2 (ML 3.0, t=50 s,
  // 8.2 km from A). The trio fails the same-source gate (two ISC reports).
  const A = report('A', 'GeoNet', 0, -42.0, 173.5, 3.0);
  const B1 = report('B1', 'ISC', 1, -42.004, 173.5, 3.3);
  const B2 = report('B2', 'ISC', 50, -42.074, 173.5, 3.0);

  it('keeps A with its 1 s / 0.44 km duplicate, not the distant report of equal magnitude', () => {
    // A-B1: 1/60 + 0.44/10 = 0.06; A-B2: 50/60 + 8.2/10 = 1.65. The magnitude-ordered
    // salvage produced [[A, B2], [B1]].
    expect(regroupFailedEvents([A, B1, B2], UI_DEFAULT).map(g => g.map((e: any) => e.id)))
      .toEqual([['A', 'B1'], ['B2']]);
    expect(regroupFailedEvents([B2, B1, A], UI_DEFAULT).map(g => g.map((e: any) => e.id)))
      .toEqual([['A', 'B1'], ['B2']]);
  });

  it('gives the same pairing through the full association', () => {
    expect(canonical([A, B1, B2])).toEqual([['A', 'B1'], ['B2']]);
  });

  it('salvages a magnitude-inconsistent trio around its nearest partner', () => {
    // Three agencies inside the window; the USGS report's magnitude (M 5.0) cannot belong to
    // the same earthquake as the other two (M 4.0 / 4.3), so the trio fails the gate. The
    // nearest consistent pair (A-B, 1 s / 0.7 km) is kept.
    const a = report('a', 'ISC', 0, -41.0, 174.0, 4.0);
    const b = report('b', 'GeoNet', 1, -41.005, 174.005, 4.3);
    const c = report('c', 'USGS', 2, -41.01, 174.01, 5.0);
    expect(canonical([a, b, c], { ...UI_DEFAULT, timeThreshold: 30, distanceThreshold: 30 })).toEqual([['a', 'b'], ['c']]);
  });
});

describe('#28 the same-source rule is keyed on the source catalogue, not its display name', () => {
  it('pairs one earthquake reported by two catalogues that share a name', () => {
    // Two GeoNet imports under the importer's default name, each holding the same event.
    const first = { ...report('cat1-e', 'cat-1', 0, -41.2, 174.8, 4.1), source: 'GeoNet - Automated Import' };
    const second = { ...report('cat2-e', 'cat-2', 0.3, -41.201, 174.801, 4.1), source: 'GeoNet - Automated Import' };
    expect(canonical([first, second])).toEqual([['cat1-e', 'cat2-e']]);
  });

  it('still never groups two records of one catalogue', () => {
    const one = report('x1', 'cat-1', 0, -41.2, 174.8, 4.1);
    const two = report('x2', 'cat-1', 0.3, -41.201, 174.801, 4.1);
    expect(canonical([one, two])).toEqual([['x1'], ['x2']]);
  });
});
