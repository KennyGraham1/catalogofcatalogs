const DAY_MS = 24 * 60 * 60 * 1000;

export interface TimelineBin {
  date: string;
  count: number;
  /**
   * Days of the bin inside the covered span, when fewer than the bin's length: the last
   * bin, or against a known period that starts or ends mid-bin, the first too. Exact
   * (possibly fractional) against a period; whole days otherwise.
   */
  coveredDays?: number;
}

export interface TimelineOptions {
  /**
   * The period [start, end) the events are known to cover (UTC instants or ISO strings;
   * `end` exclusive), e.g. the active time filter or a catalogue's declared
   * time_period_start/end. With it, the bins start on its first day and partial bins are
   * measured exactly against it, so their counts can be scaled to full bins. Without it,
   * the bins run over the whole days from the first to the last event: the last bin then
   * ends on a day that holds an event by construction, so its `coveredDays` describes the
   * data in hand, and scaling by it would overstate the rate (roughly doubling a sparse
   * catalogue's last point).
   */
  period?: { start: string | number; end: string | number };
}

/** A period bound in UTC ms, or NaN when it is missing or unparseable. */
function periodMs(value: string | number | undefined): number {
  return typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
}

/** UTC event totals, including empty periods, with a bounded number of bins. */
export function aggregateEventTimeline(
  events: { time: string }[],
  maxPoints = 365,
  options: TimelineOptions = {}
): { data: TimelineBin[]; daysPerBin: number } {
  const limit = Number.isFinite(maxPoints) ? Math.max(1, Math.floor(maxPoints)) : 365;
  const counts = new Map<number, number>();
  let first = Infinity;
  let last = -Infinity;
  for (const event of events) {
    const timestamp = Date.parse(event.time);
    if (!Number.isFinite(timestamp)) continue;
    const day = Math.floor(timestamp / DAY_MS);
    counts.set(day, (counts.get(day) ?? 0) + 1);
    first = Math.min(first, timestamp);
    last = Math.max(last, timestamp);
  }
  if (!counts.size) return { data: [], daysPerBin: 1 };

  // The instants [coverStart, coverEnd) the bins cover: a known period, widened to the
  // whole day of any event outside it, else the whole days from the first to the last
  // event (as lib/seismological-analysis.ts coverageWindow).
  const dayStart = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;
  const periodStart = periodMs(options.period?.start);
  const periodEnd = periodMs(options.period?.end);
  const hasPeriod = Number.isFinite(periodStart) && Number.isFinite(periodEnd) && periodEnd > periodStart;
  const coverStart = !hasPeriod ? dayStart(first) : first < periodStart ? dayStart(first) : periodStart;
  const coverEnd = !hasPeriod ? dayStart(last) + DAY_MS : last >= periodEnd ? dayStart(last) + DAY_MS : periodEnd;
  const firstDay = Math.floor(coverStart / DAY_MS);
  const lastDay = Math.floor((coverEnd - 1) / DAY_MS);

  const span = lastDay - firstDay + 1;
  const minimumDays = Math.ceil(span / limit);
  // These are fixed UTC durations, so label them as days rather than calendar
  // weeks/months. Very long catalogues grow the bin width to retain the cap.
  const daysPerBin = minimumDays <= 1 ? 1 : minimumDays <= 7 ? 7 :
    minimumDays <= 30 ? 30 : minimumDays <= 365 ? 365 : minimumDays;
  const data: TimelineBin[] = Array.from({ length: Math.ceil(span / daysPerBin) }, (_, index) => ({
    date: new Date((firstDay + index * daysPerBin) * DAY_MS).toISOString().split('T')[0],
    count: 0,
  }));
  counts.forEach((count, day) => { data[Math.floor((day - firstDay) / daysPerBin)].count += count; });
  // Bins are anchored at the span's first day, so the last one usually ends short of a
  // full period (and, against a period starting mid-day, the first starts late). Its
  // total then reads as a rate drop, at the most recent end where readers look for
  // completeness changes and quiescence; record how much of it is covered so the chart
  // can mark it (and scale it, when the span is a known period).
  data.forEach((bin, index) => {
    const binStart = (firstDay + index * daysPerBin) * DAY_MS;
    const covered = (Math.min(binStart + daysPerBin * DAY_MS, coverEnd) - Math.max(binStart, coverStart)) / DAY_MS;
    const coveredDays = Math.round(covered * 1e6) / 1e6;
    if (coveredDays < daysPerBin) bin.coveredDays = coveredDays;
  });
  return { data, daysPerBin };
}
