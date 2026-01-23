/**
 * Tests for seismological analysis functions
 */

import {
  calculateGutenbergRichter,
  estimateCompletenessMagnitude,
  analyzeTemporalPattern,
  calculateSeismicMoment,
  type EarthquakeEvent
} from '../lib/seismological-analysis';

// Generate synthetic test data
function generateTestEvents(count: number): EarthquakeEvent[] {
  const events: EarthquakeEvent[] = [];
  const startDate = new Date('2023-01-01T00:00:00Z');
  
  for (let i = 0; i < count; i++) {
    // Generate magnitudes following approximate G-R distribution
    const rand = Math.random();
    let magnitude: number;
    if (rand < 0.6) magnitude = 2.0 + Math.random() * 1.0; // M2-3
    else if (rand < 0.85) magnitude = 3.0 + Math.random() * 1.0; // M3-4
    else if (rand < 0.95) magnitude = 4.0 + Math.random() * 1.0; // M4-5
    else magnitude = 5.0 + Math.random() * 2.0; // M5-7
    
    const time = new Date(startDate.getTime() + i * 86400000); // 1 day apart
    
    events.push({
      id: i + 1,
      time: time.toISOString(),
      latitude: -41.0 + Math.random() * 2.0,
      longitude: 174.0 + Math.random() * 2.0,
      depth: 10 + Math.random() * 30,
      magnitude: Number(magnitude.toFixed(2))
    });
  }
  
  return events;
}

describe('Gutenberg-Richter Analysis', () => {
  test('calculates b-value for synthetic data', () => {
    const events = generateTestEvents(100);
    const result = calculateGutenbergRichter(events);
    
    expect(result.bValue).toBeGreaterThan(0);
    expect(result.bValue).toBeLessThan(3); // Reasonable range
    expect(result.aValue).toBeDefined();
    expect(result.rSquared).toBeGreaterThan(0);
    expect(result.rSquared).toBeLessThanOrEqual(1);
    expect(result.dataPoints.length).toBeGreaterThan(0);
    expect(result.fittedLine.length).toBe(result.dataPoints.length);
  });

  test('throws error with insufficient data', () => {
    const events = generateTestEvents(5);
    expect(() => calculateGutenbergRichter(events)).toThrow('Insufficient data');
  });

  test('handles minimum magnitude filter', () => {
    const events = generateTestEvents(100);
    const result = calculateGutenbergRichter(events, 3.0);
    
    expect(result.bValue).toBeGreaterThan(0);
    expect(result.dataPoints.every(p => p.magnitude >= 3.0)).toBe(true);
  });

  test('produces consistent results', () => {
    const events = generateTestEvents(50);
    const result1 = calculateGutenbergRichter(events);
    const result2 = calculateGutenbergRichter(events);
    
    expect(result1.bValue).toBe(result2.bValue);
    expect(result1.aValue).toBe(result2.aValue);
    expect(result1.rSquared).toBe(result2.rSquared);
  });
});

describe('Completeness Magnitude Estimation', () => {
  test('estimates Mc for synthetic data', () => {
    const events = generateTestEvents(100);
    const result = estimateCompletenessMagnitude(events);
    
    expect(result.mc).toBeGreaterThan(0);
    expect(result.mc).toBeLessThan(10);
    expect(result.method).toBe('MAXC');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.magnitudeDistribution.length).toBeGreaterThan(0);
  });

  test('throws error with insufficient data', () => {
    const events = generateTestEvents(30);
    expect(() => estimateCompletenessMagnitude(events)).toThrow('Insufficient data');
  });

  test('magnitude distribution sums to total events', () => {
    const events = generateTestEvents(100);
    const result = estimateCompletenessMagnitude(events);
    
    const totalCount = result.magnitudeDistribution.reduce((sum, bin) => sum + bin.count, 0);
    expect(totalCount).toBe(events.length);
  });
});

describe('Temporal Analysis', () => {
  test('analyzes temporal patterns', () => {
    const events = generateTestEvents(100);
    const result = analyzeTemporalPattern(events);
    
    expect(result.totalEvents).toBe(100);
    expect(result.timeSpanDays).toBeGreaterThan(0);
    expect(result.eventsPerDay).toBeGreaterThan(0);
    expect(result.eventsPerMonth).toBeGreaterThan(0);
    expect(result.eventsPerYear).toBeGreaterThan(0);
    expect(result.timeSeries.length).toBeGreaterThan(0);
    expect(result.clusters).toBeDefined();
  });

  test('throws error with no events', () => {
    expect(() => analyzeTemporalPattern([])).toThrow('No events provided');
  });

  test('calculates cumulative counts correctly', () => {
    const events = generateTestEvents(50);
    const result = analyzeTemporalPattern(events);
    
    const lastEntry = result.timeSeries[result.timeSeries.length - 1];
    expect(lastEntry.cumulativeCount).toBe(events.length);
  });

  test('detects clusters in high-activity periods', () => {
    // Create events with a cluster
    const events: EarthquakeEvent[] = [];
    const baseDate = new Date('2023-01-01T00:00:00Z');
    
    // Normal activity
    for (let i = 0; i < 20; i++) {
      events.push({
        id: i,
        time: new Date(baseDate.getTime() + i * 86400000).toISOString(),
        latitude: -41.0,
        longitude: 174.0,
        depth: 10,
        magnitude: 3.0
      });
    }
    
    // Cluster (10 events in one day)
    const clusterDate = new Date(baseDate.getTime() + 30 * 86400000);
    for (let i = 0; i < 10; i++) {
      events.push({
        id: 20 + i,
        time: new Date(clusterDate.getTime() + i * 3600000).toISOString(),
        latitude: -41.0,
        longitude: 174.0,
        depth: 10,
        magnitude: 4.0
      });
    }

    // Add events after cluster to close it (cluster detection needs a normal day after high activity)
    for (let i = 0; i < 5; i++) {
      events.push({
        id: 30 + i,
        time: new Date(clusterDate.getTime() + (i + 2) * 86400000).toISOString(),
        latitude: -41.0,
        longitude: 174.0,
        depth: 10,
        magnitude: 3.0
      });
    }

    const result = analyzeTemporalPattern(events);
    expect(result.clusters.length).toBeGreaterThan(0);
  });
});

