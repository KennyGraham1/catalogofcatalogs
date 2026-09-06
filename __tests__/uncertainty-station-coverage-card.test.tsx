/**
 * Regression test for the Station Coverage card (uncertainty cluster, finding 1).
 *
 * The card used to feed calculateStationDistributionRatio a synthetic, perfectly
 * even azimuth list (i*360/n), which by construction has zero gap variance and
 * therefore always rendered "excellent / Stations are evenly distributed around
 * the event" — even for an event whose azimuthal gap badge said 325 degrees.
 * It must use the real arrival azimuths, and say nothing when there are none.
 */

import { render, screen } from '@testing-library/react';
import { StationCoverageCard } from '@/components/advanced-viz/StationCoverageCard';
import type { StationCoverage } from '@/lib/station-coverage-utils';

const baseCoverage: StationCoverage = {
  stations: [],
  azimuths: [],
  azimuthalGap: null,
  azimuthalGapSource: null,
  stationCount: null,
  stationCountSource: null,
  averageDistance: 0,
  minDistance: 0,
  maxDistance: 0,
  coverageQuality: 'unknown',
};

describe('StationCoverageCard station distribution', () => {
  it('reports a clustered network as poorly distributed', () => {
    render(
      <StationCoverageCard
        coverage={{
          ...baseCoverage,
          azimuths: [10, 15, 20, 25, 30, 35, 40, 45],
          azimuthalGap: 325,
          azimuthalGapSource: 'arrivals',
          stationCount: 8,
          stationCountSource: 'picks',
          coverageQuality: 'poor',
        }}
      />
    );
    expect(screen.getByText(/Stations are poorly distributed/i)).toBeInTheDocument();
    expect(screen.queryByText(/evenly distributed around the event/i)).not.toBeInTheDocument();
  });

  it('omits the distribution block entirely when there are no azimuths', () => {
    render(<StationCoverageCard coverage={{ ...baseCoverage, stationCount: 14, stationCountSource: 'picks' }} />);
    expect(screen.queryByText('Station Distribution')).not.toBeInTheDocument();
    expect(screen.queryByText(/evenly distributed/i)).not.toBeInTheDocument();
    // and it must not invent a gap either
    expect(screen.getByText('not reported')).toBeInTheDocument();
  });

  it('does not report zero recording stations when the count is unknown', () => {
    render(
      <StationCoverageCard
        coverage={{
          ...baseCoverage,
          azimuths: Array.from({ length: 12 }, (_, i) => i * 30),
          azimuthalGap: 30,
          azimuthalGapSource: 'arrivals',
        }}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Station count not reported/i)).toBeInTheDocument();
    expect(screen.queryByText(/Limited number of stations/i)).not.toBeInTheDocument();
  });
});
