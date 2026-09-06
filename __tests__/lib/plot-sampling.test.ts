import { sampleMagnitudeDepth } from '@/lib/plot-sampling';

describe('magnitude-depth plot sampling', () => {
  it.each([501, 799, 999, 10000])('preserves the range and exact budget with %s points', size => {
    const data = Array.from({ length: size }, (_, id) => ({ id, magnitude: id / size * 8, depth: id % 100 }));
    data[25].depth = 700;
    data[35].depth = -2;
    const result = sampleMagnitudeDepth(data);
    expect(result.total).toBe(size);
    expect(result.points).toHaveLength(500);
    expect(new Set(result.points).size).toBe(500);
    for (const index of [0, size - 1, 25, 35]) expect(result.points).toContain(data[index]);
    expect(result).toEqual(sampleMagnitudeDepth(data));
  });

  it('filters missing and nonfinite data before sampling, retaining zero depths and negative magnitudes', () => {
    const valid = [{ magnitude: -1, depth: 0 }, { magnitude: 4, depth: 20 }];
    const invalid = Array.from({ length: 1000 }, () => ({ magnitude: 8, depth: null }));
    expect(sampleMagnitudeDepth([...invalid, ...valid, { magnitude: NaN, depth: 1 }, { magnitude: 3, depth: Infinity }]))
      .toEqual({ points: valid, total: 2 });
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 2.9, Infinity, NaN, -10])('honors budget %s', budget => {
    const data = Array.from({ length: 10 }, (_, i) => ({ magnitude: i, depth: i }));
    const expected = budget === Infinity ? 10 : Number.isFinite(budget) ? Math.max(0, Math.floor(budget)) : 0;
    expect(sampleMagnitudeDepth(data, budget).points).toHaveLength(expected);
  });
});
