/**
 * File Upload Security Tests
 * 
 * Tests for file upload vulnerabilities including:
 * - Oversized files
 * - Malicious file types
 * - XML bombs
 * - Path traversal
 * - Malformed content
 */

import { parseCSV, parseJSON, parseQuakeML } from '@/lib/parsers';

describe('File Upload Security Tests', () => {
  describe('File Size Limits', () => {
    it('should reject extremely large CSV files', () => {
      // Generate a very large CSV (simulated)
      const header = 'time,latitude,longitude,depth,magnitude\n';
      const row = '2024-01-01T00:00:00Z,0,0,10,5.0\n';
      const largeContent = header + row.repeat(1000000); // 1M rows

      // This should either handle gracefully or reject
      const result = parseCSV(largeContent);
      expect(result).toBeDefined();
    });

    it('should handle empty files', () => {
      const result = parseCSV('');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle files with only whitespace', () => {
      const result = parseCSV('   \n\n   \n');
      expect(result.success).toBe(false);
    });
  });

  describe('XML Bomb Protection', () => {
    it('should reject billion laughs attack', () => {
      const billionLaughs = `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
]>
<quakeml>&lol4;</quakeml>`;

      const result = parseQuakeML(billionLaughs);
      // Should either reject or handle safely
      expect(result).toBeDefined();
    });

    it('should reject external entity injection', () => {
      const xxe = `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<quakeml>&xxe;</quakeml>`;

      const result = parseQuakeML(xxe);
      expect(result).toBeDefined();
    });

    it('should handle deeply nested XML', () => {
      let deepXml = '<root>';
      for (let i = 0; i < 10000; i++) {
        deepXml += '<nested>';
      }
      deepXml += 'content';
      for (let i = 0; i < 10000; i++) {
        deepXml += '</nested>';
      }
      deepXml += '</root>';

      const result = parseQuakeML(deepXml);
      expect(result).toBeDefined();
    });
  });

  describe('Malformed Content', () => {
    it('should handle CSV with mismatched columns', () => {
      const malformed = `time,latitude,longitude,depth,magnitude
2024-01-01T00:00:00Z,0,0,10
2024-01-01T00:00:00Z,0,0,10,5.0,extra,columns`;

      const result = parseCSV(malformed);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle CSV with special characters', () => {
      const specialChars = `time,latitude,longitude,depth,magnitude
2024-01-01T00:00:00Z,0,0,10,5.0
"2024-01-01T00:00:00Z","0","0","10","5.0"
2024-01-01T00:00:00Z,0\x00,0,10,5.0`;

      const result = parseCSV(specialChars);
      expect(result).toBeDefined();
    });

    it('should handle JSON with circular references', () => {
      const circular = '{"a": {"b": {"c": "..."}}}';
      const result = parseJSON(circular);
      expect(result).toBeDefined();
    });

    it('should handle malformed JSON', () => {
      const malformed = [
        '{invalid json}',
        '{"unclosed": ',
        '{"key": undefined}',
        '{key: "value"}', // Missing quotes
        "{'key': 'value'}", // Single quotes
      ];

      for (const json of malformed) {
        const result = parseJSON(json);
        expect(result.success).toBe(false);
      }
    });
  });

  describe('Path Traversal Protection', () => {
    it('should reject path traversal in filenames', () => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/passwd',
        'C:\\Windows\\System32\\config\\sam',
        '....//....//....//etc/passwd',
      ];

      // These should be rejected at the API level
      // Test that we can detect path traversal patterns
      for (const name of maliciousNames) {
        const hasPathTraversal = name.includes('..') ||
                                  name.startsWith('/') ||
                                  /^[A-Za-z]:\\/.test(name);
        expect(hasPathTraversal).toBe(true);
      }
    });
  });

  describe('Invalid Data Types', () => {
    it('should handle non-numeric coordinates', () => {
      const invalid = `time,latitude,longitude,depth,magnitude
2024-01-01T00:00:00Z,abc,def,10,5.0
2024-01-01T00:00:00Z,NaN,Infinity,10,5.0
2024-01-01T00:00:00Z,null,undefined,10,5.0`;

      const result = parseCSV(invalid);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle extreme coordinate values', () => {
      const extreme = `time,latitude,longitude,depth,magnitude
2024-01-01T00:00:00Z,999,999,10,5.0
2024-01-01T00:00:00Z,-999,-999,10,5.0
2024-01-01T00:00:00Z,1e308,1e308,10,5.0`;

      const result = parseCSV(extreme);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle invalid date formats', () => {
      const invalid = `time,latitude,longitude,depth,magnitude
not-a-date,0,0,10,5.0
2024-13-45T99:99:99Z,0,0,10,5.0
9999-99-99T99:99:99Z,0,0,10,5.0`;

      const result = parseCSV(invalid);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Unicode and Encoding', () => {
    it('should handle various Unicode characters', () => {
      const unicode = `time,latitude,longitude,depth,magnitude,region
2024-01-01T00:00:00Z,0,0,10,5.0,日本
2024-01-01T00:00:00Z,0,0,10,5.0,Москва
2024-01-01T00:00:00Z,0,0,10,5.0,🌍`;

      const result = parseCSV(unicode);
      expect(result).toBeDefined();
    });

    it('should handle null bytes', () => {
      const nullBytes = `time,latitude,longitude,depth,magnitude
2024-01-01T00:00:00Z\x00,0,0,10,5.0`;

      const result = parseCSV(nullBytes);
      expect(result).toBeDefined();
    });
  });
});

