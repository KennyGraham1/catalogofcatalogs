/** @jest-environment node */

// #86: the duplicate-timestamp check counts the events involved (not the distinct
// repeated timestamps), and its consistency penalty grows with the share of records that
// are extra copies instead of a flat -10.

import { assessDataQuality } from '@/lib/validation';
import { performQualityCheck } from '@/lib/data-quality-checker';

// 100 events an hour apart; `timeOf` can make some of them share a timestamp.
const catalogue = (timeOf: (i: number) => number = (i) => i) =>
  Array.from({ length: 100 }, (_, i) => ({
    time: new Date(Date.UTC(2024, 0, 1) + timeOf(i) * 3600_000).toISOString(),
    latitude: -41 - i * 0.01, longitude: 174 + i * 0.01, depth: 10, magnitude: 3,
  }));
const duplicateCheck = (events: any[]) => {
  const report = assessDataQuality(events);
  return { consistency: report.consistency, message: report.checks.find((c) => c.field === 'time')?.message };
};

describe('#86 duplicate timestamps', () => {
  it('counts the events, and scales the penalty by the extra copies', () => {
    expect(duplicateCheck(catalogue(() => 0))).toEqual({ consistency: 1, message: 'Found 100 events sharing 1 duplicated timestamp' });
    expect(duplicateCheck(catalogue((i) => Math.floor(i / 2)))).toEqual({ consistency: 50, message: 'Found 100 events sharing 50 duplicated timestamps' });
    expect(duplicateCheck(catalogue((i) => (i < 30 ? Math.floor(i / 10) : i)))).toEqual({ consistency: 73, message: 'Found 30 events sharing 3 duplicated timestamps' });
    expect(duplicateCheck(catalogue((i) => (i === 1 ? 0 : i)))).toEqual({ consistency: 99, message: 'Found 2 events sharing 1 duplicated timestamp' });
    expect(duplicateCheck(catalogue())).toEqual({ consistency: 100, message: undefined });
  });

  it('a fully duplicated upload is reported as such by the quality check', () => {
    const result = performQualityCheck(JSON.parse(JSON.stringify(catalogue(() => 0))));
    expect(result.report.consistency).toBe(1);
    expect(result.recommendations).toContain('Review data for consistency issues such as duplicates or suspicious values');
    // One coincident pair barely moves the score.
    expect(performQualityCheck(catalogue((i) => (i === 1 ? 0 : i))).report.consistency).toBe(99);
  });
});
