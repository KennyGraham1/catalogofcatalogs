/**
 * Tests for earthquake catalogue merge algorithms
 *
 * Tests cover:
 * - Spatial indexing and grid operations
 * - Event matching with adaptive thresholds
 * - Merge strategies (quality, priority, average, newest, complete)
 * - Validation of event groups
 * - Magnitude hierarchy and selection
 * - Date line crossing handling
 * - Quality score calculation
 */

import {
  normalizeLongitude,
  getDistanceMultiplier,
  getDepthMultiplier,
  getTimeMultiplier,
  eventsMatchAdaptive,
  validateEventGroup,
  selectBestMagnitude,
  selectBestDepth,
  averageLongitudes,
  calculateQualityScore,
  getMagnitudePriority,
  createSpatialIndex,
  getGridKey,
  getNearbyCells,
  getLocationWeight,
  weightedLocationAverage,
  getNetworkPriority,
  selectByNetworkAuthority,
  DEFAULT_NETWORK_HIERARCHY,
  getMergeConflictLog,
  boxesIntersect,
  createSearchBox,
  createHierarchicalIndex,
  queryHierarchicalIndex,
  getHierarchicalIndexStats,
  getFocalMechanismPriority,
  calculateFocalMechanismQuality,
  selectBestFocalMechanism,
  mergeFocalMechanisms,
  FOCAL_MECHANISM_HIERARCHY,
  convertMLtoMw,
  convertMbtoMw,
  convertMstoMw,
  convertMdtoML,
  convertToMw,
  compareMagnitudes,
  magnitudesEquivalent,
  getMagnitudeTypeCategory,
} from '@/lib/merge';

// Mock event data for testing
const createMockEvent = (overrides: Partial<any> = {}): any => ({
  id: 'test-event-1',
  time: '2024-01-15T10:30:00.000Z',
  latitude: -41.5,
  longitude: 174.5,
  depth: 25,
  magnitude: 5.0,
  source: 'TestSource',
  ...overrides,
});

