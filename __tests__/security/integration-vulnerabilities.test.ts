/**
 * Integration Vulnerability Tests
 * 
 * Real-world attack scenarios and edge cases
 */

import { parseCSV, parseJSON, parseQuakeML } from '@/lib/parsers';
import { validateEarthquakeEvent } from '@/lib/validation';
import { eventsMatch } from '@/lib/earthquake-utils';

describe('Integration Vulnerability Tests', () => {
  describe('Parser Edge Cases', () => {
    it('should handle CSV with extremely long field values', () => {
      const longValue = 'a'.repeat(1000000);
      const csv = `time,latitude,longitude,depth,magnitude,region
2024-01-01T00:00:00Z,0,0,10,5.0,${longValue}`;

      const result = parseCSV(csv);
      expect(result).toBeDefined();
      // Should either truncate or reject
    });

    it('should handle CSV with thousands of columns', () => {
      const headers = Array.from({ length: 10000 }, (_, i) => `col${i}`).join(',');
      const values = Array.from({ length: 10000 }, () => '0').join(',');
      const csv = `${headers}\n${values}`;

      const result = parseCSV(csv);
      expect(result).toBeDefined();
    });

    it('should handle JSON with deeply nested objects', () => {
      let deepJson = '{"events":[';
      for (let i = 0; i < 1000; i++) {
        deepJson += '{"nested":';
      }
      deepJson += '{}';
      for (let i = 0; i < 1000; i++) {
        deepJson += '}';
      }
      deepJson += ']}';

      const result = parseJSON(deepJson);
      expect(result).toBeDefined();
    });

    it('should handle malformed UTF-8 sequences', () => {
      const malformed = `time,latitude,longitude,depth,magnitude
2024-01-01T00:00:00Z,0,0,10,5.0
\xC0\xC1,0,0,10,5.0`;

      const result = parseCSV(malformed);
      expect(result).toBeDefined();
    });
  });

  describe('Validation Bypass Attempts', () => {
    it('should reject events with NaN coordinates', () => {
      const event = {
        time: '2024-01-01T00:00:00Z',
        latitude: NaN,
        longitude: 0,
        depth: 10,
        magnitude: 5.0,
      };

      const result = validateEarthquakeEvent(event);
      expect(result.success).toBe(false);
    });

    it('should reject events with Infinity coordinates', () => {
      const event = {
        time: '2024-01-01T00:00:00Z',
        latitude: Infinity,
        longitude: -Infinity,
        depth: 10,
        magnitude: 5.0,
      };

      const result = validateEarthquakeEvent(event);
      expect(result.success).toBe(false);
    });

    it('should reject events with coordinates as strings', () => {
      const event = {
        time: '2024-01-01T00:00:00Z',
        latitude: '0' as any,
        longitude: '0' as any,
        depth: 10,
        magnitude: 5.0,
      };

      const result = validateEarthquakeEvent(event);
      expect(result.success).toBe(false);
    });

    it('should handle events with missing required fields', () => {
      const events = [
        { latitude: 0, longitude: 0, depth: 10, magnitude: 5.0 }, // Missing time
        { time: '2024-01-01T00:00:00Z', longitude: 0, depth: 10, magnitude: 5.0 }, // Missing latitude
        { time: '2024-01-01T00:00:00Z', latitude: 0, depth: 10, magnitude: 5.0 }, // Missing longitude
        { time: '2024-01-01T00:00:00Z', latitude: 0, longitude: 0, depth: 10 }, // Missing magnitude
      ];

      for (const event of events) {
        const result = validateEarthquakeEvent(event);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Event Matching Edge Cases', () => {
    it('should handle events at exactly the same location and time', () => {
      const event1 = {
        time: '2024-01-01T00:00:00Z',
        latitude: 0,
        longitude: 0,
        depth: 10,
        magnitude: 5.0,
      };

      const event2 = { ...event1 };

      const match = eventsMatch(event1, event2, 10, 10);
      expect(match).toBe(true);
    });

    it('should handle events at poles', () => {
      const event1 = {
        time: '2024-01-01T00:00:00Z',
        latitude: 90,
        longitude: 0,
        depth: 10,
        magnitude: 5.0,
      };

      const event2 = {
        time: '2024-01-01T00:00:00Z',
        latitude: 90,
        longitude: 180,
        depth: 10,
        magnitude: 5.0,
      };

      const match = eventsMatch(event1, event2, 10, 10);
      expect(match).toBe(true); // At pole, longitude doesn't matter
    });

    it('should handle events crossing date line', () => {
      const event1 = {
        time: '2024-01-01T00:00:00Z',
        latitude: 0,
        longitude: 179.9,
        depth: 10,
        magnitude: 5.0,
      };

      const event2 = {
        time: '2024-01-01T00:00:00Z',
        latitude: 0,
        longitude: -179.9,
        depth: 10,
        magnitude: 5.0,
      };

      const match = eventsMatch(event1, event2, 10, 50);
      expect(match).toBe(true);
    });
  });

  describe('Memory and Performance', () => {
    it('should handle parsing large number of events', () => {
      const header = 'time,latitude,longitude,depth,magnitude\n';
      const rows = Array.from({ length: 10000 }, (_, i) => 
        `2024-01-01T00:00:00Z,${i % 90},${i % 180},10,5.0`
      ).join('\n');
      
      const csv = header + rows;
      const result = parseCSV(csv);
      
      expect(result.events.length).toBeLessThanOrEqual(10000);
    });
  });
});

