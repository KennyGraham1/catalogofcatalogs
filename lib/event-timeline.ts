const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC event totals, including empty periods, with a bounded number of bins. */
export function aggregateEventTimeline(events: { time: string }[], maxPoints = 365) {
  const limit = Number.isFinite(maxPoints) ? Math.max(1, Math.floor(maxPoints)) : 365;
  const counts = new Map<number, number>();
  let firstDay = Infinity;
  let lastDay = -Infinity;
  for (const event of events) {
    const timestamp = Date.parse(event.time);
    if (!Number.isFinite(timestamp)) continue;
    const day = Math.floor(timestamp / DAY_MS);
    counts.set(day, (counts.get(day) ?? 0) + 1);
    firstDay = Math.min(firstDay, day);
    lastDay = Math.max(lastDay, day);
  }
  if (!counts.size) return { data: [] as { date: string; count: number }[], daysPerBin: 1 };

  const span = lastDay - firstDay + 1;
  const minimumDays = Math.ceil(span / limit);
  // These are fixed UTC durations, so label them as days rather than calendar
  // weeks/months. Very long catalogues grow the bin width to retain the cap.
  const daysPerBin = minimumDays <= 1 ? 1 : minimumDays <= 7 ? 7 :
    minimumDays <= 30 ? 30 : minimumDays <= 365 ? 365 : minimumDays;
  const data = Array.from({ length: Math.ceil(span / daysPerBin) }, (_, index) => ({
    date: new Date((firstDay + index * daysPerBin) * DAY_MS).toISOString().split('T')[0],
    count: 0,
  }));
  counts.forEach((count, day) => { data[Math.floor((day - firstDay) / daysPerBin)].count += count; });
  return { data, daysPerBin };
}