describe('Merge Utilities', () => {
  describe('normalizeLongitude', () => {
    it('should return longitude as-is when in valid range', () => {
      expect(normalizeLongitude(0)).toBe(0);
      expect(normalizeLongitude(90)).toBe(90);
      expect(normalizeLongitude(-90)).toBe(-90);
      expect(normalizeLongitude(180)).toBe(180);
      expect(normalizeLongitude(-180)).toBe(-180);
    });

    it('should normalize longitude > 180', () => {
      expect(normalizeLongitude(181)).toBe(-179);
      expect(normalizeLongitude(270)).toBe(-90);
      expect(normalizeLongitude(360)).toBe(0);
      expect(normalizeLongitude(540)).toBe(180);
    });

    it('should normalize longitude < -180', () => {
      expect(normalizeLongitude(-181)).toBe(179);
      expect(normalizeLongitude(-270)).toBe(90);
      expect(normalizeLongitude(-360)).toBe(0);
      expect(normalizeLongitude(-540)).toBe(-180);
    });
  });

  describe('averageLongitudes', () => {
    it('should return 0 for empty array', () => {
      expect(averageLongitudes([])).toBe(0);
    });

    it('should return the same value for single longitude', () => {
      expect(averageLongitudes([45])).toBe(45);
      expect(averageLongitudes([-120])).toBe(-120);
    });

    it('should correctly average longitudes not crossing date line', () => {
      expect(averageLongitudes([10, 20, 30])).toBe(20);
      expect(averageLongitudes([-10, 10])).toBe(0);
      expect(averageLongitudes([170, 175, 180])).toBeCloseTo(175, 5);
    });

    it('should correctly handle date line crossing', () => {
      // 179 and -179 should average to ~180, not 0
      const avg = averageLongitudes([179, -179]);
      expect(Math.abs(avg)).toBeGreaterThan(170);

      // More complex case
      const avg2 = averageLongitudes([175, -175]);
      expect(Math.abs(avg2)).toBeCloseTo(180, 0);
    });

    it('should handle events clustered around date line', () => {
      const avg = averageLongitudes([178, 179, -179, -178]);
      expect(Math.abs(avg)).toBeCloseTo(180, 0);
    });
  });

  describe('getDistanceMultiplier', () => {
    it('should return 1.0 for small earthquakes (M < 4)', () => {
      expect(getDistanceMultiplier(2.0)).toBe(1.0);
      expect(getDistanceMultiplier(3.5)).toBe(1.0);
      expect(getDistanceMultiplier(3.9)).toBe(1.0);
    });

    it('should return 1.5 for moderate earthquakes (M 4-5.5)', () => {
      expect(getDistanceMultiplier(4.0)).toBe(1.5);
      expect(getDistanceMultiplier(4.5)).toBe(1.5);
      expect(getDistanceMultiplier(5.0)).toBe(1.5);
      expect(getDistanceMultiplier(5.4)).toBe(1.5);
    });

    it('should return 2.5 for large earthquakes (M 5.5-7)', () => {
      expect(getDistanceMultiplier(5.5)).toBe(2.5);
      expect(getDistanceMultiplier(6.0)).toBe(2.5);
      expect(getDistanceMultiplier(6.9)).toBe(2.5);
    });

    it('should return 4.0 for very large earthquakes (M >= 7)', () => {
      expect(getDistanceMultiplier(7.0)).toBe(4.0);
      expect(getDistanceMultiplier(8.0)).toBe(4.0);
      expect(getDistanceMultiplier(9.0)).toBe(4.0);
    });
  });

  describe('getDepthMultiplier', () => {
    it('should return 1.0 for null/undefined depth', () => {
      expect(getDepthMultiplier(null)).toBe(1.0);
      expect(getDepthMultiplier(undefined)).toBe(1.0);
    });

    it('should return 1.0 for shallow earthquakes (< 100km)', () => {
      expect(getDepthMultiplier(10)).toBe(1.0);
      expect(getDepthMultiplier(50)).toBe(1.0);
      expect(getDepthMultiplier(99)).toBe(1.0);
    });

    it('should return 1.2 for intermediate depth (100-300km)', () => {
      expect(getDepthMultiplier(101)).toBe(1.2);
      expect(getDepthMultiplier(150)).toBe(1.2);
      expect(getDepthMultiplier(299)).toBe(1.2);
    });

    it('should return 1.5 for deep earthquakes (> 300km)', () => {
      expect(getDepthMultiplier(301)).toBe(1.5);
      expect(getDepthMultiplier(500)).toBe(1.5);
      expect(getDepthMultiplier(700)).toBe(1.5);
    });
  });

  describe('getTimeMultiplier', () => {
    it('should return 1.0 for small earthquakes (M < 4)', () => {
      expect(getTimeMultiplier(2.0)).toBe(1.0);
      expect(getTimeMultiplier(3.9)).toBe(1.0);
    });

    it('should return increasing multipliers for larger earthquakes', () => {
      expect(getTimeMultiplier(4.0)).toBe(1.5);
      expect(getTimeMultiplier(5.0)).toBe(1.5);  // Still in 4-5.5 range
      expect(getTimeMultiplier(5.5)).toBe(2.0);  // 5.5-7.0 range
      expect(getTimeMultiplier(6.0)).toBe(2.0);
      expect(getTimeMultiplier(7.0)).toBe(3.0);  // >= 7.0 range
    });
  });

  describe('getMagnitudePriority', () => {
    it('should return 999 for undefined/null magnitude type', () => {
      expect(getMagnitudePriority(undefined)).toBe(999);
    });

    it('should return priority 1 for Mw variants', () => {
      expect(getMagnitudePriority('Mw')).toBe(1);
      expect(getMagnitudePriority('mw')).toBe(1);
      expect(getMagnitudePriority('Mww')).toBe(1);
      expect(getMagnitudePriority('Mwc')).toBe(1);
      expect(getMagnitudePriority('Mwb')).toBe(1);
    });

    it('should return priority 2 for Ms variants', () => {
      expect(getMagnitudePriority('Ms')).toBe(2);
      expect(getMagnitudePriority('ms')).toBe(2);
      expect(getMagnitudePriority('ms_20')).toBe(2);
    });

    it('should return priority 3 for mb variants', () => {
      expect(getMagnitudePriority('mb')).toBe(3);
      expect(getMagnitudePriority('mB')).toBe(3);
      expect(getMagnitudePriority('mbb')).toBe(3);
    });

    it('should return priority 4 for ML variants', () => {
      expect(getMagnitudePriority('ML')).toBe(4);
      expect(getMagnitudePriority('ml')).toBe(4);
      expect(getMagnitudePriority('Mlv')).toBe(4);
    });

    it('should return priority 5 for Md/Mc variants', () => {
      expect(getMagnitudePriority('Md')).toBe(5);
      expect(getMagnitudePriority('Mc')).toBe(5);
    });

    it('should return 100 for unknown types', () => {
      expect(getMagnitudePriority('unknown')).toBe(100);
      expect(getMagnitudePriority('Mx')).toBe(100);
    });
  });
});

describe('Spatial Indexing', () => {
  describe('getGridKey', () => {
    it('should generate correct grid keys', () => {
      // Cell size 1.0 degree
      expect(getGridKey(0, 0, 1.0)).toBe('0,0');
      expect(getGridKey(0.5, 0.5, 1.0)).toBe('0,0');
      expect(getGridKey(1.5, 1.5, 1.0)).toBe('1,1');
      expect(getGridKey(-1.5, -1.5, 1.0)).toBe('-2,-2');
    });

    it('should handle date line crossing', () => {
      expect(getGridKey(0, 180, 1.0)).toBe('0,180');
      expect(getGridKey(0, -180, 1.0)).toBe('0,-180');
      expect(getGridKey(0, 181, 1.0)).toBe('0,-179'); // Wrapped
    });
  });

  describe('getNearbyCells', () => {
    it('should return 9 cells for center cell', () => {
      const cells = getNearbyCells(0, 0, 1.0);
      expect(cells.length).toBe(9);
      expect(cells).toContain('0,0');
      expect(cells).toContain('-1,-1');
      expect(cells).toContain('1,1');
    });
  });

  describe('createSpatialIndex', () => {
    it('should handle empty events array', () => {
      const index = createSpatialIndex([], 100);
      expect(index.grid.size).toBe(0);
      expect(index.cellSize).toBe(0.5);
    });

    it('should create grid with correct cells', () => {
      const events = [
        createMockEvent({ latitude: 0, longitude: 0 }),
        createMockEvent({ latitude: 0.5, longitude: 0.5 }),
        createMockEvent({ latitude: 5, longitude: 5 }),
      ];
      const index = createSpatialIndex(events, 100);
      expect(index.grid.size).toBeGreaterThan(0);
    });
  });
});


