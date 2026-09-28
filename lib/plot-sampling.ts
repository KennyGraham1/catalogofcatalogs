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

/**
 * Bound a magnitude-versus-time scatter. Every event when they fit the budget;
 * otherwise the largest tenth of the budget by magnitude (so no large event drops out)
 * plus an even stride through the rest in time order, which keeps the plotted density
 * proportional to the event rate, the feature a completeness change shows up in.
 * Points come back in time order with their parsed origin time `t` (ms, UTC).
 */
export function sampleMagnitudeTime<T extends { time: string; magnitude: number }>(
  data: T[], limit = 3000
): { points: (T & { t: number })[]; total: number } {
  // Indices of the plottable events in time order; only the chosen ones are copied.
  const times = data.map(point => Date.parse(point.time));
  const order: number[] = [];
  data.forEach((point, index) => {
    if (Number.isFinite(times[index]) && Number.isFinite(point.magnitude)) order.push(index);
  });
  order.sort((a, b) => times[a] - times[b]);
  const total = order.length;
  const budget = limit === Infinity ? total : Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const withTime = (positions: number[]) => positions.map(position => ({ ...data[order[position]], t: times[order[position]] }));
  if (total <= budget) return { points: withTime(order.map((_, position) => position)), total };
  if (budget === 0) return { points: [], total };

  // Positions in the time-ordered list.
  const selected = new Set<number>();
  const largest = order.map((_, position) => position)
    .sort((a, b) => data[order[b]].magnitude - data[order[a]].magnitude);
  for (const position of largest.slice(0, Math.max(1, Math.floor(budget / 10)))) selected.add(position);
  const remaining = order.map((_, position) => position).filter(position => !selected.has(position));
  const slots = budget - selected.size;
  for (let i = 0; i < slots; i++) {
    selected.add(remaining[Math.floor((i + 0.5) * remaining.length / slots)]);
  }
  return { points: withTime(Array.from(selected).sort((a, b) => a - b)), total };
}
