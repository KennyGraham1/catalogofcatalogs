import { parseCSV, parseJSON, parseQuakeML, parseFile } from '@/lib/parsers';

describe('parsers', () => {
  describe('parseCSV', () => {
    it('should parse valid CSV data', () => {
      const csv = `time,latitude,longitude,magnitude,depth
2024-01-01T00:00:00Z,-41.2865,174.7762,5.0,10
2024-01-01T01:00:00Z,-36.8485,174.7633,4.5,15`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
      expect(result.events[0].latitude).toBe(-41.2865);
      expect(result.events[0].magnitude).toBe(5.0);
    });

    it('should handle quoted values', () => {
      const csv = `time,latitude,longitude,magnitude,depth,region
2024-01-01T00:00:00Z,-41.2865,174.7762,5.0,10,"Wellington, NZ"`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should return errors for invalid data', () => {
      const csv = `time,latitude,longitude,magnitude,depth
invalid,100,200,-1,2000`;

      const result = parseCSV(csv);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty file', () => {
      const result = parseCSV('');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('parseJSON', () => {
    it('should parse valid JSON array', () => {
      const json = JSON.stringify([
        {
          time: '2024-01-01T00:00:00Z',
          latitude: -41.2865,
          longitude: 174.7762,
          magnitude: 5.0,
          depth: 10
        },
        {
          time: '2024-01-01T01:00:00Z',
          latitude: -36.8485,
          longitude: 174.7633,
          magnitude: 4.5,
          depth: 15
        }
      ]);

      const result = parseJSON(json);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(2);
    });

    it('should parse JSON with events property', () => {
      const json = JSON.stringify({
        events: [
          {
            time: '2024-01-01T00:00:00Z',
            latitude: -41.2865,
            longitude: 174.7762,
            magnitude: 5.0,
            depth: 10
          }
        ]
      });

      const result = parseJSON(json);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should parse GeoJSON format', () => {
      const json = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              time: '2024-01-01T00:00:00Z',
              magnitude: 5.0
            },
            geometry: {
              type: 'Point',
              coordinates: [174.7762, -41.2865, 10]
            }
          }
        ]
      });

      const result = parseJSON(json);
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].latitude).toBe(-41.2865);
      expect(result.events[0].longitude).toBe(174.7762);
    });

    it('should handle invalid JSON', () => {
      const result = parseJSON('invalid json');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('parseQuakeML', () => {
    it('should parse valid QuakeML', () => {
      const xml = `<?xml version="1.0"?>
<quakeml>
  <event publicID="quakeml:test/event/1">
    <origin publicID="quakeml:test/origin/1">
      <time><value>2024-01-01T00:00:00Z</value></time>
      <latitude><value>-41.2865</value></latitude>
      <longitude><value>174.7762</value></longitude>
      <depth><value>10000</value></depth>
    </origin>
    <magnitude publicID="quakeml:test/magnitude/1">
      <mag><value>5.0</value></mag>
    </magnitude>
  </event>
</quakeml>`;

      const result = parseQuakeML(xml);

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].magnitude).toBe(5.0);
      expect(result.events[0].depth).toBe(10); // Converted from meters to km
      expect(result.events[0].quakeml).toBeDefined();
      expect(result.events[0].quakeml?.publicID).toBe('quakeml:test/event/1');
    });

    it('should handle invalid XML', () => {
      const result = parseQuakeML('invalid xml');

      expect(result.success).toBe(false); // No valid events found
      expect(result.events).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('parseFile', () => {
    it('should auto-detect CSV format', () => {
      const csv = `time,latitude,longitude,magnitude,depth
2024-01-01T00:00:00Z,-41.2865,174.7762,5.0,10`;

      const result = parseFile(csv, 'data.csv');
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should auto-detect JSON format', () => {
      const json = JSON.stringify([
        {
          time: '2024-01-01T00:00:00Z',
          latitude: -41.2865,
          longitude: 174.7762,
          magnitude: 5.0,
          depth: 10
        }
      ]);

      const result = parseFile(json, 'data.json');
      
      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });

    it('should auto-detect XML format', () => {
      const xml = `<?xml version="1.0"?>
<quakeml>
  <event publicID="quakeml:test/event/1">
    <origin publicID="quakeml:test/origin/1">
      <time><value>2024-01-01T00:00:00Z</value></time>
      <latitude><value>-41.2865</value></latitude>
      <longitude><value>174.7762</value></longitude>
      <depth><value>10000</value></depth>
    </origin>
    <magnitude publicID="quakeml:test/magnitude/1">
      <mag><value>5.0</value></mag>
    </magnitude>
  </event>
</quakeml>`;

      const result = parseFile(xml, 'data.xml');

      expect(result.success).toBe(true);
      expect(result.events).toHaveLength(1);
    });
  });
});