describe('Event Validation', () => {
  describe('validateEventGroup', () => {
    it('should return true for single event', () => {
      const events = [createMockEvent()];
      expect(validateEventGroup(events)).toBe(true);
    });

    it('should return true for consistent events', () => {
      const events = [
        createMockEvent({ magnitude: 5.0, depth: 25 }),
        createMockEvent({ magnitude: 5.2, depth: 28 }),
      ];
      expect(validateEventGroup(events)).toBe(true);
    });

    it('should detect large magnitude range for small events', () => {
      const events = [
        createMockEvent({ magnitude: 3.0, depth: 25 }),
        createMockEvent({ magnitude: 3.8, depth: 28 }), // 0.8 > 0.5 threshold for M<4
      ];
      expect(validateEventGroup(events)).toBe(false);
    });

    it('should allow larger magnitude range for large events', () => {
      const events = [
        createMockEvent({ magnitude: 7.0, depth: 25 }),
        createMockEvent({ magnitude: 8.0, depth: 28 }), // 1.0 < 1.5 threshold for M>=7
      ];
      expect(validateEventGroup(events)).toBe(true);
    });

    it('should detect large depth range', () => {
      const events = [
        createMockEvent({ magnitude: 5.0, depth: 10 }),
        createMockEvent({ magnitude: 5.0, depth: 100 }), // 90km > 50km threshold
      ];
      expect(validateEventGroup(events)).toBe(false);
    });

    it('should reject suspiciously large groups', () => {
      const events = Array(20).fill(null).map(() => createMockEvent());
      expect(validateEventGroup(events)).toBe(false);
    });
  });
});

describe('Magnitude Selection', () => {
  describe('selectBestMagnitude', () => {
    it('should prefer Mw over other types', () => {
      const events = [
        createMockEvent({
          quakeml: {
            magnitudes: [
              { type: 'ML', mag: { value: 5.5 } },
            ],
          },
        }),
        createMockEvent({
          quakeml: {
            magnitudes: [
              { type: 'Mw', mag: { value: 5.8 } },
            ],
          },
        }),
      ];
      const result = selectBestMagnitude(events);
      expect(result.type).toBe('Mw');
      expect(result.value).toBe(5.8);
    });

    it('should prefer lower uncertainty within same type', () => {
      const events = [
        createMockEvent({
          quakeml: {
            magnitudes: [
              { type: 'Mw', mag: { value: 5.5, uncertainty: 0.3 } },
            ],
          },
        }),
        createMockEvent({
          quakeml: {
            magnitudes: [
              { type: 'Mw', mag: { value: 5.8, uncertainty: 0.1 } },
            ],
          },
        }),
      ];
      const result = selectBestMagnitude(events);
      expect(result.value).toBe(5.8); // Lower uncertainty
    });

    it('should fallback to simple magnitude if no QuakeML', () => {
      const events = [
        createMockEvent({ magnitude: 4.5 }),
        createMockEvent({ magnitude: 4.8 }),
      ];
      const result = selectBestMagnitude(events);
      expect(result.value).toBe(4.5);
      expect(result.type).toBe('unknown');
    });
  });

  describe('selectBestDepth', () => {
    it('should return null for events without depth', () => {
      const events = [
        createMockEvent({ depth: null }),
        createMockEvent({ depth: undefined }),
      ];
      expect(selectBestDepth(events)).toBeNull();
    });

    it('should prefer depth with lower uncertainty', () => {
      const events = [
        createMockEvent({
          depth: 25,
          quakeml: {
            origins: [
              { depth: { value: 25000, uncertainty: 5000 } },
            ],
          },
        }),
        createMockEvent({
          depth: 30,
          quakeml: {
            origins: [
              { depth: { value: 30000, uncertainty: 1000 } },
            ],
          },
        }),
      ];
      // Should prefer 30km (lower uncertainty)
      expect(selectBestDepth(events)).toBe(30);
    });
  });
});

describe('Quality Score Calculation', () => {
  describe('calculateQualityScore', () => {
    it('should return basic score for events without quality metrics', () => {
      const event = createMockEvent();
      const score = calculateQualityScore(event);
      // Should get basic completeness score (depth + magnitude + time)
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(25);
    });

    it('should give higher score for better quality metrics', () => {
      const lowQuality = createMockEvent({
        quakeml: {
          origins: [{
            quality: {
              usedStationCount: 3,
              azimuthalGap: 300,
              standardError: 2.0,
            },
          }],
        },
      });

      const highQuality = createMockEvent({
        quakeml: {
          origins: [{
            quality: {
              usedStationCount: 30,
              azimuthalGap: 90,
              standardError: 0.2,
            },
          }],
          magnitudes: [{
            type: 'Mw',
            mag: { value: 5.0, uncertainty: 0.1 },
          }],
        },
      });

      expect(calculateQualityScore(highQuality)).toBeGreaterThan(calculateQualityScore(lowQuality));
    });

    it('should prefer Mw over ML in magnitude type scoring', () => {
      const eventMw = createMockEvent({
        quakeml: {
          magnitudes: [{ type: 'Mw', mag: { value: 5.0 } }],
        },
      });

      const eventML = createMockEvent({
        quakeml: {
          magnitudes: [{ type: 'ML', mag: { value: 5.0 } }],
        },
      });

      expect(calculateQualityScore(eventMw)).toBeGreaterThan(calculateQualityScore(eventML));
    });
  });
});