describe('Seismic Moment Calculation', () => {
  test('calculates seismic moment', () => {
    const events = generateTestEvents(50);
    const result = calculateSeismicMoment(events);
    
    expect(result.totalMoment).toBeGreaterThan(0);
    expect(result.totalMomentMagnitude).toBeGreaterThan(0);
    expect(result.momentByMagnitude.length).toBeGreaterThan(0);
    expect(result.largestEvent.magnitude).toBeGreaterThan(0);
    expect(result.largestEvent.moment).toBeGreaterThan(0);
    expect(result.largestEvent.percentOfTotal).toBeGreaterThan(0);
    expect(result.largestEvent.percentOfTotal).toBeLessThanOrEqual(100);
  });

  test('throws error with no events', () => {
    expect(() => calculateSeismicMoment([])).toThrow('No events provided');
  });

  test('largest event dominates moment release', () => {
    const events: EarthquakeEvent[] = [
      {
        id: 1,
        time: '2023-01-01T00:00:00Z',
        latitude: -41.0,
        longitude: 174.0,
        depth: 10,
        magnitude: 7.0 // Large event
      },
      ...Array.from({ length: 50 }, (_, i) => ({
        id: i + 2,
        time: '2023-01-01T00:00:00Z',
        latitude: -41.0,
        longitude: 174.0,
        depth: 10,
        magnitude: 3.0 // Small events
      }))
    ];
    
    const result = calculateSeismicMoment(events);
    
    // Large event should contribute >90% of total moment
    expect(result.largestEvent.percentOfTotal).toBeGreaterThan(90);
  });

  test('moment increases exponentially with magnitude', () => {
    const event1: EarthquakeEvent = {
      id: 1,
      time: '2023-01-01T00:00:00Z',
      latitude: -41.0,
      longitude: 174.0,
      depth: 10,
      magnitude: 5.0
    };
    
    const event2: EarthquakeEvent = {
      id: 2,
      time: '2023-01-01T00:00:00Z',
      latitude: -41.0,
      longitude: 174.0,
      depth: 10,
      magnitude: 6.0
    };
    
    const result1 = calculateSeismicMoment([event1]);
    const result2 = calculateSeismicMoment([event2]);
    
    // M6 should have ~32x more moment than M5 (10^1.5 ≈ 31.6)
    const ratio = result2.totalMoment / result1.totalMoment;
    expect(ratio).toBeGreaterThan(30);
    expect(ratio).toBeLessThan(33);
  });

  test('moment by magnitude bins are sorted', () => {
    const events = generateTestEvents(100);
    const result = calculateSeismicMoment(events);
    
    for (let i = 1; i < result.momentByMagnitude.length; i++) {
      expect(result.momentByMagnitude[i].magnitude).toBeGreaterThanOrEqual(
        result.momentByMagnitude[i - 1].magnitude
      );
    }
  });
});

describe('Edge Cases and Error Handling', () => {
  test('handles events with same magnitude', () => {
    // Need at least 50 events for completeness estimation
    const events: EarthquakeEvent[] = Array.from({ length: 60 }, (_, i) => ({
      id: i,
      time: `2023-01-${String((i % 28) + 1).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`,
      latitude: -41.0,
      longitude: 174.0,
      depth: 10,
      magnitude: 4.0
    }));

    expect(() => estimateCompletenessMagnitude(events)).not.toThrow();
  });

  test('handles wide magnitude range', () => {
    const events: EarthquakeEvent[] = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: i,
        time: '2023-01-01T00:00:00Z',
        latitude: -41.0,
        longitude: 174.0,
        depth: 10,
        magnitude: 1.0 + i * 0.2
      }))
    ];
    
    const result = calculateGutenbergRichter(events);
    expect(result.bValue).toBeGreaterThan(0);
  });

  test('handles single day of events', () => {
    const events: EarthquakeEvent[] = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      time: `2023-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      latitude: -41.0,
      longitude: 174.0,
      depth: 10,
      magnitude: 3.0 + Math.random()
    }));

    const result = analyzeTemporalPattern(events);
    // timeSpanDays has a minimum of 1 to avoid division by zero in rate calculations
    expect(result.timeSpanDays).toBe(1);
    expect(result.timeSeries.length).toBe(1);
  });
});

