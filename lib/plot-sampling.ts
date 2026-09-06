/** Bound scatter rendering while keeping both magnitude and depth extremes. */
export function sampleMagnitudeDepth<T extends { magnitude: number; depth: number | null }>(
  data: T[], limit = 500
): { points: (T & { depth: number })[]; total: number } {
  const valid = data.filter((point): point is T & { depth: number } =>
    Number.isFinite(point.magnitude) && typeof point.depth === 'number' && Number.isFinite(point.depth));
  const total = valid.length;
  const budget = limit === Infinity ? total : Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (total <= budget) return { points: valid, total };
  if (budget === 0) return { points: [], total };

  const sorted = [...valid].sort((a, b) => a.magnitude - b.magnitude);
  const selected = new Set<number>();
  let shallowest = 0;
  let deepest = 0;
  sorted.forEach((point, index) => {
    if (point.depth < sorted[shallowest].depth) shallowest = index;
    if (point.depth > sorted[deepest].depth) deepest = index;
  });
  for (const index of [total - 1, 0, deepest, shallowest]) {
    if (selected.size < budget) selected.add(index);
  }
  const remaining = sorted.map((_, index) => index).filter(index => !selected.has(index));
  const slots = budget - selected.size;
  for (let i = 0; i < slots; i++) {
    selected.add(remaining[Math.floor((i + 0.5) * remaining.length / slots)]);
  }
  return { points: Array.from(selected, index => sorted[index]), total };
}
