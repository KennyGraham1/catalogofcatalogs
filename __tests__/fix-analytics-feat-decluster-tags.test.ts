/**
 * Contract C7: lib/seismological-analysis.ts exports declusterGardnerKnopoff, per-event
 * Gardner-Knopoff tags using the engine's own windows, largest-first head reservation
 * and forward-only window. The expected tags follow from each construction.
 */
import {
  declusterGardnerKnopoff,
  gardnerKnopoffDeclustering,
  type EarthquakeEvent,
} from '@/lib/seismological-analysis';

const DAY = 86400_000;
const at = (id: string, day: number, magnitude: number, latitude = -41) => ({
  id, time: new Date(Date.UTC(2020, 0, 1) + day * DAY).toISOString(), latitude, longitude: 174, magnitude,
});

describe('declusterGardnerKnopoff (C7)', () => {
  it('tags a mainshock, its aftershocks, an earlier foreshock and a distant event', () => {
    const tags = declusterGardnerKnopoff([
      at('fore', -0.1, 3),          // before the mainshock: the forward window leaves it alone
      at('main', 0, 5),
      at('after-1', 0.1, 2),
      at('after-2', 0.2, 2),
      at('far', 0.3, 2, -45),       // ~445 km away, outside the M5 window of ~40 km
    ]);
    expect(tags.get('main')).toEqual({ clusterId: 'main', isMainshock: true, isDependent: false });
    expect(tags.get('after-1')).toEqual({ clusterId: 'main', isMainshock: false, isDependent: true });
    expect(tags.get('after-2')).toEqual({ clusterId: 'main', isMainshock: false, isDependent: true });
    expect(tags.get('fore')).toEqual({ clusterId: null, isMainshock: true, isDependent: false });
    expect(tags.get('far')).toEqual({ clusterId: null, isMainshock: true, isDependent: false });
    expect(tags.size).toBe(5);
  });

  it('does not let a later smaller head absorb an event a larger one reserved', () => {
    // M4 at day 0 (window 41 d); M3 at day 10 lies inside it and is taken as dependent,
    // so the M2 at day 11 goes to the M4 as well, not to the M3.
    const tags = declusterGardnerKnopoff([at('big', 0, 4), at('mid', 10, 3), at('small', 11, 2)]);
    expect(tags.get('mid')!.clusterId).toBe('big');
    expect(tags.get('small')!.clusterId).toBe('big');
  });

  it('agrees with gardnerKnopoffDeclustering on every event', () => {
    const events = Array.from({ length: 300 }, (_, i) => at(
      `e${i}`,
      (i * 37) % 900 / 3,
      Number((2 + ((i * 13) % 30) / 10).toFixed(1)),
      -40 - ((i * 7) % 50) / 10,
    ));
    const tags = declusterGardnerKnopoff(events);
    const { mainshocks, clusters } = gardnerKnopoffDeclustering(events.map(e => ({ ...e, depth: 10 })) as EarthquakeEvent[]);
    const mainshockIds = new Set(mainshocks.map(e => String(e.id)));
    for (const e of events) {
      expect(tags.get(e.id)!.isMainshock).toBe(mainshockIds.has(e.id));
      expect(tags.get(e.id)!.isDependent).toBe(!mainshockIds.has(e.id));
    }
    clusters.forEach((members, head) => {
      for (const member of members) expect(tags.get(String(member.id))!.clusterId).toBe(String(head));
    });
  });

  it('returns an empty map for no events', () => {
    expect(declusterGardnerKnopoff([]).size).toBe(0);
  });
});
