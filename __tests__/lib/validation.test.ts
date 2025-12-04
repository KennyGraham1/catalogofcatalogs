/**
 * Tests for validation functions
 */

import {
  validateEarthquakeEvent,
  validateEarthquakeEvents,
  assessDataQuality,
  validateGeographicBounds,
  detectAnomalies,
  earthquakeEventSchema,
} from '@/lib/validation';

describe('Earthquake Event Validation', () => {
  describe('validateEarthquakeEvent', () => {
    it('should validate a correct earthquake event', () => {
      const validEvent = {
        time: '2024-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 174.0,
        depth: 25,
        magnitude: 5.2,
      };

      const result = validateEarthquakeEvent(validEvent);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject event with invalid latitude', () => {
      const invalidEvent = {
        time: '2024-01-15T10:30:00Z',
        latitude: 95, // Invalid: > 90
        longitude: 174.0,
        depth: 25,
        magnitude: 5.2,
      };

      const result = validateEarthquakeEvent(invalidEvent);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject event with invalid longitude', () => {
      const invalidEvent = {
        time: '2024-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 185, // Invalid: > 180
        depth: 25,
        magnitude: 5.2,
      };

      const result = validateEarthquakeEvent(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with invalid magnitude', () => {
      const invalidEvent = {
        time: '2024-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 174.0,
        depth: 25,
        magnitude: 15, // Invalid: > 10
      };

      const result = validateEarthquakeEvent(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with future timestamp', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const invalidEvent = {
        time: futureDate.toISOString(),
        latitude: -41.5,
        longitude: 174.0,
        depth: 25,
        magnitude: 5.2,
      };

      const result = validateEarthquakeEvent(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should accept event with optional fields', () => {
      const eventWithOptionals = {
        time: '2024-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 174.0,
        depth: 25,
        magnitude: 5.2,
        magnitudeType: 'ML',
        region: 'Wellington',
        source: 'GeoNet',
        latitude_uncertainty: 0.05,
        longitude_uncertainty: 0.05,
        depth_uncertainty: 2.5,
        azimuthal_gap: 120,
        used_phase_count: 45,
        used_station_count: 18,
      };

      const result = validateEarthquakeEvent(eventWithOptionals);
      expect(result.success).toBe(true);
    });
  });

  describe('validateEarthquakeEvents', () => {
    it('should validate array of events', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          longitude: 173.5,
          depth: 15,
          magnitude: 4.8,
        },
      ];

      const result = validateEarthquakeEvents(events);
      expect(result.validEvents).toHaveLength(2);
      expect(result.invalidEvents).toHaveLength(0);
    });

    it('should separate valid and invalid events', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: 95, // Invalid
          longitude: 173.5,
          depth: 15,
          magnitude: 4.8,
        },
      ];

      const result = validateEarthquakeEvents(events);
      expect(result.validEvents).toHaveLength(1);
      expect(result.invalidEvents).toHaveLength(1);
      expect(result.invalidEvents[0].index).toBe(1);
    });
  });
});

