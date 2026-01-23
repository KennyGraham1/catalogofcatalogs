import {
  getMagnitudeColor,
  getMagnitudeRadius,
  getMagnitudeLabel,
  calculateDistance,
  calculateTimeDifference,
  eventsMatch,
  validateCoordinates,
  validateMagnitude,
  validateDepth,
  validateTimestamp,
  validateEvent
} from '@/lib/earthquake-utils';

describe('earthquake-utils', () => {
  describe('getMagnitudeColor', () => {
    it('should return single blue color for all magnitudes', () => {
      // User preference: single color (blue) for all events, size represents magnitude
      expect(getMagnitudeColor(1)).toBe('#3b82f6'); // blue-500
      expect(getMagnitudeColor(4)).toBe('#3b82f6'); // blue-500
      expect(getMagnitudeColor(5)).toBe('#3b82f6'); // blue-500
      expect(getMagnitudeColor(6)).toBe('#3b82f6'); // blue-500
      expect(getMagnitudeColor(7)).toBe('#3b82f6'); // blue-500
    });
  });

  describe('getMagnitudeRadius', () => {
    it('should return correct radius for different magnitudes', () => {
      // Fixed lookup table: radii are 3km for M0-1, 6km for M2, 9km for M3, etc.
      // Each magnitude increment adds 3km, capped at 21km for M7+
      expect(getMagnitudeRadius(1)).toBe(3000);  // M1: 3km (base for small events)
      expect(getMagnitudeRadius(3)).toBe(9000);  // M3: 9km
      expect(getMagnitudeRadius(5)).toBe(15000); // M5: 15km
      expect(getMagnitudeRadius(7)).toBe(21000); // M7+: 21km (capped)
    });

    it('should handle edge cases', () => {
      expect(getMagnitudeRadius(0)).toBe(3000);  // M0: base radius
      expect(getMagnitudeRadius(10)).toBe(21000); // M10: capped at M7+ radius
      expect(getMagnitudeRadius(-1)).toBe(3000);  // Negative: clamped to 0
      expect(getMagnitudeRadius(NaN)).toBe(3000); // Invalid: default radius
    });
  });

  describe('getMagnitudeLabel', () => {
    it('should return correct labels for different magnitudes', () => {
      expect(getMagnitudeLabel(1)).toBe('Minor');
      expect(getMagnitudeLabel(4)).toBe('Light');
      expect(getMagnitudeLabel(5)).toBe('Moderate');
      expect(getMagnitudeLabel(6.5)).toBe('Strong');
      expect(getMagnitudeLabel(8)).toBe('Major');
    });
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two points correctly', () => {
      // Wellington to Auckland (approx 500km)
      const distance = calculateDistance(-41.2865, 174.7762, -36.8485, 174.7633);
      expect(distance).toBeGreaterThan(490);
      expect(distance).toBeLessThan(510);
    });

    it('should return 0 for same coordinates', () => {
      const distance = calculateDistance(0, 0, 0, 0);
      expect(distance).toBe(0);
    });
  });

  describe('calculateTimeDifference', () => {
    it('should calculate time difference in seconds', () => {
      const time1 = '2024-01-01T00:00:00Z';
      const time2 = '2024-01-01T00:01:00Z';
      expect(calculateTimeDifference(time1, time2)).toBe(60);
    });

    it('should return absolute difference', () => {
      const time1 = '2024-01-01T00:01:00Z';
      const time2 = '2024-01-01T00:00:00Z';
      expect(calculateTimeDifference(time1, time2)).toBe(60);
    });
  });

  describe('eventsMatch', () => {
    const event1 = {
      time: '2024-01-01T00:00:00Z',
      latitude: -41.2865,
      longitude: 174.7762,
      magnitude: 5.0,
      depth: 10
    };

    it('should match events within thresholds', () => {
      const event2 = {
        time: '2024-01-01T00:00:30Z', // 30 seconds later
        latitude: -41.2865,
        longitude: 174.7762,
        magnitude: 5.0,
        depth: 10
      };

      expect(eventsMatch(event1, event2, 60, 10)).toBe(true);
    });

    it('should not match events outside time threshold', () => {
      const event2 = {
        time: '2024-01-01T00:02:00Z', // 2 minutes later
        latitude: -41.2865,
        longitude: 174.7762,
        magnitude: 5.0,
        depth: 10
      };

      expect(eventsMatch(event1, event2, 60, 10)).toBe(false);
    });

    it('should not match events outside distance threshold', () => {
      const event2 = {
        time: '2024-01-01T00:00:30Z',
        latitude: -36.8485, // Auckland (far away)
        longitude: 174.7633,
        magnitude: 5.0,
        depth: 10
      };

      expect(eventsMatch(event1, event2, 60, 10)).toBe(false);
    });
  });

  describe('validateCoordinates', () => {
    it('should validate correct coordinates', () => {
      expect(validateCoordinates(-41.2865, 174.7762)).toBe(true);
    });

    it('should reject invalid latitude', () => {
      expect(validateCoordinates(-91, 174.7762)).toBe(false);
      expect(validateCoordinates(91, 174.7762)).toBe(false);
    });

    it('should reject invalid longitude', () => {
      expect(validateCoordinates(-41.2865, -181)).toBe(false);
      expect(validateCoordinates(-41.2865, 181)).toBe(false);
    });
  });

  describe('validateMagnitude', () => {
    it('should validate correct magnitudes', () => {
      expect(validateMagnitude(0)).toBe(true);
      expect(validateMagnitude(5.5)).toBe(true);
      expect(validateMagnitude(10)).toBe(true);
    });

    it('should validate negative magnitudes for microquakes', () => {
      expect(validateMagnitude(-1)).toBe(true);
      expect(validateMagnitude(-2.5)).toBe(true);
      expect(validateMagnitude(-3)).toBe(true);
    });

    it('should reject magnitudes outside valid range (-3 to 10)', () => {
      expect(validateMagnitude(-4)).toBe(false);
      expect(validateMagnitude(-3.1)).toBe(false);
      expect(validateMagnitude(11)).toBe(false);
      expect(validateMagnitude(10.1)).toBe(false);
    });
  });

  describe('validateDepth', () => {
    it('should validate correct depths', () => {
      expect(validateDepth(0)).toBe(true);
      expect(validateDepth(100)).toBe(true);
      expect(validateDepth(null)).toBe(true);
    });

    it('should reject invalid depths', () => {
      expect(validateDepth(-1)).toBe(false);
      expect(validateDepth(1001)).toBe(false);
    });
  });

  describe('validateTimestamp', () => {
    it('should validate correct timestamps', () => {
      expect(validateTimestamp('2024-01-01T00:00:00Z')).toBe(true);
      expect(validateTimestamp('2024-12-31T23:59:59Z')).toBe(true);
    });

    it('should reject invalid timestamps', () => {
      expect(validateTimestamp('invalid')).toBe(false);
      expect(validateTimestamp('')).toBe(false);
    });
  });

  describe('validateEvent', () => {
    it('should validate correct event', () => {
      const event = {
        time: '2024-01-01T00:00:00Z',
        latitude: -41.2865,
        longitude: 174.7762,
        magnitude: 5.0,
        depth: 10
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for invalid event', () => {
      const event = {
        time: 'invalid',
        latitude: 100,
        longitude: 200,
        magnitude: -1,
        depth: 2000
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

