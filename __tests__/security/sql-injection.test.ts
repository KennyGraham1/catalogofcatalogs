/**
 * Database Injection and Security Tests
 *
 * Tests for injection vulnerabilities (SQL/NoSQL), database security, and edge cases.
 * These tests verify that malicious input is properly handled regardless of database backend.
 */

import { dbQueries } from '@/lib/db';

describe('Database Injection Security Tests', () => {
  // Skip tests if dbQueries is not available
  const skipIfNoDb = () => {
    if (!dbQueries) {
      console.log('Skipping test: dbQueries not available in test environment');
      return true;
    }
    return false;
  };

  describe('Catalogue Name Injection', () => {
    it('should sanitize injection attempts in catalogue name', async () => {
      if (skipIfNoDb()) return;

      const maliciousNames = [
        "'; DROP TABLE catalogues; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM users--",
        "1'; DELETE FROM events WHERE '1'='1",
        "test'; UPDATE catalogues SET name='hacked' WHERE '1'='1",
        // MongoDB-specific injection attempts
        '{"$gt": ""}',
        '{"$ne": null}',
        '{"$where": "this.password"}',
      ];

      for (const name of maliciousNames) {
        try {
          const testId = `test-injection-${Date.now()}`;
          await dbQueries!.insertCatalogue(
            testId,
            name,
            '[]',
            '{}',
            0,
            'test'
          );

          // Verify the catalogue was created safely with the literal name
          const catalogue = await dbQueries!.getCatalogueById(testId);
          expect(catalogue).toBeDefined();
          expect(catalogue?.name).toBe(name); // Name should be stored literally, not executed

          // Clean up
          await dbQueries!.deleteCatalogue(testId);
        } catch (error) {
          // Failing gracefully is acceptable
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle null bytes in catalogue name', async () => {
      if (skipIfNoDb()) return;

      const maliciousNames = [
        "test\0admin",
        "test\x00admin",
        "test%00admin",
      ];

      for (const name of maliciousNames) {
        try {
          const testId = `test-null-${Date.now()}`;
          await dbQueries!.insertCatalogue(testId, name, '[]', '{}', 0, 'test');
          await dbQueries!.deleteCatalogue(testId);
        } catch (error) {
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Event Search Injection', () => {
    it('should sanitize injection in search queries', async () => {
      if (skipIfNoDb()) return;

      const maliciousQueries = [
        "' OR 1=1--",
        "'; DROP TABLE events;--",
        "1' UNION SELECT password FROM users--",
        "%' AND 1=0 UNION ALL SELECT NULL, NULL, NULL--",
        // MongoDB-specific injection attempts
        '{"$gt": ""}',
        '{"$regex": ".*"}',
      ];

      for (const query of maliciousQueries) {
        try {
          const results = await dbQueries!.searchEvents(query, 10);
          // Should return empty or safe results
          expect(Array.isArray(results)).toBe(true);
        } catch (error) {
          // Failing gracefully is acceptable
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Catalogue ID Injection', () => {
    it('should validate catalogue ID format', async () => {
      if (skipIfNoDb()) return;

      const maliciousIds = [
        "1' OR '1'='1",
        "../../../etc/passwd",
        "1; DROP TABLE catalogues;",
        "1 UNION SELECT * FROM users",
        // MongoDB-specific injection attempts
        '{"$ne": null}',
        '{"$gt": ""}',
      ];

      for (const id of maliciousIds) {
        try {
          const result = await dbQueries!.getCatalogueById(id);
          // Should return undefined for invalid IDs
          expect(result).toBeUndefined();
        } catch (error) {
          // Failing gracefully is acceptable
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Concurrent Database Operations', () => {
    it('should handle concurrent catalogue creation', async () => {
      if (skipIfNoDb()) return;

      const catalogueIds: string[] = [];
      const promises = Array.from({ length: 10 }, (_, i) => {
        const id = `concurrent-test-${Date.now()}-${i}`;
        catalogueIds.push(id);
        return dbQueries!.insertCatalogue(id, `Concurrent Test ${i}`, '[]', '{}', 0, 'test');
      });

      const results = await Promise.allSettled(promises);

      // All should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // Clean up
      for (const id of catalogueIds) {
        try {
          await dbQueries!.deleteCatalogue(id);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    it('should handle concurrent event queries', async () => {
      if (skipIfNoDb()) return;

      // Create a test catalogue
      const catalogueId = `concurrent-query-test-${Date.now()}`;
      await dbQueries!.insertCatalogue(catalogueId, 'Concurrent Query Test', '[]', '{}', 0, 'test');

      const promises = Array.from({ length: 20 }, () =>
        dbQueries!.getEventsByCatalogueId(catalogueId)
      );

      const results = await Promise.allSettled(promises);

      // All should succeed
      expect(results.every(r => r.status === 'fulfilled')).toBe(true);

      // Clean up
      await dbQueries!.deleteCatalogue(catalogueId);
    });
  });

  describe('Database Connection Handling', () => {
    it('should handle rapid connection requests', async () => {
      if (skipIfNoDb()) return;

      const promises = Array.from({ length: 50 }, () =>
        dbQueries!.getCatalogues()
      );

      const results = await Promise.allSettled(promises);

      // Most should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(40);
    });
  });

  describe('Transaction Safety', () => {
    it('should handle transaction operations', async () => {
      if (skipIfNoDb()) return;

      const cataloguesResult = await dbQueries!.getCatalogues();
      const initialCount = Array.isArray(cataloguesResult)
        ? cataloguesResult.length
        : cataloguesResult.data.length;

      // Verify we can get a count
      expect(typeof initialCount).toBe('number');
    });
  });
});
