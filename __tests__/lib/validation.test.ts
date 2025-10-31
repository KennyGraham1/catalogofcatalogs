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
          magnitude: 5.2,
          // Missing depth
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
        maxLat: 90,
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

