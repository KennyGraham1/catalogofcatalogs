import { reasenbergDeclustering } from '@/lib/seismological-analysis';

function ev(id: string, dayOffset: number, lat: number, lon: number, mag: number) {
  return {
    id,
    time: new Date(Date.UTC(2020, 0, 1) + dayOffset * 86400000).toISOString(),
    latitude: lat,
    longitude: lon,
    magnitude: mag,
    depth: 10,
  };
}

describe('reasenbergDeclustering', () => {
  it('returns empty for empty input', () => {
    const r = reasenbergDeclustering([]);
    expect(r.mainshocks).toHaveLength(0);
    expect(r.clusters.size).toBe(0);
  });

  it('keeps temporally and spatially isolated events as independent mainshocks', () => {
    const events = [
      ev('a', 0, -41.0, 174.0, 4.0),
      ev('b', 400, -38.0, 176.0, 4.2), // >1 year later, far away
      ev('c', 900, -45.0, 167.0, 3.8),
    ];
    const r = reasenbergDeclustering(events);
    expect(r.mainshocks).toHaveLength(3);
    expect(r.clusters.size).toBe(0);
  });

  it('collapses a mainshock plus its tight aftershock sequence into one independent event', () => {
    const events = [ev('main', 0, -41.0, 174.0, 5.0)];
    for (let i = 1; i <= 10; i++) {
      events.push(ev(`as${i}`, i * 0.15, -41.0 + i * 0.002, 174.0 + i * 0.002, 3.0));
    }
    // one isolated event years later, far away
    events.push(ev('iso', 1000, -45.0, 167.0, 4.0));

    const r = reasenbergDeclustering(events);
    // 1 cluster head + 1 isolated = 2 independent events
    expect(r.mainshocks).toHaveLength(2);
    expect(r.clusters.size).toBe(1);
    const cluster = Array.from(r.clusters.values())[0];
    expect(cluster.length).toBe(11); // main + 10 aftershocks
    // mainshock set is a subset of inputs and never larger than input
    expect(r.mainshocks.length).toBeLessThanOrEqual(events.length);
    expect(r.mainshocks.some((e) => e.id === 'iso')).toBe(true);
  });
});
