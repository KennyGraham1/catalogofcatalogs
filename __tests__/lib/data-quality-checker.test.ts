/**
 * Tests for data quality checker functions
 */

import {
  performQualityCheck,
  meetsMinimumQuality,
  getQualityGrade,
  formatQualityCheckResults,
  validateEventQuality,
  calculateCompleteness,
} from '@/lib/data-quality-checker';

describe('Data Quality Checker', () => {
  describe('performQualityCheck', () => {
    it('should perform comprehensive quality check on good data', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
          latitude_uncertainty: 0.02,
          longitude_uncertainty: 0.02,
          depth_uncertainty: 3,
          azimuthal_gap: 120,
          used_phase_count: 45,
          used_station_count: 18,
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          longitude: 173.5,
          depth: 15,
          magnitude: 4.8,
          latitude_uncertainty: 0.03,
          longitude_uncertainty: 0.03,
          depth_uncertainty: 4,
          azimuthal_gap: 150,
          used_phase_count: 30,
          used_station_count: 12,
        },
      ];

      const result = performQualityCheck(events);
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThan(60);
      expect(result.report).toBeDefined();
      expect(result.anomalies).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should detect poor quality data', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          // Missing magnitude - required field
          depth: 10,
        },
        {
          time: '2024-01-15T11:00:00Z',
          // Missing latitude - required field
          longitude: 174.5,
          magnitude: 4.5,
          depth: 15,
        },
      ];

      const result = performQualityCheck(events);
      expect(result.score).toBeLessThan(100);
      expect(result.report.completeness).toBeLessThan(100);
    });

    it('should generate recommendations', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          depth: 25,
          magnitude: 5.2,
        },
      ];

      const result = performQualityCheck(events);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('meetsMinimumQuality', () => {
    it('should pass for good quality data', () => {
      const result = {
        passed: true,
        score: 85,
        report: {
          overallQuality: 'good' as const,
          completeness: 90,
          consistency: 85,
          accuracy: 80,
          checks: [],
          statistics: {
            totalEvents: 10,
            validEvents: 10,
            eventsWithUncertainties: 8,
            eventsWithQualityMetrics: 7,
            averageMagnitude: 5.0,
            averageDepth: 25,
            timeRange: null,
            spatialExtent: null,
          },
        },
        anomalies: [],
        geographicChecks: [],
        recommendations: [],
      };

      expect(meetsMinimumQuality(result)).toBe(true);
    });

    it('should fail for low completeness', () => {
      const result = {
        passed: false,
        score: 45,
        report: {
          overallQuality: 'poor' as const,
          completeness: 40,
          consistency: 50,
          accuracy: 45,
          checks: [],
          statistics: {
            totalEvents: 10,
            validEvents: 4,
            eventsWithUncertainties: 0,
            eventsWithQualityMetrics: 0,
            averageMagnitude: 5.0,
            averageDepth: 25,
            timeRange: null,
            spatialExtent: null,
          },
        },
        anomalies: [],
        geographicChecks: [],
        recommendations: [],
      };

      expect(meetsMinimumQuality(result)).toBe(false);
    });

    it('should fail for critical errors', () => {
      const result = {
        passed: false,
        score: 70,
        report: {
          overallQuality: 'fair' as const,
          completeness: 80,
          consistency: 70,
          accuracy: 60,
          checks: [
            {
              passed: false,
              severity: 'error' as const,
              message: 'Critical error',
            },
          ],
          statistics: {
            totalEvents: 10,
            validEvents: 8,
            eventsWithUncertainties: 5,
            eventsWithQualityMetrics: 4,
            averageMagnitude: 5.0,
            averageDepth: 25,
            timeRange: null,
            spatialExtent: null,
          },
        },
        anomalies: [],
        geographicChecks: [],
        recommendations: [],
      };

      expect(meetsMinimumQuality(result)).toBe(false);
    });
  });

  describe('getQualityGrade', () => {
    it('should return A+ for excellent scores', () => {
      const grade = getQualityGrade(96);
      expect(grade.grade).toBe('A+');
      expect(grade.label).toBe('Excellent');
      expect(grade.color).toBe('green');
    });

    it('should return A for very good scores', () => {
      const grade = getQualityGrade(92);
      expect(grade.grade).toBe('A');
      expect(grade.label).toBe('Excellent');
    });

    it('should return B for good scores', () => {
      const grade = getQualityGrade(85);
      expect(grade.grade).toBe('B');
      expect(grade.label).toBe('Good');
    });

    it('should return C for fair scores', () => {
      const grade = getQualityGrade(75);
      expect(grade.grade).toBe('C');
      expect(grade.label).toBe('Fair');
    });

    it('should return D for poor scores', () => {
      const grade = getQualityGrade(65);
      expect(grade.grade).toBe('D');
      expect(grade.label).toBe('Poor');
    });

    it('should return F for failing scores', () => {
      const grade = getQualityGrade(45);
      expect(grade.grade).toBe('F');
      expect(grade.label).toBe('Failing');
    });
  });

  describe('validateEventQuality', () => {
    it('should pass for high quality event', () => {
      const event = {
        latitude_uncertainty: 0.01,
        longitude_uncertainty: 0.01,
        depth_uncertainty: 2,
        used_station_count: 20,
        azimuthal_gap: 90,
      };

      const checks = validateEventQuality(event);
      expect(checks.filter(c => c.severity === 'error')).toHaveLength(0);
    });

    it('should warn about high horizontal uncertainty', () => {
      const event = {
        latitude_uncertainty: 0.15,
        longitude_uncertainty: 0.15,
      };

      const checks = validateEventQuality(event);
      expect(checks.some(c => c.field === 'location_uncertainty')).toBe(true);
    });

    it('should warn about high depth uncertainty', () => {
      const event = {
        depth_uncertainty: 15,
      };

      const checks = validateEventQuality(event);
      expect(checks.some(c => c.field === 'depth_uncertainty')).toBe(true);
    });

    it('should warn about low station count', () => {
      const event = {
        used_station_count: 4,
      };

      const checks = validateEventQuality(event);
      expect(checks.some(c => c.field === 'used_station_count')).toBe(true);
    });

    it('should warn about large azimuthal gap', () => {
      const event = {
        azimuthal_gap: 250,
      };

      const checks = validateEventQuality(event);
      expect(checks.some(c => c.field === 'azimuthal_gap')).toBe(true);
    });

    it('should respect custom thresholds', () => {
      const event = {
        used_station_count: 8,
      };

      const checks = validateEventQuality(event, { minStationCount: 10 });
      expect(checks.some(c => c.field === 'used_station_count')).toBe(true);
    });
  });

  describe('calculateCompleteness', () => {
    it('should calculate completeness for complete data', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          magnitude: 5.2,
          depth: 25,
          region: 'Wellington',
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          longitude: 173.5,
          magnitude: 4.8,
          depth: 15,
          region: 'Canterbury',
        },
      ];

      const result = calculateCompleteness(
        events,
        ['time', 'latitude', 'longitude', 'magnitude'],
        ['depth', 'region']
      );

      expect(result.required).toBe(100);
      expect(result.optional).toBe(100);
      expect(result.overall).toBe(100);
    });

    it('should detect missing required fields', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          magnitude: 5.2,
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          // Missing longitude
          magnitude: 4.8,
        },
      ];

      const result = calculateCompleteness(
        events,
        ['time', 'latitude', 'longitude', 'magnitude'],
        []
      );

      expect(result.required).toBeLessThan(100);
      expect(result.missingFields['longitude']).toBe(1);
    });

    it('should calculate optional field completeness', () => {
      const events = [
        {
          time: '2024-01-15T10:30:00Z',
          latitude: -41.5,
          longitude: 174.0,
          magnitude: 5.2,
          depth: 25,
          // Missing region
        },
        {
          time: '2024-01-15T11:00:00Z',
          latitude: -42.0,
          longitude: 173.5,
          magnitude: 4.8,
          depth: 15,
          region: 'Canterbury',
        },
      ];

      const result = calculateCompleteness(
        events,
        ['time', 'latitude', 'longitude', 'magnitude'],
        ['depth', 'region']
      );

      expect(result.optional).toBe(75); // 3 out of 4 optional fields present
    });

    it('should handle empty events array', () => {
      const result = calculateCompleteness([], ['time'], ['depth']);
      expect(result.required).toBe(0);
      expect(result.optional).toBe(0);
      expect(result.overall).toBe(0);
    });
  });

  describe('formatQualityCheckResults', () => {
    it('should format quality check results', () => {
      const result = {
        passed: true,
        score: 85,
        report: {
          overallQuality: 'good' as const,
          completeness: 90,
          consistency: 85,
          accuracy: 80,
          checks: [
            {
              passed: true,
              severity: 'info' as const,
              message: 'Data quality is good',
            },
          ],
          statistics: {
            totalEvents: 10,
            validEvents: 10,
            eventsWithUncertainties: 8,
            eventsWithQualityMetrics: 7,
            averageMagnitude: 5.0,
            averageDepth: 25,
            timeRange: {
              start: '2024-01-01T00:00:00Z',
              end: '2024-01-31T23:59:59Z',
            },
            spatialExtent: {
              minLat: -47,
              maxLat: -34,
              minLon: 166,
              maxLon: 179,
            },
          },
        },
        anomalies: [],
        geographicChecks: [],
        recommendations: ['Data quality is excellent - ready for import'],
      };

      const formatted = formatQualityCheckResults(result);
      expect(formatted.summary).toContain('Good');
      expect(formatted.summary).toContain('85');
      expect(formatted.details.length).toBeGreaterThan(0);
      expect(formatted.warnings).toHaveLength(0);
      expect(formatted.errors).toHaveLength(0);
    });
  });
});

