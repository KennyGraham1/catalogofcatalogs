import { detectDateFormat, parseDateWithFormat, type DateFormat } from '@/lib/date-format-detector';

describe('date-format-detector', () => {
  describe('detectDateFormat', () => {
    it('should detect US format when dates have day > 12', () => {
      const dates = [
        '01/15/2024 10:30:00',
        '02/20/2024 11:45:00',
        '03/25/2024 12:00:00',
        '12/31/2024 23:59:59'
      ];
      
      const result = detectDateFormat(dates);
      
      expect(result.format).toBe('US');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.totalDatesAnalyzed).toBe(4);
    });

    it('should detect International format when dates have day > 12', () => {
      const dates = [
        '15/01/2024 10:30:00',
        '20/02/2024 11:45:00',
        '25/03/2024 12:00:00',
        '31/12/2024 23:59:59'
      ];
      
      const result = detectDateFormat(dates);
      
      expect(result.format).toBe('International');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.totalDatesAnalyzed).toBe(4);
    });

    it('should detect ISO format', () => {
      const dates = [
        '2024-01-15T10:30:00Z',
        '2024-02-20T11:45:00Z',
        '2024-03-25T12:00:00Z',
        '2024-12-31T23:59:59Z'
      ];
      
      const result = detectDateFormat(dates);
      
      expect(result.format).toBe('ISO');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('should handle ambiguous dates with low confidence', () => {
      const dates = [
        '01/02/2024 10:30:00',
        '03/04/2024 11:45:00',
        '05/06/2024 12:00:00',
        '07/08/2024 13:15:00'
      ];
      
      const result = detectDateFormat(dates);
      
      expect(result.format).toBe('International'); // Default to International
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.ambiguousCount).toBe(4);
    });

    it('should handle mixed formats with majority US', () => {
      const dates = [
        '01/15/2024 10:30:00', // US (day > 12)
        '02/20/2024 11:45:00', // US (day > 12)
        '03/25/2024 12:00:00', // US (day > 12)
        '01/02/2024 13:00:00', // Ambiguous
        '03/04/2024 14:00:00'  // Ambiguous
      ];
      
      const result = detectDateFormat(dates);
      
      expect(result.format).toBe('US');
      expect(result.ambiguousCount).toBe(2);
    });

    it('should handle empty array', () => {
      const result = detectDateFormat([]);
      
      expect(result.format).toBe('Unknown');
      expect(result.confidence).toBe(0);
      expect(result.totalDatesAnalyzed).toBe(0);
    });

    it('should limit samples to maxSamples parameter', () => {
      const dates = Array(100).fill('01/15/2024 10:30:00');
      
      const result = detectDateFormat(dates, 10);
      
      expect(result.totalDatesAnalyzed).toBe(10);
    });
  });

  describe('parseDateWithFormat', () => {
    it('should parse US format correctly', () => {
      const date = parseDateWithFormat('12/11/2024 10:30:00', 'US');
      
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(11); // December (0-indexed)
      expect(date?.getDate()).toBe(11);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should parse International format correctly', () => {
      const date = parseDateWithFormat('12/11/2024 10:30:00', 'International');
      
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(10); // November (0-indexed)
      expect(date?.getDate()).toBe(12);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should parse ISO format regardless of specified format', () => {
      const date = parseDateWithFormat('2024-12-11T10:30:00Z', 'US');
      
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(11); // December (0-indexed)
      expect(date?.getDate()).toBe(11);
      expect(date?.getFullYear()).toBe(2024);
    });

    it('should handle dash-separated dates with US format', () => {
      const date = parseDateWithFormat('12-11-2024 10:30:00', 'US');
      
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(11); // December (0-indexed)
      expect(date?.getDate()).toBe(11);
    });

    it('should handle dash-separated dates with International format', () => {
      const date = parseDateWithFormat('12-11-2024 10:30:00', 'International');
      
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(10); // November (0-indexed)
      expect(date?.getDate()).toBe(12);
    });

    it('should handle date-only strings (no time)', () => {
      const date = parseDateWithFormat('12/11/2024', 'US');
      
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(11); // December
      expect(date?.getDate()).toBe(11);
    });

    it('should return null for invalid dates', () => {
      const date = parseDateWithFormat('invalid date', 'US');
      
      expect(date).toBeNull();
    });
  });
});