describe('Weighted Location Averaging', () => {
  describe('getLocationWeight', () => {
    it('should return 1.0 for events without uncertainty data', () => {
      const event = createMockEvent();
      expect(getLocationWeight(event)).toBe(1.0);
    });

    it('should return higher weight for lower uncertainty', () => {
      const lowUncertainty = createMockEvent({
        horizontal_uncertainty: 1.0, // 1 km
      });
      const highUncertainty = createMockEvent({
        horizontal_uncertainty: 10.0, // 10 km
      });
      expect(getLocationWeight(lowUncertainty)).toBeGreaterThan(getLocationWeight(highUncertainty));
    });

    it('should use QuakeML origin uncertainty when available', () => {
      const event = createMockEvent({
        quakeml: {
          origins: [{
            uncertainty: {
              horizontalUncertainty: 2.0, // 2 km
            },
          }],
        },
      });
      // Weight should be 1/2 = 0.5
      expect(getLocationWeight(event)).toBeCloseTo(0.5, 2);
    });

    it('should clamp extreme uncertainties', () => {
      const veryLowUncertainty = createMockEvent({
        horizontal_uncertainty: 0.01, // 10 meters
      });
      const veryHighUncertainty = createMockEvent({
        horizontal_uncertainty: 1000, // 1000 km
      });
      // Clamped to 0.1-100 range, so weights are 1/0.1=10 and 1/100=0.01
      expect(getLocationWeight(veryLowUncertainty)).toBe(10);
      expect(getLocationWeight(veryHighUncertainty)).toBe(0.01);
    });
  });

  describe('weightedLocationAverage', () => {
    it('should return 0,0 for empty array', () => {
      const result = weightedLocationAverage([]);
      expect(result.latitude).toBe(0);
      expect(result.longitude).toBe(0);
    });

    it('should return single event location', () => {
      const events = [createMockEvent({ latitude: 45, longitude: 90 })];
      const result = weightedLocationAverage(events);
      expect(result.latitude).toBe(45);
      expect(result.longitude).toBe(90);
    });

    it('should weight location by uncertainty', () => {
      const events = [
        createMockEvent({
          latitude: 40,
          longitude: 100,
          horizontal_uncertainty: 10.0, // Lower weight (0.1)
        }),
        createMockEvent({
          latitude: 50,
          longitude: 110,
          horizontal_uncertainty: 1.0, // Higher weight (1.0)
        }),
      ];
      const result = weightedLocationAverage(events);
      // Result should be closer to second event (higher weight)
      expect(result.latitude).toBeGreaterThan(45);
      expect(result.longitude).toBeGreaterThan(105);
    });

    it('should handle date line crossing with weights', () => {
      const events = [
        createMockEvent({
          latitude: 0,
          longitude: 179,
          horizontal_uncertainty: 1.0,
        }),
        createMockEvent({
          latitude: 0,
          longitude: -179,
          horizontal_uncertainty: 1.0,
        }),
      ];
      const result = weightedLocationAverage(events);
      // Should average to ~180, not ~0
      expect(Math.abs(result.longitude)).toBeGreaterThan(170);
    });
  });
});

