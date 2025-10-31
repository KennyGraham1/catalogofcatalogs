/**
 * Tests for cross-field validation functions
 */

import {
  validateMagnitudeDepthRelationship,
  validateUncertaintyRelationships,
  validateQualityMetricsConsistency,
  validateTimeLocationConsistency,
  validateEventCrossFields,
  validateEventsCrossFields,
} from '@/lib/cross-field-validation';

describe('Cross-Field Validation', () => {
  describe('validateMagnitudeDepthRelationship', () => {
    it('should pass for normal magnitude-depth combinations', () => {
      const event = {
        depth: 25,
        magnitude: 5.2,
      };

      const checks = validateMagnitudeDepthRelationship(event);
      expect(checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should warn about very shallow large magnitude events', () => {
      const event = {
        depth: 3,
        magnitude: 8.5,
      };

      const checks = validateMagnitudeDepthRelationship(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'depth')).toBe(true);
    });

    it('should warn about deep small magnitude events', () => {
      const event = {
        depth: 350,
        magnitude: 2.5,
      };

      const checks = validateMagnitudeDepthRelationship(event);
      expect(checks.some(c => c.severity === 'warning')).toBe(true);
    });

    it('should warn about very deep small magnitude events', () => {
      const event = {
        depth: 750,
        magnitude: 3.5,
      };

      const checks = validateMagnitudeDepthRelationship(event);
      expect(checks.some(c => c.severity === 'warning')).toBe(true);
    });
  });

  describe('validateUncertaintyRelationships', () => {
    it('should pass for reasonable uncertainties', () => {
      const event = {
        depth: 25,
        depth_uncertainty: 5,
        magnitude: 5.2,
        magnitude_uncertainty: 0.2,
        latitude_uncertainty: 0.02,
        longitude_uncertainty: 0.03,
      };

      const checks = validateUncertaintyRelationships(event);
      expect(checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should warn when depth uncertainty exceeds depth', () => {
      const event = {
        depth: 10,
        depth_uncertainty: 25,
      };

      const checks = validateUncertaintyRelationships(event);
      expect(checks.some(c => c.field === 'depth_uncertainty')).toBe(true);
    });

    it('should warn about large magnitude uncertainty', () => {
      const event = {
        magnitude: 5.2,
        magnitude_uncertainty: 1.5,
      };

      const checks = validateUncertaintyRelationships(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'magnitude_uncertainty')).toBe(true);
    });

    it('should error when magnitude uncertainty exceeds magnitude', () => {
      const event = {
        magnitude: 3.0,
        magnitude_uncertainty: 4.0,
      };

      const checks = validateUncertaintyRelationships(event);
      expect(checks.some(c => c.severity === 'error' && c.field === 'magnitude_uncertainty')).toBe(true);
    });

    it('should warn about asymmetric location uncertainties', () => {
      const event = {
        latitude_uncertainty: 0.01,
        longitude_uncertainty: 0.15, // 15x larger
      };

      const checks = validateUncertaintyRelationships(event);
      expect(checks.some(c => c.field === 'location_uncertainty')).toBe(true);
    });
  });

  describe('validateQualityMetricsConsistency', () => {
    it('should pass for consistent quality metrics', () => {
      const event = {
        used_station_count: 18,
        used_phase_count: 45,
        magnitude_station_count: 15,
        azimuthal_gap: 120,
        standard_error: 0.35,
      };

      const checks = validateQualityMetricsConsistency(event);
      expect(checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should error when station count exceeds phase count', () => {
      const event = {
        used_station_count: 50,
        used_phase_count: 30,
      };

      const checks = validateQualityMetricsConsistency(event);
      expect(checks.some(c => c.severity === 'error' && c.field === 'used_station_count')).toBe(true);
    });

    it('should warn when magnitude stations exceed location stations', () => {
      const event = {
        used_station_count: 15,
        magnitude_station_count: 20,
      };

      const checks = validateQualityMetricsConsistency(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'magnitude_station_count')).toBe(true);
    });

    it('should warn about large gap with many stations', () => {
      const event = {
        used_station_count: 25,
        azimuthal_gap: 200,
      };

      const checks = validateQualityMetricsConsistency(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'azimuthal_gap')).toBe(true);
    });

    it('should warn about very large RMS residual', () => {
      const event = {
        standard_error: 6.5,
      };

      const checks = validateQualityMetricsConsistency(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'standard_error')).toBe(true);
    });

    it('should note unusually small RMS residual', () => {
      const event = {
        standard_error: 0.005,
      };

      const checks = validateQualityMetricsConsistency(event);
      expect(checks.some(c => c.severity === 'info' && c.field === 'standard_error')).toBe(true);
    });
  });

  describe('validateTimeLocationConsistency', () => {
    it('should pass for valid time and location', () => {
      const event = {
        time: '2024-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 174.0,
      };

      const checks = validateTimeLocationConsistency(event);
      expect(checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should error for future timestamps', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const event = {
        time: futureDate.toISOString(),
        latitude: -41.5,
        longitude: 174.0,
      };

      const checks = validateTimeLocationConsistency(event);
      expect(checks.some(c => c.severity === 'error' && c.field === 'time')).toBe(true);
    });

    it('should warn for very old timestamps', () => {
      const event = {
        time: '1850-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 174.0,
      };

      const checks = validateTimeLocationConsistency(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'time')).toBe(true);
    });

    it('should warn for Null Island location', () => {
      const event = {
        time: '2024-01-15T10:30:00Z',
        latitude: 0,
        longitude: 0,
      };

      const checks = validateTimeLocationConsistency(event);
      expect(checks.some(c => c.severity === 'warning' && c.field === 'latitude')).toBe(true);
    });

    it('should warn for near-zero coordinates', () => {
      const event = {
        time: '2024-01-15T10:30:00Z',
        latitude: 0.0001,
        longitude: 0.0001,
      };

      const checks = validateTimeLocationConsistency(event);
      expect(checks.some(c => c.severity === 'warning')).toBe(true);
    });
  });

  describe('validateEventCrossFields', () => {
    it('should validate event with all cross-field checks', () => {
      const event = {
        time: '2024-01-15T10:30:00Z',
        latitude: -41.5,
        longitude: 174.0,
        depth: 25,
        magnitude: 5.2,
        depth_uncertainty: 5,
        magnitude_uncertainty: 0.2,
        used_station_count: 18,
        used_phase_count: 45,
        azimuthal_gap: 120,
        standard_error: 0.35,
      };

      const result = validateEventCrossFields(event);
      expect(result.passed).toBe(true);
      expect(result.checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should fail event with critical errors', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const event = {
        time: futureDate.toISOString(),
        latitude: -41.5,
        longitude: 174.0,
        depth: 25,
        magnitude: 5.2,
      };

      const result = validateEventCrossFields(event);
      expect(result.passed).toBe(false);
      expect(result.checks.some(c => c.severity === 'error')).toBe(true);
    });
  });

  describe('validateEventsCrossFields', () => {
    it('should validate multiple events', () => {
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

      const result = validateEventsCrossFields(events);
      expect(result.passed).toBe(true);
      expect(result.summary.totalEvents).toBe(2);
      expect(result.summary.passedEvents).toBe(2);
      expect(result.summary.failedEvents).toBe(0);
    });

    it('should detect failed events in batch', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
        },
        {
          time: futureDate.toISOString(),
          latitude: -42.0,
          longitude: 173.5,
          depth: 15,
          magnitude: 4.8,
        },
      ];

      const result = validateEventsCrossFields(events);
      expect(result.passed).toBe(false);
      expect(result.summary.passedEvents).toBe(1);
      expect(result.summary.failedEvents).toBe(1);
      expect(result.summary.errors).toBeGreaterThan(0);
    });

    it('should provide summary statistics', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 3,
          magnitude: 8.5, // Will trigger warning
        },
      ];

      const result = validateEventsCrossFields(events);
      expect(result.summary.warnings).toBeGreaterThan(0);
    });
  });
});

