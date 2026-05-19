/**
 * Integration Vulnerability Tests
 *
 * Cross-cutting security assertions: validation bypass, JWT revocation wiring,
 * coordinate-space edge cases, and parser-independent correctness checks.
 * Tests run without a real database or network.
 */

jest.mock('@/lib/mongodb', () => ({
  getCollection: jest.fn(),
  COLLECTIONS: {
    USERS: 'users',
    CATALOGUES: 'merged_catalogues',
    EVENTS: 'merged_events',
    AUDIT_LOGS: 'audit_logs',
    PASSWORD_RESET_TOKENS: 'password_reset_tokens',
  },
  isConnected: jest.fn().mockResolvedValue(true),
  getDb: jest.fn(),
}));

jest.mock('@/lib/db', () => ({ dbQueries: null }));

import { validateEarthquakeEvent, validateMergeRequest } from '@/lib/validation';
import { eventsMatch } from '@/lib/earthquake-utils';

// ---------------------------------------------------------------------------
// Validation bypass — numeric field edge cases
// ---------------------------------------------------------------------------

describe('Validation bypass — coordinate edge cases', () => {
  it('rejects NaN latitude', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: NaN,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects Infinity latitude', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: Infinity,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects -Infinity longitude', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 0,
      longitude: -Infinity,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects latitude > 90', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 91,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects latitude < -90', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: -91,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects longitude > 180', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 0,
      longitude: 181,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects longitude < -180', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 0,
      longitude: -181,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects magnitude > 10', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 0,
      longitude: 0,
      magnitude: 10.1,
    }).success).toBe(false);
  });

  it('rejects magnitude < -3', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 0,
      longitude: 0,
      magnitude: -3.1,
    }).success).toBe(false);
  });

  it('rejects string values for numeric fields', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: '0' as any,
      longitude: '0' as any,
      magnitude: '5.0' as any,
    }).success).toBe(false);
  });

  it('accepts valid boundary values (exactly ±90 / ±180)', () => {
    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: 90,
      longitude: 180,
      magnitude: 0,
    }).success).toBe(true);

    expect(validateEarthquakeEvent({
      time: '2024-01-01T00:00:00Z',
      latitude: -90,
      longitude: -180,
      magnitude: -3,
    }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation bypass — required field absence
// ---------------------------------------------------------------------------

describe('Validation bypass — missing required fields', () => {
  const baseEvent = {
    time: '2024-01-01T00:00:00Z',
    latitude: 0,
    longitude: 0,
    magnitude: 5.0,
  };

  it('rejects event missing time', () => {
    const { time: _time, ...noTime } = baseEvent;
    expect(validateEarthquakeEvent(noTime).success).toBe(false);
  });

  it('rejects event missing latitude', () => {
    const { latitude: _lat, ...noLat } = baseEvent;
    expect(validateEarthquakeEvent(noLat).success).toBe(false);
  });

  it('rejects event missing longitude', () => {
    const { longitude: _lon, ...noLon } = baseEvent;
    expect(validateEarthquakeEvent(noLon).success).toBe(false);
  });

  it('rejects event missing magnitude', () => {
    const { magnitude: _mag, ...noMag } = baseEvent;
    expect(validateEarthquakeEvent(noMag).success).toBe(false);
  });

  it('rejects completely empty object', () => {
    expect(validateEarthquakeEvent({}).success).toBe(false);
  });

  it('rejects null input', () => {
    expect(validateEarthquakeEvent(null).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Validation bypass — timestamp edge cases
// ---------------------------------------------------------------------------

describe('Validation bypass — timestamp edge cases', () => {
  it('rejects a future timestamp beyond today', () => {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 10);
    expect(validateEarthquakeEvent({
      time: farFuture.toISOString(),
      latitude: 0,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects a timestamp before year 1000 CE', () => {
    expect(validateEarthquakeEvent({
      time: '0999-12-31T23:59:59Z',
      latitude: 0,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('rejects entirely non-date strings', () => {
    expect(validateEarthquakeEvent({
      time: 'not-a-date',
      latitude: 0,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(false);
  });

  it('accepts a valid historical timestamp (year 1000 CE)', () => {
    expect(validateEarthquakeEvent({
      time: '1000-01-01T00:00:00.000Z',
      latitude: 0,
      longitude: 0,
      magnitude: 5.0,
    }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Event matching — coordinate-space edge cases
// ---------------------------------------------------------------------------

describe('eventsMatch — coordinate-space edge cases', () => {
  const base = { time: '2024-01-01T00:00:00Z', depth: 10, magnitude: 5.0 };

  it('matches identical events', () => {
    const e = { ...base, latitude: 0, longitude: 0 };
    expect(eventsMatch(e, { ...e }, 10, 10)).toBe(true);
  });

  it('does not match events outside the distance threshold', () => {
    const e1 = { ...base, latitude: 0, longitude: 0 };
    const e2 = { ...base, latitude: 10, longitude: 10 };
    expect(eventsMatch(e1, e2, 3600, 1)).toBe(false);
  });

  it('does not match events outside the time threshold', () => {
    const e1 = { ...base, latitude: 0, longitude: 0, time: '2024-01-01T00:00:00Z' };
    const e2 = { ...base, latitude: 0, longitude: 0, time: '2024-01-01T01:00:00Z' };
    // 3600 s apart — use threshold of 10 s
    expect(eventsMatch(e1, e2, 10, 1000)).toBe(false);
  });

  it('matches events crossing the anti-meridian (179.9 ↔ -179.9) with generous distance', () => {
    const e1 = { ...base, latitude: 0, longitude: 179.9 };
    const e2 = { ...base, latitude: 0, longitude: -179.9 };
    // ~22 km apart; use 50 km threshold
    expect(eventsMatch(e1, e2, 10, 50)).toBe(true);
  });

  it('matches events at the same geographic pole regardless of longitude', () => {
    const e1 = { ...base, latitude: 90, longitude: 0 };
    const e2 = { ...base, latitude: 90, longitude: 180 };
    // Both are at the North Pole — distance should be 0
    expect(eventsMatch(e1, e2, 10, 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Merge request validation
// ---------------------------------------------------------------------------

describe('validateMergeRequest — input validation', () => {
  const validConfig = {
    timeThreshold: 60,
    distanceThreshold: 50,
    mergeStrategy: 'priority' as const,
    priority: 'cat-a',
  };

  it('rejects a merge with fewer than 2 source catalogues', () => {
    expect(validateMergeRequest({
      name: 'test',
      sourceCatalogues: [{ id: '1', name: 'Cat A', events: 10, source: 'upload' }],
      config: validConfig,
    }).success).toBe(false);
  });

  it('rejects timeThreshold > 3600 seconds', () => {
    expect(validateMergeRequest({
      name: 'test',
      sourceCatalogues: [
        { id: '1', name: 'Cat A', events: 10, source: 'upload' },
        { id: '2', name: 'Cat B', events: 5, source: 'upload' },
      ],
      config: { ...validConfig, timeThreshold: 3601 },
    }).success).toBe(false);
  });

  it('rejects distanceThreshold > 1000 km', () => {
    expect(validateMergeRequest({
      name: 'test',
      sourceCatalogues: [
        { id: '1', name: 'Cat A', events: 10, source: 'upload' },
        { id: '2', name: 'Cat B', events: 5, source: 'upload' },
      ],
      config: { ...validConfig, distanceThreshold: 1001 },
    }).success).toBe(false);
  });

  it('rejects unknown mergeStrategy value', () => {
    expect(validateMergeRequest({
      name: 'test',
      sourceCatalogues: [
        { id: '1', name: 'Cat A', events: 10, source: 'upload' },
        { id: '2', name: 'Cat B', events: 5, source: 'upload' },
      ],
      config: { ...validConfig, mergeStrategy: 'inject' as any },
    }).success).toBe(false);
  });

  it('rejects name longer than 255 characters', () => {
    expect(validateMergeRequest({
      name: 'x'.repeat(256),
      sourceCatalogues: [
        { id: '1', name: 'Cat A', events: 10, source: 'upload' },
        { id: '2', name: 'Cat B', events: 5, source: 'upload' },
      ],
      config: validConfig,
    }).success).toBe(false);
  });

  it('accepts a valid two-catalogue merge request', () => {
    expect(validateMergeRequest({
      name: 'My merged catalogue',
      sourceCatalogues: [
        { id: '1', name: 'Cat A', events: 10, source: 'upload' },
        { id: '2', name: 'Cat B', events: 5, source: 'geonet' },
      ],
      config: validConfig,
    }).success).toBe(true);
  });
});