describe('Data Quality Assessment', () => {
  describe('assessDataQuality', () => {
    it('should assess quality of valid events', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
          latitude_uncertainty: 0.02,
          longitude_uncertainty: 0.02,
          azimuthal_gap: 120,
          used_phase_count: 45,
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          longitude: 173.5,
          depth: 15,
          magnitude: 4.8,
          latitude_uncertainty: 0.03,
          longitude_uncertainty: 0.03,
          azimuthal_gap: 150,
          used_phase_count: 30,
        },
      ];

      const report = assessDataQuality(events);
      expect(report.overallQuality).toBeDefined();
      expect(report.completeness).toBeGreaterThan(0);
      expect(report.consistency).toBeGreaterThan(0);
      expect(report.accuracy).toBeGreaterThan(0);
      expect(report.statistics.totalEvents).toBe(2);
      expect(report.statistics.validEvents).toBe(2);
    });

    it('should detect low completeness', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          // Missing magnitude - required field
        },
        {
          time: '2024-01-15T11:00:00Z',
          // Missing latitude - required field
          longitude: 174.5,
          magnitude: 4.5,
        },
      ];

      const report = assessDataQuality(events);
      expect(report.completeness).toBeLessThan(100);
    });

    it('should calculate statistics correctly', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.0,
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          longitude: 173.5,
          depth: 15,
          magnitude: 6.0,
        },
      ];

      const report = assessDataQuality(events);
      expect(report.statistics.averageMagnitude).toBe(5.5);
      expect(report.statistics.averageDepth).toBe(20);
      expect(report.statistics.timeRange).toBeDefined();
      expect(report.statistics.spatialExtent).toBeDefined();
    });
  });

  describe('detectAnomalies', () => {
    it('should detect extreme magnitudes', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 9.5, // Extreme
        },
      ];

      const anomalies = detectAnomalies(events);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies.some(a => a.field === 'magnitude')).toBe(true);
    });

    it('should detect extreme depths', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 750, // Very deep
          magnitude: 5.2,
        },
      ];

      const anomalies = detectAnomalies(events);
      expect(anomalies.some(a => a.field === 'depth')).toBe(true);
    });

    it('should detect duplicate times', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00.000Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
        },
        {
          time: '2024-01-15T10:30:00.500Z', // Within 1 second
          latitude: -41.6,
          longitude: 174.1,
          depth: 26,
          magnitude: 5.3,
        },
      ];

      const anomalies = detectAnomalies(events);
      expect(anomalies.some(a => a.field === 'time')).toBe(true);
    });
  });

  describe('validateGeographicBounds', () => {
    it('should validate correct bounds', () => {
      const bounds = {
        minLat: -47,
        maxLat: -34,
        minLon: 166,
        maxLon: 179,
      };

      const checks = validateGeographicBounds(bounds);
      expect(checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should detect inverted latitude bounds', () => {
      const bounds = {
        minLat: -34,
        maxLat: -47, // Inverted
        minLon: 166,
        maxLon: 179,
      };

      const checks = validateGeographicBounds(bounds);
      expect(checks.some(c => c.severity === 'error' && c.field === 'latitude_bounds')).toBe(true);
    });

    it('should detect inverted longitude bounds', () => {
      const bounds = {
        minLat: -47,
        maxLat: -34,
        minLon: 179,
        maxLon: 166, // Inverted
      };

      const checks = validateGeographicBounds(bounds);
      expect(checks.some(c => c.severity === 'error' && c.field === 'longitude_bounds')).toBe(true);
    });

    it('should detect unusually large bounds', () => {
      const bounds = {
        minLat: -90,
        maxLat: 91, // latRange = 181 > 180, triggers warning
        minLon: -180,
        maxLon: 180,
      };

      const checks = validateGeographicBounds(bounds);
      expect(checks.some(c => c.severity === 'warning')).toBe(true);
    });

    it('should detect very small bounds', () => {
      const bounds = {
        minLat: -41.5,
        maxLat: -41.501,
        minLon: 174.0,
        maxLon: 174.001,
      };

      const checks = validateGeographicBounds(bounds);
      expect(checks.some(c => c.severity === 'warning')).toBe(true);
    });
  });
});

// Import field mapping utilities
import {
  detectFieldMapping,
  detectAllFieldMappings,
  normalizeFieldName,
  calculateSimilarity,
  checkRequiredFieldsMapped,
  FIELD_ALIASES,
} from '@/lib/field-definitions';

