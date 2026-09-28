import { metricsFromEvent, scoreQualityMetrics, scoreToGrade, type QualityGrade } from '@/lib/quality-scoring';

export interface ResolvedQuality {
  score: number;
  grade: QualityGrade;
}

const VALID_GRADES = new Set<string>(['A+', 'A', 'B+', 'B', 'C', 'D', 'F']);

/**
 * Resolve the quality score (Q) and grade an event table should display, per C1: prefer the
 * value stored on the row (computed server-side on insert/merge with lib/quality-scoring's
 * metricsFromEvent + calculateQualityScore, default weights) and fall back to computing it
 * client-side only for legacy rows written before scoring existed. Both EventTable and
 * VirtualizedEventTable call this so the two tables never disagree about what "Quality" means.
 *
 * Uses scoreQualityMetrics rather than calculateQualityScore for the fallback: it is the same
 * weighted 0-100 average and grade (scoreQualityMetrics's own docstring proves the two agree),
 * without building the strengths/weaknesses/recommendations string arrays this table never
 * reads - the cost that "dominated a 200k-event pass on the analytics page" per that
 * function's comment. A table can hold that many rows across a merged national catalogue.
 */
export function resolveEventQuality(event: unknown): ResolvedQuality {
  // Untyped on purpose (matches metricsFromEvent's own `unknown` parameter): callers pass
  // concrete row types (EventTable's Event, an API EventSummary, ...) that structurally have
  // no index signature, so a parameter type like `Record<string, unknown>` would reject them
  // even though every field it reads is optional.
  const ev = (event && typeof event === 'object' ? event : {}) as {
    quality_score?: unknown;
    quality_grade?: unknown;
  };
  const storedScore = ev.quality_score;
  if (typeof storedScore === 'number' && Number.isFinite(storedScore)) {
    const storedGrade = ev.quality_grade;
    const grade = typeof storedGrade === 'string' && VALID_GRADES.has(storedGrade)
      ? (storedGrade as QualityGrade)
      : scoreToGrade(storedScore);
    return { score: storedScore, grade };
  }
  const { overall, grade } = scoreQualityMetrics(metricsFromEvent(event));
  return { score: overall, grade };
}
