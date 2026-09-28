/**
 * FEATURE (H2b brief): a minimum-quality (Q >= n) filter and per-field uncertainty filters
 * in the catalogue event filter UI, using the C4 parameter names (lib/event-filter-params.ts,
 * owner H2a). EventFilterValues now extends that module's EventFilters type directly so the
 * two cannot drift; applyEventFilters is the client-side application of the same filters over
 * an already-loaded event array, used by the catalogue detail page's table and by "Export
 * filtered events" (C12) to decide which events are "filtered".
 */
import { applyEventFilters, type EventFilterValues, type FilterableEvent } from '@/components/event-filters';

const event = (overrides: Partial<FilterableEvent> & { id: string }): FilterableEvent & { id: string } => ({
  time: '2024-06-15T00:00:00.000Z',
  latitude: -41.0,
  longitude: 174.0,
  magnitude: 4.0,
  depth: 10,
  ...overrides,
});

describe('applyEventFilters: C4 minQuality', () => {
  it('keeps only events whose resolved Q (stored, or computed for legacy rows) is >= minQuality', () => {
    const events = [
      event({ id: 'stored-high', quality_score: 80 }),
      event({ id: 'stored-low', quality_score: 20 }),
      // No stored score: falls back to the documented "no metrics" case, Q=5 (see
      // fix-catui-quality-score.test.tsx), so it is excluded at minQuality: 50.
      event({ id: 'legacy-no-metrics' }),
    ];
    const result = applyEventFilters(events, { minQuality: 50 });
    expect(result.map(e => e.id)).toEqual(['stored-high']);
  });
});

describe('applyEventFilters: C4 per-field uncertainty maxima', () => {
  const events = [
    event({ id: 'tight', horizontal_uncertainty: 1, depth_uncertainty: 1, time_uncertainty: 0.1, magnitude_uncertainty: 0.05 }),
    event({ id: 'loose', horizontal_uncertainty: 15, depth_uncertainty: 12, time_uncertainty: 5, magnitude_uncertainty: 0.8 }),
    event({ id: 'unreported' }), // no uncertainty fields at all
  ];

  it('maxHorizontalUncertainty excludes events over the cap and events with no reported value', () => {
    expect(applyEventFilters(events, { maxHorizontalUncertainty: 5 }).map(e => e.id)).toEqual(['tight']);
  });

  it('prefers max_horizontal_uncertainty (the error-ellipse axis) over the plain circular column, like Q does', () => {
    const withEllipse = event({ id: 'ellipse', horizontal_uncertainty: 2, max_horizontal_uncertainty: 20 });
    expect(applyEventFilters([withEllipse], { maxHorizontalUncertainty: 5 })).toEqual([]);
  });

  it('maxDepthUncertainty, maxTimeUncertainty and maxMagnitudeUncertainty each filter independently', () => {
    expect(applyEventFilters(events, { maxDepthUncertainty: 5 }).map(e => e.id)).toEqual(['tight']);
    expect(applyEventFilters(events, { maxTimeUncertainty: 1 }).map(e => e.id)).toEqual(['tight']);
    expect(applyEventFilters(events, { maxMagnitudeUncertainty: 0.1 }).map(e => e.id)).toEqual(['tight']);
  });
});

describe('applyEventFilters: pre-existing filter dimensions still work after the C4 type change', () => {
  it('magnitude and depth ranges', () => {
    const events = [event({ id: 'a', magnitude: 3, depth: 5 }), event({ id: 'b', magnitude: 6, depth: 50 })];
    expect(applyEventFilters(events, { minMagnitude: 5 }).map(e => e.id)).toEqual(['b']);
    expect(applyEventFilters(events, { maxDepth: 20 }).map(e => e.id)).toEqual(['a']);
  });

  it('startTime/endTime bounds are inclusive', () => {
    const events = [
      event({ id: 'before', time: '2024-01-01T00:00:00Z' }),
      event({ id: 'in-range', time: '2024-06-01T00:00:00Z' }),
      event({ id: 'after', time: '2024-12-01T00:00:00Z' }),
    ];
    const filters: EventFilterValues = { startTime: '2024-03-01T00:00:00Z', endTime: '2024-09-01T00:00:00Z' };
    expect(applyEventFilters(events, filters).map(e => e.id)).toEqual(['in-range']);
  });

  it('eventType and evaluationStatus match case-insensitively', () => {
    const events = [event({ id: 'eq', event_type: 'Earthquake' }), event({ id: 'blast', event_type: 'quarry blast' })];
    expect(applyEventFilters(events, { eventType: 'earthquake' }).map(e => e.id)).toEqual(['eq']);
  });
});

describe('applyEventFilters: C4 geographic bounds, including antimeridian-crossing boxes', () => {
  it('a normal box keeps events inside min/max longitude', () => {
    const events = [event({ id: 'in', longitude: 174 }), event({ id: 'out', longitude: -100 })];
    expect(applyEventFilters(events, { minLongitude: 170, maxLongitude: 180 }).map(e => e.id)).toEqual(['in']);
  });

  it('minLongitude > maxLongitude crosses the antimeridian (e.g. the Kermadec arc, 177..-178)', () => {
    const events = [
      event({ id: 'east-of-line', longitude: 179 }),   // inside 177..180
      event({ id: 'west-of-line', longitude: -179 }),  // inside -180..-178
      event({ id: 'outside', longitude: 0 }),
    ];
    const inBox = applyEventFilters(events, { minLongitude: 177, maxLongitude: -178 }).map(e => e.id);
    expect(inBox.sort()).toEqual(['east-of-line', 'west-of-line']);
  });
});

describe('applyEventFilters: no filters is a no-op', () => {
  it('returns every event unchanged when filters is empty', () => {
    const events = [event({ id: 'a' }), event({ id: 'b' })];
    expect(applyEventFilters(events, {})).toEqual(events);
  });
});
