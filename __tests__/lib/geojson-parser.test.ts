/**
 * Tests for GeoJSON parser
 */

import { parseGeoJSON } from '@/lib/geojson-parser';

describe('GeoJSON Parser', () => {
  describe('FeatureCollection', () => {
    it('should parse valid GeoJSON FeatureCollection', () => {
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [174.5, -41.5, 10.0]
            },
            properties: {
              time: '2024-01-01T00:00:00Z',
              magnitude: 5.0,
              magnitudeType: 'ML',
              region: 'Wellington'
            }
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [175.0, -42.0, 15.0]
            },
            properties: {
              time: '2024-01-02T00:00:00Z',
              magnitude: 4.5
            }
          }
        ]
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.events[0].latitude).toBe(-41.5);
      expect(result.events[0].longitude).toBe(174.5);
      expect(result.events[0].depth).toBe(10.0);
      expect(result.events[0].magnitude).toBe(5.0);
      expect(result.events[0].magnitudeType).toBe('ML');
      expect(result.events[0].region).toBe('Wellington');
    });

    it('should parse single Feature', () => {
      const geojson = JSON.stringify({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [174.5, -41.5, 10.0]
        },
        properties: {
          time: '2024-01-01T00:00:00Z',
          magnitude: 5.0
        }
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].latitude).toBe(-41.5);
      expect(result.events[0].longitude).toBe(174.5);
    });

    it('should handle depth in properties if not in coordinates', () => {
      const geojson = JSON.stringify({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [174.5, -41.5]
        },
        properties: {
          time: '2024-01-01T00:00:00Z',
          magnitude: 5.0,
          depth: 20.0
        }
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(true);
      expect(result.events[0].depth).toBe(20.0);
    });

    it('should reject invalid GeoJSON type', () => {
      const geojson = JSON.stringify({
        type: 'InvalidType',
        features: []
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Unsupported GeoJSON type');
    });

    it('should reject missing type field', () => {
      const geojson = JSON.stringify({
        features: []
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('missing "type" field');
    });

    it('should reject non-Point geometry', () => {
      const geojson = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [[174.5, -41.5], [175.0, -42.0]]
            },
            properties: {
              time: '2024-01-01T00:00:00Z',
              magnitude: 5.0
            }
          }
        ]
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Point geometry');
    });

    it('should reject invalid JSON', () => {
      const result = parseGeoJSON('invalid json');
      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('Invalid JSON');
    });

    it('should extract eventId from feature id', () => {
      const geojson = JSON.stringify({
        type: 'Feature',
        id: 'event123',
        geometry: {
          type: 'Point',
          coordinates: [174.5, -41.5, 10.0]
        },
        properties: {
          time: '2024-01-01T00:00:00Z',
          magnitude: 5.0
        }
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(true);
      expect(result.events[0].eventId).toBe('event123');
    });

    it('should include all detected fields', () => {
      const geojson = JSON.stringify({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [174.5, -41.5, 10.0]
        },
        properties: {
          time: '2024-01-01T00:00:00Z',
          magnitude: 5.0,
          magnitudeType: 'ML',
          region: 'Wellington',
          source: 'GeoNet'
        }
      });

      const result = parseGeoJSON(geojson);
      expect(result.success).toBe(true);
      expect(result.detectedFields).toContain('time');
      expect(result.detectedFields).toContain('latitude');
      expect(result.detectedFields).toContain('longitude');
      expect(result.detectedFields).toContain('depth');
      expect(result.detectedFields).toContain('magnitude');
      expect(result.detectedFields).toContain('magnitudeType');
      expect(result.detectedFields).toContain('region');
      expect(result.detectedFields).toContain('source');
    });
  });
});

