/**
 * Tests for delimiter detection and parsing
 */

import { detectDelimiter, parseLine, parseWithDelimiter, getDelimiterName } from '@/lib/delimiter-detector';

describe('Delimiter Detection', () => {
  describe('detectDelimiter', () => {
    it('should detect comma delimiter', () => {
      const content = `time,latitude,longitude,magnitude,depth
2024-01-01T00:00:00Z,-41.5,174.5,5.0,10.0
2024-01-02T00:00:00Z,-42.0,175.0,4.5,15.0`;
      
      const result = detectDelimiter(content);
      expect(result.delimiter).toBe(',');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.columnCount).toBe(5);
    });

    it('should detect tab delimiter', () => {
      const content = `time\tlatitude\tlongitude\tmagnitude\tdepth
2024-01-01T00:00:00Z\t-41.5\t174.5\t5.0\t10.0
2024-01-02T00:00:00Z\t-42.0\t175.0\t4.5\t15.0`;
      
      const result = detectDelimiter(content);
      expect(result.delimiter).toBe('\t');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect semicolon delimiter', () => {
      const content = `time;latitude;longitude;magnitude;depth
2024-01-01T00:00:00Z;-41.5;174.5;5.0;10.0
2024-01-02T00:00:00Z;-42.0;175.0;4.5;15.0`;
      
      const result = detectDelimiter(content);
      expect(result.delimiter).toBe(';');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect pipe delimiter', () => {
      const content = `time|latitude|longitude|magnitude|depth
2024-01-01T00:00:00Z|-41.5|174.5|5.0|10.0
2024-01-02T00:00:00Z|-42.0|175.0|4.5|15.0`;
      
      const result = detectDelimiter(content);
      expect(result.delimiter).toBe('|');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect space delimiter', () => {
      const content = `time latitude longitude magnitude depth
2024-01-01T00:00:00Z -41.5 174.5 5.0 10.0
2024-01-02T00:00:00Z -42.0 175.0 4.5 15.0`;
      
      const result = detectDelimiter(content);
      expect(result.delimiter).toBe(' ');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle empty content', () => {
      const result = detectDelimiter('');
      expect(result.confidence).toBe(0);
      expect(result.columnCount).toBe(0);
    });
  });

  describe('parseLine', () => {
    it('should parse comma-delimited line', () => {
      const line = 'value1,value2,value3';
      const result = parseLine(line, ',');
      expect(result).toEqual(['value1', 'value2', 'value3']);
    });

    it('should handle quoted values with commas', () => {
      const line = '"value1,with,commas",value2,"value3"';
      const result = parseLine(line, ',');
      expect(result).toEqual(['value1,with,commas', 'value2', 'value3']);
    });

    it('should parse tab-delimited line', () => {
      const line = 'value1\tvalue2\tvalue3';
      const result = parseLine(line, '\t');
      expect(result).toEqual(['value1', 'value2', 'value3']);
    });

    it('should filter empty values for space delimiter', () => {
      const line = 'value1  value2   value3';
      const result = parseLine(line, ' ');
      expect(result).toEqual(['value1', 'value2', 'value3']);
    });
  });

  describe('parseWithDelimiter', () => {
    it('should parse entire content with specified delimiter', () => {
      const content = `header1,header2,header3
value1,value2,value3
value4,value5,value6`;
      
      const result = parseWithDelimiter(content, ',');
      expect(result.headers).toEqual(['header1', 'header2', 'header3']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['value1', 'value2', 'value3']);
      expect(result.rows[1]).toEqual(['value4', 'value5', 'value6']);
    });

    it('should handle empty content', () => {
      const result = parseWithDelimiter('', ',');
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });
  });

  describe('getDelimiterName', () => {
    it('should return correct names for delimiters', () => {
      expect(getDelimiterName(',')).toBe('Comma');
      expect(getDelimiterName('\t')).toBe('Tab');
      expect(getDelimiterName(';')).toBe('Semicolon');
      expect(getDelimiterName('|')).toBe('Pipe');
      expect(getDelimiterName(' ')).toBe('Space');
    });
  });
});