describe('Network Authority Hierarchy', () => {
  describe('getNetworkPriority', () => {
    it('should return 999 for undefined source', () => {
      expect(getNetworkPriority(undefined)).toBe(999);
    });

    it('should return priority 1 for GeoNet (NZ authoritative)', () => {
      expect(getNetworkPriority('GeoNet')).toBe(1);
      expect(getNetworkPriority('geonet')).toBe(1);
      expect(getNetworkPriority('GeoNet NZ')).toBe(1);
    });

    it('should return priority 2 for GCMT', () => {
      expect(getNetworkPriority('GCMT')).toBe(2);
      expect(getNetworkPriority('GlobalCMT')).toBe(2);
    });

    it('should return priority 3 for ISC', () => {
      expect(getNetworkPriority('ISC')).toBe(3);
      expect(getNetworkPriority('ISC-GEM')).toBe(3);
    });

    it('should return priority 4 for USGS', () => {
      expect(getNetworkPriority('USGS')).toBe(4);
      expect(getNetworkPriority('NEIC')).toBe(4);
    });

    it('should return 100 for unknown networks', () => {
      expect(getNetworkPriority('UnknownNetwork')).toBe(100);
      expect(getNetworkPriority('RandomSource')).toBe(100);
    });

    it('should use regional priority for NZ events', () => {
      const nzEvent = createMockEvent({
        latitude: -41.5,
        longitude: 174.5,
      });
      // GeoNet should be priority 1 for NZ events
      expect(getNetworkPriority('GeoNet', nzEvent)).toBe(1);
      // USGS should be priority 4 for NZ events
      expect(getNetworkPriority('USGS', nzEvent)).toBe(4);
    });
  });

  describe('selectByNetworkAuthority', () => {
    it('should select GeoNet over USGS', () => {
      const events = [
        createMockEvent({ source: 'USGS' }),
        createMockEvent({ source: 'GeoNet' }),
      ];
      const result = selectByNetworkAuthority(events);
      expect(result.source).toBe('GeoNet');
    });

    it('should select ISC over USGS', () => {
      const events = [
        createMockEvent({ source: 'USGS' }),
        createMockEvent({ source: 'ISC' }),
      ];
      const result = selectByNetworkAuthority(events);
      expect(result.source).toBe('ISC');
    });

    it('should fall back to quality score for same network priority', () => {
      const events = [
        createMockEvent({
          source: 'GeoNet',
          quakeml: {
            origins: [{
              quality: { usedStationCount: 5 },
            }],
          },
        }),
        createMockEvent({
          source: 'GeoNet NZ',
          quakeml: {
            origins: [{
              quality: { usedStationCount: 30 },
            }],
          },
        }),
      ];
      const result = selectByNetworkAuthority(events);
      // Should select the one with more stations (higher quality)
      expect(result.source).toBe('GeoNet NZ');
    });

    it('should throw for empty array', () => {
      expect(() => selectByNetworkAuthority([])).toThrow();
    });
  });

  describe('DEFAULT_NETWORK_HIERARCHY', () => {
    it('should have GeoNet at priority 1', () => {
      const geonet = DEFAULT_NETWORK_HIERARCHY.find(h => h.patterns.includes('geonet'));
      expect(geonet?.priority).toBe(1);
    });

    it('should have USGS at priority 4', () => {
      const usgs = DEFAULT_NETWORK_HIERARCHY.find(h => h.patterns.includes('usgs'));
      expect(usgs?.priority).toBe(4);
    });
  });
});

describe('Merge Conflict Logging', () => {
  beforeEach(() => {
    // Clear the conflict log before each test
    getMergeConflictLog().clear();
  });

  describe('getMergeConflictLog', () => {
    it('should return a conflict log instance', () => {
      const log = getMergeConflictLog();
      expect(log).toBeDefined();
      expect(typeof log.log).toBe('function');
      expect(typeof log.getConflicts).toBe('function');
      expect(typeof log.getSummary).toBe('function');
    });

    it('should log conflicts when validation fails due to magnitude range', () => {
      const events = [
        createMockEvent({ magnitude: 3.0 }),
        createMockEvent({ magnitude: 4.5 }), // 1.5 difference, exceeds 0.5 threshold for M<4
      ];

      const result = validateEventGroup(events);
      expect(result).toBe(false);

      const conflicts = getMergeConflictLog().getConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].type).toBe('magnitude_range');
      expect(conflicts[0].severity).toBe('warning');
    });

    it('should log conflicts when validation fails due to depth range', () => {
      const events = [
        createMockEvent({ depth: 10, magnitude: 4.0 }),
        createMockEvent({ depth: 60, magnitude: 4.0 }), // 50km difference, exceeds 30km threshold for shallow M<5
      ];

      const result = validateEventGroup(events);
      expect(result).toBe(false);

      const conflicts = getMergeConflictLog().getConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].type).toBe('depth_range');
    });

    it('should log conflicts when group size is too large', () => {
      const events = Array.from({ length: 20 }, (_, i) =>
        createMockEvent({ source: `Network${i}` })
      );

      const result = validateEventGroup(events);
      expect(result).toBe(false);

      const conflicts = getMergeConflictLog().getConflicts();
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0].type).toBe('group_size');
      expect(conflicts[0].severity).toBe('error');
    });

    it('should provide summary statistics', () => {
      // Trigger multiple conflicts
      validateEventGroup([
        createMockEvent({ magnitude: 3.0 }),
        createMockEvent({ magnitude: 4.5 }),
      ]);
      validateEventGroup([
        createMockEvent({ depth: 10, magnitude: 4.0 }),
        createMockEvent({ depth: 60, magnitude: 4.0 }),
      ]);

      const summary = getMergeConflictLog().getSummary();
      expect(summary.total).toBe(2);
      expect(summary.byType.magnitude_range).toBe(1);
      expect(summary.byType.depth_range).toBe(1);
    });

    it('should clear conflicts', () => {
      validateEventGroup([
        createMockEvent({ magnitude: 3.0 }),
        createMockEvent({ magnitude: 4.5 }),
      ]);

      expect(getMergeConflictLog().getConflicts().length).toBeGreaterThan(0);

      getMergeConflictLog().clear();

      expect(getMergeConflictLog().getConflicts().length).toBe(0);
    });

    it('should export to JSON', () => {
      validateEventGroup([
        createMockEvent({ magnitude: 3.0 }),
        createMockEvent({ magnitude: 4.5 }),
      ]);

      const json = getMergeConflictLog().toJSON();
      const parsed = JSON.parse(json);

      expect(parsed.conflicts).toBeDefined();
      expect(parsed.summary).toBeDefined();
      expect(parsed.conflicts.length).toBeGreaterThan(0);
    });
  });
});

