/**
 * Tests for GeoNet Quality Score (QS) System
 */

import {
  calculateGeoNetQS,
  getQSBadgeVariant,
  formatQS,
  type GeoNetQSCriteria,
} from '../../lib/geonet-quality-score';

describe('GeoNet Quality Score System', () => {
  describe('calculateGeoNetQS', () => {
    it('should return QS6 for excellent quality event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 80,
        usedStationCount: 35,
        rmsResidual: 0.15,
        horizontalUncertainty: 0.8,
        depthUncertainty: 1.5,
        minimumDistance: 25,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(6);
      expect(result.label).toBe('QS6 - Best Constrained');
      expect(result.color).toBe('#22c55e');
    });

    it('should return QS5 for very good quality event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 100,
        usedStationCount: 25,
        rmsResidual: 0.25,
        horizontalUncertainty: 1.5,
        depthUncertainty: 3,
        minimumDistance: 40,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(5);
      expect(result.label).toBe('QS5 - Very Well Constrained');
    });

    it('should return QS4 for good quality event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 130,
        usedStationCount: 15,
        rmsResidual: 0.4,
        horizontalUncertainty: 3,
        depthUncertainty: 7,
        minimumDistance: 80,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(4);
      expect(result.label).toBe('QS4 - Well Constrained');
    });

    it('should return QS3 for fair quality event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 160,
        usedStationCount: 10,
        rmsResidual: 0.6,
        horizontalUncertainty: 7,
        depthUncertainty: 15,
        minimumDistance: 150,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(3);
      expect(result.label).toBe('QS3 - Moderately Constrained');
    });

    it('should return QS2 for poor quality event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 200,
        usedStationCount: 6,
        rmsResidual: 1.0,
        horizontalUncertainty: 15,
        depthUncertainty: 30,
        minimumDistance: 300,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(2);
      expect(result.label).toBe('QS2 - Poorly Constrained');
    });

    it('should return QS1 for very poor quality event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 270,
        usedStationCount: 3,
        rmsResidual: 1.5,
        horizontalUncertainty: 30,
        depthUncertainty: 60,
        minimumDistance: 600,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(1);
      expect(result.label).toBe('QS1 - Very Poorly Constrained');
    });

    it('should return QS0 for unconstrained event', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 320,
        usedStationCount: 2,
        rmsResidual: 2.5,
        horizontalUncertainty: 60,
        depthUncertainty: 100,
        minimumDistance: 900,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(0);
      expect(result.label).toBe('QS0 - Unconstrained');
    });

    it('should use minimum score across all criteria', () => {
      // All criteria excellent except azimuthal gap (poor)
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 250, // QS1
        usedStationCount: 40, // QS6
        rmsResidual: 0.1, // QS6
        horizontalUncertainty: 0.5, // QS6
        depthUncertainty: 1.0, // QS6
        minimumDistance: 20, // QS6
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(1); // Limited by azimuthal gap
      expect(result.limitingFactor).toBe('Azimuthal Gap');
    });

    it('should handle missing data gracefully', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 100,
        usedStationCount: 20,
        // Missing other criteria
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(0); // Limited by missing data
      expect(result.criteriaBreakdown.rmsResidual.value).toBeNull();
      expect(result.criteriaBreakdown.rmsResidual.label).toBe('No data');
    });

    it('should provide detailed criteria breakdown', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 100,
        usedStationCount: 25,
        rmsResidual: 0.25,
        horizontalUncertainty: 1.5,
        depthUncertainty: 3,
        minimumDistance: 40,
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.criteriaBreakdown.azimuthalGap.value).toBe(100);
      expect(result.criteriaBreakdown.azimuthalGap.score).toBe(5);
      expect(result.criteriaBreakdown.azimuthalGap.label).toContain('Very Good');

      expect(result.criteriaBreakdown.stationCount.value).toBe(25);
      expect(result.criteriaBreakdown.stationCount.score).toBe(5);

      expect(result.criteriaBreakdown.rmsResidual.value).toBe(0.25);
      expect(result.criteriaBreakdown.rmsResidual.score).toBe(5);
    });

    it('should identify limiting factor correctly', () => {
      const criteria: GeoNetQSCriteria = {
        azimuthalGap: 80, // QS6
        usedStationCount: 35, // QS6
        rmsResidual: 0.15, // QS6
        horizontalUncertainty: 0.8, // QS6
        depthUncertainty: 25, // QS2 - limiting factor (20-40km range)
        minimumDistance: 25, // QS6
      };

      const result = calculateGeoNetQS(criteria);

      expect(result.qualityScore).toBe(2);
      expect(result.limitingFactor).toBe('Depth Uncertainty');
    });
  });

  describe('getQSBadgeVariant', () => {
    it('should return correct badge variants', () => {
      expect(getQSBadgeVariant(6)).toBe('default');
      expect(getQSBadgeVariant(5)).toBe('default');
      expect(getQSBadgeVariant(4)).toBe('secondary');
      expect(getQSBadgeVariant(3)).toBe('secondary');
      expect(getQSBadgeVariant(2)).toBe('outline');
      expect(getQSBadgeVariant(1)).toBe('outline');
      expect(getQSBadgeVariant(0)).toBe('destructive');
    });
  });

  describe('formatQS', () => {
    it('should format QS correctly', () => {
      expect(formatQS(6)).toBe('QS6');
      expect(formatQS(3)).toBe('QS3');
      expect(formatQS(0)).toBe('QS0');
    });
  });
});