describe('Field Mapping Auto-Detection', () => {
  describe('normalizeFieldName', () => {
    it('should normalize camelCase to lowercase', () => {
      expect(normalizeFieldName('magnitudeType')).toBe('magnitudetype');
      expect(normalizeFieldName('eventPublicId')).toBe('eventpublicid');
    });

    it('should remove underscores and hyphens', () => {
      expect(normalizeFieldName('magnitude_type')).toBe('magnitudetype');
      expect(normalizeFieldName('event-type')).toBe('eventtype');
    });

    it('should handle mixed formats', () => {
      expect(normalizeFieldName('Magnitude_Type')).toBe('magnitudetype');
      expect(normalizeFieldName('LATITUDE')).toBe('latitude');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('latitude', 'latitude')).toBe(1);
    });

    it('should return high similarity for similar strings', () => {
      const similarity = calculateSimilarity('lat', 'latitude');
      expect(similarity).toBeGreaterThan(0.3);
    });

    it('should return lower similarity for different strings', () => {
      const similarity = calculateSimilarity('latitude', 'magnitude');
      // These strings share some characters so similarity is moderate
      expect(similarity).toBeLessThan(0.8);
      expect(similarity).toBeGreaterThan(0.5);
    });
  });

  describe('detectFieldMapping', () => {
    it('should detect exact matches with high confidence', () => {
      const result = detectFieldMapping('latitude');
      expect(result.targetField).toBe('latitude');
      expect(result.confidence).toBeGreaterThanOrEqual(0.98);
      expect(result.matchType).toBe('exact');
    });

    it('should detect common aliases', () => {
      const result = detectFieldMapping('lat');
      expect(result.targetField).toBe('latitude');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect GeoNet-style field names', () => {
      expect(detectFieldMapping('evla').targetField).toBe('latitude');
      expect(detectFieldMapping('evlo').targetField).toBe('longitude');
      expect(detectFieldMapping('evdp').targetField).toBe('depth');
    });

    it('should detect ISC-style quality metrics', () => {
      expect(detectFieldMapping('nph').targetField).toBe('used_phase_count');
      expect(detectFieldMapping('nst').targetField).toBe('used_station_count');
      expect(detectFieldMapping('rms').targetField).toBe('standard_error');
    });

    it('should detect QuakeML 1.2 uncertainty fields', () => {
      expect(detectFieldMapping('horiz_unc').targetField).toBe('horizontal_uncertainty');
      expect(detectFieldMapping('depth_error').targetField).toBe('depth_uncertainty');
    });

    it('should detect magnitude evaluation fields', () => {
      expect(detectFieldMapping('mag_eval_mode').targetField).toBe('magnitude_evaluation_mode');
      expect(detectFieldMapping('mag_eval_status').targetField).toBe('magnitude_evaluation_status');
    });

    it('should detect agency and author fields', () => {
      expect(detectFieldMapping('agency').targetField).toBe('agency_id');
      expect(detectFieldMapping('analyst').targetField).toBe('author');
    });

    it('should detect distance metrics', () => {
      expect(detectFieldMapping('mindist').targetField).toBe('minimum_distance');
      expect(detectFieldMapping('maxdist').targetField).toBe('maximum_distance');
    });

    it('should return low confidence for unrecognized fields', () => {
      const result = detectFieldMapping('zzz_completely_random_xyz');
      // Fuzzy matching may still find a match but with low confidence
      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('detectAllFieldMappings', () => {
    it('should map multiple fields at once', () => {
      const sourceFields = ['lat', 'lon', 'time', 'mag', 'dep'];
      const mappings = detectAllFieldMappings(sourceFields);

      expect(mappings['lat']).toBe('latitude');
      expect(mappings['lon']).toBe('longitude');
      expect(mappings['time']).toBe('time');
      expect(mappings['mag']).toBe('magnitude');
      expect(mappings['dep']).toBe('depth');
    });

    it('should avoid duplicate target mappings', () => {
      const sourceFields = ['lat', 'latitude', 'evla'];
      const mappings = detectAllFieldMappings(sourceFields);

      // Only one should be mapped to latitude
      const latMappings = Object.entries(mappings).filter(([_, v]) => v === 'latitude');
      expect(latMappings.length).toBe(1);
    });

    it('should respect minimum confidence threshold', () => {
      const sourceFields = ['latitude', 'xyz_unknown'];
      const mappings = detectAllFieldMappings(sourceFields, 0.6);

      expect(mappings['latitude']).toBe('latitude');
      expect(mappings['xyz_unknown']).toBeUndefined();
    });
  });

  describe('checkRequiredFieldsMapped', () => {
    it('should return complete when all required fields are mapped', () => {
      const mappings = {
        'time_col': 'time',
        'lat_col': 'latitude',
        'lon_col': 'longitude',
        'mag_col': 'magnitude',
        'id_col': 'id',
      };

      const result = checkRequiredFieldsMapped(mappings);
      expect(result.complete).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return missing fields when incomplete', () => {
      const mappings = {
        'lat_col': 'latitude',
        'lon_col': 'longitude',
      };

      const result = checkRequiredFieldsMapped(mappings);
      expect(result.complete).toBe(false);
      expect(result.missing).toContain('time');
      expect(result.missing).toContain('magnitude');
    });
  });
});