describe('Hierarchical Spatial Index', () => {
  describe('boxesIntersect', () => {
    it('should detect intersecting boxes', () => {
      const a = { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 };
      const b = { minLat: 5, maxLat: 15, minLon: 5, maxLon: 15 };
      expect(boxesIntersect(a, b)).toBe(true);
    });

    it('should detect non-intersecting boxes', () => {
      const a = { minLat: 0, maxLat: 10, minLon: 0, maxLon: 10 };
      const b = { minLat: 20, maxLat: 30, minLon: 20, maxLon: 30 };
      expect(boxesIntersect(a, b)).toBe(false);
    });

    it('should handle date line crossing', () => {
      const a = { minLat: 0, maxLat: 10, minLon: 170, maxLon: -170 }; // Spans date line
      const b = { minLat: 0, maxLat: 10, minLon: 175, maxLon: -175 }; // Also spans
      expect(boxesIntersect(a, b)).toBe(true);
    });
  });

  describe('createSearchBox', () => {
    it('should create a bounding box around a point', () => {
      const box = createSearchBox(0, 0, 100);
      expect(box.minLat).toBeLessThan(0);
      expect(box.maxLat).toBeGreaterThan(0);
      expect(box.minLon).toBeLessThan(0);
      expect(box.maxLon).toBeGreaterThan(0);
    });

    it('should create larger box for larger radius', () => {
      const small = createSearchBox(0, 0, 50);
      const large = createSearchBox(0, 0, 100);
      expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat);
    });
  });

  describe('createHierarchicalIndex', () => {
    it('should handle empty events array', () => {
      const index = createHierarchicalIndex([]);
      expect(index.totalEvents).toBe(0);
      expect(index.root.eventIndices).toHaveLength(0);
    });

    it('should create index with correct total events', () => {
      const events = [
        createMockEvent({ latitude: 0, longitude: 0 }),
        createMockEvent({ latitude: 10, longitude: 10 }),
        createMockEvent({ latitude: 20, longitude: 20 }),
      ];
      const index = createHierarchicalIndex(events);
      expect(index.totalEvents).toBe(3);
    });

    it('should split nodes when exceeding threshold', () => {
      // Create many events to trigger splitting
      const events = Array.from({ length: 200 }, (_, i) =>
        createMockEvent({
          latitude: (i % 20) * 2 - 20,
          longitude: Math.floor(i / 20) * 20 - 100,
        })
      );
      const index = createHierarchicalIndex(events, 50); // Low threshold to force splits
      const stats = getHierarchicalIndexStats(index);
      expect(stats.totalNodes).toBeGreaterThan(1);
    });
  });

  describe('queryHierarchicalIndex', () => {
    it('should find events within search box', () => {
      // Create enough events to trigger splitting, with clear spatial separation
      const events = [
        // Cluster 1: around (0, 0)
        ...Array.from({ length: 60 }, (_, i) =>
          createMockEvent({ latitude: i * 0.1, longitude: i * 0.1 })
        ),
        // Cluster 2: around (50, 50) - far away
        ...Array.from({ length: 60 }, (_, i) =>
          createMockEvent({ latitude: 50 + i * 0.1, longitude: 50 + i * 0.1 })
        ),
      ];
      const index = createHierarchicalIndex(events, 50); // Force splitting
      const searchBox = { minLat: -5, maxLat: 15, minLon: -5, maxLon: 15 };
      const results = queryHierarchicalIndex(index, searchBox);

      // Should find events from cluster 1 (indices 0-59)
      expect(results.length).toBeGreaterThan(0);
      // Should not include events from cluster 2 (indices 60+)
      const hasCluster2 = results.some(i => i >= 60);
      expect(hasCluster2).toBe(false);
    });

    it('should return empty for non-matching search', () => {
      const events = [
        createMockEvent({ latitude: 0, longitude: 0 }),
      ];
      const index = createHierarchicalIndex(events);
      const searchBox = { minLat: 50, maxLat: 60, minLon: 50, maxLon: 60 };
      const results = queryHierarchicalIndex(index, searchBox);
      expect(results).toHaveLength(0);
    });
  });

  describe('getHierarchicalIndexStats', () => {
    it('should return correct statistics', () => {
      const events = [
        createMockEvent({ latitude: 0, longitude: 0 }),
        createMockEvent({ latitude: 10, longitude: 10 }),
      ];
      const index = createHierarchicalIndex(events);
      const stats = getHierarchicalIndexStats(index);
      expect(stats.totalNodes).toBeGreaterThanOrEqual(1);
      expect(stats.leafNodes).toBeGreaterThanOrEqual(1);
      expect(stats.maxDepth).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Focal Mechanism Merging', () => {
  // Helper to create mock focal mechanism
  const createMockFocalMechanism = (overrides: any = {}) => ({
    publicID: 'fm-1',
    stationPolarityCount: 20,
    misfit: 0.15,
    azimuthalGap: 100,
    evaluationStatus: 'reviewed' as const,
    ...overrides,
  });

  describe('getFocalMechanismPriority', () => {
    it('should return 999 for undefined source', () => {
      expect(getFocalMechanismPriority(undefined)).toBe(999);
    });

    it('should return priority 1 for GCMT', () => {
      expect(getFocalMechanismPriority('GCMT')).toBe(1);
      expect(getFocalMechanismPriority('GlobalCMT')).toBe(1);
    });

    it('should return priority 2 for GeoNet', () => {
      expect(getFocalMechanismPriority('GeoNet')).toBe(2);
    });

    it('should return priority 3 for USGS', () => {
      expect(getFocalMechanismPriority('USGS')).toBe(3);
    });

    it('should return 100 for unknown sources', () => {
      expect(getFocalMechanismPriority('UnknownSource')).toBe(100);
    });
  });

  describe('calculateFocalMechanismQuality', () => {
    it('should give higher score for more station polarities', () => {
      const fewStations = createMockFocalMechanism({ stationPolarityCount: 5 });
      const manyStations = createMockFocalMechanism({ stationPolarityCount: 50 });
      expect(calculateFocalMechanismQuality(manyStations)).toBeGreaterThan(
        calculateFocalMechanismQuality(fewStations)
      );
    });

    it('should give higher score for lower misfit', () => {
      const highMisfit = createMockFocalMechanism({ misfit: 0.5 });
      const lowMisfit = createMockFocalMechanism({ misfit: 0.1 });
      expect(calculateFocalMechanismQuality(lowMisfit)).toBeGreaterThan(
        calculateFocalMechanismQuality(highMisfit)
      );
    });

    it('should give higher score for moment tensor presence', () => {
      const noMT = createMockFocalMechanism({});
      const withMT = createMockFocalMechanism({
        momentTensor: {
          derivedOriginID: 'origin-1',
          varianceReduction: 0.8,
        },
      });
      expect(calculateFocalMechanismQuality(withMT)).toBeGreaterThan(
        calculateFocalMechanismQuality(noMT)
      );
    });
  });

  describe('selectBestFocalMechanism', () => {
    it('should return null for events without focal mechanisms', () => {
      const events = [createMockEvent({})];
      expect(selectBestFocalMechanism(events)).toBeNull();
    });

    it('should prefer GCMT over other sources', () => {
      const events = [
        createMockEvent({
          source: 'USGS',
          quakeml: {
            focalMechanisms: [createMockFocalMechanism({ publicID: 'usgs-fm' })],
          },
        }),
        createMockEvent({
          source: 'GCMT',
          quakeml: {
            focalMechanisms: [createMockFocalMechanism({ publicID: 'gcmt-fm' })],
          },
        }),
      ];
      const result = selectBestFocalMechanism(events);
      expect(result?.publicID).toBe('gcmt-fm');
    });

    it('should use quality score when sources have same priority', () => {
      const events = [
        createMockEvent({
          source: 'GCMT',
          quakeml: {
            focalMechanisms: [createMockFocalMechanism({
              publicID: 'gcmt-low',
              stationPolarityCount: 5,
            })],
          },
        }),
        createMockEvent({
          source: 'GlobalCMT',
          quakeml: {
            focalMechanisms: [createMockFocalMechanism({
              publicID: 'gcmt-high',
              stationPolarityCount: 50,
            })],
          },
        }),
      ];
      const result = selectBestFocalMechanism(events);
      expect(result?.publicID).toBe('gcmt-high');
    });
  });

  describe('mergeFocalMechanisms', () => {
    it('should collect all focal mechanisms from events', () => {
      const events = [
        createMockEvent({
          source: 'GCMT',
          quakeml: {
            focalMechanisms: [
              createMockFocalMechanism({ publicID: 'fm-1' }),
              createMockFocalMechanism({ publicID: 'fm-2' }),
            ],
          },
        }),
        createMockEvent({
          source: 'USGS',
          quakeml: {
            focalMechanisms: [createMockFocalMechanism({ publicID: 'fm-3' })],
          },
        }),
      ];
      const result = mergeFocalMechanisms(events);
      expect(result.allFocalMechanisms).toHaveLength(3);
      expect(result.bestFocalMechanism).not.toBeNull();
    });

    it('should return empty array for events without focal mechanisms', () => {
      const events = [createMockEvent({})];
      const result = mergeFocalMechanisms(events);
      expect(result.allFocalMechanisms).toHaveLength(0);
      expect(result.bestFocalMechanism).toBeNull();
    });
  });

  describe('FOCAL_MECHANISM_HIERARCHY', () => {
    it('should have GCMT at priority 1', () => {
      const gcmt = FOCAL_MECHANISM_HIERARCHY.find(h => h.patterns.includes('gcmt'));
      expect(gcmt?.priority).toBe(1);
    });

    it('should have GeoNet at priority 2', () => {
      const geonet = FOCAL_MECHANISM_HIERARCHY.find(h => h.patterns.includes('geonet'));
      expect(geonet?.priority).toBe(2);
    });
  });
});

describe('Magnitude Conversion', () => {
  describe('getMagnitudeTypeCategory', () => {
    it('should return Mw for moment magnitude types', () => {
      expect(getMagnitudeTypeCategory('Mw')).toBe('Mw');
      expect(getMagnitudeTypeCategory('Mww')).toBe('Mw');
      expect(getMagnitudeTypeCategory('mwc')).toBe('Mw');
    });

    it('should return Ms for surface wave types', () => {
      expect(getMagnitudeTypeCategory('Ms')).toBe('Ms');
      expect(getMagnitudeTypeCategory('ms_20')).toBe('Ms');
    });

    it('should return mb for body wave types', () => {
      expect(getMagnitudeTypeCategory('mb')).toBe('mb');
      expect(getMagnitudeTypeCategory('mbb')).toBe('mb');
    });

    it('should return ML for local magnitude types', () => {
      expect(getMagnitudeTypeCategory('ML')).toBe('ML');
      expect(getMagnitudeTypeCategory('mlv')).toBe('ML');
    });

    it('should return Md for duration magnitude types', () => {
      expect(getMagnitudeTypeCategory('Md')).toBe('Md');
      expect(getMagnitudeTypeCategory('mc')).toBe('Md');
    });

    it('should return null for unknown types', () => {
      expect(getMagnitudeTypeCategory('unknown')).toBeNull();
      expect(getMagnitudeTypeCategory(undefined)).toBeNull();
    });
  });

  describe('convertMLtoMw', () => {
    it('should convert ML to Mw using Scordilis relationship', () => {
      const result = convertMLtoMw(5.0);
      // Mw = 0.67 * 5.0 + 1.17 = 4.52
      expect(result.value).toBeCloseTo(4.52, 1);
      expect(result.uncertainty).toBe(0.3);
      expect(result.isExact).toBe(false);
    });
  });

  describe('convertMbtoMw', () => {
    it('should convert mb to Mw using Scordilis relationship', () => {
      const result = convertMbtoMw(5.0);
      // Mw = 0.85 * 5.0 + 1.03 = 5.28
      expect(result.value).toBeCloseTo(5.28, 1);
      expect(result.isExact).toBe(false);
    });

    it('should have higher uncertainty near saturation', () => {
      const lowMb = convertMbtoMw(5.0);
      const highMb = convertMbtoMw(6.2);
      expect(highMb.uncertainty).toBeGreaterThan(lowMb.uncertainty);
    });
  });

  describe('convertMstoMw', () => {
    it('should use different formula for Ms < 6.2', () => {
      const result = convertMstoMw(5.0);
      // Mw = 0.67 * 5.0 + 2.07 = 5.42
      expect(result.value).toBeCloseTo(5.42, 1);
    });

    it('should use different formula for Ms >= 6.2', () => {
      const result = convertMstoMw(7.0);
      // Mw = 0.99 * 7.0 + 0.08 = 7.01
      expect(result.value).toBeCloseTo(7.01, 1);
    });
  });

  describe('convertMdtoML', () => {
    it('should approximate Md as ML with high uncertainty', () => {
      const result = convertMdtoML(4.0);
      expect(result.value).toBe(4.0);
      expect(result.uncertainty).toBe(0.5);
    });
  });

  describe('convertToMw', () => {
    it('should return exact result for Mw input', () => {
      const result = convertToMw(6.0, 'Mw');
      expect(result?.value).toBe(6.0);
      expect(result?.isExact).toBe(true);
      expect(result?.uncertainty).toBe(0);
    });

    it('should convert ML to Mw', () => {
      const result = convertToMw(5.0, 'ML');
      expect(result).not.toBeNull();
      expect(result?.isExact).toBe(false);
    });

    it('should convert Md through ML to Mw', () => {
      const result = convertToMw(4.0, 'Md');
      expect(result).not.toBeNull();
      // Combined uncertainty should be higher
      expect(result!.uncertainty).toBeGreaterThan(0.3);
    });

    it('should return null for unknown magnitude types', () => {
      expect(convertToMw(5.0, 'unknown')).toBeNull();
    });
  });

  describe('compareMagnitudes', () => {
    it('should compare magnitudes of same type', () => {
      const result = compareMagnitudes(5.5, 'Mw', 5.0, 'Mw');
      expect(result?.difference).toBeCloseTo(0.5, 2);
      expect(result?.uncertainty).toBe(0);
    });

    it('should compare magnitudes of different types', () => {
      const result = compareMagnitudes(5.0, 'ML', 5.0, 'mb');
      expect(result).not.toBeNull();
      expect(result?.uncertainty).toBeGreaterThan(0);
    });

    it('should return null if conversion fails', () => {
      expect(compareMagnitudes(5.0, 'unknown', 5.0, 'Mw')).toBeNull();
    });
  });

  describe('magnitudesEquivalent', () => {
    it('should return true for same magnitude', () => {
      expect(magnitudesEquivalent(5.0, 'Mw', 5.0, 'Mw')).toBe(true);
    });

    it('should return true for magnitudes within tolerance', () => {
      expect(magnitudesEquivalent(5.0, 'Mw', 5.2, 'Mw', 0.3)).toBe(true);
    });

    it('should return false for magnitudes outside tolerance', () => {
      expect(magnitudesEquivalent(5.0, 'Mw', 6.0, 'Mw', 0.3)).toBe(false);
    });

    it('should account for conversion uncertainty', () => {
      // ML 5.0 converts to Mw ~4.52 with uncertainty 0.3
      // So ML 5.0 should be equivalent to Mw 4.5 within tolerance
      expect(magnitudesEquivalent(5.0, 'ML', 4.5, 'Mw', 0.3)).toBe(true);
    });

    it('should fall back to direct comparison for unknown types', () => {
      expect(magnitudesEquivalent(5.0, 'unknown', 5.2, 'unknown', 0.3)).toBe(true);
      expect(magnitudesEquivalent(5.0, 'unknown', 6.0, 'unknown', 0.3)).toBe(false);
    });
  });
});
