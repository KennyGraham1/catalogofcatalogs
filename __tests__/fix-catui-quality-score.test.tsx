/**
 * #65 / #135: quality_score/quality_grade are never stored, so the Quality column, the
 * catalogue page's "With Quality Score" card and sorting by quality were all dead. C1 has
 * H2a start storing quality_score/quality_grade at insert/merge time; this covers the UI
 * side: EventTable and VirtualizedEventTable now prefer the stored value and fall back to
 * computing Q client-side (lib/quality-scoring: metricsFromEvent then a weighted score) for
 * legacy rows that lack it, on ONE 0-100 scale in both tables, and quality sort actually
 * reorders rows once a score exists.
 *
 * Before this fix: EventTable graded 0-100 (>=80/>=60) and hid a falsy score;
 * VirtualizedEventTable graded 0-1 (>=0.8/>=0.5) and showed 'N/A' for null - so a stored
 * score of 45 (a real 0-100 value) rendered as "High" once a catalogue exceeded 100 events
 * and used the virtualized table. That exact scenario is reproduced below.
 */
import '@testing-library/jest-dom';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { resolveEventQuality } from '@/components/events/event-quality';
import { EventTable } from '@/components/events/EventTable';
import { VirtualizedEventTable } from '@/components/events/VirtualizedEventTable';

afterEach(cleanup);

interface EventFixture {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  [key: string]: unknown;
}

const baseEvent = (overrides: Partial<EventFixture> = {}): EventFixture => ({
  id: 'e1',
  time: '2024-01-01T00:00:00.000Z',
  latitude: -41.2,
  longitude: 174.8,
  depth: 10,
  magnitude: 4.5,
  ...overrides,
});

describe('#65/#135 resolveEventQuality', () => {
  it('prefers a stored quality_score and derives the grade when quality_grade is missing', () => {
    // 87 falls in scoreToGrade's [85, 95) bucket -> 'A'. Metrics that would compute very
    // differently (no fields at all) are present only to prove they are NOT used.
    const result = resolveEventQuality(baseEvent({ quality_score: 87 }));
    expect(result).toEqual({ score: 87, grade: 'A' });
  });

  it('trusts a stored quality_grade over the derived one when both are present', () => {
    const result = resolveEventQuality(baseEvent({ quality_score: 87, quality_grade: 'B+' }));
    expect(result).toEqual({ score: 87, grade: 'B+' });
  });

  it('falls back to computing Q for a legacy row with no metrics at all (documented no-data case)', () => {
    // Every dimension takes its "no data" penalty: location -100, network -100, solution
    // -100, magnitude -100 (all clamp to 0); evaluation loses 20 (mode) + 30 (status) = 50.
    // Weighted: 0*.35 + 0*.25 + 0*.15 + 0*.15 + 50*.10 = 5 -> grade F (< 35).
    const result = resolveEventQuality(baseEvent({}));
    expect(result).toEqual({ score: 5, grade: 'F' });
  });

  it('falls back to computing Q for a legacy row with excellent metrics on every dimension', () => {
    const result = resolveEventQuality(baseEvent({
      horizontal_uncertainty: 0,
      depth_uncertainty: 0,
      time_uncertainty: 0,
      azimuthal_gap: 0,
      used_station_count: 25,
      used_phase_count: 35,
      standard_error: 0,
      magnitude_uncertainty: 0,
      magnitude_station_count: 12,
      evaluation_mode: 'manual',
      evaluation_status: 'reviewed',
    }));
    expect(result).toEqual({ score: 100, grade: 'A+' });
  });
});

describe('#65/#135 EventTable quality column', () => {
  it('shows the stored score, not a value recomputed from metrics that disagree with it', () => {
    render(
      <EventTable
        events={[baseEvent({
          quality_score: 42,
          // If the component ignored the stored value it would compute 100 from these.
          horizontal_uncertainty: 0, depth_uncertainty: 0, time_uncertainty: 0,
          azimuthal_gap: 0, used_station_count: 25, used_phase_count: 35,
          standard_error: 0, magnitude_uncertainty: 0, magnitude_station_count: 12,
          evaluation_mode: 'manual', evaluation_status: 'reviewed',
        })]}
      />
    );
    expect(screen.getByText('42 D')).toBeInTheDocument();
    expect(screen.queryByText(/^100/)).toBeNull();
  });

  it('computes and shows Q for a legacy row that has no stored score', () => {
    render(<EventTable events={[baseEvent({})]} />);
    expect(screen.getByText('5 F')).toBeInTheDocument();
  });

  it('sorts by quality using real, differing scores (was a no-op when every score was null)', () => {
    render(
      <EventTable
        events={[
          baseEvent({ id: 'low', quality_score: 10 }),
          baseEvent({ id: 'high', quality_score: 90 }),
          baseEvent({ id: 'mid', quality_score: 50 }),
        ]}
        defaultSortField="quality"
        defaultSortDirection="asc"
      />
    );
    const badges = screen.getAllByText(/^\d+ [A-F+]+$/);
    expect(badges.map(el => el.textContent)).toEqual(['10 F', '50 C', '90 A']);

    // Clicking the Quality header again reverses the (already-correct) order.
    fireEvent.click(screen.getByRole('button', { name: /Quality/ }));
    const reversed = screen.getAllByText(/^\d+ [A-F+]+$/);
    expect(reversed.map(el => el.textContent)).toEqual(['90 A', '50 C', '10 F']);
  });
});

describe('#65/#135 EventTable and VirtualizedEventTable agree on scale', () => {
  it('a stored score of 45 reads as "45 C" in both tables, never as a 0-1-scale "High"', () => {
    const event = baseEvent({ id: 'e-45', quality_score: 45 });

    render(<EventTable events={[event]} />);
    expect(screen.getByText('45 C')).toBeInTheDocument();
    expect(screen.queryByText('High')).toBeNull();
    cleanup();

    // >100 events routes EventTable to VirtualizedEventTable; exercise it directly too so it
    // is correct standalone (MergeActions.tsx renders EventTable directly with preview data
    // that can also exceed the threshold).
    render(<VirtualizedEventTable events={[event]} height={200} />);
    expect(screen.getByText('45 C')).toBeInTheDocument();
    expect(screen.queryByText('High')).toBeNull();
    expect(screen.queryByText('Medium')).toBeNull();
  });

  it('EventTable delegates to VirtualizedEventTable above the threshold with the SAME resolved quality', () => {
    // 101 events, all missing quality_score: every row must independently compute to the
    // same "no metrics" fallback (5 F) proven above, not silently show blank/N/A.
    const events = Array.from({ length: 101 }, (_, i) => baseEvent({ id: `e${i}`, magnitude: 3 + (i % 5) }));
    render(<EventTable events={events} virtualizationThreshold={100} />);
    expect(screen.queryByText('N/A')).toBeNull();
    expect(screen.getAllByText('5 F').length).toBeGreaterThan(0);
  });
});
